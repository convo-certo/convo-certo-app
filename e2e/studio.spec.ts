import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";

async function openDuet(page: Page) {
  await page.goto("/perform");
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles("public/scores/sample-duet.musicxml");
  await page.getByRole("button", { name: "このパートで練習", exact: true }).click();
  await expect(page.locator(".printable-score svg").first()).toBeVisible();
}

async function exportXML(page: Page) {
  await page.getByRole("button", { name: "保存と設定", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "指示付きMusicXMLを保存", exact: true }).click();
  return pending;
}

test("auditions the score with real audio and stops on navigation", async ({ page }) => {
  await page.addInitScript(() => {
    const close = AudioContext.prototype.close;
    const original = AudioBufferSourceNode.prototype.start;
    Object.assign(window, { closes: 0, starts: 0 });
    AudioContext.prototype.close = function () {
      (window as unknown as { closes: number }).closes++;
      return close.call(this);
    };
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof original>) {
      (window as unknown as { starts: number }).starts++;
      return original.apply(this, args);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "全パートを聴く" }).click();
  await expect(page.getByText("再生中", { exact: true })).toBeVisible({ timeout: 20000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { starts: number }).starts)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "伴奏だけを聴く" }).click();
  await expect(page.getByRole("button", { name: "伴奏だけを聴く" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "■ 停止", exact: true }).click();
  await expect(page.getByText("ボタンを押すと音が出ます")).toBeVisible();
  await page.getByRole("button", { name: "全パートを聴く" }).click();
  await expect(page.getByText("再生中", { exact: true })).toBeVisible();
  const before = await page.evaluate(() => (window as unknown as { closes: number }).closes);
  await page.getByRole("link", { name: "自分の楽譜で始める" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { closes: number }).closes)).toBeGreaterThan(before);
  await expect(page.getByLabel("MusicXMLで演奏する", { exact: true })).toBeVisible();
});

test("imports directly into a compact instrument workspace and previews before applying", async ({ page }) => {
  await page.addInitScript(() => {
    const original = AudioBufferSourceNode.prototype.start;
    (window as unknown as { starts: number }).starts = 0;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof original>) {
      (window as unknown as { starts: number }).starts++;
      return original.apply(this, args);
    };
  });
  await openDuet(page);
  await expect(page).toHaveURL(/view=score/);
  await expect(page.getByRole("group", { name: "練習の操作" }).getByRole("button")).toHaveCount(6);
  await expect(page.getByText("演奏記録・表現モデル（実験）", { exact: true })).not.toBeVisible();
  const before = await exportXML(page);
  const originalXML = await readFile((await before.path())!, "utf8");
  await page.getByRole("button", { name: "◒ 表情", exact: true }).click();
  const preview = page.getByRole("region", { name: "表情を聴き比べる" }).first();
  await preview.getByLabel("試す音の変化", { exact: true }).selectOption("tender");
  await preview.getByRole("button", { name: "A この指示なし" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { starts: number }).starts)).toBeGreaterThan(0);
  await preview.getByRole("button", { name: "B 変化を聴く" }).click();
  await expect(preview.getByRole("button", { name: "B 変化を聴く" })).toHaveAttribute("aria-pressed", "true");
  const unapplied = await exportXML(page);
  expect(await readFile((await unapplied.path())!, "utf8")).toBe(originalXML);
  await page.getByRole("button", { name: "◒ 表情", exact: true }).click();
  await preview.getByLabel("試す音の変化", { exact: true }).selectOption("tender");
  await preview.getByRole("button", { name: "楽譜に残す", exact: true }).click();
  await expect(page.locator('[data-score-memo][data-score-measure="1"]')).toHaveAttribute("aria-label", /柔らかく寄り添う/);
  await preview.getByRole("button", { name: "B 変化を聴く" }).click();
  await page.getByRole("button", { name: "▶ 演奏する", exact: true }).click();
  await expect(preview.getByRole("button", { name: "B 変化を聴く" })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => page.locator('.ensemble-light[data-sounding="true"]').count(), { timeout: 12000 }).toBeGreaterThan(0);
  await page.goBack();
  await expect(page.getByLabel("MusicXMLで演奏する", { exact: true })).toBeVisible();
  await expect(page.locator('.ensemble-light[data-sounding="true"]')).toHaveCount(0);
});

