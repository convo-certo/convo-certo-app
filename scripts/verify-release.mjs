import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { releaseSourceHash, bundleHash } from './release-artifacts.mjs';

const folder = join('verification-results',new Date().toISOString().replaceAll(':','-'));
mkdirSync(folder,{recursive:true});
const report = { startedAt:new Date().toISOString(), sourceHash:releaseSourceHash(), platform:process.platform, architecture:process.arch, steps:[], mechanicalPassed:false, saleReady:false, unverified:['live instrumental following quality','physical MIDI instrument and microphone lifecycle','physical printer output and print/save dialog cancellation or permission failures','score edition and redistribution review','willingness to pay and retained usage','purchase, cancellation and support operations'] };
const steps = [['typecheck',['npm','run','typecheck']],['unit',['npm','test']],['web-build',['npm','run','build']],['browser',['npm','run','e2e']]];
if (process.platform === 'darwin') steps.push(['native-midi-parser',['node','scripts/test-native-midi.mjs']],['native-build',['node','scripts/build-native.mjs']],['native-wkwebview',['build/native/ConvoCerto.app/Contents/MacOS/ConvoCerto','--smoke-test']],['native-recovery',['node','scripts/test-native-recovery.mjs']]);
else report.unverified.push('macOS native verification requires a Mac');
const save = () => writeFileSync(join(folder,'report.json'),JSON.stringify(report,null,2));
save();
for (const [name,[command,...args]] of steps) {
  console.log(`Verifying ${name}…`);
  const start=Date.now();
  const result=spawnSync(command,args,{encoding:'utf8',timeout:name === 'native-wkwebview' ? 90_000 : 600_000,maxBuffer:40_000_000});
  writeFileSync(join(folder,`${name}.log`),(result.stdout ?? '')+(result.stderr ?? ''));
  report.steps.push({name,passed:result.status === 0,status:result.status,signal:result.signal,elapsedMs:Date.now()-start,error:result.error?.message});
  save();
  if(name === 'web-build' && result.status === 0) {
    report.bundledNotices = JSON.parse(readFileSync('build/client/notices/bundled-packages.json','utf8'));
    save();
  }
  if(result.status !== 0) { console.error(`Failed ${name}; evidence: ${folder}`); process.exit(1); }
}
if (process.platform === 'darwin') report.nativeBundleHash = bundleHash('build/native/ConvoCerto.app');
if (releaseSourceHash() !== report.sourceHash) throw new Error('Sources changed during release verification');
report.mechanicalPassed=true;
report.finishedAt=new Date().toISOString();
save();
console.log(`Mechanical checks passed. Commercial readiness remains unproven. Evidence: ${folder}`);
