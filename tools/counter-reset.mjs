#!/usr/bin/env node
// Narrow backup / dry-run / optional reset for DeadUniverse Abacus counters only.
//
// Default is a dry run: GET /info only. It never calls /hit, /update, or /delete.
// Legacy keys were created by /hit (is_genuine true) and have no admin key, so
// they cannot be reset in place. They are the backup. The site reads epoch keys
// instead (see stats-policy.js COUNTER_EPOCH). This script does not touch
// Firebase (messages, ideas, polls, users, admins, banned).
//
//   node tools/counter-reset.mjs
//   node tools/counter-reset.mjs --backup tools/counter-backups/snapshot.json
//   node tools/counter-reset.mjs --apply --confirm ZERO-TEST-COUNTERS
//       Requires ABACUS_ADMIN_KEY. Refuses hit-created keys. Does not delete.
//   node tools/counter-reset.mjs --create-epoch --confirm CREATE-EPOCH-KEYS
//       OPTIONAL production write: /create the epoch keys at 0 and save the
//       one-time admin keys under tools/counter-backups/ (gitignored).
//       Not required for the displayed totals to start at zero.
//
// Reads refresh Abacus's 6-month TTL. They do not change counter values.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const S = require('../stats-policy.js');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

export const SCAN_FROM = '20261020';
export const CONFIRM_RESET = 'ZERO-TEST-COUNTERS';
export const CONFIRM_CREATE = 'CREATE-EPOCH-KEYS';
const DENY = /^(messages|ideas|polls|users|admins|banned|votes|rate)(\/|$)/;

export function titlesFromMain(source) {
  return [...source.matchAll(/title:\s*"([^"]+)"/g)].map(m => m[1]);
}

export function daysInclusive(from, to) {
  const parse = s => {
    const c = String(s).replace(/-/g, '');
    if (!/^\d{8}$/.test(c)) throw new Error('bad day ' + s);
    return new Date(`${c.slice(0, 4)}-${c.slice(4, 6)}-${c.slice(6, 8)}T12:00:00Z`);
  };
  const out = [];
  const a = parse(from), b = parse(to);
  for (let t = a.getTime(); t <= b.getTime(); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10).replace(/-/g, ''));
  }
  return out;
}

export function allowlist({ titles, days, epoch = S.EPOCH }) {
  const keys = new Set();
  for (const title of titles) {
    keys.add(S.legacyLikeKey(title));
    keys.add(S.likeKey(title).replace(new RegExp('-' + S.EPOCH + '$'), '-' + epoch));
  }
  keys.add(S.legacyAlltimeKey());
  keys.add('alltime-' + epoch);
  for (const day of days) {
    keys.add(S.legacyDayKey(day));
    keys.add('d' + day + '-' + epoch);
  }
  return keys;
}

export function assertManaged(key, allowed) {
  if (DENY.test(key) || key.includes('/')) throw new Error('refusing unmanaged key ' + key);
  if (!allowed.has(key)) throw new Error('refusing key outside the counter allowlist: ' + key);
}

export function planApply(records, opts) {
  const allowed = opts.allowed;
  const actions = [];
  for (const rec of records) {
    assertManaged(rec.key, allowed);
    if (!opts.apply) {
      actions.push({ key: rec.key, action: 'report', exists: !!rec.exists, value: rec.exists ? rec.value : null, adminResetPossible: rec.adminResetPossible === true });
      continue;
    }
    if (!rec.exists) { actions.push({ key: rec.key, action: 'skip', reason: 'absent' }); continue; }
    if (rec.adminResetPossible !== true) {
      actions.push({ key: rec.key, action: 'skip', reason: 'hit-created or unknown; no admin key; left unchanged as backup' });
      continue;
    }
    if (rec.value === 0) { actions.push({ key: rec.key, action: 'skip', reason: 'already zero' }); continue; }
    actions.push({ key: rec.key, action: 'reset', to: 0, method: 'POST /reset' });
  }
  return {
    mode: opts.apply ? 'apply' : 'dry-run',
    mutated: false,
    resets: actions.filter(a => a.action === 'reset').length,
    actions
  };
}

