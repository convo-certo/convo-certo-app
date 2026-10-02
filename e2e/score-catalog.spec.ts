import { expect, test } from "@playwright/test";

test.use({ locale: "en-US" });

async function openCatalog(page: import("@playwright/test").Page) {
  await page.goto("/perform");
  await page.locator(".repertoire-drawer summary").click();
  await expect(page.locator("[data-score-id]")).toHaveCount(8);
  return page.locator(".repertoire-drawer");
}

test("the additional catalogue loads on demand, keeps two starters, and finds string parts from MIDI metadata", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => { if (request.url().includes("/repertoire/library/")) requests.push(request.url()); });
  await page.goto("/perform");
  await expect(page.getByRole("region", { name: "Two starter scores", exact: true }).getByRole("button")).toHaveCount(2);
  await expect(page.locator(".repertoire-drawer summary")).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.locator(".repertoire-drawer summary").click();
  await expect(page.locator("[data-score-id]")).toHaveCount(8);
  expect(requests.filter(url => url.endsWith("catalog.json"))).toHaveLength(1);
  expect(requests.filter(url => url.endsWith(".mxl"))).toHaveLength(0);
  await page.getByLabel("Instrument", { exact: true }).selectOption("viola");
  await page.getByLabel("Search scores", { exact: true }).fill("Haydn");
  const haydn = page.locator('[data-score-id="library-23470"]');
  await expect(haydn).toBeVisible();
  await expect(haydn).toContainText("Viola");
  await expect(page.locator("[data-score-id]")).toHaveCount(1);
  await page.getByLabel("Search scores", { exact: true }).fill("no such rehearsal piece");
  await expect(page.locator("[data-score-id]")).toHaveCount(0);
});

test("an actual compressed brass score engraves and starts only when Listen is pressed", async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { scoreSounds: number };
    state.scoreSounds = 0;
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<AudioBufferSourceNode["start"]>) {
      state.scoreSounds++;
      return original.apply(this, args);
    };
  });
  await openCatalog(page);
  await page.locator('[data-score-id="corelli-sarabande-brass-ensemble"]').getByRole("button").click();
  await expect(page.getByRole("button", { name: "Practise this part", exact: true })).toBeEnabled();
  await expect(page.locator(".printable-score [data-score-beat]").first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { scoreSounds: number }).scoreSounds)).toBe(0);
  await page.getByRole("button", { name: "♫ Listen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { scoreSounds: number }).scoreSounds)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "■ Stop listening", exact: true }).click();
  await page.getByRole("button", { name: "‹ My scores", exact: true }).click();
  await expect(page.locator('[data-score-id="corelli-sarabande-brass-ensemble"]')).toBeVisible();
});

test("a quartet with unnamed source parts opens with a recognisable title and instrument choices", async ({ page }) => {
  await openCatalog(page);
  await page.locator('[data-score-id="library-23470"]').getByRole("button").click();
  await expect(page.getByRole("button", { name: "Practise this part", exact: true })).toBeEnabled();
  await expect(page.getByRole("navigation", { name: "Practice navigation", exact: true })).toContainText("Haydn");
  const parts = page.locator(".studio-part-picker").getByLabel("Your part", { exact: true });
  await parts.selectOption("P3");
  await expect(parts.locator("option:checked")).toContainText("Viola");
  await page.getByRole("button", { name: "Practise this part", exact: true }).click();
  await expect(page.locator(".printable-score [data-score-beat]").first()).toBeVisible();
});

