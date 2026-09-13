void (async () => {
  const emit = result => webkit.messageHandlers.testResult.postMessage(result);
  const wait = async (read, description) => {
    emit({progress:description});
    const deadline = performance.now() + 20000;
    while (performance.now() < deadline) { const value = read(); if (value) return value; await new Promise(resolve=>setTimeout(resolve,100)); }
    throw new Error('Timed out: ' + description);
  };
  const button = text => [...document.querySelectorAll('button')].find(item=>item.textContent===text && !item.disabled);
  try {
    await wait(()=>document.querySelector('input[accept*=".mxl"]'),'recovery React ready');
    if (window.__convoRecoveryStage === 0) {
      const response = await fetch('/scores/sample-duet.musicxml');
      if(!response.ok) throw new Error('Recovery fixture missing');
      const transfer = new DataTransfer();
      transfer.items.add(new File([await response.text()],'recovery.musicxml',{type:'application/xml'}));
      const input = document.querySelector('input[accept*=".mxl"]'); input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
      await wait(()=>button('▶ 演奏開始'),'recovery score ready');
      document.querySelector('.part-row button').click();
      await wait(()=>document.querySelector('.part-row button')?.getAttribute('aria-pressed')==='true','recovery saved mute');
      button('この練習を保存').click();
      await wait(()=>document.querySelector('[aria-label="マイ楽譜"] button[aria-label$="をマイ楽譜から削除"]'),'recovery practice saved');
      button('ClariMate / MIDIを接続').click();
      const selector = document.querySelector('[aria-label="MIDI機器"]');
      const option = await wait(()=>[...selector.options].find(item=>item.textContent.includes('ConvoCerto Test Input')),'recovery MIDI source');
      selector.value=option.value; selector.dispatchEvent(new Event('change',{bubbles:true}));
      webkit.messageHandlers.convoMIDI.postMessage({action:'test-send',data:[0x90,60,99]});
      await wait(()=>document.querySelector('.midi-reading')?.textContent.includes('強さ 99'),'recovery MIDI connected');
      button('▶ 演奏開始').click();
      await wait(()=>Number(document.querySelector('[aria-label="演奏位置"]').value)>0,'recovery active transport');
      emit({progress:'ready-to-terminate'});
    } else {
      const saved = await wait(()=>document.querySelector('[aria-label="マイ楽譜"] button[aria-label$="をマイ楽譜から削除"]'),'saved practice survived process death');
      if(button('■ 停止') || button('マイクを停止')) throw new Error('Input or transport restarted automatically');
      saved.parentElement.querySelector('button').click();
      await wait(()=>button('▶ 演奏開始'),'restored practice ready');
      await wait(()=>document.querySelector('.part-row button')?.getAttribute('aria-pressed')==='true','saved mute survived');
      if(document.querySelector('[aria-label="MIDI機器"]').value!=='') throw new Error('MIDI selection was reused after process death');
      webkit.messageHandlers.convoMIDI.postMessage({action:'test-send',data:[0x90,60,99]});
      await new Promise(resolve=>setTimeout(resolve,300));
      if(document.querySelector('.midi-reading').textContent!=='MIDI入力を待っています') throw new Error('Disconnected MIDI still delivered notes');
      if(button('■ 停止')) throw new Error('Restored practice started automatically');
      button('▶ 演奏開始').click();
      await wait(()=>Number(document.querySelector('[aria-label="演奏位置"]').value)>0,'explicit playback after process recovery');
      button('■ 停止').click();
      emit({passed:true,checks:['saved practice and mute survive actual Web Content termination','native recovery button reopens app','MIDI is disconnected','input and transport do not restart automatically','explicit playback works after recovery']});
    }
  } catch(error) { emit({passed:false,error:String(error)}); }
})();
