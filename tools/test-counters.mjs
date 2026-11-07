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
  assert.match(indexHtml, /stats-policy\.js\?v=53/);
  assert.match(indexHtml, /main\.js\?v=53/);
  assert.match(indexHtml, /community\.js\?v=53/);
  assert.match(indexHtml, /style\.css\?v=53/);
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
