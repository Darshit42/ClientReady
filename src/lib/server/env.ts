import "server-only";

/**
 * Server-side configuration. Secrets are read here and nowhere else; only
 * booleans and non-secret identifiers ever leave this module via status().
 */

export type ReasoningProviderId = "bharatcode" | "anthropic" | "gemini" | "openai-compatible" | "demo";

function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function thinking(v: string | undefined): string | undefined {
  return !v || v.toLowerCase() === "none" ? undefined : v.toUpperCase();
}

function effort(v: string | undefined): string | undefined {
  return !v || v.toLowerCase() === "none" ? undefined : v.toLowerCase();
}

export function getEnv() {
  const gnaniKey = read("GNANI_API_KEY");
  const anthropicKey = read("ANTHROPIC_API_KEY");
  const geminiKey = read("GEMINI_API_KEY") ?? read("GOOGLE_API_KEY");
  const bharatcodeKey = read("BHARATCODE_API_KEY");
  const oaiBase = read("OPENAI_COMPAT_BASE_URL");
  const oaiModel = read("OPENAI_COMPAT_MODEL");

  const requested = read("REASONING_PROVIDER") as ReasoningProviderId | undefined;
  let reasoning: ReasoningProviderId;
  if (requested === "bharatcode" || requested === "anthropic" || requested === "gemini" || requested === "openai-compatible" || requested === "demo") {
    reasoning = requested;
  } else if (bharatcodeKey) {
    reasoning = "bharatcode";
  } else if (anthropicKey) {
    reasoning = "anthropic";
  } else if (geminiKey) {
    reasoning = "gemini";
  } else if (oaiBase && oaiModel) {
    reasoning = "openai-compatible";
  } else {
    reasoning = "demo";
  }

  return {
    gnani: {
      apiKey: gnaniKey,
      baseUrl: read("GNANI_BASE_URL") ?? "https://api.vachana.ai",
      ttsModel: read("GNANI_TTS_MODEL") ?? "timbre-v2.5",
      coachVoice: read("GNANI_COACH_VOICE"),
      sttTimeoutMs: Number(read("GNANI_STT_TIMEOUT_MS") ?? 30_000),
      ttsTimeoutMs: Number(read("GNANI_TTS_TIMEOUT_MS") ?? 30_000),
    },
    reasoning,
    bharatcode: {
      apiKey: bharatcodeKey,
      baseUrl: read("BHARATCODE_BASE_URL") ?? "https://bharatcode.ai/api/model/v1",
      clientModel: read("BHARATCODE_CLIENT_MODEL") ?? "qwen-3.8-27b",
      coachModel: read("BHARATCODE_COACH_MODEL") ?? read("BHARATCODE_CLIENT_MODEL") ?? "qwen-3.8-27b",
      // "none" omits the parameter. "low" keeps calls fast and reports inside the time limit.
      clientReasoningEffort: effort(read("BHARATCODE_CLIENT_REASONING_EFFORT") ?? "low"),
      coachReasoningEffort: effort(read("BHARATCODE_COACH_REASONING_EFFORT") ?? "low"),
    },
    anthropic: {
      apiKey: anthropicKey,
      clientModel: read("ANTHROPIC_CLIENT_MODEL") ?? "claude-opus-5-5",
      coachModel: read("ANTHROPIC_COACH_MODEL") ?? "claude-opus-5-5",
    },
    gemini: {
      apiKey: geminiKey,
      clientModel: read("GEMINI_CLIENT_MODEL") ?? "gemini-3.8-flash",
      coachModel: read("GEMINI_COACH_MODEL") ?? "gemini-3.8-flash",
      // "none" disables the setting; client turns default to LOW for latency.
      clientThinkingLevel: thinking(read("GEMINI_CLIENT_THINKING_LEVEL") ?? "LOW"),
      coachThinkingLevel: thinking(read("GEMINI_COACH_THINKING_LEVEL")),
    },
    openaiCompat: {
      baseUrl: oaiBase,
      apiKey: read("OPENAI_COMPAT_API_KEY"),
      model: oaiModel,
      /** Human label shown in the UI, e.g. "Gnani Evon v3.3 (self-hosted)". Never inferred. */
      label: read("OPENAI_COMPAT_LABEL") ?? oaiModel ?? "OpenAI-compatible model",
    },
    rateLimitPerMinute: Number(read("RATE_LIMIT_PER_MINUTE") ?? 30),
  };
}

export type AppEnv = ReturnType<typeof getEnv>;

/** Public, secret-free status for the UI. */
export function publicStatus() {
  const env = getEnv();
  const reasoningLabel =
    env.reasoning === "bharatcode"
      ? `BharatCode (${env.bharatcode.clientModel})`
      : env.reasoning === "anthropic"
      ? `Anthropic Claude (${env.anthropic.clientModel})`
      : env.reasoning === "gemini"
        ? `Google Gemini (${env.gemini.clientModel})`
        : env.reasoning === "openai-compatible"
        ? env.openaiCompat.label
        : "Demo engine (rule-based, not an LLM)";
  const reasoningReady =
    env.reasoning === "demo" ||
    (env.reasoning === "bharatcode" && !!env.bharatcode.apiKey) ||
    (env.reasoning === "anthropic" && !!env.anthropic.apiKey) ||
    (env.reasoning === "gemini" && !!env.gemini.apiKey) ||
    (env.reasoning === "openai-compatible" && !!env.openaiCompat.baseUrl && !!env.openaiCompat.model);
  return {
    stt: { provider: "Gnani Prisma v2.5", configured: !!env.gnani.apiKey },
    tts: { provider: `Gnani Timbre (${env.gnani.ttsModel})`, configured: !!env.gnani.apiKey, model: env.gnani.ttsModel },
    reasoning: { provider: env.reasoning, label: reasoningLabel, configured: reasoningReady, isDemo: env.reasoning === "demo" },
  };
}

export type PublicStatus = ReturnType<typeof publicStatus>;
