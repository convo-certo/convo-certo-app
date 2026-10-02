import { confirmImportedPart } from "./helpers/studio";
import {test,expect} from '@playwright/test';

test('losing the selected MIDI device pauses accompaniment while unrelated devices do not',async({page})=>{
  await page.addInitScript(()=>{
    const input={id:'clarimate',name:'ClariMate',manufacturer:'Test',state:'connected',onmidimessage:null};
    const other={id:'other',name:'Other',manufacturer:'Test',state:'connected',onmidimessage:null};
    const access={inputs:new Map([[input.id,input],[other.id,other]]),onstatechange:null};
    (window as any).midiFixture={input,other,access};
    Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>access});
  });
  await page.goto('/perform?view=settings');
  await page.getByLabel('MusicXMLで演奏する',{exact:true}).setInputFiles('public/scores/sample-duet.musicxml');
  await confirmImportedPart(page);
  await page.getByRole('button',{name:'ClariMate / MIDIを接続',exact:true}).click();
  await expect(page.getByLabel('MIDI機器',{exact:true})).toHaveValue('clarimate');
  await page.getByRole('button',{name:'▶ 演奏開始',exact:true}).click();
  await expect.poll(()=>page.getByLabel('演奏位置',{exact:true}).inputValue()).not.toBe('0');
  await page.evaluate(()=>{const f=(window as any).midiFixture;f.other.state='disconnected';f.access.onstatechange();});
  await expect(page.getByRole('button',{name:'■ 停止',exact:true})).toBeVisible();
  await page.evaluate(()=>{const f=(window as any).midiFixture;f.lateMessage=f.input.onmidimessage;f.input.state='disconnected';f.access.onstatechange();f.lateMessage({data:new Uint8Array([0x90,60,90])});});
  await expect(page.getByText('演奏中のMIDI機器が切断されました。機器を選び直し、演奏開始で続けられます。',{exact:true})).toBeVisible();
  await expect(page.getByLabel('MIDI機器',{exact:true})).toHaveValue('');
  await expect(page.getByRole('button',{name:'■ 停止',exact:true})).toHaveCount(0);
  await expect(page.locator('.midi-reading')).toHaveText('MIDI入力を待っています');
  const beat=await page.getByLabel('演奏位置',{exact:true}).inputValue();expect(Number(beat)).toBeGreaterThan(0);
  await page.evaluate(()=>{const f=(window as any).midiFixture;f.input.state='connected';f.access.onstatechange();});
  await page.getByLabel('MIDI機器',{exact:true}).selectOption('clarimate');
  await page.evaluate(()=>{(window as any).midiFixture.lateMessage({data:new Uint8Array([0x90,60,127])});});
  await expect(page.locator('.midi-reading')).toHaveText('MIDI入力を待っています');
  await expect(page.getByLabel('演奏位置',{exact:true})).toHaveValue(beat);
  await expect(page.getByRole('button',{name:'■ 停止',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'▶ 演奏開始',exact:true}).click();
  await expect(page.getByRole('button',{name:'■ 停止',exact:true})).toBeVisible();
});

test('leaving during MIDI permission does not attach the late connection',async({page})=>{
 await page.addInitScript(()=>{
  const access={inputs:new Map(),onstatechange:null};
  (window as any).pendingMIDI={access,requested:false,resolve:null};
  Object.defineProperty(navigator,'requestMIDIAccess',{value:()=>new Promise(resolve=>{(window as any).pendingMIDI.requested=true;(window as any).pendingMIDI.resolve=resolve;})});
 });
 await page.goto('/perform?view=settings');
 await page.getByLabel('MusicXMLで演奏する',{exact:true}).setInputFiles('public/scores/sample-duet.musicxml');
 await confirmImportedPart(page);
 await page.getByRole('button',{name:'ClariMate / MIDIを接続',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).pendingMIDI.requested)).toBe(true);
 await page.getByRole('link',{name:'ConvoCerto ホーム',exact:true}).click();
 await expect(page).toHaveURL('/');
 await expect(page.getByRole('link',{name:'自分の楽譜で始める',exact:true})).toBeVisible();
 await page.evaluate(async()=>{const f=(window as any).pendingMIDI;f.resolve(f.access);await new Promise(resolve=>setTimeout(resolve,0));});
 expect(await page.evaluate(()=>(window as any).pendingMIDI.access.onstatechange===null)).toBe(true);
 await page.getByRole('link',{name:'自分の楽譜で始める',exact:true}).click();
 await expect(page).toHaveURL('/perform');
});
