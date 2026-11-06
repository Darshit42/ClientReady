import { OpenAICompatibleReasoning } from "./openai-compatible";

/**
 * BharatCode's model API (https://bharatcode.ai/build): OpenAI-compatible
 * chat completions at https://bharatcode.ai/api/model/v1 with a Bearer key.
 * `qwen-3.8-27b` is available on student, Lite and Pro plans;
 * `deepseek-v4.1-flash` on Pro. Requests share capacity and may queue, and a
 * 503 means the model is busy, so the single retry waits a few seconds.
 */
export const BHARATCODE_BASE_URL = "https://bharatcode.ai/api/model/v1";
export const BHARATCODE_DEFAULT_MODEL = "qwen-3.8-27b";

export class BharatCodeReasoning extends OpenAICompatibleReasoning {
  readonly id = "bharatcode";

  constructor(opts: { apiKey: string; model?: string; coachModel?: string; baseUrl?: string; fetchImpl?: typeof fetch }) {
    const model = opts.model ?? BHARATCODE_DEFAULT_MODEL;
    super({
      baseUrl: opts.baseUrl ?? BHARATCODE_BASE_URL,
      apiKey: opts.apiKey,
      model,
      coachModel: opts.coachModel,
      label: `BharatCode (${model})`,
      retryDelayMs: 3000,
      fetchImpl: opts.fetchImpl,
    });
  }
}
