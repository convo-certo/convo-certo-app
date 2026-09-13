(() => {
  const pending = new Map();
  let request = 0;
  let access;
  const send = message => webkit.messageHandlers.convoMIDI.postMessage(message);
  class Input extends EventTarget {
    constructor(device) { super(); Object.assign(this, device, {state:'connected',type:'input',connection:'closed'}); this.handler = null; }
    get onmidimessage() { return this.handler; }
    set onmidimessage(handler) { this.handler = handler; this.connection = handler ? 'open' : 'closed'; send({action:'select',id:handler ? this.id : ''}); }
  }
  const update = devices => {
    if (!access) return;
    for (const input of access.inputs.values()) input.state = 'disconnected';
    const next = new Map();
    for (const device of devices) {
      const input = access.inputs.get(device.id) ?? new Input(device);
      Object.assign(input, device, {state:'connected'}); next.set(input.id,input);
    }
    access.inputs = next;
    const event = new Event('statechange'); access.onstatechange?.(event); access.dispatchEvent(event);
  };
  window.__convoMIDIReceive = message => {
    if (message.kind === 'ready') {
      access ??= Object.assign(new EventTarget(), {inputs:new Map(),outputs:new Map(),onstatechange:null,sysexEnabled:false});
      update(message.devices);
      pending.get(message.request)?.resolve(access); pending.delete(message.request);
    } else if (message.kind === 'error') {
      pending.get(message.request)?.reject(new Error(message.error)); pending.delete(message.request);
      dispatchEvent(new CustomEvent('convocerto-midi-error',{detail:message.error}));
    } else if (message.kind === 'devices') update(message.devices);
    else if (message.kind === 'message') {
      const input = access?.inputs.get(message.id);
      if (!input || input.state !== 'connected') return;
      const event = new Event('midimessage');
      Object.assign(event,{data:new Uint8Array(message.data),receivedTime:performance.now()});
      input.onmidimessage?.(event); input.dispatchEvent(event);
    }
  };
  Object.defineProperty(navigator,'requestMIDIAccess',{value: options => {
    if (options?.sysex) return Promise.reject(new Error('SysEx is not supported'));
    return new Promise((resolve,reject) => {
      const id=++request;
      const timeout=setTimeout(() => {pending.delete(id);reject(new Error('MIDI接続がタイムアウトしました'));},5000);
      pending.set(id,{resolve:value=>{clearTimeout(timeout);resolve(value);},reject:error=>{clearTimeout(timeout);reject(error);}});
      send({action:'init',request:id});
    });
  }});
})();
