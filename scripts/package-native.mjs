import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, symlinkSync, rmSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { releaseSourceHash, bundleHash, validateNativeRelease, validateNativeBuildEvidence, nativePackageOptions, validateBundleConfiguration, validateDmgSignatureDetails } from './release-artifacts.mjs';
import { loadNativeReleaseConfig, requireDeveloperIdentity, verifyNativeSignature } from './native-release-config.mjs';

const options = nativePackageOptions(process.argv.slice(2), process.env);
if (process.platform !== 'darwin') throw new Error('Native packaging requires macOS');
const config = loadNativeReleaseConfig();
const verificationPath = resolve(options.verificationPath);
const verification = JSON.parse(readFileSync(verificationPath, 'utf8'));
const app = resolve('build/native/ConvoCerto.app');
const sourceHash = releaseSourceHash(), nativeBundleHash = bundleHash(app);
validateNativeRelease(verification, sourceHash, nativeBundleHash, options.mode);
const plist = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(app, 'Contents/Info.plist')], { encoding: 'utf8' }));
const { version, build, minimumOS, bundleID } = validateBundleConfiguration(plist, config);
const architecture = execFileSync('/usr/bin/lipo', ['-archs', join(app, 'Contents/MacOS/ConvoCerto')], { encoding: 'utf8' }).trim();
validateNativeBuildEvidence(verification.nativeBuild, { mode: options.mode, config, architecture });
const buildVersion = execFileSync('/usr/bin/xcrun', ['vtool', '-show-build', join(app, 'Contents/MacOS/ConvoCerto')], { encoding: 'utf8' });
const minimumVersions = [...buildVersion.matchAll(/\bminos\s+(\d+(?:\.\d+)+)/g)].map(match => match[1]);
if (minimumVersions.length !== 1 || minimumVersions[0] !== minimumOS) throw new Error('Bundle minimum OS and executable target differ');
const identity = options.mode === 'release' ? requireDeveloperIdentity(options.identity) : undefined;
const signatureOptions = { mode: options.mode, bundleID, expectedTeamIdentifier: identity?.teamIdentifier };
const appSignature = verifyNativeSignature(app, signatureOptions);
if (options.mode === 'release' && verification.nativeBuild.teamIdentifier !== appSignature.teamIdentifier) throw new Error('App signature team differs from verification evidence');

const certificateFingerprint = path => {
  const directory = mkdtempSync(join(tmpdir(), 'convocerto-certificate-'));
  const prefix = join(directory, 'certificate');
  try {
    const result = spawnSync('/usr/bin/codesign', ['--display', '--extract-certificates', prefix, path], { encoding: 'utf8', timeout: 30000 });
    if (result.status !== 0) throw new Error('Could not inspect the signing certificate');
    return createHash('sha1').update(readFileSync(prefix + '0')).digest('hex').toUpperCase();
  } finally { rmSync(directory, { recursive: true, force: true }); }
};
if (identity && certificateFingerprint(app) !== identity.fingerprint) throw new Error('Packaging identity must be the same certificate used to sign the verified app');

