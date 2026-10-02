import { confirmImportedPart, openDisclosure, openEnsembleLab } from "./helpers/studio";
import { test, expect } from "@playwright/test";

test("experimental follower selection survives reload and is locked during a take", async ({ page }) => {
  await page.goto("/perform?view=settings");
  const load = async () => {
    await page.getByLabel("MusicXMLで演奏する", { exact: true }).setInputFiles("public/scores/sample-duet.musicxml");
    await confirmImportedPart(page);
    await expect(page.getByRole("button", { name: "▶ 演奏開始", exact: true })).toBeEnabled();
    await openEnsembleLab(page);
    await openDisclosure(page, "追従・表現の詳細");
  };
  await load();
  await page.getByLabel("楽譜への追従方式").selectOption("sequence");
  await page.reload();
  await load();
  await expect(page.getByLabel("楽譜への追従方式")).toHaveValue("sequence");
  await page.getByRole("button", { name: "テイクを記録して演奏", exact: true }).click();
  await expect(page.getByLabel("楽譜への追従方式")).toBeDisabled();
  await page.getByRole("button", { name: "テイクを終了", exact: true }).click();
  await page.getByLabel("楽譜への追従方式").selectOption("nearest");
  await page.getByRole("button", { name: "同じ入力でA/B比較", exact: true }).click();
  await expect(page.getByRole("table").filter({ hasText: "同一入力の応答比較" })).toBeVisible();
});

test("real audio routes and voices stay bounded through 30 seconds of seat replacement", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/perform?view=settings");
  const result = await page.evaluate(async () => {
    const modulePath = "/app/lib/orchestra-audio.ts";
    const { OrchestraAudio } = await import(modulePath);
    const audio = new OrchestraAudio();
    const connected = new Set<PannerNode>();
    const active = new Set<AudioBufferSourceNode>();
    let chairGain: GainNode | undefined;
    let peak = 0, started = 0;
    const createPanner = AudioContext.prototype.createPanner;
    const createSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createPanner = function () {
      const node = createPanner.call(this);
      const connect = node.connect.bind(node), disconnect = node.disconnect.bind(node);
      node.connect = ((...args: any[]) => { connected.add(node); chairGain = args[0]; return (connect as any)(...args); }) as typeof node.connect;
      node.disconnect = (() => { connected.delete(node); disconnect(); }) as typeof node.disconnect;
      return node;
    };
    AudioContext.prototype.createBufferSource = function () {
      const node = createSource.call(this);
      active.add(node); started++; peak = Math.max(peak, active.size);
      node.addEventListener("ended", () => active.delete(node));
      return node;
    };
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let maxRoutes = 0, removedRoutes = 0, liveMute = false;
    try {
      await audio.prepare([{ id: "P1", name: "Clarinet", isSolo: false, notes: [] }]);
      for (let i = 0; i < 30; i++) {
        audio.configureSpace([{ id: `chair-${i}`, partIndex: 0, instrument: "clarinet", x: i % 3, z: -2, level: 1 }], { x: 0, z: 1 }, true);
        for (let j = 0; j < 4; j++) audio.play({ pitch: 60 + j, startBeat: 0, durationBeats: 1, velocity: 60, partIndex: 0 }, audio.currentTime, i === 0 ? 0.8 : 0.12);
        maxRoutes = Math.max(maxRoutes, connected.size);
        const muteTime = audio.currentTime;
        if (i === 0) {
          audio.setPartVolume(0, 0);
          audio.configureSpace([{ id: "chair-0", partIndex: 0, instrument: "clarinet", x: 2, z: -2, level: 1 }], { x: 0, z: 1 }, true);
        }
        await wait(100);
        if (i === 0) {
          const deadline = performance.now() + 1000;
          while (audio.currentTime - muteTime < 0.15 && performance.now() < deadline) await wait(10);
          liveMute = !!chairGain && chairGain.gain.value < 0.05 && active.size === 4;
          audio.setPartVolume(0, 1);
        }
        await wait(400);
        audio.configureSpace([], { x: 0, z: 1 }, true);
        removedRoutes = Math.max(removedRoutes, connected.size);
        await wait(500);
      }
      audio.stop(); await wait(300);
      return { started, peak, maxRoutes, removedRoutes, liveMute, active: active.size, routes: connected.size };
    } finally {
      audio.dispose();
      AudioContext.prototype.createPanner = createPanner;
      AudioContext.prototype.createBufferSource = createSource;
    }
  });
  expect(result).toEqual({ started: 120, peak: 4, maxRoutes: 1, removedRoutes: 0, liveMute: true, active: 0, routes: 0 });
});

test('dense orchestra is bounded and stop immediately disconnects every source', async ({page}) => {
  await page.goto('/perform?view=settings');
  const result=await page.evaluate(async () => {
    const modulePath='/app/lib/orchestra-audio.ts';
    const {OrchestraAudio}=await import(modulePath);
    const audio=new OrchestraAudio();
    const connected=new Set<AudioBufferSourceNode>();
    const create=AudioContext.prototype.createBufferSource;
    let created=0, notices=0;
    AudioContext.prototype.createBufferSource=function() {
      const node=create.call(this); created++;
      const connect=node.connect.bind(node), disconnect=node.disconnect.bind(node);
      node.connect=((...args:any[])=>{connected.add(node);return (connect as any)(...args);}) as typeof node.connect;
      node.disconnect=(()=>{connected.delete(node);disconnect();}) as typeof node.disconnect;
      return node;
    };
    audio.onVoiceLimit=()=>notices++;
    try {
      await audio.prepare([{id:'P1',name:'Clarinet',isSolo:false,notes:[]}]);
      const chairs=Array.from({length:64},(_,i)=>({id:`chair-${i}`,partIndex:0,instrument:'clarinet',x:0,z:-2,level:1}));
      audio.configureSpace(chairs,{x:0,z:1},true);
      const note={pitch:60,startBeat:0,durationBeats:1,velocity:40,partIndex:0};
      for(let i=0;i<8;i++) audio.play(note,audio.currentTime+30,10);
      audio.setPartVolume(0,0);
      audio.play(note,audio.currentTime+30,10);
      const mutedNotices=notices;
      audio.setPartVolume(0,1);
      for(let i=0;i<20;i++) audio.play(note,audio.currentTime+30,10);
      const peak=connected.size, firstCreated=created, firstNotices=notices;
      audio.stop();
      const afterStop=connected.size;
      audio.configureSpace(chairs.map((chair:any)=>({...chair,level:0})),{x:0,z:1},true);
      audio.play(note,audio.currentTime,1);
      const silentCreated=created-firstCreated;
      audio.configureSpace(chairs,{x:0,z:1},true);
      audio.play(note,audio.currentTime+30,1);
      return {mutedNotices,peak,firstCreated,firstNotices,afterStop,silentCreated,restarted:connected.size};
    } finally {audio.dispose();AudioContext.prototype.createBufferSource=create;}
  });
  expect(result).toEqual({mutedNotices:0,peak:512,firstCreated:512,firstNotices:1,afterStop:0,silentCreated:0,restarted:64});
});
