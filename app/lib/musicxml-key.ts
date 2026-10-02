import { musicXMLDocument } from "./musicxml-import";

const steps = "CDEFGAB";
const natural = [0, 2, 4, 5, 7, 9, 11];
const major = ["Ces", "Ges", "Des", "As", "Es", "B", "F", "C", "G", "D", "A", "E", "H", "Fis", "Cis"];
const minor = ["as", "es", "b", "f", "c", "g", "d", "a", "e", "h", "fis", "cis", "gis", "dis", "ais"];
const mod = (n: number, divisor: number) => ((n % divisor) + divisor) % divisor;
export type ScoreKey = { fifths: number; mode: "major" | "minor" };
export const keyLabel = ({ fifths, mode }: ScoreKey) => `${(mode === "minor" ? minor : major)[fifths + 7]} ${mode === "minor" ? "moll" : "dur"}`;
export const keyChoices = (mode: ScoreKey["mode"]) => Array.from({ length: 15 }, (_, i) => ({ fifths: i - 7, mode }));

function keyValue(key: Element | null): ScoreKey {
  if (key && !key.querySelector("fifths")) throw new Error("特殊な調号の移調にはまだ対応していません。");
  const fifths = Number(key?.querySelector("fifths")?.textContent ?? 0);
  const mode = key?.querySelector("mode")?.textContent ?? "major";
  if (!Number.isInteger(fifths) || Math.abs(fifths) > 7 || !["major", "minor"].includes(mode)) throw new Error("長調・短調の調号を選べる楽譜でお試しください。");
  return { fifths, mode: mode as ScoreKey["mode"] };
}

export function writtenScoreKey(xml: string, partId?: string): ScoreKey {
  const doc = musicXMLDocument(xml);
  const parts = Array.from(doc.documentElement.children).filter(e => e.localName === "part");
  const part = partId ? parts.find(p => p.getAttribute("id") === partId) : parts[0];
  if (!part) throw new Error("担当パートを確認してください。");
  return keyValue(part.querySelector("measure")?.querySelector("attributes > key") ?? null);
}

function tonic(key: ScoreKey) {
  const step = mod(4 * key.fifths + (key.mode === "minor" ? 5 : 0), 7);
  const pc = mod(7 * key.fifths + (key.mode === "minor" ? 9 : 0), 12);
  const alter = mod(pc - natural[step] + 6, 12) - 6;
  return { step, pitch: natural[step] + alter };
}

export function transposeMusicXMLKey(xml: string, target: ScoreKey, partId?: string) {
  const source = writtenScoreKey(xml, partId);
  if (source.mode !== target.mode || !Number.isInteger(target.fifths) || Math.abs(target.fifths) > 7) throw new Error("同じ長調・短調の中から調を選んでください。");
  if (source.fifths === target.fifths) return xml;
  const doc = musicXMLDocument(xml);
  if (doc.querySelector("key-step, key-alter, fret, accidental-mark, scordatura")) throw new Error("特殊な調号・運指・装飾音の臨時記号を含むため、安全に移調できません。楽譜ソフトで移調してください。");
  const from = tonic(source), to = tonic(target);
  const distance = to.pitch - from.pitch;
  const closest = mod(distance + 6, 12) - 6;
  const semitones = closest === -6 && distance > 0 ? 6 : closest;
  const diatonic = to.step - from.step + 7 * Math.round((from.pitch + semitones - to.pitch) / 12);
  const fifthsDelta = target.fifths - source.fifths;
  const replace = (parent: Element, name: string, value: string, before?: Element | null) => {
    let node = parent.querySelector(`:scope > ${name}`);
    if (!node) { node = doc.createElement(name); parent.insertBefore(node, before ?? null); }
    node.textContent = value;
  };
  const changePitch = (node: Element, prefix = "") => {
    const stepNode = node.querySelector(`${prefix}step`);
    const index = steps.indexOf(stepNode?.textContent ?? "?");
    const octaveNode = node.querySelector("octave");
    const octave = Number(octaveNode?.textContent ?? 4);
    const alterNode = node.querySelector(`${prefix}alter`);
    const alter = Number(alterNode?.textContent ?? 0);
    if (index < 0 || !Number.isInteger(alter) || !Number.isInteger(octave)) throw new Error("微分音など、半音単位でない音高にはまだ対応していません。");
    const position = octave * 7 + index + diatonic;
    const nextStep = mod(position, 7), nextOctave = Math.floor(position / 7);
    const nextAlter = octave * 12 + natural[index] + alter + semitones - nextOctave * 12 - natural[nextStep];
    if (Math.abs(nextAlter) > 2 || octaveNode && (nextOctave < 0 || nextOctave > 9)) throw new Error("移調後の音域・臨時記号を表せません。別の調を選んでください。");
    stepNode!.textContent = steps[nextStep];
    stepNode!.removeAttribute("text");
    if (nextAlter || alterNode) replace(node, `${prefix}alter`, String(nextAlter), octaveNode);
    if (octaveNode) octaveNode.textContent = String(nextOctave);
    const accidental = node.parentElement?.querySelector(":scope > accidental");
    if (accidental) accidental.textContent = ["flat-flat", "flat", "natural", "sharp", "double-sharp"][nextAlter + 2];
  };
  for (const part of Array.from(doc.documentElement.children).filter(e => e.localName === "part")) {
    if (!part.querySelector("pitch") && (part.querySelector("unpitched") || Array.from(part.querySelectorAll("clef > sign")).some(sign => sign.textContent === "percussion"))) continue;
    const firstMeasure = part.querySelector("measure");
    if (!firstMeasure) continue;
    let attributes = firstMeasure.querySelector("attributes");
    if (!attributes) { attributes = doc.createElement("attributes"); firstMeasure.prepend(attributes); }
    if (!attributes.querySelector("key")) {
      const key = doc.createElement("key");
      replace(key, "fifths", "0");
      attributes.insertBefore(key, Array.from(attributes.children).find(e => e.localName !== "divisions") ?? null);
    }
    for (const key of part.querySelectorAll("key")) {
      const next = keyValue(key).fifths + fifthsDelta;
      if (Math.abs(next) > 7) throw new Error("別パートや曲中の転調で調号が7個を超えます。同じ響きの別の調を選んでください。");
      key.querySelector("fifths")!.textContent = String(next);
      key.querySelector("cancel")?.remove();
      key.querySelectorAll("key-octave").forEach(node => node.remove());
    }
    for (const pitch of part.querySelectorAll("pitch")) {
      changePitch(pitch);
      pitch.parentElement?.removeAttribute("default-y");
    }
    for (const root of part.querySelectorAll("harmony > root")) changePitch(root, "root-");
    for (const bass of part.querySelectorAll("harmony > bass")) changePitch(bass, "bass-");
  }
  return new XMLSerializer().serializeToString(doc.documentElement);
}
