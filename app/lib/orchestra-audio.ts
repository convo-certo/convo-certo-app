import { hasSampleSignal } from "./sample-signal";
import { sustainLoop, sustainedInstruments } from "./sustain-loop";
import { playerVariation, chairLevel } from "./player-variation";
import { defaultChairs, type OrchestraChair } from "./orchestra-space";
import type { NoteEvent, ScorePart } from "./types";

export function instrumentForPart(part: ScorePart): string {
  const program = part.midiProgram;
  const name = part.name.toLowerCase();
  const programs: Record<number, string> = { 0: "acoustic_grand_piano", 6: "harpsichord", 9: "glockenspiel", 12: "marimba", 24: "acoustic_guitar_nylon", 40: "violin", 41: "viola", 42: "cello", 43: "contrabass", 46: "orchestral_harp", 47: "timpani", 48: "string_ensemble_1", 49: "string_ensemble_1", 56: "trumpet", 57: "trombone", 58: "tuba", 60: "french_horn", 64: "soprano_sax", 65: "alto_sax", 66: "tenor_sax", 67: "baritone_sax", 68: "oboe", 69: "english_horn", 70: "bassoon", 71: "clarinet", 72: "piccolo", 73: "flute" };
  if (program != null && program !== 0 && programs[program]) return programs[program];
  const names: [RegExp, string][] = [
    [/clarinet|クラリネット/, "clarinet"], [/piccolo|ottavino|ピッコロ/, "piccolo"], [/flut|flaut|flûte|フルート/, "flute"],
    [/english horn|cor anglais/, "english_horn"], [/oboe|oboi|hautbois|オーボエ/, "oboe"], [/bassoon|basson|fagott|ファゴット/, "bassoon"],
    [/horn|corno|corni|cors|ホルン/, "french_horn"], [/trumpet|tromba|trombe|cornet/, "trumpet"], [/trombone/, "trombone"], [/tuba|euphonium/, "tuba"],
    [/contrabass|contrabbass|double bass|contra-bass|contrebass/, "contrabass"], [/cello|violoncelle|celli/, "cello"], [/violin/, "violin"], [/viola|viole|altos/, "viola"],
    [/harp|harfe|arpa/, "orchestral_harp"], [/timpani|timbales/, "timpani"], [/string|弦/, "string_ensemble_1"],
  ];
  for (const [pattern, instrument] of names) if (pattern.test(name)) return instrument;
  return "acoustic_grand_piano";
}

export class OrchestraAudio {
  private chairs: OrchestraChair[] = [];
  private spatial = true;
  private listener = { x: 0, z: 1 };
  private spatialNodes = new Map<string, PannerNode>();
  private chairGains = new Map<string, GainNode>();
  configureSpace(chairs: OrchestraChair[], listener: { x: number; z: number }, enabled: boolean): void {
    this.chairs = chairs; this.listener = listener; this.spatial = enabled;
    if (!this.context) return;
    for (const [id, node] of this.spatialNodes) {
      const chair = chairs.find((item) => item.id === id);
      if (!chair) {
        node.disconnect(); this.chairGains.get(id)?.disconnect();
        this.spatialNodes.delete(id); this.chairGains.delete(id);
        continue;
      }
      this.chairGains.get(id)?.gain.setTargetAtTime(chairLevel(chair, chairs) * (this.gains.get(chair.partIndex) ?? 1), this.currentTime, 0.03);
      if (chair) { node.positionX.setTargetAtTime(enabled ? chair.x - listener.x : 0, this.currentTime, 0.03); node.positionZ.setTargetAtTime(enabled ? chair.z - listener.z : -1, this.currentTime, 0.03); }
    }
  }
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, Map<number, AudioBuffer>>();
  private parts: ScorePart[] = [];
  private clicks = new Set<OscillatorNode>();
  private voices = new Map<AudioBufferSourceNode, GainNode>();
  private limitReported = false;
  onVoiceLimit: () => void = () => {};
  private gains = new Map<number, number>();
  private loadVersion = 0;
  private tuning = 440;
  private sustainBuffers = new WeakMap<AudioBuffer, NonNullable<ReturnType<typeof sustainLoop>>>();
  private soloAudible = false;
  setSoloAudible(enabled: boolean): void { this.soloAudible = enabled; }

