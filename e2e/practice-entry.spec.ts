import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ locale: "en-US" });

const xml = `<score-partwise version="4.0"><work><work-title>Flute entrance study</work-title></work><part-list><score-part id="F"><part-name>Flute</part-name><midi-instrument><midi-program>74</midi-program></midi-instrument></score-part><score-part id="P"><part-name>Piano</part-name></score-part></part-list>${["F", "P"].map(id => `<part id="${id}">${Array.from({ length: 8 }, (_, index) => `<measure number="${index + 1}"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note>${id === "F" && index < 2 ? "<rest/>" : `<pitch><step>${id === "F" ? "C" : "G"}</step><octave>4</octave></pitch>`}<duration>4</duration><type>whole</type></note></measure>`).join("")}</part>`).join("")}</score-partwise>`;

test("the score toolbar selects the player's first phrase and lead-in without starting playback", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const state = window as unknown as { entrySounds: number };
    state.entrySounds = 0;
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<AudioBufferSourceNode["start"]>) {
      state.entrySounds++;
      return original.apply(this, args);
    };
  });
  await page.goto("/perform");
  await page.getByLabel("Play a MusicXML score", { exact: true }).setInputFiles({ name: "flute-entry.musicxml", mimeType: "application/xml", buffer: Buffer.from(xml) });
  await page.getByRole("button", { name: "Practise this part", exact: true }).click();
  await page.getByRole("button", { name: /Adjust tempo/ }).click();
  await page.getByLabel("Practice tempo", { exact: true }).fill("88");
  await page.getByLabel("Count-in", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
  await page.getByRole("button", { name: "↻ Loop", exact: true }).click();
  const entry = page.getByRole("button", { name: "4 bars from my first entry", exact: true });
  await entry.click();
  await expect(page.getByLabel("Start bar", { exact: true })).toHaveValue("3");
  await expect(page.getByLabel("End bar", { exact: true })).toHaveValue("6");
  await expect(page.getByRole("button", { name: "Loop on", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Playback position", { exact: true })).toHaveValue("8");
  await expect(page.locator(".status-pill")).toHaveText("Ready");
  expect(await page.evaluate(() => (window as unknown as { entrySounds: number }).entrySounds)).toBe(0);
  await page.getByRole("button", { name: "One bar before my entry", exact: true }).click();
  await expect(page.getByLabel("Start bar", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("End bar", { exact: true })).toHaveValue("6");
  await expect(page.getByLabel("Playback position", { exact: true })).toHaveValue("4");
  await page.screenshot({ path: testInfo.outputPath("entry-loop-390.png") });
  expect(await page.evaluate(() => (window as unknown as { entrySounds: number }).entrySounds)).toBe(0);
  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
  await page.getByRole("button", { name: "Adjust tempo 88 BPM", exact: true }).click();
  await expect(page.getByLabel("Count-in", { exact: true })).toHaveValue("2");
  await page.getByLabel("Count-in", { exact: true }).selectOption("0");
  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
  await page.getByRole("button", { name: "♫ Listen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { entrySounds: number }).entrySounds)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "↻ Bars 2–6", exact: true }).click();
  await entry.click();
  await expect(page.locator(".status-pill")).toHaveText("Ready");
  await expect(page.getByLabel("Playback position", { exact: true })).toHaveValue("8");
  await expect(page.getByRole("button", { name: "♫ Listen", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
  await page.getByRole("button", { name: "Save and settings", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export practice file", exact: true }).click();
  const download = await downloadPromise;
  const practice = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(practice.score.session).toMatchObject({ startMeasure: 3, loopEnd: 6, loopEnabled: true, tempo: 88, countInBars: 0, beat: 8, mode: "listen" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
