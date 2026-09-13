import { expect, it } from 'vitest';
import { parseMusicXML } from './musicxml-parser';
import { ConcertEngine } from './concert-engine';
const head='<score-partwise><part-list><score-part id="C"><part-name>Clarinet</part-name></score-part></part-list><part id="C"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>';
const tail='</measure></part></score-partwise>';
const direction=(content:string,staff='')=>`<direction><direction-type>${content}</direction-type>${staff?`<staff>${staff}</staff>`:''}</direction>`;
const wedge=(type:string,number='1',extra='')=>`<wedge type="${type}" number="${number}" ${extra}/>`;
const note=(duration:number,staff='1',notations='')=>`<note><pitch><step>C</step><octave>4</octave></pitch><duration>${duration}</duration><staff>${staff}</staff>${notations}</note>`;
const parse=(body:string)=>parseMusicXML(head+body+tail).parts[0].notes;

it('interpolates p to f across notes and preserves the target beyond the wedge',()=>{
 const notes=parse(direction('<dynamics><p/></dynamics>'+wedge('crescendo'))+note(1)+note(1)+note(1)+note(1)+direction(wedge('stop')+'<dynamics><f/></dynamics>')+note(1));
 expect(notes.map(note=>note.velocity)).toEqual([49,60.75,72.5,84.25,96]);
 expect(notes[0].gainCurve?.at(-1)?.gain).toBeCloseTo(60.75/49);
});

it('builds a held-note envelope with an unchanged lead-in and a completed diminuendo',()=>{
 const notes=parse(direction('<dynamics><f/></dynamics>')+note(1)+direction(wedge('diminuendo'))+note(4)+direction(wedge('stop')+'<dynamics><p/></dynamics>'));
 expect(notes[0].gainCurve).toBeUndefined();
 expect(notes[1].gainCurve).toEqual([{position:0,gain:1},{position:1,gain:49/96}]);
});

it('keeps explicitly numbered and staffed wedges independent',()=>{
 const notes=parse(direction('<dynamics><p/></dynamics>'+wedge('crescendo','3'),'1')+note(4,'1')+direction(wedge('stop','3')+'<dynamics><f/></dynamics>','1')+'<backup><duration>4</duration></backup>'+note(4,'2'));
 expect(notes[0].gainCurve?.at(-1)?.gain).toBeCloseTo(96/49);
 expect(notes[1].gainCurve).toBeUndefined();
});

it('carries an inferred endpoint into the next wedge and resets on an explicit dynamic',()=>{
 const notes=parse(direction(wedge('crescendo'))+note(2)+direction(wedge('stop')+wedge('diminuendo','2'))+note(2)+direction(wedge('stop','2'))+note(1)+direction('<dynamics><p/></dynamics>')+note(1));
 expect(notes.map(note=>note.velocity)).toEqual([80,104,80,49]);
 expect(notes[0].gainCurve?.at(-1)?.gain).toBeCloseTo(104/80);
});

it('retains envelope positions through repeat expansion',()=>{
 const score=parseMusicXML(head+direction('<dynamics><p/></dynamics>'+wedge('crescendo'))+note(4)+direction(wedge('stop')+'<dynamics><f/></dynamics>')+'<barline><repeat direction="backward"/></barline>'+tail);
 expect(score.parts[0].notes.map(note=>note.startBeat)).toEqual([0,4]);
 expect(score.parts[0].notes[1].gainCurve).toEqual(score.parts[0].notes[0].gainCurve);
});

it('does not invent timing for incomplete, overlapping or niente wedges',()=>{
 for(const body of [direction(wedge('crescendo'))+note(4),direction(wedge('crescendo','1','niente="yes"'))+note(4)+direction(wedge('stop')),direction(wedge('crescendo')+wedge('diminuendo','2'))+note(4)+direction(wedge('stop')+wedge('stop','2'))]) expect(parse(body)[0].gainCurve).toBeUndefined();
});

it('uses the local hairpin level when seeking and keeps notated duration separate from articulation',()=>{
 const score=parseMusicXML(head+direction('<dynamics><p/></dynamics>'+wedge('crescendo'))+note(1)+note(1)+note(1,'1','<notations><articulations><staccato/></articulations></notations>')+note(1)+direction(wedge('stop')+'<dynamics><f/></dynamics>')+tail);
 const engine=new ConcertEngine(()=>0,false);
 const events:{velocity:number;duration:number;notated:number}[]=[];
 try {
  engine.load(score); engine.setPracticeOptions({mode:'listen',countInBars:0,click:false}); engine.seek(2);
  engine.onNote=(note,_time,duration,notated)=>events.push({velocity:note.velocity,duration,notated});
  engine.start();
  expect(events[0]).toEqual({velocity:72.5,duration:0.25,notated:0.5});
 } finally {engine.dispose();}
});

it('does not leak a staff-specific dynamic into another staff without hairpins',()=>{
 const notes=parse(direction('<dynamics><p/></dynamics>','1')+note(4,'1')+'<backup><duration>4</duration></backup>'+note(4,'2'));
 expect(notes.map(note=>note.velocity)).toEqual([49,80]);
});

it('applies offset dynamics at their musical time rather than XML traversal order',()=>{
 const delayed='<direction><direction-type><dynamics><f/></dynamics></direction-type><offset>2</offset></direction>';
 const notes=parse(delayed+note(1)+note(1)+note(1)+note(1)+'<backup><duration>4</duration></backup>'+note(1,'2')+note(1,'2')+note(1,'2'));
 expect(notes.filter(note=>note.staff==='1').map(note=>note.velocity)).toEqual([80,80,96,96]);
 expect(notes.filter(note=>note.staff==='2').map(note=>note.velocity)).toEqual([80,80,96]);
});

it('keeps the start level finite when sound dynamics are malformed',()=>{
 const notes=parse(direction('<dynamics><p/></dynamics>')+'<direction><sound dynamics="invalid"/></direction>'+note(1));
 expect(notes[0].velocity).toBe(49);
});
