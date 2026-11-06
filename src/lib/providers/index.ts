import "server-only";
import { getEnv } from "@/lib/server/env";
import { AppError } from "@/lib/server/errors";
import { GnaniPrismaSTT } from "./gnani/prisma";
import { GnaniTimbreTTS } from "./gnani/timbre";
import { AnthropicReasoning } from "./reasoning/anthropic";
import { OpenAICompatibleReasoning } from "./reasoning/openai-compatible";
import { GeminiReasoning } from "./reasoning/gemini";
import { BharatCodeReasoning } from "./reasoning/bharatcode";
import type { ReasoningProvider, SynthesisProvider, TranscriptionProvider } from "./types";

export function getTranscriber(): TranscriptionProvider {
  const env = getEnv();
  if (!env.gnani.apiKey) {
    throw new AppError(
      "not_configured",
      "Gnani Prisma is not configured. Add GNANI_API_KEY to .env.local (create a key at app.gnani.ai/voice). You can type your answers meanwhile.",
      503,
    );
  }
  return new GnaniPrismaSTT({ apiKey: env.gnani.apiKey, baseUrl: env.gnani.baseUrl, timeoutMs: env.gnani.sttTimeoutMs });
}

export function getSynthesizer(): SynthesisProvider {
  const env = getEnv();
  if (!env.gnani.apiKey) {
    throw new AppError("not_configured", "Gnani Timbre is not configured. Add GNANI_API_KEY to .env.local. The client's replies are shown as text meanwhile.", 503);
  }
  return new GnaniTimbreTTS({
    apiKey: env.gnani.apiKey,
    baseUrl: env.gnani.baseUrl,
    model: env.gnani.ttsModel,
    timeoutMs: env.gnani.ttsTimeoutMs,
  });
}

/** Returns null when the demo engine is active. */
export function getReasoner(): ReasoningProvider | null {
  const env = getEnv();
  if (env.reasoning === "demo") return null;
  if (env.reasoning === "bharatcode") {
    if (!env.bharatcode.apiKey) throw new AppError("not_configured", "REASONING_PROVIDER=bharatcode but BHARATCODE_API_KEY is missing.", 503);
    return new BharatCodeReasoning({
      apiKey: env.bharatcode.apiKey,
      baseUrl: env.bharatcode.baseUrl,
      model: env.bharatcode.clientModel,
      coachModel: env.bharatcode.coachModel,
      clientReasoningEffort: env.bharatcode.clientReasoningEffort,
      coachReasoningEffort: env.bharatcode.coachReasoningEffort,
    });
  }
  if (env.reasoning === "anthropic") {
    if (!env.anthropic.apiKey) throw new AppError("not_configured", "REASONING_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing.", 503);
    return new AnthropicReasoning({
      apiKey: env.anthropic.apiKey,
      clientModel: env.anthropic.clientModel,
      coachModel: env.anthropic.coachModel,
    });
  }
  if (env.reasoning === "gemini") {
    if (!env.gemini.apiKey) throw new AppError("not_configured", "REASONING_PROVIDER=gemini but GEMINI_API_KEY is missing.", 503);
    return new GeminiReasoning({
      apiKey: env.gemini.apiKey,
      clientModel: env.gemini.clientModel,
      coachModel: env.gemini.coachModel,
      clientThinkingLevel: env.gemini.clientThinkingLevel,
      coachThinkingLevel: env.gemini.coachThinkingLevel,
    });
  }
  if (!env.openaiCompat.baseUrl || !env.openaiCompat.model) {
    throw new AppError("not_configured", "REASONING_PROVIDER=openai-compatible needs OPENAI_COMPAT_BASE_URL and OPENAI_COMPAT_MODEL.", 503);
  }
  return new OpenAICompatibleReasoning({
    baseUrl: env.openaiCompat.baseUrl,
    apiKey: env.openaiCompat.apiKey,
    model: env.openaiCompat.model,
    label: env.openaiCompat.label,
  });
}
