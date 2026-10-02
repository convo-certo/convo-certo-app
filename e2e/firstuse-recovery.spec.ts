import { expect, test, type Page } from "@playwright/test";

const score = `<score-partwise version="4.0"><work><work-title>Recovery duet</work-title></work><part-list><score-part id="V"><part-name>Violin</part-name></score-part><score-part id="P"><part-name>Piano</part-name></score-part></part-list>${["V", "P"].map(id => `<part id="${id}">${Array.from({ length: 8 }, (_, index) => `<measure number="${index + 1}"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>${id === "V" ? 5 : 4}</octave></pitch><duration>4</duration><type>whole</type></note></measure>`).join("")}</part>`).join("")}</score-partwise>`;
const upload = { name: "duet.musicxml", mimeType: "application/xml", buffer: Buffer.from(score) };

async function openViolin(page: Page) {
  await page.goto("/perform");
  await page.getByLabel("Play a MusicXML score", { exact: true }).setInputFiles(upload);
  await page.getByRole("button", { name: "Practise this part", exact: true }).click();
  await page.getByRole("button", { name: /Adjust tempo/ }).click();
  await page.getByLabel("Practice tempo", { exact: true }).fill("88");
  await page.getByLabel("Count-in", { exact: true }).selectOption("0");
  await page.getByRole("button", { name: "↻ Loop", exact: true }).click();
  await page.getByLabel("Start bar", { exact: true }).fill("2");
  await page.getByLabel("End bar", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Turn loop on", exact: true }).click();
  await page.getByRole("navigation", { name: "Practice navigation" }).getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Practice mode", { exact: true }).selectOption("wait");
}

for (const [locale, width] of [["ja-JP", 320], ["en-US", 390]] as const) {
  test(`import errors and loading remain beside the file input in ${locale} at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ locale, viewport: { width, height: 844 } });
    const page = await context.newPage();
    await page.goto("/perform");
    const input = page.getByLabel(locale === "ja-JP" ? "MusicXMLで演奏する" : "Play a MusicXML score", { exact: true });
    await input.setInputFiles({ name: "invalid.musicxml", mimeType: "application/xml", buffer: Buffer.from("<bad/>") });
    const error = page.locator("#import-score").getByRole("alert");
    await expect(error).toContainText(locale === "ja-JP" ? "MusicXMLではありません" : "Export a single score as MusicXML");
    await expect(error).toBeInViewport({ ratio: 1 });
    await expect(error.locator("..")).toBeFocused();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/audio/fluid/**/*.mp3", async route => { await pending; await route.continue(); });
    await input.setInputFiles(upload);
    const progress = page.locator("#import-score").getByRole("status").filter({ hasText: locale === "ja-JP" ? "音源を準備" : "Preparing instrument sounds" });
    try {
      await expect(progress).toBeInViewport({ ratio: 1 });
      await expect(input).toBeDisabled();
      await expect(error).toHaveCount(0);
    } finally { release(); }
    await expect(page.getByRole("button", { name: locale === "ja-JP" ? "このパートで練習" : "Practise this part", exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await context.close();
  });
}

test.describe("waiting without an input", () => {
  test.use({ locale: "en-US", viewport: { width: 390, height: 844 } });

  test("a saved violin practice offers an explicit fixed-tempo recovery without losing its passage", async ({ page }) => {
    await page.addInitScript(() => {
      const original = AudioBufferSourceNode.prototype.start;
      const state = window as unknown as { noteStarts: number };
      state.noteStarts = 0;
      AudioBufferSourceNode.prototype.start = function (...args: Parameters<AudioBufferSourceNode["start"]>) {
        state.noteStarts++;
        return original.apply(this, args);
      };
    });
    await openViolin(page);
    await page.getByRole("button", { name: "Save practice", exact: true }).click();
    await expect(page.getByText("Practice saved. Resume with the same part and passage from My scores.").first()).toBeVisible();
    await page.getByRole("button", { name: "‹ My scores", exact: true }).click();
    await page.reload();
    await page.getByRole("region", { name: "My scores", exact: true }).getByRole("button", { name: "Recovery duet", exact: true }).click();
    const recovery = page.getByRole("region", { name: "Input needed for this practice", exact: true });
    await expect(recovery).toBeInViewport({ ratio: 1 });
    await expect(page.locator(".studio-input-status")).toHaveText("Input needed · Connect mic or MIDI");
    await page.getByRole("button", { name: "▶ Play", exact: true }).click();
    await expect(page.locator(".studio-progress [role=status]")).toHaveText("Waiting for the written note");
    await expect(recovery.getByRole("button", { name: "Practise at a fixed tempo", exact: true })).toBeInViewport({ ratio: 1 });
    await expect(recovery.getByRole("button", { name: "Connect an input", exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.locator(".presence-caption small")).toHaveText("Connect a microphone or MIDI device");
    await expect(page.locator(".presence-caption small")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { noteStarts: number }).noteStarts)).toBe(0);
    const beat = await page.getByLabel("Playback position", { exact: true }).inputValue();
    await recovery.getByRole("button", { name: "Practise at a fixed tempo", exact: true }).click();
    await expect(recovery).toHaveCount(0);
    await expect(page.getByRole("button", { name: "■ Stop", exact: true })).toHaveCount(0);
    await expect(page.locator(".studio-part > button").first()).toContainText("Violin");
    await expect(page.getByRole("button", { name: "↻ Bars 2–3", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /88 BPM/ })).toBeVisible();
    await expect(page.getByLabel("Playback position", { exact: true })).toHaveValue(beat);
    await page.getByRole("button", { name: "▶ Play", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { noteStarts: number }).noteStarts)).toBeGreaterThan(0);
    await expect.poll(async () => Number(await page.getByLabel("Playback position", { exact: true }).inputValue())).toBeGreaterThan(Number(beat));
  });

  test("connecting an input focuses both device options and retains waiting mode", async ({ page }) => {
    await page.addInitScript(() => {
      const input = { id: "keyboard", name: "Keyboard", state: "connected", onmidimessage: null };
      Object.defineProperty(navigator, "requestMIDIAccess", { value: async () => ({ inputs: new Map([[input.id, input]]), onstatechange: null }) });
    });
    await openViolin(page);
    const recovery = page.getByRole("region", { name: "Input needed for this practice", exact: true });
    await expect(recovery).toBeVisible();
    await page.getByRole("navigation", { name: "Practice navigation" }).getByRole("button", { name: "Score", exact: true }).click();
    await page.getByRole("button", { name: "▶ Play", exact: true }).click();
    const beat = await page.getByLabel("Playback position", { exact: true }).inputValue();
    await recovery.getByRole("button", { name: "Connect an input", exact: true }).click();
    const panel = page.getByRole("region", { name: "Instrument input", exact: true });
    await expect(panel).toBeFocused();
    await expect(panel.getByRole("heading")).toBeInViewport();
    await expect(panel.getByRole("button", { name: "Connect microphone", exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Connect MIDI / ClariMate", exact: true })).toBeVisible();
    await expect(page.getByLabel("Practice mode", { exact: true })).toHaveValue("wait");
    await expect(page.getByLabel("Playback position", { exact: true })).toHaveValue(beat);
    await expect(page.getByRole("button", { name: "■ Stop", exact: true })).toHaveCount(0);
    await panel.getByRole("button", { name: "Connect MIDI / ClariMate", exact: true }).click();
    await expect(recovery).toHaveCount(0);
    await expect(page.getByLabel("Practice mode", { exact: true })).toHaveValue("wait");
    await page.getByRole("navigation", { name: "Practice navigation" }).getByRole("button", { name: "Score", exact: true }).click();
    await expect(page.locator(".studio-input-status")).toHaveText("MIDI connected");
    await expect(page.getByRole("button", { name: "↻ Bars 2–3", exact: true })).toBeVisible();
  });

  test("the recovery stays actionable in Japanese on a 320px screen and in settings", async ({ page }) => {
    await openViolin(page);
    await page.getByRole("navigation", { name: "Practice navigation" }).getByLabel("Language", { exact: true }).selectOption("ja");
    await page.setViewportSize({ width: 320, height: 740 });
    await page.getByRole("navigation", { name: "練習画面の切り替え" }).getByRole("button", { name: "楽譜で練習", exact: true }).click();
    const recovery = page.getByRole("region", { name: "練習に必要な入力", exact: true });
    await expect(recovery).toContainText("マイクかMIDIが必要");
    await expect(recovery.getByRole("button", { name: "一定テンポで練習", exact: true })).toBeInViewport({ ratio: 1 });
    await expect(recovery.getByRole("button", { name: "入力を接続", exact: true })).toBeInViewport({ ratio: 1 });
    await page.getByRole("button", { name: "▶ 演奏する", exact: true }).click();
    await expect(recovery.getByRole("button", { name: "一定テンポで練習", exact: true })).toBeInViewport({ ratio: 1 });
    await expect(recovery.getByRole("button", { name: "入力を接続", exact: true })).toBeInViewport({ ratio: 1 });
    await page.getByRole("navigation", { name: "練習画面の切り替え" }).getByRole("button", { name: "設定", exact: true }).click();
    await recovery.getByRole("button", { name: "一定テンポで練習", exact: true }).click();
    await expect(page.getByLabel("練習モード", { exact: true })).toHaveValue("accompany");
    await expect(recovery).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
