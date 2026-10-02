import { confirmImportedPart, openDisclosure } from "./helpers/studio";
import { test, expect } from '@playwright/test';

test('failed vision runtime shows a recoverable error without opening a camera', async ({ page }) => {
  const requests:string[]=[];
  await page.route('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@*/wasm/**', route => { requests.push(route.request().url()); return route.abort(); });
  await page.addInitScript(() => {
    (window as any).cameraRequested=false;
    navigator.mediaDevices.getUserMedia=async()=>{ (window as any).cameraRequested=true;throw new Error('Camera must not be requested'); };
  });
  await page.goto('/perform?view=settings');
  await page.getByLabel('MusicXMLで演奏する',{exact:true}).setInputFiles('public/scores/sample-duet.musicxml');
  await confirmImportedPart(page);
  await openDisclosure(page, "小節ごとの指示・読み込みと書き出し");
  await page.getByRole('button',{name:'うなずきで合図する',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('姿勢認識を準備できませんでした');
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every(url=>url.includes('@0.10.32/wasm/'))).toBe(true);
  expect(await page.evaluate(()=>(window as any).cameraRequested)).toBe(false);
  await openDisclosure(page, "小節ごとの指示・読み込みと書き出し");
  await page.getByRole('button',{name:'カメラを停止',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await openDisclosure(page, "小節ごとの指示・読み込みと書き出し");
  await page.getByRole('button',{name:'うなずきで合図する',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('姿勢認識を準備できませんでした');
  await expect(page.getByRole('button',{name:'▶ 演奏開始',exact:true})).toBeEnabled();
});
