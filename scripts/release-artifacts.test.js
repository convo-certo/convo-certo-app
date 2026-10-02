import { expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, symlinkSync, unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bundleHash, nativePackageOptions, nativeReleaseGates, validateBundleConfiguration, validateDmgSignatureDetails, validateNativeBuildEvidence, validateNativeRelease } from './release-artifacts.mjs';

const config = { version: '0.1.0', build: '1', minimumOS: '13.0', bundleID: 'tech.gawatech.convocerto.preview' };
const sourceHash = 'a'.repeat(64), appHash = 'b'.repeat(64), changedHash = 'c'.repeat(64);
const identity = 'Developer ID Application: Example Team (ABCDEFGHIJ)';
const buildEvidence = (mode = 'development') => ({
  mode, config: { ...config }, architecture: 'arm64', buildPassed: true, signatureVerified: true,
  developerIDSigned: mode === 'release', hardenedRuntime: mode === 'release', secureTimestamp: mode === 'release',
  ...(mode === 'release' ? { teamIdentifier: 'ABCDEFGHIJ' } : {}), notarized: false, publicReleaseReady: false,
});
const verifiedReport = (mode = 'development') => ({
  mode, mechanicalPassed: true, platform: 'darwin', sourceHash, nativeBundleHash: appHash, nativeBuild: buildEvidence(mode),
  steps: nativeReleaseGates.map(name => ({ name, passed: true, status: 0 })),
});

test('bundle evidence detects bytes, permissions, empty directories and link targets', () => {
  const root = mkdtempSync(join(tmpdir(), 'convocerto-hash-'));
  try {
    writeFileSync(join(root, 'app'), 'first');
    const first = bundleHash(root);
    writeFileSync(join(root, 'app'), 'other');
    expect(bundleHash(root)).not.toBe(first);
    const second = bundleHash(root);
    chmodSync(join(root, 'app'), 0o700);
    expect(bundleHash(root)).not.toBe(second);
    const third = bundleHash(root);
    mkdirSync(join(root, 'empty'));
    expect(bundleHash(root)).not.toBe(third);
    symlinkSync('app', join(root, 'link'));
    const linked = bundleHash(root);
    unlinkSync(join(root, 'link')); symlinkSync('empty', join(root, 'link'));
    expect(bundleHash(root)).not.toBe(linked);
    expect(bundleHash(root)).toBe(bundleHash(root));
  } finally { rmSync(root, {recursive:true,force:true}); }
});

