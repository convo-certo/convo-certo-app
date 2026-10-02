import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ locale: "en-US" });

async function reachControl(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeInViewport({ ratio: 1 });
  await control.click({ trial: true });
}

async function closeTool(page: Page) {
  await page.locator(".score-stage-sheet").scrollIntoViewIfNeeded();
  await expect(page.getByRole("group", { name: "Score", exact: true })).toBeInViewport();
  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
  const toolbar = page.getByRole("group", { name: "Practice controls", exact: true });
  await expect(toolbar.getByRole("button")).toHaveCount(6);
  for (const button of await toolbar.getByRole("button").all()) await expect(button).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("group", { name: "Score", exact: true })).toBeInViewport();
  await expect(page.locator(".printable-score svg").first()).toBeVisible();
}

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 1200, height: 700 }]) {
  test(`practice tools remain reachable and saved changes stay visible at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/perform");
    await page.getByLabel("Play a MusicXML score", { exact: true }).setInputFiles("public/scores/sample-duet.musicxml");
    await page.getByRole("button", { name: "Practise this part", exact: true }).click();
    await expect(page.locator(".printable-score svg").first()).toBeVisible();

    await page.getByRole("button", { name: /Adjust tempo/ }).click();
    const tempo = page.getByLabel("Practice tempo", { exact: true });
    const countIn = page.getByLabel("Count-in", { exact: true });
    await reachControl(tempo);
    await tempo.fill("88");
    await reachControl(countIn);
    await countIn.selectOption("2");
    await closeTool(page);
    await expect(page.getByRole("button", { name: "Adjust tempo 88 BPM", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Adjust tempo 88 BPM", exact: true }).click();
    await expect(tempo).toHaveValue("88");
    await expect(countIn).toHaveValue("2");
    await closeTool(page);

    await page.getByRole("button", { name: "↻ Loop", exact: true }).click();
    const first = page.getByLabel("Start bar", { exact: true });
    const last = page.getByLabel("End bar", { exact: true });
    await reachControl(first);
    await first.fill("2");
    await reachControl(last);
    await last.fill("5");
    const loop = page.getByRole("button", { name: "Turn loop on", exact: true });
    await reachControl(loop);
    await loop.click();
    const leadIn = page.getByRole("button", { name: "One bar before my entry", exact: true });
    await leadIn.scrollIntoViewIfNeeded();
    await expect(leadIn).toBeInViewport({ ratio: 1 });
    await expect(leadIn).toBeDisabled();
    await closeTool(page);
    await page.getByRole("button", { name: "↻ Bars 2–5", exact: true }).click();
    await expect(first).toHaveValue("2");
    await expect(last).toHaveValue("5");
    await expect(page.getByRole("button", { name: "Loop on", exact: true })).toHaveAttribute("aria-pressed", "true");
    await closeTool(page);

    await page.getByRole("button", { name: "◒ Expression", exact: true }).click();
    const expression = page.locator('.studio-tool-panel[data-tool="expression"]');
    await reachControl(expression.getByRole("button", { name: "Add to score", exact: true }));
    await closeTool(page);

    await page.getByRole("button", { name: "Save and settings", exact: true }).click();
    const menu = page.locator(".studio-menu");
    const volume = menu.getByLabel("Accompaniment volume", { exact: true });
    await reachControl(volume);
    await volume.fill("58");
    for (const name of ["Restart this bar", "Export practice file", "Export annotated MusicXML", "Instrument & accompaniment", "How to practise"]) {
      await reachControl(menu.getByRole("button", { name, exact: true }));
    }
    const save = menu.getByRole("button", { name: "Save practice", exact: true });
    await reachControl(save);
    await save.click();
    const saved = menu.getByRole("status").filter({ hasText: /^Saved$/ });
    await expect(saved).toBeInViewport({ ratio: 1 });
    await expect(save).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath("saved-feedback-visible.png") });
    await closeTool(page);
    await page.getByRole("button", { name: "Save and settings", exact: true }).click();
    await expect(volume).toHaveValue("58");
    await closeTool(page);

    await expect(page.getByRole("button", { name: "Adjust tempo 88 BPM", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "↻ Bars 2–5", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}
