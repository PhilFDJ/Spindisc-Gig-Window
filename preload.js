'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spinlist', {
  login: (email, password) => ipcRenderer.invoke('login', { email, password }),
  listGigs: () => ipcRenderer.invoke('list-gigs'),
  openGig: (kind, id, title) => ipcRenderer.invoke('open-gig', { kind, id, title }),
  setOnTop: (on) => ipcRenderer.invoke('set-on-top', on),
});
