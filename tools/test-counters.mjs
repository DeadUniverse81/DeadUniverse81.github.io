import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import {
  titlesFromMain, daysInclusive, allowlist, planApply, buildRequest, main,
  CONFIRM_RESET, SCAN_FROM
} from './counter-reset.mjs';

const require = createRequire(import.meta.url);
const S = require('../stats-policy.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const communityJs = fs.readFileSync(path.join(root, 'community.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const guest = { browserExcluded: false, authResolved: true, isAdmin: false };

test('epoch keys ignore legacy like and visit state and never display a negative', () => {
  const storage = S.memoryStorage({
    [S.legacyLikeStorageKey('Lift Me Up')]: '1',
    du_seen: '20261107'
  });
  assert.equal(S.readLiked(storage, 'Lift Me Up'), false);
  assert.deepEqual(S.readHitNames(storage, '20261107'), []);
  assert.equal(S.likeKey('Lift Me Up'), 'like-lift-me-up-e1');
  assert.equal(S.legacyLikeKey('Lift Me Up'), 'like-lift-me-up');
  assert.notEqual(S.likeStorageKey('Lift Me Up'), S.legacyLikeStorageKey('Lift Me Up'));
  const ops = S.planVisitOps({ ...guest, day: '20261107', hitNames: S.readHitNames(storage, '20261107') });
  assert.deepEqual(ops.map(o => o.op), ['hit', 'hit']);
  assert.equal(ops[0].key, 'd20261107-e1');
  assert.equal(ops[1].key, 'alltime-e1');
  assert.deepEqual(S.planLikeClick({ ...guest, alreadyLiked: false }), { op: 'hit', persist: true });
  S.writeLiked(storage, 'Lift Me Up');
  assert.equal(S.planLikeClick({ ...guest, alreadyLiked: S.readLiked(storage, 'Lift Me Up') }).op, 'none');
  assert.equal(S.interpretResponse(404, { error: 'Key not found' }).value, 0);
  assert.equal(S.interpretResponse(200, { value: -4 }).value, 0);
  assert.equal(S.interpretResponse(200, { value: 5 }).value, 5);
  assert.equal(S.interpretResponse(500, { value: 1 }).ok, false);
});

test('exclusion and admin do not record, and the opt-out flag is not admin', () => {
  const storage = S.memoryStorage();
  const excluded = S.applyOwnerQuery('?du_owner=exclude', storage, () => true);
  assert.equal(excluded.action, 'exclude');
  assert.equal(excluded.strip, true);
  assert.equal(storage.getItem(S.EXCLUDE_KEY), '1');
  assert.equal(storage.getItem('admin'), null);
  assert.equal(storage.getItem('du_admin'), null);
  assert.match(S.EXCLUDE_CONFIRM, /does not grant admin access/);
  assert.match(S.INCLUDE_CONFIRM, /does not change admin access/);
  const state = { browserExcluded: true, authResolved: true, isAdmin: false, signedIn: false };
  const priv = S.privileges(state);
  assert.equal(priv.isAdmin, false);
  assert.equal(priv.canModerate, false);
  assert.equal(priv.recordStats, false);
  assert.equal(priv.viewStats, true);
  assert.equal(S.shouldRecord({ browserExcluded: true, authResolved: false, isAdmin: false }), false);
  assert.equal(S.shouldRecord({ browserExcluded: false, authResolved: false, isAdmin: false }), false);
  assert.equal(S.shouldRecord({ ...guest, isAdmin: true }), false);
  assert.equal(S.shouldRecord(guest), true);
  assert.equal(S.selectOp('hit', { browserExcluded: false, authResolved: false, isAdmin: false }), 'get');
  assert.equal(S.selectOp('hit', guest), 'hit');
  assert.equal(S.selectOp('delete', guest), 'get');
  assert.equal(S.planLikeClick({ browserExcluded: true, authResolved: false, isAdmin: false, alreadyLiked: false }).op, 'none');
  assert.equal(S.planLikeClick({ ...guest, isAdmin: true, alreadyLiked: false }).op, 'none');
  assert.deepEqual(S.planVisitOps({ browserExcluded: true, authResolved: false, isAdmin: false, day: '20261107', hitNames: [] }).map(o => o.op), ['get', 'get']);
  const cancelled = S.applyOwnerQuery('?du_owner=exclude', S.memoryStorage({ [S.EXCLUDE_KEY]: '1' }), () => false);
  assert.equal(cancelled.action, 'cancel');
  const back = S.applyOwnerQuery('du_owner=include', storage, () => true);
  assert.equal(back.action, 'include');
  assert.equal(S.isBrowserExcluded(storage), false);
});

test('a failed visit hit is retried once and a claimed key is not hit again', () => {
  const storage = S.memoryStorage();
  assert.equal(S.claimHit(storage, '20261107', 'day'), true);
  assert.equal(S.claimHit(storage, '20261107', 'day'), false);
  const partial = S.planVisitOps({ ...guest, day: '20261107', hitNames: S.readHitNames(storage, '20261107') });
  assert.deepEqual(partial.map(o => [o.name, o.op]), [['day', 'get'], ['all', 'hit']]);
  S.unclaimHit(storage, '20261107', 'day');
  assert.equal(S.claimHit(storage, '20261107', 'day'), true);
});

test('admin recognition comes only from the auth result', async () => {
  const root = {};
  S.installIdentityGate(root);
  const detail = S.identityDetail({ resolved: true, isAdmin: false, signedIn: true, browserExcluded: true });
  assert.equal(detail.admin, false);
  assert.equal(detail.resolved, true);
  S.deliverIdentity(root, detail);
  assert.deepEqual(await root.DU.identityReady, detail);
  const unknown = S.identityDetail({ resolved: false, isAdmin: false, signedIn: true });
  assert.equal(unknown.resolved, false);
  assert.equal(unknown.admin, false);
  assert.equal(S.budapestDay(new Date('2026-11-07T22:30:00Z')), '20261107');
  assert.equal(S.budapestDay(new Date('2026-11-07T23:30:00Z')), '20261108');
});

test('counter URLs can only read, hit, or info a well-formed key', () => {
  assert.match(S.counterUrl('get', 'alltime-e1'), /\/get\/deaduniversemusic\/alltime-e1$/);
  assert.match(S.counterUrl('hit', 'like-b4bylon-e1'), /\/hit\/deaduniversemusic\/like-b4bylon-e1$/);
  assert.throws(() => S.counterUrl('delete', 'alltime-e1'));
  assert.throws(() => S.counterUrl('update', 'alltime-e1'));
  assert.throws(() => S.counterUrl('get', '../admins'));
  assert.throws(() => buildRequest('hit', 'alltime'));
  assert.throws(() => buildRequest('delete', 'alltime'));
  assert.throws(() => buildRequest('update', 'alltime'));
  assert.deepEqual(buildRequest('reset', 'alltime-e1'), { method: 'POST', path: '/reset/deaduniversemusic/alltime-e1' });
});

test('the page wires reads and hits through the policy and does not treat opt-out as admin', () => {
  assert.equal(mainJs.includes('abacus.jasoncameron.dev'), false);
  assert.equal(mainJs.includes('/hit/'), false);
  assert.equal(mainJs.includes('Math.max(d, 1)'), false);
  assert.match(mainJs, /owner\.action === 'cancel'/);
  assert.match(mainJs, /duGet\(DUStats\.dayKey/);
  assert.match(mainJs, /duMutate\('hit'/);
  assert.match(mainJs, /DUStats\.selectOp\('hit'/);
  assert.equal(communityJs.includes('du_count_exclude'), false);
  assert.match(communityJs, /publishIdentity\(!u \|\| adminKnown\)/);
  assert.match(communityJs, /identityDetail\(\{ resolved, isAdmin: admin/);
  assert.match(indexHtml, /stats-policy\.js\?v=57/);
  assert.match(indexHtml, /main\.js\?v=57/);
  assert.match(indexHtml, /community\.js\?v=53/);
  assert.match(indexHtml, /style\.css\?v=57/);
  assert.match(indexHtml, /src="assets\/covers\/the_traveller\.jpg" alt="The Traveller cover art"/);
  assert.match(indexHtml, /href="https:\/\/www\.youtube\.com\/@AdamMaczo" target="_blank" rel="noopener noreferrer">YouTube/);
  assert.match(indexHtml, /href="https:\/\/x\.com\/Refused81" target="_blank" rel="noopener noreferrer">X/);
  assert.match(indexHtml, /href="#">Spotify<\/a><a href="#">Instagram<\/a>/);
  assert.match(mainJs, /bindOnsitePreview\(a, spec\.title\)/);
  assert.match(mainJs, /the_traveller\.mp3/);
  assert.match(mainJs, /count: false/);
  assert.match(mainJs, /kind: 'onsite'/);
  assert.equal(mainJs.includes('/hit/'), false);
  assert.equal(mainJs.includes('playKey(t.stream'), false);
  assert.equal(mainJs.includes("kind: 'youtube'"), false);
  assert.equal(mainJs.includes("kind: 'spotify'"), false);
  assert.equal(fs.readFileSync(path.join(root, 'CNAME'), 'utf8').trim(), 'deaduniversemusic.com');
  const titles = titlesFromMain(mainJs);
  assert.deepEqual(titles, [
    'Rewritten by Light', 'Erased by Light', 'Ashes in My Veins', 'The Monolith',
    'The Oblivion', 'b4bYLon', 'Burn the World Down', 'Lift Me Up'
  ]);
});

test('reset plan zeroes only admin-created allowlisted counters and never deletes', () => {
  const titles = ['Lift Me Up'];
  const days = ['20261107'];
  const allowed = allowlist({ titles, days });
  assert.ok(allowed.has('like-lift-me-up'));
  assert.ok(allowed.has('like-lift-me-up-e1'));
  assert.ok(allowed.has('alltime'));
  assert.ok(allowed.has('alltime-e1'));
  assert.ok(allowed.has('d20261107'));
  assert.ok(allowed.has('d20261107-e1'));
  assert.equal(allowed.has('ideas'), false);
  const records = [
    { key: 'like-lift-me-up', exists: true, value: 5, adminResetPossible: false },
    { key: 'alltime', exists: true, value: 190, adminResetPossible: false },
    { key: 'd20261107', exists: true, value: 4, adminResetPossible: false },
    { key: 'alltime-e1', exists: true, value: 3, adminResetPossible: true },
    { key: 'like-lift-me-up-e1', exists: false, value: null, adminResetPossible: false }
  ];
  const dry = planApply(records, { apply: false, allowed });
  assert.equal(dry.mode, 'dry-run');
  assert.equal(dry.resets, 0);
  const applied = planApply(records, { apply: true, allowed });
  assert.deepEqual(applied.actions.filter(a => a.action === 'reset'), [{ key: 'alltime-e1', action: 'reset', to: 0, method: 'POST /reset' }]);
  assert.ok(applied.actions.every(a => a.action !== 'delete' && a.method !== 'POST /update' && a.method !== 'POST /delete'));
  assert.throws(() => planApply([{ key: 'ideas', exists: true, value: 1, adminResetPossible: true }], { apply: true, allowed }));
  assert.throws(() => planApply([{ key: 'messages/abc', exists: true, value: 1, adminResetPossible: true }], { apply: true, allowed: new Set(['messages/abc']) }));
  assert.deepEqual(daysInclusive('20261029', '20261031'), ['20261029', '20261030', '20261031']);
  assert.equal(SCAN_FROM, '20261020');
  assert.equal(CONFIRM_RESET, 'ZERO-TEST-COUNTERS');
});

test('dry run and refused apply do not call hit, reset, delete, or create', async () => {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', auth: opts.headers && opts.headers.authorization });
    if (/\/(hit|reset|delete|update|create)\//.test(url)) throw new Error('mutation ' + url);
    const key = decodeURIComponent(url.split('/').pop());
    const known = { 'like-lift-me-up': 5, alltime: 190, d20261107: 4 };
    const body = key in known
      ? { exists: true, value: known[key], is_genuine: true, expires_in: 10 }
      : { exists: false, value: -1, is_genuine: true, expires_in: 0 };
    return { status: 200, headers: { get: () => null }, json: async () => body };
  };
  const backup = path.join(os.tmpdir(), `du-counter-test-${process.pid}.json`);
  const sleep = async () => {};
  await assert.rejects(() => main(['--apply'], {}, { fetchImpl, sleep }), /confirm/);
  await assert.rejects(() => main(['--create-epoch', '--confirm', 'NOPE'], {}, { fetchImpl, sleep }), /confirm/);
  await assert.rejects(() => main(['--apply', '--confirm', CONFIRM_RESET], {}, { fetchImpl, sleep }), /ABACUS_ADMIN_KEY/);
  assert.equal(calls.length, 0);
  const prev = process.exitCode;
  await main(['--backup=' + backup], {}, { fetchImpl, sleep });
  const doc = JSON.parse(fs.readFileSync(backup, 'utf8'));
  const alltime = doc.records.find(r => r.key === 'alltime');
  const lift = doc.records.find(r => r.key === 'like-lift-me-up');
  const epoch = doc.records.find(r => r.key === 'alltime-e1');
  assert.equal(alltime.value, 190);
  assert.equal(alltime.adminResetPossible, false);
  assert.equal(lift.value, 5);
  assert.equal(doc.records.find(r => r.key === 'd20261107').value, 4);
  assert.ok(doc.records.some(r => r.key === 'd20261020'));
  assert.equal(epoch.exists, false);
  assert.equal(JSON.stringify(doc).includes('admin_key'), false);
  const playInfo = doc.playback.find(r => r.key === 'play-lift-me-up-e1');
  assert.equal(playInfo.exists, false);
  assert.ok(doc.playback.every(r => S.isPlaybackKey(r.key)));
  assert.equal(doc.records.some(r => String(r.key).startsWith('play-')), false);
  assert.ok(calls.some(c => c.url.includes('/info/deaduniversemusic/play-rewritten-by-light-e1')));
  assert.ok(calls.filter(c => c.url.includes('/play-')).every(c => c.url.includes('/info/') && !c.url.includes('/hit/')));
  const resetAllowed = allowlist({ titles: titlesFromMain(mainJs), days: ['20261107'] });
  assert.equal([...resetAllowed].some(k => String(k).startsWith('play-')), false);
  assert.throws(() => planApply([{ key: 'play-lift-me-up-e1', exists: true, value: 3, adminResetPossible: true }], { apply: true, allowed: resetAllowed }));
  assert.ok(calls.every(c => c.method === 'GET' && c.url.includes('/info/') && !c.auth));
  calls.length = 0;
  process.exitCode = 0;
  await main(['--apply', '--confirm=' + CONFIRM_RESET, '--backup=' + backup], { ABACUS_ADMIN_KEY: 'test-key' }, { fetchImpl, sleep });
  assert.equal(process.exitCode, 2);
  assert.ok(calls.every(c => c.method === 'GET' && c.url.includes('/info/')));
  assert.ok(calls.every(c => !c.auth));
  process.exitCode = prev;
  fs.unlinkSync(backup);
});

function drivePlay(pass, seconds, sourceId, patch) {
  let p = pass || S.createPlayPass();
  let t = p.lastTime == null ? 0 : p.lastTime / 1000;
  const base = (mediaTime, extra) => Object.assign({
    kind: 'onsite', sourceId: sourceId || 'card-a', mediaTime, paused: false, seeking: false,
    ended: false, waiting: false, playbackRate: 1
  }, extra || {}, patch || {});
  if (p.lastTime == null) p = S.notePlaySample(p, base(t)).pass;
  const steps = Math.round(seconds / 0.25);
  let added = 0;
  for (let i = 0; i < steps; i++) {
    t += 0.25;
    const sample = S.notePlaySample(p, base(t));
    p = sample.pass;
    added += sample.added;
  }
  return { pass: p, added };
}

test('a qualified on-site play needs 30s of real playback and ignores pauses, seeks, and external audio', () => {
  const frozen = Object.freeze(S.createPlayPass());
  const external = S.notePlaySample(frozen, { kind: 'youtube', mediaTime: 40, paused: false, sourceId: 'yt' });
  assert.equal(external.reason, 'not-onsite');
  assert.equal(external.added, 0);
  assert.equal(S.notePlaySample(frozen, { kind: 'spotify', mediaTime: 40, paused: false }).reason, 'not-onsite');
  assert.equal(S.notePlaySample(frozen, { kind: 'ambient', mediaTime: 40, paused: false }).reason, 'not-onsite');
  assert.equal(frozen.listened, 0);

  let pass = S.createPlayPass();
  const early = drivePlay(pass, 29.75, 'card-a');
  pass = early.pass;
  assert.equal(pass.listened, 29750);
  assert.equal(S.planPlayHit(guest, pass).op, 'none');
  assert.equal(S.planPlayHit(guest, pass).reason, 'short');
  const qualified = drivePlay(pass, 0.25, 'card-a');
  pass = qualified.pass;
  assert.equal(pass.listened, 30000);
  assert.deepEqual(S.planPlayHit({ ...guest, now: 0 }, pass), { op: 'hit', reason: 'qualify' });

  const pausedFrom = pass.lastTime / 1000;
  let paused = S.notePlaySample(pass, { kind: 'onsite', sourceId: 'card-a', mediaTime: pausedFrom, paused: true, playbackRate: 1 }).pass;
  paused = S.notePlaySample(paused, { kind: 'onsite', sourceId: 'card-a', mediaTime: pausedFrom + 40, paused: true, playbackRate: 1 }).pass;
  assert.equal(paused.listened, 30000);
  assert.equal(S.planPlayHit(guest, S.markPlayCounted(paused)).reason, 'counted');

  let seeking = drivePlay(S.createPlayPass(), 10, 'card-a').pass;
  const at = seeking.lastTime / 1000;
  seeking = S.notePlaySample(seeking, { kind: 'onsite', sourceId: 'card-a', mediaTime: at + 25, seeking: true, paused: false, playbackRate: 1 }).pass;
  seeking = S.notePlaySample(seeking, { kind: 'onsite', sourceId: 'card-a', mediaTime: at + 25, paused: false, playbackRate: 1 }).pass;
  assert.equal(seeking.listened, 10000);
  const afterSeek = drivePlay(seeking, 19.75, 'card-a');
  assert.equal(afterSeek.pass.listened, 29750);
  assert.equal(S.planPlayHit(guest, afterSeek.pass).op, 'none');
  const seekDone = drivePlay(afterSeek.pass, 0.25, 'card-a');
  assert.equal(seekDone.pass.listened, 30000);

  let rate = drivePlay(S.createPlayPass(), 5, 'card-a').pass;
  const rateAt = rate.lastTime / 1000;
  rate = S.notePlaySample(rate, { kind: 'onsite', sourceId: 'card-a', mediaTime: rateAt + 0.25, paused: false, playbackRate: 2 }).pass;
  assert.equal(rate.listened, 5000);

  const same = S.notePlaySample(seekDone.pass, {
    kind: 'onsite', sourceId: 'card-a', mediaTime: seekDone.pass.lastTime / 1000, paused: false, playbackRate: 1
  });
  assert.equal(same.added, 0);
  assert.equal(same.pass.listened, seekDone.pass.listened);

  assert.equal(S.playKey('b4bYLon'), 'play-b4bylon-e1');
  assert.equal(S.playKey('Lift Me Up'), 'play-lift-me-up-e1');
  assert.notEqual(S.playKey('Lift Me Up'), S.likeKey('Lift Me Up'));
  const src = S.playbackSource('Burn the World Down');
  assert.equal(src.recommendedOp, 'info');
  assert.equal(src.increments, false);
  assert.equal(src.qualifySeconds, 30);
  assert.match(src.infoUrl, /\/info\/deaduniversemusic\/play-burn-the-world-down-e1$/);
  assert.equal(JSON.stringify(src).includes('/hit/'), false);
  assert.equal(S.playDisplay({ ok: false, value: null }).showNumber, false);
  assert.equal(S.playDisplay({ ok: true, value: 0, missing: true }).showNumber, true);
  assert.equal(S.playDisplay({ ok: true, value: 0 }).value, 0);
  assert.deepEqual(S.planPlaybackClear(['play-b4bylon-e1', 'play-the-monolith-e1']).map(x => x.key), ['play-b4bylon-e1', 'play-the-monolith-e1']);
  assert.throws(() => S.planPlaybackClear(['play-b4bylon-e1', 'like-b4bylon-e1']));
  assert.throws(() => S.planPlaybackClear(['alltime-e1']));
  assert.throws(() => S.planPlaybackClear(['d20261107-e1']));
  assert.throws(() => S.assertPlaybackKey('play-b4bylon'));
});

test('replay, track changes, duplicate cards, and owner exclusion do not double-count', () => {
  let ashes = drivePlay(S.createPlayPass(), 30, 'latest').pass;
  assert.equal(S.planPlayHit(guest, ashes).op, 'hit');
  ashes = S.markPlayPending(ashes);
  assert.equal(S.planPlayHit(guest, ashes).reason, 'pending');
  const pendingSnapshot = ashes;
  ashes = S.markPlayCounted(ashes);
  assert.equal(pendingSnapshot.pending, true);
  assert.equal(ashes.counted, true);
  const more = drivePlay(ashes, 20, 'latest');
  assert.equal(more.pass.counted, true);
  assert.equal(more.pass.generation, ashes.generation);
  assert.equal(S.planPlayHit(guest, more.pass).reason, 'counted');

  const back = S.notePlaySample(more.pass, { kind: 'onsite', sourceId: 'latest', mediaTime: 0, paused: false, playbackRate: 1 });
  assert.equal(back.reason, 'replay');
  assert.equal(back.pass.listened, 0);
  assert.equal(back.pass.counted, false);
  assert.equal(back.pass.generation, more.pass.generation + 1);
  const again = drivePlay(back.pass, 30, 'latest');
  assert.equal(S.planPlayHit(guest, again.pass).op, 'hit');

  let ended = S.markPlayCounted(again.pass);
  ended = S.notePlaySample(ended, { kind: 'onsite', sourceId: 'latest', mediaTime: 40, ended: true, paused: true, playbackRate: 1 }).pass;
  assert.equal(ended.closed, true);
  const afterEnd = S.notePlaySample(ended, { kind: 'onsite', sourceId: 'latest', mediaTime: 0.25, paused: false, playbackRate: 1 });
  assert.equal(afterEnd.pass.generation, ended.generation + 1);
  assert.equal(afterEnd.pass.listened, 0);

  let monolith = drivePlay(S.createPlayPass(), 12, 'lib').pass;
  let other = drivePlay(S.createPlayPass(), 30, 'lib-b').pass;
  assert.equal(monolith.listened, 12000);
  assert.equal(other.listened, 30000);
  monolith = drivePlay(monolith, 18, 'lib').pass;
  assert.equal(monolith.listened, 30000);
  assert.equal(other.listened, 30000);

  let shared = drivePlay(S.createPlayPass(), 10, 'latest').pass;
  const ignored = S.notePlaySample(shared, { kind: 'onsite', sourceId: 'library', mediaTime: 20, paused: false, playbackRate: 1 });
  assert.equal(ignored.reason, 'other-card');
  assert.equal(ignored.pass.listened, 10000);
  assert.equal(shared.listened, 10000);
  const claimed = S.notePlaySample(shared, { kind: 'onsite', sourceId: 'library', mediaTime: 10, paused: false, playbackRate: 1, claim: true });
  assert.equal(claimed.pass.activeSourceId, 'library');
  assert.equal(claimed.pass.listened, 10000);
  const continued = drivePlay(claimed.pass, 20, 'library');
  assert.equal(continued.pass.listened, 30000);
  assert.equal(S.planPlayHit(guest, continued.pass).op, 'hit');

  const bindings = {};
  assert.equal(S.claimAudioBinding(bindings, 'audio-1'), true);
  assert.equal(S.claimAudioBinding(bindings, 'audio-1'), false);
  assert.equal(S.claimAudioBinding(bindings, 'audio-2'), true);

  assert.equal(S.planPlayHit({ browserExcluded: true, authResolved: true, isAdmin: false }, continued.pass).reason, 'owner');
  assert.equal(S.planPlayHit({ ...guest, isAdmin: true }, continued.pass).reason, 'owner');
  assert.equal(S.planPlayHit({ browserExcluded: false, authResolved: false, isAdmin: false }, continued.pass).reason, 'auth');
  const failed = S.markPlayFailed(S.markPlayPending(continued.pass), 1000);
  assert.equal(failed.counted, false);
  assert.equal(S.planPlayHit({ ...guest, now: 1000 + S.PLAY_RETRY_MS - 1 }, failed).reason, 'cooldown');
  assert.equal(S.planPlayHit({ ...guest, now: 1000 + S.PLAY_RETRY_MS }, failed).op, 'hit');

  let rewind = drivePlay(S.createPlayPass(), 20, 'card-a').pass;
  rewind = S.notePlaySample(rewind, { kind: 'onsite', sourceId: 'card-a', mediaTime: 2, paused: false, playbackRate: 1 }).pass;
  assert.equal(rewind.listened, 20000);
  assert.equal(rewind.counted, false);
});
