// ---- Tracks: add new entries here (see README) ----
const TRACKS = [
  { stream: {"spotify": "https://open.spotify.com/album/6Y90VZKQp7oHzbVDsFJxqF", "apple": "https://music.apple.com/us/album/rewritten-by-light/6826907103?i=6826907104", "deezer": "https://www.deezer.com/track/4370428611", "all": "https://distrokid.com/hyperfollow/deaduniverse/rewritten-by-light"}, title: "Rewritten by Light", year: 2026, cover: "assets/covers/rewritten_by_light.jpg", preview: "assets/tracks/rewritten_by_light.mp3",
    links: { youtube: "https://www.youtube.com/watch?v=AVtK1Isjh_c", soundcloud: "https://soundcloud.com/refused-1/rewritten-by-light" } },
  { stream: {"spotify": "https://open.spotify.com/album/5fPeB4Pe5xrTWuNqfDFBQp", "apple": "https://music.apple.com/us/album/erased-by-light/6824302828?i=6824302829", "deezer": "https://www.deezer.com/track/4355829222", "all": "https://distrokid.com/hyperfollow/deaduniverse/erase-by-light"}, title: "Erased by Light", year: 2026, cover: "assets/covers/erased_by_light.jpg", preview: "assets/tracks/erased_by_light.mp3",
    links: { youtube: "https://www.youtube.com/watch?v=iFYff9YwKm0", soundcloud: "https://soundcloud.com/refused-1/erased-by-light-01-weekend-022" } },
  { stream: {"spotify": "https://open.spotify.com/album/1Ne4FZqvPvIixY5lD03g9v", "apple": "https://music.apple.com/us/album/ashes-in-my-veins/6823783637?i=6823783638", "deezer": "https://www.deezer.com/track/4353453552", "all": "https://distrokid.com/hyperfollow/deaduniverse/ashes-in-my-veins"}, title: "Ashes in My Veins", year: 2026, cover: "assets/covers/ashes_in_my_veins.jpg", preview: "assets/tracks/ashes_in_my_veins.mp3",
    links: { youtube: "https://www.youtube.com/watch?v=DcL-ZKZnhv0", soundcloud: "https://soundcloud.com/refused-1/ashes-in-my-veins-1-muse-eq" } },
  { stream: {"spotify": "https://open.spotify.com/album/0UfDsJZ857CiIa2zwdBdEm", "apple": "https://music.apple.com/us/album/the-monolith-alpha-version/1893746977?i=1893746979", "deezer": "https://www.deezer.com/track/3963317601", "all": "https://distrokid.com/hyperfollow/deaduniverse/the-monolith-alpha-version"}, title: "The Monolith", year: 2026, cover: "assets/covers/the_monolith.jpg", preview: "assets/tracks/the_monolith.mp3",
    links: { youtube: "https://www.youtube.com/watch?v=ovm1lZ5976s", soundcloud: "https://soundcloud.com/refused-1/the-monolith-alpha-version" } },
  { title: "The Oblivion", year: 2026, cover: "assets/covers/the_oblivion.jpg", preview: "assets/tracks/the_oblivion.mp3",
    links: { youtube: "https://www.youtube.com/watch?v=2Q01_zhEoL4", soundcloud: "https://soundcloud.com/refused-1/oblivion-alpha-version" } },
  { stream: {"spotify": "https://open.spotify.com/album/0TqRAtYOFdTVfnuDSHtxCI", "apple": "https://music.apple.com/us/album/b4bylon/1871736803?i=1871736805", "deezer": "https://www.deezer.com/track/3794861372", "all": "https://distrokid.com/hyperfollow/deaduniverse/b4bylon"}, title: "b4bYLon", year: 2026, cover: "assets/covers/b4bylon.jpg", preview: "assets/tracks/b4bylon.mp3",
    links: { youtube: "https://www.youtube.com/watch?v=ut_Tawd4zdE", soundcloud: "https://soundcloud.com/refused-1/b4bylon" } },
  { stream: {"spotify": "https://open.spotify.com/album/63igpIJXszhaylfHUn6m2p", "apple": "https://music.apple.com/us/album/burn-the-world-down/6789880414?i=6789880415", "deezer": "https://www.deezer.com/track/4147560652", "all": "https://distrokid.com/hyperfollow/deaduniverse/burn-the-world-down"}, title: "Burn the World Down", year: 2026, cover: "assets/covers/burn_the_world_down.jpg", preview: "assets/tracks/burn_the_world_down.mp3",
    links: { youtube: "https://www.youtube.com/watch?v=yRFk82_a2Kk", soundcloud: "https://soundcloud.com/refused-1/burn-the-world-down" } },
  { stream: {"spotify": "https://open.spotify.com/album/59Sz1HPFYhqaP9zeHtTOnC", "apple": "https://music.apple.com/us/album/lift-me-up-original-version/1883848895?i=1883848896", "deezer": "https://www.deezer.com/track/3890703341", "all": "https://distrokid.com/hyperfollow/deaduniverse/lift-me-up-original-version"}, title: "Lift Me Up", year: 2026, cover: "assets/covers/lift_me_up.jpg", preview: "assets/tracks/lift_me_up.mp3",
    links: { youtube: "https://www.youtube.com/watch?v=pqeeRgr7104", soundcloud: "https://soundcloud.com/refused-1/lift-me-up-original-version" } },
];

