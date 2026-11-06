"use client";

import { ArrowRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, ButtonLink, Card, cn, Eyebrow } from "@/components/ui";
import { deleteAllSessions, deleteSession, listSessions, type SavedSession } from "@/lib/client/storage";
import { CATEGORIES } from "@/lib/coach/rubric";
import { scoreBand } from "@/lib/coach/score";

const answerCount = (s: SavedSession) => s.turns.filter((t) => t.role === "learner").length;

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SavedSession[] | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => setSessions(listSessions()), []);
  if (sessions === null) return null;

  // The scripted sample call is not your own practice, so it stays out of the progress chart.
  const scored = sessions.filter((s) => !s.sample && s.report && s.report.overall !== null).slice().reverse();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>History</Eyebrow>
          <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">Your practice sessions</h1>
          <p className="mt-2 text-sm text-fg-muted">Stored only in this browser. No audio is ever saved.</p>
        </div>
        {sessions.length > 0 && (
          confirmAll ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-fg-muted">Delete all {sessions.length} sessions?</span>
              <Button variant="danger" size="sm" onClick={() => { deleteAllSessions(); setSessions([]); setConfirmAll(false); }}>Delete all</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmAll(false)}>Cancel</Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmAll(true)}><Trash2 className="h-3.5 w-3.5" /> Delete all</Button>
          )
        )}
      </div>

      {sessions.length === 0 ? (
        <Card className="mt-10 p-10 text-center">
          <p className="font-display text-2xl">No sessions yet.</p>
          <p className="mt-2 text-fg-muted">Your scorecards will appear here after your first call.</p>
          <ButtonLink href="/practice" className="mt-6">Start practising <ArrowRight className="h-4 w-4" /></ButtonLink>
        </Card>
      ) : (
        <>
          {scored.length >= 2 && <Progress sessions={scored} />}
          <ul className="mt-8 space-y-3">
            {sessions.map((s) => {
              const band = scoreBand(s.report?.overall ?? null);
              return (
                <li key={s.id}>
                  <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <div className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-xl font-display text-2xl", s.report?.overall == null ? "bg-surface-2 text-fg-subtle" : s.report.overall >= 70 ? "bg-good/10 text-good" : s.report.overall >= 50 ? "bg-mid/10 text-mid" : "bg-low/10 text-low")}>
                      {s.report?.overall ?? "–"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.scenario.title}</p>
                      <p className="truncate text-sm text-fg-muted">
                        {s.scenario.client.name} · {answerCount(s)} answer{answerCount(s) === 1 ? "" : "s"} · {new Date(s.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge>{s.report ? band.label : "No report yet"}</Badge>
                        {s.sample ? <Badge tone="mid">Sample call</Badge> : s.isDemo && <Badge tone="mid">Demo engine</Badge>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <ButtonLink href={`/report/${s.id}`} variant="secondary" size="sm">{s.report ? "View report" : "Generate report"}</ButtonLink>
                      <Button variant="ghost" size="sm" aria-label={`Delete session ${s.scenario.title}`} onClick={() => { deleteSession(s.id); setSessions(listSessions()); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="mt-10 text-center text-sm text-fg-subtle">
        Ready for another client? <Link href="/practice" className="text-fg-muted underline-offset-2 hover:underline">Build a new scenario</Link>
      </p>
    </div>
  );
}

function Progress({ sessions }: { sessions: SavedSession[] }) {
  const pts = sessions.slice(-12);
  const w = 600;
  const h = 140;
  const pad = 16;
  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, pts.length - 1);
  const y = (v: number) => h - pad - (v / 100) * (h - pad * 2);
  const path = pts.map((s, i) => `${i ? "L" : "M"}${x(i)},${y(s.report!.overall!)}`).join(" ");
  const first = pts[0].report!;
  const last = pts[pts.length - 1].report!;
  const delta = (last.overall ?? 0) - (first.overall ?? 0);

  const catDelta = CATEGORIES.map((c) => {
    const a = first.categories.find((x) => x.id === c.id)?.score;
    const b = last.categories.find((x) => x.id === c.id)?.score;
    return { name: c.name, d: a != null && b != null ? b - a : null };
  }).filter((c) => c.d !== null) as Array<{ name: string; d: number }>;
  const best = catDelta.sort((a, b) => b.d - a.d)[0];

  return (
    <Card className="mt-8 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">Overall score, last {pts.length} sessions</p>
        <p className={cn("font-mono text-sm", delta >= 0 ? "text-good" : "text-low")}>
          {delta >= 0 ? "+" : ""}{delta} since first
        </p>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-36 w-full" role="img" aria-label={`Score trend from ${first.overall} to ${last.overall}`}>
        {[25, 50, 75].map((g) => (
          <line key={g} x1={pad} x2={w - pad} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeDasharray="3 5" />
        ))}
        <path d={path} fill="none" stroke="var(--signal)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((s, i) => (
          <circle key={s.id} cx={x(i)} cy={y(s.report!.overall!)} r="4" fill="var(--bg)" stroke="var(--signal)" strokeWidth="2" />
        ))}
      </svg>
      {best && best.d !== 0 && <p className="mt-2 text-sm text-fg-muted">Biggest change: <span className="text-fg">{best.name}</span> ({best.d > 0 ? "+" : ""}{best.d}).</p>}
    </Card>
  );
}
