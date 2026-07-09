'use strict';
const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

const BASE_URL = process.env.SPINLIST_URL || 'https://www.spinlist.co.uk';

let mainWin = null;
let gigWin = null;

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 460,
    height: 640,
    minWidth: 380,
    minHeight: 520,
    title: 'Spinlist Gig Window',
    backgroundColor: '#0a1228',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWin.loadFile('renderer.html');
  mainWin.on('closed', () => { mainWin = null; });
}

app.whenReady().then(() => {
  createMainWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

/* ---------------- Login ----------------
   We log in through the SHARED Electron session, so the auth cookie is stored
   in the session and automatically sent when the gig window loads gig.html. */
ipcMain.handle('login', async (evt, { email, password, remember }) => {
  try {
    const r = await fetch(BASE_URL + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: (data && data.error) || 'Login failed' };
    // Persist the returned auth cookie into Electron's default session so the
    // gig window (which loads a real page from the site) is authenticated.
    const setCookie = r.headers.get('set-cookie');
    if (setCookie) {
      const pair = setCookie.split(';')[0];
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const url = BASE_URL;
      try {
        // When "remember" is on, set an explicit expiry so Electron keeps the
        // cookie on disk across restarts; otherwise it's a session cookie that
        // disappears when the app quits.
        const cookieSpec = {
          url, name, value,
          domain: new URL(BASE_URL).hostname,
          path: '/', httpOnly: true, secure: BASE_URL.startsWith('https'),
        };
        if (remember) cookieSpec.expirationDate = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
        await session.defaultSession.cookies.set(cookieSpec);
      } catch (e) { /* non-fatal; the fetch below re-checks auth */ }
    }
    return { ok: true, user: data.user };
  } catch (e) {
    return { ok: false, error: 'Could not reach Spinlist. Check your connection.' };
  }
});

// On launch, check whether a remembered session cookie is still valid so the
// DJ can skip the login screen.
ipcMain.handle('restore-session', async () => {
  try {
    const cookies = await session.defaultSession.cookies.get({ url: BASE_URL });
    if (!cookies || !cookies.length) return { ok: false };
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const r = await fetch(BASE_URL + '/api/me', { headers: { Cookie: cookieHeader } });
    if (!r.ok) return { ok: false };
    const data = await r.json().catch(() => ({}));
    if (!data || !data.user) return { ok: false };
    return { ok: true, user: data.user };
  } catch (e) { return { ok: false, offline: true }; }
});

// Log out: tell the server and clear the stored cookie(s).
ipcMain.handle('logout', async () => {
  try {
    const cookies = await session.defaultSession.cookies.get({ url: BASE_URL });
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    await fetch(BASE_URL + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookieHeader } });
  } catch (_) {}
  try {
    const cookies = await session.defaultSession.cookies.get({ url: BASE_URL });
    for (const c of cookies) {
      await session.defaultSession.cookies.remove(BASE_URL, c.name);
    }
  } catch (_) {}
  return { ok: true };
});

// Fetch the DJ's weddings + events for the picker (uses the session cookie).
ipcMain.handle('list-gigs', async () => {
  async function getJSON(pathname) {
    try {
      const cookies = await session.defaultSession.cookies.get({ url: BASE_URL });
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      const r = await fetch(BASE_URL + pathname, { headers: { Cookie: cookieHeader } });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }
  const [w, e] = await Promise.all([getJSON('/api/weddings'), getJSON('/api/my-events')]);
  const weddings = (w && w.weddings || []).filter(x => !x.archived)
    .map(x => ({ kind: 'w', id: x.id, name: x.name, sub: x.coupleNames || '', date: x.weddingDate || null }));
  const events = (e && e.events || []).filter(x => !x.archived)
    .map(x => ({ kind: 'e', id: x.id, name: x.name, sub: x.type || '', date: x.eventDate || null }));
  return { ok: true, gigs: [...weddings, ...events] };
});

// Open (or re-point) the always-on-top gig window at the chosen gig.
ipcMain.handle('open-gig', async (evt, { kind, id, title }) => {
  const url = BASE_URL + '/gig.html?' + (kind === 'e' ? 'e=' : 'w=') + encodeURIComponent(id);
  if (gigWin && !gigWin.isDestroyed()) {
    gigWin.loadURL(url);
    gigWin.setAlwaysOnTop(true, 'screen-saver');
    gigWin.show();
    gigWin.focus();
    return { ok: true };
  }
  gigWin = new BrowserWindow({
    width: 400,
    height: 620,
    minWidth: 300,
    minHeight: 360,
    title: 'Gig · ' + (title || 'Spinlist'),
    backgroundColor: '#070b16',
    alwaysOnTop: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  // 'screen-saver' level floats above most full-screen-ish app windows.
  gigWin.setAlwaysOnTop(true, 'screen-saver');
  // Show on all workspaces (macOS) so it stays visible as you switch spaces.
  try { gigWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch (e) {}
  gigWin.loadURL(url);
  gigWin.on('closed', () => { gigWin = null; });
  return { ok: true };
});

// Toggle always-on-top from the main window (in case the DJ wants it off).
ipcMain.handle('set-on-top', async (evt, on) => {
  if (gigWin && !gigWin.isDestroyed()) {
    gigWin.setAlwaysOnTop(!!on, 'screen-saver');
    return { ok: true, on: !!on };
  }
  return { ok: false };
});
