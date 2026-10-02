import { confirmImportedPart, openDisclosure, openEnsembleLab, openLibrary, openRestoredSettings, openScore, openSettings } from "./helpers/studio";
import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

for (const [name, path] of [
  ["sample duet", "public/scores/sample-duet.musicxml"],
  ...[1, 2, 3].map(movement => [`Mozart K.622 movement ${movement}`, `public/repertoire/ensemble/mozart-k622-${movement}.musicxml`]),
]) {
  test(`imported ${name} renders and plays accompaniment`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      const start = AudioBufferSourceNode.prototype.start;
      (window as unknown as { noteStarts: number }).noteStarts = 0;
      AudioBufferSourceNode.prototype.start = function (...args: Parameters<AudioBufferSourceNode["start"]>) {
        (window as unknown as { noteStarts: number }).noteStarts++;
        return start.apply(this, args);
      };
    });
    await page.goto("/perform?view=settings");
    await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles(path);
    await confirmImportedPart(page);
    const play = page.getByRole("button", { name: "▶ 演奏開始", exact: true });
    await expect(play).toBeEnabled({ timeout: 20000 });
    await openScore(page);
    await expect(page.locator(".printable-score svg").first()).toBeVisible({ timeout: 20000 });
    await openSettings(page);
    await expect(page.locator(".part-row").first()).toBeVisible();
    await play.click();
    await expect(page.getByText("演奏中", { exact: true })).toBeVisible();
    await expect.poll(async () => Number(await page.getByRole("slider", { name: "演奏位置" }).inputValue())).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => (window as unknown as { noteStarts: number }).noteStarts)).toBeGreaterThan(0);
    await page.getByRole("button", { name: "■ 停止", exact: true }).click();
    await expect(page.getByRole("slider", { name: "演奏位置" })).toHaveValue("0");
    expect(errors).toEqual([]);
  });
}

test("rehearsal instructions affect actual transport and persist", async ({ page }) => {
  await page.goto("/perform?view=settings");
  const xml = (await readFile("public/scores/sample-duet.musicxml", "utf8")).replace("</attributes>", "<transpose><chromatic>-2</chromatic></transpose></attributes>");
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles({ name: "bb-duet.musicxml", mimeType: "application/xml", buffer: Buffer.from(xml) });
  await confirmImportedPart(page);
  await expect(page.getByRole("button", { name: "▶ 演奏開始", exact: true })).toBeEnabled();
  await openDisclosure(page, "小節ごとの指示・読み込みと書き出し");
  await page.getByLabel("小節の入り", { exact: true }).selectOption("cue");
  await page.getByRole("button", { name: "▶ 演奏開始", exact: true }).click();
  await expect(page.getByText("合図を待っています", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "合図して再開" }).click();
  await expect(page.getByText("演奏中", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "■ 停止", exact: true }).click();
  await page.getByRole("button", { name: "リハーサルコマンド", exact: true }).click();
  await page.getByLabel("リハーサルの指示").fill("テンポを80にして");
  await page.getByRole("button", { name: "反映", exact: true }).click();
  await expect(page.getByRole("slider", { name: "演奏テンポ" })).toHaveValue("80");
  await page.getByLabel("リハーサルの指示").fill("テンポ上げて");
  await page.getByRole("button", { name: "反映", exact: true }).click();
  await expect(page.getByRole("slider", { name: "演奏テンポ" })).toHaveValue("90");
  await page.getByLabel("使用する楽器").selectOption("-3");
  await expect(page.getByLabel("伴奏の移調")).toHaveValue("-1");
  await page.getByRole("button", { name: "この練習を保存", exact: true }).click();
  await openLibrary(page);
  await expect(page.getByRole("region", { name: "マイ楽譜", exact: true }).getByRole("button", { name: "ConvoCerto Sample Duet", exact: true })).toBeVisible();
  await page.reload();
  await openLibrary(page);
  await page.getByRole("region", { name: "マイ楽譜", exact: true }).getByRole("button", { name: "ConvoCerto Sample Duet", exact: true }).click();
  await openRestoredSettings(page);
  await openDisclosure(page, "小節ごとの指示・読み込みと書き出し");
  await expect(page.getByLabel("小節の入り", { exact: true })).toHaveValue("cue");
  await page.screenshot({ path: "test-results/concert-desktop.png", fullPage: true });
});

