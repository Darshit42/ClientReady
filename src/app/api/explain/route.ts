import { NextResponse } from "next/server";
import { z } from "zod";
import { getReasoner } from "@/lib/providers";
import { handler, readJson } from "@/lib/server/route";
import { explainReport, ExplainInputSchema } from "@/lib/coach/explain";
import { once } from "@/lib/server/idempotency";
import { chargeSession } from "@/lib/server/live-gate";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = ExplainInputSchema.extend({
  sessionId: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/),
});

export const POST = handler(
  "explain",
  async (req) => {
    const { sessionId, ...input } = Body.parse(await readJson(req, 50_000));
    const reasoner = getReasoner();
    const { value } = once(`explain:${sessionId}:${input.languageId}`, async () => {
      // Shares the session's report budget, so explanations can't be generated endlessly.
      await chargeSession(sessionId, "report");
      return explainReport(reasoner, input);
    });
    return NextResponse.json(await value);
  },
  { weight: 2 },
);
