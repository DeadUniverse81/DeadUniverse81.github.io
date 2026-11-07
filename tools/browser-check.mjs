// Layout and counter-behavior check against a local mock of Abacus.
// Production Abacus is host-blocked. This never increments live counters.
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

const SITE = 8765;
const MOCK = 8766;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const requests = [];
const values = new Map();

function startMock() {
  const server = http.createServer((req, res) => {
    requests.push(req.url.split('?')[0]);
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
    res.setHeader('access-control-allow-headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const parts = req.url.split('?')[0].split('/').filter(Boolean);
    const op = parts[0];
    const key = decodeURIComponent(parts.slice(2).join('/'));
    if (op !== 'get' && op !== 'hit') { res.writeHead(400); res.end('no'); return; }
    if (op === 'hit') values.set(key, (values.get(key) || 0) + 1);
    if (!values.has(key)) { res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Key not found' })); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ value: values.get(key) }));
  });
  return new Promise(resolve => server.listen(MOCK, '127.0.0.1', () => resolve(server)));
}

function startSite() {
  const proc = spawn('python3', ['-m', 'http.server', String(SITE), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  return proc;
}

async function waitFor(url) {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('not up ' + url);
}

function launchChrome(port, profile) {
  const proc = spawn('/usr/local/bin/google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--host-resolver-rules=MAP abacus.jasoncameron.dev 127.0.0.1:9',
    '--no-first-run', '--no-default-browser-check', 'about:blank'
  ], { stdio: 'ignore' });
  return proc;
}

async function chromeReady(port) {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return; } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('chrome did not start');
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const urls = [];
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error('cdp socket failed')));
  });
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Network.requestWillBeSent') urls.push(msg.params.request.url);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  async function send(method, params = {}) {
    const msgId = ++id;
    const result = new Promise((resolve, reject) => {
      pending.set(msgId, msg => msg.error ? reject(new Error(method + ' ' + JSON.stringify(msg.error))) : resolve(msg.result));
    });
    ws.send(JSON.stringify({ id: msgId, method, params }));
    return result;
  }
  return { ws, send, urls, opened };
}

async function newPage(port) {
  let created;
  try { created = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }); }
  catch { created = null; }
  if (!created || !created.ok) created = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`);
  if (!created.ok) {
    const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
    const page = list.find(t => t.type === 'page');
    return page;
  }
  return created.json();
}

async function runCase(port, profile, prelude, url) {
  const chrome = launchChrome(port, profile);
  await chromeReady(port);
  const page = await newPage(port);
  const cdp = connect(page.webSocketDebuggerUrl);
  await cdp.opened;
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: prelude });
  await cdp.send('Page.navigate', { url });
  return { chrome, cdp };
}

async function evalValue(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function pollMode(cdp, accept, ms) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < ms) {
    last = await evalValue(cdp, `document.getElementById('visits') && document.getElementById('visits').dataset.countMode || ''`);
    if (accept(last)) return last;
    await new Promise(r => setTimeout(r, 250));
  }
  return last;
}

function hits() { return requests.filter(u => u.startsWith('/hit/')); }
function fail(message) { console.error('FAIL ' + message); process.exitCode = 1; }

const mock = await startMock();
const site = startSite();
await waitFor(`http://127.0.0.1:${SITE}/index.html`);
const api = `window.DU_COUNTER_API='http://127.0.0.1:${MOCK}';`;

