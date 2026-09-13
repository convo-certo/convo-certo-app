import { test, expect } from "@playwright/test";
const xml = `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Clarinet entrance</work-title></work><part-list><score-part id="P1"><part-name>Clarinet</part-name></score-part><score-part id="P2"><part-name>Piano</part-name></score-part></part-list>${["P1", "P2"].map(id => `<part id="${id}">${Array.from({length:8},(_,i)=>`<measure number="${i+1}"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note>${id === "P1" && i < 2 ? '<rest/>' : '<pitch><step>C</step><octave>4</octave></pitch>'}<duration>4</duration><type>whole</type></note></measure>`).join("")}</part>`).join("")}</score-partwise>`;

test("starts at the clarinet entrance and alternates model and player on the same excerpt", async ({page}) => {
  await page.goto("/perform");
  await page.getByLabel("MusicXMLで演奏する",{exact:true}).setInputFiles({name:"entrance.musicxml",mimeType:"application/xml",buffer:Buffer.from(xml)});
  const entrance = page.getByRole("button",{name:"自分の入りから吹く",exact:true});
  await expect(entrance).toBeEnabled();
  await entrance.click();
  await expect(page.getByLabel("開始小節",{exact:true})).toHaveValue("3");
  await expect(page.getByLabel("終了小節",{exact:true})).toHaveValue("6");
  await expect(page.getByLabel("カウントイン",{exact:true})).toHaveValue("1");
  await expect(page.getByRole("button",{name:"ループ ON",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"この区間のお手本を聴く",exact:true}).click();
  await expect(page.locator(".status-pill")).toContainText("カウントイン");
  await expect(page.getByLabel("練習モード",{exact:true})).toHaveValue("listen");
  await expect(page.getByLabel("演奏位置",{exact:true})).toHaveValue("8");
  await page.getByRole("button",{name:"同じ区間を自分で吹く",exact:true}).click();
  await expect(page.locator(".status-pill")).toContainText("カウントイン");
  await expect(page.getByLabel("練習モード",{exact:true})).toHaveValue("accompany");
  await expect(page.getByLabel("開始小節",{exact:true})).toHaveValue("3");
  await page.getByRole("button",{name:"■ 停止",exact:true}).click();
  await page.getByRole("button",{name:"楽譜専用ページで演奏する →",exact:true}).click();
  await page.getByText("お手本と吹き比べる",{exact:true}).click();
  await expect(page.getByRole("button",{name:"この区間のお手本を聴く",exact:true})).toBeVisible();
});

test("rejoins from the current score measure after a full count-in and can cancel it", async ({ page }) => {
  await page.goto("/perform");
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles({ name: "rejoin.musicxml", mimeType: "application/xml", buffer: Buffer.from(xml) });
  await expect(page.getByRole("button", { name: "▶ 演奏開始", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "楽譜専用ページで演奏する →", exact: true }).click();
  await page.locator('.printable-score [data-score-beat="4"]').first().click();
  const position = page.getByLabel("演奏位置", { exact: true });
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(4.2);
  await page.getByRole("button", { name: "この小節から入り直す", exact: true }).click();
  await expect(position).toHaveValue("4");
  await expect(page.locator(".status-pill")).toContainText("カウントイン");
  await expect(page.getByLabel("カウントイン", { exact: true })).toHaveValue("1");
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(4);
  await page.getByRole("button", { name: "この小節から入り直す", exact: true }).click();
  await expect(page.locator(".status-pill")).toContainText("カウントイン");
  await page.getByRole("button", { name: "■ 停止", exact: true }).click();
  await expect(page.locator(".status-pill")).toHaveText("準備完了");
  await page.waitForTimeout(2200);
  await expect(position).toHaveValue("0");
  await expect(page.locator(".status-pill")).toHaveText("準備完了");
});

test("Mozart K622 Allegro skips the orchestral opening to the clarinet at measure 57", async ({page}) => {
  await page.goto("/perform");
  await page.getByLabel("MusicXMLで演奏する",{exact:true}).setInputFiles("public/repertoire/ensemble/mozart-k622-1.musicxml");
  await expect(page.getByRole("button",{name:"自分の入りから吹く",exact:true})).toBeEnabled({timeout:15000});
  await page.getByRole("button",{name:"自分の入りから吹く",exact:true}).click();
  await expect(page.getByLabel("開始小節",{exact:true})).toHaveValue("57");
  await expect(page.getByLabel("終了小節",{exact:true})).toHaveValue("60");
  await expect(page.getByLabel("使用する楽器",{exact:true})).toHaveValue("-3");
  await page.getByRole("button",{name:"■ 停止",exact:true}).click();
});

test("plays the partner before and during the entrance while leaving the selected seat silent", async ({ page }) => {
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    (window as any).entranceRates = [];
    AudioBufferSourceNode.prototype.start = function (...args) {
      (window as any).entranceRates.push(this.playbackRate.value);
      return start.apply(this, args);
    };
  });
  const score = `<score-partwise version="4.0"><part-list><score-part id="C"><part-name>Clarinets</part-name></score-part></part-list><part id="C">${Array.from({ length: 8 }, (_, index) => `<measure number="${index + 1}"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>G</step><octave>3</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note><backup><duration>4</duration></backup><note>${index < 2 ? "<rest/>" : "<pitch><step>C</step><octave>4</octave></pitch>"}<duration>4</duration><voice>2</voice><type>whole</type></note></measure>`).join("")}</part></score-partwise>`;
  await page.goto("/perform");
  await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles({ name: "partner-entrance.musicxml", mimeType: "application/xml", buffer: Buffer.from(score) });
  await expect(page.getByLabel("奏者パート", { exact: true })).toBeEnabled();
  await page.getByLabel("奏者パート", { exact: true }).selectOption(JSON.stringify(["C", "1", "2"]));
  const leadIn = page.getByRole("button", { name: "入りの1小節前から合わせる", exact: true });
  await expect(leadIn).toBeEnabled();
  await leadIn.click();
  await expect(page.getByLabel("開始小節", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("終了小節", { exact: true })).toHaveValue("6");
  await expect(page.getByLabel("練習モード", { exact: true })).toHaveValue("accompany");
  await expect.poll(() => page.evaluate(() => (window as any).entranceRates.length), { timeout: 10000 }).toBeGreaterThanOrEqual(2);
  const rates = await page.evaluate(() => (window as any).entranceRates as number[]);
  expect(rates.length).toBeGreaterThanOrEqual(2);
  for (const rate of rates) expect(rate).toBeCloseTo(2 ** (-5 / 12), 2);
  await page.getByRole("button", { name: "■ 停止", exact: true }).click();
  await page.getByLabel("奏者パート", { exact: true }).selectOption("C");
  await expect(leadIn).toBeDisabled();
});
