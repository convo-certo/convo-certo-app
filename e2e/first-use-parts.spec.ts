import { expect, test, type Page } from "@playwright/test";

test.use({ locale: "en-US" });

const note = `<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>`;
const rest = `<note><rest measure="yes"/><duration>4</duration></note>`;
const xml = (parts: { name: string; bars?: string[] }[], title = "First rehearsal") => `<score-partwise version="4.0"><work><work-title>${title}</work-title></work><part-list>${parts.map((part, index) => `<score-part id="P${index}"><part-name>${part.name}</part-name></score-part>`).join("")}</part-list>${parts.map((part, index) => `<part id="P${index}">${(part.bars ?? Array(8).fill(note)).map((content, bar) => `<measure number="${bar + 1}"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${content}</measure>`).join("")}</part>`).join("")}</score-partwise>`;

async function trackSounds(page: Page) {
  await page.addInitScript(() => {
    const original = AudioBufferSourceNode.prototype.start;
    (window as unknown as { noteStarts: number }).noteStarts = 0;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<AudioBufferSourceNode["start"]>) {
      (window as unknown as { noteStarts: number }).noteStarts++;
      return original.apply(this, args);
    };
  });
}
const sounds = (page: Page) => page.evaluate(() => (window as unknown as { noteStarts: number }).noteStarts);

async function importScore(page: Page, content: string) {
  await page.goto("/perform");
  await page.getByLabel("Play a MusicXML score", { exact: true }).setInputFiles({ name: "rehearsal.musicxml", mimeType: "application/xml", buffer: Buffer.from(content) });
  await expect(page.getByRole("button", { name: "Practise this part", exact: true })).toBeEnabled();
}

async function noCountIn(page: Page) {
  await page.getByRole("button", { name: /Adjust tempo/ }).click();
  await page.getByLabel("Count-in", { exact: true }).selectOption("0");
  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
}

for (const width of [320, 390]) test(`the part confirmation stays visible on a ${width}px phone`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await importScore(page, xml([{ name: "Flute" }, { name: "Piano" }]));
  const confirm = page.getByRole("button", { name: "Practise this part", exact: true });
  await expect(confirm).toBeInViewport({ ratio: 1 });
  await page.locator(".studio-part-picker select").first().selectOption("P1");
  await expect(confirm).toBeEnabled();
  await expect(confirm).toBeInViewport({ ratio: 1 });
  await confirm.click();
  await expect(page.locator(".studio-part-picker")).toHaveCount(0);
});

