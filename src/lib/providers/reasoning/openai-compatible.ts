import { z } from "zod";
import type { ChatMessage, ReasoningProvider } from "../types";
import { AppError } from "@/lib/server/errors";
import { fetchWithRetry } from "@/lib/server/http";
import { parseModelJSON } from "./json";

/**
 * Any server exposing the OpenAI-style /chat/completions API, e.g. Gnani Evon
 * v3.3 open weights served with vLLM or SGLang. The UI label comes from
 * OPENAI_COMPAT_LABEL and is never assumed to be Evon.
 */
export interface OpenAICompatibleOptions {
  baseUrl: string;
  apiKey?: string;
  /** Model for client turns. */
  model: string;
  /** Model for the coaching report (defaults to `model`). */
  coachModel?: string;
  label: string;
  /** Wait before the single retry on 429/5xx (a busy or queued model). */
  retryDelayMs?: number;
  /** Per-request timeouts. Defaults: 45 s per client turn, 120 s per report. */
  timeoutMs?: Partial<Record<"client-turn" | "coach-report", number>>;
  /** Total attempts including the first (max 3), per purpose. Default 2. */
  attempts?: Partial<Record<"client-turn" | "coach-report", number>>;
  /** reasoning_effort per purpose, for reasoning models. Omitted when unset. */
  reasoningEffort?: Partial<Record<"client-turn" | "coach-report", string>>;
  /** Extra output tokens for servers whose max_tokens includes reasoning. Capped at 32,000 total. */
  reasoningHeadroomTokens?: number;
  fetchImpl?: typeof fetch;
}

export class OpenAICompatibleReasoning implements ReasoningProvider {
  readonly id: string = "openai-compatible";
  readonly isDemo = false;

  constructor(private opts: OpenAICompatibleOptions) {}

  get label() {
    return this.opts.label;
  }

  async generateJSON<T>({
    purpose,
    system,
    messages,
    schema,
    maxTokens,
  }: {
    purpose: "client-turn" | "coach-report";
    system: string;
    messages: ChatMessage[];
    schema: z.ZodType<T>;
    schemaName: string;
    maxTokens: number;
  }): Promise<T> {
    const jsonSchema = z.toJSONSchema(schema);
    const sys = `${system}\n\nRespond with a single JSON object that matches this JSON Schema exactly. No prose, no code fences.\n${JSON.stringify(jsonSchema)}`;
    const effort = this.opts.reasoningEffort?.[purpose];
    const model = purpose === "coach-report" ? (this.opts.coachModel ?? this.opts.model) : this.opts.model;
    const send = (jsonMode: boolean) =>
      fetchWithRetry(
        `${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            max_tokens: Math.min(maxTokens + (this.opts.reasoningHeadroomTokens ?? 0), 32_000),
            temperature: purpose === "client-turn" ? 0.7 : 0.3,
            ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
            ...(effort ? { reasoning_effort: effort } : {}),
            messages: [{ role: "system", content: sys }, ...messages],
          }),
        },
        {
          timeoutMs: this.opts.timeoutMs?.[purpose] ?? (purpose === "client-turn" ? 45_000 : 120_000),
          attempts: this.opts.attempts?.[purpose] ?? 2,
          baseDelayMs: this.opts.retryDelayMs,
          fetchImpl: this.opts.fetchImpl,
        },
      );
    let res = await send(true);
    // Some servers don't accept JSON mode; the prompt already asks for JSON, so retry once without it.
    if (res.status === 400 && /response_format|json/i.test(await res.clone().text().catch(() => ""))) res = await send(false);
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new AppError("auth_failed", "The reasoning server rejected the API key.", 502);
      if (res.status === 402) throw new AppError("credits_exhausted", "The reasoning service's quota or plan doesn't cover this request.", 402);
      if (res.status === 503) throw new AppError("upstream_error", "The reasoning model is busy. Please retry in a few seconds.", 503, true);
      if (res.status === 429) throw new AppError("rate_limited", "The reasoning server is rate-limited.", 429, true);
      throw new AppError("upstream_error", `Reasoning server error (HTTP ${res.status}).`, 502, res.status >= 500);
    }
    const body = (await res.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    } | null;
    const choice = body?.choices?.[0];
    const content = choice?.message?.content;
    if (!content) {
      if (choice?.finish_reason === "length") {
        throw new AppError("model_output_invalid", "The reasoning model ran out of output budget before answering. Please retry.", 502, true);
      }
      throw new AppError("model_output_invalid", "The reasoning server returned no content.", 502, true);
    }
    return parseModelJSON(content, schema);
  }
}
