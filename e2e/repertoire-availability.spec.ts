import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { openLibrary } from "./helpers/studio";

test("offers exactly two starter scores and opens each without starting playback", async ({ page }) => {
  await page.goto("/perform");
  const starters = page.getByRole("region", { name: "はじめの2曲", exact: true });
  await expect(starters.getByRole("button")).toHaveCount(2);
  await expect(starters.getByRole("button", { name: /短いデュエット/ })).toBeVisible();
  await expect(starters.getByRole("button", { name: /モーツァルト：クラリネット協奏曲/ })).toBeVisible();
  await expect(starters.getByRole("link", { name: "楽譜・音源の出典", exact: true })).toHaveAttribute("href", "/credits.html");
  await expect(page.getByLabel("MusicXMLで演奏する", { exact: true })).toBeVisible();
  for (const name of [/短いデュエット/, /モーツァルト：クラリネット協奏曲/]) {
    await starters.getByRole("button", { name }).click();
    await expect(page.locator('[data-screen="practice"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "▶ 演奏する", exact: true })).toBeEnabled({ timeout: 20000 });
    await expect(page.locator(".printable-score [data-score-beat]").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: "■ 停止", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("演奏位置", { exact: true })).toHaveValue("0");
    await openLibrary(page);
    await expect(starters.getByRole("button")).toHaveCount(2);
  }
});

test("a starter fetch failure allows an imported score and an explicit retry", async ({ page }) => {
  let unavailable = true;
  let requests = 0;
  await page.route("**/repertoire/ensemble/mozart-k622-2.musicxml", async route => {
    requests++;
    if (unavailable) await route.fulfill({ status: 503, body: "temporarily unavailable" });
    else await route.continue();
  });
  await page.goto("/perform");
  const starters = page.getByRole("region", { name: "はじめの2曲", exact: true });
  const mozart = starters.getByRole("button", { name: /モーツァルト：クラリネット協奏曲/ });
  await mozart.click();
  await expect(starters.getByRole("alert")).toContainText("楽譜を開けませんでした");
  await expect(mozart).toBeEnabled();
  await expect(page.locator('[data-screen="library"]')).toBeVisible();
  expect(requests).toBe(1);
  const xml = (await readFile("public/scores/sample-duet.musicxml", "utf8")).replace("ConvoCerto Sample Duet", "持ち込んだ練習曲");
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles({ name: "my-practice.musicxml", mimeType: "application/xml", buffer: Buffer.from(xml) });
  await expect(page.getByRole("button", { name: "▶ 演奏する", exact: true })).toBeEnabled();
  await expect(page.getByRole("navigation", { name: "練習画面の切り替え" })).toContainText("持ち込んだ練習曲");
  await expect(page.locator(".printable-score [data-score-beat]").first()).toBeVisible();
  await openLibrary(page);
  unavailable = false;
  await mozart.click();
  await expect(page.getByRole("button", { name: "▶ 演奏する", exact: true })).toBeEnabled({ timeout: 20000 });
  await expect(page.locator(".printable-score [data-score-beat]").first()).toBeVisible({ timeout: 20000 });
  expect(requests).toBe(2);
  await openLibrary(page);
  await expect(starters.getByRole("alert")).toHaveCount(0);
});
