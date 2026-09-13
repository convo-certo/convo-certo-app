import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

if(process.platform!=='darwin') throw new Error('Native recovery test requires macOS');
if(process.argv.length>3) throw new Error('Usage: node scripts/test-native-recovery.mjs [app executable]');
const executable=resolve(process.argv[2] ?? 'build/native/ConvoCerto.app/Contents/MacOS/ConvoCerto');
const webContentPIDs=()=>execFileSync('/bin/ps',['-axww','-o','pid=,comm='],{encoding:'utf8'}).split('\n').filter(line=>line.trim().endsWith('/com.apple.WebKit.WebContent')).map(line=>Number(line.trim().split(/\s+/)[0]));
const existingWebContent=new Set(webContentPIDs());
const child=spawn(executable,['--recovery-test'],{stdio:['ignore','pipe','pipe']});
let pending='', terminated=false, prompt=false, passed=false, failure;
const info=pid=>execFileSync('/usr/bin/lsappinfo',['info','-only','name,bundleid,LSApplicationMemberCoalitionIDKey',String(pid)],{encoding:'utf8'});
const coalition=text=>text.match(/"LSApplicationMemberCoalitionIDKey"=(\d+)/)?.[1];
const timeout=setTimeout(()=>{failure=new Error('Recovery process timed out');child.kill('SIGTERM');},90000);
child.stderr.on('data',data=>process.stderr.write(data));
child.stdout.on('data',data=>{
  process.stdout.write(data); pending+=data;
  let end;
  while((end=pending.indexOf('\n'))>=0) {
    const line=pending.slice(0,end); pending=pending.slice(end+1);
    let event; try {event=JSON.parse(line);} catch {continue;}
    if(event.progress==='native-recovery-prompt') prompt=true;
    if(event.passed===true) passed=true;
    if(event.progress!=='ready-to-terminate' || terminated) continue;
    try {
      const owner=info(child.pid), group=coalition(owner);
      if(!group || !owner.includes('"tech.gawatech.convocerto.preview"')) throw new Error('Test app ownership is unknown');
      const candidates=webContentPIDs().filter(pid=>!existingWebContent.has(pid)).filter(pid=>{
        try {const details=info(pid);return coalition(details)===group && details.includes('"com.apple.WebKit.WebContent"') && details.includes('"LSDisplayName"="ConvoCerto Web Content"');} catch {return false;}
      });
      if(candidates.length!==1) throw new Error(`Cannot uniquely identify test Web Content: ${candidates.length}`);
      const target=candidates[0], details=info(target);
      if(coalition(details)!==group || !details.includes('"com.apple.WebKit.WebContent"') || !details.includes('"LSDisplayName"="ConvoCerto Web Content"')) throw new Error('Web Content ownership changed');
      console.log(JSON.stringify({testAppPID:child.pid,webContentPID:target,coalition:group,action:'SIGKILL owned Web Content'}));
      process.kill(target,'SIGKILL'); terminated=true;
    } catch(error) {failure=error;child.kill('SIGTERM');}
  }
});
const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);}).finally(()=>clearTimeout(timeout));
if(failure || code!==0 || !terminated || !prompt || !passed) throw failure ?? new Error(`Recovery not proven: ${JSON.stringify({code,terminated,prompt,passed})}`);
console.log(JSON.stringify({passed:true,actualProcessTermination:true,nativeRecoveryPrompt:true}));