const amb = document.getElementById('ambient'), muteBtn = document.getElementById('mute');
const AMB_VOL = 0.5; let muted = true, ducked = false, trackOn = false, ambOk = true, fadeT;
amb.addEventListener('error', () => { ambOk = false; muteBtn.title = 'Ambient track not available yet'; });
function fadeTo(v, ms = 2000) {
  clearInterval(fadeT); const s = amb.volume, t0 = performance.now();
  fadeT = setInterval(() => { const k = Math.min(1, (performance.now() - t0) / ms);
    amb.volume = s + (v - s) * k; if (k >= 1) { clearInterval(fadeT); if (v === 0 && (muted || trackOn)) amb.pause(); } }, 30);
}
function target() { return muted || trackOn ? 0 : ducked ? AMB_VOL * 0.15 : AMB_VOL; }
function setMuted(m) {
  muted = m; muteBtn.textContent = m ? 'SOUND OFF' : 'SOUND ON'; muteBtn.classList.toggle('on', !m);
  if (!m && ambOk && !trackOn) { amb.volume = amb.paused ? 0 : amb.volume; amb.play().catch(() => { ambOk = false; }); }
  fadeTo(target(), m ? 800 : 1500);
}
const hideEnter = () => { const e = document.getElementById('enter'); if (e) { e.hidden = true; e.style.display = 'none'; } document.body.classList.add('entered'); };
document.getElementById('enter').onclick = () => { hideEnter(); document.body.classList.add('entered'); setMuted(false); document.getElementById('descent').scrollIntoView({ behavior: 'smooth' }); };
muteBtn.onclick = () => setMuted(!muted);

// ---- Web Audio analyser hook: window.DU.analyser (AnalyserNode of the playing track) ----
window.DU = window.DU || {};
const _srcs = new WeakMap(); let _ctx;
function hookAnalyser(a) { try {
  _ctx = _ctx || new (window.AudioContext || window.webkitAudioContext)(); _ctx.resume();
  if (!DU.analyser) { DU.analyser = _ctx.createAnalyser(); DU.analyser.fftSize = 2048; DU.analyser.smoothingTimeConstant = .75; DU.analyser.connect(_ctx.destination); DU.ctx = _ctx; }
  if (!_srcs.has(a)) { const s = _ctx.createMediaElementSource(a); s.connect(DU.analyser); _srcs.set(a, s); }
  DU.current = a;
} catch (e) { console.warn('analyser unavailable', e); } }

