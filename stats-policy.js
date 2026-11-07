// Visit and like counting policy. Pure logic, no DOM.
// Song likes and visits are Abacus integers (namespace deaduniversemusic).
// They are not Firebase community data. COUNTER_EPOCH is independent of the
// ?v= cache buster: bump it only when the displayed counters should start over.
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
  var EXCLUDE_CONFIRM = 'Exclude this browser from DeadUniverse visit and like counts? You will still see the stats. This does not grant admin access. Set this once in each browser you use (this PC and your phone are separate).';
  var INCLUDE_CONFIRM = 'Count this browser again in DeadUniverse visit and like totals? This does not change admin access.';
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
    EXCLUDE_CONFIRM: EXCLUDE_CONFIRM, INCLUDE_CONFIRM: INCLUDE_CONFIRM, STORAGE_FAIL: STORAGE_FAIL,
    apiBase: apiBase, slug: slug, likeKey: likeKey, legacyLikeKey: legacyLikeKey,
    dayKey: dayKey, legacyDayKey: legacyDayKey, alltimeKey: alltimeKey, legacyAlltimeKey: legacyAlltimeKey,
    likeStorageKey: likeStorageKey, legacyLikeStorageKey: legacyLikeStorageKey, visitHitStorageKey: visitHitStorageKey,
    counterUrl: counterUrl, installIdentityGate: installIdentityGate, identityDetail: identityDetail,
    deliverIdentity: deliverIdentity, isBrowserExcluded: isBrowserExcluded, shouldRecord: shouldRecord,
    privileges: privileges, coerceOp: coerceOp, selectOp: selectOp, interpretResponse: interpretResponse,
    readLiked: readLiked, writeLiked: writeLiked, planLikeClick: planLikeClick,
    readHitNames: readHitNames, writeHitNames: writeHitNames, claimHit: claimHit, unclaimHit: unclaimHit,
    planVisitOps: planVisitOps, budapestDay: budapestDay, applyOwnerQuery: applyOwnerQuery, memoryStorage: memoryStorage
  };
});
