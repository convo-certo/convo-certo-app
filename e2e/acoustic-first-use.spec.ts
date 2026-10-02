import { test, expect, type Page } from "@playwright/test";

type SimulatedAcousticInput = {
  denied: boolean;
  calls: number;
  setSignal: (signal: "silence" | "tone" | "noise", midi?: number) => void;
  close: () => Promise<void>;
};

declare global {
  interface Window {
    simulatedAcousticInput: SimulatedAcousticInput;
  }
}

async function installSimulatedInput(page: Page) {
  await page.addInitScript(() => {
    const sources: {
      context: AudioContext;
      fundamental: OscillatorNode;
      overtone: OscillatorNode;
      toneGain: GainNode;
      noiseGain: GainNode;
    }[] = [];
    let signal: "silence" | "tone" | "noise" = "silence";
    let midi = 70;
    const apply = () => {
      for (const source of sources) {
        const frequency = 440 * 2 ** ((midi - 69) / 12);
        source.fundamental.frequency.value = frequency;
        source.overtone.frequency.value = frequency * 3;
        source.toneGain.gain.value = signal === "tone" ? 1 : 0;
        source.noiseGain.gain.value = signal === "noise" ? 1 : 0;
      }
    };
    window.simulatedAcousticInput = {
      denied: false,
      calls: 0,
      setSignal(next, pitch = midi) { signal = next; midi = pitch; apply(); },
      async close() { await Promise.all(sources.map(source => source.context.close())); },
    };
    navigator.mediaDevices.enumerateDevices = async () => [
      { kind: "audioinput", deviceId: "simulated-acoustic", label: "Simulated acoustic input" },
    ] as MediaDeviceInfo[];
    navigator.mediaDevices.getUserMedia = async () => {
      window.simulatedAcousticInput.calls++;
      if (window.simulatedAcousticInput.denied) throw new DOMException("Simulated permission denial", "NotAllowedError");
      const context = new AudioContext();
      await context.resume();
      const destination = context.createMediaStreamDestination();
      const toneGain = context.createGain();
      toneGain.gain.value = 0;
      toneGain.connect(destination);
      const fundamental = context.createOscillator();
      const fundamentalGain = context.createGain();
      fundamentalGain.gain.value = 0.2;
      fundamental.connect(fundamentalGain).connect(toneGain);
      fundamental.start();
      const overtone = context.createOscillator();
      const overtoneGain = context.createGain();
      overtoneGain.gain.value = 0.08;
      overtone.connect(overtoneGain).connect(toneGain);
      overtone.start();
      const noiseGain = context.createGain();
      noiseGain.gain.value = 0;
      noiseGain.connect(destination);
      const noise = context.createBufferSource();
      noise.buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const samples = noise.buffer.getChannelData(0);
      let seed = 123456789;
      for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        samples[i] = (seed / 4294967296 - 0.5) * 0.4;
      }
      noise.loop = true;
      noise.connect(noiseGain);
      noise.start();
      Object.defineProperty(destination.stream.getAudioTracks()[0], "label", { value: "Simulated acoustic input" });
      sources.push({ context, fundamental, overtone, toneGain, noiseGain });
      apply();
      return destination.stream;
    };
  });
}

async function openStarterFromHome(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "収録曲で試す", exact: false }).click();
  await page.getByRole("region", { name: "はじめの2曲" }).getByRole("button", { name: "短いデュエット", exact: false }).click();
  const preparation = page.getByRole("region", { name: "生楽器の準備" });
  await expect(preparation).toBeVisible();
  await expect(preparation.getByLabel("演奏する楽器", { exact: true })).toBeVisible();
  return preparation;
}

const signal = (page: Page, next: "silence" | "tone" | "noise", midi?: number) =>
  page.evaluate(({ next, midi }) => window.simulatedAcousticInput.setSignal(next, midi), { next, midi });

test.afterEach(async ({ page }) => {
  await page.evaluate(async () => { await window.simulatedAcousticInput?.close(); });
});

