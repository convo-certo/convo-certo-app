import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { openDisclosure, openLibrary, openScore, openSettings } from "./helpers/studio";

test("changes MusicXML key, exports and reopens the actual edited score", async ({ page }) => {
  await page.goto("/perform");
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles("public/scores/sample-duet.musicxml");
  await page.getByRole("button", { name: "このパートで練習", exact: true }).click();
  await expect(page.locator(".printable-score svg").first()).toBeVisible();
  await page.getByText("調：C dur", { exact: true }).click();
  await page.getByLabel("変更先の調", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "楽譜を移調", exact: true }).click();
  await expect(page.getByText("調：D dur", { exact: true })).toBeVisible();
  await expect(page.locator(".printable-score svg").first()).toBeVisible();
  await expect(page.getByRole("group", { name: "練習の操作" }).getByRole("button")).toHaveCount(6);
  await page.getByRole("button", { name: "保存と設定", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "指示付きMusicXMLを保存", exact: true }).click();
  const path = (await (await pending).path())!;
  const xml = await readFile(path, "utf8");
  expect(xml).toContain("<fifths>2</fifths>");
  expect(xml).toContain("<step>D</step><octave>5</octave>");
  await page.getByRole("button", { name: "マイ楽譜" }).click();
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles({ name: "D-dur.musicxml", mimeType: "application/xml", buffer: Buffer.from(xml) });
  await expect(page.getByText("調：D dur", { exact: true })).toBeVisible();
});

test("preserves the player's B-flat instrument and sounding pitches when changing an A-clarinet score key", async ({ page }) => {
  const title = "A clarinet key change";
  const xml = `<score-partwise version="4.0"><work><work-title>${title}</work-title></work><part-list><score-part id="P1"><part-name>Clarinet in A</part-name></score-part><score-part id="P2"><part-name>Piano</part-name></score-part></part-list>${["P1", "P2"].map(id => `<part id="${id}">${[1, 2].map(number => `<measure number="${number}"><attributes><divisions>1</divisions><key><fifths>${id === "P1" ? 0 : 3}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>${id === "P1" ? "G" : "F"}</sign><line>${id === "P1" ? 2 : 4}</line></clef>${id === "P1" ? "<transpose><diatonic>-2</diatonic><chromatic>-3</chromatic></transpose>" : ""}</attributes><note><pitch><step>${id === "P1" ? "C" : "A"}</step><octave>${id === "P1" ? 5 : 3}</octave></pitch><duration>4</duration><type>whole</type></note></measure>`).join("")}</part>`).join("")}</score-partwise>`;
  await page.goto("/perform");
  await page.evaluate(async () => {
    const path = "/app/lib/orchestra-audio.ts";
    const { OrchestraAudio } = await import(path);
    const play = OrchestraAudio.prototype.play;
    const notes: { partIndex: number; pitch: number; startBeat: number }[] = [];
    Object.assign(window, { keyChangeNotes: notes });
    OrchestraAudio.prototype.play = function (this: unknown, note: { partIndex: number; pitch: number; startBeat: number }, ...args: unknown[]) {
      notes.push({ partIndex: note.partIndex, pitch: note.pitch, startBeat: note.startBeat });
      return play.call(this, note, ...args);
    };
  });
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles({ name: "clarinet-in-a.musicxml", mimeType: "application/xml", buffer: Buffer.from(xml) });
  const instrument = page.getByLabel("演奏する楽器", { exact: true });
  await expect(instrument).toHaveValue("-3");
  await instrument.selectOption("-2");
  await page.getByRole("button", { name: "このパートで練習", exact: true }).click();
  await page.getByText("調：C dur", { exact: true }).click();
  await page.getByLabel("変更先の調", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "楽譜を移調", exact: true }).click();
  await expect(page.getByText("調：D dur", { exact: true })).toBeVisible();
  await openSettings(page);
  await expect(page.getByLabel("使用する楽器", { exact: true })).toHaveValue("-2");
  await expect(page.getByLabel("伴奏の移調", { exact: true })).toHaveValue("1");
  await openScore(page);
  await page.getByRole("button", { name: "♫ お手本", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { keyChangeNotes: { partIndex: number; pitch: number; startBeat: number }[] }).keyChangeNotes.filter(note => note.startBeat === 0).map(note => [note.partIndex, note.pitch]))).toEqual(expect.arrayContaining([[0, 72], [1, 60]]));
  await page.getByRole("button", { name: /試聴を止める/ }).click();
  await openSettings(page);
  await openDisclosure(page, "練習メニュー");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "今の練習をファイルに書き出す", exact: true }).click();
  const bytes = await readFile((await (await pending).path())!);
  const practice = JSON.parse(bytes.toString());
  expect(practice.score.session).toMatchObject({ instrumentKey: -2, shift: 1 });
  const written = await page.evaluate(xml => {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    return [...doc.querySelectorAll("part")].map(part => ({ fifths: part.querySelector("fifths")?.textContent, step: part.querySelector("pitch > step")?.textContent, octave: part.querySelector("pitch > octave")?.textContent, transpose: part.querySelector("transpose > chromatic")?.textContent }));
  }, practice.score.xml);
  expect(written).toEqual([{ fifths: "2", step: "D", octave: "5", transpose: "-3" }, { fifths: "5", step: "B", octave: "3", transpose: undefined }]);
  await page.reload();
  await openLibrary(page);
  await page.getByLabel("練習ファイルを読み込む", { exact: true }).setInputFiles({ name: "transposed.convo.json", mimeType: "application/json", buffer: bytes });
  await page.getByRole("region", { name: "マイ楽譜", exact: true }).getByRole("button", { name: title, exact: true }).click();
  await openScore(page);
  await expect(page.getByText("調：D dur", { exact: true })).toBeVisible();
  await openSettings(page);
  await expect(page.getByLabel("使用する楽器", { exact: true })).toHaveValue("-2");
  await expect(page.getByLabel("伴奏の移調", { exact: true })).toHaveValue("1");
});

