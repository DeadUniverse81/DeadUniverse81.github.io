// ---- Tracks: add new entries here (see README) ----
const TRACKS = [
  { title: "Rewritten by Light", year: 2026, cover: "assets/covers/rewritten_by_light.jpg", preview: "assets/tracks/rewritten_by_light.mp3",
    links: { /* spotify:"", youtube:"", bandcamp:"" */ } },
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
document.getElementById('enter').onclick = () => { setMuted(false); document.getElementById('descent').scrollIntoView({ behavior: 'smooth' }); };
muteBtn.onclick = () => setMuted(!muted);

// ---- Web Audio analyser hook: window.DU.analyser (AnalyserNode of the playing track) ----
window.DU = window.DU || {};
const _srcs = new WeakMap(); let _ctx;
function hookAnalyser(a) { try {
  _ctx = _ctx || new (window.AudioContext || window.webkitAudioContext)(); _ctx.resume();
  if (!DU.analyser) { DU.analyser = _ctx.createAnalyser(); DU.analyser.fftSize = 2048; DU.analyser.connect(_ctx.destination); DU.ctx = _ctx; }
  if (!_srcs.has(a)) { const s = _ctx.createMediaElementSource(a); s.connect(DU.analyser); _srcs.set(a, s); }
  DU.current = a;
} catch (e) { console.warn('analyser unavailable', e); } }

// ---- Music list ----
const LABELS = { spotify: 'Spotify', youtube: 'YouTube', bandcamp: 'Bandcamp', apple: 'Apple Music', soundcloud: 'SoundCloud' };
let current = null;
const wrap = document.getElementById('tracks');
TRACKS.forEach(t => {
  const el = document.createElement('article'); el.className = 'track';
  const links = Object.entries(t.links || {}).filter(([, u]) => u);
  el.innerHTML = (t.cover ? `<img src="${t.cover}" alt="${t.title} cover" loading="lazy">` : `<div class="nocover"></div>`) +
    `<div class="meta"><h3>${t.title}</h3><div class="year">${t.year || ''}</div>` +
    `<div class="links">${links.length ? links.map(([k, u]) => `<a href="${u}" target="_blank" rel="noopener">${LABELS[k] || k}</a>`).join('') : '<span class="soon">Links coming soon</span>'}</div></div>`;
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
      trackOn = true; document.body.classList.add('track-playing'); fadeTo(0, 800); b.textContent = 'Pause'; };
    a.onpause = a.onended = () => { b.textContent = 'Play'; if (current === a) { trackOn = false; document.body.classList.remove('track-playing');
      if (!muted && ambOk) { amb.play().catch(() => {}); fadeTo(target(), 1500); } } };
    b.onclick = () => a.paused ? a.play() : a.pause();
    const p = document.createElement('div'); p.className = 'player'; p.append(b, bar, tm);
    el.querySelector('.meta').appendChild(p);
  }
  wrap.appendChild(el);
});

// ---- Dust particles ----
const c = document.getElementById('dust'), x = c.getContext('2d'); let P = [], W, H;
function size() { const d = Math.min(devicePixelRatio || 1, 3840 / Math.max(1, c.offsetWidth)); W = c.width = c.offsetWidth * d; H = c.height = c.offsetHeight * d;
  P = Array.from({ length: Math.round(W * H / 25000) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + .3, v: Math.random() * .25 + .05, a: Math.random() * .5 + .1, p: Math.random() * 6 })); }
addEventListener('resize', size); size();
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
(function f(t) { x.clearRect(0, 0, W, H);
  for (const q of P) { if (!still) { q.y += q.v; q.x += Math.sin(t / 4000 + q.p) * .15; if (q.y > H) q.y = 0; }
    x.globalAlpha = q.a * (0.6 + 0.4 * Math.sin(t / 2000 + q.p)); x.fillStyle = '#e8e2d4'; x.beginPath(); x.arc(q.x, q.y, q.r, 0, 7); x.fill(); }
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
      to = .22 + Math.random() * .16 * amp + (Math.random() < .06 ? .12 * amp : 0);
      tk = 1 + (Math.random() - .5) * .14 * amp; tr = (Math.random() - .5) * 6 * amp; next = t + 40 + Math.random() * 120; }
    o += (to - o) * .25; k += (tk - k) * .2; r += (tr - r) * .15;
    sf.style.opacity = o.toFixed(3); sf.style.transform = `scale(${k.toFixed(3)}) rotate(${r.toFixed(2)}deg)`;
    requestAnimationFrame(f);
  })(0);
})();

// ---- Hero lightning (inside cross window only) ----
// Music playing: flashes on bass hits from assets/bass_hits.json (synced to amb.currentTime).
// Before ENTER / no hits file: rare random lightning. Muted after ENTER: none.
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
  if (force) { fl.style.opacity = .4; al.style.opacity = .18; return; }
  let hits = null, idx = 0, lastT = 0, entered = false;
  fetch('assets/bass_hits.json').then(r => r.json()).then(d => { hits = d.hits || []; if (!hits.length) hits = null; }).catch(() => {});
  document.getElementById('enter').addEventListener('click', () => { entered = true; });
  const synced = () => hits && ambOk && !amb.paused && !muted;
  function strike() {
    const n = Math.random() < .35 ? (Math.random() < .4 ? 3 : 2) : 1; let t = 0;
    for (let i = 0; i < n; i++) { setTimeout(() => pulse(.16 + Math.random() * .24, 100 + Math.random() * 300), t); t += 60 + Math.random() * 140; }
  }
  (function loop() { setTimeout(() => {
    // random only when music isn't driving it: before ENTER, or if hits/audio unavailable (but never when muted after ENTER)
    if (!synced() && (!entered || ((!hits || !ambOk) && !muted))) strike();
    loop(); }, 9000 + Math.random() * 12000); })();
  function seek(t) { idx = 0; while (idx < hits.length && hits[idx].t < t) idx++; }
  (function tick() {
    if (synced()) {
      const t = amb.currentTime;
      if (t < lastT - 0.5 || t > lastT + 1) seek(t); // loop wrap or seek
      lastT = t;
      while (idx < hits.length && hits[idx].t <= t) {
        const h = hits[idx++];
        if (t - h.t < 0.12) { pulse(.14 + .4 * h.s, 140 + 200 * h.s); spark(h.s); if (dbg) console.log(`HIT t=${h.t} s=${h.s} at=${t.toFixed(3)}`); }
      }
    } else if (hits && ambOk) { lastT = amb.currentTime; seek(lastT); }
    requestAnimationFrame(tick);
  })();
})();
