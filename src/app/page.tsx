import { ArrowRight, AudioLines, Brain, ChartNoAxesColumn, Globe, Languages, Lock, Mic, MessagesSquare, Volume2 } from "lucide-react";
import Link from "next/link";
import { ButtonLink, Card, Eyebrow } from "@/components/ui";
import { DemoPreview } from "@/components/demo-preview";
import { ProviderStatus } from "@/components/provider-status";
import { PRESETS } from "@/lib/scenario/presets";

export default function Home() {
  return (
    <div className="grain">
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pt-24">
        <div>
          <Eyebrow>For Indian freelancers selling to the world</Eyebrow>
          <h1 className="mt-4 font-display text-5xl sm:text-6xl lg:text-7xl">
            Practise the client call <span className="text-signal-strong">before</span> the real one.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-fg-muted">
            Speak to a simulated US, UK or Australian client who asks hard questions about your price, your scope and your AI. Then get coaching
            that quotes what you actually said and shows you a stronger answer.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/practice" size="lg">
              Start practising <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="/levels" size="lg" variant="secondary">
              Climb the levels
            </ButtonLink>
            <ButtonLink href="/practice/session?sample" size="lg" variant="ghost">
              Hear a sample call
            </ButtonLink>
          </div>
          <p className="mt-4 text-sm text-fg-subtle">No sign-up. Your sessions stay in your browser. The sample call is scripted and uses your browser&apos;s voice.</p>
        </div>
        <DemoPreview />
      </section>

      <div className="hairline mx-auto max-w-6xl" />

      {/* Problem */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <Eyebrow>The problem</Eyebrow>
            <h2 className="mt-3 font-display text-4xl leading-tight">You can build it. Selling it on a call is a different skill.</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Features, not outcomes", "“It uses GPT and integrates with your CRM” doesn't answer “why should I pay for this?”"],
              ["Price panic", "The client says “that's expensive” and the discount comes out before the question is understood."],
              ["Thinking in two languages", "You know exactly what you mean in Hindi or Tamil. Finding the crisp English sentence under pressure is the hard part."],
              ["No safe place to practise", "Real calls are the only practice, and every fumble costs a client."],
            ].map(([t, d]) => (
              <Card key={t} className="p-5">
                <p className="font-medium">{t}</p>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{d}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-3 max-w-2xl font-display text-4xl leading-tight">A practice room with a tough client and an honest coach.</h2>
        <ol className="mt-10 grid gap-4 md:grid-cols-4">
          {[
            { icon: MessagesSquare, t: "Set the scene", d: "Pick a template or describe your offer, price and the client you want to win." },
            { icon: Mic, t: "Speak your pitch", d: "Talk naturally in English, Hinglish or your language. Gnani Prisma transcribes you." },
            { icon: Volume2, t: "Handle the pushback", d: "The client reacts to your actual words, raises hidden concerns and negotiates, in a Gnani Timbre voice." },
            { icon: ChartNoAxesColumn, t: "Get coached", d: "A 9-skill scorecard with quotes from your call, better answers for your offer, and 3 drills." },
          ].map((s, i) => (
            <li key={s.t}>
              <Card className="h-full p-5">
                <div className="flex items-center justify-between">
                  <s.icon className="h-5 w-5 text-signal" aria-hidden />
                  <span className="font-mono text-xs text-fg-subtle">0{i + 1}</span>
                </div>
                <p className="mt-4 font-medium">{s.t}</p>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{s.d}</p>
              </Card>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-fg-muted">
          The client&apos;s voice is Gnani Timbre English (India). Clients differ by what they ask and care about, not by accent.
        </p>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Brain, t: "An adaptive client", d: "A consistent fictional persona with goals, a budget, a decision process and concerns it reveals gradually." },
            { icon: Languages, t: "Your language, their language", d: "Speak in 10 Indian languages or Hinglish. See a faithful English version and get coaching in your language." },
            { icon: AudioLines, t: "Clarity, not accent", d: "We coach intelligibility, structure and pacing. An Indian accent is never scored as a weakness." },
            { icon: Lock, t: "Private by default", d: "Audio is transcribed and discarded. Sessions are saved only in your browser and can be deleted anytime." },
          ].map((f) => (
            <Card key={f.t} className="p-5">
              <f.icon className="h-5 w-5 text-client" aria-hidden />
              <p className="mt-4 font-medium">{f.t}</p>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{f.d}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Scenarios */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Ready-made scenarios</Eyebrow>
            <h2 className="mt-3 font-display text-4xl leading-tight">Start with a realistic client.</h2>
          </div>
          <ButtonLink href="/practice" variant="secondary">
            Build your own <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRESETS.map((p) => (
            <Link key={p.id} href={`/practice?preset=${p.id}`} className="group">
              <Card className="h-full p-5 transition-colors group-hover:border-signal/50">
                <div className="text-2xl" aria-hidden>
                  {p.emoji}
                </div>
                <p className="mt-3 font-medium">{p.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{p.tagline}</p>
                <p className="mt-4 text-xs text-fg-subtle">
                  {p.scenario.client.country} · {p.scenario.settings.difficulty} · {p.scenario.offer.currency} {p.scenario.offer.price.toLocaleString("en-US")}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Gnani transparency */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Card className="overflow-hidden p-6 sm:p-10">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <Eyebrow>What powers it</Eyebrow>
              <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">Gnani speech models, used for what they&apos;re good at.</h2>
              <ol className="mt-6 space-y-4 text-sm leading-relaxed text-fg-muted">
                <li>
                  <span className="font-medium text-fg">Gnani Prisma v2.5 (speech-to-text).</span> Your answer is recorded in the browser, converted to 16 kHz mono WAV and transcribed by Prisma in
                  your chosen language. Its English model accepts Hindi–English mixed speech.
                </li>
                <li>
                  <span className="font-medium text-fg">Reasoning (separate, swappable).</span> A language model plays the client and writes your coaching report. Gnani Evon v3.3 is open-weight
                  and not yet on Gnani&apos;s API, so ClientReady can run it on your own server or use another configured model. The active one is always shown below.
                </li>
                <li>
                  <span className="font-medium text-fg">Gnani Timbre (text-to-speech).</span> The client speaks with a Timbre English voice. Timbre&apos;s voices are Indian voices, so the
                  client&apos;s nationality comes from the role-play, not a put-on accent.
                </li>
              </ol>
            </div>
            <div className="flex flex-col justify-between gap-6">
              <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-fg-muted" aria-label="Pipeline">
                {["Mic", "Prisma STT", "Reasoning", "Timbre TTS", "Speaker"].map((s, i, a) => (
                  <span key={s} className="flex items-center gap-2">
                    <span className="rounded-md border border-border-strong bg-bg-raised px-2 py-1">{s}</span>
                    {i < a.length - 1 && <ArrowRight className="h-3 w-3" aria-hidden />}
                  </span>
                ))}
              </div>
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-fg-subtle">Live status of this deployment</p>
                <ProviderStatus />
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* Stance */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div className="flex items-start gap-4">
            <Globe className="mt-1 h-6 w-6 shrink-0 text-signal" aria-hidden />
            <div>
              <h2 className="font-display text-3xl leading-tight">Your accent isn&apos;t the problem.</h2>
              <p className="mt-3 leading-relaxed text-fg-muted">
                Research on second-language speech shows heavily accented speech can be fully intelligible (Munro &amp; Derwing, 1995). Clients care about
                whether they understand you and trust your offer. So ClientReady scores structure, clarity, pacing and substance, not how “native” you sound.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <ButtonLink href="/practice" size="lg">
              Start your first session <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <p className="text-sm text-fg-subtle">Takes about 5 minutes.</p>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-fg-subtle sm:flex-row sm:justify-between sm:px-6">
          <p>ClientReady · voice practice for client calls.</p>
          <p>All clients and businesses in scenarios are fictional. Use synthetic data only.</p>
        </div>
      </footer>
    </div>
  );
}
