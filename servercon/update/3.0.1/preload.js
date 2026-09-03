const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  browseExe: () => ipcRenderer.invoke('browse-exe'),
  launchGame: (exePath) => ipcRenderer.invoke('launch-game', exePath),
  setMusicMuted: (muted) => ipcRenderer.invoke('set-music-muted', muted),
  getPatchnotes: () => ipcRenderer.invoke('get-patchnotes'),
  checkNewPatchnotes: () => ipcRenderer.invoke('check-new-patchnotes'),
  markPatchnotesRead: (hash) => ipcRenderer.invoke('mark-patchnotes-read', hash),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (_event, data) => callback(data));
  },
  onThemeAssets: (callback) => {
    ipcRenderer.on('theme-assets', (_event, data) => callback(data));
  },
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
});