test("microphone pitch input works with a browser audio stream and can be stopped", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
      const context = new AudioContext();
      await context.resume();
      const oscillator = context.createOscillator();
      oscillator.frequency.value = 523.251131;
      const stream = context.createMediaStreamDestination();
      oscillator.connect(stream);
      oscillator.start();
      return stream.stream;
    } });
  });
  await page.goto("/perform?view=settings");
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles("public/scores/sample-duet.musicxml");
  await confirmImportedPart(page);
  await expect(page.getByRole("button", { name: "マイクで演奏する" })).toBeVisible();
  await openDisclosure(page, "小節ごとの指示・読み込みと書き出し");
  await page.getByLabel("小節の入り", { exact: true }).selectOption("cue");
  await page.getByRole("button", { name: "▶ 演奏開始", exact: true }).click();
  await expect(page.getByText("合図を待っています", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "マイクで演奏する" }).click();
  await expect(page.locator(".pitch-reading")).toContainText("C5");
  await expect(page.getByText("演奏中", { exact: true })).toBeVisible();
  await expect(page.getByText(/追従状態: 一致した位置/)).toBeVisible();
  await page.getByRole("button", { name: "マイクを停止" }).click();
  await expect(page.locator(".pitch-reading")).toHaveText("—");
});

for (const width of [320, 390]) test(`concert page fits a ${width}px phone viewport`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/perform?view=settings");
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles("public/repertoire/ensemble/mozart-k622-2.musicxml");
  await confirmImportedPart(page);
  await expect(page.getByRole("button", { name: "▶ 演奏開始", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const input of await page.locator('input[type=file]').all()) {
    if (!await input.isVisible()) continue;
    const bounds = await input.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  }
  await page.screenshot({ path: `test-results/concert-mobile-${width}.png`, fullPage: true });
});

test("MusicXML becomes the performance source and rehearsal directives round-trip", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    (window as unknown as { noteStarts: number }).noteStarts = 0;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<AudioBufferSourceNode["start"]>) {
      (window as unknown as { noteStarts: number }).noteStarts++;
      return start.apply(this, args);
    };
  });
  await page.goto("/perform?view=settings");
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles("public/scores/sample-duet.musicxml");
  await confirmImportedPart(page);
  const play = page.getByRole("button", { name: "▶ 演奏開始", exact: true });
  await expect(play).toBeEnabled();
  await expect(page.getByRole("slider", { name: "演奏テンポ" })).toHaveValue("100");
  await expect(page.getByLabel("奏者パート", { exact: true })).toHaveValue("P1");
  await openDisclosure(page, "小節ごとの指示・読み込みと書き出し");
  await page.getByLabel("小節の入り", { exact: true }).selectOption("cue");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "指示付きMusicXMLを保存" }).click();
  const download = await downloadEvent;
  const path = await download.path();
  await play.click();
  await expect(page.getByText("合図を待っています", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "合図して再開" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { noteStarts: number }).noteStarts)).toBeGreaterThan(0);
  await openScore(page);
  await expect(page.locator(".studio-progress")).toBeVisible();
  await openSettings(page);
  await page.getByRole("button", { name: "■ 停止", exact: true }).click();
  await openLibrary(page);
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles(path!);
  await confirmImportedPart(page);
  await openRestoredSettings(page);
  await expect(play).toBeEnabled();
  await openDisclosure(page, "小節ごとの指示・読み込みと書き出し");
  await expect(page.getByLabel("小節の入り", { exact: true })).toHaveValue("cue");
  await page.getByLabel("奏者パート", { exact: true }).selectOption("P2");
  await expect(play).toBeEnabled();
  await expect(page.locator(".part-row").getByText("Clarinet", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("an imported orchestral Turkish March exposes its clarinet seat", async ({ page }) => {
  await page.goto("/perform?view=settings");
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles("public/repertoire/ensemble/mozart-turkish-march-orchestra.musicxml");
  await confirmImportedPart(page);
  await expect(page.getByRole("button", { name: "▶ 演奏開始", exact: true })).toBeEnabled({ timeout: 20000 });
  await expect(page.getByLabel("奏者パート").locator("option").filter({ hasText: /Clarinette|Clarinet/ })).toHaveCount(1);
});

test("phrase instructions shape playback and survive MusicXML export", async ({ page }) => {
  await page.goto("/perform?view=settings");
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles("public/scores/sample-duet.musicxml");
  await confirmImportedPart(page);
  const play = page.getByRole("button", { name: "▶ 演奏開始", exact: true });
  await expect(play).toBeEnabled();
  await openDisclosure(page, "小節ごとの指示・読み込みと書き出し");
  await page.getByLabel("小節の入り", { exact: true }).selectOption("continue");
  await page.getByRole("button", { name: "リハーサルコマンド", exact: true }).click();
  await page.getByLabel("リハーサルの指示").fill("1〜2小節は語尾を収めて");
  await page.getByRole("button", { name: "反映", exact: true }).click();
  await expect(page.getByLabel("この区間の表情")).toHaveValue("settling");
  await expect(page.getByLabel("表情の終了小節")).toHaveValue("2");
  await expect(page.getByText(/1〜2小節: 区間の終わりへ/)).toBeVisible();
  await page.getByLabel("伴奏の役割", { exact: true }).selectOption("lead");
  await play.click();
  await expect.poll(async () => Number(await page.getByRole("slider", { name: "演奏テンポ" }).inputValue())).toBeLessThan(99);
  await page.getByRole("button", { name: "■ 停止", exact: true }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "指示付きMusicXMLを保存" }).click();
  const download = await event;
  await openLibrary(page);
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles((await download.path())!);
  await confirmImportedPart(page);
  await openRestoredSettings(page);
  await openDisclosure(page, "小節ごとの指示・読み込みと書き出し");
  await expect(play).toBeEnabled();
  await expect(page.getByLabel("この区間の表情")).toHaveValue("settling");
  await expect(page.getByLabel("表情の終了小節")).toHaveValue("2");
  await openScore(page);
  await expect(page.locator(".printable-score svg").first()).toBeVisible();
  await expect(page.getByText(/ConvoCerto:expression:/)).toHaveCount(0);
  await page.screenshot({ path: "test-results/expressive-rehearsal.png", fullPage: true });
});

test("occupies the combined clarinet part in Beethoven's piano concerto", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/perform?view=settings");
  await page.locator('input[type="file"][accept*=".mxl"]').setInputFiles("public/repertoire/ensemble/beethoven-op73-2.musicxml");
  await confirmImportedPart(page);
  const play = page.getByRole("button", { name: "▶ 演奏開始", exact: true });
  await expect(play).toBeEnabled({ timeout: 20000 });
  await expect(page.getByLabel("奏者パート")).toHaveValue("P3");

  await expect(page.locator(".part-row").getByText("Pianoforte", { exact: true })).toBeVisible();
  await openEnsembleLab(page);
  await page.getByLabel("合奏の主導者").selectOption("conductor");
  await play.click();
  await expect(page.getByText("演奏中", { exact: true })).toBeVisible();
  await expect.poll(async () => Number(await page.getByRole("slider", { name: "演奏位置" }).inputValue())).toBeGreaterThan(0.1);
  await page.getByRole("button", { name: "■ 停止", exact: true }).click();
  await openScore(page);
  await expect(page.locator(".printable-score svg").first()).toBeVisible();
  await page.screenshot({ path: "test-results/beethoven-second-chair.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("records a take and compares response settings on identical input", async ({ page }) => {
  await page.goto("/perform?view=settings");
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles("public/scores/sample-duet.musicxml");
  await confirmImportedPart(page);
  await expect(page.getByRole("button", { name: "▶ 演奏開始", exact: true })).toBeEnabled();
  await openDisclosure(page, "小節ごとの指示・読み込みと書き出し");
  await page.getByLabel("小節の入り", { exact: true }).selectOption("continue");
  await openEnsembleLab(page);
  await openDisclosure(page, "追従・表現の詳細");
  await page.getByRole("button", { name: "テイクを記録して演奏", exact: true }).click();
  await expect(page.getByRole("button", { name: "テイクを終了", exact: true })).toBeVisible();
  await expect.poll(async () => Number(await page.getByRole("slider", { name: "演奏位置" }).inputValue())).toBeGreaterThan(0.2);
  await page.getByRole("button", { name: "テイクを終了", exact: true }).click();
  await page.getByLabel("テイク 1 の感想").selectOption({ label: "伴奏が急いだ" });
  await page.getByText("次の練習のためにメモを残す（任意）", {exact:true}).click();
  await expect(page.getByLabel("テイク 1 の再利用意向")).toHaveValue("");
  await page.getByLabel("テイク 1 の再利用意向").selectOption("unsure");
  await page.getByLabel("テイク 1 の練習メモ").fill("8小節目の息継ぎで先に進んだ。次は合図待ちを試す。");
  await page.getByLabel("共奏 あなたへの追従", { exact: true }).fill("1.2");
  await page.getByRole("button", { name: "同じ入力でA/B比較", exact: true }).click();
  await expect(page.getByRole("table", { name: /同一入力の応答比較/ })).toBeVisible();
  await expect(page.getByText(/録音の聴き比べではありません/)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "テイクの記録を保存" }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toMatch(/^convo-take-/);
  const data = JSON.parse(await readFile((await saved.path())!, "utf8"));
  expect(data.feedback).toBe("伴奏が急いだ");
  expect(data.experience).toEqual({reuse:"unsure",notes:"8小節目の息継ぎで先に進んだ。次は合図待ちを試す。"});
});

test("saves MusicXML directives locally and supports count-in, wait, zoom and print", async ({ page }) => {
  await page.goto("/perform?view=settings");
  await page.locator('input[type="file"][accept*=".mxl"]').setInputFiles("public/scores/sample-duet.musicxml");
  await confirmImportedPart(page);
  const play = page.getByRole("button", { name: "▶ 演奏開始", exact: true });
  await expect(play).toBeEnabled();
  await openDisclosure(page, "小節ごとの指示・読み込みと書き出し");
  await page.getByLabel("小節の入り", { exact: true }).selectOption("cue");
  await openLibrary(page);
  await page.getByRole("button", { name: "このMusicXMLをマイ楽譜に保存", exact: true }).click();
  const saved = page.getByRole("region", { name: "マイ楽譜", exact: true }).getByRole("button").filter({ hasText: "ConvoCerto" });
  await expect(saved).toHaveCount(1);
  const title = await saved.innerText();
  await page.reload();
  await openLibrary(page);
  await page.getByRole("region", { name: "マイ楽譜", exact: true }).getByRole("button", { name: title, exact: true }).click();
  await openRestoredSettings(page);
  await expect(play).toBeEnabled();
  await openDisclosure(page, "小節ごとの指示・読み込みと書き出し");
  await expect(page.getByLabel("小節の入り", { exact: true })).toHaveValue("cue");
  await page.getByLabel("カウントイン").selectOption("1");
  await play.click();
  await expect(page.locator(".status-pill")).toContainText("カウント");
  await page.getByRole("button", { name: "■ 停止", exact: true }).click();
  await page.getByLabel("練習モード").selectOption("wait");
  await play.click();
  await expect(page.locator(".status-pill")).toContainText("正しい音");
  await page.getByRole("button", { name: "■ 停止", exact: true }).click();
  await openScore(page);
  await openDisclosure(page, "表示・印刷");
  await page.getByLabel("譜面の大きさ").selectOption("1.25");
  await expect(page.getByRole("button", { name: "楽譜を印刷 / PDF", exact: true })).toBeEnabled();
  await openSettings(page);
  await page.getByLabel("伴奏の移調").selectOption("2");
  await openScore(page);
  await expect(page.getByText(/記譜を \+2 半音移調/)).toBeVisible();
  await page.screenshot({ path: "test-results/musicxml-practice.png", fullPage: true });
  await openDisclosure(page, "表示・印刷");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "楽譜を印刷 / PDF", exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.locator("svg").first()).toBeVisible();
  await expect(popup.getByText("マイ楽譜", { exact: true })).toHaveCount(0);
  await popup.close();
});

test("score highlights the current note without jumping and clicking starts at that note", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/perform?view=settings");
  await page.locator('input[type="file"][accept*=".mxl"]').setInputFiles("public/scores/sample-duet.musicxml");
  await openDisclosure(page, "小節ごとの指示・読み込みと書き出し");
  await page.getByLabel("小節の入り", { exact: true }).selectOption("continue");
  await openScore(page);
  await page.getByRole("button", { name: "このパートで練習", exact: true }).click();
  const note = page.locator('.printable-score [data-score-beat="4"]').first();
  await expect(note).toBeVisible();
  await note.click();
  await expect(page.locator(".status-pill")).toContainText("カウントイン");
  await expect.poll(async () => page.locator(".status-pill").textContent()).toContain("演奏中");
  await expect.poll(async () => Number(await page.getByLabel("演奏位置").inputValue())).toBeGreaterThanOrEqual(4);
  await expect(page.locator(".score-current-note").first()).toBeVisible();
  await page.evaluate(() => {
    const container = document.querySelector(".printable-score")!;
    const svg = container.querySelector("svg");
    const state = { replacements: 0, top: container.scrollTop, windowY: scrollY, drift: 0 };
    (window as unknown as { stability: typeof state }).stability = state;
    new MutationObserver(() => { if (container.querySelector("svg") !== svg) state.replacements++; state.drift = Math.max(state.drift, Math.abs(container.scrollTop - state.top), Math.abs(scrollY - state.windowY)); }).observe(container, { subtree: true, attributes: true, childList: true });
  });
  const initial = Number(await page.getByLabel("演奏位置").inputValue());
  await expect.poll(async () => Number(await page.getByLabel("演奏位置").inputValue())).toBeGreaterThan(initial + 2);
  expect(await page.evaluate(() => (window as unknown as { stability: { replacements: number; drift: number } }).stability.replacements)).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { stability: { drift: number } }).stability.drift)).toBeLessThan(2);
  await page.getByRole("button", { name: "■ 停止", exact: true }).click();
  await expect(page.locator('.score-current-note[data-score-beat="0"]').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("ClariMate MIDI connects, reports written pitch and advances wait practice", async ({ page }) => {
  await page.addInitScript(() => {
    const input = { id: "clarimate-test", name: "ClariMate", manufacturer: "Buffet Crampon", state: "connected", onmidimessage: null as ((event: { data: Uint8Array }) => void) | null };
    Object.defineProperty(navigator, "requestMIDIAccess", { value: async () => ({ inputs: new Map([[input.id, input]]), onstatechange: null }) });
    (window as unknown as { midiTest: typeof input }).midiTest = input;
  });
  await page.goto("/perform?view=settings");
  await page.locator('input[type="file"][accept*=".mxl"]').setInputFiles("public/scores/sample-duet.musicxml");
  await confirmImportedPart(page);
  await expect(page.getByRole("button", { name: "▶ 演奏開始", exact: true })).toBeEnabled();
  await page.getByLabel("使用する楽器").selectOption("-2");
  await page.getByLabel("MIDIの音高").selectOption("written");
  await page.getByRole("button", { name: "ClariMate / MIDIを接続", exact: true }).click();
  await expect(page.getByLabel("MIDI機器")).toHaveValue("clarimate-test");
  await page.evaluate(() => (window as unknown as { midiTest: { onmidimessage: (event: { data: Uint8Array }) => void } }).midiTest.onmidimessage({ data: new Uint8Array([0xb0, 11, 96]) }));
  await expect(page.getByLabel("ClariMateの息")).toHaveAttribute("value", "96");
  await page.getByLabel("練習モード").selectOption("wait");
  await page.getByRole("button", { name: "▶ 演奏開始", exact: true }).click();
  await page.evaluate(() => (window as unknown as { midiTest: { onmidimessage: (event: { data: Uint8Array }) => void } }).midiTest.onmidimessage({ data: new Uint8Array([0x90, 72, 85]) }));
  await expect(page.locator(".midi-reading")).toContainText("記譜 C5 / 実音 A#4");
  await expect(page.getByLabel("演奏位置")).toHaveValue("1");
  await page.getByRole("button", { name: "■ 停止", exact: true }).click();
  await page.getByLabel("奏者パート").selectOption("P2");
  await expect(page.getByLabel("使用する楽器")).toHaveValue("0");
  await expect(page.getByRole("heading", { name: "あなたの楽器 · Piano", exact: true })).toBeVisible();
});

test("an imported wind score renders and exports its MusicXML", async ({ page }) => {
  await page.goto("/perform?view=settings");
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles("public/repertoire/ensemble/dvorak-new-world-4-woodwind.musicxml");
  await confirmImportedPart(page);
  await expect(page.getByRole("button", { name: "▶ 演奏開始", exact: true })).toBeEnabled({ timeout: 20000 });
  await expect(page.getByLabel("奏者パート").locator("option")).toContainText(["Flute"]);
  await openDisclosure(page, "小節ごとの指示・読み込みと書き出し");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "指示付きMusicXMLを保存", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("rehearsal.musicxml");
  expect(await readFile((await download.path())!, "utf8")).toContain("score-partwise");
  await openScore(page);
  await expect(page.locator(".printable-score svg").first()).toBeVisible();
});

for (const [query, fixture, expectedParts] of [["星条旗よ永遠なれ", "sousa-stars-and-stripes-forever", 31], ["水上の音楽", "handel-water-music-wind-ensemble", 13]] as const) {
  test(`new wind score ${query} loads and starts`, async ({ page }) => {
    await page.goto("/perform?view=settings");
    await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles(`public/repertoire/ensemble/${fixture}.musicxml`);
    await confirmImportedPart(page);
    await expect(page.getByRole("button", { name: "▶ 演奏開始", exact: true })).toBeEnabled({ timeout: 25000 });
    await expect(page.locator(".part-row")).toHaveCount(expectedParts - 1);
    await openScore(page);
    await expect(page.locator(".printable-score svg").first()).toBeVisible();
  });
}

for (const [name, fixture, expectedParts] of [["交響曲第40番", "library-207890", 12], ["交響曲第4番", "library-217671", 27], ["チャイコフスキー：交響曲第6番《悲愴》終楽章", "library-181228", 19], ["雪片のワルツ", "library-174390", 21], ["1812年", "tchaikovsky-1812-overture", 41], ["管弦楽組曲第2番", "bach-orchestral-suite-2", 8]] as const) {
  test(`orchestral MusicXML ${name} parses, displays and starts`, async ({ page }) => {
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/perform?view=settings");
    await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles(`public/repertoire/ensemble/${fixture}.musicxml`);
    await confirmImportedPart(page);
    const play = page.getByRole("button", { name: "▶ 演奏開始", exact: true });
    await expect(play).toBeEnabled({ timeout: 25000 });
    await expect(page.locator(".part-row")).toHaveCount(expectedParts - 1);
    await openScore(page);
    await expect(page.locator(".printable-score [data-score-beat]").first()).toBeVisible();
    await openSettings(page);
    await play.click();
    await expect.poll(async () => Number(await page.getByLabel("演奏位置").inputValue())).toBeGreaterThan(0.1);
    await page.getByRole("button", { name: "■ 停止", exact: true }).click();
    expect(errors).toEqual([]);
  });
}

test("Beethoven Pastoral first movement parses, displays and starts", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/perform?view=settings");
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles("public/repertoire/ensemble/beethoven-symphony-6-pastoral-1.musicxml");
  await confirmImportedPart(page);
  const play = page.getByRole("button", { name: "▶ 演奏開始", exact: true });
  await expect(play).toBeEnabled({ timeout: 25000 });
  await expect(page.locator(".part-row")).toHaveCount(9);
  await expect(page.getByLabel("奏者パート").locator("option")).toContainText(["Clarinet"]);
  await play.click();
  await expect.poll(async () => Number(await page.getByLabel("演奏位置").inputValue())).toBeGreaterThan(0.1);
  await page.getByRole("button", { name: "■ 停止", exact: true }).click();
  expect(errors).toEqual([]);
});

test("Florentiner wind arrangement parses, displays and starts", async ({ page }) => {
  await page.goto("/perform?view=settings");
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles("public/repertoire/ensemble/fucik-florentiner-double-reed.musicxml");
  await confirmImportedPart(page);
  await expect(page.getByRole("button", { name: "▶ 演奏開始", exact: true })).toBeEnabled({ timeout: 25000 });
  await expect(page.locator(".part-row")).toHaveCount(6);
});

test("Mozart K.581 quintet loads all five parts", async ({ page }) => {
  await page.goto("/perform?view=settings");
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles("public/repertoire/ensemble/mozart-k581-clarinet-quintet.musicxml");
  await confirmImportedPart(page);
  await expect(page.getByRole("button", { name: "▶ 演奏開始", exact: true })).toBeEnabled({ timeout: 25000 });
  await expect(page.locator(".part-row")).toHaveCount(4);
  await expect(page.getByLabel("奏者パート").locator("option")).toContainText(["Clarinet in A", "Violin I", "Violin II", "Viola", "Cello"]);
});