test("score memos and expression instructions round-trip through MusicXML on a phone", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDuet(page);
  await page.getByRole("button", { name: "楽譜に書き込む" }).click();
  await page.locator('[data-score-beat="4"]').first().click();
  const editor = page.getByLabel("2小節のメモと演奏指示", { exact: true });
  await editor.getByLabel("試す音の変化", { exact: true }).selectOption("tender");
  await editor.getByRole("button", { name: "楽譜に残す", exact: true }).click();
  await editor.getByLabel("楽譜に残すメモ", { exact: true }).fill("息をたっぷり <大切>");
  await editor.getByRole("button", { name: "メモを残す", exact: true }).click();
  await expect(page.locator('[data-score-memo][data-score-measure="2"]')).toHaveAttribute("aria-label", /息をたっぷり <大切>/);
  const file = await exportXML(page);
  const path = testInfo.outputPath("annotated.musicxml");
  await file.saveAs(path);
  await page.getByRole("button", { name: "‹ マイ楽譜", exact: true }).click();
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles(path);
  await page.getByRole("button", { name: "このパートで練習", exact: true }).click();
  await expect(page.locator('[data-score-memo][data-score-measure="2"]')).toHaveAttribute("aria-label", /柔らかく寄り添う.*息をたっぷり <大切>/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect((await page.locator(".printable-score").boundingBox())!.height).toBeGreaterThan(180);
  await page.screenshot({ path: "/tmp/studio-phone-final.png" });
});

test("remembers actual practice and resumes the same tempo and loop after reload", async ({ page }) => {
  await openDuet(page);
  await page.getByRole("button", { name: /100 BPM/ }).click();
  await page.getByLabel("カウントイン", { exact: true }).selectOption("0");
  await page.getByLabel("演奏テンポ", { exact: true }).fill("88");
  await page.getByRole("button", { name: "↻ 区間", exact: true }).click();
  await page.getByLabel("開始小節", { exact: true }).fill("1");
  await page.getByLabel("終了小節", { exact: true }).fill("2");
  await page.getByRole("button", { name: "くり返す", exact: true }).click();
  await page.getByRole("button", { name: "練習ツールを閉じる", exact: true }).click();
  await page.getByRole("button", { name: "♫ お手本", exact: true }).click();
  await page.waitForTimeout(3300);
  await page.getByRole("button", { name: "■ 試聴を止める", exact: true }).click();
  await page.getByRole("button", { name: "‹ マイ楽譜", exact: true }).click();
  await expect(page.getByRole("region", { name: "最近の練習" })).not.toBeVisible();
  await page.getByRole("button", { name: "楽譜で練習", exact: true }).click();
  await page.getByRole("button", { name: "▶ 演奏する", exact: true }).click();
  await page.waitForTimeout(6500);
  await page.getByRole("button", { name: "■ 停止", exact: true }).click();
  await page.getByRole("button", { name: "‹ マイ楽譜", exact: true }).click();
  const journal = page.getByRole("region", { name: "最近の練習" });
  await expect(journal.getByRole("button", { name: /練習を再開/ })).toBeVisible();
  await expect(journal).toContainText("1日 · 1回");
  await expect(journal).toContainText("♩ 88 · 1–2小節");
  await page.reload();
  await journal.getByRole("button", { name: /練習を再開/ }).click();
  await expect(page.getByRole("button", { name: /88 BPM/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "↻ 1–2 小節", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "このパートで練習", exact: true })).toHaveCount(0);
});

test("keeps phone entry simple with exactly two starter scores", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/", "/perform"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: "ConvoCerto", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }
  await expect(page.getByRole("region", { name: "はじめの2曲" }).getByRole("button")).toHaveCount(2);
  await page.screenshot({ path: "/tmp/studio-library-phone.png", fullPage: true });
});
