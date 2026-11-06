import { ApiError, GoogleGenAI, type Content } from "@google/genai";
import { z } from "zod";
import type { ChatMessage, ReasoningProvider } from "../types";
import { AppError } from "@/lib/server/errors";
import { parseModelJSON } from "./json";

/**
 * Google Gemini via the official @google/genai SDK, using structured output
 * (responseMimeType: application/json + responseJsonSchema). The response is
 * still validated with Zod because Gemini does not enforce every keyword.
 */

/** Minimal surface of the SDK we use; lets tests inject a fake client. */
export interface GeminiClientLike {
  models: {
    generateContent(params: {
      model: string;
      contents: Content[];
      config: Record<string, unknown>;
    }): Promise<{ text?: string; candidates?: Array<{ finishReason?: string }> }>;
  };
}

type JsonNode = Record<string, unknown>;

/**
 * Gemini documents nullability as a type array (["string", "null"]) rather
 * than anyOf, so rewrite Zod's `anyOf: [X, {type: "null"}]` into that form.
 */
function normalizeNullable(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalizeNullable);
  if (!node || typeof node !== "object") return node;
  const obj = node as JsonNode;
  const anyOf = obj.anyOf as JsonNode[] | undefined;
  if (Array.isArray(anyOf) && anyOf.length === 2 && anyOf.some((x) => x.type === "null")) {
    const inner = anyOf.find((x) => x.type !== "null")!;
    const rest = { ...obj };
    delete rest.anyOf;
    const merged: JsonNode = { ...rest, ...(normalizeNullable(inner) as JsonNode) };
    merged.type = [inner.type, "null"];
    if (Array.isArray(merged.enum)) merged.enum = [...merged.enum, null];
    return merged;
  }
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, normalizeNullable(v)]));
}

/** JSON Schema for Gemini's responseJsonSchema. */
export function toGeminiSchema(schema: z.ZodType): JsonNode {
  const json = { ...(z.toJSONSchema(schema) as JsonNode) };
  delete json.$schema;
  return normalizeNullable(json) as JsonNode;
}

export function toGeminiContents(messages: ChatMessage[]): Content[] {
  return messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GeminiReasoning implements ReasoningProvider {
  readonly id = "gemini";
  readonly isDemo = false;
  readonly label: string;
  private client: GeminiClientLike;

  constructor(
    private opts: {
      apiKey: string;
      clientModel: string;
      coachModel: string;
      /**
       * Thinking levels per purpose (e.g. "LOW"). Measured on gemini-3.8-flash:
       * LOW cut client-turn latency from ~12 s to ~3.6 s with no visible quality loss.
       * Models that reject a level are retried once without it.
       */
      clientThinkingLevel?: string;
      coachThinkingLevel?: string;
      client?: GeminiClientLike;
    },
  ) {
    this.client = opts.client ?? (new GoogleGenAI({ apiKey: opts.apiKey }) as unknown as GeminiClientLike);
    this.label = `Google Gemini (${opts.clientModel})`;
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
    const model = purpose === "client-turn" ? this.opts.clientModel : this.opts.coachModel;
    // Gemini occasionally stalls on a request that normally takes ~3 s, so client
    // turns get a short per-attempt timeout and one retry; reports get one long attempt.
    const timeoutMs = purpose === "client-turn" ? 20_000 : 110_000;
    const retryOnTimeout = purpose === "client-turn";
    const config: Record<string, unknown> = {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseJsonSchema: toGeminiSchema(schema),
      // Coaching reports are long; leave room for the model's own reasoning tokens.
      maxOutputTokens: purpose === "client-turn" ? Math.max(maxTokens, 4096) : Math.max(maxTokens, 16_000),
      temperature: purpose === "client-turn" ? 0.8 : 0.3,
    };
    const thinkingLevel = purpose === "client-turn" ? this.opts.clientThinkingLevel : this.opts.coachThinkingLevel;
    if (thinkingLevel) config.thinkingConfig = { thinkingLevel };

    // Two attempts at most, and only for transient 5xx errors or an unsupported
    // thinking level: these calls cost money.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.client.models.generateContent({
          model,
          contents: toGeminiContents(messages),
          config: { ...config, abortSignal: AbortSignal.timeout(timeoutMs) },
        });
        const finish = res.candidates?.[0]?.finishReason;
        if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST") {
          throw new AppError("model_output_invalid", "Gemini declined this request. Try rephrasing your last turn.", 502);
        }
        const text = res.text;
        if (!text) {
          throw new AppError(
            "model_output_invalid",
            finish === "MAX_TOKENS" ? "Gemini ran out of output space. Please retry." : "Gemini returned an empty response. Please retry.",
            502,
            true,
          );
        }
        return parseModelJSON(text, schema);
      } catch (err) {
        if (err instanceof AppError) throw err;
        if (attempt === 0 && config.thinkingConfig && isThinkingUnsupported(err)) {
          delete config.thinkingConfig;
          continue;
        }
        const mapped = mapGeminiError(err, model);
        const transient = (mapped.code === "upstream_error" && mapped.retryable) || (mapped.code === "timeout" && retryOnTimeout);
        if (transient && attempt === 0) {
          await sleep(500);
          continue;
        }
        throw mapped;
      }
    }
    throw new AppError("upstream_error", "Gemini is temporarily unavailable. Please retry.", 503, true);
  }
}

function isThinkingUnsupported(err: unknown): boolean {
  const status = err instanceof ApiError ? err.status : (err as { status?: number })?.status;
  return status === 400 && /thinking/i.test(err instanceof Error ? err.message : "");
}

export function mapGeminiError(err: unknown, model: string): AppError {
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return new AppError("timeout", "Gemini took too long to respond. Please retry.", 504, true);
  }
  const status = err instanceof ApiError ? err.status : (err as { status?: number })?.status;
  const message = err instanceof Error ? err.message : "";
  if (status === 400 && /api key/i.test(message)) {
    return new AppError("auth_failed", "Gemini rejected the API key. Check GEMINI_API_KEY.", 502);
  }
  switch (status) {
    case 400:
      return new AppError("upstream_error", `Gemini rejected the request: ${message.slice(0, 200)}`, 502);
    case 401:
    case 403:
      return new AppError("auth_failed", "Gemini rejected the API key or the key lacks access. Check GEMINI_API_KEY.", 502);
    case 402:
      return new AppError("credits_exhausted", "Gemini's prepaid credits are used up. Top them up in Google AI Studio, or switch the reasoning provider.", 402);
    case 404:
      return new AppError("not_configured", `Gemini model "${model}" was not found. Set GEMINI_CLIENT_MODEL / GEMINI_COACH_MODEL to a model your key can use.`, 503);
    case 429:
      return new AppError("rate_limited", "Gemini quota or rate limit reached. Wait a moment, or check your quota in Google AI Studio.", 429, true);
    case 500:
    case 502:
    case 503:
    case 504:
      return new AppError("upstream_error", "Gemini is temporarily unavailable. Please retry.", 503, true);
    default:
      return new AppError("upstream_error", "Could not reach Gemini. Check your connection and retry.", 502, true);
  }
}
