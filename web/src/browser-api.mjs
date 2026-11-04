import { BrowserStore, downloadBackup } from './browser-store.mjs';

export const browserStore = new BrowserStore();
export const browserApi = {
  get pending() { return browserStore.pending; },
  load: () => browserStore.load(), loadReal: () => browserStore.loadReal(),
  save: state => browserStore.save(state), exportData: downloadBackup
};
