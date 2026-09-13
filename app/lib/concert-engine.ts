import { noteTail } from "./note-tail";
import { workSignature } from "./score-signature";
import type { MeasureAnnotation, MidiNoteMessage, NoteEvent, ParsedScore, RoleMode } from "./types";
import { SequenceFollower } from "./sequence-follower";
import { PerformanceFollower } from "./performance-follower";
import { expressionAt } from "./expressive-intent";
import { playerPart } from "./performance-seats";
import { defaultEnsembleTuning, readEnsembleTuning, type EnsembleTuning } from "./ensemble-tuning";
import { referenceAt, type ReferenceProfile } from "./reference-profile";
import { TempoMap } from "./tempo-map";

export interface ConcertState {
  expression?: string;
  leader?: string;
  countInRemaining?: number;
  inputFeedback?: "matched" | "unmatched";
  status: "idle" | "playing" | "waiting" | "finished";
  beat: number;
  measure: number;
  tempo: number;
  mode: RoleMode;
  confidence: number;
  matchedBeat: number | null;
}

export type ConcertObservation = { type: "control"; time: number; action: "cue" | "changed" } | { type: "input"; time: number; message: MidiNoteMessage } | { type: "state"; time: number; state: ConcertState };

export class ConcertEngine {
  private observers = new Set<(event: ConcertObservation) => void>();
  observe(callback: (event: ConcertObservation) => void): () => void { this.observers.add(callback); return () => { this.observers.delete(callback); }; }
  private observeEvent(event: ConcertObservation): void { for (const observer of this.observers) observer(event); }
  advance(): void { this.tick(); }
  getLoop() { return this.loop ? { ...this.loop } : null; }
  getBaseTempo(): number { return this.baseTempo; }

  private score: ParsedScore | null = null;
  private practiceMode: "accompany" | "listen" | "wait" = "accompany";
  private countInBars = 0;
  private clickEnabled = false;
  private countInStart = 0;
  private countInUntil = 0;
  private countInIndex = 0;
  private lastClickBeat = -Infinity;
  private waitPitches = new Set<number>();
  onClick: (time: number, accent: boolean) => void = () => {};
  getPracticeOptions() { return { mode: this.practiceMode, countInBars: this.countInBars, click: this.clickEnabled }; }
  setPracticeOptions(options: { mode: "accompany" | "listen" | "wait"; countInBars: number; click: boolean }): void {
    this.observeEvent({ type: "control", time: this.clock(), action: "changed" });
    this.stop();
    this.practiceMode = options.mode;
    this.countInBars = Math.max(0, Math.min(2, options.countInBars));
    this.clickEnabled = options.click;
    if (this.score) this.notes = this.score.parts.filter((part) => options.mode === "listen" || part.id !== playerPart(this.score!)?.id).flatMap((part) => part.notes).sort((a, b) => a.startBeat - b.startBeat);
  }
  private tuning = { ...defaultEnsembleTuning };
  private leader = "player";
  private reference: ReferenceProfile | null = null;
  setReference(profile: ReferenceProfile | null): void {
    this.observeEvent({ type: "control", time: this.clock(), action: "changed" });
    if (profile && (!this.score || profile.workSignature !== workSignature(this.score) || profile.points.at(-1)!.beat > this.score.totalBeats)) throw new Error("同じ作品・楽章の表現を選んでください。");
    this.reference = profile ? structuredClone(profile) : null;
  }
  getReference(): ReferenceProfile | null { return this.reference ? structuredClone(this.reference) : null; }
  private notes: NoteEvent[] = [];
  private index = 0;
  private resumeHeldNotes: number | null = null;
  private startCountInOverride: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTime = 0;
  private follower: PerformanceFollower | SequenceFollower = new PerformanceFollower();
  private tempoMap = new TempoMap([], 120);
  private baseTempo = 120;
  private lastMatchedTime = -Infinity;
  private followedTempo = 120;
  private phaseError = 0;
  private dynamicRatio = 1;
  private articulationRatio = 1;
  private inputLevel = 0;
  private sounding: { pitch: number; channel: number; time: number; duration: number; tempo: number } | null = null;
  private mode: RoleMode = "follow";
  private annotations: MeasureAnnotation[] = [];
  private visitedWaits = new Set<number>();
  private waitDeadline: number | null = null;
  private loop: { start: number; end: number } | null = null;
  private state: ConcertState = { status: "idle", beat: 0, measure: 1, tempo: 120, mode: "follow", confidence: 0, matchedBeat: null };
  onState: (state: ConcertState) => void = () => {};
  onNote: (note: NoteEvent, time: number, duration: number, notatedDuration: number) => void = () => {};
  onSilence: () => void = () => {};

