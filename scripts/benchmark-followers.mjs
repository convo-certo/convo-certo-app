import { createServer } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { renderComparison } from "./render-follower-comparison.mjs";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--matchmaker")) throw new Error("Usage: node scripts/benchmark-followers.mjs [--matchmaker]");

const server = await createServer({ configFile: false, server: { middlewareMode: true } });
try {
  const { evaluateFollower } = await server.ssrLoadModule("/app/lib/follower-evaluation.ts");
  const { PerformanceFollower } = await server.ssrLoadModule("/app/lib/performance-follower.ts");
  const { SequenceFollower } = await server.ssrLoadModule("/app/lib/sequence-follower.ts");
  const scenarios = [
    { name: "steady", pitches: [60, 62, 64, 65, 67, 69, 71, 72], spacing: 1, milliseconds: 500 },
    { name: "fast-50ms", pitches: [60, 62, 64, 65, 67, 69, 71, 72], spacing: 0.1, milliseconds: 50 },
    { name: "repeated-pitch-drift", pitches: [60, 60, 60, 62, 64, 60, 60, 62], spacing: 1, milliseconds: 500, drift: 1.4 },
    { name: "missing-and-extra", pitches: [60, 62, 64, 65, 67, 69, 71, 72], spacing: 1, milliseconds: 500, missing: 1, extra: true },
    { name: "gradual-slowdown", pitches: [60, 62, 64, 65, 67, 69, 71, 72], spacing: 1, milliseconds: 500, slowdown: 60 },
    { name: "unannounced-backward-jump", pitches: [60, 62, 64, 65, 67, 69, 71, 72], spacing: 1, milliseconds: 500, jump: true },
    { name: "long-breath", pitches: [60, 62, 64, 65, 67, 69, 71, 72], spacing: 1, milliseconds: 500, pauseAfter: 3 },
    { name: "ambiguous-motif-return", pitches: [60, 62, 64, 65, 60, 62, 64, 65], spacing: 1, milliseconds: 500, jump: true },
    { name: "wrong-note-existing-in-score", pitches: [60, 62, 64, 65, 67, 69, 71, 72], spacing: 1, milliseconds: 500, substitution: 2 },
    { name: "sustained-slow-two-beat", pitches: [60, 62, 64, 65, 67, 69, 71, 72, 74, 76], spacing: 2, milliseconds: 2200 },
  ];
  const results = scenarios.map((scenario) => {
    const notes = scenario.pitches.map((pitch, i) => ({ pitch, startBeat: i * scenario.spacing, durationBeats: scenario.spacing * 0.8, velocity: 80, partIndex: 0 }));
    const indices = scenario.jump ? [0, 1, 2, 3, 0, 1, 2, 3] : notes.map((_, i) => i);
    const inputs = indices.flatMap((index, i) => {
      if (index === scenario.missing) return [];
      const timestamp = i * scenario.milliseconds + (scenario.slowdown ?? 0) * i * (i - 1) / 2 + (i > (scenario.pauseAfter ?? Infinity) ? 2200 : 0);
      const substituted = i === scenario.substitution;
      return [{ message: { type: "noteon", note: substituted ? notes[0].pitch : notes[index].pitch, velocity: 80, timestamp }, expectedBeat: timestamp / 500 + (i ? scenario.drift ?? 0 : 0), targetBeat: substituted ? null : notes[index].startBeat }];
    });
    if (scenario.extra) inputs.splice(1, 0, { message: { type: "noteon", note: 99, velocity: 80, timestamp: 200 }, expectedBeat: 0.4, targetBeat: null });
    return { scenario: scenario.name, input: { notes, tempo: 120, inputs }, standard: evaluateFollower(new PerformanceFollower(), notes, 120, inputs), sequence: evaluateFollower(new SequenceFollower(), notes, 120, inputs) };
  });
  const report = { createdAt: new Date().toISOString(), data: "Original synthetic monophonic phrases; no artist recordings or external models", timing: "Follower CPU processing only; excludes device, audio rendering and OS latency", prediction: "Nominal 120 BPM clock, independent of target labels; this is an open-loop component evaluation", results };
  const directory = `verification-results/followers-${report.createdAt.replaceAll(":", "-")}`;
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
  console.table(results.map(({ scenario, standard, sequence }) => ({ scenario, standard: `${standard.correct}/${standard.labeledNotes}`, sequence: `${sequence.correct}/${sequence.labeledNotes}`, standardWrong: standard.wrongPosition + standard.falseMatch, sequenceWrong: sequence.wrongPosition + sequence.falseMatch })));
  console.log(`${directory}/report.json`);
  if (args.includes("--matchmaker")) {
    await new Promise((resolve, reject) => {
      const child = spawn("uv", ["run", "--script", "scripts/benchmark-matchmaker.py", `${directory}/report.json`], { stdio: "inherit", timeout: 600000 });
      child.on("error", reject);
      child.on("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`Matchmaker evaluation failed: ${signal ?? code}; the TypeScript report is preserved at ${directory}/report.json`)));
    });
    await renderComparison(`${directory}/report.json`);
  }
} finally { await server.close(); }
