import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configKeys = ['build', 'bundleID', 'minimumOS', 'version'];
const releaseEntitlements = ['com.apple.security.device.audio-input', 'com.apple.security.device.camera'];
const developerIDRequirement = 'anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists';

export function validateNativeReleaseConfig(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).sort().join(',') !== configKeys.join(',')) throw new Error('Release config must contain only version, build, minimumOS and bundleID');
  if (typeof value.version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value.version)) throw new Error('Release version must contain three numeric components');
  if (typeof value.build !== 'string' || !/^[1-9]\d{0,3}$/.test(value.build)) throw new Error('Release build must be an integer string from 1 to 9999');
  if (typeof value.minimumOS !== 'string' || !/^[1-9]\d*\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?$/.test(value.minimumOS) || Number(value.minimumOS.split('.')[0]) < 13) throw new Error('Minimum macOS version must be 13.0 or later');
  if (typeof value.bundleID !== 'string' || value.bundleID.length > 255 || !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(value.bundleID)) throw new Error('Release bundleID must be a reverse-DNS identifier');
  return Object.freeze({ version: value.version, build: value.build, minimumOS: value.minimumOS, bundleID: value.bundleID });
}

export function loadNativeReleaseConfig(path = resolve(dirname(fileURLToPath(import.meta.url)), '../release.config.json')) {
  return validateNativeReleaseConfig(JSON.parse(readFileSync(path, 'utf8')));
}

export const nativePermissionStrings = Object.freeze({
  en: { NSMicrophoneUsageDescription: 'ConvoCerto uses the microphone to follow your instrument and keep the accompaniment with you.', NSCameraUsageDescription: 'ConvoCerto uses the camera to read your nods as cues while you play.' },
  ja: { NSMicrophoneUsageDescription: '楽器の演奏に伴奏を合わせるためにマイクを使います。', NSCameraUsageDescription: '演奏中のうなずきを合図として使います。' },
});

