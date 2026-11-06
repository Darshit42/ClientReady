import { ApiError } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { GeminiReasoning, toGeminiSchema, type GeminiClientLike } from "@/lib/providers/reasoning/gemini";
import { ClientTurnOutputSchema } from "@/lib/sim/types";
import { CoachReportWireSchema } from "@/lib/coach/report";
import { runClientTurn } from "@/lib/sim/engine";
import { AppError } from "@/lib/server/errors";
import { clientOutput, sampleTurns, scenario } from "../helpers/fixtures";

type Call = { model: string; contents: Array<{ role: string; parts: Array<{ text: string }> }>; config: Record<string, unknown> };

function fakeClient(responses: Array<unknown>) {
  const calls: Call[] = [];
  let i = 0;
  const client: GeminiClientLike = {
    models: {
      generateContent: vi.fn(async (params) => {
        calls.push(params as unknown as Call);
        const r = responses[i++];
        if (r instanceof Error) throw r;
        return r as { text?: string };
      }),
    },
  };
  return { client, calls };
}

const make = (client: GeminiClientLike, levels: { client?: string; coach?: string } = {}) =>
  new GeminiReasoning({
    apiKey: "test",
    clientModel: "gemini-test-flash",
    coachModel: "gemini-test-pro",
    clientThinkingLevel: levels.client,
    coachThinkingLevel: levels.coach,
    client,
  });

const ask = (g: GeminiReasoning, purpose: "client-turn" | "coach-report" = "client-turn") =>
  g.generateJSON({
    purpose,
    system: "SYSTEM RULES",
    messages: [
      { role: "user", content: "open" },
      { role: "assistant", content: "Hi there" },
      { role: "user", content: "Freelancer says: hello" },
    ],
    schema: ClientTurnOutputSchema,
    schemaName: "client_turn",
    maxTokens: 1200,
  });

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return (e as AppError).code;
  }
  return "no-error";
}