// ---- Music list ----
const SICONS = {"spotify": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm5 15.9a.7.7 0 0 1-1 .2c-2.7-1.6-6-2-10-1.1a.7.7 0 1 1-.3-1.4c4.3-1 8-.6 11 1.3.4.2.5.6.3 1zm1.4-3.1a.9.9 0 0 1-1.2.3c-3-1.9-7.7-2.4-11.3-1.3a.9.9 0 1 1-.5-1.7c4.1-1.2 9.2-.6 12.7 1.5.4.3.5.8.3 1.2zm.1-3.2C14.9 8.5 8.9 8.3 5.4 9.4a1.1 1.1 0 1 1-.6-2.1c4-1.2 10.7-1 14.8 1.5a1.1 1.1 0 0 1-1.1 1.8z\"/></svg>", "apple": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M20 2 8.5 4.3v11.2a3.2 3.2 0 1 0 1.8 2.9V8.6l7.9-1.6v6.6a3.2 3.2 0 1 0 1.8 2.9z\"/></svg>", "deezer": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M1 17h4v2H1zm6 0h4v2H7zm6 0h4v2h-4zm6 0h4v2h-4zM7 14h4v2H7zm6 0h4v2h-4zm6 0h4v2h-4zm-6-3h4v2h-4zm6 0h4v2h-4zm0-3h4v2h-4zm0-3h4v2h-4z\"/></svg>", "iheart": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 21.5 3.6 13.3A5.4 5.4 0 0 1 12 6.4a5.4 5.4 0 0 1 8.4 6.9z\"/></svg>", "all": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 0 1 0 16 8 8 0 0 1 0-16zm-1 4v3H8v2h3v3h2v-3h3v-2h-3V8z\"/></svg>"};
const SNAMES = {"spotify": "Spotify", "apple": "Apple Music", "deezer": "Deezer", "iheart": "iHeartRadio", "all": "All platforms"};
const ICONS = {"youtube": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1c.4-1.6.5-4.8.5-4.8s0-3.2-.5-4.8zM9.7 15.1V8.9l5.8 3.1z\"/></svg>", "soundcloud": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M1 14.5h.9v3.3H1zm1.8-1.3h.9v4.6h-.9zm1.8-.8h.9v5.4h-.9zm1.8-.4h.9v5.8h-.9zm1.8-1.4h.9v7.2h-.9zm1.8-1.5h.9v8.7h-.9zm1.8-1.3c.5-.2 1.1-.3 1.6-.3a5.1 5.1 0 0 1 5.1 4.6 2.9 2.9 0 0 1 .9-.1 3 3 0 0 1 0 6h-7.6z\"/></svg>"};
const LABELS = { spotify: 'Spotify', youtube: 'YouTube', bandcamp: 'Bandcamp', apple: 'Apple Music', soundcloud: 'SoundCloud' };
let current = null;
// v31: per-track like (abacus counter), one per browser per track, silent if the API is down
function addLike(el, title) {
  const API = 'https://abacus.jasoncameron.dev', NS = 'deaduniversemusic';
  const key = 'like-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), ls = 'du_' + key;
  let liked = false; try { liked = localStorage.getItem(ls) === '1'; } catch (e) {}
  const b = document.createElement('button'); b.className = 'like' + (liked ? ' on' : ''); b.type = 'button';
  b.setAttribute('aria-label', 'Like ' + title); b.setAttribute('aria-pressed', liked);
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.9 1.3 5.4 3.2 1.5-1.9 3.3-3.2 5.4-3.2 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z"/></svg><span class="lc"></span>';
  const lc = b.querySelector('.lc');
  const val = r => r.status === 404 ? { value: 0 } : r.ok ? r.json() : Promise.reject();
  const show = n => { if (typeof n === 'number') { lc.textContent = n.toLocaleString('en-US'); b.classList.add('ok'); } };
  fetch(`${API}/get/${NS}/${key}`, { cache: 'no-store' }).then(val).then(j => show(j.value)).catch(() => {});
  b.onclick = () => {
    if (b.classList.contains('on')) return; b.classList.add('on', 'pop'); b.setAttribute('aria-pressed', true);
    try { localStorage.setItem(ls, '1'); } catch (e) {}
    fetch(`${API}/hit/${NS}/${key}`, { cache: 'no-store' }).then(val).then(j => show(j.value)).catch(() => {});
    setTimeout(() => b.classList.remove('pop'), 500);
  };
  el.querySelector('.meta').appendChild(b);
}
const wrap = document.getElementById('tracks');
TRACKS.forEach(t => {
  const el = document.createElement('article'); el.className = 'track';
  const links = Object.entries(t.links || {}).filter(([, u]) => u);
  el.innerHTML = (t.cover ? `<img src="${t.cover}" alt="${t.title} cover" loading="lazy">` : `<div class="nocover"></div>`) +
    `<div class="meta"><h3>${t.title}</h3><div class="year">${t.year || ''}</div>` +
    `<div class="links">${links.length ? links.map(([k, u]) => `<a class="lnk" href="${u}" target="_blank" rel="noopener">${ICONS[k] || ''}<span>${LABELS[k] || k}</span></a>`).join('') : '<span class="soon">Links coming soon</span>'}</div>${t.stream ? `<div class="plat">${Object.entries(t.stream).filter(([k])=>k!=='all').map(([k,u])=>`<a class="pl" href="${u}" target="_blank" rel="noopener" title="${SNAMES[k]}" aria-label="${SNAMES[k]}">${SICONS[k]}</a>`).join('')}${t.stream.all?`<a class="lnk pall" href="${t.stream.all}" target="_blank" rel="noopener">${SICONS.all}<span>All platforms</span></a>`:''}</div>` : ''}</div>`;
  if (t.preview) {
    // Track player: intro fades out & pauses, body.track-playing set, window.DU.analyser exposed for visuals
    const a = new Audio(); a.preload = 'metadata'; a.src = t.preview;
    const b = document.createElement('button'); b.textContent = 'Play';
    const bar = document.createElement('input'); Object.assign(bar, { type: 'range', min: 0, max: 1000, value: 0, className: 'seek' });
    const tm = document.createElement('span'); tm.className = 'tm';
    const fmt = s => isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00';
    a.ontimeupdate = a.onloadedmetadata = () => { if (a.duration) bar.value = a.currentTime / a.duration * 1000; tm.textContent = `${fmt(a.currentTime)} / ${fmt(a.duration)}`; };
    bar.oninput = () => { if (a.duration) a.currentTime = bar.value / 1000 * a.duration; };
    a.onplay = () => { if (current && current !== a) current.pause(); current = a; hookAnalyser(a);
      trackOn = true; document.dispatchEvent(new CustomEvent('du:play', { detail: { cover: t.cover, el } })); document.body.classList.add('track-playing'); hideEnter(); fadeTo(0, 800); b.textContent = 'Pause'; };
    a.onpause = a.onended = () => { b.textContent = 'Play'; if (current === a) { trackOn = false; document.body.classList.remove('track-playing');
      if (!muted && ambOk) { amb.play().catch(() => {}); fadeTo(target(), 1500); } } };
    b.onclick = () => a.paused ? a.play() : a.pause();
    const rk = 'du-loop-' + t.title, rp = document.createElement('button'); rp.className = 'rep'; rp.type = 'button';
    rp.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 2l4 4-4 4V7H7a2 2 0 0 0-2 2v3H3V9a4 4 0 0 1 4-4h10zM7 22l-4-4 4-4v3h10a2 2 0 0 0 2-2v-3h2v3a4 4 0 0 1-4 4H7z"/></svg>';
    const setLoop = on => { a.loop = on; rp.classList.toggle('on', on); rp.setAttribute('aria-pressed', on); rp.title = rp.ariaLabel = on ? 'Repeat on' : 'Repeat off'; try { localStorage.setItem(rk, on ? '1' : '0'); } catch (e) {} };
    let lsv = null; try { lsv = localStorage.getItem(rk); } catch (e) {} setLoop(lsv === '1');
    rp.onclick = () => setLoop(!a.loop);
    const p = document.createElement('div'); p.className = 'player'; p.append(b, rp, bar, tm);
    el.querySelector('.meta').appendChild(p);
  }
  addLike(el, t.title);
  wrap.appendChild(el);
});

