import { expect, it } from 'vitest';
import { inspectMusicXMLPlayback } from './musicxml-playback-issues';
import { parseMusicXML } from './musicxml-parser';

const header = '<part-list><score-part id="C"><part-name>Clarinet</part-name></score-part></part-list>';
const note = '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><notations><fermata/><ornaments><trill-mark/></ornaments></notations></note>';
const xml = (content: string) => `<score-partwise>${header}<part id="C">${content}</part></score-partwise>`;
const measure = (content: string, number = '1') => `<measure number="${number}"><attributes><divisions>1</divisions></attributes>${content}</measure>`;

it('identifies silent playback omissions at their source measures without changing parsed music', () => {
  const source = xml(measure('<direction><direction-type><wedge type="crescendo"/></direction-type></direction><note><grace/><pitch><step>D</step><octave>4</octave></pitch></note>' + note, '0'));
  const before = parseMusicXML(source);
  const issues = inspectMusicXMLPlayback(source);
  expect(issues.map(issue=>issue.id)).toEqual(['grace','ornaments','fermata','wedge','missing-transpose']);
  expect(issues.every(issue=>issue.locations[0].measure==='0' && issue.locations[0].part==='Clarinet')).toBe(true);
  expect(parseMusicXML(source)).toEqual(before);
  expect(before.parts[0].notes).toHaveLength(1);
  expect(before.parts[0].notes[0].durationBeats).toBe(4);
});

it('normalizes namespaced timewise scores and groups many repeated symbols', () => {
  const source = `<score-timewise xmlns="urn:musicxml">${header}${Array.from({length:7},(_,i)=>`<measure number="${i+1}"><part id="C">${note}${note}</part></measure>`).join('')}</score-timewise>`;
  const issue = inspectMusicXMLPlayback(source).find(issue=>issue.id==='fermata')!;
  expect(issue.count).toBe(14); expect(issue.locationCount).toBe(7); expect(issue.locations).toHaveLength(4);
  expect(issue.locations.map(location=>location.measure)).toEqual(['1','2','3','4']);
});

it('does not flag supported dynamics, articulations, ties, repeats or encoded jumps', () => {
  const source = xml(measure('<attributes><transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose></attributes><direction><direction-type><dynamics><p/></dynamics><words>D.C. al Fine</words></direction-type><sound dacapo="yes"/></direction><note><pitch><step>C</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><tie type="start"/><notations><articulations><staccato/><accent/></articulations></notations></note><barline><repeat direction="backward"/></barline>'));
  expect(inspectMusicXMLPlayback(source)).toEqual([]);
});

it('distinguishes unpitched notes, fractional alteration and unencoded textual navigation', () => {
  const source = xml(measure('<direction><direction-type><words>D.S. al Coda</words></direction-type></direction><note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>4</duration></note><note><pitch><step>C</step><alter>0.5</alter><octave>4</octave></pitch><duration>4</duration></note>'));
  expect(inspectMusicXMLPlayback(source).map(issue=>issue.id)).toEqual(['unpitched','microtones','written-jumps','missing-transpose']);
});

it('flags a transposing clarinet part without MusicXML transpose metadata', () => {
  const source = xml(measure(note));
  expect(inspectMusicXMLPlayback(source).find(issue=>issue.id==='missing-transpose')).toMatchObject({ count: 1, locations: [{ part: 'Clarinet', measure: '1' }] });
});
