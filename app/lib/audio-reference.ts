/**
 * AudioReference - Analyses a reference audio recording to extract
 * tempo curves, dynamics envelopes, and rubato patterns.
 *
 * When a user loads a recording (e.g. a favourite conductor's
 * interpretation), this module extracts the musical character so
 * the accompaniment engine can mirror it.
 */

export interface TempoPoint {
  beat: number;
  tempo: number;
}

export interface DynamicsPoint {
  beat: number;
  level: number;
}

export interface AudioReferenceProfile {
  averageTempo: number;
  tempoCurve: TempoPoint[];
  dynamicsCurve: DynamicsPoint[];
  totalBeats: number;
  totalDuration: number;
}

export class AudioReferenceAnalyser {
  private audioContext: AudioContext | null = null;
  private profile: AudioReferenceProfile | null = null;

  async analyse(audioBuffer: AudioBuffer): Promise<AudioReferenceProfile> {
    this.audioContext = new AudioContext({
      sampleRate: audioBuffer.sampleRate,
    });

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    const onsets = this.detectOnsets(channelData, sampleRate);
    const tempoCurve = this.estimateTempoCurve(onsets);
    const dynamicsCurve = this.extractDynamics(channelData, sampleRate);
    const averageTempo = this.computeAverageTempo(tempoCurve);

    const totalDuration = audioBuffer.duration;
    const totalBeats = averageTempo * (totalDuration / 60);

    this.profile = {
      averageTempo,
      tempoCurve,
      dynamicsCurve,
      totalBeats,
      totalDuration,
    };

    this.audioContext.close();
    this.audioContext = null;

    return this.profile;
  }

  async analyseFromFile(file: File): Promise<AudioReferenceProfile> {
    const arrayBuffer = await file.arrayBuffer();
    const ctx = new AudioContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    ctx.close();
    return this.analyse(audioBuffer);
  }

  getProfile(): AudioReferenceProfile | null {
    return this.profile;
  }

  getTempoAtBeat(beat: number): number {
    if (!this.profile || this.profile.tempoCurve.length === 0) {
      return this.profile?.averageTempo ?? 120;
    }

    const curve = this.profile.tempoCurve;
    if (beat <= curve[0].beat) return curve[0].tempo;
    if (beat >= curve[curve.length - 1].beat)
      return curve[curve.length - 1].tempo;

    for (let i = 0; i < curve.length - 1; i++) {
      if (beat >= curve[i].beat && beat < curve[i + 1].beat) {
        const t =
          (beat - curve[i].beat) / (curve[i + 1].beat - curve[i].beat);
        return curve[i].tempo + t * (curve[i + 1].tempo - curve[i].tempo);
      }
    }

    return this.profile.averageTempo;
  }

  getDynamicsAtBeat(beat: number): number {
    if (!this.profile || this.profile.dynamicsCurve.length === 0) return 0.5;

    const curve = this.profile.dynamicsCurve;
    if (beat <= curve[0].beat) return curve[0].level;
    if (beat >= curve[curve.length - 1].beat)
      return curve[curve.length - 1].level;

    for (let i = 0; i < curve.length - 1; i++) {
      if (beat >= curve[i].beat && beat < curve[i + 1].beat) {
        const t =
          (beat - curve[i].beat) / (curve[i + 1].beat - curve[i].beat);
        return curve[i].level + t * (curve[i + 1].level - curve[i].level);
      }
    }

    return 0.5;
  }

  private detectOnsets(
    data: Float32Array,
    sampleRate: number
  ): number[] {
    const hopSize = Math.round(sampleRate * 0.01);
    const frameSize = Math.round(sampleRate * 0.02);
    const onsets: number[] = [];
    let prevEnergy = 0;
    const threshold = 0.02;

    for (let i = 0; i < data.length - frameSize; i += hopSize) {
      let energy = 0;
      for (let j = 0; j < frameSize; j++) {
        energy += data[i + j] * data[i + j];
      }
      energy /= frameSize;

      const spectralFlux = energy - prevEnergy;
      if (spectralFlux > threshold && energy > 0.001) {
        const timeSeconds = i / sampleRate;
        if (
          onsets.length === 0 ||
          timeSeconds - onsets[onsets.length - 1] > 0.1
        ) {
          onsets.push(timeSeconds);
        }
      }
      prevEnergy = energy;
    }

    return onsets;
  }

  private estimateTempoCurve(onsets: number[]): TempoPoint[] {
    if (onsets.length < 3) return [];

    const windowSize = 8;
    const curve: TempoPoint[] = [];
    let beatCount = 0;

    for (let i = 1; i < onsets.length; i++) {
      const ioi = onsets[i] - onsets[i - 1];
      if (ioi > 0.15 && ioi < 3.0) {
        const instantTempo = 60 / ioi;
        beatCount++;

        if (i >= windowSize) {
          let sum = 0;
          let count = 0;
          for (
            let j = Math.max(1, i - windowSize);
            j <= i;
            j++
          ) {
            const localIoi = onsets[j] - onsets[j - 1];
            if (localIoi > 0.15 && localIoi < 3.0) {
              sum += 60 / localIoi;
              count++;
            }
          }
          if (count > 0) {
            curve.push({ beat: beatCount, tempo: sum / count });
          }
        } else {
          curve.push({ beat: beatCount, tempo: instantTempo });
        }
      }
    }

    return curve;
  }

  private extractDynamics(
    data: Float32Array,
    sampleRate: number
  ): DynamicsPoint[] {
    const windowSeconds = 0.5;
    const hopSeconds = 0.25;
    const windowSamples = Math.round(sampleRate * windowSeconds);
    const hopSamples = Math.round(sampleRate * hopSeconds);
    const curve: DynamicsPoint[] = [];
    let maxRms = 0;

    const rmsValues: number[] = [];
    for (let i = 0; i < data.length - windowSamples; i += hopSamples) {
      let sum = 0;
      for (let j = 0; j < windowSamples; j++) {
        sum += data[i + j] * data[i + j];
      }
      const rms = Math.sqrt(sum / windowSamples);
      rmsValues.push(rms);
      if (rms > maxRms) maxRms = rms;
    }

    if (maxRms === 0) return [];

    for (let i = 0; i < rmsValues.length; i++) {
      const timeSeconds = i * hopSeconds;
      curve.push({
        beat: timeSeconds,
        level: rmsValues[i] / maxRms,
      });
    }

    return curve;
  }

  private computeAverageTempo(curve: TempoPoint[]): number {
    if (curve.length === 0) return 120;
    const sum = curve.reduce((s, p) => s + p.tempo, 0);
    return sum / curve.length;
  }
}