try {
  const excluded = await runCase(9333, fs.mkdtempSync(path.join(os.tmpdir(), 'du-chrome-ex-')), `
    ${api}
    window.__confirms = [];
    window.confirm = (m) => { window.__confirms.push(String(m)); return true; };
    window.alert = () => {};
  `, `http://127.0.0.1:${SITE}/?du_owner=exclude`);
  const mode = await pollMode(excluded.cdp, m => m === 'excluded', 15000);
  const info = await evalValue(excluded.cdp, `({
    mode: document.getElementById('visits').dataset.countMode,
    epoch: document.getElementById('visits').dataset.epoch,
    today: document.getElementById('vToday').textContent,
    all: document.getElementById('vAll').textContent,
    hidden: document.getElementById('visits').hidden,
    note: (document.getElementById('count-note') || {}).textContent || '',
    admin: document.body.classList.contains('cm-admin'),
    exclude: localStorage.getItem('du_count_exclude'),
    search: location.search,
    confirms: window.__confirms,
    tracks: document.querySelectorAll('#tracks .track, #latestTracks .track').length,
    audio: !!document.querySelector('audio#ambient source[src*="ambient.mp3?v=53"]'),
    ogg: !!document.querySelector('audio#ambient source[src*="ambient.ogg?v=53"]'),
    nebula: !!document.querySelector('#vizbg img, #vizbg, .neb img'),
    community: !!document.querySelector('#community #chat-list') && !!document.querySelector('#ideas-list'),
    enter: document.getElementById('enter').textContent,
    likedOn: document.querySelectorAll('.like.on').length,
    counts: [...document.querySelectorAll('.like .lc')].map(n => n.textContent)
  })`);
  console.log('EXCLUDED', JSON.stringify(info));
  if (mode !== 'excluded' || info.mode !== 'excluded') fail('exclude mode was ' + mode);
  if (info.today !== '0' || info.all !== '0' || info.hidden) fail('excluded visitor totals were not shown as zero');
  if (info.note !== 'This browser is not counted') fail('missing owner note');
  if (info.admin) fail('opt-out conferred admin');
  if (info.exclude !== '1') fail('exclude flag was not stored');
  if (info.search.includes('du_owner')) fail('owner param was not stripped');
  if (!info.confirms.some(m => m.includes('does not grant admin access'))) fail('confirm copy drifted');
  if (info.tracks !== 8 || !info.audio || !info.ogg || !info.nebula || !info.community || info.enter !== 'ENTER') fail('layout/audio/community missing');
  if (info.likedOn !== 0) fail('a heart was filled before a recorded like');
  if (info.counts.some(c => c !== '0')) fail('like counts were not zero: ' + info.counts.join(','));
  await evalValue(excluded.cdp, `document.querySelector('.like').click()`);
  await new Promise(r => setTimeout(r, 800));
  const after = await evalValue(excluded.cdp, `document.querySelectorAll('.like.on').length`);
  if (after !== 0) fail('excluded like click filled a heart');
  if (hits().length) fail('excluded browser sent a hit: ' + hits().join(' '));
  if (excluded.cdp.urls.some(u => u.includes('abacus.jasoncameron.dev'))) fail('page contacted production Abacus');
  excluded.chrome.kill('SIGKILL');
  excluded.cdp.ws.close();

  requests.length = 0;
  values.clear();
  const cancelled = await runCase(9335, fs.mkdtempSync(path.join(os.tmpdir(), 'du-chrome-cancel-')), `
    ${api}
    window.confirm = () => false;
    window.alert = () => {};
  `, `http://127.0.0.1:${SITE}/?du_owner=exclude`);
  const cancelMode = await pollMode(cancelled.cdp, m => m === 'not-counted' || m === 'excluded' || m === 'recorded', 15000);
  const cancelInfo = await evalValue(cancelled.cdp, `({
    mode: document.getElementById('visits').dataset.countMode,
    exclude: localStorage.getItem('du_count_exclude'),
    admin: document.body.classList.contains('cm-admin'),
    note: !!document.getElementById('count-note') && !document.getElementById('count-note').hidden,
    search: location.search
  })`);
  console.log('CANCEL', cancelMode, JSON.stringify(cancelInfo));
  if (cancelMode !== 'not-counted' || cancelInfo.exclude || cancelInfo.admin || cancelInfo.note || cancelInfo.search.includes('du_owner')) fail('cancel did not stay a normal non-counted load');
  if (hits().length) fail('cancelled prompt sent a hit');
  cancelled.chrome.kill('SIGKILL');
  cancelled.cdp.ws.close();

  requests.length = 0;
  values.clear();
  const guest = await runCase(9334, fs.mkdtempSync(path.join(os.tmpdir(), 'du-chrome-guest-')), `
    ${api}
    localStorage.setItem('du_like-lift-me-up', '1');
    localStorage.setItem('du_seen', '20261107');
  `, `http://127.0.0.1:${SITE}/`);
  const guestMode = await pollMode(guest.cdp, m => m === 'recorded' || m === 'seen' || m === 'not-counted', 20000);
  const beforeClick = await evalValue(guest.cdp, `({
    mode: document.getElementById('visits').dataset.countMode,
    today: document.getElementById('vToday').textContent,
    all: document.getElementById('vAll').textContent,
    likedOn: document.querySelectorAll('.like.on').length,
    note: !!document.getElementById('count-note') && !document.getElementById('count-note').hidden,
    admin: document.body.classList.contains('cm-admin')
  })`);
  console.log('GUEST', guestMode, JSON.stringify(beforeClick));
  if (beforeClick.admin || beforeClick.note) fail('guest was marked owner or admin');
  if (beforeClick.likedOn !== 0) fail('stale du_like-* still filled a heart');
  if (guestMode === 'not-counted') {
    if (hits().length) fail('unresolved auth still sent a hit');
    console.log('GUEST auth did not resolve; fail-closed (no hit) confirmed');
  } else {
    if (guestMode !== 'recorded') fail('guest mode ' + guestMode);
    if (beforeClick.today !== '1' || beforeClick.all !== '1') fail('guest totals ' + beforeClick.today + ' / ' + beforeClick.all);
    const hitKeys = hits().map(u => u.split('/').pop());
    if (!hitKeys.includes('d' + await evalValue(guest.cdp, `DUStats.budapestDay()`) + '-e1')) fail('missing daily hit ' + hitKeys.join(','));
    if (!hitKeys.includes('alltime-e1')) fail('missing alltime hit');
    if (hitKeys.some(k => !k.endsWith('-e1'))) fail('hit a legacy key ' + hitKeys.join(','));
    const likeHitsBefore = hits().filter(u => u.includes('/like-')).length;
    await evalValue(guest.cdp, `document.querySelector('#latestTracks .like').click()`);
    await pollMode(guest.cdp, () => requests.some(u => u.includes('/hit/deaduniversemusic/like-rewritten-by-light-e1')), 8000);
    await new Promise(r => setTimeout(r, 300));
    const likeState = await evalValue(guest.cdp, `({
      on: document.querySelector('#latestTracks .like').classList.contains('on'),
      text: document.querySelector('#latestTracks .like .lc').textContent,
      stored: localStorage.getItem('du_like_e1_rewritten-by-light'),
      legacy: localStorage.getItem('du_like-lift-me-up')
    })`);
    console.log('LIKE', JSON.stringify(likeState));
    if (!likeState.on || likeState.text !== '1' || likeState.stored !== '1') fail('like did not record on the epoch key');
    if (likeState.legacy !== '1') fail('legacy like flag was rewritten');
    await evalValue(guest.cdp, `document.querySelector('#latestTracks .like').click()`);
    await new Promise(r => setTimeout(r, 500));
    const likeHits = hits().filter(u => u.includes('/hit/') && u.includes('like-'));
    if (likeHits.length !== likeHitsBefore + 1) fail('like hit count ' + likeHits.length);
    if (guest.cdp.urls.some(u => u.includes('abacus.jasoncameron.dev'))) fail('guest page contacted production Abacus');
  }
  guest.chrome.kill('SIGKILL');
  guest.cdp.ws.close();
} finally {
  site.kill('SIGKILL');
  mock.close();
}

if (process.exitCode) process.exit(process.exitCode);
console.log('BROWSER CHECK PASSED');
