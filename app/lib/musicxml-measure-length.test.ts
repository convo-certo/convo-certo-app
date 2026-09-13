import { expect, it } from 'vitest';
import { inspectMusicXMLPlayback } from './musicxml-playback-issues';
const attributes = '<attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>';
const note = (duration: number, extra = '') => `<note>${extra}<pitch><step>C</step><octave>4</octave></pitch><duration>${duration}</duration></note>`;
const check = (measures: string) => inspectMusicXMLPlayback(`<score-partwise><part-list><score-part id="P"><part-name>Clarinet</part-name></score-part></part-list><part id="P">${measures}</part></score-partwise>`).filter(issue => issue.id === 'measure-overrun');
it('locates a 4.5-beat OMR bar and inherits meter and divisions', () => {
  const issues = check(`<measure number="1">${attributes}${note(9)}</measure><measure number="2">${note(9)}</measure>`);
  expect(issues[0].count).toBe(2);
  expect(issues[0].locations).toEqual([{ part: 'Clarinet', measure: '1' }, { part: 'Clarinet', measure: '2' }]);
});
it('counts parallel voices and chord tones without summing them', () => {
  expect(check(`<measure>${attributes}${note(8)}${note(8, '<chord/>')}<backup><duration>8</duration></backup>${note(4)}<forward><duration>4</duration></forward></measure>`)).toEqual([]);
});
it('does not flag short pickups, explicit irregular bars or unmetered passages', () => {
  expect(check(`<measure>${attributes}${note(2)}</measure><measure implicit="yes">${note(12)}</measure><measure non-controlling="yes">${note(12)}</measure><measure><attributes><time><senza-misura/></time></attributes>${note(40)}</measure>`)).toEqual([]);
});
it('handles additive meter and changes in duration units', () => {
  const meter = '<attributes><divisions>2</divisions><time><beats>3+2</beats><beat-type>8</beat-type><beats>2</beats><beat-type>4</beat-type></time></attributes>';
  expect(check(`<measure>${meter}${note(9)}</measure><measure>${note(10)}</measure>`)[0].count).toBe(1);
  expect(check(`<measure>${attributes}${note(4)}<attributes><divisions>4</divisions></attributes>${note(8)}</measure>`)).toEqual([]);
});
it('avoids inferring unspecified or staff-specific meters', () => {
  expect(check(`<measure><attributes><divisions>2</divisions></attributes>${note(40)}</measure>`)).toEqual([]);
  expect(check(`<measure>${attributes.replace('<time>', '<time number="1">')}${note(40)}</measure>`)).toEqual([]);
});
it('does not consume time for grace notes or tuplet notation twice', () => {
  expect(check(`<measure>${attributes}${note(4, '<grace/>')}${note(8, '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>')}</measure>`)).toEqual([]);
});
