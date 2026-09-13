import { expect, it } from "vitest";
import { musicXMLPlaybackOrder } from "./musicxml-navigation";
const play = (bars: string[]) => musicXMLPlaybackOrder(Array.from(new DOMParser().parseFromString(`<part>${bars.map((content, i) => `<measure number="${i + 1}">${content}</measure>`).join("")}</part>`, "application/xml").querySelectorAll("measure")));
const forward = '<barline><repeat direction="forward"/></barline>';
const back = '<barline><repeat direction="backward"/></barline>';

it("plays first and second endings on their respective passes", () => {
  expect(play([forward, '<barline><ending number="1" type="start"/></barline>', '<barline><ending number="1" type="stop"/><repeat direction="backward"/></barline>', '<barline><ending number="2" type="start"/></barline>', '<barline><ending number="2" type="stop"/></barline>'])).toEqual([0, 1, 2, 0, 3, 4]);
});
it("honors repeat counts and nested repeats", () => {
  expect(play([forward, '<barline><repeat direction="backward" times="3"/></barline>'])).toEqual([0, 1, 0, 1, 0, 1]);
  expect(play([forward, forward, back, back])).toEqual([0, 1, 2, 1, 2, 3, 0, 1, 2, 1, 2, 3]);
});
it("handles D.C. al Fine and D.S. al Coda encoded as MusicXML sound navigation", () => {
  expect(play(["", '<direction><sound fine="yes"/></direction>', '<direction><sound dacapo="yes"/></direction>'])).toEqual([0, 1, 2, 0, 1]);
  expect(play(['<direction><sound segno="s"/></direction>', '<direction><sound tocoda="c"/></direction>', '<direction><sound dalsegno="s"/></direction>', '<direction><sound coda="c"/></direction>'])).toEqual([0, 1, 2, 0, 1, 3]);
});
