import {test,expect} from '@playwright/test';
test('a real clarinet sample remains audible past its original end and stops on request',async({page})=>{
 await page.goto('/perform');
 await expect(page.getByLabel('MusicXMLで演奏する',{exact:true})).toBeVisible();
 const result=await page.evaluate(async()=>{
  const path='/app/lib/orchestra-audio.ts';const {OrchestraAudio}=await import(path);
  const audio=new OrchestraAudio();
  const part={id:'C',name:'Clarinet',isSolo:false,notes:[]};
  try{
   await audio.prepare([part]);
   const analyser=audio.context.createAnalyser();analyser.fftSize=2048;audio.master.connect(analyser);
   const data=new Float32Array(analyser.fftSize);
   const rms=()=>{analyser.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((s,v)=>s+v*v,0)/data.length);};
   audio.play({pitch:60,startBeat:0,durationBeats:12,velocity:100,partIndex:0},audio.currentTime+0.05,6,6);
   const looped=[...audio.voices.keys()].map(source=>source.loop);
   await new Promise(resolve=>setTimeout(resolve,4200));
   const late=rms();audio.stop();await new Promise(resolve=>setTimeout(resolve,150));
   return {looped,late,stopped:rms(),voices:audio.voices.size};
  }finally{audio.dispose();}
 });
 expect(result.looped).toEqual([true]);expect(result.late).toBeGreaterThan(0.001);
 expect(result.stopped).toBeLessThan(0.00001);expect(result.voices).toBe(0);
});

test('sustain processing preserves the attack and excludes percussive instruments',async({page})=>{
 await page.goto('/perform');
 await expect(page.getByLabel('MusicXMLで演奏する',{exact:true})).toBeVisible();
 const result=await page.evaluate(async()=>{
  const path='/app/lib/sustain-loop.ts';const {sustainLoop,sustainedInstruments}=await import(path);
  const context=new OfflineAudioContext(2,48000,48000);
  const original=await context.decodeAudioData(await (await fetch('/audio/fluid/clarinet/C4.mp3')).arrayBuffer());
  const loop=sustainLoop(context,original);
  const source=original.getChannelData(0), output=loop.buffer.getChannelData(0);
  const start=Math.round(loop.start*original.sampleRate);
  return {attackSame:source.slice(0,24000).every((value,index)=>value===output[index]),seamDifference:Math.abs(output.at(-1)-output[start-1]),finite:[...output].every(Number.isFinite),range:loop.start<loop.end&&loop.end<original.duration,percussion:['acoustic_grand_piano','orchestral_harp','timpani','glockenspiel','marimba','harpsichord','acoustic_guitar_nylon'].some(name=>sustainedInstruments.has(name)),short:sustainLoop(context,context.createBuffer(1,1000,48000))};
 });
 expect(result).toEqual({attackSame:true,seamDifference:0,finite:true,range:true,percussion:false,short:null});
});

test('silent contrabass roots are excluded and a higher note uses an audible root',async({page})=>{
 await page.goto('/perform');
 await expect(page.getByLabel('MusicXMLで演奏する',{exact:true})).toBeVisible();
 const result=await page.evaluate(async()=>{
  const path='/app/lib/orchestra-audio.ts';const {OrchestraAudio}=await import(path);const audio=new OrchestraAudio();
  try {
   await audio.prepare([{id:'B',name:'Contrabass',isSolo:false,notes:[]}]);
   audio.play({pitch:60,startBeat:0,durationBeats:8,velocity:100,partIndex:0},audio.currentTime,4,4);
   const voices=[...audio.voices.keys()];
   return {roots:[...audio.buffers.get('contrabass').keys()].sort((a,b)=>a-b),voices:voices.length,rate:voices[0]?.playbackRate.value,loop:voices[0]?.loop,signal:voices[0]?.buffer.getChannelData(0).some((value:number)=>Math.abs(value)>.001)};
  } finally {audio.dispose();}
 });
 expect(result.roots).toEqual([24,36,48]);expect(result.voices).toBe(1);expect(result.rate).toBeCloseTo(2,1);expect(result.loop).toBe(true);expect(result.signal).toBe(true);
});

test('an entirely silent instrument fails preparation and can be retried with valid audio',async({page})=>{
 await page.goto('/perform');await expect(page.getByLabel('MusicXMLで演奏する',{exact:true})).toBeVisible();
 const result=await page.evaluate(async()=>{
  const path='/app/lib/orchestra-audio.ts';const {OrchestraAudio}=await import(path);const audio=new OrchestraAudio();
  const decode=AudioContext.prototype.decodeAudioData;
  AudioContext.prototype.decodeAudioData=async function(){return this.createBuffer(1,1000,this.sampleRate);};
  let error='';
  try {
   try{await audio.prepare([{id:'C',name:'Clarinet',isSolo:false,notes:[]}]);}catch(cause){error=String(cause);}
   AudioContext.prototype.decodeAudioData=decode;
   await audio.prepare([{id:'C',name:'Clarinet',isSolo:false,notes:[]}]);
   return {error,count:audio.buffers.get('clarinet')?.size};
  }finally{AudioContext.prototype.decodeAudioData=decode;audio.dispose();}
 });
 expect(result.error).toContain('有効な音がありません');expect(result.count).toBe(7);
});
