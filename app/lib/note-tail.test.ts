import {expect,it} from 'vitest';
import {noteTail} from './note-tail';
import {ConcertEngine} from './concert-engine';
import {parseMusicXML} from './musicxml-parser';
const note={pitch:60,startBeat:0,durationBeats:8,velocity:40,partIndex:0,gainCurve:[{position:0,gain:1},{position:1,gain:2}]};
it('rebases the remaining duration and dynamic curve without changing the source note',()=>{
 expect(noteTail(note,4)).toMatchObject({startBeat:4,durationBeats:4,velocity:60,gainCurve:[{position:0,gain:1},{position:1,gain:4/3}]});
 expect(note.velocity).toBe(40);
 expect(noteTail(note,0)).toBeNull(); expect(noteTail(note,8)).toBeNull();
 expect(noteTail({...note,articulation:0.5},5)).toBeNull();
 expect(noteTail({...note,articulation:0.5},2)?.articulation).toBeCloseTo(1/3);
});
it('starts held notes once after seeking and waits until count-in finishes',()=>{
 const xml='<score-partwise><part-list><score-part id="C"><part-name>Clarinet</part-name></score-part></part-list><part id="C"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration></note></measure></part></score-partwise>';
 const score=parseMusicXML(xml);let now=0;const engine=new ConcertEngine(()=>now,false);const events:number[]=[];
 try {
  engine.load(score); engine.setPracticeOptions({mode:'listen',countInBars:1,click:false});
  engine.onNote=(note)=>events.push(note.durationBeats); engine.seek(4);engine.start();
  expect(events).toEqual([]);now=1;engine.advance();expect(events).toEqual([]);
  now=2;engine.advance();expect(events).toEqual([4]);
  now=2.1;engine.advance();expect(events).toEqual([4]);
  engine.stop();engine.seek(4);engine.start();engine.stop();now=5;engine.advance();expect(events).toEqual([4]);
 } finally {engine.dispose();}
});
