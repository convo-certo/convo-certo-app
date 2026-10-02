/**
 * Extended MusicXML Parser
 *
 * Parses standard MusicXML and extracts ConvoCerto-specific annotations:
 * - Lead/Follow directives via rehearsal marks (e.g., "Lead:strong", "Follow:moderate")
 * - <wait> and <listen> directives via direction words
 */

import { musicXMLPlaybackOrder } from "./musicxml-navigation";
import { applyHairpinDynamics, type DynamicMark, type HairpinMark } from "./musicxml-hairpins";
import { readExpression } from "./expressive-intent";
import { MusicXMLError } from "./musicxml-error";
import type {
  ExpressionDirective,
  MeasureAnnotation,
  NoteEvent,
  ParsedScore,
  RoleDirective,
  RoleMode,
  RoleStrength,
  ScorePart,
  TimeSignatureEvent,
  TempoEvent,
  WaitDirective,
} from "./types";

function parseRoleFromRehearsal(text: string): RoleDirective | undefined {
  const match = text.match(/^(Lead|Follow):(strong|moderate|light)$/i);
  if (!match) return undefined;
  const mode = match[1].toLowerCase() as RoleMode;
  const strength = match[2].toLowerCase() as RoleStrength;
  const factorMap: Record<RoleStrength, number> = {
    strong: mode === "lead" ? 0.9 : 0.1,
    moderate: mode === "lead" ? 0.7 : 0.3,
    light: mode === "lead" ? 0.6 : 0.4,
  };
  return { mode, strength, factor: factorMap[strength] };
}

function parseWaitDirective(text: string): WaitDirective | undefined {
  const waitMatch = text.match(/^wait(?::(\d+(?:\.\d+)?)sec)?$/i);
  if (waitMatch) {
    return {
      type: "wait",
      duration: waitMatch[1] ? parseFloat(waitMatch[1]) : undefined,
    };
  }
  if (/^listen$/i.test(text)) {
    return { type: "listen" };
  }
  return undefined;
}

function midiNoteFromStep(
  step: string,
  octave: number,
  alter: number
): number {
  const stepMap: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  return (octave + 1) * 12 + (stepMap[step] ?? 0) + alter;
}

function parseDurationToBeats(
  duration: number,
  divisions: number
): number {
  return duration / divisions;
}

function parseExpressionDirective(text: string, measure: number): ExpressionDirective {
  try {
    const expression = readExpression(JSON.parse(text.slice("ConvoCerto:expression:".length)));
    if ((expression.endMeasure ?? measure) < measure) throw new MusicXMLError("expression-invalid", "表情の区間が不正です。");
    return expression;
  } catch (cause) {
    if (cause instanceof MusicXMLError) throw cause;
    throw new MusicXMLError("expression-invalid", cause instanceof Error ? cause.message : "表情の指示が不正です。", { cause });
  }
}

