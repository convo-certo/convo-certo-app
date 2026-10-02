import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:100%;height:100%}</style>${readFileSync('public/brand/icon.svg', 'utf8')}`);
  await page.screenshot({ path: 'public/brand/icon-1024.png', omitBackground: true });
} finally { await browser.close(); }
for (const size of [180, 192, 512]) execFileSync('sips', ['-z', String(size), String(size), 'public/brand/icon-1024.png', '--out', `public/brand/icon-${size}.png`]);
if (process.platform === 'darwin') {
  const folder = 'build/ConvoCerto.iconset';
  mkdirSync(folder, { recursive: true });
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) execFileSync('sips', ['-z', String(size * scale), String(size * scale), 'public/brand/icon-1024.png', '--out', `${folder}/icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`]);
  }
  mkdirSync('native/Resources', { recursive: true });
  execFileSync('iconutil', ['-c', 'icns', folder, '-o', 'native/Resources/ConvoCerto.icns']);
}
