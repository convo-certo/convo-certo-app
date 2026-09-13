/**
 * MIDI Manager
 *
 * Handles Web MIDI API input from performer's instrument and
 * Tone.js-based audio output for accompaniment playback.
 */

import * as Tone from "tone";
import type { MidiDeviceInfo, MidiNoteMessage, NoteEvent } from "./types";

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const note = NOTE_NAMES[midi % 12];
  return `${note}${octave}`;
}

export class MidiManager {
  private midiAccess: MIDIAccess | null = null;
  private selectedInput: MIDIInput | null = null;
  private inputGeneration = 0;
  private initGeneration = 0;
  private disposed = false;
  private stateHandler: (() => void) | null = null;
  private effects: { dispose(): unknown }[] = [];
  private synth: Tone.PolySynth | null = null;
  private clickHigh: Tone.MembraneSynth | null = null;
  private clickLow: Tone.MembraneSynth | null = null;
  private isAudioReady = false;
  private currentTempo = 120;

  private localSoundEnabled = true;
  private monitorChannels = new Map<number, { synth: Tone.PolySynth; gain: Tone.Gain; notes: Set<number> }>();
  private monitorControllers = new Map<number, { breath?: number; expression?: number }>();
  private onMidiNote: ((msg: MidiNoteMessage) => void) | null = null;

  onError: ((message: string) => void) | null = null;
  onInputLost: (() => void) | null = null;
  private nativeError = (event: Event) => { const selected = this.selectedInput; this.selectInput(""); if (selected) this.onInputLost?.(); this.onError?.(String((event as CustomEvent).detail)); };
  constructor() { if (typeof window !== "undefined") window.addEventListener("convocerto-midi-error", this.nativeError); }
  onController: ((controller: number, value: number) => void) | null = null;
  onDevicesChanged: ((devices: MidiDeviceInfo[]) => void) | null = null;

