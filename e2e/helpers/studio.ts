import { expect, type Page } from "@playwright/test";

export async function openDisclosure(page: Page, name: string | RegExp) {
  const summary = page.locator("summary").filter({ hasText: typeof name === "string" ? new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) : name });
  await expect(summary).toHaveCount(1);
  await expect(summary).toBeVisible();
  const details = summary.locator("..");
  if (!await details.evaluate(element => element.hasAttribute("open"))) await summary.click();
  await expect(details).toHaveAttribute("open", "");
}

export async function openSettings(page: Page) {
  const nav = page.getByRole("navigation", { name: "練習画面の切り替え" });
  await nav.getByRole("button", { name: "設定", exact: true }).click();
  await expect(page.locator('[data-screen="settings"]')).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("settings");
}

export async function openLibrary(page: Page) {
  const surface = page.locator(".studio-shell");
  await expect(surface).toHaveCount(1);
  if (await surface.getAttribute("data-screen") !== "library") {
    await page.getByRole("navigation", { name: "練習画面の切り替え" }).getByRole("button", { name: "‹ マイ楽譜", exact: true }).click();
  }
  await expect(page.locator('[data-screen="library"]')).toBeVisible();
  await openDisclosure(page, /^保存した楽譜 /);
  await expect(page.getByRole("region", { name: "マイ楽譜", exact: true })).toBeVisible();
}

export async function openScore(page: Page) {
  await page.getByRole("navigation", { name: "練習画面の切り替え" }).getByRole("button", { name: "楽譜で練習", exact: true }).click();
  await expect(page.locator('[data-screen="practice"]')).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("score");
}

export async function confirmImportedPart(page: Page) {
  await expect(page.getByRole("button", { name: /^▶ (演奏する|演奏開始)$/ })).toBeEnabled({ timeout: 25000 });
  const settings = await page.locator(".studio-shell").getAttribute("data-screen") === "settings";
  if (settings) await openScore(page);
  await page.getByRole("button", { name: "このパートで練習", exact: true }).click();
  await expect(page.locator(".studio-part-picker")).toBeHidden();
  if (settings) await openSettings(page);
}

export async function openRestoredSettings(page: Page) {
  await expect(page.locator('[data-screen="practice"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "▶ 演奏する", exact: true })).toBeEnabled();
  await openSettings(page);
}

export async function openEnsembleLab(page: Page) {
  await openDisclosure(page, "演奏記録・表現モデル（実験）");
}
