import { expect, test } from "@playwright/test";

test.use({ locale: "en-US" });

for (const [instrument, name, key] of [
  ["flute", "Flute", "0"],
  ["alto-sax", "Alto Saxophone", "-9"],
  ["tenor-sax", "Tenor Saxophone", "-14"],
  ["horn", "Horn in F", "-7"],
  ["viola", "Viola", "0"],
  ["cello", "Violoncello", "0"],
  ["piano", "Piano Melody", "0"],
] as const) {
  test(`${instrument} opens a playable duet with the right part and instrument key`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      const state = window as unknown as { starterSounds: number };
      state.starterSounds = 0;
      const original = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args: Parameters<AudioBufferSourceNode["start"]>) {
        state.starterSounds++;
        return original.apply(this, args);
      };
    });
    await page.goto("/perform");
    const starters = page.getByRole("region", { name: "Two starter scores", exact: true });
    await starters.getByLabel("Your duet instrument", { exact: true }).selectOption(instrument);
    await expect(starters).toContainText("written key and clef");
    await starters.getByRole("button", { name: /A short duet/ }).click();
    await expect(page.getByRole("button", { name: "Practise this part", exact: true })).toBeEnabled();
    await expect(page.locator(".studio-part-picker").getByLabel("Your part", { exact: true })).toHaveValue("P1");
    await expect(page.locator(".studio-part-picker").getByLabel("Your part", { exact: true }).locator("option:checked")).toHaveText(name);
    await expect(page.locator(".studio-part-picker").getByLabel("Your instrument", { exact: true })).toHaveValue(key);
    await expect(page.getByRole("button", { name: "Practise this part", exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.locator(".printable-score [data-score-beat]").first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { starterSounds: number }).starterSounds)).toBe(0);
    await page.getByRole("button", { name: "Practise this part", exact: true }).click();
    await page.getByRole("button", { name: "♫ Listen", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { starterSounds: number }).starterSounds)).toBeGreaterThan(0);
    await page.getByRole("button", { name: "■ Stop listening", exact: true }).click();
    await page.getByRole("button", { name: "‹ My scores", exact: true }).click();
    await expect(starters.getByLabel("Your duet instrument", { exact: true })).toHaveValue(instrument);
  });
}

test("the duet instrument picker fits a 320px phone in both languages", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/perform");
  for (const [locale, name] of [["en", "Your duet instrument"], ["ja", "デュエットの楽器"]] as const) {
    await page.getByLabel("Language", { exact: true }).selectOption(locale);
    const picker = page.getByLabel(name, { exact: true });
    await picker.scrollIntoViewIfNeeded();
    await expect(picker).toBeInViewport({ ratio: 1 });
    await expect(picker).toHaveValue("preview");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
