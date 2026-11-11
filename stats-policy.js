// Visit, like, and on-site play counting policy. Pure logic, no DOM.
// Song likes, visits, and qualified on-site plays are Abacus integers
// (namespace deaduniversemusic). They are not Firebase community data.
// COUNTER_EPOCH is independent of the ?v= cache buster: bump it only when the
// displayed visit and like counters should start over. Play keys share the
// epoch but are new names, so adding them does not reset visits or likes.
(function (factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.DUStats = api;
    api.installIdentityGate(window);
  }
})(function () {
  'use strict';

  var EPOCH = 'e1';
  var NS = 'deaduniversemusic';
  var DEFAULT_API = 'https://abacus.jasoncameron.dev';
  var EXCLUDE_KEY = 'du_count_exclude';
  // One qualified on-site listen. Media time, not wall-clock and not seeks.
  var PLAY_QUALIFY_MS = 30000;
  var PLAY_MAX_STEP_MS = 1250;
  var PLAY_RETRY_MS = 15000;
  var EXCLUDE_CONFIRM = 'Exclude this browser from DeadUniverse visit, like, and on-site play counts? You will still see the stats. This does not grant admin access. Set this once in each browser you use (this PC and your phone are separate).';
  var INCLUDE_CONFIRM = 'Count this browser again in DeadUniverse visit, like, and on-site play totals? This does not change admin access.';
  var STORAGE_FAIL = 'This browser could not save that choice. Visits from this browser may still count.';

  function apiBase() {
    if (typeof window !== 'undefined' && typeof window.DU_COUNTER_API === 'string' && window.DU_COUNTER_API) return window.DU_COUNTER_API.replace(/\/$/, '');
    return DEFAULT_API;
  }

  function slug(title) {
    return String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function likeKey(title) { return 'like-' + slug(title) + '-' + EPOCH; }
  function legacyLikeKey(title) { return 'like-' + slug(title); }
  function playKey(title) { return 'play-' + slug(title) + '-' + EPOCH; }
  function isPlaybackKey(key) {
    return typeof key === 'string' && new RegExp('^play-[a-z0-9]+(?:-[a-z0-9]+)*-' + EPOCH + '$').test(key);
  }
  function assertPlaybackKey(key) {
    if (!isPlaybackKey(key)) throw new Error('refusing non-playback key ' + key);
    return key;
  }
  function planPlaybackClear(keys) {
    var list = Array.isArray(keys) ? keys : [];
    return list.map(function (key) {
      assertPlaybackKey(key);
      return { key: key, action: 'clear', to: 0 };
    });
  }
  function dayKey(day) { return 'd' + day + '-' + EPOCH; }
  function legacyDayKey(day) { return 'd' + day; }
  function alltimeKey() { return 'alltime-' + EPOCH; }
  function legacyAlltimeKey() { return 'alltime'; }
  function likeStorageKey(title) { return 'du_like_' + EPOCH + '_' + slug(title); }
  function legacyLikeStorageKey(title) { return 'du_' + legacyLikeKey(title); }
  function visitHitStorageKey() { return 'du_visit_hit_' + EPOCH; }

  function counterUrl(op, key) {
    if (op !== 'get' && op !== 'hit' && op !== 'info') throw new Error('unsupported counter op');
    if (!/^[A-Za-z0-9_.-]{3,64}$/.test(key)) throw new Error('refusing counter key');
    return apiBase() + '/' + op + '/' + NS + '/' + key;
  }

  function installIdentityGate(root) {
    root.DU = root.DU || {};
    if (!root.DU.identityReady) {
      root.DU.identity = { resolved: false, admin: false, signedIn: false };
      root.DU.identityReady = new Promise(function (resolve) { root.DU._resolveIdentity = resolve; });
    }
  }

  // Admin comes only from the caller (the Firebase admins/{uid} read).
  // The browser exclusion flag is intentionally not an input.
  function identityDetail(input) {
    var resolved = !!(input && input.resolved);
    return {
      resolved: resolved,
      admin: resolved && !!(input && input.isAdmin),
      signedIn: !!(input && input.signedIn)
    };
  }

  function deliverIdentity(root, detail) {
    root.DU = root.DU || {};
    root.DU.identity = detail;
    if (detail && detail.resolved && typeof root.DU._resolveIdentity === 'function') {
      var resolve = root.DU._resolveIdentity;
      root.DU._resolveIdentity = null;
      resolve(detail);
    }
    return detail;
  }

  function isBrowserExcluded(storage) {
    try { return !!storage && storage.getItem(EXCLUDE_KEY) === '1'; } catch (e) { return false; }
  }

  function shouldRecord(state) {
    if (!state || state.browserExcluded) return false;
    if (!state.authResolved) return false;
    if (state.isAdmin) return false;
    return true;
  }

  function privileges(state) {
    var admin = !!(state && state.isAdmin);
    return { isAdmin: admin, canModerate: admin, recordStats: shouldRecord(state), viewStats: true };
  }

  function coerceOp(op, allowHit) {
    if (op === 'hit' && allowHit) return 'hit';
    return 'get';
  }

  function selectOp(op, state) {
    return coerceOp(op, shouldRecord(state));
  }

  function interpretResponse(status, body) {
    if (status === 404) return { ok: true, value: 0, missing: true };
    if (status !== 200 || !body || typeof body.value !== 'number' || !isFinite(body.value)) return { ok: false, value: null, missing: false };
    return { ok: true, value: Math.max(0, Math.trunc(body.value)), missing: false };
  }

  function readLiked(storage, title) {
    try { return !!storage && storage.getItem(likeStorageKey(title)) === '1'; } catch (e) { return false; }
  }

  function writeLiked(storage, title) {
    storage.setItem(likeStorageKey(title), '1');
  }

  function planLikeClick(state) {
    if (!shouldRecord(state) || state.alreadyLiked) return { op: 'none', persist: false };
    return { op: 'hit', persist: true };
  }

  function readHitNames(storage, day) {
    var raw = null;
    try { raw = storage ? storage.getItem(visitHitStorageKey()) : null; } catch (e) { return []; }
    if (!raw || raw.slice(0, day.length + 1) !== day + ':') return [];
    return raw.slice(day.length + 1).split(',').filter(Boolean);
  }

  function writeHitNames(storage, day, names) {
    var uniq = [];
    names.forEach(function (n) { if (uniq.indexOf(n) < 0) uniq.push(n); });
    storage.setItem(visitHitStorageKey(), uniq.length ? day + ':' + uniq.join(',') : '');
  }

  function claimHit(storage, day, name) {
    var names = readHitNames(storage, day);
    if (names.indexOf(name) >= 0) return false;
    try { writeHitNames(storage, day, names.concat(name)); } catch (e) { return false; }
    return true;
  }

  function unclaimHit(storage, day, name) {
    try { writeHitNames(storage, day, readHitNames(storage, day).filter(function (n) { return n !== name; })); } catch (e) {}
  }

  function planVisitOps(state) {
    var record = shouldRecord(state);
    var done = state.hitNames || [];
    return [
      { name: 'day', key: dayKey(state.day), op: record && done.indexOf('day') < 0 ? 'hit' : 'get' },
      { name: 'all', key: alltimeKey(), op: record && done.indexOf('all') < 0 ? 'hit' : 'get' }
    ];
  }

  function budapestDay(date) {
    var d = date || new Date();
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(d).replace(/-/g, '');
    } catch (e) {
      return d.toISOString().slice(0, 10).replace(/-/g, '');
    }
  }

  function applyOwnerQuery(search, storage, confirm, notify) {
    var params = typeof search === 'string' ? new URLSearchParams(search) : search;
    var v = params.get('du_owner');
    if (v !== 'exclude' && v !== 'include') return { strip: false, stored: false, action: 'none' };
    var ok = !!(confirm && confirm(v === 'exclude' ? EXCLUDE_CONFIRM : INCLUDE_CONFIRM));
    var stored = false;
    if (ok && v === 'exclude') {
      try { storage.setItem(EXCLUDE_KEY, '1'); stored = storage.getItem(EXCLUDE_KEY) === '1'; }
      catch (e) { if (notify) notify(STORAGE_FAIL); }
    } else if (ok && v === 'include') {
      try { storage.removeItem(EXCLUDE_KEY); stored = storage.getItem(EXCLUDE_KEY) !== '1'; }
      catch (e) { if (notify) notify(STORAGE_FAIL); }
    }
    return { strip: true, stored: stored, action: ok ? v : 'cancel' };
  }

  function createPlayPass() {
    return {
      listened: 0, counted: false, pending: false, failedUntil: 0,
      lastTime: null, activeSourceId: null, closed: false, generation: 1
    };
  }

  function clonePlayPass(pass) {
    var src = pass || createPlayPass();
    return {
      listened: src.listened || 0,
      counted: !!src.counted,
      pending: !!src.pending,
      failedUntil: src.failedUntil || 0,
      lastTime: src.lastTime == null ? null : src.lastTime,
      activeSourceId: src.activeSourceId || null,
      closed: !!src.closed,
      generation: src.generation || 1
    };
  }

  function freshPlayPass(prev, sample) {
    return {
      listened: 0, counted: false, pending: false, failedUntil: 0, lastTime: null,
      activeSourceId: sample && sample.sourceId || null, closed: false,
      generation: ((prev && prev.generation) || 1) + 1
    };
  }

  function mediaMs(sample) {
    var t = Number(sample && sample.mediaTime);
    if (!isFinite(t) || t < 0) return null;
    return Math.round(t * 1000);
  }

  // Accumulate real on-site playback. The input pass is not mutated.
  // Counted time is forward media time in steps of at most PLAY_MAX_STEP_MS
  // while the preview is playing at 1x. Pauses, waits, and seeks add nothing.
  // A second card for the same track does not add time unless it claims play.
  // After a qualified pass, the track ending or a backward jump of more than
  // one step opens a new pass so a genuine replay can count again.
  function notePlaySample(pass, sample) {
    var next = clonePlayPass(pass);
    if (!sample || sample.kind !== 'onsite') return { pass: next, added: 0, reason: 'not-onsite' };
    if (sample.claim && sample.sourceId) {
      if (next.activeSourceId && next.activeSourceId !== sample.sourceId) {
        next.activeSourceId = sample.sourceId;
        next.lastTime = null;
      } else if (!next.activeSourceId) next.activeSourceId = sample.sourceId;
    }
    if (sample.sourceId && next.activeSourceId && sample.sourceId !== next.activeSourceId) {
      return { pass: clonePlayPass(pass), added: 0, reason: 'other-card' };
    }
    if (sample.sourceId && !next.activeSourceId) next.activeSourceId = sample.sourceId;
    if (next.closed) next = freshPlayPass(next, sample);

    if (sample.ended) {
      next.lastTime = null;
      if (next.counted || next.pending) next.closed = true;
      return { pass: next, added: 0, reason: 'ended' };
    }
    if (sample.paused || sample.seeking || sample.waiting) {
      next.lastTime = null;
      return { pass: next, added: 0, reason: sample.paused ? 'paused' : sample.seeking ? 'seeking' : 'waiting' };
    }
    var rate = sample.playbackRate == null ? 1 : Number(sample.playbackRate);
    if (!(rate > 0.99 && rate < 1.01)) {
      next.lastTime = null;
      return { pass: next, added: 0, reason: 'rate' };
    }
    var t = mediaMs(sample);
    if (t == null) return { pass: next, added: 0, reason: 'bad-time' };
    if (next.lastTime == null) {
      next.lastTime = t;
      return { pass: next, added: 0, reason: 'anchor' };
    }
    var delta = t - next.lastTime;
    if (delta <= 0 || delta > PLAY_MAX_STEP_MS) {
      var replay = delta < -PLAY_MAX_STEP_MS && (next.counted || next.pending);
      next.lastTime = t;
      if (replay) {
        var opened = freshPlayPass(next, sample);
        opened.lastTime = t;
        return { pass: opened, added: 0, reason: 'replay' };
      }
      return { pass: next, added: 0, reason: delta <= 0 ? 'seek-back' : 'seek-forward' };
    }
    next.listened += delta;
    next.lastTime = t;
    return { pass: next, added: delta, reason: 'listen' };
  }

  function planPlayHit(state, pass) {
    if (!pass || pass.listened < PLAY_QUALIFY_MS) return { op: 'none', reason: 'short' };
    if (pass.counted) return { op: 'none', reason: 'counted' };
    if (pass.pending) return { op: 'none', reason: 'pending' };
    var now = state && state.now || 0;
    if (pass.failedUntil && now < pass.failedUntil) return { op: 'none', reason: 'cooldown' };
    if (!shouldRecord(state)) return { op: 'none', reason: !state || !state.authResolved ? 'auth' : 'owner' };
    return { op: 'hit', reason: 'qualify' };
  }

  function markPlayPending(pass) {
    var next = clonePlayPass(pass);
    next.pending = true;
    return next;
  }

  function markPlayCounted(pass) {
    var next = clonePlayPass(pass);
    next.pending = false;
    next.counted = true;
    next.failedUntil = 0;
    return next;
  }

  function clearPlayPending(pass) {
    var next = clonePlayPass(pass);
    next.pending = false;
    return next;
  }

  function markPlayFailed(pass, now) {
    var next = clonePlayPass(pass);
    next.pending = false;
    next.counted = false;
    next.failedUntil = (now || 0) + PLAY_RETRY_MS;
    return next;
  }

  function claimAudioBinding(registry, audioId) {
    if (!registry || audioId == null || audioId === '') return false;
    if (registry[audioId]) return false;
    registry[audioId] = 1;
    return true;
  }

  function playbackSource(title) {
    var key = playKey(title);
    return {
      title: title,
      key: key,
      namespace: NS,
      epoch: EPOCH,
      qualifySeconds: PLAY_QUALIFY_MS / 1000,
      maxStepSeconds: PLAY_MAX_STEP_MS / 1000,
      recommendedOp: 'info',
      infoUrl: counterUrl('info', key),
      getUrl: counterUrl('get', key),
      increments: false
    };
  }

  function playbackSources(titles) {
    return (titles || []).map(playbackSource);
  }

  function playbackReadKeys(titles) {
    return (titles || []).map(playKey);
  }

  function playDisplay(parsed) {
    if (!parsed || parsed.ok !== true || typeof parsed.value !== 'number' || !isFinite(parsed.value)) {
      return { state: 'unavailable', text: '', showNumber: false };
    }
    var n = Math.max(0, Math.trunc(parsed.value));
    return { state: 'ready', text: String(n), showNumber: true, value: n };
  }

  function memoryStorage(init) {
    var m = new Map(Object.entries(init || {}));
    return {
      getItem: function (k) { return m.has(k) ? m.get(k) : null; },
      setItem: function (k, v) { m.set(k, String(v)); },
      removeItem: function (k) { m.delete(k); },
      dump: function () { return Object.fromEntries(m); }
    };
  }

  return {
    EPOCH: EPOCH, NS: NS, DEFAULT_API: DEFAULT_API, EXCLUDE_KEY: EXCLUDE_KEY,
    PLAY_QUALIFY_MS: PLAY_QUALIFY_MS, PLAY_MAX_STEP_MS: PLAY_MAX_STEP_MS, PLAY_RETRY_MS: PLAY_RETRY_MS,
    EXCLUDE_CONFIRM: EXCLUDE_CONFIRM, INCLUDE_CONFIRM: INCLUDE_CONFIRM, STORAGE_FAIL: STORAGE_FAIL,
    apiBase: apiBase, slug: slug, likeKey: likeKey, legacyLikeKey: legacyLikeKey, playKey: playKey,
    isPlaybackKey: isPlaybackKey, assertPlaybackKey: assertPlaybackKey, planPlaybackClear: planPlaybackClear,
    dayKey: dayKey, legacyDayKey: legacyDayKey, alltimeKey: alltimeKey, legacyAlltimeKey: legacyAlltimeKey,
    likeStorageKey: likeStorageKey, legacyLikeStorageKey: legacyLikeStorageKey, visitHitStorageKey: visitHitStorageKey,
    counterUrl: counterUrl, installIdentityGate: installIdentityGate, identityDetail: identityDetail,
    deliverIdentity: deliverIdentity, isBrowserExcluded: isBrowserExcluded, shouldRecord: shouldRecord,
    privileges: privileges, coerceOp: coerceOp, selectOp: selectOp, interpretResponse: interpretResponse,
    readLiked: readLiked, writeLiked: writeLiked, planLikeClick: planLikeClick,
    readHitNames: readHitNames, writeHitNames: writeHitNames, claimHit: claimHit, unclaimHit: unclaimHit,
    planVisitOps: planVisitOps, budapestDay: budapestDay, applyOwnerQuery: applyOwnerQuery,
    createPlayPass: createPlayPass, clonePlayPass: clonePlayPass, notePlaySample: notePlaySample,
    planPlayHit: planPlayHit, markPlayPending: markPlayPending, markPlayCounted: markPlayCounted,
    clearPlayPending: clearPlayPending, markPlayFailed: markPlayFailed, claimAudioBinding: claimAudioBinding,
    playbackSource: playbackSource, playbackSources: playbackSources, playbackReadKeys: playbackReadKeys,
    playDisplay: playDisplay, memoryStorage: memoryStorage
  };
});