  constructor(private clock: () => number = () => performance.now() / 1000, private automatic = true) {}

  load(score: ParsedScore): void {
    this.stop();
    this.score = score;
    this.reference = null;
    this.practiceMode = "accompany";
    this.baseTempo = score.tempo;
    this.followedTempo = score.tempo;
    this.tempoMap = new TempoMap(score.tempoEvents ?? [], score.tempo);
    this.annotations = structuredClone(score.measures);
    this.notes = score.parts.filter((part) => part.id !== playerPart(score)?.id).flatMap((part) => part.notes).sort((a, b) => a.startBeat - b.startBeat);
    this.follower.load(playerPart(score)?.notes ?? [], score.tempo);
    this.loop = null;
    this.leader = "player";
    this.state.leader = "player";
    if (!playerPart(score)?.notes.length) this.mode = "lead";
    else this.mode = "follow";
    this.state = { ...this.state, tempo: score.tempo, measure: score.measureNumbers[0] ?? 1, mode: this.mode };
    this.emit();
  }

  getState(): ConcertState { return { ...this.state }; }

  setTuning(value: EnsembleTuning): void {
    const checked = readEnsembleTuning(value);
    this.observeEvent({ type: "control", time: this.clock(), action: "changed" });
    if (checked.follower !== this.tuning.follower) {
      this.follower = checked.follower === "sequence" ? new SequenceFollower() : new PerformanceFollower();
      this.follower.load(this.score ? playerPart(this.score)?.notes ?? [] : [], this.baseTempo);
      this.state.confidence = 0;
      this.state.matchedBeat = null;
      this.phaseError = 0;
    }
    this.tuning = checked;
  }
  getTuning(): EnsembleTuning { return { ...this.tuning }; }
  getLeader(): string { return this.leader; }
  setLeader(id: string): void {
    this.observeEvent({ type: "control", time: this.clock(), action: "changed" });
    if (id !== "player" && id !== "conductor" && !this.score?.parts.some((part) => part.id === id && part.id !== playerPart(this.score!)?.id)) throw new Error("主導する席が見つかりません。");
    this.leader = id;
    this.updatePosition();
    this.emit();
  }

  setMode(mode: RoleMode): void { this.observeEvent({ type: "control", time: this.clock(), action: "changed" }); this.mode = mode; this.state.mode = mode; this.emit(); }

  setTempo(tempo: number): void {
    this.observeEvent({ type: "control", time: this.clock(), action: "changed" });
    if (!Number.isFinite(tempo)) return;
    this.baseTempo = Math.max(20, Math.min(300, tempo));
    this.state.tempo = this.baseTempo;
    this.follower.reset(this.baseTempo);
    this.lastMatchedTime = -Infinity;
    this.resetExpression();
    this.emit();
  }

  setAnnotations(annotations: MeasureAnnotation[]): void {
    this.observeEvent({ type: "control", time: this.clock(), action: "changed" });
    this.annotations = structuredClone(annotations);
    this.updatePosition();
    this.emit();
  }

  setLoop(start: number | null, end: number | null): void {
    this.observeEvent({ type: "control", time: this.clock(), action: "changed" });
    this.loop = start != null && end != null && Number.isFinite(start) && Number.isFinite(end) && end > start
      ? { start: Math.max(0, start), end: Math.min(this.score?.totalBeats ?? end, end) } : null;
  }

