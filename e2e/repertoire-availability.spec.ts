import {test,expect} from '@playwright/test';

test('unbundled local repertoire is unavailable and can be checked again without blocking MusicXML',async({page})=>{
 let available=false;
 await page.route('**/repertoire/local/brahms-*.json',async route=>{
  if(available) await route.continue();
  else await route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>SPA fallback</title>'});
 });
 await page.goto('/perform');
 const brahms=page.locator('article').filter({hasText:'JOHANNES BRAHMS'});
 await expect(brahms.getByText('データ未確認',{exact:true})).toHaveCount(3);
 for(const button of await brahms.locator('.movement-list button').all()) await expect(button).toBeDisabled();
 await expect(brahms).toContainText('配布版には含めていません');
 await expect(page.getByRole('alert')).toHaveCount(0);
 await page.getByLabel('MusicXMLで演奏する',{exact:true}).setInputFiles('public/scores/sample-duet.musicxml');
 await expect(page.getByRole('button',{name:'▶ 演奏開始',exact:true})).toBeEnabled();
 await page.getByText('曲を選ぶ・持ち込み楽譜を開く',{exact:true}).click();
 available=true;
 await brahms.getByRole('button',{name:'データを再確認',exact:true}).click();
 await expect(brahms.locator('.movement-list button').first()).toBeEnabled();
 await brahms.locator('.movement-list button').first().click();
 await expect(page.getByRole('button',{name:'▶ 演奏開始',exact:true})).toBeEnabled();
});
