import {test,expect} from '@playwright/test';
test('seeking inside a held note restarts its remaining sound without waiting for another onset',async({page})=>{
 await page.addInitScript(()=>{
  (window as any).heldStarts=0;
  const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(...args:Parameters<AudioBufferSourceNode['start']>){(window as any).heldStarts++;return start.apply(this,args);};
 });
 await page.goto('/perform');
 const xml='<score-partwise><part-list><score-part id="C"><part-name>Clarinet</part-name></score-part></part-list><part id="C"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><type>breve</type></note></measure></part></score-partwise>';
 await page.getByLabel('MusicXMLで演奏する',{exact:true}).setInputFiles({name:'held.musicxml',mimeType:'application/xml',buffer:Buffer.from(xml)});
 await expect(page.getByRole('button',{name:'▶ 演奏開始',exact:true})).toBeEnabled();
 await page.getByLabel('練習モード').selectOption('listen');
 await page.getByLabel('カウントイン',{exact:true}).selectOption('0');
 await page.getByRole('button',{name:'▶ 演奏開始',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).heldStarts)).toBe(1);
 await page.getByLabel('演奏位置',{exact:true}).fill('4');
 await expect.poll(()=>page.evaluate(()=>(window as any).heldStarts)).toBe(2);
 await page.waitForTimeout(200);
 expect(await page.evaluate(()=>(window as any).heldStarts)).toBe(2);
 await page.getByRole('button',{name:'■ 停止',exact:true}).click();
});
