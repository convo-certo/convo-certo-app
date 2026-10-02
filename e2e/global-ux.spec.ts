import { test, expect, type Page } from "@playwright/test";

test.use({ locale: "en-US" });

async function openScore(page: Page) {
  await page.goto("/perform");
  await page.getByLabel("Play a MusicXML score", { exact: true }).setInputFiles("public/scores/sample-duet.musicxml");
  await expect(page.locator(".studio-part-picker")).toBeVisible();
  await page.getByRole("button", { name: "Practise this part", exact: true }).click();
  await expect(page.locator(".printable-score svg").first()).toBeVisible();
}

async function savedPractices(page: Page) {
  return page.evaluate(async () => {
    const modulePath = "/app/lib/score-library.ts";
    const { listLibraryScores } = await import(modulePath);
    return listLibraryScores();
  });
}

test("starter link lands on its scores, and the language choice survives reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Try a starter score", exact: false }).click();
  const firstScore = page.locator("#starter-scores button").first();
  await expect(firstScore).toBeFocused();
  await expect(page.locator("#starter-scores button")).toHaveCount(2);
  await page.getByLabel("Language", { exact: true }).selectOption("ja");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await page.reload();
  await expect(page.getByLabel("MusicXMLで演奏する", { exact: true })).toBeVisible();
  await expect(page.getByLabel("言語", { exact: true })).toHaveValue("ja");
});

test("switching language keeps the loaded piano part, tempo and running audio", async ({ page }) => {
  await page.addInitScript(() => {
    const original = AudioContext.prototype.close;
    (window as unknown as { audioCloses: number }).audioCloses = 0;
    AudioContext.prototype.close = function () {
      (window as unknown as { audioCloses: number }).audioCloses++;
      return original.call(this);
    };
  });
  await openScore(page);
  await page.getByRole("button", { name: "Check instrument and microphone", exact: true }).click();
  await page.locator(".studio-part-picker").getByLabel("Your part", { exact: true }).selectOption({ label: "Piano" });
  await page.getByRole("button", { name: "Practise this part", exact: true }).click();
  await page.getByRole("button", { name: /Adjust tempo/ }).click();
  await page.getByLabel("Count-in", { exact: true }).selectOption("0");
  await page.getByLabel("Practice tempo", { exact: true }).fill("88");
  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await expect.poll(async () => Number(await page.getByLabel("Playback position", { exact: true }).inputValue())).toBeGreaterThan(0.25);
  const position = Number(await page.getByLabel("Playback position", { exact: true }).inputValue());
  const closes = await page.evaluate(() => (window as unknown as { audioCloses: number }).audioCloses);
  await page.getByRole("navigation", { name: "Practice navigation" }).getByLabel("Language", { exact: true }).selectOption("ja");
  await expect(page.getByRole("button", { name: "■ 停止", exact: true })).toBeVisible();
  await expect(page.locator(".studio-part > button").first()).toContainText("Piano");
  await expect(page.getByRole("button", { name: /88 BPM/ })).toBeVisible();
  await expect.poll(async () => Number(await page.getByLabel("演奏位置", { exact: true }).inputValue())).toBeGreaterThan(position);
  expect(await page.evaluate(() => (window as unknown as { audioCloses: number }).audioCloses)).toBe(closes);
  await page.getByRole("button", { name: "■ 停止", exact: true }).click();
});

test("repeated saving updates one practice and keeps the latest score note", async ({ page }) => {
  await openScore(page);
  await page.getByRole("button", { name: "Save and settings", exact: true }).click();
  await page.getByRole("button", { name: "Save practice", exact: true }).click();
  await expect.poll(async () => (await savedPractices(page)).length).toBe(1);
  await page.getByRole("button", { name: "Save practice", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
  await page.getByRole("button", { name: "Mark the score", exact: false }).click();
  await page.locator('[data-score-beat="4"]').first().click();
  const editor = page.getByLabel("Bar 2 notes and instructions", { exact: true });
  await editor.getByLabel("Note on the score", { exact: true }).fill("Let the piano finish");
  await editor.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Save and settings", exact: true }).click();
  await page.getByRole("button", { name: "Save practice", exact: true }).click();
  await expect.poll(async () => (await savedPractices(page))[0]?.xml).toContain("Let the piano finish");
  expect(await savedPractices(page)).toHaveLength(1);
  await page.getByRole("button", { name: "‹ My scores", exact: true }).click();
  const library = page.getByRole("region", { name: "My scores", exact: true });
  await library.getByRole("button", { name: "ConvoCerto Sample Duet", exact: true }).click();
  await expect(page.locator('[data-score-memo][data-score-measure="2"]')).toHaveAttribute("aria-label", /Let the piano finish/);
  await page.getByRole("button", { name: "Save and settings", exact: true }).click();
  await page.getByRole("button", { name: "Save practice", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(await savedPractices(page)).toHaveLength(1);
});

test("unsupported microphone and invalid scores give usable English recovery", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true }));
  await page.goto("/perform");
  await page.getByLabel("Play a MusicXML score", { exact: true }).setInputFiles({ name: "broken.musicxml", mimeType: "application/xml", buffer: Buffer.from("<not-a-score/>") });
  await expect(page.getByRole("alert")).toContainText("Export a single score");
  await page.getByLabel("Play a MusicXML score", { exact: true }).setInputFiles("public/scores/sample-duet.musicxml");
  await page.getByRole("button", { name: "Use microphone", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("fixed tempo");
  await page.getByRole("button", { name: "Practise this part", exact: true }).click();
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "■ Stop", exact: true })).toBeVisible();
});