describe("Gemini reasoning provider", () => {
  it("sends system instruction, mapped roles and a JSON schema, then validates the output", async () => {
    const { client, calls } = fakeClient([{ text: JSON.stringify(clientOutput()) }]);
    const out = await ask(make(client));
    expect(out.reply).toContain("pays for itself");
    const call = calls[0];
    expect(call.model).toBe("gemini-test-flash");
    expect(call.contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(call.config.systemInstruction).toBe("SYSTEM RULES");
    expect(call.config.responseMimeType).toBe("application/json");
    expect(call.config.responseJsonSchema).toEqual(toGeminiSchema(ClientTurnOutputSchema));
    expect(call.config.abortSignal).toBeInstanceOf(AbortSignal);
    expect(call.config.thinkingConfig).toBeUndefined();
  });

  it("uses the coach model for reports and a separate thinking level per purpose", async () => {
    const { client, calls } = fakeClient([{ text: JSON.stringify(clientOutput()) }, { text: JSON.stringify(clientOutput()) }]);
    const g = make(client, { client: "LOW" });
    await ask(g, "client-turn");
    await ask(g, "coach-report");
    expect(calls[0].config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    expect(calls[1].model).toBe("gemini-test-pro");
    expect(calls[1].config.thinkingConfig).toBeUndefined();
  });

  it("retries once without the thinking level when the model rejects it", async () => {
    const { client, calls } = fakeClient([
      new ApiError({ status: 400, message: "Thinking level MINIMAL is not supported for this model." }),
      { text: JSON.stringify(clientOutput()) },
    ]);
    const out = await ask(make(client, { client: "MINIMAL" }));
    expect(out.reply).toBeTruthy();
    expect(calls).toHaveLength(2);
    expect(calls[1].config.thinkingConfig).toBeUndefined();
  });

  it("produces Gemini-compatible schemas (no $schema, no anyOf; nullable as type array)", () => {
    for (const s of [ClientTurnOutputSchema, CoachReportWireSchema]) {
      const json = JSON.stringify(toGeminiSchema(s));
      expect(json).not.toContain("$schema");
      expect(json).not.toContain("anyOf");
    }
    const outcome = (toGeminiSchema(ClientTurnOutputSchema).properties as Record<string, { type: unknown; enum: unknown[] }>).outcome;
    expect(outcome.type).toEqual(["string", "null"]);
    expect(outcome.enum).toContain(null);
  });

  it("rejects malformed or incomplete JSON", async () => {
    expect(await codeOf(ask(make(fakeClient([{ text: "{oops" }]).client)))).toBe("model_output_invalid");
    expect(await codeOf(ask(make(fakeClient([{ text: '{"reply":"hi"}' }]).client)))).toBe("model_output_invalid");
  });

  it("handles empty, truncated and safety-blocked responses", async () => {
    expect(await codeOf(ask(make(fakeClient([{ text: "" }]).client)))).toBe("model_output_invalid");
    expect(await codeOf(ask(make(fakeClient([{ text: undefined, candidates: [{ finishReason: "MAX_TOKENS" }] }]).client)))).toBe("model_output_invalid");
    expect(await codeOf(ask(make(fakeClient([{ text: "{}", candidates: [{ finishReason: "SAFETY" }] }]).client)))).toBe("model_output_invalid");
  });

  it.each([
    [400, "API key not valid. Please pass a valid API key.", "auth_failed"],
    [403, "Permission denied", "auth_failed"],
    [404, "models/x is not found", "not_configured"],
    [402, "Your prepayment credits are depleted.", "credits_exhausted"],
    [429, "Resource has been exhausted", "rate_limited"],
  ])("maps HTTP %i without retrying", async (status, message, code) => {
    const { client, calls } = fakeClient([new ApiError({ status, message }), { text: JSON.stringify(clientOutput()) }]);
    expect(await codeOf(ask(make(client)))).toBe(code);
    expect(calls).toHaveLength(1);
  });

  it("retries a transient 503 once", async () => {
    const { client, calls } = fakeClient([new ApiError({ status: 503, message: "overloaded" }), { text: JSON.stringify(clientOutput()) }]);
    const out = await ask(make(client));
    expect(out.interest).toBe(55);
    expect(calls).toHaveLength(2);
  });

  it("gives up after two 5xx failures", async () => {
    const { client, calls } = fakeClient([new ApiError({ status: 500, message: "x" }), new ApiError({ status: 500, message: "x" }), {}]);
    expect(await codeOf(ask(make(client)))).toBe("upstream_error");
    expect(calls).toHaveLength(2);
  });

  it("retries a stalled client turn once, then reports a timeout", async () => {
    const stall = () => Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const ok = fakeClient([stall(), { text: JSON.stringify(clientOutput()) }]);
    expect((await ask(make(ok.client))).interest).toBe(55);
    expect(ok.calls).toHaveLength(2);
    const bad = fakeClient([stall(), stall(), {}]);
    expect(await codeOf(ask(make(bad.client)))).toBe("timeout");
    expect(bad.calls).toHaveLength(2);
  });

  it("does not retry a timed-out coaching report (long and costly)", async () => {
    const { client, calls } = fakeClient([Object.assign(new Error("timed out"), { name: "TimeoutError" }), {}]);
    expect(await codeOf(ask(make(client), "coach-report"))).toBe("timeout");
    expect(calls).toHaveLength(1);
  });

  it("drives a real client turn through the simulator", async () => {
    const { client } = fakeClient([{ text: JSON.stringify(clientOutput({ reply: "So what's included for that price?", newConcernIds: ["scope", "roi"] })) }]);
    const res = await runClientTurn(make(client), scenario, sampleTurns.slice(0, 2), null);
    expect(res.reply).toBe("So what's included for that price?");
    expect(res.generatedBy).toBe("Google Gemini (gemini-test-flash)");
    expect(res.state.raisedConcernIds).toEqual(["roi"]); // "scope" isn't one of this persona's concerns
  });
});

describe("Gemini env selection", () => {
  it("picks Gemini from GEMINI_API_KEY or GOOGLE_API_KEY when no Anthropic key is set", async () => {
    const { publicStatus } = await import("@/lib/server/env");
    const keep = { ...process.env };
    try {
      for (const k of ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "REASONING_PROVIDER", "OPENAI_COMPAT_BASE_URL", "OPENAI_COMPAT_MODEL"]) delete process.env[k];
      process.env.GEMINI_API_KEY = "g-secret";
      const s = publicStatus();
      expect(s.reasoning.provider).toBe("gemini");
      expect(s.reasoning.label).toBe("Google Gemini (gemini-3.8-flash)");
      const { getEnv } = await import("@/lib/server/env");
      expect(getEnv().gemini.clientThinkingLevel).toBe("LOW");
      expect(getEnv().gemini.coachThinkingLevel).toBeUndefined();
      process.env.GEMINI_CLIENT_THINKING_LEVEL = "none";
      expect(getEnv().gemini.clientThinkingLevel).toBeUndefined();
      expect(JSON.stringify(s)).not.toContain("g-secret");
      delete process.env.GEMINI_API_KEY;
      process.env.GOOGLE_API_KEY = "g2";
      expect(publicStatus().reasoning.provider).toBe("gemini");
      process.env.GEMINI_CLIENT_MODEL = "gemini-3.5-flash-lite";
      expect(publicStatus().reasoning.label).toBe("Google Gemini (gemini-3.5-flash-lite)");
    } finally {
      process.env = keep;
    }
  });
});
