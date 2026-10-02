import { musicXMLDocument } from "./musicxml-import";

export const starterInstruments = [
  { id: "flute", label: "フルート", labelEn: "Flute", name: "Flute", program: 74, octave: 0, chromatic: 0, diatonic: 0, fifths: 0, clef: "G", line: 2 },
  { id: "oboe", label: "オーボエ", labelEn: "Oboe", name: "Oboe", program: 69, octave: -1, chromatic: 0, diatonic: 0, fifths: 0, clef: "G", line: 2 },
  { id: "clarinet", label: "B♭クラリネット", labelEn: "B♭ clarinet", name: "B♭ Clarinet", program: 72, octave: -1, chromatic: -2, diatonic: -1, fifths: 2, clef: "G", line: 2 },
  { id: "alto-sax", label: "アルトサックス", labelEn: "Alto saxophone", name: "Alto Saxophone", program: 66, octave: -1, chromatic: -9, diatonic: -5, fifths: 3, clef: "G", line: 2 },
  { id: "tenor-sax", label: "テナーサックス", labelEn: "Tenor saxophone", name: "Tenor Saxophone", program: 67, octave: -2, chromatic: -2, diatonic: -1, transposeOctave: -1, fifths: 2, clef: "G", line: 2 },
  { id: "trumpet", label: "B♭トランペット", labelEn: "B♭ trumpet", name: "B♭ Trumpet", program: 57, octave: -1, chromatic: -2, diatonic: -1, fifths: 2, clef: "G", line: 2 },
  { id: "horn", label: "Fホルン", labelEn: "Horn in F", name: "Horn in F", program: 61, octave: -1, chromatic: -7, diatonic: -4, fifths: 1, clef: "G", line: 2 },
  { id: "trombone", label: "トロンボーン", labelEn: "Trombone", name: "Trombone", program: 58, octave: -2, chromatic: 0, diatonic: 0, fifths: 0, clef: "F", line: 4 },
  { id: "violin", label: "ヴァイオリン", labelEn: "Violin", name: "Violin", program: 41, octave: -1, chromatic: 0, diatonic: 0, fifths: 0, clef: "G", line: 2 },
  { id: "viola", label: "ヴィオラ", labelEn: "Viola", name: "Viola", program: 42, octave: -1, chromatic: 0, diatonic: 0, fifths: 0, clef: "C", line: 3 },
  { id: "cello", label: "チェロ", labelEn: "Cello", name: "Violoncello", program: 43, octave: -2, chromatic: 0, diatonic: 0, fifths: 0, clef: "F", line: 4 },
  { id: "piano", label: "ピアノ（右手の旋律）", labelEn: "Piano (right-hand melody)", name: "Piano Melody", program: 1, octave: -1, chromatic: 0, diatonic: 0, fifths: 0, clef: "G", line: 2 },
] as const;

export type StarterInstrumentId = typeof starterInstruments[number]["id"];

export function arrangeStarterDuet(xml: string, instrumentId: StarterInstrumentId): string {
  const instrument = starterInstruments.find(item => item.id === instrumentId);
  if (!instrument) throw new Error("Unknown starter instrument");
  const doc = musicXMLDocument(xml);
  const declaration = doc.querySelector('score-part[id="P1"]');
  const part = doc.querySelector('part[id="P1"]');
  const attributes = part?.querySelector("measure > attributes");
  if (!declaration || !part || !attributes) throw new Error("Starter melody is missing");
  const element = (name: string, value: string | number) => {
    const node = doc.createElement(name);
    node.textContent = String(value);
    return node;
  };
  declaration.querySelector("part-name")!.textContent = instrument.name;
  declaration.querySelectorAll("score-instrument, midi-instrument").forEach(node => node.remove());
  const soundId = "P1-I1";
  const sound = doc.createElement("score-instrument");
  sound.id = soundId;
  sound.append(element("instrument-name", instrument.name));
  const midi = doc.createElement("midi-instrument");
  midi.id = soundId;
  midi.append(element("midi-channel", 1), element("midi-program", instrument.program));
  declaration.append(sound, midi);

  const transposeOctave = "transposeOctave" in instrument ? instrument.transposeOctave : 0;
  const chromatic = instrument.chromatic + transposeOctave * 12;
  const diatonic = instrument.diatonic + transposeOctave * 7;
  const steps = "CDEFGAB";
  const natural = [0, 2, 4, 5, 7, 9, 11];
  for (const pitch of part.querySelectorAll("pitch")) {
    const step = steps.indexOf(pitch.querySelector("step")!.textContent!);
    const octave = Number(pitch.querySelector("octave")!.textContent);
    const alter = Number(pitch.querySelector("alter")?.textContent ?? 0);
    const position = octave * 7 + step + instrument.octave * 7 - diatonic;
    const nextStep = ((position % 7) + 7) % 7;
    const nextOctave = Math.floor(position / 7);
    const nextAlter = octave * 12 + natural[step] + alter + instrument.octave * 12 - chromatic - nextOctave * 12 - natural[nextStep];
    pitch.replaceChildren(element("step", steps[nextStep]), ...(nextAlter ? [element("alter", nextAlter)] : []), element("octave", nextOctave));
  }
  attributes.querySelector("key > fifths")!.textContent = String(instrument.fifths);
  attributes.querySelector("clef > sign")!.textContent = instrument.clef;
  attributes.querySelector("clef > line")!.textContent = String(instrument.line);
  attributes.querySelector("transpose")?.remove();
  if (chromatic) {
    const transpose = doc.createElement("transpose");
    transpose.append(element("diatonic", instrument.diatonic), element("chromatic", instrument.chromatic));
    if (transposeOctave) transpose.append(element("octave-change", transposeOctave));
    attributes.append(transpose);
  }
  const title = doc.querySelector("work-title");
  if (title) title.textContent += ` · ${instrument.labelEn}`;
  return new XMLSerializer().serializeToString(doc.documentElement);
}
