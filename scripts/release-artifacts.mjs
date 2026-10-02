import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, readlinkSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { nativeBuildOptions, validateNativeReleaseConfig } from './native-release-config.mjs';

export function releaseSourceHash() {
  const files = execFileSync('git', ['ls-files','-z','--cached','--others','--exclude-standard','--','app','public','native','scripts','e2e','release.config.json','package.json','package-lock.json','playwright.config.ts','react-router.config.ts','vite.config.ts','tsconfig.json','Dockerfile','.dockerignore','fly.toml','docs/research/pdmx-wind-candidates.json'], {maxBuffer:20_000_000}).toString().split('\0').filter(Boolean).sort();
  const digest = createHash('sha256');
  for (const path of files) { digest.update(path); digest.update('\0'); digest.update(readFileSync(path)); }
  return digest.digest('hex');
}

export function bundleHash(root) {
  const digest = createHash('sha256');
  const visit = (relative) => {
    const path = join(root, relative), stat = lstatSync(path);
    const type = stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : null;
    if (!type) throw new Error(`Unsupported bundle entry: ${relative}`);
    digest.update(JSON.stringify([relative, type, stat.mode & 0o777]));
    if (type === 'directory') for (const name of readdirSync(path).sort()) visit(relative ? `${relative}/${name}` : name);
    else if (type === 'link') digest.update(JSON.stringify(readlinkSync(path)));
    else digest.update(createHash('sha256').update(readFileSync(path)).digest());
  };
  visit('');
  return digest.digest('hex');
}

export const nativeReleaseGates = Object.freeze(['typecheck', 'unit', 'web-build', 'web-serving', 'browser', 'native-midi-parser', 'native-build', 'native-wkwebview', 'native-recovery', 'native-persistence']);

export function validateNativeBuildEvidence(evidence, { mode, config, architecture } = {}) {
  if (!['development', 'release'].includes(mode)) throw new Error('An explicit native distribution mode is required');
  if (!evidence || evidence.mode !== mode || evidence.buildPassed !== true || evidence.signatureVerified !== true) throw new Error('Successful native build evidence for the selected mode is required');
  const actualConfig = validateNativeReleaseConfig(evidence.config);
  if (config) {
    const expectedConfig = validateNativeReleaseConfig(config);
    if (Object.keys(expectedConfig).some(key => actualConfig[key] !== expectedConfig[key])) throw new Error('Native build configuration differs from the current release configuration');
  }
  if (!['arm64', 'x86_64'].includes(evidence.architecture) || architecture != null && evidence.architecture !== architecture) throw new Error('Native build architecture differs from the expected architecture');
  if (evidence.notarized !== false || evidence.publicReleaseReady !== false) throw new Error('This build evidence must not claim notarization or public release readiness');
  if (typeof evidence.hardenedRuntime !== 'boolean' || typeof evidence.secureTimestamp !== 'boolean') throw new Error('Native signature protection metadata is missing');
  if (mode === 'release') {
    if (evidence.developerIDSigned !== true || evidence.hardenedRuntime !== true || evidence.secureTimestamp !== true || !/^[A-Z0-9]{10}$/.test(evidence.teamIdentifier ?? '')) throw new Error('Release build evidence must confirm Developer ID, TeamIdentifier, Hardened Runtime and a secure timestamp');
  } else if (evidence.developerIDSigned !== false || evidence.teamIdentifier != null) throw new Error('Development build evidence must describe an ad hoc signature');
  return actualConfig;
}

export function validateNativeRelease(report, sourceHash, appHash, mode) {
  if (!['development', 'release'].includes(mode) || report?.mode !== mode) throw new Error('Verification mode must match the explicit native distribution mode');
  if (!/^[a-f0-9]{64}$/.test(sourceHash ?? '') || !/^[a-f0-9]{64}$/.test(appHash ?? '')) throw new Error('Current source and native bundle SHA-256 hashes are required');
  if (report?.mechanicalPassed !== true || report.platform !== 'darwin' || !Array.isArray(report.steps)
    || report.steps.some(step => step.passed !== true || step.status !== 0)
    || !nativeReleaseGates.every(name => report.steps.filter(step => step.name === name).length === 1)) throw new Error('A successful complete Mac release verification is required');
  if (report.sourceHash !== sourceHash) throw new Error('Sources changed since verification; run npm run verify:release again');
  if (!report.nativeBundleHash || report.nativeBundleHash !== appHash) throw new Error('Native bundle differs from the verified app; run npm run verify:release again');
  validateNativeBuildEvidence(report.nativeBuild, { mode });
}

export function nativePackageOptions(args = [], env = {}) {
  if (!Array.isArray(args) || args.length < 1 || args.length > 2) throw new Error('Usage: node scripts/package-native.mjs [--release] verification-results/<run>/report.json');
  const flags = args.filter(arg => arg === '--release');
  const paths = args.filter(arg => typeof arg === 'string' && !arg.startsWith('-'));
  if (flags.length > 1 || paths.length !== 1 || !paths[0].trim() || flags.length + paths.length !== args.length) throw new Error('A single verification report and optional --release flag are required');
  return { ...nativeBuildOptions(flags, env), verificationPath: paths[0] };
}

export function validateBundleConfiguration(plist, value) {
  const config = validateNativeReleaseConfig(value);
  const fields = { CFBundleIdentifier: 'bundleID', CFBundleShortVersionString: 'version', CFBundleVersion: 'build', LSMinimumSystemVersion: 'minimumOS' };
  if (!plist || Object.entries(fields).some(([key, field]) => plist[key] !== config[field])) throw new Error('App Info.plist differs from the current release configuration');
  return config;
}

export function validateDmgSignatureDetails(details, { bundleID, expectedTeamIdentifier } = {}) {
  if (typeof bundleID !== 'string' || !bundleID || !/^[A-Z0-9]{10}$/.test(expectedTeamIdentifier ?? '')) throw new Error('DMG verification requires an identifier and the app signature team');
  const field = name => {
    const matches = [...String(details).matchAll(new RegExp(`^${name}=(.*)$`, 'gm'))];
    return matches.length === 1 ? matches[0][1].trim() : undefined;
  };
  const authorities = [...String(details).matchAll(/^Authority=(.*)$/gm)].map(match => match[1].trim());
  if (field('Identifier') !== bundleID || field('TeamIdentifier') !== expectedTeamIdentifier || field('Signature') === 'adhoc'
    || !/^Developer ID Application: .+ \([A-Z0-9]{10}\)$/.test(authorities[0] ?? '') || !authorities[0].endsWith(`(${expectedTeamIdentifier})`)) throw new Error('DMG signature must use the app Developer ID team and the expected identifier');
  const timestamp = field('Timestamp');
  if (!timestamp || ['none', 'not set', '0'].includes(timestamp.toLowerCase())) throw new Error('DMG signature requires a secure timestamp');
  return { developerIDSigned: true, teamIdentifier: expectedTeamIdentifier, secureTimestamp: true };
}
