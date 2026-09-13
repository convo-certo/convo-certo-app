import { expect, it } from 'vitest';
import { scoreActivity, soundingAt } from './score-activity';
import type { NoteEvent } from './types';
const note = (startBeat:number,durationBeats:number):NoteEvent => ({startBeat,durationBeats,pitch:60,velocity:80,partIndex:0});
it('preserves overlapping voices, rests and exact onset and release boundaries', () => {
  const source=[note(4,1),note(NaN,1),note(0,3),note(1,1),note(2.5,1)];
  const index=scoreActivity(source);
  expect(index).toEqual([{start:0,end:3.5},{start:4,end:5}]);
  for(const beat of [5,4.5,4,3.75,3.5,2,0,-1]) expect(soundingAt(index,beat)).toBe(source.some(n=>n.startBeat<=beat&&n.startBeat+n.durationBeats>beat));
});
it('agrees with direct lookup on a generated polyphonic score and arbitrary seeks', () => {
  let seed=12345;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const source=Array.from({length:5000},()=>note(Math.floor(random()*10000)/4,random()*4));
  const before=structuredClone(source);
  const index=scoreActivity(source);
  for(let i=0;i<1000;i++) {
    const beat=random()*3000;
    expect(soundingAt(index,beat)).toBe(source.some(n=>n.startBeat<=beat&&n.startBeat+n.durationBeats>beat));
  }
  expect(source).toEqual(before);
});
it('reads fewer than 25 intervals when seeking in 100000 separated notes', () => {
  const index=scoreActivity(Array.from({length:100000},(_,i)=>note(i*2,1)));
  let reads=0;
  const counted=new Proxy(index,{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key)) reads++;return Reflect.get(target,key,receiver);}});
  expect(soundingAt(counted,199998.5)).toBe(true);
  expect(reads).toBeLessThan(25);
  let linearReads=0;
  expect(index.some(interval=>{linearReads++;return interval.start<=199998.5&&interval.end>199998.5;})).toBe(true);
  expect(linearReads).toBe(100000);
});
