import { test, expect } from "@playwright/test";

const xml = `<score-partwise version="4.0"><work><work-title>Three independent voices</work-title></work><part-list><score-part id="C"><part-name>Clarinets</part-name></score-part></part-list><part id="C"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef><transpose><chromatic>-2</chromatic></transpose></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note><backup><duration>4</duration></backup><note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>2</voice><type>whole</type><staff>1</staff></note><backup><duration>4</duration></backup><note><pitch><step>E</step><octave>3</octave></pitch><duration>4</duration><voice>3</voice><type>whole</type><staff>2</staff></note></measure></part></score-partwise>`;

test("an unmapped voice identifier keeps the complete part readable", async ({ page }) => {
  await page.goto("/perform");
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles({ name: "voice-id.musicxml", mimeType: "application/xml", buffer: Buffer.from(xml.replace("<voice>2</voice>", "<voice>02</voice>")) });
  await expect(page.getByRole("button", { name: "▶ 演奏開始", exact: true })).toBeEnabled();
  await page.getByLabel("奏者パート", { exact: true }).selectOption(JSON.stringify(["C", "1", "02"]));
  await expect(page.getByText(/譜面上の声部を特定できないため/)).toBeVisible();
  await expect(page.locator('.printable-score [data-score-focused="false"]')).toHaveCount(0);
  await expect(page.locator('.printable-score [data-score-focused="true"]')).toHaveCount(3);
});

for (const [staff, voice] of [["1", "2"], ["2", "3"]]) test(`selected staff ${staff} voice ${voice} remains prominent and solely highlighted`, async ({ page }) => {
  await page.goto("/perform");
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles({ name: "voices.musicxml", mimeType: "application/xml", buffer: Buffer.from(xml) });
  await expect(page.getByRole("button", { name: "▶ 演奏開始", exact: true })).toBeEnabled();
  await page.getByLabel("奏者パート", { exact: true }).selectOption(JSON.stringify(["C", staff, voice]));
  await expect(page.getByRole("button", { name: "▶ 演奏開始", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "楽譜専用ページで演奏する →", exact: true }).click();
  const selected = page.locator(`.printable-score [data-score-voice="${voice}"][data-score-staff="${staff}"]`);
  await expect(selected).toHaveAttribute("data-score-focused", "true");
  await expect(selected).toHaveAttribute("opacity", "1");
  await expect(page.locator('.printable-score [data-score-focused="false"]')).toHaveCount(2);
  await expect(page.locator(".score-current-note")).toHaveCount(1);
  await expect(page.locator(".score-current-note")).toHaveAttribute("data-score-voice", voice);
  await page.getByLabel("譜面の大きさ", { exact: true }).selectOption("1.25");
  await expect(page.locator(".score-current-note")).toHaveCount(1);
  await expect(page.locator(".score-current-note")).toHaveAttribute("data-score-voice", voice);
  await selected.press("Enter");
  await expect(page.locator(".status-pill")).toHaveText("演奏中");
  await expect(page.locator('.score-current-note[data-score-focused="false"]')).toHaveCount(0);
  await page.screenshot({ path: `test-results/seat-${staff}-${voice}.png`, fullPage: true });
  await page.getByRole("button", { name: "■ 停止", exact: true }).click();
  await page.getByRole("button", { name: "準備・オーケストラ", exact: true }).click();
  await page.getByLabel("奏者パート", { exact: true }).selectOption("C");
  await expect(page.locator('.printable-score [data-score-focused="false"]')).toHaveCount(0);
  await expect(page.locator(".score-current-note")).toHaveCount(3);
});