// ---- Dust particles ----
const c = document.getElementById('dust'), x = c.getContext('2d'); let P = [], W, H;
function size() { const d = Math.min(devicePixelRatio || 1, 3840 / Math.max(1, c.offsetWidth)); W = c.width = c.offsetWidth * d; H = c.height = c.offsetHeight * d;
  P = Array.from({ length: Math.round(W * H / (matchMedia('(pointer:coarse)').matches ? 18500 : 14000)) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + .3, v: Math.random() * .25 + .05, a: Math.random() * .5 + .1, p: Math.random() * 6 })); }
addEventListener('resize', size); size();
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FC = ['#e8e2d4', '#e6c46a', '#6fa8ff', '#e26a8a', '#7fe0c0', '#c9cdd6', '#b48cff'];
let PX = -1e4, PY = -1e4, PT = 0;
const ptr = (cx, cy) => { const r = c.getBoundingClientRect(), k = W / Math.max(1, r.width); PX = (cx - r.left) * k; PY = (cy - r.top) * k; PT = performance.now(); };
addEventListener('pointermove', e => ptr(e.clientX, e.clientY), { passive: true });
addEventListener('touchmove', e => { const t = e.touches[0]; if (t) ptr(t.clientX, t.clientY); }, { passive: true });
addEventListener('touchstart', e => { const t = e.touches[0]; if (t) ptr(t.clientX, t.clientY); }, { passive: true });
addEventListener('touchend', () => { PT = 0; }, { passive: true });
(function f(t) { x.clearRect(0, 0, W, H);
  const act = !still && performance.now() - PT < 2500 && PY > -50 && PY < H + 50, k = W / Math.max(1, c.offsetWidth), RA = 190 * k, R2 = RA * RA, HIT = 9 * k;
  for (const q of P) { q.vx = q.vx || 0; q.vy = q.vy || 0; q.c = q.c || 0;
    if (!still) { if (act) { const dx = PX - q.x, dy = PY - q.y, d2 = dx * dx + dy * dy;
        if (d2 < R2) { const d = Math.sqrt(d2) || 1, s = (1 - d / RA) * .09 * k; q.vx += dx / d * s; q.vy += dy / d * s;
          if (d < HIT && t - (q.ht || 0) > 700) { q.ht = t; q.c = q.c % (FC.length - 1) + 1; q.vx -= dx / d * 2.2 * k; q.vy -= dy / d * 2.2 * k; } } }
      q.vx *= .94; q.vy *= .94; q.y += q.v + q.vy; q.x += Math.sin(t / 4000 + q.p) * .15 + q.vx;
      if (q.y > H) q.y = 0; if (q.y < 0) q.y = H; if (q.x < 0) q.x += W; if (q.x > W) q.x -= W; }
    x.globalAlpha = (q.c ? Math.min(1, q.a + .35) : q.a) * (0.6 + 0.4 * Math.sin(t / 2000 + q.p)); x.fillStyle = FC[q.c]; x.beginPath(); x.arc(q.x, q.y, q.c ? q.r * 1.25 : q.r, 0, 7); x.fill(); }
  requestAnimationFrame(f); })(0);
