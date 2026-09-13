import { test, expect } from '@playwright/test';

test('normal and italic fonts load with external requests blocked and attribution stays accessible', async ({page}) => {
  const external:string[]=[];
  await page.route('**/*', route=>{
    const url=new URL(route.request().url());
    if (url.hostname!=='localhost' && url.hostname!=='127.0.0.1') {external.push(url.href); return route.abort();}
    return route.continue();
  });
  await page.goto('/perform');
  await expect(page.getByLabel('MusicXMLで演奏する',{exact:true})).toBeVisible();
  const fonts=await page.evaluate(async()=>{
    const regular=await document.fonts.load('400 16px Inter','ConvoCerto');
    const italic=await document.fonts.load('italic 700 16px Inter','ConvoCerto');
    return [regular,italic].map(faces=>faces.map(face=>face.status));
  });
  expect(fonts).toEqual([['loaded'],['loaded']]);
  expect(external).toEqual([]);
  await page.goto('/credits.html');
  await page.getByRole('link',{name:'SIL Open Font License 1.1 本文'}).click();
  await expect(page.locator('body')).toContainText('The Inter Project Authors');
  await expect(page.locator('body')).toContainText('SIL OPEN FONT LICENSE Version 1.1');
});
