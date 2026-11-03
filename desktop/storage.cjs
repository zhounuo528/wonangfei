const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

class LocalStore {
  constructor(directory) { this.directory = directory; this.locked = new Set(); this.tail = Promise.resolve(); }
  async model() { return import(pathToFileURL(path.join(__dirname, '../src/model.mjs')).href); }
  file(demo) { return path.join(this.directory, demo ? 'demo-state.json' : 'state.json'); }
  async read(demo = false) {
    const target = this.file(demo);
    try {
      const info = await fs.stat(target);
      if (info.size > 16 * 1024 * 1024) throw Error('本地记录过大');
      const state = JSON.parse(await fs.readFile(target, 'utf8'));
      (await this.model()).validateState(state);
      // Older Demo intervals are finalized when read; there is no live break timer now.
      const stamp = (await this.model()).clockNow(state).getTime();
      for (const day of Object.values(state.days)) for (const interval of day.fish) if (interval.end === null) interval.end = Math.max(interval.start, stamp);
      this.currentState = state;
      return { state, storage: this.directory };
    } catch (e) {
      if (e.code === 'ENOENT') return { state: null, storage: this.directory };
      this.locked.add(target);
      return { state: null, storage: this.directory, error: `本地记录读取失败（${e.message}）` };
    }
  }
  async load() {
    let demo = false;
    try { demo = JSON.parse(await fs.readFile(path.join(this.directory, 'mode.json'), 'utf8')).demo === true; } catch { /* New store uses real mode. */ }
    return this.read(demo);
  }
  async atomic(target, value) {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = `${target}.tmp`;
    const handle = await fs.open(temporary, 'w', 0o600);
    try { await handle.writeFile(value); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temporary, target);
  }
  async save(state) {
    (await this.model()).validateState(state);
    const encoded = JSON.stringify(state, null, 2);
    if (Buffer.byteLength(encoded) > 16 * 1024 * 1024) throw Error('记录超过 16 MB，请先导出备份');
    const target = this.file(!!state.demo);
    if (this.locked.has(target)) throw Error('原记录读取失败，已阻止覆盖；请先保留原文件并检查');
    this.tail = this.tail.catch(() => {}).then(async () => {
      await this.atomic(target, encoded);
      await this.atomic(path.join(this.directory, 'mode.json'), JSON.stringify({ demo: !!state.demo }));
      this.currentState = state;
    });
    return this.tail;
  }
  async loadReal() { await this.tail; const result = await this.read(false); if (!result.error) await this.atomic(path.join(this.directory, 'mode.json'), '{"demo":false}'); return result; }
}
module.exports = { LocalStore };
