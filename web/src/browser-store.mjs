import { validateState, clockNow } from './model.mjs';

export const DATABASE = 'wonangfei-web-v1';
export const MAX_BACKUP_BYTES = 16 * 1024 * 1024;
const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const completed = tx => {
  const done = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error ?? Error('保存已取消')); tx.onerror = () => {}; });
  // A request can fail before callers reach `await done`; keep its rejection handled.
  done.catch(() => {}); return done;
};

export function parseBackup(json) {
  if (new TextEncoder().encode(json).length > MAX_BACKUP_BYTES) throw Error('备份超过 16 MB');
  const parsed = JSON.parse(json);
  const state = parsed?.format === 'wonangfei-backup' ? parsed.state : parsed;
  validateState(state);
  // Imported legacy break timers are finalized, just as in the desktop store.
  const stamp = clockNow(state).getTime();
  for (const day of Object.values(state.days)) for (const interval of day.fish) if (interval.end === null) interval.end = Math.max(interval.start, stamp);
  return state;
}

export class BrowserStore {
  constructor(factory = globalThis.indexedDB) { this.factory = factory; this.expected = {}; this.tail = Promise.resolve(); this.locked = false; this.pending = 0; }
  async open() {
    if (!this.factory) throw Error('浏览器不支持本地数据库，请使用新版 Safari、Chrome 或 Edge');
    if (!this.database) this.database = new Promise((resolve, reject) => {
      const req = this.factory.open(DATABASE, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('records');
      req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result); };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(Error('请关闭其他窝囊费标签页后重试'));
    });
    return this.database;
  }
  async read() {
    const db = await this.open(), tx = db.transaction('records', 'readonly'), done = completed(tx), store = tx.objectStore('records');
    const keys = ['real', 'mode'];
    const values = await Promise.all(keys.map(key => request(store.get(key)))); await done;
    try {
      const validRevision = record => record && Number.isSafeInteger(record.revision) && record.revision > 0;
      if (values[1] !== undefined && !validRevision(values[1])) throw Error('档案版本记录无效');
      const record = values[0];
      if (record !== undefined && (!validRevision(record) || !record.state)) throw Error('存储记录结构无效');
      // The old demo key is an archive: never parse, copy, delete or promote it.
      const state = record ? parseBackup(JSON.stringify(record.state)) : null;
      this.expected = Object.fromEntries(keys.map((key, i) => [key, values[i]?.revision ?? 0]));
      return { state, legacyModeRetired: values[1]?.demo === true, platform: 'web', storage: '仅此浏览器 · 不上传个人记录' };
    } catch (error) { this.locked = true; throw Error(`原记录读取失败，已保留并阻止覆盖：${error.message}`); }
  }
  load() { return this.read(); }
  save(state) {
    const snapshot = structuredClone(state); validateState(snapshot);
    if (new TextEncoder().encode(JSON.stringify(snapshot)).length > MAX_BACKUP_BYTES) return Promise.reject(Error('记录超过 16 MB，请先导出备份'));
    this.pending++;
    const operation = this.tail.catch(() => {}).then(async () => {
      if (this.locked) throw Error('原记录不可覆盖，请先导出备份并刷新页面');
      const db = await this.open(), tx = db.transaction('records', 'readwrite'), done = completed(tx), store = tx.objectStore('records'), key = 'real';
      const [record, mode] = await Promise.all([request(store.get(key)), request(store.get('mode'))]);
      if ((record?.revision ?? 0) !== (this.expected[key] ?? 0) || (mode?.revision ?? 0) !== (this.expected.mode ?? 0)) {
        this.locked = true; tx.abort(); await done.catch(() => {});
        throw Error('其他标签页已更新记录，请先导出当前备份，再刷新读取最新记录');
      }
      const revision = (record?.revision ?? 0) + 1, modeRevision = (mode?.revision ?? 0) + 1;
      try {
        store.put({ state: snapshot, revision }, key);
        // Keep false for older readers, with the same atomic revision guard.
        store.put({ demo: false, revision: modeRevision }, 'mode');
      } catch (error) {
        // Synchronous quota/clone failures must also roll back an earlier put.
        tx.abort(); await done.catch(() => {}); throw error;
      }
      await done; this.expected[key] = revision; this.expected.mode = modeRevision;
      return true;
    });
    this.tail = operation.finally(() => { this.pending--; }); return this.tail;
  }
}

export function downloadBackup(state) {
  validateState(state);
  const payload = { format: 'wonangfei-backup', exportedAt: new Date().toISOString(), state };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url;
  link.download = `窝囊费-个人备份-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  return { canceled: false };
}
