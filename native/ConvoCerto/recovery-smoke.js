void (async () => {
  const emit = result => webkit.messageHandlers.testResult.postMessage(result);
  const wait = async (read, description) => {
    emit({progress:description});
    const deadline = performance.now() + 20000;
    while (performance.now() < deadline) { const value = read(); if (value) return value; await new Promise(resolve=>setTimeout(resolve,100)); }
    throw new Error('Timed out: ' + description);
  };
  const visible = element => !!element?.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
  const query = selector => [...document.querySelectorAll(selector)].find(visible);
  const click = async text => {
    (await wait(() => button(text), text)).click();
    await new Promise(resolve => setTimeout(resolve, 0));
    const screen = { '設定': 'settings', '‹ マイ楽譜': 'library', '楽譜で練習': 'practice' }[text];
    if (screen) await wait(() => query('.studio-shell')?.dataset.screen === screen, screen + ' navigation');
  };
  const button = text => [...document.querySelectorAll('button')].find(item=>visible(item) && item.textContent===text && !item.disabled);
  try {
    await wait(() => {
      const language = query('.language-switcher');
      if (!language) return false;
      if (document.documentElement.lang === 'ja' && language.value === 'ja') return true;
      language.value = 'ja';
      language.dispatchEvent(new Event('change', { bubbles: true }));
      return false;
    }, 'Japanese UI fixture');
    await wait(()=>query('input[accept*=".mxl"]'),'recovery React ready');
    if (window.__convoRecoveryStage === 0) {
      const response = await fetch('/scores/sample-duet.musicxml');
      if(!response.ok) throw new Error('Recovery fixture missing');
      const transfer = new DataTransfer();
      transfer.items.add(new File([await response.text()],'recovery.musicxml',{type:'application/xml'}));
      const input = query('input[accept*=".mxl"]'); input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
      await wait(()=>button('▶ 演奏する'),'recovery score ready');
      await click('このパートで練習');
      if ([...document.querySelectorAll('.studio-toolbar button')].filter(visible).length !== 6) throw new Error('Simple practice toolbar must expose six controls');
      await click('設定');
      query('.part-row button').click();
      await wait(()=>query('.part-row button')?.getAttribute('aria-pressed')==='true','recovery saved mute');
      button('この練習を保存').click();
      await wait(()=>query('.practice-save')?.textContent.includes('この練習を保存しました'),'recovery practice saved');
      button('ClariMate / MIDIを接続').click();
      const selector = query('[aria-label="MIDI機器"]');
      const option = await wait(()=>[...selector.options].find(item=>item.textContent.includes('ConvoCerto Test Input')),'recovery MIDI source');
      selector.value=option.value; selector.dispatchEvent(new Event('change',{bubbles:true}));
      webkit.messageHandlers.convoMIDI.postMessage({action:'test-send',data:[0x90,60,99]});
      await wait(()=>query('.midi-reading')?.textContent.includes('強さ 99'),'recovery MIDI connected');
      button('▶ 演奏開始').click();
      await wait(()=>Number(query('[aria-label="演奏位置"]').value)>0,'recovery active transport');
      emit({progress:'ready-to-terminate'});
    } else {
      const saved = await wait(()=>query('[aria-label="マイ楽譜"] button[aria-label$="をマイ楽譜から削除"]'),'saved practice survived process death');
      if(button('■ 停止') || button('マイクを停止')) throw new Error('Input or transport restarted automatically');
      saved.parentElement.querySelector('button').click();
      await wait(()=>button('▶ 演奏する'),'restored practice ready');
      await click('設定');
      await wait(()=>query('.part-row button')?.getAttribute('aria-pressed')==='true','saved mute survived');
      if(query('[aria-label="MIDI機器"]').value!=='') throw new Error('MIDI selection was reused after process death');
      webkit.messageHandlers.convoMIDI.postMessage({action:'test-send',data:[0x90,60,99]});
      await new Promise(resolve=>setTimeout(resolve,300));
      if(query('.midi-reading').textContent!=='MIDI入力を待っています') throw new Error('Disconnected MIDI still delivered notes');
      if(button('■ 停止')) throw new Error('Restored practice started automatically');
      button('▶ 演奏開始').click();
      await wait(()=>Number(query('[aria-label="演奏位置"]').value)>0,'explicit playback after process recovery');
      button('■ 停止').click();
      emit({passed:true,checks:['visible navigation and six-control score page','saved practice and mute survive actual Web Content termination','native recovery button reopens app','MIDI is disconnected','input and transport do not restart automatically','explicit playback works after recovery']});
    }
  } catch(error) { emit({passed:false,error:String(error)}); }
})();