// preview helper: ?scroll=music jumps instantly to a section
const sp = new URLSearchParams(location.search).get('scroll');
if (sp) { document.documentElement.style.scrollBehavior = 'auto'; document.getElementById(sp)?.scrollIntoView(); }

// ---- Spark shimmer ("zizegés"): always-on irregular flicker; gentle under reduced motion ----
(() => {
  const sf = document.querySelector('.sflick'); if (!sf) return;
  const amp = still ? .3 : 1; let o = .3, k = 1, r = 0, to = .3, tk = 1, tr = 0, next = 0;
  (function f(t) {
    if (t > next) { // new random target every 40-160 ms (irregular, not strobe)
      to = .22 + Math.random() * .16 * amp;
      tk = 1 + (Math.random() - .5) * .14 * amp; tr = (Math.random() - .5) * 6 * amp; next = t + 40 + Math.random() * 120; }
    o += (to - o) * .25; k += (tk - k) * .2; r += (tr - r) * .15;
    sf.style.opacity = o.toFixed(3); sf.style.transform = `scale(${k.toFixed(3)}) rotate(${r.toFixed(2)}deg)`;
    requestAnimationFrame(f);
  })(0);
})();

// ---- Hero lightning (inside cross window only) ----
// Music playing: flashes on bass hits from assets/bass_hits.json (synced to amb.currentTime).
// No random strikes: flashes fire only from the bass-hit map while the intro plays.
(() => {
  const fl = document.querySelector('.flash'), al = document.querySelector('.alit');
  if (!fl || still) return;
  const q = new URLSearchParams(location.search), force = q.get('flash'), dbg = q.has('debug');
  function pulse(peak, dur) {
    const o = { duration: dur, easing: 'cubic-bezier(.1,.9,.3,1)' };
    fl.animate([{ opacity: 0 }, { opacity: peak, offset: .05 }, { opacity: 0 }], o);
    al.animate([{ opacity: 0 }, { opacity: peak * .45, offset: .05 }, { opacity: 0 }], o);
  }
  const sg = document.querySelector('.sglow');
  function spark(s) { if (!sg) return;
    sg.animate([{ opacity: .3, scale: 1, filter: 'brightness(1)' }, { opacity: .45 + .5 * s, scale: 1 + .9 * s, filter: `brightness(${1 + .8 * s})`, offset: .06 }, { opacity: .3, scale: 1, filter: 'brightness(1)' }],
      { duration: 200 + 200 * s, easing: 'cubic-bezier(.1,.9,.3,1)', composite: 'replace' }); }
  const ml = document.querySelector('.mlogo');
  function logo(s) { if (!ml) return; const p = Math.min(1, .6 + .5 * s), gl = 10 + 24 * s, d = 'drop-shadow(0 0 0 rgba(90,0,8,0))';
    ml.animate([{ opacity: 0, filter: `brightness(1) ${d} ${d}` },
      { opacity: p, filter: `brightness(1.3) drop-shadow(0 0 ${gl * .4}px rgba(170,0,12,.95)) drop-shadow(0 0 ${gl * 1.3}px rgba(100,0,14,.85))`, offset: .08 },
      { opacity: p * .4, filter: `brightness(1) drop-shadow(0 0 4px rgba(120,0,10,.5)) drop-shadow(0 0 ${gl * .8}px rgba(70,0,10,.4))`, offset: .42 },
      { opacity: 0, filter: `brightness(1) ${d} ${d}` }],
      { duration: 900 + 900 * s, easing: 'cubic-bezier(.2,.7,.3,1)', composite: 'replace' }); }
  if (force) { fl.style.opacity = .4; al.style.opacity = .18; return; }
  let hits = null, idx = 0, lastT = 0, entered = false;
  fetch('assets/bass_hits.json?v=30', { cache: 'no-cache' }).then(r => r.json()).then(d => { hits = d.hits || []; if (!hits.length) hits = null; }).catch(() => {});
  document.getElementById('enter').addEventListener('click', () => { entered = true; });
  const synced = () => hits && ambOk && !amb.paused && !muted;
  // no random lightning: every flash comes only from the bass-hit map
  function seek(t) { idx = 0; while (idx < hits.length && hits[idx].t < t) idx++; }
  (function tick() {
    if (synced()) {
      const t = amb.currentTime;
      if (t < lastT - 0.5 || t > lastT + 1) seek(t); // loop wrap or seek
      lastT = t;
      while (idx < hits.length && hits[idx].t <= t) {
        const h = hits[idx++];
        if (t - h.t < 0.12) { window.__fl && __fl.push(['hit', h.t, +t.toFixed(3)]); pulse(.14 + .4 * h.s, 140 + 200 * h.s); spark(h.s); logo(h.s); if (dbg) console.log(`HIT t=${h.t} s=${h.s} at=${t.toFixed(3)}`); }
      }
    } else if (hits && ambOk) { lastT = amb.currentTime; seek(lastT); }
    requestAnimationFrame(tick);
  })();
})();

