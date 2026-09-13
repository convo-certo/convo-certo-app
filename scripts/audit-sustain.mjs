import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const browser=await chromium.launch();
try {
  const page=await browser.newPage();
  await page.goto(process.argv[2] ?? 'http://localhost:5188/perform');
  await page.getByLabel('MusicXMLで演奏する',{exact:true}).waitFor();
  const results=await page.evaluate(async()=>{
    const {sustainLoop,sustainedInstruments}=await import('/app/lib/sustain-loop.ts');
    const {hasSampleSignal}=await import('/app/lib/sample-signal.ts');
    const manifest=await (await fetch('/audio/fluid/sources.json')).json();
    const context=new OfflineAudioContext(2,1,48000);
    const rows=[];
    for(const instrument of sustainedInstruments) {
      const entry=manifest.find(item=>item.instrument===instrument);
      for(let octave=1;octave<=7;octave++) {
        const key=`C${octave}`,path=`/audio/fluid/${instrument}/${key}.mp3`;
        const response=await fetch(path);if(!response.ok)throw new Error(`Missing sample: ${path}`);
        const bytes=await response.arrayBuffer();
        const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
        const original=await context.decodeAudioData(bytes);
        if(!hasSampleSignal(original)) {rows.push({instrument,note:key,sha256,sourceHashMatches:sha256===entry?.samples[key],excluded:'No signal above 0.000001 in decoded source',channels:[]});continue;}
        const started=performance.now(),loop=sustainLoop(context,original),buildMs=performance.now()-started;
        if(!loop)throw new Error(`No sustain loop: ${path}`);
        const start=Math.round(loop.start*original.sampleRate),window=Math.round(original.sampleRate*.1);
        const channels=[];
        for(let channel=0;channel<original.numberOfChannels;channel++) {
          const data=loop.buffer.getChannelData(channel),source=original.getChannelData(channel);
          let power=0,peak=0,finite=true,attackUnchanged=true;
          for(let i=0;i<data.length;i++) {finite=finite&&Number.isFinite(data[i]);peak=Math.max(peak,Math.abs(data[i]));if(i>=start)power+=data[i]**2;if(i<original.sampleRate*.5&&data[i]!==source[i])attackUnchanged=false;}
          const rms=Math.sqrt(power/(data.length-start));let minWindowRms=Infinity;
          for(let offset=start;offset<data.length;offset+=Math.floor(window/2)) {
            let sum=0;for(let i=0;i<window;i++)sum+=data[start+(offset-start+i)%(data.length-start)]**2;
            minWindowRms=Math.min(minWindowRms,Math.sqrt(sum/window));
          }
          channels.push({finite,attackUnchanged,peak,rms,minWindowRms,minToMean:rms?minWindowRms/rms:0,seamError:Math.abs(data.at(-1)-data[start-1])});
        }
        rows.push({instrument,note:key,sha256,sourceHashMatches:sha256===entry?.samples[key],originalSeconds:original.duration,loopSeconds:loop.end-loop.start,buildMs,channels});
      }
    }
    return rows;
  });
  const failures=results.filter(row=>!row.sourceHashMatches||row.channels.some(c=>!c.finite||!c.attackUnchanged||c.seamError!==0||c.rms<1e-6||c.minToMean<.05));
  for(const instrument of new Set(results.map(row=>row.instrument))) if(!results.some(row=>row.instrument===instrument&&!row.excluded)) throw new Error(`No usable sample for ${instrument}`);
  const report={createdAt:new Date().toISOString(),scope:'All bundled sustained instruments, C1–C7, decoded and processed at 48 kHz. Structural and energy checks, not listening quality or physical output.',implementationSHA256:Object.fromEntries(['app/lib/sustain-loop.ts','app/lib/sample-signal.ts'].map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')])),sampleCount:results.length,excludedSamples:results.filter(row=>row.excluded).map(row=>`${row.instrument}/${row.note}`),failures:failures.map(row=>`${row.instrument}/${row.note}`),minimumWindowToMean:Math.min(...results.flatMap(row=>row.channels.map(c=>c.minToMean))),maximumBuildMs:Math.max(...results.filter(row=>!row.excluded).map(row=>row.buildMs)),results};
  const directory=`verification-results/sustain-${new Date().toISOString().replaceAll(':','-')}`;mkdirSync(directory,{recursive:true});
  writeFileSync(`${directory}/report.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({directory,sampleCount:report.sampleCount,excludedSamples:report.excludedSamples,failures:report.failures,minimumWindowToMean:report.minimumWindowToMean,maximumBuildMs:report.maximumBuildMs}));
  if(failures.length)process.exitCode=1;
} finally {await browser.close();}
