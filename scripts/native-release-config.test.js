import { expect, test } from 'vitest';
import { loadNativeReleaseConfig, nativeBuildOptions, nativeInfoPlist, nativeSigningArguments, selectDeveloperIdentity, validateNativeReleaseConfig, validateNativeSignatureDetails, validateReleaseEntitlements } from './native-release-config.mjs';

const config = { version: '0.1.0', build: '1', minimumOS: '13.0', bundleID: 'tech.gawatech.convocerto.preview' };
const fingerprint = 'A'.repeat(40);
const name = 'Developer ID Application: Example Team (ABCDEFGHIJ)';
const identity = { fingerprint, name, teamIdentifier: 'ABCDEFGHIJ' };
const inventory = `  1) ${fingerprint} "${name}"\n  1 valid identities found`;
const releaseDetails = `Identifier=${config.bundleID}\nCodeDirectory v=20500 size=100 flags=0x10000(runtime) hashes=1+1 location=embedded\nAuthority=${name}\nAuthority=Developer ID Certification Authority\nAuthority=Apple Root CA\nTimestamp=Sep 30, 2026 at 12:00:00\nTeamIdentifier=ABCDEFGHIJ\n`;

test('release configuration retains the existing app identity and generates matching bundle metadata', () => {
  expect(loadNativeReleaseConfig()).toEqual(config);
  const doc = new DOMParser().parseFromString(nativeInfoPlist(config), 'application/xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  const field = key => [...doc.querySelectorAll('plist > dict > key')].find(node => node.textContent === key)?.nextElementSibling?.textContent;
  expect(field('CFBundleIdentifier')).toBe(config.bundleID);
  expect(field('CFBundleVersion')).toBe(config.build);
  expect(field('CFBundleShortVersionString')).toBe(config.version);
  expect(field('LSMinimumSystemVersion')).toBe(config.minimumOS);
  expect(field('CFBundleDevelopmentRegion')).toBe('en');
});

test('invalid configuration cannot inject manifest content or silently select another field', () => {
  for (const invalid of [{ version: '0.1' }, { build: 1 }, { build: '0' }, { minimumOS: '12.0' }, { bundleID: 'app"><string>other' }, { typo: 'ignored' }]) expect(() => validateNativeReleaseConfig({ ...config, ...invalid })).toThrow();
});

test('release signing needs both an explicit mode and an explicit valid identity', () => {
  expect(nativeBuildOptions([], { CONVOCERTO_SIGNING_IDENTITY: name })).toEqual({ mode: 'development' });
  expect(nativeBuildOptions(['--release'], { CONVOCERTO_SIGNING_IDENTITY: name })).toEqual({ mode: 'release', identity: name });
  for (const supplied of [undefined, '', '-', 'Apple Development: Example Team', name + '\n']) expect(() => nativeBuildOptions(['--release'], { CONVOCERTO_SIGNING_IDENTITY: supplied })).toThrow();
  expect(() => nativeBuildOptions(['--relese'])).toThrow();
  expect(() => nativeBuildOptions(['--release', '--release'])).toThrow();
});

test('identity lookup requires one valid exact Developer ID Application match', () => {
  expect(selectDeveloperIdentity(name, inventory)).toEqual(identity);
  expect(selectDeveloperIdentity(fingerprint.toLowerCase(), inventory)).toEqual(identity);
  expect(() => selectDeveloperIdentity(name, inventory.replace('Developer ID Application:', 'Apple Development:'))).toThrow();
  expect(() => selectDeveloperIdentity(name, inventory + `\n  2) ${'B'.repeat(40)} "${name}"`)).toThrow('ambiguous');
  expect(() => selectDeveloperIdentity(name, inventory.replace(`"${name}"`, `"${name}" (CSSMERR_TP_CERT_EXPIRED)`))).toThrow();
});

test('release signing adds protections and never degrades to ad hoc signing', () => {
  expect(nativeSigningArguments('development', undefined, 'App.app')).toEqual(['--force', '--sign', '-', 'App.app']);
  expect(nativeSigningArguments('release', identity, 'App.app', 'release.entitlements')).toEqual(['--force', '--sign', fingerprint, '--options', 'runtime', '--timestamp', '--entitlements', 'release.entitlements', 'App.app']);
  expect(() => nativeSigningArguments('release', undefined, 'App.app', 'release.entitlements')).toThrow();
});

test('release metadata rejects missing protections, changed identity and ad hoc signatures', () => {
  const expected = { mode: 'release', bundleID: config.bundleID, expectedTeamIdentifier: identity.teamIdentifier };
  expect(validateNativeSignatureDetails(releaseDetails, expected)).toEqual({ developerIDSigned: true, teamIdentifier: 'ABCDEFGHIJ', hardenedRuntime: true, secureTimestamp: true });
  for (const invalid of [releaseDetails.replace('0x10000(runtime)', '0x0(none)'), releaseDetails.replace('Timestamp=', 'Signed Time='), releaseDetails.replace('Timestamp=Sep 30, 2026 at 12:00:00', 'Timestamp=none'), releaseDetails.replace('TeamIdentifier=ABCDEFGHIJ', 'TeamIdentifier=not set'), releaseDetails + 'Signature=adhoc\n', releaseDetails.replace(config.bundleID, 'other.app')]) expect(() => validateNativeSignatureDetails(invalid, expected)).toThrow();
  expect(() => validateNativeSignatureDetails(releaseDetails, { ...expected, expectedTeamIdentifier: '1234567890' })).toThrow();
  expect(() => validateNativeSignatureDetails(releaseDetails, { ...expected, mode: 'development' })).toThrow();
  expect(validateNativeSignatureDetails(`Identifier=${config.bundleID}\nCodeDirectory v=20400 size=100 flags=0x2(adhoc)\nSignature=adhoc\nTeamIdentifier=not set\n`, { mode: 'development', bundleID: config.bundleID }).developerIDSigned).toBe(false);
});

test('release entitlements grant only the two requested device capabilities', () => {
  const allowed = { 'com.apple.security.device.audio-input': true, 'com.apple.security.device.camera': true };
  expect(validateReleaseEntitlements(allowed)).toBe(true);
  expect(() => validateReleaseEntitlements({ ...allowed, 'com.apple.security.get-task-allow': true })).toThrow();
  expect(() => validateReleaseEntitlements({ ...allowed, 'com.apple.security.cs.allow-jit': true })).toThrow();
  expect(() => validateReleaseEntitlements({ ...allowed, 'com.apple.security.device.camera': false })).toThrow();
});
