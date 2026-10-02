import { confirmImportedPart } from "./helpers/studio";
import {test,expect} from '@playwright/test';

test('a failed capture module releases the microphone and allows retry', async ({page}) => {
  await page.addInitScript(() => {
    const probe = new AudioContext();
    const prototype = Object.getPrototypeOf(probe.audioWorklet);
    const addModule = prototype.addModule;
    (window as any).rejectCaptureModule = true;
    prototype.addModule = function (...args: any[]) {
      return (window as any).rejectCaptureModule ? Promise.reject(new DOMException('Injected capture module failure', 'AbortError')) : addModule.apply(this, args);
    };
    void probe.close();
    (window as any).captureTestContexts = [];
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(); await context.resume();
      (window as any).captureTestContexts.push(context);
      const stream = context.createMediaStreamDestination().stream;
      (window as any).captureTestTrack = stream.getAudioTracks()[0];
      return stream;
    };
  });
  await page.goto('/perform?view=settings');
  await page.getByLabel('MusicXMLで演奏する', {exact:true}).setInputFiles('public/scores/sample-duet.musicxml');
  await confirmImportedPart(page);
  await expect(page.getByRole('button', {name:'▶ 演奏開始',exact:true})).toBeEnabled();
  await page.getByRole('button', {name:'マイクで演奏する',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('マイクを開始できませんでした');
  expect(await page.evaluate(() => (window as any).captureTestTrack.readyState)).toBe('ended');
  await page.evaluate(() => { (window as any).rejectCaptureModule = false; });
  await page.getByRole('button', {name:'マイクで演奏する',exact:true}).click();
  await expect(page.getByRole('button', {name:'マイクを停止',exact:true})).toBeVisible();
  await page.getByRole('button', {name:'マイクを停止',exact:true}).click();
  await page.evaluate(async () => { for (const context of (window as any).captureTestContexts) await context.close(); });
});

test('four repeated notes separated by short gaps advance the score through real microphone analysis', async ({page}, testInfo) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(); await context.resume();
      const destination = context.createMediaStreamDestination();
      const source = context.createBufferSource();
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 1.2), context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) {
        const seconds = i / context.sampleRate;
        const phase = 2 * Math.PI * 440 * seconds;
        samples[i] = seconds % 0.3 < 0.26 ? 0.2 * Math.sin(phase) + 0.08 * Math.sin(3 * phase) : 0;
      }
      source.buffer = buffer; source.connect(destination);
      (window as any).startRepeatedNotes = () => source.start();
      (window as any).closeRepeatedNotes = () => context.close();
      return destination.stream;
    };
  });
  await page.goto('/perform?view=settings');
  await page.evaluate(async () => {
    const path = '/app/lib/microphone-input.ts';
    const { MicrophoneInput } = await import(path);
    const original = MicrophoneInput.prototype.processReading;
    (window as any).microphoneFrames = [];
    MicrophoneInput.prototype.processReading = function (reading: any, timestamp: number, ...args: any[]) {
      (window as any).microphoneFrames.push({timestamp, midi: reading?.midi ?? null, level: reading?.level ?? null, quietGap: args[0] ?? false});
      return original.call(this, reading, timestamp, ...args);
    };
  });
  const xml = `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Clarinet</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${Array.from({length:4}, () => '<note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>').join('')}</measure></part></score-partwise>`;
  await page.getByLabel('MusicXMLで演奏する', {exact:true}).setInputFiles({name:'repeated-notes.musicxml',mimeType:'application/xml',buffer:Buffer.from(xml)});
  await confirmImportedPart(page);
  await expect(page.getByRole('button', {name:'▶ 演奏開始',exact:true})).toBeEnabled();
  await page.getByLabel('練習モード', {exact:true}).selectOption('wait');
  await page.getByRole('button', {name:'マイクで演奏する',exact:true}).click();
  await expect(page.getByRole('button', {name:'マイクを停止',exact:true})).toBeVisible();
  await page.getByRole('button', {name:'▶ 演奏開始',exact:true}).click();
  await page.evaluate(() => {
    (window as any).startRepeatedNotes();
    const until = performance.now() + 650;
    while (performance.now() < until) {}
  });
  try { await expect(page.locator('.status-pill')).toHaveText('演奏終了'); }
  catch (error) {
    await testInfo.attach('microphone-frames', { body: JSON.stringify(await page.evaluate(() => (window as any).microphoneFrames)), contentType: 'application/json' });
    throw error;
  }
  await expect(page.getByLabel('演奏位置', {exact:true})).toHaveValue('4');
  await page.getByRole('button', {name:'マイクを停止',exact:true}).click();
  await page.evaluate(() => (window as any).closeRepeatedNotes());
});

for (const interruption of ['ended', 'suspended']) test(`${interruption} microphone stops following at the current beat and can reconnect explicitly`,async({page})=>{
  await page.addInitScript(()=>{
    const original=AudioContext.prototype.createMediaStreamSource;
    AudioContext.prototype.createMediaStreamSource=function(stream){(window as any).microphoneContext=this;return original.call(this,stream);};
    navigator.mediaDevices.getUserMedia=async()=>{
      const context=new AudioContext();await context.resume();
      const oscillator=context.createOscillator();oscillator.frequency.value=440;
      const destination=context.createMediaStreamDestination();oscillator.connect(destination);oscillator.start();
      (window as any).microphoneTrack=destination.stream.getAudioTracks()[0];
      return destination.stream;
    };
  });
  await page.goto('/perform?view=settings');
  await page.getByLabel('MusicXMLで演奏する',{exact:true}).setInputFiles('public/scores/sample-duet.musicxml');
  await confirmImportedPart(page);
  await page.getByRole('button',{name:'マイクで演奏する',exact:true}).click();
  await expect(page.getByRole('button',{name:'マイクを停止',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'▶ 演奏開始',exact:true}).click();
  await expect.poll(()=>page.getByLabel('演奏位置',{exact:true}).inputValue()).not.toBe('0');
  await page.evaluate(async interruption=>{if(interruption==='suspended') await (window as any).microphoneContext.suspend();else {const track=(window as any).microphoneTrack;track.stop();track.dispatchEvent(new Event('ended'));}},interruption);
  await expect(page.getByRole('alert')).toContainText('マイク入力が中断しました');
  await expect(page.getByRole('button',{name:'■ 停止',exact:true})).toHaveCount(0);
  const beat=await page.getByLabel('演奏位置',{exact:true}).inputValue();expect(Number(beat)).toBeGreaterThan(0);
  await expect(page.locator('.pitch-reading')).toHaveText('—');
  await page.getByRole('button',{name:'マイクで演奏する',exact:true}).click();
  await expect(page.getByRole('button',{name:'マイクを停止',exact:true})).toBeVisible();
  await expect(page.getByLabel('演奏位置',{exact:true})).toHaveValue(beat);
  await expect(page.getByRole('button',{name:'■ 停止',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'▶ 演奏開始',exact:true}).click();
  await expect(page.getByRole('button',{name:'■ 停止',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'マイクを停止',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