test("a suggested clarinet part never starts until explicitly confirmed; reopening settings keeps that confirmation", async ({ page }) => {
  await trackSounds(page);
  await importScore(page, xml([{ name: "Flute" }, { name: "Clarinet" }, { name: "Piano" }]));
  await expect(page.locator(".studio-part-picker select").first()).toHaveValue("P1");
  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await expect(page.locator(".studio-part-picker select").first()).toBeFocused();
  await expect(page.getByRole("button", { name: "■ Stop", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Playback position", { exact: true })).toHaveValue("0");
  expect(await sounds(page)).toBe(0);
  await page.locator(".studio-part-picker select").first().selectOption("P0");
  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await expect(page.locator(".studio-part-picker select").first()).toBeFocused();
  await expect(page.getByRole("button", { name: "■ Stop", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Practise this part", exact: true }).click();
  await noCountIn(page);
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await expect.poll(() => sounds(page)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "■ Stop", exact: true }).click();
  await page.getByRole("button", { name: "Check instrument and microphone", exact: true }).click();
  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
  await page.getByRole("navigation", { name: "Practice navigation" }).getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("region", { name: "Accompaniment parts", exact: true }).getByLabel("Your part", { exact: true }).selectOption("P2");
  await expect(page.getByRole("heading", { name: "Your instrument · Piano", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Practice navigation" }).getByRole("button", { name: "Score", exact: true }).click();
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "■ Stop", exact: true })).toBeVisible();
  await expect(page.locator(".studio-part-picker")).toHaveCount(0);
});

for (const [label, parts] of [
  ["a solo score", [{ name: "Flute" }]],
  ["an accompaniment made entirely of rests", [{ name: "Flute" }, { name: "Piano", bars: Array(8).fill(rest) }]],
] as const) {
  test(`${label} explains missing accompaniment and remains playable with Listen`, async ({ page }) => {
    await trackSounds(page);
    await importScore(page, xml([...parts]));
    await expect(page.locator(".studio-part-picker")).toContainText("This score has no accompaniment notes. Use Listen");
    await page.getByRole("button", { name: "Practise this part", exact: true }).click();
    await page.getByRole("button", { name: "▶ Play", exact: true }).click();
    await expect(page.locator(".studio-part-picker select").first()).toBeFocused();
    await expect(page.getByRole("button", { name: "■ Stop", exact: true })).toHaveCount(0);
    expect(await sounds(page)).toBe(0);
    await page.getByRole("button", { name: "♫ Listen", exact: true }).click();
    await expect(page.getByRole("button", { name: "■ Stop listening", exact: true })).toBeVisible();
    await expect.poll(() => sounds(page)).toBeGreaterThan(0);
  });
}

test("an empty suggested part offers another part while Listen works before confirmation", async ({ page }) => {
  await trackSounds(page);
  await importScore(page, xml([{ name: "Flute" }, { name: "Clarinet", bars: Array(8).fill(rest) }, { name: "Piano" }]));
  await expect(page.locator(".studio-part-picker")).toContainText("This part has no notes. Choose another part");
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "■ Stop", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "♫ Listen", exact: true }).click();
  await expect.poll(() => sounds(page)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "■ Stop listening", exact: true }).click();
  await page.locator(".studio-part-picker select").first().selectOption("P0");
  await expect(page.locator(".studio-part-picker")).not.toContainText("This part has no notes");
  await page.getByRole("button", { name: "Practise this part", exact: true }).click();
  await noCountIn(page);
  const before = await sounds(page);
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await expect.poll(() => sounds(page)).toBeGreaterThan(before);
});

test("an accompaniment entry after two bars of rests is allowed", async ({ page }) => {
  await trackSounds(page);
  await importScore(page, xml([{ name: "Flute" }, { name: "Piano", bars: [rest, rest, ...Array(6).fill(note)] }]));
  await expect(page.locator(".studio-part-picker")).not.toContainText("no accompaniment");
  await page.getByRole("button", { name: "Practise this part", exact: true }).click();
  await noCountIn(page);
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "■ Stop", exact: true })).toBeVisible();
  await expect.poll(() => sounds(page), { timeout: 8000 }).toBeGreaterThan(0);
});

test("a saved part resumes without first-use confirmation", async ({ page }) => {
  await importScore(page, xml([{ name: "Flute" }, { name: "Piano" }], "Saved flute practice"));
  await page.getByRole("button", { name: "Practise this part", exact: true }).click();
  await page.getByRole("button", { name: "Save and settings", exact: true }).click();
  await page.getByRole("button", { name: "Save practice", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "‹ My scores", exact: true }).click();
  await page.reload();
  await page.getByRole("region", { name: "My scores", exact: true }).getByRole("button", { name: "Saved flute practice", exact: true }).click();
  await expect(page.getByRole("button", { name: "▶ Play", exact: true })).toBeEnabled();
  await expect(page.locator(".studio-part-picker")).toHaveCount(0);
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "■ Stop", exact: true })).toBeVisible();
});

