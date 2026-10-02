import { test, expect } from '@playwright/test';

test('credits expose soundfont attribution and packaged software license text', async ({ page }) => {
  await page.setViewportSize({width:320,height:740});
  await page.goto('/');
  await page.getByRole('link',{name:'出典とクレジット',exact:true}).click();
  await expect(page.getByRole('heading',{name:'出典とクレジット',exact:true})).toBeVisible();
  const japanese = page.locator('article[lang="ja"]');
  await expect(japanese.getByText(/FluidR3 General MIDI — Frank Wen/)).toBeVisible();
  await expect(japanese.getByRole('link',{name:'Creative Commons Attribution 3.0',exact:true})).toHaveAttribute('href','https://creativecommons.org/licenses/by/3.0/');
  await expect(japanese.locator('[data-instrument-bank-count]')).toHaveText('34');
  await page.getByRole('link',{name:'English',exact:true}).focus();
  await page.keyboard.press('Enter');
  const english = page.locator('article[lang="en"]');
  await expect(english).toBeFocused();
  await expect(english.getByRole('heading',{name:'Sources & credits',exact:true})).toBeInViewport();
  await expect(english.getByText(/FluidR3 General MIDI — Frank Wen/)).toBeVisible();
  await expect(english.locator('[data-instrument-bank-count]')).toHaveText('34');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await english.getByRole('link',{name:'License texts and copyright notices',exact:true}).click();
  const react = page.locator('details').filter({has:page.locator('summary').filter({hasText:/^react 19\./})});
  await react.locator('summary').click();
  await expect(react).toContainText('Permission is hereby granted');
  await expect(react).toContainText('Copyright');
  const routerBuild = page.locator('details').filter({has:page.locator('summary').filter({hasText:/^@react-router\/dev 7\./})});
  await routerBuild.locator('summary').click();
  await expect(routerBuild).toContainText('Permission is hereby granted');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
