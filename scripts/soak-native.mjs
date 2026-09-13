import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bundleHash, releaseSourceHash } from './release-artifacts.mjs';

const seconds = Number(process.argv[2] ?? 1800);
if (process.platform !== 'darwin' || !Number.isInteger(seconds) || seconds < 20 || seconds > 7200) throw new Error('Use macOS and a duration of 20–7200 seconds');
const app = resolve('build/native/ConvoCerto.app');
const directory = `verification-results/native-soak-${new Date().toISOString().replaceAll(':', '-')}`;
mkdirSync(directory, { recursive: true });
const report = { startedAt: new Date().toISOString(), status: 'running', requestedSeconds: seconds,
  sourceHash: releaseSourceHash(), nativeBundleHash: bundleHash(app), samples: [], result: null };
const save = () => writeFileSync(`${directory}/report.json`, JSON.stringify(report, null, 2));
save(); console.log(`${directory}/report.json`);
const child = spawn(`${app}/Contents/MacOS/ConvoCerto`, ['--soak-test', '--soak-seconds', String(seconds)], { stdio: ['ignore', 'pipe', 'pipe'] });
report.pid = child.pid; save();
let pending = '', timedOut = false;
const timeout = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, (seconds + 90) * 1000);
child.stderr.on('data', data => appendFileSync(`${directory}/stderr.log`, data));
child.stdout.on('data', data => {
  appendFileSync(`${directory}/stdout.log`, data); pending += data;
  let end;
  while ((end = pending.indexOf('\n')) >= 0) {
    const line = pending.slice(0, end); pending = pending.slice(end + 1);
    let event; try { event = JSON.parse(line); } catch { continue; }
    if (event.progress === 'soak-sample') {
      report.samples.push(event.sample);
      console.log(`${event.sample.elapsedSeconds.toFixed(0)}s: ${event.sample.started} starts, ${event.sample.active} active`);
    }
    if (typeof event.passed === 'boolean') report.result = event;
    save();
  }
});
try {
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  report.exitCode = code;
  if (timedOut || code !== 0 || report.result?.passed !== true || report.result.elapsedSeconds < seconds || report.result.beforeStop.active <= 0 || report.result.afterStop.active !== 0) throw new Error(report.result?.error ?? 'Native soak did not finish successfully');
  if (releaseSourceHash() !== report.sourceHash || bundleHash(app) !== report.nativeBundleHash) throw new Error('Sources or app changed during native soak');
  report.status = 'passed'; report.finishedAt = new Date().toISOString(); save();
  console.log(`Passed ${seconds}s native soak: ${directory}/report.json`);
} catch (error) {
  report.status = 'failed'; report.error = String(error); report.finishedAt = new Date().toISOString(); save(); throw error;
} finally { clearTimeout(timeout); }
