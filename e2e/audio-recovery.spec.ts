import { confirmImportedPart } from "./helpers/studio";
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
  await page.goto('/perform?view=settings');
  await page.getByLabel('MusicXMLで演奏する', { exact: true }).setInputFiles('public/scores/sample-duet.musicxml');
  await confirmImportedPart(page);
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
  await expect(page.getByText('音声を再開できませんでした。音声出力先を確認してもう一度お試しください。', { exact: true })).toBeVisible();
  expect(Number(await position.inputValue())).toBe(held);
  await page.evaluate(() => { (window as any).playbackContext.resume = (window as any).originalResume; });
  const notes = await page.evaluate(() => (window as any).scheduledNotes);
  await page.getByRole('button', { name: '音声を復旧して再開', exact: true }).click();
  await expect(page.getByRole('button', { name: '■ 停止', exact: true })).toBeVisible();
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(held + 0.5);
  await expect.poll(() => page.evaluate(() => (window as any).scheduledNotes)).toBeGreaterThan(notes);
  await expect(page.getByRole('button', { name: '音声を復旧して再開', exact: true })).toBeHidden();
});

test.describe('English audio recovery', () => {
  test.use({ locale: 'en-US' });

  test('browser rejection and a closed output have localized, distinct recovery guidance', async ({ page }) => {
    await page.addInitScript(() => {
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args: Parameters<AudioBufferSourceNode['start']>) {
        (window as unknown as { playbackContext: BaseAudioContext }).playbackContext = this.context;
        return start.apply(this, args);
      };
    });
    await page.goto('/perform');
    await page.getByLabel('Play a MusicXML score', { exact: true }).setInputFiles('public/scores/sample-duet.musicxml');
    await page.getByRole('button', { name: 'Practise this part', exact: true }).click();
    await page.getByRole('button', { name: /Adjust tempo/ }).click();
    await page.getByLabel('Count-in', { exact: true }).selectOption('0');
    await page.getByRole('button', { name: 'Close practice tools', exact: true }).click();
    await page.getByRole('button', { name: '▶ Play', exact: true }).click();
    const position = page.getByLabel('Playback position', { exact: true });
    await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(0.5);
    await page.evaluate(async () => {
      const context = (window as unknown as { playbackContext: AudioContext }).playbackContext;
      await context.suspend();
      context.resume = () => Promise.reject(new DOMException('ブラウザから拒否されました', 'NotAllowedError'));
    });
    await page.getByRole('button', { name: 'Restore audio and resume', exact: true }).click();
    const error = page.locator('.concert-error');
    await expect(error).toHaveText("Audio playback was blocked. Check your browser's sound settings, then try again.");
    const held = await position.inputValue();
    await page.getByRole('navigation', { name: 'Practice navigation' }).getByLabel('Language', { exact: true }).selectOption('ja');
    await expect(error).toHaveText('音声の再開が許可されていません。ブラウザの音声設定を確認して、もう一度操作してください。');
    await page.getByRole('navigation', { name: '練習画面の切り替え' }).getByLabel('言語', { exact: true }).selectOption('en');
    await expect(error).toContainText('Audio playback was blocked.');
    await expect(position).toHaveValue(held);
    await page.evaluate(async () => { await (window as unknown as { playbackContext: AudioContext }).playbackContext.close(); });
    await page.getByRole('button', { name: 'Restore audio and resume', exact: true }).click();
    await expect(error).toHaveText('Audio is no longer available for this score. Reopen the score to continue.');
    await expect(page.getByRole('button', { name: '■ Stop', exact: true })).toHaveCount(0);
  });

  test('missing instrument samples identify the sound failure instead of blaming valid MusicXML', async ({ page }) => {
    await page.route('**/audio/fluid/clarinet/C1.mp3', route => route.fulfill({ status: 404, body: '' }));
    await page.goto('/perform');
    await page.getByLabel('Play a MusicXML score', { exact: true }).setInputFiles('public/scores/sample-duet.musicxml');
    const error = page.locator('.concert-error');
    await expect(error).toHaveText('Instrument sounds could not be loaded. Check your connection, then reopen the score. (Clarinet)');
    await expect(page.getByLabel('Play a MusicXML score', { exact: true })).toBeEnabled();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByLabel('Language', { exact: true }).selectOption('ja');
    await expect(error).toContainText('楽器の音源を読み込めませんでした。');
  });
});


test('a running audio context with a frozen clock pauses safely and resumes only on request', async ({page}) => {
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(...args: Parameters<AudioBufferSourceNode['start']>) {
      (window as any).playbackContext = this.context;
      return start.apply(this,args);
    };
  });
  await page.goto('/perform?view=settings');
  await page.getByLabel('MusicXMLで演奏する',{exact:true}).setInputFiles('public/scores/sample-duet.musicxml');
  await confirmImportedPart(page);
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
