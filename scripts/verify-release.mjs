import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { releaseSourceHash, bundleHash, validateNativeRelease, validateNativeBuildEvidence } from './release-artifacts.mjs';
import { loadNativeReleaseConfig, nativeBuildOptions, requireDeveloperIdentity } from './native-release-config.mjs';

export function verificationSteps(mode, platform = process.platform) {
  if (!['development', 'release'].includes(mode)) throw new Error('Verification mode must be development or release');
  if (mode === 'release' && platform !== 'darwin') throw new Error('Release verification requires macOS');
  const steps = [
    ['typecheck', ['npm', 'run', 'typecheck']],
    ['unit', ['npm', 'test']],
    ['web-build', ['npm', 'run', 'build']],
    ['web-serving', ['npm', 'run', 'test:web-serving']],
    ['browser', ['npm', 'run', 'e2e']],
  ];
  if (platform === 'darwin') steps.push(
    ['native-midi-parser', ['node', 'scripts/test-native-midi.mjs']],
    ['native-build', ['node', 'scripts/build-native.mjs', ...(mode === 'release' ? ['--release'] : [])]],
    ['native-wkwebview', ['build/native/ConvoCerto.app/Contents/MacOS/ConvoCerto', '--smoke-test']],
    ['native-recovery', ['node', 'scripts/test-native-recovery.mjs']],
    ['native-persistence', ['npm', 'run', 'native:persistence']],
  );
  return steps;
}

function readNativeBuild(mode, config, startedAt) {
  const evidence = JSON.parse(readFileSync('build/native-build-report.json', 'utf8'));
  if (!Number.isFinite(Date.parse(evidence.createdAt)) || Date.parse(evidence.createdAt) < startedAt) {
    throw new Error('Native build evidence is missing its timestamp or predates this verification');
  }
  validateNativeBuildEvidence(evidence, { mode, config, architecture: process.arch === 'x64' ? 'x86_64' : process.arch });
  return evidence;
}

function main() {
  const options = nativeBuildOptions(process.argv.slice(2), process.env);
  const steps = verificationSteps(options.mode);
  const config = loadNativeReleaseConfig();
  if (options.mode === 'release') requireDeveloperIdentity(options.identity);
  const folder = join('verification-results', new Date().toISOString().replaceAll(':', '-'));
  mkdirSync(folder, { recursive: true });
  const report = {
    startedAt: new Date().toISOString(), mode: options.mode, sourceHash: releaseSourceHash(),
    platform: process.platform, architecture: process.arch, steps: [], mechanicalPassed: false,
    saleReady: false, unverified: [
      'live instrumental following quality',
      'physical MIDI instrument and microphone lifecycle',
      'physical printer output and print/save dialog cancellation or permission failures',
      'score edition and redistribution review',
      'willingness to pay and retained usage',
      'purchase, cancellation and support operations',
      'Apple notarization and public distribution',
    ],
  };
  if (process.platform !== 'darwin') report.unverified.push('macOS native verification requires a Mac');
  const save = () => writeFileSync(join(folder, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  save();
  try {
    for (const [name, [command, ...args]] of steps) {
      console.log(`Verifying ${name} (${options.mode})…`);
      const start = Date.now();
      const result = spawnSync(command, args, {
        encoding: 'utf8', timeout: name === 'native-wkwebview' ? 90_000 : 600_000, maxBuffer: 40_000_000,
      });
      writeFileSync(join(folder, `${name}.log`), (result.stdout ?? '') + (result.stderr ?? ''));
      report.steps.push({
        name, passed: result.status === 0, status: result.status, signal: result.signal,
        elapsedMs: Date.now() - start, error: result.error?.message,
      });
      save();
      if (result.status !== 0) throw new Error(`Failed ${name}`);
      if (name === 'web-build') report.bundledNotices = JSON.parse(readFileSync('build/client/notices/bundled-packages.json', 'utf8'));
      if (name === 'native-build') report.nativeBuild = readNativeBuild(options.mode, config, start);
      save();
    }
    if (process.platform === 'darwin') report.nativeBundleHash = bundleHash('build/native/ConvoCerto.app');
    const sourceHash = releaseSourceHash();
    if (sourceHash !== report.sourceHash) throw new Error('Sources changed during release verification');
    report.mechanicalPassed = true;
    if (process.platform === 'darwin') validateNativeRelease(report, sourceHash, report.nativeBundleHash, options.mode);
    report.finishedAt = new Date().toISOString();
    save();
    console.log(`Mechanical checks passed (${options.mode}). Commercial readiness remains unproven. Evidence: ${folder}`);
  } catch (error) {
    report.mechanicalPassed = false;
    report.error = error.message;
    report.finishedAt = new Date().toISOString();
    save();
    throw new Error(`${error.message}; evidence: ${folder}`, { cause: error });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