test('source evidence includes release metadata, build and deployment configuration, and score candidate data', () => {
  const root = mkdtempSync(join(tmpdir(), 'convocerto-source-hash-'));
  const moduleURL = pathToFileURL(resolve('scripts/release-artifacts.mjs')).href;
  const hash = () => execFileSync(process.execPath, ['--input-type=module', '-e', `import { releaseSourceHash } from ${JSON.stringify(moduleURL)}; process.stdout.write(releaseSourceHash());`], { cwd: root, encoding: 'utf8' });
  try {
    execFileSync('git', ['init', '--quiet', root]);
    const fixtures = [
      ['release.config.json', JSON.stringify(config), JSON.stringify({ ...config, build: '2' })],
      ['react-router.config.ts', 'export default { ssr: false };', 'export default { ssr: true };'],
      ['Dockerfile', 'FROM node:22\n', 'FROM node:24\n'],
      ['.dockerignore', 'node_modules\n', 'node_modules\nbuild\n'],
      ['fly.toml', 'app = "preview"\n', 'app = "production"\n'],
      ['docs/research/pdmx-wind-candidates.json', '[]\n', '[{"id":"candidate"}]\n'],
    ];
    for (const [path, initial] of fixtures) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), initial);
    }
    let previous = hash();
    for (const [path, , changed] of fixtures) {
      writeFileSync(join(root, path), changed);
      const current = hash();
      expect(current, `${path} must affect release evidence`).not.toBe(previous);
      previous = current;
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('packaging rejects failed, incomplete, stale and replaced build evidence', () => {
  const report = verifiedReport();
  const validate = value => validateNativeRelease(value, sourceHash, appHash, 'development');
  expect(() => validate(report)).not.toThrow();
  for (const invalid of [{ mechanicalPassed: false }, { platform: 'linux' }, { steps: null }, { nativeBuild: undefined }, { nativeBundleHash: undefined }]) expect(() => validate({ ...report, ...invalid })).toThrow();
  expect(() => validateNativeRelease(report, changedHash, appHash, 'development')).toThrow('Sources changed');
  expect(() => validateNativeRelease(report, sourceHash, changedHash, 'development')).toThrow('Native bundle differs');
  expect(() => validateNativeRelease(report, 'source', appHash, 'development')).toThrow('SHA-256');
  expect(() => validateNativeRelease(report, sourceHash, undefined, 'development')).toThrow('SHA-256');
});

test('all release gates, including serving and persistence, must pass exactly once', () => {
  const report = verifiedReport();
  expect(nativeReleaseGates).toContain('web-serving');
  expect(nativeReleaseGates).toContain('native-persistence');
  for (const gate of nativeReleaseGates) {
    const removed = report.steps.filter(step => step.name !== gate);
    expect(() => validateNativeRelease({ ...report, steps: removed }, sourceHash, appHash, 'development')).toThrow('complete Mac release verification');
  }
  for (const steps of [[...report.steps, report.steps[0]], [...report.steps, { name: 'additional', passed: false, status: 1 }], report.steps.map((step, index) => index === 0 ? { ...step, status: 1 } : step)]) expect(() => validateNativeRelease({ ...report, steps }, sourceHash, appHash, 'development')).toThrow();
});

test('release and development evidence cannot be interchanged or selected implicitly', () => {
  const development = verifiedReport(), release = verifiedReport('release');
  expect(() => validateNativeRelease(development, sourceHash, appHash)).toThrow('mode');
  expect(() => validateNativeRelease(development, sourceHash, appHash, 'release')).toThrow('mode');
  expect(() => validateNativeRelease(release, sourceHash, appHash, 'development')).toThrow('mode');
  expect(() => validateNativeRelease(release, sourceHash, appHash, 'release')).not.toThrow();
  expect(() => validateNativeRelease({ ...development, mode: 'release' }, sourceHash, appHash, 'release')).toThrow('build evidence');
  expect(() => validateNativeRelease({ ...development, mode: 'release', nativeBuild: { ...development.nativeBuild, mode: 'release' } }, sourceHash, appHash, 'release')).toThrow('Developer ID');
});

test('native build evidence binds successful signing to the expected configuration and architecture', () => {
  const evidence = buildEvidence();
  const options = { mode: 'development', config, architecture: 'arm64' };
  expect(validateNativeBuildEvidence(evidence, options)).toEqual(config);
  expect(() => validateNativeBuildEvidence(evidence)).toThrow('mode');
  for (const invalid of [{ buildPassed: false }, { signatureVerified: false }, { architecture: 'universal' }, { architecture: 'x86_64' }, { developerIDSigned: true }, { teamIdentifier: 'ABCDEFGHIJ' }, { hardenedRuntime: undefined }, { secureTimestamp: undefined }, { notarized: true }, { publicReleaseReady: true }]) expect(() => validateNativeBuildEvidence({ ...evidence, ...invalid }, options)).toThrow();
  for (const invalid of [{ version: '0.2.0' }, { build: '2' }, { minimumOS: '14.0' }, { bundleID: 'other.app' }]) expect(() => validateNativeBuildEvidence({ ...evidence, config: { ...config, ...invalid } }, options)).toThrow('configuration');
  expect(() => validateNativeBuildEvidence({ ...evidence, config: { ...config, unknown: true } }, options)).toThrow();
});

test('release evidence cannot omit signature protections or invent notarization', () => {
  const evidence = buildEvidence('release');
  const options = { mode: 'release', config, architecture: 'arm64' };
  expect(validateNativeBuildEvidence(evidence, options)).toEqual(config);
  for (const invalid of [{ developerIDSigned: false }, { hardenedRuntime: false }, { secureTimestamp: false }, { teamIdentifier: undefined }, { teamIdentifier: 'not set' }, { notarized: undefined }, { publicReleaseReady: true }]) expect(() => validateNativeBuildEvidence({ ...evidence, ...invalid }, options)).toThrow();
});

test('package arguments keep development as the default and require an explicit release identity', () => {
  const path = 'verification-results/run/report.json';
  const env = { CONVOCERTO_SIGNING_IDENTITY: identity };
  expect(nativePackageOptions([path], env)).toEqual({ mode: 'development', verificationPath: path });
  expect(nativePackageOptions(['--release', path], env)).toEqual({ mode: 'release', identity, verificationPath: path });
  expect(nativePackageOptions([path, '--release'], env).mode).toBe('release');
  expect(() => nativePackageOptions(['--release', path])).toThrow('CONVOCERTO_SIGNING_IDENTITY');
  for (const args of [[], [''], [' '], ['--release'], [path, path], ['--relese', path], ['-r', path], ['--release', '--release'], ['--release', '--release', path], [null]]) expect(() => nativePackageOptions(args, env)).toThrow();
});

test('actual bundle metadata must match each release configuration field', () => {
  const plist = { CFBundleIdentifier: config.bundleID, CFBundleShortVersionString: config.version, CFBundleVersion: config.build, LSMinimumSystemVersion: config.minimumOS };
  expect(validateBundleConfiguration(plist, config)).toEqual(config);
  for (const key of Object.keys(plist)) {
    expect(() => validateBundleConfiguration({ ...plist, [key]: 'different' }, config)).toThrow('Info.plist');
    expect(() => validateBundleConfiguration({ ...plist, [key]: undefined }, config)).toThrow('Info.plist');
  }
});

test('signed DMG metadata must match the app team and have a secure timestamp', () => {
  const bundleID = config.bundleID + '.dmg';
  const options = { bundleID, expectedTeamIdentifier: 'ABCDEFGHIJ' };
  const details = `Identifier=${bundleID}\nAuthority=${identity}\nAuthority=Developer ID Certification Authority\nAuthority=Apple Root CA\nTimestamp=Sep 30, 2026 at 12:00:00\nTeamIdentifier=ABCDEFGHIJ\n`;
  expect(validateDmgSignatureDetails(details, options)).toEqual({ developerIDSigned: true, teamIdentifier: 'ABCDEFGHIJ', secureTimestamp: true });
  for (const invalid of [details.replace(bundleID, 'other.dmg'), details.replace('TeamIdentifier=ABCDEFGHIJ', 'TeamIdentifier=1234567890'), details.replace(identity, 'Apple Development: Example Team (ABCDEFGHIJ)'), details.replace(identity, 'Developer ID Application: Other Team (1234567890)'), details.replace('Timestamp=', 'Signed Time='), details.replace('Timestamp=Sep 30, 2026 at 12:00:00', 'Timestamp=none'), details + 'Timestamp=Sep 30, 2026 at 12:00:00\n', details + 'Signature=adhoc\n']) expect(() => validateDmgSignatureDetails(invalid, options)).toThrow();
  expect(() => validateDmgSignatureDetails(details, { bundleID })).toThrow('app signature team');
});
