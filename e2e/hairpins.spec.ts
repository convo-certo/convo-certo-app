import { test, expect } from '@playwright/test';

test('a held MusicXML hairpin changes rendered audio and is not compressed into a short gate', async ({ page }) => {
  await page.goto('/perform');
  await expect(page.getByLabel('MusicXMLで演奏する', {exact:true})).toBeVisible();
  const result = await page.evaluate(async () => {
    const parserPath='/app/lib/musicxml-parser.ts', audioPath='/app/lib/orchestra-audio.ts';
    const {parseMusicXML}=await import(parserPath), {OrchestraAudio}=await import(audioPath);
    const score=parseMusicXML('<score-partwise><part-list><score-part id="C"><part-name>Clarinet</part-name></score-part></part-list><part id="C"><measure number="1"><attributes><divisions>1</divisions></attributes><direction><direction-type><dynamics><p/></dynamics><wedge type="crescendo"/></direction-type></direction><note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration></note><direction><direction-type><wedge type="stop"/><dynamics><f/></dynamics></direction-type></direction></measure></part></score-partwise>');
    const decode=AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData=async function() {
      const buffer=this.createBuffer(1,this.sampleRate*4,this.sampleRate), data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++) data[i]=0.2*Math.sin(i*2*Math.PI*440/this.sampleRate);
      return buffer;
    };
    const audio=new OrchestraAudio();
    try {
      await audio.prepare(score.parts); audio.setSoloAudible(true);
      const analyser=audio.context.createAnalyser(); analyser.fftSize=2048; audio.master.connect(analyser);
      const data=new Float32Array(analyser.fftSize);
      const at=async (time:number)=>{while(audio.currentTime<time) await new Promise(resolve=>setTimeout(resolve,10)); analyser.getFloatTimeDomainData(data); return Math.sqrt(data.reduce((sum,value)=>sum+value*value,0)/data.length);};
      const start=audio.currentTime+0.05;
      audio.play(score.parts[0].notes[0],start,2,2);
      const early=await at(start+0.3), late=await at(start+1.6);
      audio.stop();
      const ramps:{value:number;time:number}[]=[];
      const ramp=AudioParam.prototype.linearRampToValueAtTime;
      AudioParam.prototype.linearRampToValueAtTime=function(value,time){ramps.push({value,time});return ramp.call(this,value,time);};
      try {audio.play(score.parts[0].notes[0],audio.currentTime+0.05,0.5,2);} finally {AudioParam.prototype.linearRampToValueAtTime=ramp;}
      const positive=ramps.filter(point=>point.value>0);
      audio.stop(); analyser.disconnect();
      return {early,late,gateGainRatio:positive[1].value/positive[0].value,gateSeconds:positive[1].time-positive[0].time};
    } finally {audio.dispose();AudioContext.prototype.decodeAudioData=decode;}
  });
  expect(result.early).toBeGreaterThan(0.001);
  expect(result.late/result.early).toBeGreaterThan(1.5);
  expect(result.late/result.early).toBeLessThan(2.2);
  expect(result.gateGainRatio).toBeGreaterThan(1.25);
  expect(result.gateGainRatio).toBeLessThan(1.45);
  expect(result.gateSeconds).toBeCloseTo(0.492,1);
});
