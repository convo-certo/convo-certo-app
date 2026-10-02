import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (process.platform !== 'darwin') throw new Error('Native persistence verification requires macOS');
const osVersion = Number(execFileSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8' }).split('.')[0]);
if (osVersion < 14) throw new Error('Isolated persistent WebKit profiles require macOS 14 or later; normal app support remains macOS 13+');
const directory = mkdtempSync(join(tmpdir(), 'convocerto-persistence-'));
const profile = randomUUID().toUpperCase();
const app = join(directory, 'PersistenceTest.app/Contents');
const executable = join(app, 'MacOS/PersistenceTest');
const fixture = join(directory, 'web');
const report = { startedAt: new Date().toISOString(), platform: process.platform, architecture: process.arch, osVersion, writeSettleMilliseconds: 1000, passed: false, results: [] };
const evidence = join('verification-results', `native-persistence-${report.startedAt.replaceAll(':', '-')}`);
mkdirSync(evidence, { recursive: true });
const run = stage => new Promise((resolve, reject) => {
  const child = spawn(executable, [profile, stage, fixture], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  const timeout = setTimeout(() => child.kill('SIGTERM'), 45000);
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  child.on('error', error => { clearTimeout(timeout); reject(error); });
  child.on('exit', code => {
    clearTimeout(timeout);
    const result = stdout.trim().split('\n').map(line => { try { return JSON.parse(line); } catch { return null; } }).find(value => typeof value?.passed === 'boolean');
    if (code !== 0 || !result) reject(new Error(`Persistence ${stage} failed: ${JSON.stringify({ code, stdout, stderr })}`));
    else { report.results.push(result); console.log(JSON.stringify(result)); resolve(result); }
  });
});
let compiled = false;
let blocker;
try {
  mkdirSync(join(app, 'MacOS'), { recursive: true });
  mkdirSync(fixture);
  writeFileSync(join(app, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>PersistenceTest</string><key>CFBundleIdentifier</key><string>tech.gawatech.convocerto.persistence-harness.${profile}</string><key>CFBundlePackageType</key><string>APPL</string><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict></dict></plist>`);
  writeFileSync(join(fixture, 'index.html'), '<!doctype html><title>Isolated persistence verification</title><script src="/fixture.js"></script>');
  writeFileSync(join(fixture, 'fixture.js'), readFileSync('native/tests/Persistence/fixture.js'));
  execFileSync('swiftc', ['-swift-version', '5', 'native/ConvoCerto/LocalServer.swift', 'native/tests/Persistence/main.swift', '-o', executable], { stdio: 'inherit' });
  execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', join(directory, 'PersistenceTest.app')], { stdio: 'inherit' });
  compiled = true;
  const first = await run('write');
  if (!first.passed || !first.port) throw new Error('Initial isolated write failed');
  const second = await run('read');
  if (!second.passed || second.port !== first.port) throw new Error('Second process failed to restore the same origin and data');
  blocker = createServer();
  await new Promise((resolve, reject) => { blocker.once('error', reject); blocker.listen(first.port, '127.0.0.1', resolve); });
  const conflict = await run('read');
  if (conflict.passed || conflict.stage !== 'server' || conflict.port !== first.port) throw new Error('Occupied port must fail without switching origins');
  await new Promise(resolve => blocker.close(resolve));
  blocker = undefined;
  const recovered = await run('read');
  if (!recovered.passed || recovered.port !== first.port) throw new Error('Data did not survive recovery from an occupied port');
  Object.assign(report, { separateAppProcesses: 4, stablePort: first.port, retainedLibrary: true, retainedHistory: true, occupiedPortRejected: true, isolatedProfile: true });
} catch (error) {
  report.error = String(error);
  throw error;
} finally {
  try {
    if (blocker) await new Promise(resolve => blocker.close(resolve));
    if (compiled) {
      const cleanup = await run('cleanup');
      if (!cleanup.passed) throw new Error(`Isolated test cleanup failed; profile ${profile}`);
    }
    report.passed = compiled && !report.error;
  } catch (error) {
    report.error = `${report.error ?? ''} ${error}`.trim();
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    rmSync(directory, { recursive: true, force: true });
  }
}
console.log(`Native persistence verified. Evidence: ${evidence}`);