  start(): void {
    if (!this.score || this.state.status === "playing" || this.state.status === "waiting") return;
    if (this.state.status === "finished") this.seek(0);
    if (this.practiceMode === "wait") {
      const next = playerPart(this.score)?.notes.find((note) => note.startBeat >= this.state.beat);
      this.state.status = next ? "waiting" : "finished";
      this.state.beat = next?.startBeat ?? this.score.totalBeats;
      this.waitPitches.clear(); this.updatePosition(); this.emit(); return;
    }
    this.state.status = "playing";
    this.lastTime = this.clock();
    const signature = this.signature();
    this.countInStart = this.lastTime;
    const countInBars = this.startCountInOverride ?? this.countInBars;
    this.startCountInOverride = null;
    this.countInUntil = this.lastTime + countInBars * signature.beats * 4 / signature.beatType * 60 / this.state.tempo;
    this.countInIndex = 0;
    this.state.countInRemaining = countInBars * signature.beats;
    this.updatePosition();
    if (!this.countInBars) this.checkWait(this.state.beat, this.state.beat);
    if (this.automatic) this.timer = setInterval(() => this.tick(), 25);
    this.tick();
    this.emit();
  }

  restartFrom(beat: number, countInBars?: number): void {
    if (!this.score || !Number.isFinite(beat)) return;
    this.stop();
    this.seek(beat);
    this.startCountInOverride = countInBars == null ? null : Math.max(0, Math.min(2, Math.round(countInBars)));
    this.start();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.onSilence();
    this.state = { ...this.state, status: "idle", beat: 0, tempo: this.baseTempo, measure: this.score?.measureNumbers[0] ?? 1, confidence: 0, matchedBeat: null };
    this.index = 0;
    this.resumeHeldNotes = null;
    this.startCountInOverride = null;
    this.countInUntil = 0;
    this.state.countInRemaining = 0;
    this.state.inputFeedback = undefined;
    this.lastClickBeat = -Infinity;
    this.waitPitches.clear();
    this.waitDeadline = null;
    this.visitedWaits.clear();
    this.follower.reset(this.baseTempo);
    this.lastMatchedTime = -Infinity;
    this.resetExpression();
    this.emit();
  }

  seek(beat: number): void {
    this.observeEvent({ type: "control", time: this.clock(), action: "changed" });
    if (!this.score || !Number.isFinite(beat)) return;
    this.onSilence();
    this.countInUntil = 0; this.state.countInRemaining = 0; this.lastClickBeat = -Infinity;
    this.state.beat = Math.max(0, Math.min(this.score.totalBeats - 0.001, beat));
    if (this.state.status === "finished") this.state.status = "idle";
    if (this.state.status === "waiting") this.state.status = "playing";
    this.resumeHeldNotes = this.state.beat;
    this.index = this.notes.findIndex((note) => note.startBeat >= this.state.beat - 0.00001);
    if (this.index < 0) this.index = this.notes.length;
    this.lastTime = this.clock();
    this.waitDeadline = null;
    this.visitedWaits.clear();
    this.lastMatchedTime = -Infinity;
    this.resetExpression();
    this.state.confidence = 0;
    this.state.matchedBeat = null;
    this.follower.reset(this.baseTempo);
    this.updatePosition();
    if (this.state.status === "playing" && this.practiceMode === "wait") {
      const next = playerPart(this.score)?.notes.find((note) => note.startBeat >= this.state.beat);
      this.state.beat = next?.startBeat ?? this.score.totalBeats; this.state.status = next ? "waiting" : "finished"; this.waitPitches.clear(); this.updatePosition();
    } else if (this.state.status === "playing") this.checkWait(this.state.beat, this.state.beat);
    this.emit();
  }

