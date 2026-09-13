import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { releaseSourceHash, bundleHash, validateNativeRelease } from './release-artifacts.mjs';

if (process.platform !== 'darwin' || process.argv.length !== 3) throw new Error('Usage on macOS: npm run native:package -- verification-results/<run>/report.json');
const verificationPath = resolve(process.argv[2]);
const verification = JSON.parse(readFileSync(verificationPath, 'utf8'));
const app = resolve('build/native/ConvoCerto.app');
const sourceHash = releaseSourceHash(), nativeBundleHash = bundleHash(app);
validateNativeRelease(verification, sourceHash, nativeBundleHash);
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], {stdio:'pipe'});
const version = execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', join(app,'Contents/Info.plist')], {encoding:'utf8'}).trim();
if (!/^[0-9]+(?:\.[0-9]+){1,3}$/.test(version)) throw new Error('Invalid bundle version');
const architecture = execFileSync('/usr/bin/lipo', ['-archs', join(app,'Contents/MacOS/ConvoCerto')], {encoding:'utf8'}).trim();
if (!/^(arm64|x86_64)( (arm64|x86_64))?$/.test(architecture)) throw new Error('Unsupported architecture listing');
const minimumOS = execFileSync('/usr/bin/plutil', ['-extract', 'LSMinimumSystemVersion', 'raw', join(app,'Contents/Info.plist')], {encoding:'utf8'}).trim();
const buildVersion = execFileSync('/usr/bin/xcrun', ['vtool', '-show-build', join(app,'Contents/MacOS/ConvoCerto')], {encoding:'utf8'});
if (!new RegExp(`minos\\s+${minimumOS.replaceAll('.', '\\.')}(?:\\s|$)`).test(buildVersion)) throw new Error('Bundle minimum OS and executable target differ');
const testedOS = execFileSync('/usr/bin/sw_vers', ['-productVersion'], {encoding:'utf8'}).trim();
const distribution = resolve('build/distribution'); mkdirSync(distribution,{recursive:true});
const folder = mkdtempSync(join(distribution,`ConvoCerto-preview-${version}-${architecture.replaceAll(' ','-')}-`));
const temporary = mkdtempSync(join(tmpdir(),'convocerto-package-'));
const stage = join(temporary,'image'), mount = join(temporary,'mounted'), installed = join(temporary,'Installed/ConvoCerto.app');
mkdirSync(stage); mkdirSync(mount); mkdirSync(join(temporary,'Installed'));
const dmg = join(folder,'ConvoCerto-preview.dmg');
const report = {createdAt:new Date().toISOString(), version, architecture, minimumOS, testedOS, sourceHash, nativeBundleHash, verificationReport:verificationPath, packagePassed:false, publicReleaseReady:false, developerIDSigned:false, notarized:false, steps:[], temporaryDirectory:temporary};
const save = () => writeFileSync(join(folder,'package-report.json'),JSON.stringify(report,null,2));
const run = (name, command, args, timeout = 120000) => {
  console.log(`Packaging: ${name}`);
  const result = spawnSync(command,args,{encoding:'utf8',timeout,maxBuffer:40_000_000});
  writeFileSync(join(folder,`${name}.log`),(result.stdout ?? '')+(result.stderr ?? ''));
  report.steps.push({name,passed:result.status===0,status:result.status,signal:result.signal,error:result.error?.message}); save();
  if(result.status!==0) throw new Error(`${name} failed; see ${folder}`);
};
let attached = false, completed = false;
save();
try {
  run('copy-app','/usr/bin/ditto',[app,join(stage,'ConvoCerto.app')]);
  symlinkSync('/Applications',join(stage,'Applications'));
  writeFileSync(join(stage,'はじめに.txt'),`ConvoCerto 開発プレビュー ${version}\n対象CPU: ${architecture} / ビルドの最低OS指定: macOS ${minimumOS}\n起動検証OS: macOS ${testedOS}（他のOSでの実機検証は未実施）\n\nConvoCerto.appをApplicationsへコピーして起動します。既存版がある場合は、先に練習ファイルを書き出してバックアップし、アプリを終了してください。\n\nこの版は開発用アドホック署名です。Developer ID署名とAppleの公証は未完了で、別のMacでの通常インストールは保証していません。セキュリティ設定を無効化する必要がある配布版として案内しないでください。\n\nNode.jsや開発用サーバーは実行時に不要です。画面のInterフォントは同梱しています。カメラ解析素材はネット接続を必要とします。Web版の保存データとは別なので、練習ファイルを読み込んで移行できます。\n\n初回は曲を開き、担当と楽器を選び、ClariMate / MIDIまたはマイクを接続します。機器自身の音を聴く場合、MIDI入力の試聴はOFFにしてください。\n\n自動更新はありません。削除するときはアプリを終了してConvoCerto.appをゴミ箱に移します。保存済み練習データの全消去は行いません。\n\n実機の吹奏品質・収録素材の全権利・有料販売への適合は確認中です。\n`);
  run('create-dmg','/usr/bin/hdiutil',['create','-srcfolder',stage,'-format','UDZO','-volname','ConvoCerto Preview',dmg]);
  run('verify-dmg','/usr/bin/hdiutil',['verify',dmg]);
  run('mount-dmg','/usr/bin/hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,dmg]); attached = true;
  if(bundleHash(join(mount,'ConvoCerto.app'))!==nativeBundleHash) throw new Error('Mounted app differs from verified build');
  run('install-copy','/usr/bin/ditto',[join(mount,'ConvoCerto.app'),installed]);
  if(bundleHash(installed)!==nativeBundleHash) throw new Error('Installed copy differs from verified build');
  run('verify-installed-signature','/usr/bin/codesign',['--verify','--deep','--strict',installed]);
  run('installed-wkwebview',join(installed,'Contents/MacOS/ConvoCerto'),['--smoke-test'],90000);
  run('installed-recovery',process.execPath,[resolve('scripts/test-native-recovery.mjs'),join(installed,'Contents/MacOS/ConvoCerto')],90000);
  run('unmount-dmg','/usr/bin/hdiutil',['detach',mount]); attached = false;
  if(bundleHash(app)!==nativeBundleHash || releaseSourceHash()!==sourceHash) throw new Error('Build or sources changed while packaging');
  report.dmgSHA256 = createHash('sha256').update(readFileSync(dmg)).digest('hex');
  report.packagePassed = true; report.finishedAt = new Date().toISOString();
  completed = true; save();
  console.log(`Local preview package verified: ${dmg}\nNot a notarized public release. Report: ${join(folder,'package-report.json')}`);
} catch(error) {
  report.error = String(error); save(); throw error;
} finally {
  if(attached) {
    const detached = spawnSync('/usr/bin/hdiutil',['detach',mount],{encoding:'utf8',timeout:30000});
    report.cleanup = {detached:detached.status===0,output:(detached.stdout ?? '')+(detached.stderr ?? '')}; save();
  }
  if(completed) rmSync(temporary,{recursive:true,force:true});
}
