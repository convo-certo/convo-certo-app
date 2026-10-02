import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test.use({ locale: "en-US" });

test("practice import failures follow the chosen language and allow a corrected file", async ({ page }) => {
  const xml = readFileSync("public/scores/sample-duet.musicxml", "utf8");
  const practice = { format: "convocerto-practice", version: 1, score: { title: "Recovered practice", xml } };
  const files = [
    "{broken",
    JSON.stringify({ ...practice, version: 999 }),
    JSON.stringify({ ...practice, score: { ...practice.score, xml: "<not-a-score/>" } }),
    JSON.stringify({ ...practice, score: { ...practice.score, session: { version: 1, seatId: "missing-part" } } }),
  ];
  await page.goto("/perform");
  await page.getByRole("region", { name: "My scores", exact: true }).locator("summary").click();
  for (const buffer of files) {
    await page.getByLabel("Import a practice file", { exact: true }).setInputFiles({ name: "broken.convo.json", mimeType: "application/json", buffer: Buffer.from(buffer) });
    const error = page.getByRole("alert");
    await expect(error).toContainText(/practice file|score|MusicXML/i);
    await expect(error).not.toContainText(/[ぁ-んァ-ヶ一-龯]/);
    const english = await error.textContent();
    await page.getByLabel("Language", { exact: true }).selectOption("ja");
    await expect(error).toContainText(/[ぁ-んァ-ヶ一-龯]/);
    await page.getByLabel("言語", { exact: true }).selectOption("en");
    await expect(error).toHaveText(english!);
    await expect(page.getByRole("region", { name: "My scores", exact: true }).getByRole("button", { name: /from My scores$/ })).toHaveCount(0);
  }
  await page.getByLabel("Import a practice file", { exact: true }).setInputFiles({ name: "corrected.convo.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(practice)) });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("region", { name: "My scores", exact: true }).getByRole("button", { name: "Recovered practice", exact: true }).click();
  await expect(page.locator(".printable-score svg").first()).toBeVisible();
  await page.screenshot({ path: "test-results/global-practice-recovered.png", fullPage: true });
});

const measures = Array.from({ length: 8 }, (_, index) => `<measure number="${index + 1}">${index === 0 ? '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>' : ""}<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note><backup><duration>4</duration></backup><note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>2</voice><type>whole</type><staff>1</staff></note><backup><duration>4</duration></backup><note><pitch><step>E</step><octave>3</octave></pitch><duration>4</duration><voice>3</voice><type>whole</type><staff>2</staff></note></measure>`).join("");
const voices = `<score-partwise version="4.0"><work><work-title>Independent voices</work-title></work><part-list><score-part id="C"><part-name>Clarinets</part-name></score-part></part-list><part id="C">${measures}</part></score-partwise>`;

test("generated voice names follow language while playing and resuming the same seat", async ({ page }) => {
  const seat = JSON.stringify(["C", "1", "2"]);
  await page.goto("/perform");
  await page.getByLabel("Play a MusicXML score", { exact: true }).setInputFiles({ name: "voices.musicxml", mimeType: "application/xml", buffer: Buffer.from(voices) });
  const picker = page.locator(".studio-part-picker");
  await expect(picker.getByRole("option", { name: /Clarinets.*staff.?1.*voice.?2/i })).toHaveCount(1);
  await picker.getByLabel("Your part", { exact: true }).selectOption(seat);
  await page.getByRole("button", { name: "Practise this part", exact: true }).click();
  await expect(page.locator(".studio-part > button").first()).toContainText(/Clarinets.*staff.?1.*voice.?2/i);
  await expect(page.locator(".ensemble-lights")).toContainText(/Clarinets.*other voices/i);
  await page.getByRole("button", { name: /Adjust tempo/ }).click();
  await page.getByLabel("Count-in", { exact: true }).selectOption("0");
  await page.getByRole("button", { name: "Close practice tools", exact: true }).click();
  await page.getByRole("button", { name: "▶ Play", exact: true }).click();
  await expect.poll(async () => Number(await page.getByLabel("Playback position", { exact: true }).inputValue())).toBeGreaterThan(0.5);
  const position = Number(await page.getByLabel("Playback position", { exact: true }).inputValue());
  await page.getByRole("navigation", { name: "Practice navigation" }).getByLabel("Language", { exact: true }).selectOption("ja");
  await expect(page.locator(".studio-part > button").first()).toContainText("Clarinets · 譜表1 声部2");
  await expect(page.locator(".ensemble-lights")).toContainText("Clarinets（他の声部）");
  await expect.poll(async () => Number(await page.getByLabel("演奏位置", { exact: true }).inputValue())).toBeGreaterThan(position);
  await page.getByRole("navigation", { name: "練習画面の切り替え" }).getByLabel("言語", { exact: true }).selectOption("en");
  await expect(page.locator(".studio-part > button").first()).toContainText(/Clarinets.*staff.?1.*voice.?2/i);
  await expect.poll(async () => Number(await page.getByLabel("Playback position", { exact: true }).inputValue())).toBeGreaterThan(8);
  await page.getByRole("button", { name: "■ Stop", exact: true }).click();
  await page.getByRole("button", { name: "‹ My scores", exact: true }).click();
  const journal = page.getByRole("region", { name: "Recent practice", exact: true });
  const resume = journal.getByRole("button", { name: /^Resume / });
  await expect(resume).toContainText(/Clarinets.*staff.?1.*voice.?2/i);
  await page.reload();
  await expect(resume).toContainText(/Clarinets.*staff.?1.*voice.?2/i);
  await resume.click();
  await expect(page.locator(".studio-part > button").first()).toContainText(/Clarinets.*staff.?1.*voice.?2/i);
  await page.getByRole("button", { name: "Check instrument and microphone", exact: true }).click();
  await expect(picker.getByLabel("Your part", { exact: true })).toHaveValue(seat);
  await page.screenshot({ path: "test-results/global-voice-resumed.png", fullPage: true });
});