  cue(): void {
    if (this.state.status !== "waiting" || this.practiceMode === "wait") return;
    this.observeEvent({ type: "control", time: this.clock(), action: "cue" });
    this.waitDeadline = null;
    this.resumeHeldNotes = this.state.beat;
    this.state.status = "playing";
    this.lastTime = this.clock();
    this.follower.reset(this.state.tempo);
    this.emit();
  }

  processNote(message: MidiNoteMessage): void {
    this.observeEvent({ type: "input", time: this.clock(), message: { ...message } });
    if (message.type === "noteoff" || !message.velocity) {
      if (this.sounding?.pitch === message.note && this.sounding.channel === (message.channel ?? 0) && Number.isFinite(message.timestamp) && message.timestamp > this.sounding.time) {
        const duration = (message.timestamp - this.sounding.time) / 1000;
        const expected = this.sounding.duration * 60 / this.sounding.tempo;
        if (duration > 0.04 && expected > 0.05) this.articulationRatio += (Math.max(0.5, Math.min(1.15, duration / expected)) - this.articulationRatio) * 0.2;
        this.sounding = null;
      }
      return;
    }
    if (this.state.status !== "playing" && this.state.status !== "waiting") return;
    if (this.countInUntil > this.clock() || this.practiceMode === "listen") return;
    if (this.practiceMode === "wait" && this.score) {
      const notes = playerPart(this.score)?.notes ?? [];
      const expected = notes.filter((note) => Math.abs(note.startBeat - this.state.beat) < 0.0001);
      this.state.inputFeedback = expected.some((note) => note.pitch === message.note) ? "matched" : "unmatched";
      if (this.state.inputFeedback === "matched") this.waitPitches.add(message.note);
      if (expected.length && expected.every((note) => this.waitPitches.has(note.pitch))) {
        this.state.matchedBeat = this.state.beat; this.state.confidence = 1;
        const next = notes.find((note) => note.startBeat > this.state.beat + 0.0001);
        this.state.beat = next?.startBeat ?? this.score.totalBeats;
        this.state.status = next ? "waiting" : "finished";
        this.waitPitches.clear(); this.updatePosition();
      }
      this.emit(); return;
    }
    const match = this.follower.match(message, Math.max(0, this.state.beat - this.tuning.inputDelayMs * this.state.tempo / 60000), this.baseTempo);
    this.state.inputFeedback = match ? "matched" : "unmatched";
    if (!match) { this.emit(); return; }
    this.lastMatchedTime = this.clock();
    this.state.confidence = match.confidence;
    this.state.matchedBeat = match.beat;
    if (this.state.status === "waiting") this.cue();
    if (match.confidence > 0.35) {
      this.followedTempo = Math.max(this.baseTempo * 0.5, Math.min(this.baseTempo * 1.8, match.tempo));
      this.phaseError = Math.max(-0.6, Math.min(0.6, match.beat + this.tuning.inputDelayMs * this.state.tempo / 60000 - this.state.beat));
      if (this.inputLevel === 0) this.inputLevel = message.velocity;
      const relative = Math.max(0.65, Math.min(1.35, message.velocity / this.inputLevel));
      this.dynamicRatio += (relative - this.dynamicRatio) * 0.25 * match.confidence;
      this.inputLevel += (message.velocity - this.inputLevel) * 0.04;
      this.sounding = { pitch: message.note, channel: message.channel ?? 0, time: message.timestamp, duration: match.duration, tempo: this.state.tempo };
    }
    this.updatePosition();
    this.emit();
  }

