import { expect, it } from 'vitest';
import { playerVariation, chairLevel } from './player-variation';
const chair = {id:'player-1',partIndex:1,instrument:'cello',x:0,z:-2,level:1,variation:1};
const note = {pitch:48,startBeat:0,durationBeats:1,velocity:80,partIndex:1};
it('keeps the original timing, pitch, level and duration when disabled or absent', () => {
  expect(playerVariation({...chair,variation:0},note)).toEqual({cents:0,delay:0,gate:1,gain:1});
  expect(playerVariation({...chair,variation:undefined},note)).toEqual({cents:0,delay:0,gate:1,gain:1});
});
it('produces reproducible bounded differences without changing between rehearsals', () => {
  const first = playerVariation(chair,note);
  expect(playerVariation(chair,note)).toEqual(first);
  expect(playerVariation({...chair,id:'player-2'},note)).not.toEqual(first);
  for(let i=0;i<1000;i++) {
    const value=playerVariation({...chair,id:`player-${i}`},{...note,startBeat:i});
    expect(Math.abs(value.cents)).toBeLessThanOrEqual(6);
    expect(value.delay).toBeGreaterThanOrEqual(0); expect(value.delay).toBeLessThanOrEqual(0.012);
    expect(value.gate).toBeGreaterThanOrEqual(0.98); expect(value.gate).toBeLessThanOrEqual(1.02);
    expect(value.gain).toBeGreaterThanOrEqual(0.96); expect(value.gain).toBeLessThanOrEqual(1.04);
  }
});
it('normalizes duplicated instruments without reducing other instruments or counting silent chairs', () => {
  const chairs=[chair,{...chair,id:'player-2'},{...chair,id:'silent',level:0},{...chair,id:'horn',instrument:'french_horn'}];
  expect(chairLevel(chair,chairs)**2 + chairLevel(chairs[1],chairs)**2).toBeCloseTo(1);
  expect(chairLevel(chairs[2],chairs)).toBe(0);
  expect(chairLevel(chairs[3],chairs)).toBe(1);
});
