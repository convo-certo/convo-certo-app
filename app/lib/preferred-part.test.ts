import { describe, expect, it } from "vitest";
import { parseMusicXML } from "./musicxml-parser";
import { preferredPartId } from "./preferred-part";
import { assignPerformanceSeat, playerPart } from "./performance-seats";

const score = () => parseMusicXML(`<score-partwise><part-list><score-part id="F0"><part-name>Flute 1</part-name><midi-instrument><midi-program>74</midi-program></midi-instrument></score-part><score-part id="F1"><part-name>Flauta 2</part-name><midi-instrument><midi-program>74</midi-program></midi-instrument></score-part><score-part id="C"><part-name>Clarinet</part-name><midi-instrument><midi-program>72</midi-program></midi-instrument></score-part><score-part id="V"><part-name></part-name><midi-instrument><midi-program>42</midi-program></midi-instrument></score-part></part-list>${["F0", "F1", "C", "V"].map(id => `<part id="${id}"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${id === "F0" ? '<note><rest/><duration>4</duration></note>' : '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>'}</measure></part>`).join("")}</score-partwise>`);

describe("the instrument chosen in the catalogue", () => {
  it("suggests a sounding flute part without changing the original score", () => {
    const source = score();
    expect(playerPart(source)?.id).toBe("C");
    expect(preferredPartId(source, "flute")).toBe("F1");
    const selected = assignPerformanceSeat(source, preferredPartId(source, "flute")!);
    expect(playerPart(selected)?.id).toBe("F1");
    expect(playerPart(source)?.id).toBe("C");
    expect(selected.parts.filter(part => part.isSolo)).toHaveLength(1);
  });

  it("uses zero-based parsed MIDI programs correctly when names are absent", () => {
    expect(preferredPartId(score(), "viola")).toBe("V");
    expect(preferredPartId(score(), "violin")).toBeUndefined();
    expect(preferredPartId(score())).toBeUndefined();
  });

  it("does not suggest a silent part and keeps an unavailable instrument as an explicit choice", () => {
    const source = score();
    source.parts.find(part => part.id === "F1")!.notes[0].velocity = 0;
    expect(preferredPartId(source, "flute")).toBeUndefined();
    expect(playerPart(source)?.id).toBe("C");
  });
});
