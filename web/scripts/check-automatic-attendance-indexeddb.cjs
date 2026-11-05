// Isolated real-IndexedDB checks; never opens the app's normal database.
exports.run = async js => js(`(async () => {
 const {BrowserStore} = await import('./browser-store.mjs');
 const m = await import('./model.mjs');
 const checks = [];
 const read = (db, key) => new Promise((resolve, reject) => {
  const q = db.transaction('records').objectStore('records').get(key);
  q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error);
 });
 for (const version of [3, 6]) {
  const factory = {open: (_name, n) => indexedDB.open('automatic-failure-' + version + '-' + crypto.randomUUID(), n)};
  const b = new BrowserStore(factory);
  await b.load();
  const old = m.emptyState(new Date(m.at('2026-11-01', '08:00'))); old.version = version; old.onboarded = true;
  await b.save(old);
  const db = await b.open();
  await new Promise((resolve, reject) => {
   const tx = db.transaction('records', 'readwrite');
   tx.objectStore('records').put({state: {version: 7}}, 'before-auto-attendance');
   tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
  });
  const before = await Promise.all(['real', 'mode', 'before-daily-fees', 'before-extra-income', 'before-auto-attendance'].map(key => read(db, key)));
  const next = structuredClone(old);
  m.configureAutomaticAttendance(next, true, m.at('2026-11-01', '15:00'));
  let blocked = false;
  try { await b.save(next); } catch { blocked = true; }
  const after = await Promise.all(['real', 'mode', 'before-daily-fees', 'before-extra-income', 'before-auto-attendance'].map(key => read(db, key)));
  if (!blocked || JSON.stringify(before) !== JSON.stringify(after)) throw Error('Format-' + version + ' atomic backup failure changed records');
  if (JSON.stringify((await b.load()).state) !== JSON.stringify(old)) throw Error('Original record changed');
  db.close(); checks.push('format-' + version + ' occupied invalid backup blocks upgrade atomically, including mode and earlier backup puts');
 }
 const b = new BrowserStore({open: (_name, n) => indexedDB.open('automatic-upgrade-' + crypto.randomUUID(), n)});
 await b.load(); const old = m.emptyState(new Date(m.at('2026-11-01', '08:00'))); old.version = 3; old.onboarded = true;
 await b.save(old); const next = structuredClone(old);
 m.configureAutomaticAttendance(next, true, m.at('2026-11-01', '15:00'));
 await b.save(next); const db = await b.open();
 for (const key of ['before-daily-fees', 'before-extra-income', 'before-auto-attendance']) {
  if (JSON.stringify((await read(db, key)).state) !== JSON.stringify(old)) throw Error(key + ' did not preserve original format 3');
 }
 if (JSON.stringify((await b.load()).state) !== JSON.stringify(next)) throw Error('Format-7 roundtrip failed');
 db.close(); checks.push('direct format-3 to format-7 upgrade atomically preserves all three exact pre-upgrade backups');
 // A tab that loaded an older record must not overwrite a newer format.
 const name = 'automatic-stale-tab-' + crypto.randomUUID();
 const factory = {open: (_name, n) => indexedDB.open(name, n)};
 const oldTab = new BrowserStore(factory), newTab = new BrowserStore(factory);
 await oldTab.load();
 const initial = m.emptyState(new Date(m.at('2026-11-01', '08:00')));
 initial.version = 4; initial.onboarded = true;
 await oldTab.save(initial); await newTab.load();
 const upgraded = structuredClone(initial);
 m.configureAutomaticAttendance(upgraded, true, m.at('2026-11-01', '15:00'));
 await newTab.save(upgraded);
 let staleBlocked = false;
 try { await oldTab.save(initial); } catch { staleBlocked = true; }
 if (!staleBlocked || JSON.stringify((await newTab.load()).state) !== JSON.stringify(upgraded)) throw Error('Stale tab overwrote upgraded state');
 const latestDb = await newTab.open();
 for (const key of ['before-daily-fees', 'before-extra-income', 'before-auto-attendance']) {
  if (JSON.stringify((await read(latestDb, key)).state) !== JSON.stringify(initial)) throw Error('Stale write changed ' + key);
 }
 (await oldTab.open()).close(); latestDb.close();
 checks.push('a stale format-4 tab cannot overwrite format-7 state or any pre-upgrade backup');
 return {status: 'passed', checks, isolated: true, realIndexedDB: true};
})()`);
