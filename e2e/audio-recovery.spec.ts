import { test, expect } from '@playwright/test';

test('audio interruption preserves position, requires explicit recovery, and resumes sound', async ({ page }) => {
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    (window as any).scheduledNotes = 0;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<AudioBufferSourceNode['start']>) {
      (window as any).playbackContext = this.context;
      (window as any).scheduledNotes++;
      return start.apply(this, args);
    };
  });
  await page.goto('/perform');
  await page.getByLabel('MusicXMLで演奏する', { exact: true }).setInputFiles('public/scores/sample-duet.musicxml');
  await expect(page.getByRole('button', { name: '▶ 演奏開始', exact: true })).toBeEnabled();
  await page.getByLabel('カウントイン', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '▶ 演奏開始', exact: true }).click();
  const position = page.getByLabel('演奏位置', { exact: true });
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(0.5);
  await page.evaluate(async () => { await (window as any).playbackContext.suspend(); });
  await expect(page.getByRole('button', { name: '音声を復旧して再開', exact: true })).toBeVisible();
  const held = Number(await position.inputValue());
  expect(held).toBeGreaterThan(0.5);
  await page.evaluate(async () => { await (window as any).playbackContext.resume(); });
  await page.waitForTimeout(300);
  expect(Number(await position.inputValue())).toBe(held);
  await expect(page.getByRole('button', { name: '▶ 演奏開始', exact: true })).toBeVisible();
  await page.evaluate(async () => { await (window as any).playbackContext.suspend(); });
  await page.evaluate(() => {
    const context = (window as any).playbackContext;
    (window as any).originalResume = context.resume;
    context.resume = () => Promise.reject(new Error('Audio recovery test failure'));
  });
  await page.getByRole('button', { name: '音声を復旧して再開', exact: true }).click();
  await expect(page.getByText('Audio recovery test failure', { exact: true })).toBeVisible();
  expect(Number(await position.inputValue())).toBe(held);
  await page.evaluate(() => { (window as any).playbackContext.resume = (window as any).originalResume; });
  const notes = await page.evaluate(() => (window as any).scheduledNotes);
  await page.getByRole('button', { name: '音声を復旧して再開', exact: true }).click();
  await expect(page.getByRole('button', { name: '■ 停止', exact: true })).toBeVisible();
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(held + 0.5);
  await expect.poll(() => page.evaluate(() => (window as any).scheduledNotes)).toBeGreaterThan(notes);
  await expect(page.getByRole('button', { name: '音声を復旧して再開', exact: true })).toBeHidden();
});


test('a running audio context with a frozen clock pauses safely and resumes only on request', async ({page}) => {
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(...args: Parameters<AudioBufferSourceNode['start']>) {
      (window as any).playbackContext = this.context;
      return start.apply(this,args);
    };
  });
  await page.goto('/perform');
  await page.getByLabel('MusicXMLで演奏する',{exact:true}).setInputFiles('public/scores/sample-duet.musicxml');
  await expect(page.getByRole('button',{name:'▶ 演奏開始',exact:true})).toBeEnabled();
  await page.getByLabel('カウントイン',{exact:true}).selectOption('0');
  await page.getByLabel('練習モード').selectOption('listen');
  await page.getByRole('button',{name:'▶ 演奏開始',exact:true}).click();
  const position=page.getByLabel('演奏位置',{exact:true});
  await expect.poll(async()=>Number(await position.inputValue())).toBeGreaterThan(0.5);
  await page.evaluate(()=>{
    const context=(window as any).playbackContext;
    (window as any).frozenAudioTime=context.currentTime;
    Object.defineProperty(context,'currentTime',{configurable:true,get:()=>(window as any).frozenAudioTime});
  });
  await expect(page.getByText('音声の時間が進んでいません。音声出力先を確認して、音声を復旧して再開してください。',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'音声を復旧して再開',exact:true})).toBeVisible();
  const held=Number(await position.inputValue());
  await page.evaluate(()=>{delete (window as any).playbackContext.currentTime;});
  await page.waitForTimeout(350);
  expect(Number(await position.inputValue())).toBe(held);
  await page.getByRole('button',{name:'音声を復旧して再開',exact:true}).click();
  await expect.poll(async()=>Number(await position.inputValue())).toBeGreaterThan(held+0.5);
});
