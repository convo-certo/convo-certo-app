import {beforeEach,expect,it,vi} from 'vitest';
import {MidiManager} from './midi-manager';
const audio=vi.hoisted(()=>({start:vi.fn(), nodes:[] as {dispose:ReturnType<typeof vi.fn>}[]}));
vi.mock('tone',()=>{
 class Node {dispose=vi.fn();constructor(){audio.nodes.push(this);} connect(){return this;} toDestination(){return this;} start(){} }
 return {...audio,Reverb:Node,Chorus:Node,EQ3:Node,PolySynth:Node,MembraneSynth:Node,Synth:Node};
});
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};};
const fixture=()=>{const input={id:'test',name:'Test',state:'connected',onmidimessage:null as null|((event:any)=>void)};return{input,access:{inputs:new Map([[input.id,input]]),onstatechange:null as null|(()=>void)}};};
beforeEach(()=>{vi.clearAllMocks();audio.nodes.length=0;audio.start.mockResolvedValue(undefined);});
it('does not attach a late MIDI permission result after disposal',async()=>{
 const f=fixture(),pending=deferred<any>();Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:()=>pending.promise});
 const manager=new MidiManager();const initializing=manager.init();manager.dispose();pending.resolve(f.access);await initializing;
 expect(f.access.onstatechange).toBeNull();expect(manager.getInputDevices()).toEqual([]);manager.selectInput('test');expect(f.input.onmidimessage).toBeNull();
});
it('ignores an older init result that completes after a newer request',async()=>{
 const first=deferred<any>(),second=fixture();Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(second.access)});
 const manager=new MidiManager();const old=manager.init();await manager.init();const obsolete=fixture();first.resolve(obsolete.access);await old;
 expect(obsolete.access.onstatechange).toBeNull();expect(second.access.onstatechange).toBeTypeOf('function');manager.dispose();
});
it('invalidates queued note callbacks and device callbacks on disposal',async()=>{
 const f=fixture();Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>f.access});
 const manager=new MidiManager(),notes=vi.fn(),devices=vi.fn();await manager.init();manager.setNoteCallback(notes);manager.onDevicesChanged=devices;manager.selectInput('test');
 const late=f.input.onmidimessage!,changed=f.access.onstatechange!;manager.dispose();late({data:new Uint8Array([0x90,60,80])});changed();manager.dispose();
 expect(notes).not.toHaveBeenCalled();expect(devices).not.toHaveBeenCalled();expect(f.input.onmidimessage).toBeNull();expect(f.access.onstatechange).toBeNull();
});
it('does not construct audio effects after a pending audio start is disposed',async()=>{
 const pending=deferred<void>();audio.start.mockReturnValueOnce(pending.promise);const manager=new MidiManager();const starting=manager.initAudio();manager.dispose();pending.resolve();await starting;
 expect(manager.getAudioContext()).toBeNull();await manager.initAudio();expect(audio.start).toHaveBeenCalledTimes(1);
});

it('disposes every synth and effect once after successful audio initialization',async()=>{
 const manager=new MidiManager();await manager.initAudio();expect(audio.nodes).toHaveLength(6);manager.dispose();manager.dispose();
 for(const node of audio.nodes) expect(node.dispose).toHaveBeenCalledTimes(1);
});
