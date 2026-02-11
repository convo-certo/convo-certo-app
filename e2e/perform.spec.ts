import { test, expect } from "@playwright/test";

test.describe("Perform page (legacy)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/perform");
  });

  test("renders the ConvoCerto header", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("ConvoCerto");
  });

  test("shows the Japanese subtitle", async ({ page }) => {
    await expect(page.locator("text=インタラクティブ音楽演奏エージェント")).toBeVisible();
  });

  test("has a sample score dropdown", async ({ page }) => {
    const select = page.locator("header select");
    await expect(select).toBeVisible();
    const options = select.locator("option");
    await expect(options).toHaveCount(4);
  });

  test("shows placeholder when no score loaded", async ({ page }) => {
    await expect(
      page.locator("text=MusicXML ファイルを読み込んでください")
    ).toBeVisible();
  });

  test("loads Mozart K.622 sample score", async ({ page }) => {
    const select = page.locator("header select");
    await select.selectOption("/scores/mozart-k622-adagio.musicxml");

    await expect(page.locator("text=スコア情報")).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.locator("text=/タイトル.*K\\.622/")
    ).toBeVisible();
  });

  test("shows score info sidebar after loading", async ({ page }) => {
    const select = page.locator("header select");
    await select.selectOption("/scores/mozart-k622-adagio.musicxml");

    await expect(page.locator("text=スコア情報")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("text=テンポ").first()).toBeVisible();
    await expect(page.locator("text=50 BPM")).toBeVisible();
    await expect(page.locator("text=小節数")).toBeVisible();
  });

  test("renders OSMD score display after loading", async ({ page }) => {
    const select = page.locator("header select");
    await select.selectOption("/scores/mozart-k622-adagio.musicxml");

    await page.waitForSelector("svg", { timeout: 15000 });
    const svgCount = await page.locator("svg").count();
    expect(svgCount).toBeGreaterThan(0);
  });

  test("transport controls are disabled without score", async ({ page }) => {
    const playButton = page.locator('button:has-text("▶")');
    await expect(playButton).toBeDisabled();
  });

  test("transport controls are enabled after loading score", async ({
    page,
  }) => {
    const select = page.locator("header select");
    await select.selectOption("/scores/mozart-k622-adagio.musicxml");

    await expect(page.locator("text=スコア情報")).toBeVisible({
      timeout: 10000,
    });

    const playButton = page.locator('button:has-text("▶"), button:has-text("■")').first();
    await expect(playButton).toBeEnabled();
  });

  test("can start and stop playback", async ({ page }) => {
    const select = page.locator("header select");
    await select.selectOption("/scores/mozart-k622-adagio.musicxml");

    await expect(page.locator("text=スコア情報")).toBeVisible({
      timeout: 10000,
    });

    await expect(
      page.locator("text=開始合図を待機中...").first()
    ).toBeVisible({ timeout: 5000 });

    const stopButton = page.locator('button:has-text("■")');
    await stopButton.click();

    await expect(page.locator("text=準備完了").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("shows lead/follow indicator after loading", async ({ page }) => {
    const select = page.locator("header select");
    await select.selectOption("/scores/mozart-k622-adagio.musicxml");

    await expect(page.locator("text=AI リード")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("text=奏者追従")).toBeVisible();
  });

  test("shows annotation badges", async ({ page }) => {
    const select = page.locator("header select");
    await select.selectOption("/scores/mozart-k622-adagio.musicxml");

    await expect(page.locator("text=follow:moderate").first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("text=follow:strong").first()).toBeVisible();
    await expect(page.locator("text=lead:moderate").first()).toBeVisible();
  });

  test("can toggle rehearsal mode", async ({ page }) => {
    const select = page.locator("header select");
    await select.selectOption("/scores/mozart-k622-adagio.musicxml");

    await expect(page.locator("text=スコア情報")).toBeVisible({
      timeout: 10000,
    });

    const rehearsalBtn = page.locator("text=リハーサル").first();
    await rehearsalBtn.click();

    await expect(
      page.locator("text=リハーサルコマンド")
    ).toBeVisible({ timeout: 5000 });
  });

  test("loads sample duet score", async ({ page }) => {
    const select = page.locator("header select");
    await select.selectOption("/scores/sample-duet.musicxml");

    await expect(page.locator("text=スコア情報")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("text=100 BPM")).toBeVisible();
  });

  test("loads Mozart K.581 Trio score", async ({ page }) => {
    const select = page.locator("header select");
    await select.selectOption("/scores/mozart-k581-trio.musicxml");

    await expect(page.locator("text=スコア情報")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("text=120 BPM")).toBeVisible();
  });
});

test.describe("Home page", () => {
  test("renders home with stage cards", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveText("ConvoCerto");
  });

  test("shows 4 stage cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=楽譜表示 + 再生")).toBeVisible();
    await expect(page.locator("text=カラオケモード")).toBeVisible();
    await expect(page.locator("text=追従伴奏")).toBeVisible();
    await expect(page.locator("text=フルリハーサル")).toBeVisible();
  });

  test("navigates to Step 1 from home", async ({ page }) => {
    await page.goto("/");
    await page.locator("text=Step 1 から始める").click();
    await expect(page).toHaveURL("/step1");
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
    const navLinks = page.locator("nav a");
    await expect(navLinks).toHaveCount(4);
  });

  test("shows score placeholder when no score loaded", async ({ page }) => {
    await expect(
      page.locator("text=MusicXML ファイルを読み込んでください")
    ).toBeVisible();
  });

  test("loads and displays Mozart K.622", async ({ page }) => {
    const select = page.locator("select");
    await select.selectOption("/scores/mozart-k622-adagio.musicxml");

    await page.waitForSelector("svg", { timeout: 15000 });
    const svgCount = await page.locator("svg").count();
    expect(svgCount).toBeGreaterThan(0);
  });

  test("can start and stop playback", async ({ page }) => {
    const select = page.locator("select");
    await select.selectOption("/scores/mozart-k622-adagio.musicxml");

    await page.waitForSelector("svg", { timeout: 15000 });

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
    const select = page.locator("select");
    await select.selectOption("/scores/mozart-k622-adagio.musicxml");

    await expect(page.locator("text=AI リード")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("text=奏者追従")).toBeVisible();
  });
});

