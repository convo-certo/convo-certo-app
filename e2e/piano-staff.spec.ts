import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

test.use({ locale: "en-US" });

const upperStaff = JSON.stringify(["P1", "1"]);

async function countScheduledNotes(page: Page) {
  await page.addInitScript(() => {
    const original = AudioBufferSourceNode.prototype.start;
    const state = window as unknown as { pianoNoteStarts: number };
    state.pianoNoteStarts = 0;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<AudioBufferSourceNode["start"]>) {
      state.pianoNoteStarts++;
      return original.apply(this, args);
    };
  });
}

const scheduledNotes = (page: Page) => page.evaluate(() => (window as unknown as { pianoNoteStarts: number }).pianoNoteStarts);

async function openSchumann(page: Page) {
  await countScheduledNotes(page);
  await page.goto("/perform");
  await page.getByLabel("Play a MusicXML score", { exact: true }).setInputFiles("public/repertoire/ensemble/library-58525.musicxml");
  await expect(page.getByRole("button", { name: "Practise this part", exact: true })).toBeEnabled();
  await expect(page.locator(".studio-part-picker").getByLabel("Your part", { exact: true })).toHaveValue("P1");
  return page.locator(".performance-navigation strong").innerText();
}

test("Schumann offers the whole upper staff and still requires confirmation before playing", async ({ page }) => {
  await openSchumann(page);
  const picker = page.locator(".studio-part-picker");
  await expect(picker).toContainText("Choosing the whole part leaves no accompaniment");
  await expect(picker).toContainText("Staff numbers do not specify the right or left hand");
  await expect(picker.getByRole("button", { name: "Play staff 2", exact: true })).toBeEnabled();
  await picker.getByRole("button", { name: "Play staff 1", exact: true }).click();
  await expect(picker.getByLabel("Your part", { exact: true })).toHaveValue(upperStaff);
  await expect(picker).toContainText("You play this part. The ensemble plays the rest.");
  await expect(page.locator(".studio-part > button").first()).toContainText("Piano · staff 1 (all voices)");
  await expect(page.getByRole("button", { name: "Practise this part", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Playback position", { exact: true })).toHaveValue("0");
  expect(await scheduledNotes(page)).toBe(0);

  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await expect(picker.getByLabel("Your part", { exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "■ Stop", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Playback position", { exact: true })).toHaveValue("0");
  expect(await scheduledNotes(page)).toBe(0);
  await page.getByRole("button", { name: "Practise this part", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByRole("button", { name: "■ Stop", exact: true })).toHaveCount(0);
  expect(await scheduledNotes(page)).toBe(0);

  await expect(page.getByText("All voices on your staff are highlighted; other staves are dimmed.", { exact: false })).toBeVisible();
  for (const voice of ["1", "2", "3"]) {
    const notes = page.locator(`.printable-score [data-score-staff="1"][data-score-voice="${voice}"]`);
    await expect.poll(() => notes.count()).toBeGreaterThan(0);
    await expect(notes.first()).toHaveAttribute("data-score-focused", "true");
  }
  await expect(page.locator('.printable-score [data-score-staff="1"][data-score-focused="false"]')).toHaveCount(0);
  await expect.poll(() => page.locator('.printable-score [data-score-staff="2"][data-score-focused="false"]').count()).toBeGreaterThan(0);
  await page.getByRole("button", { name: /Adjust tempo/ }).click();
  await page.getByLabel("Count-in", { exact: true }).selectOption("0");
  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await expect.poll(() => scheduledNotes(page)).toBeGreaterThan(0);
  await expect.poll(async () => Number(await page.getByLabel("Playback position", { exact: true }).inputValue())).toBeGreaterThan(0);
  await page.getByRole("button", { name: "■ Stop", exact: true }).click();
});

test("a portable piano practice retains the whole-staff seat and localizes it without autoplay", async ({ page, browser }) => {
  const title = await openSchumann(page);
  await page.locator(".studio-part-picker").getByRole("button", { name: "Play staff 1", exact: true }).click();
  await expect(page.locator(".studio-part-picker").getByLabel("Your part", { exact: true })).toHaveValue(upperStaff);
  await page.getByRole("button", { name: "Practise this part", exact: true }).click();
  await page.getByRole("button", { name: /Adjust tempo/ }).click();
  await page.getByLabel("Practice tempo", { exact: true }).fill("88");
  await page.getByLabel("Count-in", { exact: true }).selectOption("0");
  await page.getByRole("button", { name: "↻ Loop", exact: true }).click();
  await page.getByLabel("Start bar", { exact: true }).fill("9");
  await page.getByLabel("End bar", { exact: true }).fill("12");
  await page.getByRole("button", { name: "Turn loop on", exact: true }).click();
  await page.getByRole("button", { name: "Save and settings", exact: true }).click();
  const menu = page.locator(".studio-menu");
  await menu.getByRole("button", { name: "Save practice", exact: true }).click();
  await expect(menu.getByRole("status")).toHaveText("Saved");
  const downloading = page.waitForEvent("download");
  await menu.getByRole("button", { name: "Export practice file", exact: true }).click();
  const download = await downloading;
  const bytes = await readFile((await download.path())!);
  const exported = JSON.parse(bytes.toString("utf8"));
  expect(exported.score.session.seatId).toBe(upperStaff);
  expect(JSON.parse(exported.score.session.seatId)).toEqual(["P1", "1"]);
  expect(exported.score.session).toMatchObject({ tempo: 88, startMeasure: 9, loopEnd: 12, loopEnabled: true });

  const context = await browser.newContext({ locale: "ja-JP" });
  try {
    const restored = await context.newPage();
    await countScheduledNotes(restored);
    await restored.goto(new URL("/perform", page.url()).href);
    const library = restored.getByRole("region", { name: "マイ楽譜", exact: true });
    await library.locator("summary").click();
    await restored.getByLabel("練習ファイルを読み込む", { exact: true }).setInputFiles({ name: "piano-staff.convo.json", mimeType: "application/json", buffer: bytes });
    await library.getByRole("button", { name: title, exact: true }).click();
    await expect(restored.getByRole("button", { name: "▶ 演奏する", exact: true })).toBeEnabled();
    await expect(restored.getByRole("button", { name: "このパートで練習", exact: true })).toHaveCount(0);
    await expect(restored.getByRole("button", { name: "■ 停止", exact: true })).toHaveCount(0);
    await expect(restored.locator(".studio-part > button").first()).toContainText("Piano · 譜表1（全声部）");
    await expect(restored.getByRole("button", { name: "↻ 9–12 小節", exact: true })).toBeVisible();
    await expect(restored.getByRole("button", { name: /88 BPM/ })).toBeVisible();
    expect(await scheduledNotes(restored)).toBe(0);
    await restored.getByRole("button", { name: "楽器とマイクを確認", exact: true }).click();
    await expect(restored.locator(".studio-part-picker").getByLabel("奏者パート", { exact: true })).toHaveValue(upperStaff);
    await restored.getByRole("navigation", { name: "練習画面の切り替え" }).getByLabel("言語", { exact: true }).selectOption("en");
    await expect(restored.locator(".studio-part > button").first()).toContainText("Piano · staff 1 (all voices)");
    await expect(restored.locator(".studio-part-picker").getByLabel("Your part", { exact: true })).toHaveValue(upperStaff);
    await restored.getByRole("button", { name: "Close practice tools", exact: true }).click();
    await expect(restored.getByText("All voices on your staff are highlighted; other staves are dimmed.", { exact: false })).toBeVisible();
    await expect(restored.getByRole("button", { name: "↻ Bars 9–12", exact: true })).toBeVisible();
    await expect(restored.getByRole("button", { name: "■ Stop", exact: true })).toHaveCount(0);
    expect(await scheduledNotes(restored)).toBe(0);
  } finally { await context.close(); }
});
