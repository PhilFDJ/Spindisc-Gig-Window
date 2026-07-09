'use strict';
const $ = (id) => document.getElementById(id);
let GIGS = [];

/* ---------- login ---------- */
$('login-btn').addEventListener('click', doLogin);
$('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

// On launch, try a remembered session so the DJ skips the login screen.
tryRestoreSession();
async function tryRestoreSession() {
  const msg = $('login-msg');
  if (msg) { msg.className = 'msg muted'; msg.textContent = 'Checking your saved sign-in…'; }
  let r;
  try { r = await window.spinlist.restoreSession(); } catch (_) { r = { ok: false }; }
  if (r && r.ok && r.user) {
    enterPicker(r.user);
  } else if (msg) {
    msg.textContent = '';
  }
}

function enterPicker(user) {
  $('login-who').textContent = user && (user.name || user.email) ? ('Signed in as ' + (user.name || user.email)) : 'Signed in';
  $('login-panel').classList.add('hide');
  $('picker-panel').classList.remove('hide');
  loadGigs();
}

async function doLogin() {
  const email = $('email').value.trim();
  const password = $('password').value;
  const remember = $('remember-me') ? $('remember-me').checked : true;
  const msg = $('login-msg');
  if (!email || !password) { msg.className = 'msg err'; msg.textContent = 'Enter your email and password.'; return; }
  $('login-btn').disabled = true;
  msg.className = 'msg muted'; msg.textContent = 'Signing in…';
  const r = await window.spinlist.login(email, password, remember);
  $('login-btn').disabled = false;
  if (!r.ok) { msg.className = 'msg err'; msg.textContent = r.error || 'Login failed.'; return; }
  msg.className = 'msg ok'; msg.textContent = '';
  enterPicker(r.user);
}

/* ---------- gig picker ---------- */
$('refresh-btn').addEventListener('click', loadGigs);
$('signout-btn').addEventListener('click', async () => {
  try { await window.spinlist.logout(); } catch (_) {}
  $('picker-panel').classList.add('hide');
  $('login-panel').classList.remove('hide');
  $('password').value = '';
  $('login-msg').textContent = '';
});
$('gig-search').addEventListener('input', renderGigs);

async function loadGigs() {
  const list = $('gig-list');
  list.innerHTML = '<p class="msg muted">Loading your gigs…</p>';
  const r = await window.spinlist.listGigs();
  GIGS = (r && r.gigs) || [];
  renderGigs();
}

function fmtDate(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch (e) { return ''; }
}

function renderGigs() {
  const list = $('gig-list');
  const q = ($('gig-search').value || '').trim().toLowerCase();
  const items = GIGS.filter(g => !q || (g.name || '').toLowerCase().includes(q) || (g.sub || '').toLowerCase().includes(q));
  if (!items.length) {
    list.innerHTML = '<p class="msg muted">' + (GIGS.length ? 'No gigs match your search.' : 'No gigs found. Create an event or wedding on spinlist.co.uk first.') + '</p>';
    return;
  }
  list.innerHTML = '';
  items.forEach(g => {
    const div = document.createElement('div');
    div.className = 'gig';
    const meta = [g.sub, fmtDate(g.date)].filter(Boolean).join(' · ');
    div.innerHTML =
      '<div style="min-width:0"><div class="n">' + escapeHtml(g.name || 'Untitled') + '</div>' +
      (meta ? '<div class="s">' + escapeHtml(meta) + '</div>' : '') + '</div>' +
      '<span class="tag ' + (g.kind === 'e' ? 'ev' : '') + '">' + (g.kind === 'e' ? 'Event' : 'Wedding') + '</span>';
    div.style.cursor = 'pointer';
    div.addEventListener('click', () => openGig(g));
    list.appendChild(div);
  });
}

async function openGig(g) {
  const msg = $('picker-msg');
  msg.className = 'msg muted';
  msg.textContent = 'Opening ' + (g.name || 'gig') + '…';
  const r = await window.spinlist.openGig(g.kind, g.id, g.name);
  if (r && r.ok) {
    msg.className = 'msg ok';
    msg.textContent = '✓ Gig window open and floating on top. Drag it beside your decks. Tap another gig to switch.';
  } else {
    msg.className = 'msg err';
    msg.textContent = 'Could not open the gig window.';
  }
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
