import { defaultEnsembleTuning } from "./ensemble-tuning";
import { expect, it } from "vitest";
import { readPracticeFile } from "./practice-file";
import { createPracticeJournalEntry } from "./practice-journal";
import { placementInstruments } from "./instrument-palette";
import { readFileSync } from "node:fs";
const xml = readFileSync('public/scores/sample-duet.musicxml','utf8');
const session = {version:1,seatId:'P1',instrumentKey:-2,shift:-2,tuning:442,tempo:84,beat:4,startMeasure:2,loopEnd:4,loopEnabled:true,mode:'accompany',countInBars:1,click:false,volume:65,midiWritten:true,space:{enabled:true,listener:{x:1,z:0},chairs:[{id:'chair-1',partIndex:1,instrument:'french_horn',x:2,z:-5,level:0.8}]}};
const file = (settings: unknown = session) => JSON.stringify({format:'convocerto-practice',version:1,score:{title:'My practice',xml,session:settings}});
it('preserves a portable practice with its score, transposition and spatial assignment', () => {
  const restored=readPracticeFile(file());
  expect(restored.session).toEqual(session);
  expect(restored.xml).toContain('score-partwise');
  expect(restored.title).toBe('My practice');
});
it('rejects incompatible versions, invalid JSON and missing performance seats', () => {
  expect(()=>readPracticeFile('{')).toThrow('JSON');
  expect(()=>readPracticeFile(file().replace('"version":1','"version":2'))).toThrow('対応');
  expect(()=>readPracticeFile(file({...session,seatId:'missing'}))).toThrow('存在する席');
});
it('rejects invalid positions and orchestra routing instead of partially applying them', () => {
  for(const patch of [{space:{...session.space,chairs:[{...session.space.chairs[0],variation:2}]}},{beat:1e100},{tempo:null},{loopEnd:0},{midiWritten:'true'},{space:{...session.space,chairs:[{...session.space.chairs[0],partIndex:999}]}},{space:{...session.space,chairs:[session.space.chairs[0],session.space.chairs[0]]}}]) expect(()=>readPracticeFile(file({...session,...patch}))).toThrow('不正');
});

it('preserves an inactive loop while the user is editing its bounds', () => {
  expect(readPracticeFile(file({...session,loopEnabled:false,startMeasure:5,loopEnd:2})).session?.startMeasure).toBe(5);
});

it('preserves expressive following settings and accepts legacy files without them', () => {
  const ensemble = { tuning: { ...defaultEnsembleTuning, follower: 'sequence', responseSeconds: 0.7 }, leader: 'conductor' };
  expect(readPracticeFile(file({...session, ensemble})).session?.ensemble).toEqual(ensemble);
  expect(readPracticeFile(file()).session?.ensemble).toBeUndefined();
});
it('rejects invalid expressive settings and unavailable leaders', () => {
  for (const ensemble of [null, { tuning: defaultEnsembleTuning, leader: 'missing' }, { tuning: {...defaultEnsembleTuning, follower: 'unknown'}, leader: 'player' }, { tuning: {...defaultEnsembleTuning, responseSeconds: 100}, leader: 'conductor' }]) {
    expect(() => readPracticeFile(file({...session, ensemble}))).toThrow();
  }
});

it('restores expression only for the saved score and transposition', async () => {
  const { parseMusicXML } = await import('./musicxml-parser');
  const { transposeScore } = await import('./repertoire');
  const { workSignature } = await import('./score-signature');
  const reference = {version:1,title:'My phrasing',scoreTitle:'Duet',sourcePartId:'P1',workSignature:workSignature(transposeScore(parseMusicXML(xml),session.shift)),source:{type:'recorded-input',takeId:'test',recordedAt:'2026-09-11'},points:[0,1,2].map(beat=>({beat,tempoRatio:0.8,gain:1.2,articulation:0.7}))};
  const ensemble={tuning:defaultEnsembleTuning,leader:'player',reference};
  expect(readPracticeFile(file({...session,ensemble})).session?.ensemble?.reference).toEqual(reference);
  expect(()=>readPracticeFile(file({...session,shift:0,ensemble}))).toThrow('一致');
  expect(()=>readPracticeFile(file({...session,ensemble:{...ensemble,reference:{...reference,points:[null,null,null]}}}))).toThrow('不正');
  expect(()=>readPracticeFile(file({...session,ensemble:{...ensemble,reference:{...reference,points:[...reference.points,{...reference.points[0],beat:9999}]}}}))).toThrow('一致');
  expect(readPracticeFile(file({...session,ensemble:{...ensemble,reference:null}})).session?.ensemble?.reference).toBeNull();
});

it('restores muted accompaniment identities while rejecting unknown, solo or duplicate parts', () => {
  expect(readPracticeFile(file({...session, mutedPartIds:['P2']})).session?.mutedPartIds).toEqual(['P2']);
  expect(readPracticeFile(file()).session?.mutedPartIds).toBeUndefined();
  for (const mutedPartIds of [null, 'P2', ['missing'], ['P1'], ['P2','P2'], [2]]) expect(() => readPracticeFile(file({...session, mutedPartIds}))).toThrow('不正');
});

it.each(placementInstruments)('roundtrips the supported %s sound on an accompaniment chair', instrument => {
  const settings = { ...session, space: { ...session.space, chairs: [{ ...session.space.chairs[0], instrument }] } };
  const restored = readPracticeFile(file(settings));
  expect(restored.session).toEqual(settings);
  const exported = JSON.stringify({ format: 'convocerto-practice', version: 1, score: restored });
  expect(readPracticeFile(exported)).toEqual(restored);
});

it('records a recent practice after its accompaniment sound changes', () => {
  const restored = readPracticeFile(file());
  restored.session!.space!.chairs[0].instrument = 'church_organ';
  const practice = { ...restored, id: 'changed-sound', savedAt: '2026-09-30T00:00:00.000Z' };
  const recorded = createPracticeJournalEntry(undefined, practice, 10, new Date(practice.savedAt));
  expect(recorded?.practice.session?.space?.chairs[0]).toEqual(restored.session!.space!.chairs[0]);
  expect(recorded?.totalPlayedSeconds).toBe(10);
});

it('rejects arbitrary instruments outside the supported sound palette', () => {
  for (const instrument of ['custom_synth', '../audio/unknown', '']) {
    expect(() => readPracticeFile(file({ ...session, space: { ...session.space, chairs: [{ ...session.space.chairs[0], instrument }] } }))).toThrow('不正');
  }
});