// ---- Track visualizer: full-screen log spectrum + bass flashes on the nebula ----
(() => {
  const cv = document.getElementById('viz'), g = cv.getContext('2d'), nf = document.querySelector('#vizbg .nf');
  let N = 96, bins, hBar = new Float32Array(N), peak = new Float32Array(N), pv = new Float32Array(N), rp = new Float32Array(96).fill(.3), av = new Float32Array(96), gpk = .05, W = 0, H = 0, avg = 0, last = 0, fl = 0, idle = 0, lastG = 0;
  function rs() { const d = Math.min(devicePixelRatio || 1, 3840 / Math.max(1, innerWidth)); W = cv.width = Math.round(innerWidth * d); H = cv.height = Math.round(innerHeight * d); N = Math.max(40, Math.min(96, Math.round(innerWidth / 14))); }
  addEventListener('resize', rs); rs();
  function frame(t) {
    requestAnimationFrame(frame);
    const on = document.body.classList.contains('track-playing'), an = DU.analyser;
    if (!on) { if (idle++ > 150) return; } else idle = 0;
    g.clearRect(0, 0, W, H);
    if (!an) return;
    if (!bins) bins = new Uint8Array(an.frequencyBinCount);
    if (on) an.getByteFrequencyData(bins); else for (let i = 0; i < bins.length; i++) bins[i] *= .9;
    const ny = DU.ctx.sampleRate / 2, hz = ny / bins.length;
    // bass onset 30-150 Hz
    let e = 0, n = 0; for (let i = Math.max(1, Math.floor(30 / hz)); i <= Math.ceil(150 / hz); i++) { e += bins[i]; n++; } e /= n * 255;
    avg += (e - avg) * .05;
    if (on && !still && e > avg * 1.18 + .04 && e > .35 && t - last > 140) { last = t; fl = Math.min(1, (e - avg) * 4 + .3); }
    if (on && !still && e > .58 && e > avg * 1.45 + .06 && t - lastG > 900) { lastG = t; document.dispatchEvent(new CustomEvent('du:bighit')); }
    fl *= .88; nf.style.opacity = fl.toFixed(3);
    const f0 = 70, f1 = 16500, bw = W / N, cy = H * .62;
    const grd = g.createLinearGradient(0, cy - H * .55, 0, cy);
    grd.addColorStop(0, '#fff'); grd.addColorStop(.5, '#d8d0c0'); grd.addColorStop(1, '#6a5a40');
    g.shadowColor = 'rgba(217,164,65,.6)'; g.shadowBlur = 18 * (W / 1920);
    let gmax = 0;
    for (let i = 0; i < N; i++) {
      const a = f0 * Math.pow(f1 / f0, i / N), b = f0 * Math.pow(f1 / f0, (i + 1) / N);
      let lo = Math.floor(a / hz), hi = Math.max(lo, Math.ceil(b / hz) - 1), m = 0;
      for (let j = lo; j <= hi && j < bins.length; j++) m = Math.max(m, bins[j]);
      // tilt (bass down, flat highs) + per-bar AGC: slow-decaying running peak per bar, coupled to the global peak
      const r = i / N, wt = r < .3 ? .5 + r / .3 * .4 : .9 + (r - .3) * .15;
      const q = Math.pow(m / 255, 1.7) * wt;
      rp[i] = Math.max(q, rp[i] * .9975, .02); gmax = Math.max(gmax, rp[i]);
      const nrm = Math.max(rp[i], gpk * .55) * 1.08, u = q / nrm;   // u ~ 1 only at a bar's recent peak
      av[i] += (q - av[i]) * .04; const tr = Math.min(1, Math.max(0, (q - av[i]) / (.3 * nrm)));
      let v = .6 * Math.min(1, u) + .38 * tr;   // sustained level ~40-60%, only fresh hits jump to the top
      hBar[i] = v > hBar[i] ? v : hBar[i] * .92 + v * .08;
      if (hBar[i] >= peak[i]) { peak[i] = hBar[i]; pv[i] = 0; } else { pv[i] += .0009; peak[i] = Math.max(0, peak[i] - pv[i]); }
      const h = Math.min(1, hBar[i]) * H * .55, x = i * bw + bw * .18, w = bw * .64;
      if (h > 0.5) { const mg = g.createLinearGradient(x, 0, x + w, 0);
        mg.addColorStop(0, '#5a3d0e'); mg.addColorStop(.18, '#b8862b'); mg.addColorStop(.36, '#f7e3a1'); mg.addColorStop(.44, '#fffaf0'); mg.addColorStop(.52, '#e8c063'); mg.addColorStop(.78, '#a0711f'); mg.addColorStop(1, '#4a320b');
        g.globalAlpha = .88; g.fillStyle = mg; g.fillRect(x, cy - h, w, h); g.globalAlpha = 1; g.shadowBlur = 0;
        g.fillStyle = grd; g.globalCompositeOperation = 'multiply'; g.fillRect(x, cy - h, w, h); g.globalCompositeOperation = 'source-over';
        g.fillStyle = 'rgba(255,248,225,.75)'; g.fillRect(x, cy - h, w, Math.min(h, 2.5 * (W / 1920)));
        g.shadowBlur = 18 * (W / 1920); }
      g.fillStyle = 'rgba(217,164,65,.18)'; g.fillRect(x, cy + 2, w, h * .35); // reflection
      g.fillStyle = 'rgba(255,236,190,.9)'; g.fillRect(x, cy - Math.min(1, peak[i]) * H * .55 - 3 * (W / 1920), w, 2 * (W / 1920));
    }
    gpk = Math.max(gmax, gpk * .998); g.shadowBlur = 0;
  }
  window.__vz = () => [N, hBar];
  requestAnimationFrame(frame);
})();

