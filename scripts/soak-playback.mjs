import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { releaseSourceHash } from './release-artifacts.mjs';

const seconds = Number(process.argv[2] ?? 1800);
if (!Number.isInteger(seconds) || seconds < 20 || seconds > 7200) throw new Error('Duration must be 20–7200 real seconds');
const url = process.argv[3] ?? 'http://localhost:5188/perform';
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Use a local app server');
const directory = `verification-results/soak-${new Date().toISOString().replaceAll(':', '-')}`;
mkdirSync(directory, { recursive: true });
const report = {
  startedAt: new Date().toISOString(), status: 'running', requestedSeconds: seconds, pid: process.pid,
  sourceHash: releaseSourceHash(), url, browser: '',
  scoreSHA256: createHash('sha256').update(readFileSync('public/scores/sample-duet.musicxml')).digest('hex'),
  scope: 'Real-time Chromium MusicXML loop playback; no human performance, MIDI device, microphone, speaker measurement or native WKWebView soak',
  samples: [], errors: [],
};
const save = () => writeFileSync(`${directory}/report.json`, JSON.stringify(report, null, 2));
save();
console.log(`Soak report: ${directory}/report.json`);
let browser;
try {
  browser = await chromium.launch();
  report.browser = browser.version();
  const page = await browser.newPage();
  page.on('pageerror', error => { report.errors.push(error.message); save(); });
  page.on('crash', () => { report.errors.push('Browser page crashed'); save(); });
  await page.addInitScript(() => {
    const active = new Set();
    const contexts = new Set();
    let started = 0, peak = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      const result = start.apply(this, args);
      contexts.add(this.context);
      active.add(this); started++; peak = Math.max(peak, active.size);
      this.addEventListener('ended', () => active.delete(this), { once: true });
      return result;
    };
    window.convoSoakSample = () => ({
      started, active: active.size, peak,
      contexts: [...contexts].map(context => ({ state: context.state, time: context.currentTime })),
      heapBytes: performance.memory?.usedJSHeapSize ?? null,
    });
  });
  await page.goto(url);
  await page.getByLabel('MusicXMLで演奏する', { exact: true }).setInputFiles('public/scores/sample-duet.musicxml');
  const entry = page.getByRole('button', { name: '自分の入りから吹く', exact: true });
  await entry.waitFor();
  await entry.click();
  await page.waitForFunction(() => window.convoSoakSample().started > 0);
  const origin = performance.now();
  const sample = async () => {
    const audio = await page.evaluate(() => window.convoSoakSample());
    return { elapsedSeconds: (performance.now() - origin) / 1000, ...audio,
      beat: Number(await page.getByLabel('演奏位置', { exact: true }).inputValue()),
      statusText: await page.locator('.status-pill').innerText() };
  };
  report.samples.push(await sample()); save();
  while ((performance.now() - origin) / 1000 < seconds) {
    await new Promise(resolve => setTimeout(resolve, Math.min(10000, seconds * 1000 - (performance.now() - origin))));
    const next = await sample(), previous = report.samples.at(-1);
    report.samples.push(next); save();
    if (report.errors.length) throw new Error(report.errors.join('; '));
    if (next.contexts.length !== 1 || next.contexts[0].state !== 'running') throw new Error('Playback AudioContext unavailable');
    const elapsed = next.elapsedSeconds - previous.elapsedSeconds;
    if (elapsed > 2 && next.contexts[0].time - previous.contexts[0].time < elapsed * 0.8) throw new Error('Audio clock stalled or fell behind wall time');
    if (elapsed >= 9 && next.started <= previous.started) throw new Error('No new sample source started during loop playback');
    if (next.peak > 64 || !Number.isFinite(next.beat)) throw new Error('Unbounded voices or invalid playback position');
    console.log(`${next.elapsedSeconds.toFixed(0)}s: ${next.started} source starts, ${next.active} active, beat ${next.beat}`);
  }
  await page.getByRole('button', { name: '■ 停止', exact: true }).click();
  await page.waitForFunction(() => window.convoSoakSample().active === 0, undefined, { timeout: 5000 });
  report.afterStop = await sample();
  if (report.afterStop.statusText !== '準備完了' || report.afterStop.beat !== 0) throw new Error('Stop did not reset playback');
  if (releaseSourceHash() !== report.sourceHash) throw new Error('Sources changed during soak');
  report.status = 'passed'; report.finishedAt = new Date().toISOString(); save();
  console.log(`Passed ${seconds}s playback soak: ${directory}/report.json`);
} catch (error) {
  report.status = 'failed'; report.error = String(error); report.finishedAt = new Date().toISOString(); save();
  throw error;
} finally { await browser?.close(); }