test("keeps resting bars readable without extra numbers and follows playback", async ({ page }, testInfo) => {
  let xml = await readFile("public/scores/sample-duet.musicxml", "utf8");
  const firstPartEnd = xml.indexOf("</part>");
  let first = xml.slice(0, firstPartEnd);
  first = first.replace(/(<measure number="[127]">)([\s\S]*?)(<\/measure>)/g, (_match, start, body, end) => start + body.replace(/<note>[\s\S]*?<\/note>/g, "") + '<note><rest measure="yes"/><duration>4</duration></note>' + end);
  xml = (first + xml.slice(firstPartEnd)).replace("</clef>", "</clef><measure-style><multiple-rest>2</multiple-rest></measure-style>").replace(/<direction[\s\S]*?<\/direction>/g, "");
  await page.goto("/perform");
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles({ name: "rests.musicxml", mimeType: "application/xml", buffer: Buffer.from(xml) });
  await page.getByRole("button", { name: "このパートで練習", exact: true }).click();
  await expect(page.locator(".printable-score svg").first()).toBeVisible();
  await expect(page.locator("[data-score-rest-count]")).toHaveCount(0);
  await expect(page.locator("[data-rest-beat]")).toHaveCount(0);
  await expect(page.locator('[data-score-measure="1"]').first()).toBeVisible();
  await expect(page.locator('[data-score-measure="2"]').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("resting-bars-desktop.png") });
  await page.getByRole("button", { name: "お手本", exact: false }).click();
  await expect(page.locator('[data-score-measure="2"][aria-current="true"]').first()).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "試聴を止める", exact: false }).click();
  await page.getByText("表示・印刷", { exact: true }).click();
  await expect(page.getByRole("button", { name: "休符の小節カウント", exact: false })).toHaveCount(0);
  await page.getByText("表示・印刷", { exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".printable-score svg").first()).toBeVisible();
  await expect(page.locator("[data-score-rest-count]")).toHaveCount(0);
  await page.getByText("調：C dur", { exact: true }).click();
  await expect(page.getByLabel("変更先の調", { exact: true })).toBeVisible();
  const menu = await page.locator(".score-key-menu > div").boundingBox();
  expect(menu!.x).toBeGreaterThanOrEqual(0);
  expect(menu!.x + menu!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("resting-bars-phone.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("plays the short expression sample and closes its audio on collapse", async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { sampleStarts: 0, sampleCloses: 0 });
    const start = AudioBufferSourceNode.prototype.start, close = AudioContext.prototype.close;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      (window as unknown as { sampleStarts: number }).sampleStarts++;
      return start.apply(this, args);
    };
    AudioContext.prototype.close = function () {
      (window as unknown as { sampleCloses: number }).sampleCloses++;
      return close.call(this);
    };
  });
  await page.goto("/perform");
  await page.getByText("短いフレーズで、音の変化を試す", { exact: false }).click();
  const preview = page.locator(".expression-demo");
  await expect(preview.getByText("1–2小節", { exact: true })).toBeVisible();
  await expect(preview.getByRole("button", { name: "楽譜に残す" })).toHaveCount(0);
  await preview.getByRole("button", { name: "A この指示なし" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { sampleStarts: number }).sampleStarts)).toBeGreaterThan(0);
  const before = await page.evaluate(() => (window as unknown as { sampleStarts: number }).sampleStarts);
  await preview.getByRole("button", { name: "B 変化を聴く" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { sampleStarts: number }).sampleStarts)).toBeGreaterThan(before);
  await page.getByText("短いフレーズで、音の変化を試す", { exact: false }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { sampleCloses: number }).sampleCloses)).toBeGreaterThan(0);
});