// v31: visitor counter (abacus.jasoncameron.dev), one hit per browser per Budapest day, silent on failure
(() => {
  const box = document.getElementById('visits'); if (!box || !window.fetch) return;
  const API = 'https://abacus.jasoncameron.dev', NS = 'deaduniversemusic';
  let day; try { day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(new Date()).replace(/-/g, ''); } catch (e) { day = new Date().toISOString().slice(0, 10).replace(/-/g, ''); }
  let seen = null; try { seen = localStorage.getItem('du_seen'); } catch (e) {}
  const fresh = seen !== day;
  const get = k => fetch(`${API}/${fresh ? 'hit' : 'get'}/${NS}/${k}`, { cache: 'no-store' })
    .then(r => r.status === 404 ? { value: 0 } : r.ok ? r.json() : Promise.reject()).then(j => typeof j.value === 'number' ? j.value : Promise.reject());
  Promise.all([get('d' + day), get('alltime')]).then(([d, a]) => {
    if (fresh) try { localStorage.setItem('du_seen', day); } catch (e) {}
    const f = n => n.toLocaleString('en-US');
    document.getElementById('vToday').textContent = f(Math.max(d, 1)); document.getElementById('vAll').textContent = f(Math.max(a, d, 1));
    box.hidden = false;
  }).catch(() => { box.hidden = true; });
})();