export function parseMusicXML(xmlString: string): ParsedScore {
  if (!xmlString.trim()) throw new MusicXMLError("file-empty", "楽譜ファイルが空です。MusicXMLとして書き出し直してください。");
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");

  const scorePartwise = doc.querySelector("score-partwise");
  if (doc.querySelector("parsererror")) throw new MusicXMLError("xml-invalid", "有効な score-partwise MusicXML ファイルを選択してください。");
  if (!scorePartwise) throw new MusicXMLError("format-unsupported", "有効な score-partwise MusicXML ファイルを選択してください。");
  const title =
    doc.querySelector("work-title")?.textContent ??
    doc.querySelector("movement-title")?.textContent ??
    "Untitled";

  const soundEl = doc.querySelector("sound[tempo]");
  const tempo = soundEl ? parseFloat(soundEl.getAttribute("tempo")!) : 120;

  const timeEl = doc.querySelector("time");
  const initialBeats = parseInt(timeEl?.querySelector("beats")?.textContent ?? "4");
  const initialBeatType = parseInt(
    timeEl?.querySelector("beat-type")?.textContent ?? "4"
  );

  const partListEls = doc.querySelectorAll("part-list score-part");
  const partElements = scorePartwise
    ? scorePartwise.querySelectorAll(":scope > part")
    : doc.querySelectorAll("part");

  const parts: ScorePart[] = [];
  const measures: MeasureAnnotation[] = [];
  let totalMeasures = 0;
  const measureNumbers: number[] = [];
  const slotBeatsPerMeasure: number[] = [];
  const timeSignatureChanges: TimeSignatureEvent[] = [];
  const tempoEvents: TempoEvent[] = [];
  const physicalStarts: number[] = [];

  partListEls.forEach((partListEl, partIndex) => {
    const partId = partListEl.getAttribute("id") ?? `P${partIndex + 1}`;
    const partName =
      partListEl.querySelector("part-name")?.textContent ?? `Part ${partIndex + 1}`;

    const partEl = Array.from(partElements).find(
      (el) => el.getAttribute("id") === partId
    );
    if (!partEl) return;

    const notes: NoteEvent[] = [];
    const dynamicMarks: DynamicMark[] = [];
    const hairpins: HairpinMark[] = [];
    const originalLevels = new Map<NoteEvent, number>();
    const measureEls = partEl.querySelectorAll("measure");
    let currentBeat = 0;
    let divisions = 1;
    let transposeChromatic = 0;
    let currentBeatsPerMeasure = initialBeats;
    let currentBeatType = initialBeatType;
    const velocity = 80;
    const ties = new Map<string, NoteEvent>();

    measureEls.forEach((measureEl, slotIndex) => {
      if (partIndex > 0) currentBeat = physicalStarts[slotIndex] ?? currentBeat;
      else physicalStarts.push(currentBeat);
      const rawNum = measureEl.getAttribute("number") ?? "1";
      const measureNum = parseInt(rawNum);
      const effectiveNum = isNaN(measureNum) ? -1 : measureNum;
      if (effectiveNum > totalMeasures) totalMeasures = effectiveNum;

      if (partIndex === 0) {
        measureNumbers.push(effectiveNum);


      }

      const divEl = measureEl.querySelector("attributes divisions");
      if (divEl?.textContent) {
        divisions = parseInt(divEl.textContent);
      }

      const timeChangeEl = measureEl.querySelector("attributes time");
      if (timeChangeEl) {
        const newBeats = parseInt(
          timeChangeEl.querySelector("beats")?.textContent ?? String(currentBeatsPerMeasure)
        );
        const newBeatType = parseInt(
          timeChangeEl.querySelector("beat-type")?.textContent ?? String(currentBeatType)
        );
        if (newBeats !== currentBeatsPerMeasure || newBeatType !== currentBeatType) {
          if (partIndex === 0) {
            timeSignatureChanges.push({
              beatPosition: currentBeat,
              beats: newBeats,
              beatType: newBeatType,
            });
          }
        }
        currentBeatsPerMeasure = newBeats;
        currentBeatType = newBeatType;
      }

      if (partIndex === 0) {
        slotBeatsPerMeasure.push(currentBeatsPerMeasure * 4 / currentBeatType);
      }

      const chromaticEl = measureEl.querySelector(
        "attributes transpose chromatic"
      );
      if (chromaticEl?.textContent) {
        transposeChromatic = parseInt(chromaticEl.textContent) + 12 * Number(measureEl.querySelector("attributes transpose octave-change")?.textContent ?? 0);
      }

      if (partIndex === 0) {
        const annotation: MeasureAnnotation = { measureNumber: effectiveNum };
        let hasAnnotation = false;

        measureEl
          .querySelectorAll("direction direction-type rehearsal")
          .forEach((rehEl) => {
            const text = rehEl.textContent?.trim() ?? "";
            const role = parseRoleFromRehearsal(text);
            if (role) {
              annotation.role = role;
              hasAnnotation = true;
            }
            if (text.startsWith("ConvoCerto:memo:")) {
              annotation.memo = text.slice("ConvoCerto:memo:".length).slice(0, 120);
              hasAnnotation = true;
            }
            if (text.startsWith("ConvoCerto:leader:")) {
              annotation.leader = text.slice("ConvoCerto:leader:".length);
              hasAnnotation = true;
            }
            if (text.startsWith("ConvoCerto:expression:")) {
              const expression = parseExpressionDirective(text, effectiveNum);
              annotation.expression = expression;
              hasAnnotation = true;
            }
            const wait = parseWaitDirective(text);
            if (wait) {
              annotation.wait = wait;
              hasAnnotation = true;
            }
          });

        measureEl
          .querySelectorAll("direction direction-type words")
          .forEach((wordEl) => {
            const text = wordEl.textContent?.trim() ?? "";
            if (text.startsWith("ConvoCerto:memo:")) {
              annotation.memo = text.slice("ConvoCerto:memo:".length).slice(0, 120);
              hasAnnotation = true;
            }
            if (text.startsWith("ConvoCerto:leader:")) {
              annotation.leader = text.slice("ConvoCerto:leader:".length);
              hasAnnotation = true;
            }
            if (text.startsWith("ConvoCerto:expression:")) {
              const expression = parseExpressionDirective(text, effectiveNum);
              annotation.expression = expression;
              hasAnnotation = true;
            }
            const wait = parseWaitDirective(text);
            if (wait) {
              annotation.wait = wait;
              hasAnnotation = true;
            }
          });

        if (hasAnnotation) {
          measures.push(annotation);
        }
      }

      let measureBeatOffset = 0;
      let previousOnset = 0;
      let extent = 0;
      const dynamics: Record<string, number> = { ppp: 24, pp: 36, p: 49, mp: 64, mf: 80, f: 96, ff: 112, fff: 120, sfz: 112 };
      for (const child of Array.from(measureEl.children)) {
        const duration = Number(child.querySelector(":scope > duration")?.textContent ?? 0) / divisions;
        if (child.localName === "backup") { measureBeatOffset = Math.max(0, measureBeatOffset - duration); continue; }
        if (child.localName === "forward") { measureBeatOffset += duration; extent = Math.max(extent, measureBeatOffset); continue; }
        if (child.localName === "direction") {
          const dynamic = child.querySelector("dynamics")?.firstElementChild?.localName;
          let dynamicValue = dynamic ? dynamics[dynamic] : undefined;
          const soundDynamics = child.querySelector("sound[dynamics]")?.getAttribute("dynamics");
          if (soundDynamics != null && soundDynamics.trim() !== "" && Number.isFinite(Number(soundDynamics))) dynamicValue = Math.max(1, Math.min(127, Number(soundDynamics) * 0.9));
          const directionBeat = currentBeat + measureBeatOffset + Number(child.querySelector("offset")?.textContent ?? 0) / divisions;
          const staff = child.querySelector(":scope > staff")?.textContent?.trim() || undefined;
          if (Number.isFinite(directionBeat)) {
            if (dynamicValue != null) dynamicMarks.push({ beat: directionBeat, value: dynamicValue, staff });
            for (const wedge of child.querySelectorAll("wedge")) hairpins.push({ beat: directionBeat, type: wedge.getAttribute("type") ?? "", number: wedge.getAttribute("number") ?? "1", staff, niente: wedge.getAttribute("niente") === "yes" });
          }
          const soundTempo = child.querySelector("sound[tempo]")?.getAttribute("tempo");
          const metronome = child.querySelector("metronome");
          const units: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, "16th": 0.25 };
          const unit = units[metronome?.querySelector("beat-unit")?.textContent ?? "quarter"] ?? 1;
          const dots = metronome?.querySelectorAll("beat-unit-dot").length ?? 0;
          const bpm = soundTempo != null ? Number(soundTempo) : Number(metronome?.querySelector("per-minute")?.textContent) * unit * (2 - 2 ** -dots);
          if (bpm > 0 && Number.isFinite(bpm)) {
            const offset = Number(child.querySelector("offset")?.textContent ?? 0) / divisions;
            const position = currentBeat + measureBeatOffset + offset;
            if (!tempoEvents.some((event) => Math.abs(event.beatPosition - position) < 0.00001)) tempoEvents.push({ beatPosition: position, bpm, type: "instant" });
          }
          continue;
        }
        if (child.localName !== "note") continue;
        const isChord = child.querySelector("chord") !== null;
        const grace = child.querySelector("grace") !== null;
        const durationBeats = grace ? 0 : duration;
        const onset = isChord ? previousOnset : measureBeatOffset;
        if (!isChord) previousOnset = onset;
        const pitchEl = child.querySelector("pitch");
        if (pitchEl && !child.querySelector("cue") && durationBeats > 0) {
          const pitch = midiNoteFromStep(pitchEl.querySelector("step")?.textContent ?? "C", Number(pitchEl.querySelector("octave")?.textContent ?? 4), Number(pitchEl.querySelector("alter")?.textContent ?? 0)) + transposeChromatic;
          const key = `${child.querySelector("voice")?.textContent ?? "1"}:${child.querySelector("staff")?.textContent ?? "1"}:${pitch}`;
          const stop = child.querySelector('tie[type="stop"], tied[type="stop"]');
          const start = child.querySelector('tie[type="start"], tied[type="start"]');
          const prior = stop ? ties.get(key) : undefined;
          if (prior && Math.abs(prior.startBeat + prior.durationBeats - (currentBeat + onset)) < 0.001) prior.durationBeats += durationBeats;
          else {
            const note: NoteEvent = { voice: child.querySelector("voice")?.textContent ?? "1", staff: child.querySelector("staff")?.textContent ?? "1", pitch, startBeat: currentBeat + onset, durationBeats, velocity, partIndex };
            if (child.querySelector("staccato, staccatissimo")) note.articulation = 0.5;
            else if (child.querySelector("tenuto")) note.articulation = 0.98;
            if (child.querySelector("accent, strong-accent")) note.velocity = Math.min(127, velocity * 1.15);
            notes.push(note);
            originalLevels.set(note, velocity);
            if (start) ties.set(key, note);
          }
          if (stop && !start) ties.delete(key);
        }
        if (!isChord) measureBeatOffset += durationBeats;
        extent = Math.max(extent, onset + durationBeats, measureBeatOffset);
      }
      const nominal = currentBeatsPerMeasure * 4 / currentBeatType;
      const length = measureEl.getAttribute("implicit") === "yes" && extent > 0 ? extent : Math.max(nominal, extent);
      if (partIndex === 0) slotBeatsPerMeasure[slotIndex] = length;
      currentBeat += partIndex === 0 ? length : slotBeatsPerMeasure[slotIndex] ?? length;
    });

    applyHairpinDynamics(notes, dynamicMarks, hairpins, originalLevels);
    parts.push({
      id: partId,
      name: partName,
      isSolo: false,
      midiProgram: Math.max(0, Number(partListEl.querySelector("midi-program")?.textContent ?? 1) - 1),
      transposeSemitones: transposeChromatic,
      notes,
    });
  });

  if (!parts.length) throw new MusicXMLError("parts-missing", "MusicXMLに演奏できる音符がありません。");
  if (!parts.some((part) => part.notes.length)) throw new MusicXMLError("notes-missing", "MusicXMLに演奏できる音符がありません。");
  const soloPart = parts.find((part) => /clarinet|clarinett|clarinette|クラリネット/i.test(part.name) || part.midiProgram === 71) ?? parts[0];
  soloPart.isSolo = true;
  const slotCount = measureNumbers.length;
  const playbackOrder = musicXMLPlaybackOrder(Array.from(partElements[0].querySelectorAll("measure")));

  const measureStartBeats: number[] = [];
  let runningBeat = 0;
  for (let step = 0; step < playbackOrder.length; step++) {
    measureStartBeats.push(runningBeat);
    const srcSlot = playbackOrder[step];
    runningBeat += slotBeatsPerMeasure[srcSlot] ?? initialBeats;
  }

  if (playbackOrder.length !== slotCount || playbackOrder.some((slot, index) => slot !== index)) {
    const slotStartBeats: number[] = [];
    let b = 0;
    for (let i = 0; i < slotCount; i++) {
      slotStartBeats.push(b);
      b += slotBeatsPerMeasure[i] ?? initialBeats;
    }

    for (const part of parts) {
      const notesBySlot: NoteEvent[][] = Array.from(
        { length: slotCount },
        () => []
      );
      for (const note of part.notes) {
        let slot = slotCount - 1;
        for (let i = slotCount - 1; i >= 0; i--) {
          if (slotStartBeats[i] <= note.startBeat) {
            slot = i;
            break;
          }
        }
        notesBySlot[slot].push(note);
      }

      const expanded: NoteEvent[] = [];
      for (let step = 0; step < playbackOrder.length; step++) {
        const srcSlot = playbackOrder[step];
        const slotNotes = notesBySlot[srcSlot];
        const srcBase = slotStartBeats[srcSlot];
        const destBase = measureStartBeats[step];

        for (const note of slotNotes) {
          expanded.push({
            ...note,
            startBeat: note.startBeat - srcBase + destBase,
          });
        }
      }

      part.notes = expanded;
      part.notes.sort((a, b) => a.startBeat - b.startBeat);
    }
  }

  for (const annotation of measures) if (annotation.expression?.endMeasure != null && annotation.expression.endMeasure > totalMeasures) throw new MusicXMLError("expression-invalid", "表情の終了小節が譜面の範囲外です。");
  const totalBeats = runningBeat;
  const expandedTempos: TempoEvent[] = [];
  const expandedSignatures: TimeSignatureEvent[] = [];
  for (let i = 0; i < playbackOrder.length; i++) {
    const slot = playbackOrder[i];
    const source = physicalStarts[slot];
    const end = source + slotBeatsPerMeasure[slot];
    const offset = measureStartBeats[i] - source;
    const inherited = [...tempoEvents].sort((a, b) => a.beatPosition - b.beatPosition).filter((event) => event.beatPosition <= source).at(-1);
    if (inherited) expandedTempos.push({ ...inherited, beatPosition: measureStartBeats[i] });
    for (const event of tempoEvents) if (event.beatPosition > source && event.beatPosition < end) expandedTempos.push({ ...event, beatPosition: event.beatPosition + offset });
    const signature = timeSignatureChanges.filter((event) => event.beatPosition <= source).at(-1);
    expandedSignatures.push({ beatPosition: measureStartBeats[i], beats: signature?.beats ?? initialBeats, beatType: signature?.beatType ?? initialBeatType });
  }
  for (const part of parts) part.notes.sort((a, b) => a.startBeat - b.startBeat);

  return {
    playerPartId: soloPart.id,
    sourceMeasureStartBeats: physicalStarts,
    title,
    tempo: expandedTempos[0]?.bpm ?? tempo,
    tempoEvents: expandedTempos,
    timeSignature: { beats: initialBeats, beatType: initialBeatType },
    parts,
    measures,
    totalMeasures,
    totalBeats,
    playbackOrder,
    measureNumbers,
    measureStartBeats,
    timeSignatureChanges: expandedSignatures,
  };
}