  async init(): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.initGeneration;
    try {
      if (navigator.requestMIDIAccess) {
        const access = await navigator.requestMIDIAccess({ sysex: false });
        if (this.disposed || generation !== this.initGeneration) return;
        if (this.midiAccess?.onstatechange === this.stateHandler) this.midiAccess.onstatechange = null;
        this.midiAccess = access;
        this.stateHandler = () => {
          if (this.disposed || this.midiAccess !== access) return;
          if (this.selectedInput && (this.selectedInput.state === "disconnected" || !this.midiAccess?.inputs.has(this.selectedInput.id))) { this.selectInput(""); this.onInputLost?.(); }
          this.onDevicesChanged?.(this.getInputDevices());
        };
        access.onstatechange = this.stateHandler;
      }
    } catch (err) {
      console.warn("[MidiManager] Web MIDI API not available:", err);
    }
  }

  async initAudio(): Promise<void> {
    if (this.isAudioReady || this.disposed) return;
    await Tone.start();
    if (this.isAudioReady || this.disposed) return;

    const reverb = new Tone.Reverb({ decay: 3.5, wet: 0.3 }).toDestination();
    const chorus = new Tone.Chorus({
      frequency: 0.5,
      delayTime: 3.5,
      depth: 0.15,
      wet: 0.2,
    }).connect(reverb);
    chorus.start();
    const eq = new Tone.EQ3({
      low: -3,
      mid: 2,
      high: -6,
    }).connect(chorus);

    this.effects = [reverb, chorus, eq];
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle8" },
      envelope: {
        attack: 0.02,
        decay: 0.8,
        sustain: 0.2,
        release: 1.8,
      },
      volume: -8,
    }).connect(eq);

    this.clickHigh = new Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
      volume: -6,
    }).toDestination();

    this.clickLow = new Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 },
      volume: -10,
    }).toDestination();

    this.isAudioReady = true;
  }

  getAudioContext(): AudioContext | null {
    if (!this.isAudioReady) return null;
    return Tone.getContext().rawContext as AudioContext;
  }

  getCurrentTime(): number {
    const ctx = this.getAudioContext();
    return ctx ? ctx.currentTime : performance.now() / 1000;
  }

  getInputDevices(): MidiDeviceInfo[] {
    if (!this.midiAccess) return [];
    const devices: MidiDeviceInfo[] = [];
    this.midiAccess.inputs.forEach((input) => {
      if (input.state === "disconnected") return;
      devices.push({
        id: input.id,
        name: input.name ?? "Unknown",
        manufacturer: input.manufacturer ?? "Unknown",
      });
    });
    return devices;
  }

  selectInput(deviceId: string): void {
    const generation = ++this.inputGeneration;
    this.clearMonitor();
    this.monitorControllers.clear();
    if (!this.midiAccess || this.disposed) return;

    // Disconnect previous
    if (this.selectedInput) {
      this.selectedInput.onmidimessage = null;
    }

    this.selectedInput = null;
    this.synth?.releaseAll();
    const input = this.midiAccess.inputs.get(deviceId);
    if (input && input.state !== "disconnected") {
      this.selectedInput = input;
      input.onmidimessage = (event) => { if (generation === this.inputGeneration && this.selectedInput === input && input.state !== "disconnected") this.handleMidiMessage(event); };
    }
  }

  setNoteCallback(cb: (msg: MidiNoteMessage) => void): void {
    this.onMidiNote = cb;
  }

  setLocalSoundEnabled(enabled: boolean): void {
    this.localSoundEnabled = enabled;
    if (!enabled) { this.synth?.releaseAll(); this.clearMonitor(); }
  }

  isLocalSoundEnabled(): boolean {
    return this.localSoundEnabled;
  }

  setTempo(bpm: number): void {
    this.currentTempo = bpm;
  }

  /** Play an accompaniment note via Tone.js */
  playNote(note: NoteEvent, delayMs: number, audioTime?: number): void {
    if (!this.synth || !this.isAudioReady) return;

    const noteName = midiToNoteName(note.pitch);
    const velocity = note.velocity / 127;
    const durationSec = (note.durationBeats * 60) / this.currentTempo;

    const time = audioTime ?? Tone.now() + delayMs / 1000;
    this.synth.triggerAttackRelease(noteName, durationSec, time, velocity);
  }

  playClick(accent: boolean, audioTime?: number): void {
    if (!this.isAudioReady) return;
    const time = audioTime ?? Tone.now();
    if (accent && this.clickHigh) {
      this.clickHigh.triggerAttackRelease("C5", 0.05, time);
    } else if (this.clickLow) {
      this.clickLow.triggerAttackRelease("C4", 0.04, time);
    }
  }

  /** Play a note immediately (for testing) */
  playNoteImmediate(pitch: number, velocity: number, duration: number): void {
    if (!this.localSoundEnabled) return;
    if (!this.synth || !this.isAudioReady) return;
    const noteName = midiToNoteName(pitch);
    this.synth.triggerAttackRelease(
      noteName,
      duration,
      Tone.now(),
      velocity / 127
    );
  }

  monitorNote(message: MidiNoteMessage): void {
    if (!this.isAudioReady || !this.localSoundEnabled || this.disposed) return;
    const channel = message.channel ?? 0;
    if (!Number.isInteger(channel) || channel < 0 || channel > 15 || !Number.isInteger(message.note) || message.note < 0 || message.note > 127 || !Number.isFinite(message.velocity) || message.velocity < 0 || message.velocity > 127) return;
    let monitor = this.monitorChannels.get(channel);
    if (message.type === "noteon" && message.velocity > 0) {
      if (!monitor) {
        const gain = new Tone.Gain(this.monitorLevel(channel)).toDestination();
        const synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle8" }, envelope: { attack: 0.012, decay: 0.04, sustain: 0.8, release: 0.06 }, volume: -12 }).connect(gain);
        synth.maxPolyphony = 16;
        monitor = { synth, gain, notes: new Set() };
        this.monitorChannels.set(channel, monitor);
      }
      if (monitor.notes.has(message.note)) monitor.synth.triggerRelease(midiToNoteName(message.note), Tone.now());
      monitor.notes.add(message.note);
      monitor.synth.triggerAttack(midiToNoteName(message.note), Tone.now(), message.velocity / 127);
    } else if (monitor) {
      monitor.notes.delete(message.note);
      monitor.synth.triggerRelease(midiToNoteName(message.note), Tone.now());
    }
  }

  private monitorLevel(channel: number): number {
    const controls = this.monitorControllers.get(channel);
    return (controls?.breath ?? controls?.expression ?? 127) / 127;
  }

  private clearMonitor(channel?: number): void {
    for (const [id, monitor] of this.monitorChannels) {
      if (channel != null && id !== channel) continue;
      monitor.gain.dispose();
      monitor.synth.dispose();
      this.monitorChannels.delete(id);
    }
  }

  private controlMonitor(channel: number, controller: number, value: number): void {
    if (controller === 120 || controller === 123) { this.clearMonitor(channel); return; }
    if (controller === 121) this.monitorControllers.delete(channel);
    else if (controller === 2 || controller === 11) {
      const controls = this.monitorControllers.get(channel) ?? {};
      if (controller === 2) controls.breath = value;
      else controls.expression = value;
      this.monitorControllers.set(channel, controls);
    } else return;
    this.monitorChannels.get(channel)?.gain.gain.rampTo(this.monitorLevel(channel), 0.02);
  }

  dispose(): void {
    this.disposed = true;
    this.clearMonitor();
    this.monitorControllers.clear();
    this.initGeneration++;
    this.inputGeneration++;
    this.onMidiNote = null;
    if (typeof window !== "undefined") window.removeEventListener("convocerto-midi-error", this.nativeError);
    this.onError = null;
    this.onInputLost = null;
    if (this.midiAccess?.onstatechange === this.stateHandler) this.midiAccess.onstatechange = null;
    this.stateHandler = null;
    this.midiAccess = null;
    this.onDevicesChanged = null;
    this.onController = null;
    if (this.selectedInput) {
      this.selectedInput.onmidimessage = null;
    }
    this.selectedInput = null;
    this.effects.forEach(effect => effect.dispose());
    this.effects = [];
    this.synth?.dispose();
    this.synth = null;
    this.clickHigh?.dispose();
    this.clickHigh = null;
    this.clickLow?.dispose();
    this.clickLow = null;
    this.isAudioReady = false;
  }

  private handleMidiMessage(event: MIDIMessageEvent): void {
    const data = event.data;
    if (!data || data.length < 3) return;

    const status = data[0] & 0xf0;
    const note = data[1];
    const velocity = data[2];
    if (note > 127 || velocity > 127) return;
    const channel = data[0] & 0x0f;

    if (status === 0xb0) { this.controlMonitor(channel, note, velocity); this.onController?.(note, velocity); }

    let type: MidiNoteMessage["type"] | null = null;
    if (status === 0x90 && velocity > 0) {
      type = "noteon";
    } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
      type = "noteoff";
    }

    if (type) {
      const msg: MidiNoteMessage = {
        type,
        note,
        velocity,
        timestamp: performance.now(),
        channel,
      };
      this.onMidiNote?.(msg);
    }
  }
}