test.describe("Step 4 - Full Rehearsal", () => {
  test("renders step 4 page", async ({ page }) => {
    await page.goto("/step4");
    await expect(page.locator("h2")).toContainText("Step 4");
  });

  test("shows transport controls with rehearsal button", async ({ page }) => {
    await page.goto("/step4");
    await expect(page.locator("text=リハーサル").first()).toBeVisible();
  });

  test("can toggle rehearsal mode after loading score", async ({ page }) => {
    await page.goto("/step4");
    const select = page.locator("select");
    await select.selectOption("/scores/mozart-k622-adagio.musicxml");

    await expect(page.locator("text=スコア情報")).toBeVisible({
      timeout: 10000,
    });

    const rehearsalBtn = page.locator("text=リハーサル").first();
    await rehearsalBtn.click();

    await expect(
      page.locator("text=リハーサルコマンド")
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Stage navigation", () => {
  test("navigates between steps via header nav", async ({ page }) => {
    await page.goto("/step1");

    await page.locator("nav a").nth(1).click();
    await expect(page).toHaveURL("/step2");

    await page.locator("nav a").nth(2).click();
    await expect(page).toHaveURL("/step3");

    await page.locator("nav a").nth(3).click();
    await expect(page).toHaveURL("/step4");

    await page.locator("nav a").nth(0).click();
    await expect(page).toHaveURL("/step1");
  });

  test("navigates home from header logo", async ({ page }) => {
    await page.goto("/step1");
    await page.locator("header a h1").click();
    await expect(page).toHaveURL("/");
  });
});
