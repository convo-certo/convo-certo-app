import { openSettings, openScore } from "./helpers/studio";
import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test("renders the concert welcome page", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveText("ConvoCerto");
  });

  test("opens the two starter scores without exposing development pages", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('a[href^="/step"]')).toHaveCount(0);
    await page.getByRole("link", { name: "収録曲で試す", exact: false }).click();
    await expect(page).toHaveURL("/perform?catalog=1");
    const starters = page.getByRole("region", { name: "はじめの2曲" });
    await expect(starters.getByRole("button")).toHaveCount(2);
    await expect(starters.getByRole("button").first()).toBeFocused();
  });

  test("starts the integrated concert from the main action", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", {name:"自分の楽譜で始める"}).click();
    await expect(page).toHaveURL("/perform");
  });
});

test.describe("Step 1 - Score Display + Playback", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/step1");
  });

  test("renders step 1 page with header", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("ConvoCerto");
    await expect(page.locator("h2")).toContainText("Step 1");
  });

  test("has stage navigation", async ({ page }) => {
    await page.getByRole("navigation", {name:"主な画面"}).getByRole("link", {name:"共奏へ", exact:true}).click();
    await expect(page).toHaveURL(/\/perform$/);
    await expect(page.getByLabel("MusicXMLで演奏する", {exact:true})).toBeVisible();
  });

  test("shows score placeholder when no score loaded", async ({ page }) => {
    await expect(
      page.locator("text=MusicXML ファイルを読み込んでください")
    ).toBeVisible();
  });

  test("loads and displays sample duet", async ({ page }) => {
    const select = page.getByRole("combobox").filter({ has: page.locator('option[value="/scores/sample-duet.musicxml"]') });
    await select.selectOption("/scores/sample-duet.musicxml");

    await expect(page.locator(".printable-score svg").first()).toBeVisible({ timeout: 15000 });
  });

  test("can start and stop playback", async ({ page }) => {
    const select = page.getByRole("combobox").filter({ has: page.locator('option[value="/scores/sample-duet.musicxml"]') });
    await select.selectOption("/scores/sample-duet.musicxml");

    await expect(page.locator(".printable-score svg").first()).toBeVisible({ timeout: 15000 });

    const playButton = page.locator('button:has-text("▶")');
    await playButton.click();

    await expect(page.locator("text=演奏中")).toBeVisible({ timeout: 5000 });

    const stopButton = page.locator('button:has-text("■")');
    await stopButton.click();

    await expect(page.locator("text=準備完了")).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Step 2 - Karaoke Mode", () => {
  test("renders step 2 page", async ({ page }) => {
    await page.goto("/step2");
    await expect(page.locator("h2")).toContainText("Step 2");
  });

  test("shows MIDI device selector", async ({ page }) => {
    await page.goto("/step2");
    await expect(page.locator("text=MIDI 入力:")).toBeVisible();
  });
});

test.describe("Step 3 - Adaptive Accompaniment", () => {
  test("renders step 3 page", async ({ page }) => {
    await page.goto("/step3");
    await expect(page.locator("h2")).toContainText("Step 3");
  });

  test("shows lead/follow indicator after loading score", async ({ page }) => {
    await page.goto("/step3");
    const select = page.getByRole("combobox").filter({ has: page.locator('option[value="/scores/sample-duet.musicxml"]') });
    await select.selectOption("/scores/sample-duet.musicxml");

    await expect(page.locator("text=AI リード")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("text=奏者追従")).toBeVisible();
  });
});

test.describe("Step 4 - Full Rehearsal", () => {
  test("opens the integrated repertoire rehearsal", async ({ page }) => {
    await page.goto("/step4?view=settings");
    await expect(page.getByRole("heading", { name: "Step 4 — フルリハーサル", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "はじめの2曲" }).getByRole("button")).toHaveCount(2);
    await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles("public/scores/sample-duet.musicxml");
    await expect(page.getByRole("button", { name: "▶ 演奏開始", exact: true })).toBeEnabled();
  });
});

test.describe("Stage navigation", () => {
  test("opens credits separately while keeping the rehearsal score", async ({ page }) => {
    await page.goto("/perform");
    await page.getByLabel("MusicXMLで演奏する", {exact:true}).setInputFiles("public/scores/sample-duet.musicxml");
    await expect(page.locator(".printable-score svg").first()).toBeVisible();
    await expect(page.locator('[data-screen="practice"]')).toBeVisible();
    await openSettings(page);
    const popup = page.waitForEvent("popup");
    await page.getByRole("navigation", {name:"主な画面"}).getByRole("link", {name:"出典・クレジット"}).click();
    const credits = await popup;
    await expect(credits.getByRole("heading", {name:/出典|クレジット/}).first()).toBeVisible();
    await credits.close();
    await expect(page).toHaveURL(/\/perform\?view=settings$/);
    await openScore(page);
    await expect(page.locator(".printable-score svg").first()).toBeVisible();
  });

  test("navigates home from header logo", async ({ page }) => {
    await page.goto("/step1");
    await page.locator("header a h1").click();
    await expect(page).toHaveURL("/");
  });
});