  onAvailabilityChanged: (state: string) => void = () => {};
  get availability(): string { return this.context?.state ?? "uninitialized"; }
  async resume(): Promise<void> {
    if (!this.context || this.context.state === "closed") throw new Error("音声を再開できません。楽譜を読み込み直してください。");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([this.context.resume(), new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("音声の再開が完了しません。出力先を確認して再試行してください。")), 5000);
      })]);
    } finally { clearTimeout(timeout); }
    if (this.context.state !== "running") throw new Error("音声がまだ中断されています。出力先を確認して再試行してください。");
  }

  get currentTime(): number { return this.context?.currentTime ?? 0; }

  async prepare(parts: ScorePart[], onProgress?: (message: string) => void): Promise<void> {
    const version = ++this.loadVersion;
    this.stop();

    if (!this.context || this.context.state === "closed") {
      this.master = null;
      this.context = new AudioContext({ latencyHint: "interactive" });
      this.context.onstatechange = () => this.onAvailabilityChanged(this.availability);
    }
    await this.context.resume();
    if (!this.master) {
      this.master = this.context.createGain();
      this.master.gain.value = 0.65;
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.ratio.value = 8;
      this.master.connect(limiter).connect(this.context.destination);
    }
    const instruments = [...new Set([...parts.map(instrumentForPart), "french_horn"])];
    await Promise.all(instruments.map(async (instrument) => {
      if (this.buffers.has(instrument)) return;
      onProgress?.(`音源を準備中: ${instrument.replaceAll("_", " ")}`);
      const samples = new Map<number, AudioBuffer>();
      await Promise.all(Array.from({ length: 7 }, async (_, i) => {
        const octave = i + 1;
        const response = await fetch(`/audio/fluid/${instrument}/C${octave}.mp3`);
        if (!response.ok) throw new Error("楽器の音源を読み込めませんでした。再読み込みしてください。");
        const buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
        if (!hasSampleSignal(buffer)) return;
        if (sustainedInstruments.has(instrument)) {
          const loop = sustainLoop(this.context!, buffer);
          if (loop) this.sustainBuffers.set(buffer, loop);
        }
        samples.set((octave + 1) * 12, buffer);
      }));
      if (!samples.size) throw new Error(`楽器の音源に有効な音がありません: ${instrument}`);
      if (version === this.loadVersion) this.buffers.set(instrument, samples);
    }));
    if (version === this.loadVersion) { this.parts = parts; this.gains.clear(); this.chairs = defaultChairs(parts); }
  }

  playClick(time: number, accent: boolean): void {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const start = Math.max(this.currentTime, time);
    oscillator.frequency.value = accent ? 1400 : 1000;
    gain.gain.setValueAtTime(0.15, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.045);
    oscillator.connect(gain).connect(this.master);
    this.clicks.add(oscillator);
    oscillator.start(start); oscillator.stop(start + 0.05);
    oscillator.onended = () => { this.clicks.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
  }

  setTuning(hz: number): void { this.tuning = hz; }

  setVolume(volume: number): void {
    if (this.master && this.context) this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), this.currentTime, 0.02);
  }

  setPartVolume(part: number, volume: number): void {
    this.gains.set(part, volume);
    for (const chair of this.chairs) if (chair.partIndex === part) this.chairGains.get(chair.id)?.gain.setTargetAtTime(chairLevel(chair, this.chairs) * volume, this.currentTime, 0.02);
  }

  play(note: NoteEvent, time: number, duration: number, notatedDuration = duration): void {
    if (!this.context || !this.master) return;
    const part = this.parts[note.partIndex];
    if (!part || (part.isSolo && !this.soloAudible)) return;
    for (const chair of this.chairs.filter((item) => item.partIndex === note.partIndex)) this.playChair(note, time, duration, chair, notatedDuration);
  }

  private playChair(note: NoteEvent, time: number, duration: number, chair: OrchestraChair, notatedDuration: number): void {
    if (!this.context || !this.master || chair.level <= 0) return;
    const samples = this.buffers.get(chair.instrument);
    if (!samples?.size) return;
    const level = (this.gains.get(note.partIndex) ?? 1);
    if (level === 0) return;
    if (this.voices.size >= 512) {
      if (!this.limitReported) { this.limitReported = true; this.onVoiceLimit(); }
      return;
    }

    const root = [...samples.keys()].reduce((a, b) => Math.abs(a - note.pitch) < Math.abs(b - note.pitch) ? a : b);
    const source = this.context.createBufferSource();
    const originalBuffer = samples.get(root)!;
    const variation = playerVariation(chair, note);
    source.playbackRate.value = 2 ** ((note.pitch - root + variation.cents / 100) / 12) * this.tuning / 440;
    const sustained = this.sustainBuffers.get(originalBuffer);
    if (sustained && duration * source.playbackRate.value > sustained.end) {
      source.buffer = sustained.buffer;
      source.loop = true;
      source.loopStart = sustained.start;
      source.loopEnd = sustained.end;
    } else source.buffer = originalBuffer;
    const gain = this.context.createGain();
    let pan = this.spatialNodes.get(chair.id);
    if (!pan) {
      pan = this.context.createPanner();
      pan.panningModel = "HRTF";
      pan.distanceModel = "inverse";
      pan.refDistance = 4;
      pan.rolloffFactor = 0.65;
      pan.positionX.value = this.spatial ? chair.x - this.listener.x : 0;
      pan.positionZ.value = this.spatial ? chair.z - this.listener.z : -1;
      const chairGain = this.context.createGain();
      chairGain.gain.value = chairLevel(chair, this.chairs) * level;
      pan.connect(chairGain).connect(this.master);
      this.chairGains.set(chair.id, chairGain);
      this.spatialNodes.set(chair.id, pan);
    }
    const start = Math.max(this.currentTime, time) + variation.delay;
    const release = Math.max(0.04, duration * variation.gate);
    const velocity = Math.pow(note.velocity / 127, 1.4) * 0.55 * variation.gain;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(velocity, start + 0.008);
    const curve = note.gainCurve?.filter(point=>Number.isFinite(point.position) && point.position>=0 && point.position<=1 && Number.isFinite(point.gain) && point.gain>=0).sort((a,b)=>a.position-b.position);
    let lastLevel = velocity;
    if (curve?.length && notatedDuration > 0) {
      for (let index=1; index<curve.length; index++) {
        const previous=curve[index-1], point=curve[index];
        const end=Math.min(release,point.position*notatedDuration);
        const fraction=point.position>previous.position ? (end/notatedDuration-previous.position)/(point.position-previous.position) : 1;
        const factor=previous.gain+(point.gain-previous.gain)*Math.max(0,Math.min(1,fraction));
        lastLevel=Math.pow(Math.min(127,note.velocity*factor)/127,1.4)*0.55*variation.gain;
        gain.gain.linearRampToValueAtTime(lastLevel,start+Math.max(0.008,end));
        if (point.position*notatedDuration>=release) break;
      }
    }
    gain.gain.setValueAtTime(lastLevel, start + release);
    gain.gain.linearRampToValueAtTime(0, start + release + 0.12);
    source.connect(gain).connect(pan);
    this.voices.set(source, gain);
    source.onended = () => { this.voices.delete(source); source.disconnect(); gain.disconnect(); };
    source.start(start);
    source.stop(start + release + 0.13);
  }

  stop(): void {
    for (const click of this.clicks) { try { click.stop(); } catch {} }
    this.clicks.clear();
    for (const [source, gain] of this.voices) {
      try { source.stop(); } catch {}
      source.onended = null; source.disconnect(); gain.disconnect();
    }
    this.limitReported = false;
    this.voices.clear();
    for (const node of this.spatialNodes.values()) node.disconnect();
    this.spatialNodes.clear();
    for (const gain of this.chairGains.values()) gain.disconnect();
    this.chairGains.clear();
  }

  dispose(): void {
    this.loadVersion++;
    this.stop();
    if (this.context) this.context.onstatechange = null;
    this.onAvailabilityChanged = () => {};
    this.onVoiceLimit = () => {};
    if (this.context?.state !== "closed") void this.context?.close();
    this.context = null;
    this.master = null;
    this.buffers.clear();
  }
}
