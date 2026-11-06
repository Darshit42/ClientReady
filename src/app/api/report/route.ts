import { NextResponse } from "next/server";
import { z } from "zod";
import { getReasoner } from "@/lib/providers";
import { handler, readJson } from "@/lib/server/route";
import { ScenarioSchema } from "@/lib/scenario/schema";
import { ClientStateSchema, TurnSchema } from "@/lib/sim/types";
import { generateCoachReport } from "@/lib/coach/generate";
import { once } from "@/lib/server/idempotency";
import { VoiceMetricsSchema } from "@/lib/voice/delivery";
import { chargeSession } from "@/lib/server/live-gate";

export const runtime = "nodejs";
// BharatCode reports can take ~3 minutes (see providers/reasoning/bharatcode.ts).
export const maxDuration = 300;

const Body = z.object({
  sessionId: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/),
  scenario: ScenarioSchema,
  turns: z.array(TurnSchema).min(2).max(50),
  clientState: ClientStateSchema,
  /** Timing metrics measured from the microphone during a live call. */
  voice: VoiceMetricsSchema.nullable().default(null),
});

export const POST = handler(
  "report",
  async (req) => {
    const body = Body.parse(await readJson(req));
    await chargeSession(body.sessionId, "report");
    const reasoner = getReasoner();
    // A trailing client line (e.g. its goodbye) is not needed for scoring.
    const turns = body.turns.at(-1)?.role === "client" ? body.turns.slice(0, -1) : body.turns;
    const { value } = once(`report:${body.sessionId}:${turns.length}`, () =>
      generateCoachReport(reasoner, body.scenario, turns, body.clientState, body.voice),
    );
    return NextResponse.json(await value);
  },
  { weight: 3 },
);