test("a flute filter overrides Mozart's default clarinet part while keeping explicit confirmation", async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    const state = window as unknown as { catalogueNoteStarts: number };
    state.catalogueNoteStarts = 0;
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<AudioBufferSourceNode["start"]>) {
      state.catalogueNoteStarts++;
      return original.apply(this, args);
    };
  });
  const catalog = await openCatalog(page);
  await catalog.getByLabel("Search scores", { exact: true }).fill("Mozart 40");
  const mozart = catalog.locator('[data-score-id="library-207890"]');
  await mozart.getByRole("button").click();
  const confirm = page.getByRole("button", { name: "Practise this part", exact: true });
  const part = page.locator(".studio-part-picker").getByLabel("Your part", { exact: true });
  await expect(confirm).toBeEnabled();
  await expect(part).toHaveValue("P2");
  await expect(part.locator("option:checked")).toHaveText("Clarinetti in B.");
  await page.getByRole("button", { name: "‹ My scores", exact: true }).click();
  await catalog.getByLabel("Instrument", { exact: true }).selectOption("flute");
  await mozart.getByRole("button").click();
  await expect(confirm).toBeEnabled();
  await expect(part).toHaveValue("P3");
  await expect(part.locator("option:checked")).toHaveText("Flauto.");
  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await expect(part).toBeFocused();
  await expect(part).toHaveValue("P3");
  await expect(confirm).toBeVisible();
  await expect(page.getByRole("button", { name: "■ Stop", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Playback position", { exact: true })).toHaveValue("0");
  expect(await page.evaluate(() => (window as unknown as { catalogueNoteStarts: number }).catalogueNoteStarts)).toBe(0);
  await confirm.click();
  await expect(page.locator(".studio-part-picker")).toHaveCount(0);
  await expect(page.locator(".studio-part > button").first()).toContainText("Flauto.");
});

test("a Japanese composer alias finds an English-titled quartet and carries the viola choice into practice", async ({ page }) => {
  const catalog = await openCatalog(page);
  await page.getByLabel("Language", { exact: true }).selectOption("ja");
  await catalog.getByLabel("楽器", { exact: true }).selectOption("viola");
  await catalog.getByLabel("曲を検索", { exact: true }).fill("ハイドン");
  const haydn = catalog.locator('[data-score-id="library-23470"]');
  await expect(catalog.locator("[data-score-id]")).toHaveCount(1);
  await expect(haydn.getByRole("heading")).toContainText("Joseph Haydn");
  await haydn.getByRole("button").click();
  const confirm = page.getByRole("button", { name: "このパートで練習", exact: true });
  const part = page.locator(".studio-part-picker").getByLabel("奏者パート", { exact: true });
  await expect(confirm).toBeEnabled();
  await expect(part).toHaveValue("P3");
  await expect(part.locator("option:checked")).toHaveText("Viola");
  await expect(page.getByLabel("演奏位置", { exact: true })).toHaveValue("0");
  await expect(page.getByRole("button", { name: "■ 停止", exact: true })).toHaveCount(0);
  await confirm.click();
  await expect(page.locator(".studio-part-picker")).toHaveCount(0);
  await expect(page.locator(".studio-part > button").first()).toContainText("Viola");
});

test("catalogue and score download failures have usable retries", async ({ page }) => {
  let catalogFails = true;
  let scoreFails = true;
  await page.route("**/repertoire/library/catalog.json", route => catalogFails ? route.fulfill({ status: 503, body: "Unavailable" }) : route.continue());
  await page.route("**/repertoire/library/corelli-sarabande-brass-ensemble.mxl", route => scoreFails ? route.fulfill({ status: 200, body: "<html>unavailable</html>" }) : route.continue());
  await page.goto("/perform");
  const catalog = page.locator(".repertoire-drawer");
  await catalog.locator("summary").click();
  await expect(catalog.getByRole("alert")).toBeVisible();
  catalogFails = false;
  await catalog.getByRole("button", { name: /Retry/ }).click();
  await expect(page.locator("[data-score-id]")).toHaveCount(8);
  const score = page.locator('[data-score-id="corelli-sarabande-brass-ensemble"]');
  await score.getByRole("button").click();
  await expect(catalog.getByRole("alert")).toBeVisible();
  await expect(page.locator(".printable-score svg")).toHaveCount(0);
  scoreFails = false;
  await score.getByRole("button").click();
  await expect(page.getByRole("button", { name: "Practise this part", exact: true })).toBeEnabled();
});

test("a delayed catalogue download cannot replace a newer imported score", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/repertoire/library/corelli-sarabande-brass-ensemble.mxl", async route => { await pending; await route.continue().catch(() => {}); });
  await openCatalog(page);
  await page.locator('[data-score-id="corelli-sarabande-brass-ensemble"]').getByRole("button").click();
  await expect(page.locator(".score-catalog-notice").filter({ hasText: "Opening" })).toBeVisible();
  await page.getByLabel("Play a MusicXML score", { exact: true }).setInputFiles("public/scores/sample-duet.musicxml");
  await expect(page.getByRole("button", { name: "Practise this part", exact: true })).toBeEnabled();
  const title = await page.getByRole("navigation", { name: "Practice navigation", exact: true }).locator("strong").textContent();
  release();
  await page.getByRole("button", { name: "‹ My scores", exact: true }).click();
  await expect(page.locator('[data-score-id="corelli-sarabande-brass-ensemble"]').getByRole("button")).toBeEnabled();
  await page.getByRole("navigation", { name: "Practice navigation", exact: true }).getByRole("button", { name: "Score", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Practice navigation", exact: true }).locator("strong")).toHaveText(title!);
});

for (const width of [320, 390]) test(`catalogue filters and score actions fit a ${width}px phone in both languages`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const catalog = await openCatalog(page);
  for (const [locale, search, instrument] of [["en", "Search scores", "Instrument"], ["ja", "曲を検索", "楽器"]] as const) {
    await page.getByLabel("Language", { exact: true }).selectOption(locale);
    await catalog.getByLabel(instrument, { exact: true }).selectOption("piano");
    await catalog.getByLabel(search, { exact: true }).fill("Schumann");
    const solo = catalog.locator('[data-score-id="library-58525"]');
    await expect(solo).toBeVisible();
    await expect(solo).toContainText(locale === "en" ? "No separate accompaniment" : "独立伴奏なし");
    await solo.getByRole("button").scrollIntoViewIfNeeded();
    await expect(solo.getByRole("button")).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
