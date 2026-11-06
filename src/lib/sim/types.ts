import { z } from "zod";
import type { Scenario } from "@/lib/scenario/schema";

export const PHASES = ["opening", "discovery", "pitch", "objections", "negotiation", "closing", "ended"] as const;
export type Phase = (typeof PHASES)[number];

export const OUTCOMES = ["deal-agreed", "next-step-agreed", "follow-up-later", "not-interested", "time-up"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const MAX_UTTERANCE_CHARS = 1500;
export const MAX_CLIENT_REPLY_WORDS = 90;

export const TurnSchema = z.object({
  index: z.number().int().min(0).max(60),
  role: z.enum(["client", "learner"]),
  text: z.string().max(MAX_UTTERANCE_CHARS),
  /** Faithful professional English rendering of a non-English learner turn. */
  englishText: z.string().max(MAX_UTTERANCE_CHARS * 2).optional(),
  /** How the learner text was produced. "typed" is never presented as Prisma output. */
  source: z.enum(["prisma", "typed", "model"]).default("model"),
  audioSeconds: z.number().min(0).max(600).optional(),
  /** The learner talked over this client line before it finished. */
  interrupted: z.boolean().optional(),
  at: z.number().optional(),
});
export type Turn = z.infer<typeof TurnSchema>;

export const ClientStateSchema = z.object({
  interest: z.number().min(0).max(100).default(50),
  phase: z.enum(PHASES).default("opening"),
  raisedConcernIds: z.array(z.string().max(40)).max(20).default([]),
  ended: z.boolean().default(false),
  outcome: z.enum(OUTCOMES).nullable().default(null),
  /** Private notes explaining client reactions; shown only in the coaching report. */
  notes: z.array(z.object({ turn: z.number().int(), note: z.string().max(400) })).max(40).default([]),
});
export type ClientState = z.infer<typeof ClientStateSchema>;

/**
 * Structured output the reasoning model must return for every client turn.
 * Kept free of min/max/default constraints (not all structured-output
 * backends support them); values are clamped in applyClientOutput instead.
 */
export const ClientTurnOutputSchema = z.object({
  learnerEnglish: z
    .string()
    // qwen-3.8-27b (BharatCode) omits the field instead of sending "" (seen live, 6 Nov 2026).
    .default("")
    .describe("Only when the freelancer did not speak English: a faithful professional English rendering of their last message. Otherwise empty string."),
  reply: z.string().describe("What the client says out loud next. Plain spoken English, no markdown, no stage directions."),
  interest: z.number().describe("Client's current interest in buying, integer 0-100."),
  phase: z.enum(PHASES),
  newConcernIds: z.array(z.string()).describe("IDs of hidden concerns raised for the first time in this reply."),
  endConversation: z.boolean(),
  outcome: z.enum(OUTCOMES).nullable(),
  coachNote: z.string().describe("Private one-sentence note for the coach on why the client reacted this way."),
});
export type ClientTurnOutput = z.infer<typeof ClientTurnOutputSchema>;

export interface Concern {
  id: string;
  label: string;
  /** How the client might voice it. Guidance for the model, not a script. */
  sample: string;
}

export interface PersonaDossier {
  summary: string;
  goals: string[];
  concerns: Concern[];
  decisionProcess: string;
  walkAway: string;
  winsTrust: string[];
}

export interface SessionPayload {
  sessionId: string;
  scenario: Scenario;
  turns: Turn[];
  clientState: ClientState;
}
