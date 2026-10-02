import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, cpSync, writeFileSync, existsSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { verifyScoreLibrary } from './prepare-score-library.mjs';
import { loadNativeReleaseConfig, nativeBuildOptions, nativeInfoPlist, nativePermissionStrings, nativeSigningArguments, requireDeveloperIdentity, validateReleaseEntitlements, verifyNativeSignature } from './native-release-config.mjs';
const app = 'build/native/ConvoCerto.app/Contents';
const appPath = 'build/native/ConvoCerto.app';
const config = loadNativeReleaseConfig();
const options = nativeBuildOptions(process.argv.slice(2), process.env);
const minimumOS = config.minimumOS;
const architecture = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x86_64' : null;
if (process.platform !== 'darwin' || !architecture) throw new Error('Native build requires an arm64 or x86_64 Mac');
if (!existsSync('build/client/index.html')) throw new Error('Run npm run build first');
const starter = JSON.parse(readFileSync('build/starter-bundle-report.json', 'utf8'));
if (starter.profile !== 'starter' || starter.scores?.length !== 2 || starter.instrumentBanks !== 34) throw new Error('Run npm run build to prepare the starter distribution');
const library = verifyScoreLibrary('build/client/repertoire/library');
if (starter.library?.scores !== library.count || starter.library?.bytes !== library.bytes) throw new Error('Score library does not match the build report; run npm run build again');
for (const [directory, expected] of [
  ['scores', ['sample-duet.musicxml']],
  ['repertoire', ['SOURCES.md', 'ensemble', 'library']],
  ['repertoire/ensemble', ['README.md', 'catalog.json', 'mozart-k622-2.musicxml', 'sources.json']],
]) if (JSON.stringify(readdirSync(`build/client/${directory}`).sort()) !== JSON.stringify(expected.sort())) throw new Error(`Unexpected score payload in ${directory}; run npm run build again`);
const entitlementsPath = 'native/ConvoCerto/release.entitlements';
const identity = options.mode === 'release' ? requireDeveloperIdentity(options.identity) : undefined;
if (options.mode === 'release') validateReleaseEntitlements(JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', entitlementsPath], { encoding: 'utf8' })));
const report = { createdAt: new Date().toISOString(), mode: options.mode, config, architecture, appPath, buildPassed: false, signatureVerified: false, developerIDSigned: false, notarized: false, publicReleaseReady: false };
writeFileSync('build/native-build-report.json', JSON.stringify(report, null, 2) + '\n');
mkdirSync(`${app}/MacOS`, { recursive:true });
mkdirSync(`${app}/Resources`, { recursive:true });
execFileSync('swiftc', ['-target',`${architecture}-apple-macosx${minimumOS}`,'-swift-version','5','-O','native/ConvoCerto/LocalServer.swift','native/ConvoCerto/MIDIBytes.swift','native/ConvoCerto/MIDIBridge.swift','native/ConvoCerto/Downloads.swift','native/ConvoCerto/PrintBridge.swift','native/ConvoCerto/main.swift','-o',`${app}/MacOS/ConvoCerto`], {stdio:'inherit'});
rmSync(`${app}/Resources/web`, {recursive:true,force:true});
cpSync('build/client', `${app}/Resources/web`, {recursive:true});
cpSync('native/Resources/ConvoCerto.icns', `${app}/Resources/ConvoCerto.icns`);
cpSync('native/ConvoCerto/midi.js', `${app}/Resources/midi.js`);
cpSync('native/ConvoCerto/smoke.js', `${app}/Resources/smoke.js`);
cpSync('native/ConvoCerto/recovery-smoke.js', `${app}/Resources/recovery-smoke.js`);
cpSync('native/ConvoCerto/soak.js', `${app}/Resources/soak.js`);
for (const [language, strings] of Object.entries(nativePermissionStrings)) {
  const directory = `${app}/Resources/${language}.lproj`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/InfoPlist.strings`, Object.entries(strings).map(([key, value]) => `${JSON.stringify(key)} = ${JSON.stringify(value)};`).join('\n') + '\n');
}
writeFileSync(`${app}/Info.plist`, nativeInfoPlist(config));
const signing = spawnSync('/usr/bin/codesign', nativeSigningArguments(options.mode, identity, appPath, entitlementsPath), { encoding: 'utf8', timeout: 120000 });
if (signing.status !== 0) throw new Error(options.mode === 'release' ? 'Developer ID signing failed; no development-signature fallback was attempted' : 'Development signing failed');
Object.assign(report, verifyNativeSignature(appPath, { mode: options.mode, bundleID: config.bundleID, expectedTeamIdentifier: identity?.teamIdentifier }), { buildPassed: true, signatureVerified: true, finishedAt: new Date().toISOString() });
writeFileSync('build/native-build-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Built ${appPath} (${options.mode === 'release' ? 'Developer ID signature with Hardened Runtime' : 'local development signature'}; not notarized)`);
