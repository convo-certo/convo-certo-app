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
  private synth: Tone.PolySynth | null = null;
  private isAudioReady = false;
  private currentTempo = 120;

  private localSoundEnabled = true;
  private onMidiNote: ((msg: MidiNoteMessage) => void) | null = null;

  async init(): Promise<void> {
    try {
      if (navigator.requestMIDIAccess) {
        this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      }
    } catch (err) {
      console.warn("[MidiManager] Web MIDI API not available:", err);
    }
  }

  async initAudio(): Promise<void> {
    if (this.isAudioReady) return;
    await Tone.start();

    const reverb = new Tone.Reverb({ decay: 2.5, wet: 0.25 }).toDestination();
    const eq = new Tone.EQ3({
      low: -2,
      mid: 1,
      high: -4,
    }).connect(reverb);

    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsawtooth", count: 3, spread: 12 },
      envelope: {
        attack: 0.04,
        decay: 0.4,
        sustain: 0.35,
        release: 1.2,
      },
      volume: -10,
    }).connect(eq);

    this.isAudioReady = true;
  }

  getInputDevices(): MidiDeviceInfo[] {
    if (!this.midiAccess) return [];
    const devices: MidiDeviceInfo[] = [];
    this.midiAccess.inputs.forEach((input) => {
      devices.push({
        id: input.id,
        name: input.name ?? "Unknown",
        manufacturer: input.manufacturer ?? "Unknown",
      });
    });
    return devices;
  }

  selectInput(deviceId: string): void {
    if (!this.midiAccess) return;

    // Disconnect previous
    if (this.selectedInput) {
      this.selectedInput.onmidimessage = null;
    }

    const input = this.midiAccess.inputs.get(deviceId);
    if (input) {
      this.selectedInput = input;
      input.onmidimessage = (event) => this.handleMidiMessage(event);
    }
  }

  setNoteCallback(cb: (msg: MidiNoteMessage) => void): void {
    this.onMidiNote = cb;
  }

  setLocalSoundEnabled(enabled: boolean): void {
    this.localSoundEnabled = enabled;
  }

  isLocalSoundEnabled(): boolean {
    return this.localSoundEnabled;
  }

  setTempo(bpm: number): void {
    this.currentTempo = bpm;
  }

  /** Play an accompaniment note via Tone.js */
  playNote(note: NoteEvent, delayMs: number): void {
    if (!this.synth || !this.isAudioReady) return;

    const noteName = midiToNoteName(note.pitch);
    const velocity = note.velocity / 127;
    const durationSec = (note.durationBeats * 60) / this.currentTempo;

    const time = Tone.now() + delayMs / 1000;
    this.synth.triggerAttackRelease(noteName, durationSec, time, velocity);
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

  dispose(): void {
    if (this.selectedInput) {
      this.selectedInput.onmidimessage = null;
    }
    this.synth?.dispose();
    this.synth = null;
    this.isAudioReady = false;
  }

  private handleMidiMessage(event: MIDIMessageEvent): void {
    const data = event.data;
    if (!data || data.length < 3) return;

    const status = data[0] & 0xf0;
    const note = data[1];
    const velocity = data[2];

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
      };
      this.onMidiNote?.(msg);
    }
  }
}