test("transposing an imported score does not confirm its suggested part", async ({ page }) => {
  await importScore(page, xml([{ name: "Flute" }, { name: "Piano" }]));
  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
  await page.locator(".score-key-menu summary").click();
  await page.getByLabel("New key", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Transpose score", exact: true }).click();
  await expect(page.locator(".score-key-menu summary")).toHaveText("Key: G major");
  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await expect(page.locator(".studio-part-picker select").first()).toBeFocused();
  await expect(page.getByRole("button", { name: "■ Stop", exact: true })).toHaveCount(0);
});

test("a solo score still supports waiting for the player's correct MIDI note", async ({ page }) => {
  await page.addInitScript(() => {
    const input = { id: "practice-midi", name: "Practice MIDI", manufacturer: "Test", state: "connected", onmidimessage: null };
    const access = { inputs: new Map([[input.id, input]]), onstatechange: null };
    Object.defineProperty(navigator, "requestMIDIAccess", { value: async () => access });
    (window as unknown as { practiceMidi: unknown }).practiceMidi = input;
  });
  await importScore(page, xml([{ name: "Flute" }]));
  await page.getByRole("button", { name: "Practise this part", exact: true }).click();
  await noCountIn(page);
  await page.getByRole("navigation", { name: "Practice navigation" }).getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Practice mode", { exact: true }).selectOption("wait");
  await page.getByRole("button", { name: "Connect MIDI / ClariMate", exact: true }).click();
  await page.getByLabel("MIDI device", { exact: true }).selectOption("practice-midi");
  await page.getByRole("navigation", { name: "Practice navigation" }).getByRole("button", { name: "Score", exact: true }).click();
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await expect(page.locator(".studio-progress [role=status]")).toHaveText("Waiting for the written note");
  await page.evaluate(() => {
    (window as unknown as { practiceMidi: { onmidimessage: (event: { data: Uint8Array }) => void } }).practiceMidi.onmidimessage({ data: new Uint8Array([0x90, 60, 90]) });
  });
  await expect.poll(async () => Number(await page.getByLabel("Playback position", { exact: true }).inputValue())).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "■ Stop", exact: true })).toBeVisible();
});

test("English preparation and Japanese missing-accompaniment guidance stay in the chosen language", async ({ page }) => {
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/audio/fluid/**/*.mp3", async route => { await ready; await route.continue(); });
  await page.goto("/perform");
  await page.getByLabel("Play a MusicXML score", { exact: true }).setInputFiles({ name: "solo.musicxml", mimeType: "application/xml", buffer: Buffer.from(xml([{ name: "Flute" }])) });
  await expect(page.getByRole("status").filter({ hasText: "Preparing instrument sounds…" })).toBeVisible();
  await expect(page.getByText(/音源を準備/)).toHaveCount(0);
  release();
  await expect(page.getByRole("button", { name: "Practise this part", exact: true })).toBeEnabled();
  await page.getByRole("navigation", { name: "Practice navigation" }).getByLabel("Language", { exact: true }).selectOption("ja");
  await expect(page.locator(".studio-part-picker")).toContainText("伴奏の音符がありません。");
  await page.getByRole("button", { name: "▶ 演奏する", exact: true }).click();
  await expect(page.getByRole("button", { name: "■ 停止", exact: true })).toHaveCount(0);
});

test("a slow earlier import cannot replace the score and part currently being confirmed", async ({ page }) => {
  await page.addInitScript(() => {
    const original = File.prototype.arrayBuffer;
    const state = window as unknown as { releaseOlderScore: () => void; olderScoreRead: boolean };
    const pending = new Promise<void>(resolve => { state.releaseOlderScore = resolve; });
    File.prototype.arrayBuffer = async function () {
      if (this.name !== "older.musicxml") return original.call(this);
      await pending;
      const bytes = await original.call(this);
      state.olderScoreRead = true;
      return bytes;
    };
  });
  await page.goto("/perform");
  const upload = page.getByLabel("Play a MusicXML score", { exact: true });
  await upload.setInputFiles({ name: "older.musicxml", mimeType: "application/xml", buffer: Buffer.from(xml([{ name: "Clarinet" }], "Older score")) });
  await expect(page.getByRole("status").filter({ hasText: "Opening your score…" })).toBeVisible();
  await upload.setInputFiles({ name: "newer.musicxml", mimeType: "application/xml", buffer: Buffer.from(xml([{ name: "Flute" }, { name: "Piano" }], "Current score")) });
  await expect(page.getByRole("button", { name: "Practise this part", exact: true })).toBeEnabled();
  await page.evaluate(() => (window as unknown as { releaseOlderScore: () => void }).releaseOlderScore());
  await expect.poll(() => page.evaluate(() => (window as unknown as { olderScoreRead: boolean }).olderScoreRead)).toBe(true);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole("navigation", { name: "Practice navigation" })).toContainText("Current score");
  await expect(page.locator(".studio-part-picker select").first()).toHaveValue("P0");
  await expect(page.locator(".studio-part-picker")).not.toContainText("no accompaniment");
  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await expect(page.locator(".studio-part-picker select").first()).toBeFocused();
  await expect(page.getByRole("button", { name: "■ Stop", exact: true })).toHaveCount(0);
});
