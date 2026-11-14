// Qualified on-site plays against a local Abacus mock.
// Production Abacus is host-blocked. This never increments live counters.
// At the end only mock play-*-e1 keys are cleared. Likes and visits are left as they are.
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const S = require('../stats-policy.js');
const SITE = 8771;
const MOCK = 8772;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const shotDir = path.join(os.tmpdir(), 'du-play-shots');
fs.mkdirSync(shotDir, { recursive: true });
const requests = [];
const values = new Map();
let failPlayGets = false;
const failures = [];

function fail(message) { failures.push(message); console.error('FAIL ' + message); }

function startMock() {
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    requests.push(url);
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
    res.setHeader('access-control-allow-headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const parts = url.split('/').filter(Boolean);
    const op = parts[0];
    const key = decodeURIComponent(parts.slice(2).join('/'));
    if ((op !== 'get' && op !== 'hit') || parts[1] !== S.NS) { res.writeHead(400); res.end('no'); return; }
    if (failPlayGets && op === 'get' && key.startsWith('play-')) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unavailable' }));
      return;
    }
    if (op === 'hit') values.set(key, (values.get(key) || 0) + 1);
    if (!values.has(key)) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Key not found' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ value: values.get(key) }));
  });
  return new Promise(resolve => server.listen(MOCK, '127.0.0.1', () => resolve(server)));
}

function startSite() {
  return spawn('python3', ['-m', 'http.server', String(SITE), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
}

async function waitFor(url) {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('not up ' + url);
}

function launchChrome(port, profile) {
  return spawn('/usr/local/bin/google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--host-resolver-rules=MAP abacus.jasoncameron.dev 127.0.0.1:9',
    '--autoplay-policy=no-user-gesture-required',
    '--no-first-run', '--no-default-browser-check', 'about:blank'
  ], { stdio: 'ignore' });
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
    return list.find(t => t.type === 'page');
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

async function poll(cdp, expression, accept, ms) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < ms) {
    last = await evalValue(cdp, expression);
    if (accept(last)) return last;
    await new Promise(r => setTimeout(r, 100));
  }
  return last;
}

function playHits(key) {
  return requests.filter(u => u === `/hit/${S.NS}/${key}`).length;
}

const HELPERS = `(() => {
  window.__fake = () => {
    const audio = {
      paused: false, seeking: false, ended: false, currentTime: 0, playbackRate: 1, readyState: 4,
      listeners: {},
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      dispatch(type) { (this.listeners[type] || []).forEach(fn => fn()); }
    };
    return audio;
  };
  window.__drive = (audio, seconds) => {
    audio.paused = false; audio.seeking = false; audio.ended = false; audio.playbackRate = 1;
    audio.dispatch('playing');
    const steps = Math.round(seconds / 0.25);
    for (let i = 0; i < steps; i++) {
      audio.currentTime = Math.round((audio.currentTime + 0.25) * 1000) / 1000;
      audio.dispatch('timeupdate');
    }
  };
  window.__bind = title => { const audio = window.__fake(); const ok = DU.bindOnsitePreview(audio, title); return { audio, ok }; };
  return true;
})()`;

function playHitCount(key) { return playHits(key); }

async function waitHits(key, n, ms) {
  const start = Date.now();
  let count = playHitCount(key);
  while (count < n && Date.now() - start < ms) {
    await new Promise(r => setTimeout(r, 40));
    count = playHitCount(key);
  }
  return count;
}

const api = `window.DU_COUNTER_API='http://127.0.0.1:${MOCK}'; window.alert=()=>{}; window.confirm=()=>true;`;
const mock = await startMock();
const site = startSite();
const chromes = [];
await waitFor(`http://127.0.0.1:${SITE}/index.html`);