// ---- v41 FX: fog dive, floating cover, living spark, glitch title ----
(() => {
  const rm = matchMedia('(prefers-reduced-motion: reduce)').matches, B = document.body;
  // 1. fog flowing down from the hero into the Music section
  const ds = document.getElementById('descent'), fog = document.createElement('div'); fog.className = 'fog'; fog.setAttribute('aria-hidden', 'true');
  ds && ds.prepend(fog);
  let fq = false;
  const fogU = () => { fq = false; if (!ds) return; const r = ds.getBoundingClientRect(), h = innerHeight;
    const p = Math.min(1, Math.max(0, (h - r.top) / (h + r.height * .6)));   // 0 at hero, 1 deep in descent
    fog.style.opacity = (Math.sin(Math.PI * Math.min(1, p * 1.25)) * .95).toFixed(3);
    fog.style.transform = rm ? 'none' : `translate3d(0,${(p * 18).toFixed(2)}vh,0) scale(${(1 + p * .08).toFixed(3)})`; };
  addEventListener('scroll', () => { if (!fq) { fq = true; requestAnimationFrame(fogU); } }, { passive: true }); addEventListener('resize', fogU); fogU();
  // 2. floating cover behind the analyzer
  const fc = document.createElement('div'); fc.id = 'fcover'; fc.setAttribute('aria-hidden', 'true');
  const vb = document.getElementById('vizbg'); vb.after(fc);
  let curEl = null;
  document.addEventListener('du:play', e => { const d = e.detail; curEl = d.el; if (d.cover) fc.style.backgroundImage = `url("${d.cover}")`; });
  // 3. spark follows the pointer (eased); touch: device tilt or idle drift
  const st = document.querySelector('.stage'); let tx = 0, ty = 0, x = 0, y = 0, ptr = false, tilt = false;
  if (st && !rm) {
    const R = () => Math.min(innerWidth, innerHeight) * .018;
    addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; ptr = true;
      tx = (e.clientX / innerWidth - .5) * 2 * R(); ty = (e.clientY / innerHeight - .5) * 2 * R(); }, { passive: true });
    addEventListener('deviceorientation', e => { if (e.gamma == null) return; tilt = true;
      tx = Math.max(-1, Math.min(1, e.gamma / 30)) * R(); ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30)) * R(); }, { passive: true });
    (function f(t) { if (!ptr && !tilt) { tx = Math.sin(t / 3100) * R() * .6; ty = Math.cos(t / 4300) * R() * .45; }
      x += (tx - x) * .045; y += (ty - y) * .045;
      if (st.getBoundingClientRect().bottom > 0) { st.style.setProperty('--sx', x.toFixed(2) + 'px'); st.style.setProperty('--sy', y.toFixed(2) + 'px'); }
      requestAnimationFrame(f); })(0);
  }
  // 4. glitch the playing title on big bass hits
  document.addEventListener('du:bighit', () => { if (rm || !curEl || !B.classList.contains('track-playing')) return;
    const h = curEl.querySelector('h3'); if (!h) return; h.dataset.t = h.textContent;
    h.classList.remove('glitch'); void h.offsetWidth; h.classList.add('glitch'); setTimeout(() => h.classList.remove('glitch'), 130); });
})();
// ===== v44 luxury =====
// Teaser config: set src (e.g. 'assets/tracks/teaser.mp3') to enable the play button on the Coming soon card.
const TEASER = { src: '' };
(() => {
  const rm = matchMedia('(prefers-reduced-motion: reduce)').matches, fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
  // teaser
  const tb = document.querySelector('.lk-play');
  if (tb && TEASER.src) { const a = new Audio(TEASER.src); a.preload = 'none'; tb.hidden = false;
    tb.onclick = () => { if (a.paused) { a.play(); tb.textContent = '❚❚ Teaser'; } else { a.pause(); tb.textContent = '▶ Teaser'; } };
    a.onended = () => tb.textContent = '▶ Teaser'; }
  // portrait chrome overlay aspect
  const wp = document.querySelector('.wmp'), cp = document.querySelector('.chrome-p');
  const ar = () => { if (wp.naturalWidth) cp.style.setProperty('--wr', wp.naturalWidth + '/' + wp.naturalHeight); };
  wp.complete ? ar() : wp.addEventListener('load', ar);
  // reveal on scroll
  const io = 'IntersectionObserver' in window && !rm ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }) : null;
  document.querySelectorAll('.track,#music h2,#exclusive h2,.lockcard').forEach((el, i) => { if (!io) return; el.classList.add('reveal'); el.style.transitionDelay = (el.classList.contains('track') ? (i % 3) * .12 : 0) + 's'; io.observe(el); });
  // custom cursor
  const cu = document.getElementById('cur');
  if (fine && cu) { document.documentElement.classList.add('cur'); let mx = -99, my = -99, cx = -99, cy = -99;
    addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; mx = e.clientX; my = e.clientY; cu.classList.add('on');
      cu.classList.toggle('big', !!e.target.closest?.('a,button,input,.track')); }, { passive: true });
    document.addEventListener('mouseleave', () => cu.classList.remove('on'));
    (function f() { cx += (mx - cx) * .18; cy += (my - cy) * .18; cu.style.transform = `translate3d(${cx}px,${cy}px,0)` + (cu.classList.contains('big') ? ' scale(1.22) rotate(-6deg)' : ''); requestAnimationFrame(f); })(); }
  // momentum wheel scrolling (desktop mouse wheel only; touch stays native)
  if (fine && !rm) { let ty = scrollY, cyv = scrollY, run = false;
    const max = () => document.documentElement.scrollHeight - innerHeight;
    addEventListener('wheel', e => { if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (e.target.closest?.('input[type=range]')) return;
      e.preventDefault(); if (!run) { ty = cyv = scrollY; }
      ty = Math.max(0, Math.min(max(), ty + e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1)));
      if (!run) { run = true; document.documentElement.style.scrollBehavior = 'auto';
        (function f() { cyv += (ty - cyv) * .1; if (Math.abs(ty - cyv) < .5) { cyv = ty; run = false; }
          scrollTo(0, cyv); if (run) requestAnimationFrame(f); else document.documentElement.style.scrollBehavior = ''; })(); } }, { passive: false }); }
})();
