import { describe, expect, it } from "vitest";
import { parseMusicXML } from "./musicxml-parser";
import { assignPerformanceSeat } from "./performance-seats";
import { practicePartIssue } from "./practice-readiness";

const note = `<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>`;
const rest = `<note><rest/><duration>4</duration></note>`;
const score = (parts: string[][]) => parseMusicXML(`<score-partwise version="4.0"><part-list>${parts.map((_, index) => `<score-part id="P${index}"><part-name>Part ${index}</part-name></score-part>`).join("")}</part-list>${parts.map((bars, index) => `<part id="P${index}">${bars.map((content, bar) => `<measure number="${bar + 1}"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${content}</measure>`).join("")}</part>`).join("")}</score-partwise>`);

describe("practice part readiness", () => {
  it("distinguishes a missing player line from a missing accompaniment", () => {
    expect(practicePartIssue(assignPerformanceSeat(score([[note]]), "P0"))).toBe("no-accompaniment");
    expect(practicePartIssue(assignPerformanceSeat(score([[note], [rest]]), "P0"))).toBe("no-accompaniment");
    expect(practicePartIssue(assignPerformanceSeat(score([[rest], [note]]), "P0"))).toBe("empty-part");
  });

  it("allows entries after rests anywhere in the full score", () => {
    expect(practicePartIssue(assignPerformanceSeat(score([[rest, note], [rest, note]]), "P0"))).toBeNull();
  });

  it("recognizes another voice in the same source part as accompaniment", () => {
    const combined = score([[`${note}<backup><duration>4</duration></backup>${note.replace("<voice>1</voice>", "<voice>2</voice>")}`]]);
    expect(practicePartIssue(assignPerformanceSeat(combined, "P0"))).toBe("no-accompaniment");
    expect(practicePartIssue(assignPerformanceSeat(combined, JSON.stringify(["P0", "1", "2"])))).toBeNull();
  });
});