export function nativeInfoPlist(value) {
  const config = validateNativeReleaseConfig(value);
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>ConvoCerto</string><key>CFBundleIdentifier</key><string>${config.bundleID}</string><key>CFBundleName</key><string>ConvoCerto</string><key>CFBundleIconFile</key><string>ConvoCerto.icns</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleDevelopmentRegion</key><string>en</string><key>CFBundleLocalizations</key><array><string>en</string><string>ja</string></array><key>LSMinimumSystemVersion</key><string>${config.minimumOS}</string><key>CFBundleVersion</key><string>${config.build}</string><key>CFBundleShortVersionString</key><string>${config.version}</string><key>NSMicrophoneUsageDescription</key><string>${nativePermissionStrings.en.NSMicrophoneUsageDescription}</string><key>NSCameraUsageDescription</key><string>${nativePermissionStrings.en.NSCameraUsageDescription}</string><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict></dict></plist>`;
}

export function nativeBuildOptions(args = [], env = {}) {
  if (!Array.isArray(args) || args.length > 1 || args.some(arg => arg !== '--release')) throw new Error('Usage: node scripts/build-native.mjs [--release]');
  if (args.length === 0) return { mode: 'development' };
  const identity = env.CONVOCERTO_SIGNING_IDENTITY;
  if (typeof identity !== 'string' || !identity.trim()) throw new Error('Release signing requires CONVOCERTO_SIGNING_IDENTITY; no development-signature fallback is available');
  if (identity !== identity.trim() || (!/^[A-Fa-f0-9]{40}$/.test(identity) && !/^Developer ID Application: [^\r\n\0]+ \([A-Z0-9]{10}\)$/.test(identity))) throw new Error('Signing identity must be a full Developer ID Application name or a 40-character certificate fingerprint');
  return { mode: 'release', identity };
}

export function selectDeveloperIdentity(identity, inventory) {
  const identities = [...String(inventory).matchAll(/^\s*\d+\)\s+([A-Fa-f0-9]{40})\s+"(Developer ID Application: [^\r\n]+ \(([A-Z0-9]{10})\))"\s*$/gm)]
    .map(([, fingerprint, name, teamIdentifier]) => ({ fingerprint: fingerprint.toUpperCase(), name, teamIdentifier }));
  const matches = identities.filter(item => item.name === identity || item.fingerprint === identity?.toUpperCase());
  const distinct = [...new Map(matches.map(item => [item.fingerprint, item])).values()];
  if (distinct.length !== 1) throw new Error('The requested valid Developer ID Application identity is unavailable or ambiguous in the active keychains');
  return distinct[0];
}

function capture(command, args, description, input) {
  const result = spawnSync(command, args, { encoding: 'utf8', input, maxBuffer: 4_000_000, timeout: 120000 });
  if (result.status !== 0) throw new Error(description);
  return result;
}

export function requireDeveloperIdentity(identity) {
  const result = capture('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'], 'Could not inspect the active code-signing identities');
  return selectDeveloperIdentity(identity, result.stdout);
}

export function nativeSigningArguments(mode, identity, appPath, entitlementsPath) {
  if (mode === 'development') return ['--force', '--sign', '-', appPath];
  if (mode !== 'release' || !/^[A-Fa-f0-9]{40}$/.test(identity?.fingerprint ?? '') || !/^[A-Z0-9]{10}$/.test(identity?.teamIdentifier ?? '') || typeof entitlementsPath !== 'string' || !entitlementsPath) throw new Error('Release signing requires a verified Developer ID identity and entitlements');
  return ['--force', '--sign', identity.fingerprint, '--options', 'runtime', '--timestamp', '--entitlements', entitlementsPath, appPath];
}

export function validateReleaseEntitlements(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== releaseEntitlements.join(',') || releaseEntitlements.some(key => value[key] !== true)) throw new Error('Release entitlements must contain only audio-input and camera, both enabled');
  return true;
}

export function validateNativeSignatureDetails(details, { mode, bundleID, expectedTeamIdentifier } = {}) {
  if (!['development', 'release'].includes(mode) || typeof bundleID !== 'string' || !bundleID) throw new Error('Native signature verification requires an explicit mode and bundleID');
  const field = name => {
    const matches = [...String(details).matchAll(new RegExp(`^${name}=(.*)$`, 'gm'))];
    if (matches.length !== 1) return undefined;
    return matches[0][1].trim();
  };
  if (field('Identifier') !== bundleID) throw new Error('The signed bundle identifier differs from the release configuration');
  const flags = String(details).match(/^CodeDirectory .*\bflags=0x([0-9a-f]+)\b/im)?.[1];
  const hardenedRuntime = flags != null && (Number.parseInt(flags, 16) & 0x10000) !== 0;
  const timestamp = field('Timestamp');
  const secureTimestamp = !!timestamp && !['none', 'not set', '0'].includes(timestamp.toLowerCase());
  const teamIdentifier = field('TeamIdentifier');
  const adhoc = field('Signature') === 'adhoc';
  const authorities = [...String(details).matchAll(/^Authority=(.*)$/gm)].map(match => match[1].trim());
  const developerIDSigned = !adhoc && /^Developer ID Application: .+ \([A-Z0-9]{10}\)$/.test(authorities[0] ?? '') && /^[A-Z0-9]{10}$/.test(teamIdentifier ?? '') && authorities[0].endsWith(`(${teamIdentifier})`);
  if (mode === 'development') {
    if (!adhoc || authorities.length || teamIdentifier && teamIdentifier !== 'not set') throw new Error('Development mode requires an ad hoc signature');
    return { developerIDSigned: false, hardenedRuntime, secureTimestamp };
  }
  if (!developerIDSigned || !hardenedRuntime || !secureTimestamp) throw new Error('Release mode requires Developer ID Application signing, a TeamIdentifier, Hardened Runtime and a secure timestamp');
  if (expectedTeamIdentifier != null && teamIdentifier !== expectedTeamIdentifier) throw new Error('The signature team differs from the selected identity');
  return { developerIDSigned: true, teamIdentifier, hardenedRuntime, secureTimestamp };
}

export function verifyNativeSignature(appPath, { mode, bundleID, expectedTeamIdentifier } = {}) {
  const result = capture('/usr/bin/codesign', ['--display', '--verbose=4', appPath], 'Could not read the native app signature');
  const signature = validateNativeSignatureDetails(result.stdout + result.stderr, { mode, bundleID, expectedTeamIdentifier });
  const args = ['--verify', '--deep', '--strict'];
  if (mode === 'release') args.push(`-R=${developerIDRequirement}`);
  capture('/usr/bin/codesign', [...args, appPath], 'Native signature verification failed');
  if (mode === 'release') {
    const entitlements = capture('/usr/bin/codesign', ['--display', '--entitlements', '-', '--xml', appPath], 'Could not read the signed release entitlements');
    const json = capture('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], 'The signed release entitlements are not a valid plist', entitlements.stdout);
    validateReleaseEntitlements(JSON.parse(json.stdout));
  }
  return signature;
}