  private tick(): void {
    if (!this.score) return;
    const now = this.clock();
    if (this.countInUntil > 0) {
      const signature = this.signature();
      const seconds = 4 / signature.beatType * 60 / this.state.tempo;
      const count = this.countInBars * signature.beats;
      while (this.countInIndex < count && this.countInStart + this.countInIndex * seconds <= now + 0.08) {
        this.onClick(this.countInStart + this.countInIndex * seconds, this.countInIndex % signature.beats === 0);
        this.countInIndex++;
      }
      this.state.countInRemaining = Math.max(0, Math.ceil((this.countInUntil - now) / seconds));
      if (now < this.countInUntil) { this.lastTime = now; this.emit(); return; }
      this.lastTime = this.countInUntil; this.countInUntil = 0; this.state.countInRemaining = 0;
      if (this.checkWait(this.state.beat, this.state.beat)) { this.emit(); return; }
    }
    if (this.state.status === "waiting") {
      if (this.waitDeadline != null && now >= this.waitDeadline) this.cue();
      else return;
    }
    if (this.state.status !== "playing") return;
    const before = this.state.beat;
    const delta = Math.max(0, now - this.lastTime);
    this.lastTime = now;
    const expression = this.expression(before);
    this.state.expression = expression.label;
    const scoredTempo = this.tempoMap.getBpmAtBeat(before) * this.baseTempo / this.score.tempo;
    const role = this.activeRole();
    const freshness = Math.max(0, 1 - Math.max(0, now - this.lastMatchedTime - 1.5) / 3);
    const willingness = this.state.mode === "lead" ? (role ? 1 - role.factor : 0) : Math.min(1, 1 - (role?.factor ?? 0.3) + expression.follow);
    const leads = this.state.leader ?? this.leader;
    const weight = leads === "player" ? Math.min(1, willingness * this.tuning.followAmount) * this.state.confidence * freshness : 0;
    const target = scoredTempo * expression.tempo * (1 - weight) + this.followedTempo * weight;
    this.state.tempo += (target - this.state.tempo) * (1 - Math.exp(-delta / this.tuning.responseSeconds));
    const correction = this.phaseError * weight * (1 - Math.exp(-delta / 0.5));
    this.phaseError -= correction;
    const next = before + Math.max(0, delta * this.state.tempo / 60 + correction);
    if (this.checkWait(before, next)) { this.emit(); return; }
    this.state.beat = next;
    if (this.loop && next >= this.loop.end) { this.seek(this.loop.start); return; }
    if (next >= this.score.totalBeats) {
      this.stop();
      this.state.status = "finished";
      this.state.beat = this.score.totalBeats;
      this.updatePosition();
      this.emit();
      return;
    }
    this.updatePosition();
    const boundary = Math.min(this.nextWaitBeat(), this.loop?.end ?? this.score.totalBeats);
    const horizon = Math.min(this.state.beat + this.state.tempo / 60 * 0.08, boundary);
    if (this.clickEnabled) {
      const signature = this.signature();
      let measure = 0;
      while (measure + 1 < this.score.measureStartBeats.length && this.score.measureStartBeats[measure + 1] <= this.state.beat) measure++;
      const first = this.score.measureStartBeats[measure];
      const unit = 4 / signature.beatType;
      let click = Math.max(first, first + Math.ceil((this.state.beat - first - 0.0001) / unit) * unit);
      while (click <= horizon && click < boundary) {
        if (click > this.lastClickBeat + 0.0001) { this.onClick(now + Math.max(0, click - this.state.beat) * 60 / this.state.tempo, Math.abs(click - first) < 0.0001); this.lastClickBeat = click; }
        click += unit;
      }
    }
    const scheduled: NoteEvent[] = this.resumeHeldNotes != null ? this.notes.filter(note => note.startBeat < this.resumeHeldNotes! - 0.00001).map(note => noteTail(note, this.state.beat)).filter((note): note is NoteEvent => note != null) : [];
    this.resumeHeldNotes = null;
    while (this.index < this.notes.length && this.notes[this.index].startBeat <= horizon && this.notes[this.index].startBeat < boundary) scheduled.push(this.notes[this.index++]);
    for (const note of scheduled) {
      if (note.startBeat < this.state.beat - 1) continue;
      const localWeight = this.score.parts[note.partIndex]?.id === leads ? this.tuning.sectionBlend * this.state.confidence * freshness : 0;
      const reaction = Math.max(weight, localWeight);
      const offset = Math.max(-0.06, Math.min(0.06, -this.phaseError * 60 / this.state.tempo * localWeight));
      const time = now + Math.max(0, (note.startBeat - this.state.beat) * 60 / this.state.tempo + offset);
      const shape = this.expression(note.startBeat);
      const gate = shape.articulation * (1 + (this.articulationRatio - 1) * reaction * this.tuning.articulationAmount);
      const duration = Math.min(note.durationBeats * (note.articulation ?? 1) * gate, boundary - note.startBeat) * 60 / this.state.tempo;
      const velocity = Math.max(1, Math.min(127, note.velocity * shape.gain * (1 + (this.dynamicRatio - 1) * reaction * this.tuning.dynamicsAmount)));
      this.onNote({ ...note, velocity }, time, duration, note.durationBeats * 60 / this.state.tempo);
    }
    this.emit();
  }

