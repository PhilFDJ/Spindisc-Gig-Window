'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spinlist', {
  login: (email, password, remember) => ipcRenderer.invoke('login', { email, password, remember }),
  restoreSession: () => ipcRenderer.invoke('restore-session'),
  logout: () => ipcRenderer.invoke('logout'),
  listGigs: () => ipcRenderer.invoke('list-gigs'),
  openGig: (kind, id, title) => ipcRenderer.invoke('open-gig', { kind, id, title }),
  setOnTop: (on) => ipcRenderer.invoke('set-on-top', on),
});
