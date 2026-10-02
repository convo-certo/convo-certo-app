void (async () => {
  const stage = new URL(location.href).searchParams.get('stage');
  const profile = new URL(location.href).searchParams.get('profile');
  const expected = { id: profile, title: 'Restart persistence fixture', xml: '<score-partwise><work><work-title>Saved memo</work-title></work></score-partwise>', session: { tempo: 72, beat: 8, seatId: 'clarinet' } };
  const access = (name, store, value) => new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(store, { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(store, value ? 'readwrite' : 'readonly');
      const operation = value ? transaction.objectStore(store).put(value) : transaction.objectStore(store).get(profile);
      transaction.oncomplete = () => { db.close(); resolve(operation.result); };
      transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  });
  try {
    const journal = { id: profile, practice: expected, totalPlayedSeconds: 35, sessionCount: 2 };
    if (stage === 'write') {
      if (localStorage.getItem('persistence-profile') !== null) throw new Error('Expected a fresh isolated profile');
      await access('convocerto-library', 'scores', expected);
      await access('convocerto-practice-journal', 'practice', journal);
      localStorage.setItem('persistence-profile', profile);
      localStorage.setItem('persistence-origin', location.origin);
    } else {
      if (localStorage.getItem('persistence-profile') !== profile || localStorage.getItem('persistence-origin') !== location.origin) throw new Error('Origin or localStorage changed across app launches');
      if (JSON.stringify(await access('convocerto-library', 'scores')) !== JSON.stringify(expected)) throw new Error('Score or rehearsal settings lost after restart');
      if (JSON.stringify(await access('convocerto-practice-journal', 'practice')) !== JSON.stringify(journal)) throw new Error('Practice history lost after restart');
    }
    webkit.messageHandlers.testResult.postMessage({ passed: true, stage, origin: location.origin, checks: ['library score and rehearsal settings', 'practice journal', 'localStorage', 'stable origin'] });
  } catch (error) { webkit.messageHandlers.testResult.postMessage({ passed: false, stage, error: String(error) }); }
})();
