// Isolated real-IndexedDB checks; never opens the app's normal database.
exports.run = async js => js(`(async () => {
 const {BrowserStore} = await import('./browser-store.mjs');
 const m = await import('./model.mjs');
 const checks = [];
 const read = (db, key) => new Promise((resolve, reject) => {
  const q = db.transaction('records').objectStore('records').get(key);
  q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error);
 });
 for (const version of [4, 5]) {
  const factory = {open: (_name, n) => indexedDB.open('extra-failure-' + version + '-' + crypto.randomUUID(), n)};
  const b = new BrowserStore(factory);
  await b.load();
  const old = m.emptyState(new Date(m.at('2026-11-01', '08:00'))); old.version = version;
  await b.save(old);
  const db = await b.open();
  await new Promise((resolve, reject) => {
   const tx = db.transaction('records', 'readwrite');
   tx.objectStore('records').put({state: {version: 6}}, 'before-extra-income');
   tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
  });
  const before = await Promise.all(['real', 'mode', 'before-daily-fees', 'before-extra-income'].map(key => read(db, key)));
  const next = structuredClone(old);
  m.saveExtraIncome(next, {category: '红包', amount: 80, date: '2026-11-01'}, m.at('2026-11-01', '15:00'));
  let blocked = false;
  try { await b.save(next); } catch { blocked = true; }
  const after = await Promise.all(['real', 'mode', 'before-daily-fees', 'before-extra-income'].map(key => read(db, key)));
  if (!blocked || JSON.stringify(before) !== JSON.stringify(after)) throw Error('Format-' + version + ' atomic backup failure changed records');
  if (JSON.stringify((await b.load()).state) !== JSON.stringify(old)) throw Error('Original record changed');
  db.close(); checks.push('format-' + version + ' occupied invalid backup blocks upgrade atomically, including mode and earlier backup puts');
 }
 const b = new BrowserStore({open: (_name, n) => indexedDB.open('extra-upgrade-' + crypto.randomUUID(), n)});
 await b.load(); const old = m.emptyState(new Date(m.at('2026-11-01', '08:00'))); old.version = 4;
 await b.save(old); const next = structuredClone(old);
 m.saveExtraIncome(next, {category: '奖金', amount: 80, date: '2026-11-01'}, m.at('2026-11-01', '15:00'));
 await b.save(next); const db = await b.open();
 for (const key of ['before-daily-fees', 'before-extra-income']) {
  if (JSON.stringify((await read(db, key)).state) !== JSON.stringify(old)) throw Error(key + ' did not preserve original format 4');
 }
 if (JSON.stringify((await b.load()).state) !== JSON.stringify(next)) throw Error('Format-6 roundtrip failed');
 db.close(); checks.push('direct format-4 to format-6 upgrade atomically preserves both exact pre-upgrade backups');
 return {status: 'passed', checks, isolated: true, realIndexedDB: true};
})()`);