/**
 * Update a MusicXML string with a Lead/Follow annotation at a specific measure.
 */
export function updateMusicXMLAnnotation(
  xmlString: string,
  measureNumber: number,
  annotation: { role?: RoleDirective; wait?: WaitDirective; expression?: ExpressionDirective; leader?: string; memo?: string }
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");
  const parts = doc.querySelectorAll("part");
  const firstPart = parts[0];
  if (!firstPart) return xmlString;

  const measureEl = firstPart.querySelector(
    `measure[number="${measureNumber}"]`
  );
  if (!measureEl) return xmlString;

  for (const mark of measureEl.querySelectorAll("rehearsal, words")) {
    const text = mark.textContent?.trim() ?? "";
    if (parseRoleFromRehearsal(text) || parseWaitDirective(text) || (text.startsWith("ConvoCerto:expression:") || text.startsWith("ConvoCerto:leader:") || text.startsWith("ConvoCerto:memo:"))) mark.remove();
  }

  if (annotation.role) {
    const text = `${annotation.role.mode.charAt(0).toUpperCase() + annotation.role.mode.slice(1)}:${annotation.role.strength}`;
    const directionEl = doc.createElement("direction");
    directionEl.setAttribute("placement", "above");
    const dirTypeEl = doc.createElement("direction-type");
    const rehearsalEl = doc.createElement("rehearsal");
    rehearsalEl.textContent = text;
    dirTypeEl.appendChild(rehearsalEl);
    directionEl.appendChild(dirTypeEl);
    measureEl.insertBefore(directionEl, measureEl.firstChild);
  }

  if (annotation.wait) {
    const text =
      annotation.wait.type === "wait"
        ? annotation.wait.duration
          ? `wait:${annotation.wait.duration}sec`
          : "wait"
        : "listen";
    const directionEl = doc.createElement("direction");
    const dirTypeEl = doc.createElement("direction-type");
    const wordsEl = doc.createElement("words");
    wordsEl.textContent = text;
    dirTypeEl.appendChild(wordsEl);
    directionEl.appendChild(dirTypeEl);
    measureEl.insertBefore(directionEl, measureEl.firstChild);
  }

  if (annotation.leader) {
    const direction = doc.createElement("direction");
    const type = doc.createElement("direction-type");
    const words = doc.createElement("words");
    words.setAttribute("print-object", "no");
    words.textContent = "ConvoCerto:leader:" + annotation.leader;
    type.appendChild(words);
    direction.appendChild(type);
    measureEl.insertBefore(direction, measureEl.firstChild);
  }
  if (annotation.expression) {
    const direction = doc.createElement("direction");
    const type = doc.createElement("direction-type");
    const words = doc.createElement("words");
    words.setAttribute("print-object", "no");
    words.textContent = "ConvoCerto:expression:" + JSON.stringify(readExpression(annotation.expression));
    type.appendChild(words);
    direction.appendChild(type);
    measureEl.insertBefore(direction, measureEl.firstChild);
  }
  if (annotation.memo?.trim()) {
    const direction = doc.createElement("direction");
    const type = doc.createElement("direction-type");
    const words = doc.createElement("words");
    words.setAttribute("print-object", "no");
    words.textContent = "ConvoCerto:memo:" + annotation.memo.trim().slice(0, 120);
    type.appendChild(words); direction.appendChild(type);
    measureEl.insertBefore(direction, measureEl.firstChild);
  }
  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}

/**
 * Get the role directive for a given measure number.
 * Falls back to previous directive if none specified.
 */
export function getRoleForMeasure(
  measures: MeasureAnnotation[],
  measureNumber: number
): RoleDirective {
  const defaultRole: RoleDirective = {
    mode: "follow",
    strength: "moderate",
    factor: 0.3,
  };

  let activeRole = defaultRole;
  for (const m of measures) {
    if (m.measureNumber > measureNumber) break;
    if (m.role) activeRole = m.role;
  }
  return activeRole;
}