  private waitPoints(): Array<{ beat: number; annotation: MeasureAnnotation }> {
    if (!this.score) return [];
    return this.score.measureStartBeats.flatMap((beat, i) => {
      const number = this.score!.measureNumbers[this.score!.playbackOrder[i]];
      const annotation = this.annotations.find((a) => a.measureNumber === number && a.wait);
      return annotation ? [{ beat, annotation }] : [];
    });
  }

  private nextWaitBeat(): number {
    return this.waitPoints().find((point) => point.beat >= this.state.beat && !this.visitedWaits.has(point.beat))?.beat ?? Infinity;
  }

  private checkWait(from: number, to: number): boolean {
    const point = this.waitPoints().find((p) => p.beat >= from - 0.00001 && p.beat <= to + 0.00001 && !this.visitedWaits.has(p.beat));
    if (!point) return false;
    this.visitedWaits.add(point.beat);
    this.state.beat = point.beat;
    this.state.status = "waiting";
    this.onSilence();
    const duration = point.annotation.wait?.duration;
    this.waitDeadline = duration != null && duration > 0 ? this.clock() + duration : null;
    this.updatePosition();
    return true;
  }

  private signature() {
    return this.score?.timeSignatureChanges.filter((item) => item.beatPosition <= this.state.beat).at(-1) ?? this.score?.timeSignature ?? { beats: 4, beatType: 4 };
  }

  private expression(beat: number) {
    const shape = expressionAt(this.score!, this.annotations, beat);
    const amount = this.tuning.expressionAmount;
    const reference = referenceAt(this.reference, beat);
    return { ...shape, label: this.reference && reference.tempoRatio !== 1 ? this.reference.title : shape.label, tempo: 1 + (shape.tempo * reference.tempoRatio - 1) * amount, gain: 1 + (shape.gain * reference.gain - 1) * amount, articulation: 1 + (shape.articulation * reference.articulation - 1) * amount, follow: shape.follow * amount };
  }

  private resetExpression(): void {
    this.followedTempo = this.baseTempo;
    this.phaseError = 0;
    this.dynamicRatio = 1;
    this.articulationRatio = 1;
    this.inputLevel = 0;
    this.sounding = null;
    this.state.expression = "";
  }

  private activeRole() {
    return [...this.annotations].filter((a) => a.role && a.measureNumber <= this.state.measure).sort((a, b) => b.measureNumber - a.measureNumber)[0]?.role;
  }

  private updatePosition(): void {
    if (!this.score) return;
    let index = 0;
    while (index + 1 < this.score.measureStartBeats.length && this.score.measureStartBeats[index + 1] <= this.state.beat) index++;
    this.state.measure = this.score.measureNumbers[this.score.playbackOrder[index]] ?? 1;
    const role = this.activeRole();
    this.state.mode = role?.mode ?? this.mode;
    this.state.leader = [...this.annotations].filter((a) => a.leader && a.measureNumber <= this.state.measure).sort((a, b) => b.measureNumber - a.measureNumber)[0]?.leader ?? this.leader;
  }

  private emit(): void { this.onState({ ...this.state }); this.observeEvent({ type: "state", time: this.clock(), state: { ...this.state } }); }

  dispose(): void { this.stop(); this.onState = () => {}; this.onNote = () => {}; }
}