const testedOS = execFileSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim();
const label = options.mode === 'release' ? 'release' : 'preview';
const distribution = resolve('distribution'); mkdirSync(distribution, { recursive: true });
const folder = mkdtempSync(join(distribution, `ConvoCerto-${label}-${version}-${build}-${architecture}-`));
const temporary = mkdtempSync(join(tmpdir(), 'convocerto-package-'));
const stage = join(temporary, 'image'), mount = join(temporary, 'mounted'), installed = join(temporary, 'Installed/ConvoCerto.app');
mkdirSync(stage); mkdirSync(mount); mkdirSync(join(temporary, 'Installed'));
const dmg = join(folder, `ConvoCerto-${label}-${version}-${architecture}.dmg`);
const report = {
  createdAt: new Date().toISOString(), mode: options.mode, version, build, bundleID, architecture, minimumOS, testedOS, sourceHash, nativeBundleHash,
  verificationReport: verificationPath, ...appSignature, signingCertificateSHA1: identity?.fingerprint,
  packagePassed: false, publicReleaseReady: false, notarized: false, dmgDeveloperIDSigned: false, steps: [], temporaryDirectory: temporary,
};
const save = () => writeFileSync(join(folder, 'package-report.json'), JSON.stringify(report, null, 2) + '\n');
const run = (name, command, args, timeout = 120000) => {
  console.log(`Packaging: ${name}`);
  const result = spawnSync(command, args, { encoding: 'utf8', timeout, maxBuffer: 40_000_000 });
  writeFileSync(join(folder, `${name}.log`), (result.stdout ?? '') + (result.stderr ?? ''));
  report.steps.push({ name, passed: result.status === 0, status: result.status, signal: result.signal, error: result.error?.message }); save();
  if (result.status !== 0) throw new Error(`${name} failed; see ${folder}`);
  return result;
};
const check = (name, inspect) => {
  try {
    const details = inspect();
    report.steps.push({ name, passed: true, status: 0 });
    writeFileSync(join(folder, `${name}.log`), JSON.stringify(details) + '\n');
    save();
    return details;
  } catch (error) { report.steps.push({ name, passed: false, error: String(error) }); save(); throw error; }
};
let attached = false, completed = false;
save();
try {
  run('copy-app', '/usr/bin/ditto', [app, join(stage, 'ConvoCerto.app')]);
  symlinkSync('/Applications', join(stage, 'Applications'));
  const japaneseSignature = options.mode === 'release' ? 'Developer ID署名済み。Appleの公証は未完了で、一般公開前の検証用です。' : '開発用アドホック署名です。Appleの公証は未完了で、別のMacでの通常インストールは未確認です。';
  const englishSignature = options.mode === 'release' ? 'Developer ID signed. Apple notarization is pending; this package is for verification before public release.' : 'Development ad hoc signature. Apple notarization and normal installation on another Mac remain unverified.';
  writeFileSync(join(stage, 'Read Me.txt'), `ConvoCerto ${version} (${build})\nCPU: ${architecture} / Minimum build target: macOS ${minimumOS} / Tested here: macOS ${testedOS}\n\n日本語\nConvoCerto.appをApplicationsへコピーして開きます。更新前には練習ファイルを書き出してバックアップし、アプリを終了してください。更新は手動です。\n楽譜を開き、自分のパートを選びます。マイクやMIDIを接続せず、一定テンポの伴奏だけでも練習できます。接続すると演奏入力を利用できます。\n${japaneseSignature} セキュリティ設定を無効化しての利用を求める配布物ではありません。\nWeb版とMac版の保存先は別です。移行には練習ファイルを使います。アプリをゴミ箱へ移しても保存データは消えません。カメラ解析素材の読込と任意の音声指示は通信を伴う場合があります。詳しくはアプリの「データの扱い」を確認してください。\n\nEnglish\nCopy ConvoCerto.app to Applications, then open it. Before updating, export practice files as backups and quit the app. Updates are installed manually.\nOpen a score and choose your part. You can practise with fixed-tempo accompaniment without a microphone or MIDI device, or connect an input to follow your playing.\n${englishSignature} This package does not ask you to disable macOS security settings.\nThe website and Mac app have separate storage; use practice files to move scores and settings. Moving the app to Trash does not erase saved practice. Camera assets and optional spoken commands may use a network connection. See “Your data” in the app for details.\n\nThe minimum build target is not a claim of testing on every supported OS.\n`);
  run('create-dmg', '/usr/bin/hdiutil', ['create', '-srcfolder', stage, '-format', 'UDZO', '-volname', options.mode === 'release' ? 'ConvoCerto' : 'ConvoCerto Preview', dmg]);
  if (identity) {
    const dmgIdentifier = bundleID + '.dmg';
    run('sign-dmg', '/usr/bin/codesign', ['--force', '--sign', identity.fingerprint, '--timestamp', '--identifier', dmgIdentifier, dmg]);
    run('verify-dmg-signature', '/usr/bin/codesign', ['--verify', '--strict', '-R=anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists', dmg]);
    const signature = check('inspect-dmg-signature', () => {
      const details = spawnSync('/usr/bin/codesign', ['--display', '--verbose=4', dmg], { encoding: 'utf8', timeout: 30000 });
      if (details.status !== 0) throw new Error('Could not inspect the signed DMG');
      const metadata = validateDmgSignatureDetails(details.stdout + details.stderr, { bundleID: dmgIdentifier, expectedTeamIdentifier: appSignature.teamIdentifier });
      if (certificateFingerprint(dmg) !== identity.fingerprint) throw new Error('DMG and app must use the same signing certificate');
      return metadata;
    });
    report.dmgDeveloperIDSigned = signature.developerIDSigned;
    report.dmgTeamIdentifier = signature.teamIdentifier;
    report.dmgSecureTimestamp = signature.secureTimestamp;
    save();
  }
  run('verify-dmg', '/usr/bin/hdiutil', ['verify', dmg]);
  run('mount-dmg', '/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]); attached = true;
  if (bundleHash(join(mount, 'ConvoCerto.app')) !== nativeBundleHash) throw new Error('Mounted app differs from verified build');
  run('install-copy', '/usr/bin/ditto', [join(mount, 'ConvoCerto.app'), installed]);
  if (bundleHash(installed) !== nativeBundleHash) throw new Error('Installed copy differs from verified build');
  check('verify-installed-signature', () => verifyNativeSignature(installed, signatureOptions));
  run('installed-wkwebview', join(installed, 'Contents/MacOS/ConvoCerto'), ['--smoke-test'], 90000);
  run('installed-recovery', process.execPath, [resolve('scripts/test-native-recovery.mjs'), join(installed, 'Contents/MacOS/ConvoCerto')], 90000);
  run('unmount-dmg', '/usr/bin/hdiutil', ['detach', mount]); attached = false;
  if (bundleHash(app) !== nativeBundleHash || releaseSourceHash() !== sourceHash) throw new Error('Build or sources changed while packaging');
  report.dmgSHA256 = createHash('sha256').update(readFileSync(dmg)).digest('hex');
  report.dmgBytes = statSync(dmg).size;
  report.packagePassed = true; report.finishedAt = new Date().toISOString();
  const manifest = { format: 'convocerto-native-package', mode: options.mode, version, build, bundleID, architecture, minimumOS, testedOS, filename: basename(dmg), bytes: report.dmgBytes, sha256: report.dmgSHA256, sourceHash, nativeBundleHash, ...appSignature, signingCertificateSHA1: identity?.fingerprint, dmgDeveloperIDSigned: report.dmgDeveloperIDSigned, dmgTeamIdentifier: report.dmgTeamIdentifier, dmgSecureTimestamp: report.dmgSecureTimestamp, notarized: false, publicReleaseReady: false };
  writeFileSync(join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  save(); completed = true;
  console.log(`Verified ${label} package: ${dmg}\nNot notarized; not a public release. Report: ${join(folder, 'package-report.json')}`);
} catch (error) {
  report.packagePassed = false;
  delete report.finishedAt;
  report.error = String(error);
  try { rmSync(join(folder, 'manifest.json'), { force: true }); }
  catch (cleanupError) { report.manifestCleanupError = String(cleanupError); }
  save(); throw error;
} finally {
  if (attached) {
    const detached = spawnSync('/usr/bin/hdiutil', ['detach', mount], { encoding: 'utf8', timeout: 30000 });
    report.cleanup = { detached: detached.status === 0, output: (detached.stdout ?? '') + (detached.stderr ?? '') }; save();
  }
  if (completed) rmSync(temporary, { recursive: true, force: true });
}