export function buildRequest(op, key) {
  if (op === 'hit' || op === 'delete' || op === 'update') throw new Error('refusing ' + op);
  if (op !== 'info' && op !== 'get' && op !== 'reset' && op !== 'create') throw new Error('refusing ' + op);
  if (!/^[A-Za-z0-9_.-]{3,64}$/.test(key)) throw new Error('refusing counter key');
  return { method: op === 'info' || op === 'get' || op === 'create' ? 'GET' : 'POST', path: '/' + op + '/' + S.NS + '/' + key };
}

function tomorrowBudapest() {
  return S.budapestDay(new Date(Date.now() + 86400000));
}

async function abacusInfo(key, fetchImpl, sleep) {
  const req = buildRequest('info', key);
  const res = await fetchImpl(S.DEFAULT_API + req.path, { method: req.method, headers: { accept: 'application/json' } });
  if (res.status === 429) {
    const wait = Number(res.headers.get('retry-after')) || 2000;
    await sleep(wait);
    return abacusInfo(key, fetchImpl, sleep);
  }
  const body = await res.json();
  return {
    key,
    http: res.status,
    exists: body.exists === true,
    value: body.exists === true && typeof body.value === 'number' ? body.value : null,
    is_genuine: body.is_genuine,
    // Abacus: is_genuine false means the key was created with /create and has an admin key.
    adminResetPossible: body.is_genuine === false,
    expiresIn: body.expires_in ?? null
  };
}

export async function collect(keys, fetchImpl, sleep) {
  const records = [];
  for (const key of keys) {
    records.push(await abacusInfo(key, fetchImpl, sleep));
    await sleep(400);
  }
  return records;
}

function backupDoc(records, meta) {
  return {
    createdAt: new Date().toISOString(),
    note: 'Read-only snapshot. Values were not modified. Abacus refreshes TTL on read. Firebase data was not read or written. Real and test hits are not separable: each counter is one integer.',
    namespace: S.NS,
    epoch: S.EPOCH,
    ...meta,
    records
  };
}

function printReport(doc) {
  const existing = doc.records.filter(r => r.exists);
  const legacy = existing.filter(r => !r.key.endsWith('-' + S.EPOCH));
  const epoch = doc.records.filter(r => r.key.endsWith('-' + S.EPOCH));
  console.log('DRY RUN — no counter was incremented, reset, or deleted.');
  console.log(`namespace ${S.NS}  epoch ${S.EPOCH}  existing ${existing.length}  absent ${doc.records.length - existing.length}`);
  console.log('Legacy counters (backup, left unchanged):');
  for (const r of legacy.sort((a, b) => a.key.localeCompare(b.key))) {
    console.log(`  ${r.key} = ${r.value}  is_genuine=${r.is_genuine}  adminResetPossible=${r.adminResetPossible}`);
  }
  const likes = legacy.filter(r => r.key.startsWith('like-')).reduce((s, r) => s + r.value, 0);
  const days = legacy.filter(r => /^d\d{8}$/.test(r.key));
  const daySum = days.reduce((s, r) => s + r.value, 0);
  const all = legacy.find(r => r.key === 'alltime');
  console.log(`like total ${likes}; daily sum ${daySum}; alltime ${all ? all.value : 'absent'}`);
  if (all && daySum !== all.value) console.log(`gap: alltime is ${all.value - daySum} away from the sum of scanned daily keys. Individual hits are not stored, so this is not corrected by subtraction.`);
  const epochExisting = epoch.filter(r => r.exists);
  console.log(`Epoch ${S.EPOCH} keys present: ${epochExisting.length} (absent keys read as 0 in the site and are not created by this dry run).`);
  console.log('Stale browsers: du_like-* and du_seen belong to the legacy keys. The site ignores them and never decrements, so a fresh total cannot go negative.');
  console.log('NOT APPLIED. Production counter values were not changed by this command.');
}

