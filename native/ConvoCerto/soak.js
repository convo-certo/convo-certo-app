void (async () => {
  const emit = result => webkit.messageHandlers.testResult.postMessage(result);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const visible = element => !!element?.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
  const query = selector => [...document.querySelectorAll(selector)].find(visible);
  const button = text => [...document.querySelectorAll('button')].find(item => visible(item) && item.textContent === text && !item.disabled);
  const wait = async (read, description) => {
    emit({ progress: description });
    const deadline = performance.now() + 20000;
    while (performance.now() < deadline) { if (read()) return; await sleep(100); }
    throw new Error('Timed out: ' + description);
  };
  try {
    await wait(() => {
      const language = query('.language-switcher');
      if (!language) return false;
      if (document.documentElement.lang === 'ja' && language.value === 'ja') return true;
      language.value = 'ja';
      language.dispatchEvent(new Event('change', { bubbles: true }));
      return false;
    }, 'Japanese UI fixture');
    const seconds = window.__convoSoakSeconds;
    if (!Number.isInteger(seconds) || seconds < 20 || seconds > 7200) throw new Error('Invalid soak duration');
    const errors = [], active = new Set(), contexts = new Set();
    let started = 0, peak = 0, ended = 0, disconnected = 0;
    addEventListener('error', event => errors.push(event.message));
    addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
    const start = AudioBufferSourceNode.prototype.start;
    const disconnect = AudioBufferSourceNode.prototype.disconnect;
    AudioBufferSourceNode.prototype.disconnect = function (...args) {
      const result = disconnect.apply(this, args);
      if (!args.length && active.delete(this)) disconnected++;
      return result;
    };
    AudioBufferSourceNode.prototype.start = function (...args) {
      const result = start.apply(this, args);
      contexts.add(this.context); active.add(this); started++; peak = Math.max(peak, active.size);
      this.addEventListener('ended', () => { ended++; active.delete(this); }, { once: true });
      return result;
    };
    await wait(() => query('input[accept*=".mxl"]'), 'soak React ready');
    const response = await fetch('/scores/sample-duet.musicxml');
    if (!response.ok) throw new Error('Soak score missing');
    const transfer = new DataTransfer();
    transfer.items.add(new File([await response.text()], 'soak.musicxml', { type: 'application/xml' }));
    const input = query('input[accept*=".mxl"]');
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(() => button('▶ 演奏する'), 'soak score ready');
    button('このパートで練習').click();
    await wait(() => !query('.studio-part-picker'), 'confirmed performer part');
    button('設定').click();
    await wait(() => button('自分の入りから吹く'), 'visible loop practice controls');
    button('自分の入りから吹く').click();
    await wait(() => started > 0, 'soak audio started');
    const origin = performance.now();
    const sample = () => ({ elapsedSeconds: (performance.now() - origin) / 1000, started, active: active.size, peak, ended, disconnected,
      contexts: [...contexts].map(context => ({ state: context.state, time: context.currentTime })),
      beat: Number(query('[aria-label="演奏位置"]').value), statusText: query('.status-pill').textContent });
    let previous = sample();
    emit({ progress: 'soak-sample', sample: previous });
    while ((performance.now() - origin) / 1000 < seconds) {
      await sleep(Math.min(10000, seconds * 1000 - (performance.now() - origin)));
      const next = sample(), elapsed = next.elapsedSeconds - previous.elapsedSeconds;
      emit({ progress: 'soak-sample', sample: next });
      if (errors.length) throw new Error(errors.join('; '));
      if (next.contexts.length !== 1 || next.contexts[0].state !== 'running') throw new Error('Playback AudioContext unavailable');
      if (elapsed > 2 && next.contexts[0].time - previous.contexts[0].time < elapsed * 0.8) throw new Error('Audio clock stalled or fell behind wall time');
      if (elapsed >= 9 && next.started <= previous.started) throw new Error('No new source started during loop playback');
      if (peak > 64 || !Number.isFinite(next.beat)) throw new Error('Unbounded voices or invalid playback position');
      previous = next;
    }
    await wait(() => active.size > 0, 'soak active source before stop');
    const beforeStop = sample();
    button('■ 停止').click();
    await wait(() => active.size === 0 && query('.status-pill').textContent === '準備完了', 'soak stop and release');
    const afterStop = sample();
    if (afterStop.beat !== 0) throw new Error('Stop did not reset position');
    emit({ passed: true, elapsedSeconds: previous.elapsedSeconds, requestedSeconds: seconds, beforeStop, afterStop, errors,
      scope: 'Real-time WKWebView sample duet playback; no human performance, physical input or speaker measurement' });
  } catch (error) { emit({ passed: false, error: String(error) }); }
})();
