/**
 * End-to-end smoke test of the real voice pipeline, no browser or mic needed:
 *
 *   learner utterance --Timbre--> WAV --Prisma--> transcript
 *     --reasoning--> client reply --Timbre--> client WAV (saved to disk)
 *
 * Usage:  npm run smoke              (reads .env.local)
 *         npm run smoke -- hinglish
 *
 * Without GNANI_API_KEY it still checks the reasoning provider (Gemini,
 * Claude or OpenAI-compatible) using a typed learner line.
 * Spends roughly 2 Timbre + 1 Prisma requests + 2 LLM calls.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* fall back to the shell environment */
}

async function main() {
  const { GnaniPrismaSTT } = await import("../src/lib/providers/gnani/prisma");
  const { GnaniTimbreTTS } = await import("../src/lib/providers/gnani/timbre");
  const { clientVoice } = await import("../src/lib/providers/gnani/voices");
  const { DEFAULT_SCENARIO } = await import("../src/lib/scenario/presets");
  const { runClientTurn } = await import("../src/lib/sim/engine");
  const { parseScenario } = await import("../src/lib/scenario/schema");
  const { AnthropicReasoning } = await import("../src/lib/providers/reasoning/anthropic");
  const { GeminiReasoning } = await import("../src/lib/providers/reasoning/gemini");
  const { BharatCodeReasoning } = await import("../src/lib/providers/reasoning/bharatcode");
  const { OpenAICompatibleReasoning } = await import("../src/lib/providers/reasoning/openai-compatible");

  const env = process.env;
  const key = env.GNANI_API_KEY?.trim();
  const base = env.GNANI_BASE_URL ?? "https://api.vachana.ai";
  const model = env.GNANI_TTS_MODEL ?? "timbre-v2.5";
  const hinglish = process.argv.includes("hinglish");
  const outDir = path.resolve("tmp/smoke");
  mkdirSync(outDir, { recursive: true });

  const learnerLine = hinglish
    ? "Aapke clinic ke liye main ek AI receptionist banata hoon jo raat ko bhi calls answer karega."
    : "I build an AI receptionist that answers your clinic's calls after hours and books appointments.";
  const scenario = parseScenario({ ...DEFAULT_SCENARIO, learner: { ...DEFAULT_SCENARIO.learner, speechLanguage: hinglish ? "hinglish" : "en" } });

  const geminiKey = env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim();
  const forced = env.REASONING_PROVIDER;
  const reasoner =
    forced === "demo"
      ? null
      : env.BHARATCODE_API_KEY && (!forced || forced === "bharatcode")
        ? new BharatCodeReasoning({
            apiKey: env.BHARATCODE_API_KEY,
            model: env.BHARATCODE_CLIENT_MODEL,
            coachModel: env.BHARATCODE_COACH_MODEL,
          })
      : env.ANTHROPIC_API_KEY && (!forced || forced === "anthropic")
        ? new AnthropicReasoning({
            apiKey: env.ANTHROPIC_API_KEY,
            clientModel: env.ANTHROPIC_CLIENT_MODEL ?? "claude-opus-5-5",
            coachModel: env.ANTHROPIC_COACH_MODEL ?? "claude-opus-5-5",
          })
        : geminiKey && (!forced || forced === "gemini")
          ? new GeminiReasoning({
              apiKey: geminiKey,
              clientModel: env.GEMINI_CLIENT_MODEL ?? "gemini-3.8-flash",
              coachModel: env.GEMINI_COACH_MODEL ?? "gemini-3.8-flash",
              clientThinkingLevel: env.GEMINI_CLIENT_THINKING_LEVEL === "none" ? undefined : (env.GEMINI_CLIENT_THINKING_LEVEL ?? "LOW"),
              coachThinkingLevel: env.GEMINI_COACH_THINKING_LEVEL === "none" ? undefined : env.GEMINI_COACH_THINKING_LEVEL,
            })
          : env.OPENAI_COMPAT_BASE_URL && env.OPENAI_COMPAT_MODEL
            ? new OpenAICompatibleReasoning({
                baseUrl: env.OPENAI_COMPAT_BASE_URL,
                apiKey: env.OPENAI_COMPAT_API_KEY,
                model: env.OPENAI_COMPAT_MODEL,
                label: env.OPENAI_COMPAT_LABEL ?? env.OPENAI_COMPAT_MODEL,
              })
            : null;

  let transcript = learnerLine;
  let t = Date.now();
  if (key) {
    const tts = new GnaniTimbreTTS({ apiKey: key, baseUrl: base, model, timeoutMs: 30_000 });
    const stt = new GnaniPrismaSTT({ apiKey: key, baseUrl: base, timeoutMs: 30_000 });

    console.log(`1. Timbre (${model}) synthesising the learner's line…`);
    const learnerAudio = await tts.synthesize({ text: learnerLine, voice: model === "timbre-v3.0" ? "Avinash" : hinglish ? "Poorvi" : "Pranav", language: hinglish ? "hi-en" : "en-IN" });
    writeFileSync(path.join(outDir, "1-learner.wav"), learnerAudio.audio);
    console.log(`   ✓ ${learnerAudio.audio.byteLength} bytes in ${Date.now() - t} ms`);

    console.log("2. Prisma v2.5 transcribing it (en-IN)…");
    t = Date.now();
    const res = await stt.transcribe({ audio: learnerAudio.audio, mimeType: "audio/wav", languageCode: "en-IN" });
    transcript = res.transcript;
    console.log(`   ✓ "${transcript}" (request ${res.requestId ?? "n/a"}, ${Date.now() - t} ms)`);
  } else {
    console.log("1–2. Skipping Timbre + Prisma: GNANI_API_KEY is not set (create one at https://app.gnani.ai/voice).");
    console.log(`     Using a typed learner line instead: "${learnerLine}"`);
  }

  console.log(`3. Client reasoning via ${reasoner?.label ?? "demo engine (rule-based, not an LLM)"}…`);
  t = Date.now();
  const opening = await runClientTurn(reasoner, scenario, [], null);
  console.log(`   client opened: "${opening.reply}" (${Date.now() - t} ms)`);
  t = Date.now();
  const turns = [
    { index: 0, role: "client" as const, text: opening.reply, source: "model" as const },
    { index: 1, role: "learner" as const, text: transcript, source: key ? ("prisma" as const) : ("typed" as const), audioSeconds: key ? 6 : undefined },
  ];
  const reply = await runClientTurn(reasoner, scenario, turns, opening.state);
  if (reply.learnerEnglish) console.log(`   English rendering: "${reply.learnerEnglish}"`);
  console.log(`   ✓ client replied: "${reply.reply}" (${Date.now() - t} ms, interest ${reply.state.interest})`);

  if (key) {
    console.log("4. Timbre speaking the client's reply…");
    t = Date.now();
    const tts = new GnaniTimbreTTS({ apiKey: key, baseUrl: base, model, timeoutMs: 30_000 });
    const voice = clientVoice(model, scenario.client.voiceGender, scenario.client.name.length);
    const clientAudio = await tts.synthesize({ text: reply.reply, voice, language: "en-IN" });
    const out = path.join(outDir, "2-client-reply.wav");
    writeFileSync(out, clientAudio.audio);
    console.log(`   ✓ ${clientAudio.audio.byteLength} bytes, voice ${voice}, ${Date.now() - t} ms → ${out}`);
    console.log("\nFull pipeline OK. Play the files in tmp/smoke/ to hear both sides.");
  } else {
    console.log("\nReasoning OK. Add GNANI_API_KEY to .env.local to test the full voice pipeline.");
    process.exitCode = reasoner ? 0 : 2;
  }
}

main().catch((e) => {
  console.error(`✗ ${e?.code ?? "error"}: ${e?.message ?? e}`);
  process.exit(1);
});
