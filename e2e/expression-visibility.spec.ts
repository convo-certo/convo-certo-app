import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 1200, height: 700 }]) {
  test(`opening expression exposes its controls and comparison at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/perform?catalog=1");
    await page.getByLabel("デュエットの楽器", { exact: true }).selectOption("flute");
    await page.getByRole("button", { name: /短いデュエット/ }).click();
    await page.getByRole("button", { name: "このパートで練習", exact: true }).click();
    await page.getByRole("button", { name: "◒ 表情", exact: true }).click();
    const panel = page.locator('.studio-tool-panel[data-tool="expression"]');
    await expect(panel.getByLabel("試す音の変化", { exact: true })).toBeInViewport({ ratio: 1 });
    await panel.getByLabel("試す音の変化", { exact: true }).selectOption("tender");
    for (const label of ["A この指示なし", "B 変化を聴く", "楽譜に残す"]) {
      await expect(panel.getByRole("button", { name: label, exact: true })).toBeInViewport({ ratio: 1 });
      await panel.getByRole("button", { name: label, exact: true }).click({ trial: true });
    }
    await expect(panel.locator(".expression-preview-status")).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath("expression-visible.png") });
    await page.locator(".score-stage-sheet").scrollIntoViewIfNeeded();
    await expect(page.locator(".printable-score")).toBeInViewport();
    await panel.getByRole("button", { name: "練習ツールを閉じる" }).click();
    await expect(page.getByRole("button", { name: "▶ 演奏する", exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.locator(".ensemble-presence")).toBeVisible();
  });
}
