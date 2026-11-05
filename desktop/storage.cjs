const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

class LocalStore {
  constructor(directory) { this.directory = directory; this.locked = new Set(); this.tail = Promise.resolve(); }
  async model() { return import(pathToFileURL(path.join(__dirname, '../src/model.mjs')).href); }
  file() { return path.join(this.directory, 'state.json'); }
  async read() {
    const target = this.file();
    try {
      const info = await fs.stat(target);
      if (info.size > 16 * 1024 * 1024) throw Error('本地记录过大');
      const state = JSON.parse(await fs.readFile(target, 'utf8'));
      (await this.model()).validateState(state);
      // Legacy intervals are finalized when read; there is no live break timer now.
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
    await this.tail;
    // Legacy mode metadata is read only for migration notice; its profile is never loaded.
    let retired = false;
    try { retired = JSON.parse(await fs.readFile(path.join(this.directory, 'mode.json'), 'utf8')).demo === true; } catch { }
    return { ...await this.read(), legacyModeRetired: retired };
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
    const target = this.file();
    if (this.locked.has(target)) throw Error('原记录读取失败，已阻止覆盖；请先保留原文件并检查');
    this.tail = this.tail.catch(() => {}).then(async () => {
      if (state.version >= 5) {
        try {
          const previous = JSON.parse(await fs.readFile(target, 'utf8'));
          for (const [version,name] of [[5,'state-before-daily-fees.json'],[6,'state-before-extra-income.json'],[7,'state-before-auto-attendance.json']]) {
            if(state.version<version||previous.version>=version)continue;
            try { await fs.copyFile(target, path.join(this.directory,name), constants.COPYFILE_EXCL); }
            catch(error) {
              if(error.code!=='EEXIST')throw error;
              const backup=JSON.parse(await fs.readFile(path.join(this.directory,name),'utf8'));
              (await this.model()).validateState(backup);
              if(backup.version>=version)throw Error('升级前备份已被占用，请保留原记录后核对备份');
            }
          }
        } catch(error) { if(error.code!=='ENOENT')throw error; }
      }
      await this.atomic(target, encoded);
      this.currentState = state;
    });
    return this.tail;
  }

}
module.exports = { LocalStore };