try {
  failPlayGets = true;
  const down = await runCase(9341, fs.mkdtempSync(path.join(os.tmpdir(), 'du-play-down-')), api, `http://127.0.0.1:${SITE}/?scroll=music`);
  chromes.push(down.chrome);
  const downState = await poll(down.cdp, `[...document.querySelectorAll('.playstat')].map(n => n.dataset.state + ':' + n.querySelector('.pc').textContent).join('|')`, s => s && s.includes('unavailable') && !s.includes('loading'), 15000);
  console.log('UNAVAILABLE', downState);
  const downInfo = await evalValue(down.cdp, `({
    states: [...document.querySelectorAll('.playstat')].map(n => ({ state: n.dataset.state, text: n.querySelector('.pc').textContent, label: n.getAttribute('aria-label'), tag: n.tagName })),
    likes: [...document.querySelectorAll('.like .lc')].map(n => n.textContent),
    prod: false
  })`);
  if (!downInfo.states.length || downInfo.states.some(s => s.state !== 'unavailable' || s.text !== '' || !s.label.includes('unavailable') || s.tag !== 'SPAN')) fail('backend failure was shown as a number: ' + JSON.stringify(downInfo.states));
  if (downInfo.likes.some(t => t !== '0')) fail('like counts changed while plays were unavailable');
  if (playHits('play-rewritten-by-light-e1')) fail('unavailable page hit a play counter');
  if (down.cdp.urls.some(u => u.includes('abacus.jasoncameron.dev'))) fail('unavailable page reached production');
  down.chrome.kill('SIGKILL'); down.cdp.ws.close();
  failPlayGets = false;

  requests.length = 0;
  const guest = await runCase(9342, fs.mkdtempSync(path.join(os.tmpdir(), 'du-play-guest-')), api, `http://127.0.0.1:${SITE}/?scroll=music`);
  chromes.push(guest.chrome);
  const ready = await poll(guest.cdp, `[...document.querySelectorAll('.playstat.ok')].length + ':' + (document.querySelector('.playstat .pc') || {}).textContent`, s => s && s.startsWith('8:') && s.endsWith(':0'), 15000);
  console.log('READY', ready);
  if (ready !== '8:0') fail('play counts did not show a real zero: ' + ready);
  const ident = await poll(guest.cdp, `window.DU && DU.identity && DU.identity.resolved ? 'yes' : ''`, s => s === 'yes', 12000);
  if (ident !== 'yes') {
    await evalValue(guest.cdp, `DUStats.deliverIdentity(window, DUStats.identityDetail({ resolved: true, isAdmin: false, signedIn: false }))`);
    console.log('IDENTITY injected guest after Firebase did not resolve');
  } else console.log('IDENTITY resolved by the page');
  await evalValue(guest.cdp, HELPERS);

  const wired = await evalValue(guest.cdp, `({
    previews: DU.onsitePreviews.length,
    ambient: DU.onsitePreviews.some(p => p.audio && p.audio.id === 'ambient'),
    teaser: !!document.querySelector('.lk-play:not([hidden])'),
    teaserTitles: DU.onsitePreviews.map(p => p.title).filter(t => /traveller/i.test(t || '')),
    teaserCard: (() => {
      const card = document.querySelector('#exclusive .lockcard');
      return {
        title: (card && card.querySelector('h3') || {}).textContent || '',
        note: (card && card.querySelector('.lk-sub') || {}).textContent || '',
        player: !!(card && card.querySelector('.player')),
        loop: !!(card && card.querySelector('.player button.rep')),
        seek: !!(card && card.querySelector('input.seek')),
        like: !!(card && card.querySelector('.like')),
        playstat: !!(card && card.querySelector('.playstat')),
        src: (card && card.querySelector('.player') || {}).dataset.preview || '',
        cover: (card && card.querySelector('img') || {}).getAttribute ? (card.querySelector('img').getAttribute('src') || '') : '',
        alt: (card && card.querySelector('img') || {}).getAttribute ? (card.querySelector('img').getAttribute('alt') || '') : ''
      };
    })(),
    external: document.querySelectorAll('.track a[href*="spotify.com"], .track a[href*="youtube.com"]').length,
    keys: [...new Set([...document.querySelectorAll('.track')].map(el => el.dataset.playKey))].sort()
  })`);
  console.log('WIRED', JSON.stringify(wired));
  if (wired.previews !== 8 || wired.ambient || wired.teaser || wired.teaserTitles.length) fail('on-site binding was not limited to the eight previews');
  if (wired.teaserCard.title !== 'The Traveller' || !/alpha preview/i.test(wired.teaserCard.note) || !wired.teaserCard.player || !wired.teaserCard.loop || !wired.teaserCard.seek || wired.teaserCard.like || wired.teaserCard.playstat || wired.teaserCard.src !== 'assets/tracks/the_traveller.mp3' || wired.teaserCard.cover !== 'assets/covers/the_traveller.jpg' || wired.teaserCard.alt !== 'The Traveller cover art') fail('traveller teaser player ' + JSON.stringify(wired.teaserCard));
  if (wired.external < 8) fail('external links missing');
  if (wired.keys.length !== 8 || wired.keys.some(k => !k.startsWith('play-') || !k.endsWith('-e1'))) fail('play keys ' + wired.keys.join(','));

  async function layout(width, height, mobile, longTitle) {
    await guest.cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
    await guest.cdp.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height
    });
    const inner = await evalValue(guest.cdp, `document.documentElement.clientWidth`);
    if (Math.abs(inner - width) > 24) fail('viewport stayed ' + inner + ' instead of ' + width);
    return evalValue(guest.cdp, `(() => {
      const long = ${longTitle ? 'true' : 'false'};
      if (long) {
        const card = [...document.querySelectorAll('#tracks .track')].find(el => /Burn the World Down/.test((el.querySelector('h3') || {}).textContent || ''));
        if (card) {
          card.id = 'long-title-card';
          card.querySelector('h3').textContent = 'Burn the World Down: A Very Long Transmission Beyond The Monolith Gate';
        }
      }
      const rows = [...document.querySelectorAll('.track')].map(card => {
        const h = card.querySelector('h3').getBoundingClientRect();
        const p = card.querySelector('.playstat').getBoundingClientRect();
        const like = card.querySelector('.like').getBoundingClientRect();
        const row = card.querySelector('.tt-row').getBoundingClientRect();
        const cardBox = card.getBoundingClientRect();
        const hit = (a, b) => a.width > 1 && b.width > 1 && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
        return {
          title: card.querySelector('h3').textContent,
          overlapTitlePlay: hit(h, p), overlapTitleLike: hit(h, like), overlapPlayLike: hit(p, like),
          outside: p.right > cardBox.right + 1 || like.right > cardBox.right + 1 || p.left < cardBox.left - 1,
          playOutside: p.right > row.right + 2 || p.left < row.left - 2,
          label: card.querySelector('.playstat').getAttribute('aria-label')
        };
      });
      return { width: document.documentElement.clientWidth, rows };
    })()`);
  }

  async function shoot(name, selector) {
    await evalValue(guest.cdp, `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.classList.add('in');
      document.querySelectorAll('.reveal').forEach(n => n.classList.add('in'));
      return true;
    })()`);
    await evalValue(guest.cdp, `document.fonts && document.fonts.ready`);
    await new Promise(r => setTimeout(r, 200));
    const box = await evalValue(guest.cdp, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.max(0, r.left + scrollX), y: Math.max(0, r.top + scrollY), width: r.width, height: Math.min(r.height, 1100), opacity: getComputedStyle(document.querySelector(${JSON.stringify(selector)})).opacity }; })()`);
    if (!box || box.width < 40 || box.opacity === '0') fail('screenshot target ' + selector + ' ' + JSON.stringify(box));
    const shot = await guest.cdp.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.max(1, box.width), height: Math.max(1, box.height), scale: 1 }
    });
    fs.writeFileSync(path.join(shotDir, name), Buffer.from(shot.data, 'base64'));
  }

  const desktop = await layout(1280, 900, false, false);
  const mobile = await layout(390, 844, true, false);
  const narrow = await layout(320, 700, true, true);
  console.log('LAYOUT', desktop.width, mobile.width, narrow.width);
  for (const set of [desktop, mobile, narrow]) {
    if (set.rows.some(r => r.overlapTitlePlay || r.overlapTitleLike || r.overlapPlayLike || r.outside || r.playOutside)) fail('title/stat overlap at ' + set.width + ' ' + JSON.stringify(set.rows.filter(r => r.overlapTitlePlay || r.overlapTitleLike || r.overlapPlayLike || r.outside || r.playOutside)));
  }
  if (!narrow.rows.some(r => r.title.includes('Very Long Transmission'))) fail('long title was not applied');
  await layout(1280, 900, false, false);
  await shoot('desktop-latest.png', '#latest');
  await layout(390, 844, true, false);
  await shoot('mobile-latest.png', '#latestTracks .track');
  await layout(320, 700, true, true);
  await shoot('mobile-long-title.png', '#long-title-card');

  const real = await evalValue(guest.cdp, `(async () => {
    const item = DU.onsitePreviews.find(p => p.title === 'Lift Me Up');
    try { await item.audio.play(); } catch (e) { return { error: String(e && e.message || e) }; }
    const start = performance.now();
    await new Promise(resolve => {
      const timer = setInterval(() => {
        const snap = DU.playPassSnapshot('Lift Me Up');
        if ((snap && snap.listened >= 400) || performance.now() - start > 2500) { clearInterval(timer); resolve(); }
      }, 80);
    });
    const played = DU.playPassSnapshot('Lift Me Up');
    item.audio.pause();
    await new Promise(r => setTimeout(r, 700));
    const paused = DU.playPassSnapshot('Lift Me Up');
    const beforeSeek = item.audio.currentTime;
    item.audio.currentTime = beforeSeek + 20;
    await new Promise(r => setTimeout(r, 400));
    const sought = DU.playPassSnapshot('Lift Me Up');
    item.audio.pause();
    return { listened: played && played.listened, paused: paused && paused.listened, sought: sought && sought.listened, currentTime: item.audio.currentTime, beforeSeek };
  })()`);
  console.log('REAL', JSON.stringify(real));
  if (real && !real.error && real.listened > 0) {
    if (real.paused !== real.listened) fail('paused real audio kept accumulating ' + JSON.stringify(real));
    if (real.sought > real.paused + 1500) fail('seek counted skipped real audio ' + JSON.stringify(real));
    if (real.listened >= 30000) fail('short real listen qualified');
  }

  await layout(1280, 900, false, false);
  const scripted = await evalValue(guest.cdp, `(() => {
    const oblivion = __bind('The Oblivion');
    const again = DU.bindOnsitePreview(oblivion.audio, 'The Oblivion');
    __drive(oblivion.audio, 10);
    oblivion.audio.paused = true;
    oblivion.audio.currentTime += 25;
    oblivion.audio.dispatch('pause');
    oblivion.audio.dispatch('timeupdate');
    const afterPause = DU.playPassSnapshot('The Oblivion');
    const erased = __bind('Erased by Light');
    __drive(erased.audio, 10);
    erased.audio.paused = true;
    erased.audio.currentTime += 25;
    erased.audio.dispatch('pause');
    erased.audio.dispatch('timeupdate');
    const erasedPaused = DU.playPassSnapshot('Erased by Light').listened;
    erased.audio.paused = false;
    erased.audio.seeking = true;
    erased.audio.currentTime += 30;
    erased.audio.dispatch('seeking');
    erased.audio.seeking = false;
    erased.audio.dispatch('timeupdate');
    const erasedSought = DU.playPassSnapshot('Erased by Light').listened;
    __drive(erased.audio, 20);
    const ashes = __bind('Ashes in My Veins');
    __drive(ashes.audio, 29);
    const ashesShort = DU.playPassSnapshot('Ashes in My Veins').listened;
    __drive(ashes.audio, 1);
    const ashesFull = DU.playPassSnapshot('Ashes in My Veins').listened;
    return {
      doubleBind: again,
      oblivion: afterPause,
      erasedPaused, erasedSought,
      erasedFull: DU.playPassSnapshot('Erased by Light').listened,
      ashesShort, ashesFull
    };
  })()`);
  console.log('SCRIPTED', JSON.stringify(scripted));
  if (scripted.doubleBind !== false) fail('rebinding a card audio was accepted');
  if (scripted.oblivion.listened < 9000 || scripted.oblivion.listened > 11000) fail('double handlers or pause changed Oblivion ' + scripted.oblivion.listened);
  if (scripted.erasedPaused !== 10000 || scripted.erasedSought !== 10000 || scripted.erasedFull !== 30000) fail('pause/seek changed Erased ' + JSON.stringify(scripted));
  if (scripted.ashesShort !== 29000 || scripted.ashesFull !== 30000) fail('Ashes threshold ' + scripted.ashesShort + ' ' + scripted.ashesFull);
  if (playHits('play-the-oblivion-e1') || playHits('play-lift-me-up-e1')) fail('short listens were stored');
  const erasedHits = await waitHits('play-erased-by-light-e1', 1, 5000);
  const ashesHits = await waitHits('play-ashes-in-my-veins-e1', 1, 5000);
  if (erasedHits < 1 || ashesHits < 1) fail('qualified listens did not hit ' + erasedHits + ' ' + ashesHits);
  await new Promise(r => setTimeout(r, 200));
  if (playHits('play-erased-by-light-e1') !== 1 || playHits('play-ashes-in-my-veins-e1') !== 1) fail('qualified listen hit more than once');

  await evalValue(guest.cdp, `(() => { const a = DU.onsitePreviews.find(p => p.title === 'Ashes in My Veins' && p.audio.dispatch); __drive(a.audio, 10); return DU.playPassSnapshot('Ashes in My Veins').counted; })()`);
  await new Promise(r => setTimeout(r, 300));
  if (playHits('play-ashes-in-my-veins-e1') !== 1) fail('continuing the same pass counted again');
  const replay = await evalValue(guest.cdp, `(() => {
    const a = DU.onsitePreviews.find(p => p.title === 'Ashes in My Veins' && p.audio.dispatch);
    a.audio.paused = false; a.audio.currentTime = 0; a.audio.dispatch('timeupdate');
    const opened = DU.playPassSnapshot('Ashes in My Veins');
    __drive(a.audio, 30);
    return opened;
  })()`);
  console.log('REPLAY', JSON.stringify(replay));
  if (!replay || replay.listened !== 0 || replay.counted) fail('replay did not open a new pass');
  const ashesReplayHits = await waitHits('play-ashes-in-my-veins-e1', 2, 5000);
  if (ashesReplayHits !== 2) fail('replay hit count ' + ashesReplayHits);

  const dup = await evalValue(guest.cdp, `(() => {
    const card = document.querySelector('#latestTracks .track');
    const clone = card.cloneNode(true);
    document.getElementById('tracks').prepend(clone);
    DU.mountPlayStat(clone, 'Rewritten by Light');
    const audio = __bind('Rewritten by Light').audio;
    __drive(audio, 30);
    return {
      key: card.dataset.playKey,
      same: card.dataset.playKey === clone.dataset.playKey,
      texts: [card.querySelector('.playstat .pc').textContent, clone.querySelector('.playstat .pc').textContent]
    };
  })()`);
  const rewrittenHits = await waitHits('play-rewritten-by-light-e1', 1, 5000);
  const dupText = await poll(guest.cdp, `JSON.stringify([...document.querySelectorAll('[data-play-key="play-rewritten-by-light-e1"] .pc')].map(n => n.textContent))`, s => { try { return JSON.parse(s).length >= 2 && JSON.parse(s).every(t => t === '1'); } catch { return false; } }, 5000);
  const shown = JSON.parse(dupText || '[]');
  console.log('DUP', JSON.stringify(dup), rewrittenHits, JSON.stringify(shown));
  if (!dup.same || dup.key !== 'play-rewritten-by-light-e1') fail('duplicate cards did not share a key');
  if (rewrittenHits !== 1) fail('duplicate cards stored ' + rewrittenHits + ' plays');
  if (!Array.isArray(shown) || shown.length < 2 || shown.some(t => t !== '1')) fail('duplicate cards showed ' + JSON.stringify(shown));
  await layout(1280, 900, false, false);
  await shoot('desktop-counted.png', '#latest');
  await layout(390, 844, true, false);
  await shoot('mobile-counted.png', '#latestTracks .track');
  if (guest.cdp.urls.some(u => u.includes('abacus.jasoncameron.dev'))) fail('guest page reached production');

  const kept = await evalValue(guest.cdp, `(() => {
    const other = __bind('The Monolith');
    other.audio.paused = false;
    DUStats.deliverIdentity(window, DUStats.identityDetail({ resolved: true, isAdmin: true, signedIn: true }));
    __drive(other.audio, 30);
    return { admin: !!DU.identity.admin, listened: DU.playPassSnapshot('The Monolith').listened };
  })()`);
  await new Promise(r => setTimeout(r, 400));
  console.log('ADMIN', JSON.stringify(kept));
  if (!kept.admin || kept.listened < 30000 || playHits('play-the-monolith-e1')) fail('admin play was stored');

  guest.chrome.kill('SIGKILL'); guest.cdp.ws.close();

  const owner = await runCase(9343, fs.mkdtempSync(path.join(os.tmpdir(), 'du-play-owner-')), `
    ${api}
    localStorage.setItem('du_count_exclude', '1');
  `, `http://127.0.0.1:${SITE}/?scroll=music`);
  chromes.push(owner.chrome);
  await poll(owner.cdp, `document.querySelectorAll('.playstat.ok').length`, n => n === 8, 15000);
  const ownerIdent = await poll(owner.cdp, `window.DU && DU.identity && DU.identity.resolved ? 'yes' : ''`, s => s === 'yes', 8000);
  if (ownerIdent !== 'yes') await evalValue(owner.cdp, `DUStats.deliverIdentity(window, DUStats.identityDetail({ resolved: true, isAdmin: false, signedIn: false }))`);
  await evalValue(owner.cdp, HELPERS);
  const ownerDrive = await evalValue(owner.cdp, `(() => {
    const audio = __bind('b4bYLon').audio;
    __drive(audio, 30);
    return {
      excluded: DUStats.isBrowserExcluded(localStorage),
      admin: document.body.classList.contains('cm-admin'),
      listened: DU.playPassSnapshot('b4bYLon').listened,
      shown: document.querySelector('[data-play-key="play-b4bylon-e1"] .pc').textContent
    };
  })()`);
  await new Promise(r => setTimeout(r, 400));
  console.log('OWNER', JSON.stringify(ownerDrive));
  const ownerShown = await evalValue(owner.cdp, `document.querySelector('[data-play-key="play-b4bylon-e1"] .pc').textContent`);
  if (!ownerDrive.excluded || ownerDrive.admin || ownerDrive.listened < 30000 || ownerShown !== '0') fail('owner exclusion display failed ' + JSON.stringify(ownerDrive) + ' shown ' + ownerShown);
  if (playHits('play-b4bylon-e1')) fail('excluded browser stored a play');
  if (owner.cdp.urls.some(u => u.includes('abacus.jasoncameron.dev'))) fail('owner page reached production');
  owner.chrome.kill('SIGKILL'); owner.cdp.ws.close();

  const beforeClear = [...values.entries()];
  const playKeys = beforeClear.map(([k]) => k).filter(k => S.isPlaybackKey(k));
  const preserved = beforeClear.filter(([k]) => !S.isPlaybackKey(k));
  if (playKeys.some(k => k.startsWith('like-') || k.startsWith('alltime') || /^d\d/.test(k))) fail('a visitor key was classed as playback');
  let cleared = [];
  try { cleared = S.planPlaybackClear(playKeys); }
  catch (e) { fail('clear refused safe play keys: ' + e.message); }
  if (cleared.some(item => !S.isPlaybackKey(item.key) || item.to !== 0)) fail('clear plan was not play-only');
  for (const item of cleared) values.delete(item.key);
  for (const [k, v] of preserved) if (values.get(k) !== v) fail('clear changed ' + k);
  if ([...values.keys()].some(k => S.isPlaybackKey(k))) fail('a play key survived the clear');
  try { S.planPlaybackClear(playKeys.concat(['like-rewritten-by-light-e1'])); fail('clear accepted a like key'); }
  catch (e) { if (!String(e.message).includes('non-playback')) fail('unexpected clear error ' + e.message); }
  const ashes = await fetch(`http://127.0.0.1:${MOCK}/get/${S.NS}/play-ashes-in-my-veins-e1`);
  const like = await fetch(`http://127.0.0.1:${MOCK}/get/${S.NS}/like-rewritten-by-light-e1`);
  const alltime = values.get('alltime-e1');
  console.log('CLEARED', JSON.stringify({
    playKeys, ashes: ashes.status, like: like.status, alltime,
    remaining: [...values.keys()]
  }));
  if (ashes.status !== 404) fail('play key still readable after clear');
  if (like.status !== 404) fail('like key was created or removed unexpectedly');
  if ([...values.keys()].some(k => k.startsWith('play-'))) fail('mock still has play keys');
  const expected = {
    'play-erased-by-light-e1': 1,
    'play-ashes-in-my-veins-e1': 2,
    'play-rewritten-by-light-e1': 1
  };
  for (const [key, n] of Object.entries(expected)) {
    const was = beforeClear.find(([k]) => k === key);
    if (!was || was[1] !== n) fail(key + ' final pre-clear value ' + (was && was[1]));
  }
  for (const [key] of beforeClear) {
    if (key.startsWith('play-') && !expected[key]) fail('unexpected play key ' + key);
  }
} finally {
  for (const chrome of chromes) { try { chrome.kill('SIGKILL'); } catch {} }
  site.kill('SIGKILL');
  mock.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('PLAYBACK CHECK PASSED');
console.log('SHOTS', fs.readdirSync(shotDir).join(','));