async function createEpoch(keys, fetchImpl, keyFile) {
  const saved = fs.existsSync(keyFile) ? JSON.parse(fs.readFileSync(keyFile, 'utf8')) : {};
  for (const key of keys) {
    if (!key.endsWith('-' + S.EPOCH)) continue;
    const req = buildRequest('create', key);
    const res = await fetchImpl(S.DEFAULT_API + req.path + '?initializer=0', { method: 'GET', headers: { accept: 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (res.status === 409) { console.log('exists, left as-is: ' + key); continue; }
    if (res.status !== 201 || !body.admin_key) throw new Error('create failed for ' + key + ' HTTP ' + res.status);
    saved[key] = { admin_key: body.admin_key, value: body.value, createdAt: new Date().toISOString() };
    fs.mkdirSync(path.dirname(keyFile), { recursive: true });
    fs.writeFileSync(keyFile, JSON.stringify(saved, null, 2) + '\n', { mode: 0o600 });
    try { fs.chmodSync(keyFile, 0o600); } catch {}
    console.log('created at 0: ' + key + ' (admin key written to ' + keyFile + ')');
  }
  console.log('Admin keys are only returned once. Keep that file private. It is gitignored.');
}

function epochKeys(allowed) {
  return [...allowed].filter(k => k.endsWith('-' + S.EPOCH));
}

export async function main(argv, env, io) {
  const apply = argv.includes('--apply');
  const create = argv.includes('--create-epoch');
  const confirm = (argv.find(a => a.startsWith('--confirm=')) || '').slice('--confirm='.length) || (argv.includes('--confirm') ? argv[argv.indexOf('--confirm') + 1] : '');
  const backupFlag = argv.find(a => a.startsWith('--backup='));
  const backupPath = backupFlag ? backupFlag.slice('--backup='.length) : path.join(root, 'tools', 'counter-backups', 'snapshot.json');
  if (apply && create) throw new Error('choose either --apply or --create-epoch');
  if (apply && confirm !== CONFIRM_RESET) throw new Error('refusing --apply without --confirm ' + CONFIRM_RESET);
  if (create && confirm !== CONFIRM_CREATE) throw new Error('refusing --create-epoch without --confirm ' + CONFIRM_CREATE);
  if (apply && !env.ABACUS_ADMIN_KEY) throw new Error('refusing --apply without ABACUS_ADMIN_KEY');

  const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const titles = titlesFromMain(source);
  const days = daysInclusive(SCAN_FROM, tomorrowBudapest());
  const allowed = allowlist({ titles, days });
  const keys = [...allowed].sort();
  const fetchImpl = io.fetchImpl;
  const sleep = io.sleep || (ms => new Promise(r => setTimeout(r, ms)));

  if (create) {
    console.log('CREATE EPOCH — this writes new zeroed counters. It does not change legacy values and does not delete anything.');
    await createEpoch(epochKeys(allowed), fetchImpl, path.join(root, 'tools', 'counter-backups', 'abacus-admin-keys.json'));
    return;
  }

  const records = await collect(keys, fetchImpl, sleep);
  const plan = planApply(records, { apply, allowed });
  const doc = backupDoc(records, { mode: plan.mode, titles, scanFrom: SCAN_FROM, scanTo: days[days.length - 1] });
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify(doc, null, 2) + '\n');
  printReport(doc);
  console.log('backup written: ' + backupPath);

  if (!apply) return;
  const resets = plan.actions.filter(a => a.action === 'reset');
  if (!resets.length) {
    console.error('APPLY refused to change anything: no allowlisted key has an admin key. Legacy counters were not modified.');
    process.exitCode = 2;
    return;
  }
  for (const action of resets) {
    const req = buildRequest('reset', action.key);
    const res = await fetchImpl(S.DEFAULT_API + req.path, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.ABACUS_ADMIN_KEY, accept: 'application/json' }
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.value !== 0) throw new Error('reset failed for ' + action.key + ' HTTP ' + res.status);
    console.log('reset to 0: ' + action.key);
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main(process.argv.slice(2), process.env, { fetchImpl: globalThis.fetch }).catch(err => {
    console.error(err.message || err);
    process.exit(1);
  });
}
