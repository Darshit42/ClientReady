import { afterEach, describe, expect, it, vi } from "vitest";
import { BharatCodeReasoning, BHARATCODE_BASE_URL } from "@/lib/providers/reasoning/bharatcode";
import { ClientTurnOutputSchema } from "@/lib/sim/types";
import { runClientTurn } from "@/lib/sim/engine";
import { AppError } from "@/lib/server/errors";
import { clientOutput, sampleTurns, scenario } from "../helpers/fixtures";

const completion = (content: string, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status, headers: { "Content-Type": "application/json" } });

const ask = (p: BharatCodeReasoning, purpose: "client-turn" | "coach-report" = "client-turn") =>
  p.generateJSON({ purpose, system: "SYSTEM", messages: [{ role: "user", content: "hello" }], schema: ClientTurnOutputSchema, schemaName: "client_turn", maxTokens: 800 });

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return (e as AppError).code;
  }
  return "ok";
}

describe("BharatCode model API provider", () => {
  it("calls the OpenAI-compatible chat completions endpoint with a Bearer key and qwen-3.8-27b", async () => {
    const fetchImpl = vi.fn(async () => completion(JSON.stringify(clientOutput())));
    const p = new BharatCodeReasoning({ apiKey: "bc-test", fetchImpl: fetchImpl as unknown as typeof fetch });
    const out = await ask(p);
    expect(out.reply).toContain("pays for itself");
    expect(p.id).toBe("bharatcode");
    expect(p.label).toBe("BharatCode (qwen-3.8-27b)");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BHARATCODE_BASE_URL}/chat/completions`);
    expect(BHARATCODE_BASE_URL).toBe("https://bharatcode.ai/api/model/v1");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer bc-test");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("qwen-3.8-27b");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0]).toMatchObject({ role: "system" });
  });

  it("uses the coach model for reports", async () => {
    const fetchImpl = vi.fn(async () => completion(JSON.stringify(clientOutput())));
    const p = new BharatCodeReasoning({ apiKey: "k", coachModel: "deepseek-v4.1-flash", fetchImpl: fetchImpl as unknown as typeof fetch });
    await ask(p, "coach-report");
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)).model).toBe("deepseek-v4.1-flash");
  });

  it("ignores Qwen <think> reasoning before the JSON", async () => {
    const raw = `<think>The freelancer listed features; I should push on {value}.</think>\n${JSON.stringify(clientOutput({ reply: "So what's in it for my clinic?" }))}`;
    const p = new BharatCodeReasoning({ apiKey: "k", fetchImpl: (async () => completion(raw)) as unknown as typeof fetch });
    expect((await ask(p)).reply).toBe("So what's in it for my clinic?");
  });

  it("retries once without JSON mode if the server rejects response_format", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "response_format is not supported" } }), { status: 400 }))
      .mockResolvedValueOnce(completion(JSON.stringify(clientOutput())));
    const p = new BharatCodeReasoning({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect((await ask(p)).interest).toBe(55);
    expect(JSON.parse(String((fetchImpl.mock.calls[1] as [string, RequestInit])[1].body)).response_format).toBeUndefined();
  });

  it("maps a bad key, quota and a busy model to clear errors", async () => {
    const mk = (status: number) => new BharatCodeReasoning({ apiKey: "k", fetchImpl: (async () => new Response("{}", { status })) as unknown as typeof fetch });
    expect(await codeOf(ask(mk(401)))).toBe("auth_failed");
    expect(await codeOf(ask(mk(402)))).toBe("credits_exhausted");
    const busy = vi.fn(async () => new Response("{}", { status: 503 }));
    const p = new BharatCodeReasoning({ apiKey: "k", fetchImpl: busy as unknown as typeof fetch });
    // @ts-expect-error shorten the retry wait for the test
    p.opts.retryDelayMs = 1;
    expect(await codeOf(ask(p))).toBe("upstream_error");
    expect(busy).toHaveBeenCalledTimes(2); // one retry, then a "model is busy" error
  });

  it("drives a real client turn", async () => {
    const p = new BharatCodeReasoning({ apiKey: "k", fetchImpl: (async () => completion(JSON.stringify(clientOutput({ reply: "What's included?" })))) as unknown as typeof fetch });
    const res = await runClientTurn(p, scenario, sampleTurns.slice(0, 2), null);
    expect(res.reply).toBe("What's included?");
    expect(res.generatedBy).toBe("BharatCode (qwen-3.8-27b)");
  });
});

describe("BharatCode selection", () => {
  const keep = { ...process.env };
  afterEach(() => {
    process.env = { ...keep };
  });

  it("is chosen whenever BHARATCODE_API_KEY is set, ahead of Gemini, and never leaks the key", async () => {
    const { publicStatus, getEnv } = await import("@/lib/server/env");
    for (const k of ["REASONING_PROVIDER", "ANTHROPIC_API_KEY", "OPENAI_COMPAT_BASE_URL", "OPENAI_COMPAT_MODEL", "BHARATCODE_CLIENT_MODEL", "BHARATCODE_COACH_MODEL"]) delete process.env[k];
    process.env.GEMINI_API_KEY = "g";
    process.env.BHARATCODE_API_KEY = "bc-secret-key";
    const s = publicStatus();
    expect(s.reasoning).toMatchObject({ provider: "bharatcode", label: "BharatCode (qwen-3.8-27b)", configured: true, isDemo: false });
    expect(JSON.stringify(s)).not.toContain("bc-secret-key");
    expect(getEnv().bharatcode.baseUrl).toBe("https://bharatcode.ai/api/model/v1");
    process.env.REASONING_PROVIDER = "gemini";
    expect(publicStatus().reasoning.provider).toBe("gemini");
  });
});
