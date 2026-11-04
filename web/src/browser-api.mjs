import { BrowserStore, downloadBackup } from './browser-store.mjs';
import { BUILD_INFO } from './build-info.mjs';
import { checkWebUpdate } from './update-policy.mjs';

export const browserStore = new BrowserStore();
export const browserApi = {
  about:async()=>BUILD_INFO,
  checkUpdate:()=>checkWebUpdate(BUILD_INFO),
  get pending() { return browserStore.pending; },
  load: () => browserStore.load(),
  save: state => browserStore.save(state), exportData: downloadBackup
};