test("notes and changed instrument sounds resume from history without adding a session, and history can be removed", async ({ page }) => {
  const history = () => page.evaluate(async () => {
    const modulePath = "/app/lib/practice-journal.ts";
    return (await import(modulePath)).listPracticeJournal();
  });
  await openScore(page);
  await page.getByRole("button", { name: "Positions", exact: true }).click();
  await page.getByRole("button", { name: "Seat chair-1: Piano", exact: true }).click();
  await page.getByLabel("Seat instrument", { exact: true }).selectOption("flute");
  await page.getByRole("navigation", { name: "Practice navigation" }).getByRole("button", { name: "Score", exact: true }).click();
  await page.getByRole("button", { name: /Adjust tempo/ }).click();
  await page.getByLabel("Count-in", { exact: true }).selectOption("0");
  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await page.waitForTimeout(6500);
  await page.getByRole("button", { name: "■ Stop", exact: true }).click();
  await expect.poll(async () => (await history()).length).toBe(1);
  const recorded = (await history())[0];
  expect(recorded.practice.session.space.chairs.find((chair: { id: string }) => chair.id === "chair-1").instrument).toBe("flute");
  await page.getByRole("button", { name: "Positions", exact: true }).click();
  await page.getByRole("button", { name: "Seat chair-1: Piano", exact: true }).click();
  await page.getByLabel("Seat instrument", { exact: true }).selectOption("church_organ");
  await page.getByRole("navigation", { name: "Practice navigation" }).getByRole("button", { name: "Score", exact: true }).click();
  await page.getByRole("button", { name: "Mark the score", exact: false }).click();
  await page.locator('[data-score-beat="4"]').first().click();
  const editor = page.getByLabel("Bar 2 notes and instructions", { exact: true });
  await editor.getByLabel("Note on the score", { exact: true }).fill("Listen across the ensemble");
  await editor.getByRole("button", { name: "Save note", exact: true }).click();
  await expect.poll(async () => (await history())[0]?.practice.xml).toContain("Listen across the ensemble");
  const updated = (await history())[0];
  expect(updated.practice.session.space.chairs.find((chair: { id: string }) => chair.id === "chair-1").instrument).toBe("church_organ");
  expect(updated.sessionCount).toBe(recorded.sessionCount);
  expect(updated.totalPlayedSeconds).toBe(recorded.totalPlayedSeconds);
  expect(updated.lastPlayedAt).toBe(recorded.lastPlayedAt);
  expect(updated.practice.session.beat).toBe(recorded.practice.session.beat);
  expect(updated.practice.session.beat).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Save and settings", exact: true }).click();
  await page.getByRole("button", { name: "Save practice", exact: true }).click();
  await expect.poll(async () => (await savedPractices(page)).length).toBe(1);
  await page.getByRole("button", { name: "‹ My scores", exact: true }).click();
  await page.getByRole("link", { name: "ConvoCerto home", exact: true }).click();
  await page.getByRole("link", { name: "Open your score", exact: false }).click();
  await page.reload();
  const journal = page.getByRole("region", { name: "Recent practice", exact: true });
  await journal.getByRole("button", { name: /^Resume / }).click();
  await expect(page.locator('[data-score-memo][data-score-measure="2"]')).toHaveAttribute("aria-label", /Listen across the ensemble/);
  await page.getByRole("button", { name: "Positions", exact: true }).click();
  await page.getByRole("button", { name: "Seat chair-1: Piano", exact: true }).click();
  await expect(page.getByLabel("Seat instrument", { exact: true })).toHaveValue("church_organ");
  await page.getByRole("button", { name: "‹ My scores", exact: true }).click();
  await journal.getByRole("button", { name: /from history$/ }).click();
  await journal.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await history()).toHaveLength(1);
  await journal.getByRole("button", { name: /from history$/ }).click();
  await journal.getByRole("button", { name: "Remove history", exact: true }).click();
  await expect.poll(async () => (await history()).length).toBe(0);
  await page.waitForTimeout(600);
  expect(await history()).toHaveLength(0);
  expect(await savedPractices(page)).toHaveLength(1);
});

test("leaving before the history debounce flushes the last score note", async ({ page }) => {
  const history = () => page.evaluate(async () => {
    const modulePath = "/app/lib/practice-journal.ts";
    return (await import(modulePath)).listPracticeJournal();
  });
  await openScore(page);
  await page.getByRole("button", { name: /Adjust tempo/ }).click();
  await page.getByLabel("Count-in", { exact: true }).selectOption("0");
  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await page.waitForTimeout(6500);
  await page.getByRole("button", { name: "■ Stop", exact: true }).click();
  await expect.poll(async () => (await history()).length).toBe(1);
  await page.evaluate(() => {
    const original = window.setTimeout;
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => original(handler, delay === 350 ? 60_000 : delay, ...args)) as typeof window.setTimeout;
  });
  await page.getByRole("button", { name: "Mark the score", exact: false }).click();
  await page.locator('[data-score-beat="4"]').first().click();
  const editor = page.getByLabel("Bar 2 notes and instructions", { exact: true });
  await editor.getByLabel("Note on the score", { exact: true }).fill("Last thought before leaving");
  await editor.getByRole("button", { name: "Save note", exact: true }).click();
  await page.getByRole("button", { name: "‹ My scores", exact: true }).click();
  await page.getByRole("link", { name: "ConvoCerto home", exact: true }).click();
  await expect(page.locator(".welcome-hero")).toBeVisible();
  await expect.poll(async () => (await history())[0]?.practice.xml).toContain("Last thought before leaving");
  expect((await history())[0].sessionCount).toBe(1);
});
