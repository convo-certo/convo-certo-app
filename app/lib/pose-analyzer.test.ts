import { beforeEach, expect, it, vi } from 'vitest';
import { PoseAnalyzer } from './pose-analyzer';
import packageInfo from '../../package.json';

const mocks = vi.hoisted(() => ({ files: vi.fn(), create: vi.fn() }));
vi.mock('@mediapipe/tasks-vision', () => ({ FilesetResolver: {forVisionTasks:mocks.files}, PoseLandmarker: {createFromOptions:mocks.create} }));
const deferred = <T>() => { let resolve!: (value:T) => void; const promise=new Promise<T>(done=>{resolve=done;}); return {promise,resolve}; };
const model = () => ({close:vi.fn(),detectForVideo:vi.fn()});
const video = () => { const element=document.createElement('video'); element.play=vi.fn().mockResolvedValue(undefined); return element; };
beforeEach(() => { vi.clearAllMocks(); mocks.files.mockResolvedValue({}); mocks.create.mockResolvedValue(model()); });

it('matches the pinned installed JS version to its WASM URL', async () => {
  const analyzer=new PoseAnalyzer(); await analyzer.init(video());
  expect(mocks.files).toHaveBeenCalledWith(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${packageInfo.dependencies['@mediapipe/tasks-vision']}/wasm`);
  analyzer.dispose();
});
it('reports model initialization failure and does not request a camera', async () => {
  mocks.create.mockRejectedValueOnce(new Error('offline'));
  const getUserMedia=vi.fn(); Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia}});
  const analyzer=new PoseAnalyzer();
  await expect(analyzer.init(video())).rejects.toThrow('姿勢認識を準備できませんでした');
  expect(await analyzer.startCamera()).toBeNull(); expect(getUserMedia).not.toHaveBeenCalled();
});
it('closes a model delivered after disposal', async () => {
  const pending=deferred<ReturnType<typeof model>>();const detector=model(); mocks.create.mockReturnValueOnce(pending.promise);
  const analyzer=new PoseAnalyzer(); const initializing=analyzer.init(video()); analyzer.dispose(); pending.resolve(detector); await initializing;
  expect(detector.close).toHaveBeenCalledTimes(1); expect(await analyzer.startCamera()).toBeNull();
});
it('stops camera tracks delivered after disposal', async () => {
  const pending=deferred<MediaStream>(); const stop=vi.fn();
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>pending.promise}});
  const element=video();const analyzer=new PoseAnalyzer();await analyzer.init(element);const starting=analyzer.startCamera();analyzer.dispose();
  pending.resolve({getTracks:()=>[{stop}]} as unknown as MediaStream);
  expect(await starting).toBeNull();expect(stop).toHaveBeenCalledTimes(1);expect(element.play).not.toHaveBeenCalled();
});
it('releases a successful camera and model once when disposed repeatedly', async () => {
  const detector=model(),stop=vi.fn(); mocks.create.mockResolvedValueOnce(detector);
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop}]})}});
  const element=video();const analyzer=new PoseAnalyzer(); await analyzer.init(element);await analyzer.startCamera();analyzer.dispose();analyzer.dispose();
  expect(detector.close).toHaveBeenCalledTimes(1);expect(stop).toHaveBeenCalledTimes(1);expect(element.srcObject).toBeNull();
});
