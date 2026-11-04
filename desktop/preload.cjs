const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('workday', Object.freeze({
  about:()=>ipcRenderer.invoke('app:about'),
  checkUpdate:includePrerelease=>ipcRenderer.invoke('app:check-update',includePrerelease),
  openDownloadPage:()=>ipcRenderer.invoke('app:open-downloads'),
  openCheckedRelease:()=>ipcRenderer.invoke('app:open-checked-release'),
  load: () => ipcRenderer.invoke('state:load'),
  save: state => ipcRenderer.invoke('state:save', state),
  exportData: state => ipcRenderer.invoke('state:export', state),
  pin: enabled => ipcRenderer.invoke('window:pin', enabled),
  windowMode: mini => ipcRenderer.invoke('window:mode', mini),
  collapseToTray: state => ipcRenderer.invoke('window:tray', state),
  onPresentation: callback => { if (typeof callback === 'function') ipcRenderer.on('window:presentation', (_event, mode) => callback(mode)); },
  onAction: callback => { if (typeof callback === 'function') ipcRenderer.on('app:action', (_event, action) => callback(action)); },
  onVisibility: callback => { if (typeof callback !== 'function') return; ipcRenderer.on('window:visibility', (_event, visible) => callback(visible === true)); }
}));
