import type { z } from "zod";
import { AppError } from "@/lib/server/errors";

/**
 * Parse JSON from a model that was asked (not constrained) to emit JSON:
 * tolerates reasoning in <think> tags, code fences and leading/trailing
 * prose, then validates.
 */
export function parseModelJSON<T>(raw: string, schema: z.ZodType<T>): T {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new AppError("model_output_invalid", "The reasoning model did not return JSON. Please retry.", 502, true);
  }
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AppError("model_output_invalid", "The reasoning model returned malformed JSON. Please retry.", 502, true);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new AppError("model_output_invalid", "The reasoning model's response was missing required fields. Please retry.", 502, true);
  }
  return parsed.data;
}
