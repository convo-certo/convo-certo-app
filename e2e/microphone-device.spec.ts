import { test, expect } from '@playwright/test';

const load = async (page: import('@playwright/test').Page) => {
  await page.goto('/perform');
  await page.getByLabel('MusicXMLで演奏する', { exact: true }).setInputFiles('public/scores/sample-duet.musicxml');
  await expect(page.getByRole('button', { name: '▶ 演奏開始', exact: true })).toBeEnabled();
};

test('permission reveals microphones, exact selection survives unplug, and retry never falls back', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { permitted: false, usb: true, calls: [] as any[], contexts: [] as AudioContext[], track: null as MediaStreamTrack | null };
    (window as any).micDevicesTest = state;
    navigator.mediaDevices.enumerateDevices = async () => (state.permitted
      ? [{ kind: 'audioinput', deviceId: 'internal', label: 'Built-in Mic' }, ...(state.usb ? [{ kind: 'audioinput', deviceId: 'usb', label: 'USB Clarinet Mic' }] : []), { kind: 'audiooutput', deviceId: 'speaker', label: 'Speakers' }]
      : [{ kind: 'audioinput', deviceId: '', label: '' }]) as MediaDeviceInfo[];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      state.calls.push(constraints);
      const audio = constraints?.audio as MediaTrackConstraints;
      const selected = (audio?.deviceId as ConstrainDOMStringParameters)?.exact;
      if (selected === 'usb' && !state.usb) throw new DOMException('Missing selected microphone', 'OverconstrainedError');
      const context = new AudioContext(); await context.resume(); state.contexts.push(context);
      const stream = context.createMediaStreamDestination().stream;
      state.track = stream.getAudioTracks()[0];
      Object.defineProperty(state.track, 'label', { value: selected === 'usb' ? 'USB Clarinet Mic' : 'Built-in Mic' });
      state.permitted = true;
      return stream;
    };
  });
  await load(page);
  const devices = page.getByLabel('使用するマイク', { exact: true });
  expect(await page.evaluate(() => (window as any).micDevicesTest.calls.length)).toBe(0);
  await page.getByRole('button', { name: 'マイクで演奏する', exact: true }).click();
  await expect(page.getByText('使用中のマイク: Built-in Mic', { exact: false })).toBeVisible();
  await expect(devices).toBeDisabled();
  await expect(devices.locator('option')).toHaveCount(3);
  await page.getByRole('button', { name: 'マイクを停止', exact: true }).click();
  await devices.selectOption('usb');
  await page.getByRole('button', { name: 'マイクで演奏する', exact: true }).click();
  await expect(page.getByText('使用中のマイク: USB Clarinet Mic', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '▶ 演奏開始', exact: true }).click();
  await page.evaluate(() => {
    const state = (window as any).micDevicesTest;
    state.usb = false;
    navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
    state.track.stop(); state.track.dispatchEvent(new Event('ended'));
  });
  await expect(devices).toBeEnabled();
  await expect(devices).toHaveValue('usb');
  await expect(devices.locator('option:checked')).toContainText('一覧にありません');
  await expect(page.getByText('使用中のマイク:', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '▶ 演奏開始', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'マイクで演奏する', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('選択したマイクを開始できませんでした');
  const calls = await page.evaluate(() => (window as any).micDevicesTest.calls);
  expect(calls).toHaveLength(3);
  expect(calls[0].audio.deviceId).toBeUndefined();
  expect(calls[1].audio).toEqual({ deviceId: { exact: 'usb' }, echoCancellation: false, noiseSuppression: false, autoGainControl: false });
  expect(calls[2].audio.deviceId).toEqual({ exact: 'usb' });
  await page.evaluate(() => { (window as any).micDevicesTest.usb = true; navigator.mediaDevices.dispatchEvent(new Event('devicechange')); });
  await expect(devices.locator('option:checked')).toHaveText('USB Clarinet Mic');
  await page.getByRole('button', { name: 'マイクで演奏する', exact: true }).click();
  await expect(page.getByRole('button', { name: 'マイクを停止', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '▶ 演奏開始', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'マイクを停止', exact: true }).click();
  await page.evaluate(async () => { for (const context of (window as any).micDevicesTest.contexts) await context.close(); });
});

test('older device lists cannot replace a newer refresh and list failures allow retry', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'audioinput', deviceId: 'first', label: 'First Mic' }] as MediaDeviceInfo[];
  });
  await load(page);
  const devices = page.getByLabel('使用するマイク', { exact: true });
  await expect(devices.locator('option')).toHaveCount(2);
  await page.evaluate(() => {
    (window as any).micListResolvers = [];
    navigator.mediaDevices.enumerateDevices = () => new Promise((resolve) => (window as any).micListResolvers.push(resolve));
  });
  await page.getByRole('button', { name: 'マイク一覧を更新', exact: true }).click();
  await page.getByRole('button', { name: 'マイク一覧を更新', exact: true }).click();
  await page.evaluate(() => {
    const resolvers = (window as any).micListResolvers;
    resolvers[1]([{ kind: 'audioinput', deviceId: 'new', label: 'New Mic' }]);
  });
  await expect(devices.locator('option').last()).toHaveText('New Mic');
  await page.evaluate(() => (window as any).micListResolvers[0]([{ kind: 'audioinput', deviceId: 'old', label: 'Old Mic' }]));
  await expect(devices.locator('option').last()).toHaveText('New Mic');
  await page.evaluate(() => { navigator.mediaDevices.enumerateDevices = async () => { throw new Error('Unavailable list'); }; });
  await page.getByRole('button', { name: 'マイク一覧を更新', exact: true }).click();
  await expect(page.getByText('マイク一覧を取得できませんでした。', { exact: false })).toBeVisible();
  await expect(devices.locator('option').last()).toHaveText('New Mic');
  await page.evaluate(() => { navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'audioinput', deviceId: 'retry', label: 'Retry Mic' }] as MediaDeviceInfo[]; });
  await page.getByRole('button', { name: 'マイク一覧を更新', exact: true }).click();
  await expect(devices.locator('option').last()).toHaveText('Retry Mic');
  await expect(page.getByText('マイク一覧を取得できませんでした。', { exact: false })).toHaveCount(0);
});

test('cancelling permission preparation releases a late stream without activating its device', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(); await context.resume();
      const stream = context.createMediaStreamDestination().stream;
      (window as any).lateMicrophone = { context, track: stream.getAudioTracks()[0] };
      return new Promise<MediaStream>((resolve) => { (window as any).grantLateMicrophone = () => resolve(stream); });
    };
  });
  await load(page);
  await page.getByRole('button', { name: 'マイクで演奏する', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).grantLateMicrophone)).toBe('function');
  await expect(page.getByLabel('使用するマイク', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'マイク準備をキャンセル', exact: true }).click();
  await page.evaluate(() => (window as any).grantLateMicrophone());
  await expect.poll(() => page.evaluate(() => (window as any).lateMicrophone.track.readyState)).toBe('ended');
  await expect(page.getByLabel('使用するマイク', { exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'マイクで演奏する', exact: true })).toBeVisible();
  await expect(page.getByText('使用中のマイク:', { exact: false })).toHaveCount(0);
  await page.evaluate(() => (window as any).lateMicrophone.context.close());
});
