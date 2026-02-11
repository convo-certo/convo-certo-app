/**
 * Extended MusicXML Parser
 *
 * Parses standard MusicXML and extracts ConvoCerto-specific annotations:
 * - Lead/Follow directives via rehearsal marks (e.g., "Lead:strong", "Follow:moderate")
 * - <wait> and <listen> directives via direction words
 */

import type {
  MeasureAnnotation,
  NoteEvent,
  ParsedScore,
  RoleDirective,
  RoleMode,
  RoleStrength,
  ScorePart,
  WaitDirective,
} from "./types";

function parseRoleFromRehearsal(text: string): RoleDirective | undefined {
  const match = text.match(/^(Lead|Follow):(strong|moderate|light)$/i);
  if (!match) return undefined;
  const mode = match[1].toLowerCase() as RoleMode;
  const strength = match[2].toLowerCase() as RoleStrength;
  const factorMap: Record<RoleStrength, number> = {
    strong: mode === "lead" ? 0.9 : 0.1,
    moderate: 0.5,
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

interface RepeatMarker {
  slotIndex: number;
  direction: "forward" | "backward";
}

function buildPlaybackOrder(
  slotCount: number,
  markers: RepeatMarker[]
): number[] {
  const forwardSlots = new Set(
    markers.filter((m) => m.direction === "forward").map((m) => m.slotIndex)
  );
  const backwardSlots = new Set(
    markers.filter((m) => m.direction === "backward").map((m) => m.slotIndex)
  );

  const order: number[] = [];
  let i = 0;
  let repeatStart = 0;
  let hasUnmatchedForward = false;

  while (i < slotCount) {
    if (forwardSlots.has(i)) {
      repeatStart = i;
      hasUnmatchedForward = true;
    }

    order.push(i);

    if (backwardSlots.has(i)) {
      const firstOccurrence = order.indexOf(repeatStart);
      const section = order.slice(firstOccurrence);
      order.push(...section);
      repeatStart = i + 1;
      hasUnmatchedForward = false;
      i++;
      continue;
    }

    i++;
  }

  if (hasUnmatchedForward) {
    const firstOccurrence = order.indexOf(repeatStart);
    const section = order.slice(firstOccurrence);
    order.push(...section);
  }

  return order;
}

export function parseMusicXML(xmlString: string): ParsedScore {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");

  const scorePartwise = doc.querySelector("score-partwise");
  const title =
    doc.querySelector("work-title")?.textContent ??
    doc.querySelector("movement-title")?.textContent ??
    "Untitled";

  const soundEl = doc.querySelector("sound[tempo]");
  const tempo = soundEl ? parseFloat(soundEl.getAttribute("tempo")!) : 120;

  const timeEl = doc.querySelector("time");
  const beats = parseInt(timeEl?.querySelector("beats")?.textContent ?? "4");
  const beatType = parseInt(
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
  const repeatMarkers: RepeatMarker[] = [];

  partListEls.forEach((partListEl, partIndex) => {
    const partId = partListEl.getAttribute("id") ?? `P${partIndex + 1}`;
    const partName =
      partListEl.querySelector("part-name")?.textContent ?? `Part ${partIndex + 1}`;

    const partEl = Array.from(partElements).find(
      (el) => el.getAttribute("id") === partId
    );
    if (!partEl) return;

    const notes: NoteEvent[] = [];
    const measureEls = partEl.querySelectorAll("measure");
    let currentBeat = 0;
    let divisions = 1;
    let transposeChromatic = 0;

    measureEls.forEach((measureEl, slotIndex) => {
      const rawNum = measureEl.getAttribute("number") ?? "1";
      const measureNum = parseInt(rawNum);
      const effectiveNum = isNaN(measureNum) ? -1 : measureNum;
      if (effectiveNum > totalMeasures) totalMeasures = effectiveNum;

      if (partIndex === 0) {
        measureNumbers.push(effectiveNum);

        const hasForwardRepeatBarline =
          measureEl.querySelector("barline repeat[direction='forward']") !== null;
        const hasForwardRepeatSound =
          measureEl.querySelector("sound[forward-repeat]") !== null;
        if (hasForwardRepeatBarline || hasForwardRepeatSound) {
          repeatMarkers.push({ slotIndex, direction: "forward" });
        }

        const hasBackwardRepeat =
          measureEl.querySelector("barline repeat[direction='backward']") !== null;
        if (hasBackwardRepeat) {
          repeatMarkers.push({ slotIndex, direction: "backward" });
        }
      }

      const divEl = measureEl.querySelector("attributes divisions");
      if (divEl?.textContent) {
        divisions = parseInt(divEl.textContent);
      }

      const chromaticEl = measureEl.querySelector(
        "attributes transpose chromatic"
      );
      if (chromaticEl?.textContent) {
        transposeChromatic = parseInt(chromaticEl.textContent);
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
      measureEl.querySelectorAll("note").forEach((noteEl) => {
        const isRest = noteEl.querySelector("rest") !== null;
        const isChord = noteEl.querySelector("chord") !== null;
        const durationEl = noteEl.querySelector("duration");
        const duration = durationEl
          ? parseInt(durationEl.textContent ?? "1")
          : divisions;

        const durationBeats = parseDurationToBeats(duration, divisions);

        if (!isRest) {
          const pitchEl = noteEl.querySelector("pitch");
          if (pitchEl) {
            const step =
              pitchEl.querySelector("step")?.textContent ?? "C";
            const octave = parseInt(
              pitchEl.querySelector("octave")?.textContent ?? "4"
            );
            const alter = parseFloat(
              pitchEl.querySelector("alter")?.textContent ?? "0"
            );
            const dynamicsEl = noteEl.querySelector("dynamics");
            const velocity = dynamicsEl
              ? Math.round(
                  (parseFloat(dynamicsEl.textContent ?? "80") / 127) * 127
                )
              : 80;

            notes.push({
              pitch: midiNoteFromStep(step, octave, alter) + transposeChromatic,
              startBeat: isChord
                ? currentBeat + measureBeatOffset - durationBeats
                : currentBeat + measureBeatOffset,
              durationBeats,
              velocity,
              partIndex,
            });
          }
        }

        if (!isChord) {
          measureBeatOffset += durationBeats;
        }
      });

      currentBeat += beats;
    });

    parts.push({
      id: partId,
      name: partName,
      isSolo: partIndex === 0,
      notes,
    });
  });

  const slotCount = measureNumbers.length;
  const playbackOrder =
    repeatMarkers.length > 0
      ? buildPlaybackOrder(slotCount, repeatMarkers)
      : Array.from({ length: slotCount }, (_, i) => i);

  if (playbackOrder.length > slotCount) {
    for (const part of parts) {
      const notesBySlot: NoteEvent[][] = Array.from(
        { length: slotCount },
        () => []
      );
      for (const note of part.notes) {
        const slot = Math.floor(note.startBeat / beats);
        if (slot >= 0 && slot < slotCount) {
          notesBySlot[slot].push(note);
        }
      }

      const expanded: NoteEvent[] = [];
      for (let step = 0; step < playbackOrder.length; step++) {
        const srcSlot = playbackOrder[step];
        const slotNotes = notesBySlot[srcSlot];
        const srcBase = srcSlot * beats;
        const destBase = step * beats;

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

  const totalBeats = playbackOrder.length * beats;

  return {
    title,
    tempo,
    timeSignature: { beats, beatType },
    parts,
    measures,
    totalMeasures,
    totalBeats,
    playbackOrder,
    measureNumbers,
  };
}

/**
 * Update a MusicXML string with a Lead/Follow annotation at a specific measure.
 */
export function updateMusicXMLAnnotation(
  xmlString: string,
  measureNumber: number,
  annotation: { role?: RoleDirective; wait?: WaitDirective }
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
