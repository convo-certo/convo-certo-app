import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomInt } from 'node:crypto';
const directory=`verification-results/listening-${new Date().toISOString().replaceAll(':','-')}`;
mkdirSync(directory,{recursive:true});
const browser=await chromium.launch();
try {
 const page=await browser.newPage();
 await page.goto(process.argv[2] ?? 'http://localhost:5188/perform');
 await page.getByLabel('MusicXMLで演奏する',{exact:true}).waitFor();
 const samples=await page.evaluate(async()=>{
  const {sustainLoop}=await import('/app/lib/sustain-loop.ts');
  const results=[];
  for(const instrument of ['clarinet','string_ensemble_1','french_horn']) {
   const bytes=await (await fetch(`/audio/fluid/${instrument}/C4.mp3`)).arrayBuffer();
   const decoder=new OfflineAudioContext(2,1,48000);
   const original=await decoder.decodeAudioData(bytes);
   for(const variant of ['original','sustained']) {
    const context=new OfflineAudioContext(2,Math.ceil(6.4*48000),48000);
    const source=context.createBufferSource(),gain=context.createGain();
    const loop=variant==='sustained'?sustainLoop(context,original):null;
    source.buffer=loop?.buffer??original;
    if(loop){source.loop=true;source.loopStart=loop.start;source.loopEnd=loop.end;}
    gain.gain.setValueAtTime(0,0);gain.gain.linearRampToValueAtTime(.5,.008);gain.gain.setValueAtTime(.5,6);gain.gain.linearRampToValueAtTime(0,6.12);
    source.connect(gain).connect(context.destination);source.start(0);source.stop(6.13);
    const audio=await context.startRendering(),size=audio.length*4;
    const wav=new ArrayBuffer(44+size),view=new DataView(wav);
    const text=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
    text(0,'RIFF');view.setUint32(4,36+size,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,48000,true);view.setUint32(28,192000,true);view.setUint16(32,4,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,size,true);
    let peak=0,latePower=0,lateSamples=0,tailPower=0,tailSamples=0;
    for(let channel=0;channel<2;channel++) {
     const data=audio.getChannelData(channel);
     for(let i=0;i<data.length;i++) {
      const value=data[i];peak=Math.max(peak,Math.abs(value));
      if(i>=48000*4&&i<48000*5){latePower+=value*value;lateSamples++;}
      if(i>=48000*6.2){tailPower+=value*value;tailSamples++;}
      view.setInt16(44+(i*2+channel)*2,Math.round(Math.max(-1,Math.min(1,value))*32767),true);
     }
    }
    let binary='';const output=new Uint8Array(wav);for(let i=0;i<output.length;i+=8192)binary+=String.fromCharCode(...output.subarray(i,i+8192));
    results.push({instrument,variant,peak,lateRMS:Math.sqrt(latePower/lateSamples),tailRMS:Math.sqrt(tailPower/tailSamples),wav:btoa(binary)});
   }
  }
  return results;
 });
 const names={clarinet:'クラリネット',string_ensemble_1:'弦アンサンブル',french_horn:'ホルン'};
 const pairs=[];
 for(const [instrument,name] of Object.entries(names)) {
  const variants=randomInt(2)?['original','sustained']:['sustained','original'];
  const files=variants.map((variant,index)=>{
   const sample=samples.find(item=>item.instrument===instrument&&item.variant===variant),filename=`${instrument}-${index?'B':'A'}.wav`,bytes=Buffer.from(sample.wav,'base64');
   if(sample.peak>=1||sample.tailRMS>1e-6||(variant==='sustained'&&sample.lateRMS<1e-4))throw new Error(`Invalid rendered audio: ${instrument}/${variant}`);
   writeFileSync(`${directory}/${filename}`,bytes);
   return {label:index?'B':'A',variant,filename,sha256:createHash('sha256').update(bytes).digest('hex'),peak:sample.peak,lateRMS:sample.lateRMS,tailRMS:sample.tailRMS};
  });
  pairs.push({instrument,name,sourceSHA256:createHash('sha256').update(readFileSync(`public/audio/fluid/${instrument}/C4.mp3`)).digest('hex'),files});
 }
 const report={createdAt:new Date().toISOString(),scope:'C4, stereo 48kHz PCM, six-second gate, identical gain 0.5 and 120ms release. Offline rendering without spatialization or following. Anonymous labels; original samples audibly end earlier, so this is not a blinded perceptual experiment.',implementationSHA256:createHash('sha256').update(readFileSync('app/lib/sustain-loop.ts')).digest('hex'),pairs};
 const reportText=JSON.stringify(report,null,2);writeFileSync(`${directory}/report.json`,reportText);
 const reportHash=createHash('sha256').update(reportText).digest('hex');
 const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ConvoCerto 長音の試聴</title><style>body{font:16px/1.7 system-ui;background:#f4f7f4;color:#193b32;max-width:780px;margin:40px auto;padding:0 20px}section{background:white;border:1px solid #d8e2dc;border-radius:16px;padding:24px;margin:20px 0}audio,textarea,select{width:100%;box-sizing:border-box}label{display:block;margin:16px 0 6px}button,select,textarea{font:inherit;padding:10px;border:1px solid #a7b9af;border-radius:8px}button{background:#214f41;color:white;cursor:pointer}small{color:#52645b}</style><h1>長い音を、聴き比べる</h1><p>3楽器のA/Bを、同じ音量で順番に聴いてください。各音は6秒の長音として作っています。どちらが好みかに加えて、揺れ・音のつなぎ目・繰り返し感をメモできます。</p><p>自動再生はしません。回答はこの画面だけに保持し、保存ボタンでJSONに書き出します。送信はしません。音源単体の比較で、実際の共奏や実演追従の評価ではありません。</p>${pairs.map(pair=>`<section data-instrument="${pair.instrument}"><h2>${pair.name}</h2>${pair.files.map(file=>`<label>${file.label}<audio controls preload="none" aria-label="${pair.name} ${file.label}" src="${file.filename}"></audio></label>`).join('')}<label>次の練習で使いたい音<select aria-label="${pair.name} の好み"><option value="">未回答</option><option>A</option><option>B</option><option value="same">差を感じない</option><option value="neither">どちらも改善してほしい</option><option value="unsure">まだ分からない</option></select></label><label>気になったところ<textarea rows="3" maxlength="1000" aria-label="${pair.name} のメモ" placeholder="何秒付近か、どんな音が気になったか"></textarea></label></section>`).join('')}<button id="save">回答をファイルに保存</button><p id="status" role="status"></p><details><summary>回答後にA/Bの処理を見る</summary>${pairs.map(pair=>`<p>${pair.name}: ${pair.files.map(file=>`${file.label}＝${file.variant==='original'?'元のサンプル再生':'持続処理あり'}`).join(' / ')}</p>`).join('')}<p>元サンプルは約3.13秒で終わります。A/Bのラベルを伏せていますが、この違いを隠した厳密な盲検試験ではありません。</p></details><p><small>音源: FluidR3 GM — Frank Wen。MP3レンダリング: Benjamin Gleitzman / MIDI.js Soundfonts。CC BY 3.0。比較用に音量・長さを調整し、一方はクロスフェード持続処理を適用。<a href="https://github.com/gleitz/midi-js-soundfonts">配布元</a> · <a href="https://creativecommons.org/licenses/by/3.0/">ライセンス</a></small></p><script>document.querySelectorAll('audio').forEach(audio=>audio.addEventListener('play',()=>document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause()})));document.querySelector('#save').onclick=()=>{const result={createdAt:new Date().toISOString(),reportSHA256:'${reportHash}',answers:[...document.querySelectorAll('section')].map(section=>({instrument:section.dataset.instrument,preference:section.querySelector('select').value,notes:section.querySelector('textarea').value}))};const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='convo-listening-feedback.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);document.querySelector('#status').textContent='回答ファイルの保存を開始しました。送信はしていません。';};</script></html>`;
 writeFileSync(`${directory}/index.html`,html);console.log(directory);
} finally {await browser.close();}