test("simulated harmonic input checks B-flat, A and concert-pitch instruments from the home entry", async ({ page }) => {
  await installSimulatedInput(page);
  const preparation = await openStarterFromHome(page);
  const instrument = preparation.getByLabel("演奏する楽器", { exact: true });
  const check = preparation.getByRole("region", { name: "一音チェック" });
  const matched = check.getByText("最初の音を確認できました", { exact: false });
  await instrument.selectOption("-2");
  await expect.poll(() => page.evaluate(() => window.simulatedAcousticInput.calls)).toBe(0);
  await preparation.getByRole("button", { name: "マイクで演奏する", exact: true }).click();
  await expect(preparation.getByRole("button", { name: "マイクを停止", exact: true })).toBeVisible();
  await expect(check).toContainText("譜面の最初の音：C5");
  await page.waitForTimeout(400);
  await expect(matched).not.toBeVisible();
  await signal(page, "tone", 70);
  await expect(matched).toBeVisible();
  await signal(page, "silence");
  await instrument.selectOption("-3");
  await expect(matched).not.toBeVisible();
  await signal(page, "tone", 70);
  await page.waitForTimeout(500);
  await expect(matched).not.toBeVisible();
  await signal(page, "tone", 69);
  await expect(matched).toBeVisible();
  await signal(page, "silence");
  await instrument.selectOption("0");
  await expect(matched).not.toBeVisible();
  await expect(check).toContainText("譜面の最初の音：C5");
  await signal(page, "tone", 72);
  await expect(matched).toBeVisible();
  await signal(page, "silence");
  await preparation.getByRole("button", { name: "マイクを停止", exact: true }).click();
  await expect(matched).not.toBeVisible();
  await preparation.getByRole("button", { name: "マイクで演奏する", exact: true }).click();
  await expect(preparation.getByRole("button", { name: "マイクを停止", exact: true })).toBeVisible();
  await page.waitForTimeout(400);
  await expect(matched).not.toBeVisible();
  await signal(page, "tone", 72);
  await expect(matched).toBeVisible();
});

test("simulated noise registers as sound without a matched note on a narrow first-use screen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installSimulatedInput(page);
  const preparation = await openStarterFromHome(page);
  await preparation.getByLabel("演奏する楽器", { exact: true }).selectOption("-2");
  await preparation.getByText("別のマイクを選ぶ", { exact: true }).click();
  await preparation.getByLabel("準備で使用するマイク", { exact: true }).selectOption("simulated-acoustic");
  await preparation.getByRole("button", { name: "マイクで演奏する", exact: true }).click();
  await signal(page, "noise");
  const level = preparation.getByRole("meter", { name: "届いている音の大きさ" });
  await expect.poll(async () => Number(await level.getAttribute("aria-valuenow") ?? await level.getAttribute("value"))).toBeGreaterThan(0);
  const check = preparation.getByRole("region", { name: "一音チェック" });
  await expect(check).toContainText("音は届いています");
  await page.waitForTimeout(500);
  await expect(check.getByText("最初の音を確認できました", { exact: false })).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("simulated-acoustic-first-use-phone.png"), fullPage: true });
});

test("simulated permission denial can be retried from the same first-use preparation", async ({ page }) => {
  await installSimulatedInput(page);
  const preparation = await openStarterFromHome(page);
  await preparation.getByLabel("演奏する楽器", { exact: true }).selectOption("-2");
  await page.evaluate(() => { window.simulatedAcousticInput.denied = true; });
  await preparation.getByRole("button", { name: "マイクで演奏する", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("マイク");
  await expect(preparation.getByRole("button", { name: "マイクで演奏する", exact: true })).toBeEnabled();
  await expect(preparation.getByRole("region", { name: "一音チェック" }).getByText("最初の音を確認できました", { exact: false })).not.toBeVisible();
  await page.evaluate(() => { window.simulatedAcousticInput.denied = false; });
  await signal(page, "tone", 70);
  await preparation.getByRole("button", { name: "マイクで演奏する", exact: true }).click();
  await expect(preparation.getByRole("region", { name: "一音チェック" })).toContainText("最初の音を確認できました");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => window.simulatedAcousticInput.calls)).toBe(2);
});
