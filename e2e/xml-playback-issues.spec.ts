import { test, expect } from '@playwright/test';

const xml = `<score-partwise version="4.0"><work><work-title>Playback warning fixture</work-title></work><part-list><score-part id="C"><part-name>Clarinet</part-name></score-part></part-list><part id="C"><measure number="7"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><grace/><pitch><step>D</step><octave>4</octave></pitch><type>eighth</type></note><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type><notations><fermata/></notations></note></measure></part></score-partwise>`;

test('playback limitations follow the loaded and saved XML in both preparation and score views', async ({ page }) => {
  await page.goto('/perform');
  await page.getByLabel('MusicXMLで演奏する', {exact:true}).setInputFiles({name:'warnings.musicxml',mimeType:'application/xml',buffer:Buffer.from(xml)});
  const issues = page.getByLabel('MusicXMLの再生上の注意', {exact:true});
  await expect(issues).toContainText('3種類');
  await issues.locator('summary').click();
  await expect(issues).toContainText('Clarinet・小節 7');
  await expect(issues).toContainText('発音・追従の対象に含めません');
  await page.getByRole('button', {name:'この練習を保存',exact:true}).click();
  await page.getByRole('button', {name:'楽譜専用ページで演奏する →',exact:true}).click();
  await expect(issues).toBeVisible();
  await expect(page.getByRole('button', {name:'▶ 演奏開始',exact:true})).toBeEnabled();
  await page.reload();
  await page.getByRole('region', {name:'マイ楽譜',exact:true}).getByRole('button', {name:'Playback warning fixture',exact:true}).click();
  await expect(issues).toContainText('3種類');
  await page.getByRole('button', {name:'準備・オーケストラ',exact:true}).click();
  await page.getByLabel('MusicXMLで演奏する', {exact:true}).setInputFiles('public/scores/sample-duet.musicxml');
  await expect(page.getByRole('button', {name:'▶ 演奏開始',exact:true})).toBeEnabled();
  await expect(issues).toContainText('移調情報のない移調楽器');
});

test('overlong imported measure is identified without silently shortening the score', async ({ page }) => {
  await page.goto('/perform');
  const overlong = xml.replace('<duration>4</duration>', '<duration>4.5</duration>');
  await page.getByLabel('MusicXMLで演奏する', {exact:true}).setInputFiles({name:'overlong.musicxml',mimeType:'application/xml',buffer:Buffer.from(overlong)});
  const issues = page.getByLabel('MusicXMLの再生上の注意', {exact:true});
  await issues.locator('summary').click();
  await expect(issues).toContainText('拍子より長い小節');
  await expect(issues).toContainText('Clarinet・小節 7');
  await page.getByRole('button', {name:'楽譜専用ページで演奏する →',exact:true}).click();
  await expect(issues).toContainText('拍子より長い小節');
  await expect(page.getByRole('button', {name:'▶ 演奏開始',exact:true})).toBeEnabled();
});
