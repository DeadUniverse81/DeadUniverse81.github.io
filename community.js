// DeadUniverse community: Live Wall, Fan Ideas, polls, moderation (Firebase modular SDK via CDN)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendEmailVerification, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc, query, orderBy, limit, onSnapshot, getDoc, setDoc, writeBatch, deleteDoc, serverTimestamp, increment } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const app = initializeApp({ apiKey: 'AIzaSyDo1lw45vpCCaOeEsQXDT6g5UfBrl6Xj9o', authDomain: 'deaduniverse.firebaseapp.com', projectId: 'deaduniverse', storageBucket: 'deaduniverse.firebasestorage.app', messagingSenderId: '853838206085', appId: '1:853838206085:web:220634cc4a5e689ad745ec' });
const auth = getAuth(app), db = getFirestore(app);
const $ = s => document.querySelector(s), esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SOON = '<p class="cm-soon">Coming online soon</p>';
let me = null, myName = '', admin = false, banned = false;

// ---- basic profanity filter (client-side only; moderation is the real safeguard) ----
const BAD = ['fuck', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'whore', 'bitch', 'retard', 'kurva', 'geci', 'fasz', 'picsa', 'pina', 'buzi', 'köcsög', 'kocsog', 'szar', 'baszd', 'basz', 'anyád', 'anyad', 'ribanc', 'cigány', 'nyomorék'];
const clean = s => BAD.reduce((t, w) => t.replace(new RegExp(w, 'gi'), m => m[0] + '*'.repeat(m.length - 1)), s);

// ---- auth modal ----
const modal = $('#cm-modal'), form = $('#cm-form'), msg = $('#cm-msg');
let mode = 'in';
function setMode(m) { mode = m; modal.dataset.mode = m; msg.textContent = '';
  $('#cm-title').textContent = { in: 'Sign in', up: 'Create account', reset: 'Reset password', sent: 'Almost there' }[m];
  $('#cm-go').textContent = { in: 'Enter', up: 'Join', reset: 'Send link' }[m]; }
const openM = m => { setMode(m); modal.hidden = false; setTimeout(() => form.querySelector('input:not([hidden])')?.focus(), 50); };
const closeM = () => { modal.hidden = true; };
document.addEventListener('click', e => { const a = e.target.closest('[data-cm]'); if (!a) return; e.preventDefault();
  const k = a.dataset.cm; if (k === 'out') signOut(auth); else if (k === 'close') closeM(); else if (k === 'verify') verifyCheck(); else if (k === 'resend') resend(); else openM(k); });
modal.addEventListener('click', e => { if (e.target === modal) closeM(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeM(); });
form.addEventListener('submit', async e => { e.preventDefault(); msg.textContent = '…';
  const em = form.email.value.trim(), pw = form.pw.value, nm = form.dname.value.trim();
  try {
    if (mode === 'reset') { await sendPasswordResetEmail(auth, em); msg.textContent = 'If this email has an account, a reset link is on its way.'; return; }
    if (mode === 'up') {
      if (nm.length < 2 || nm.length > 24) throw { code: 'name' };
      if (clean(nm) !== nm) throw { code: 'badname' };
      const c = await createUserWithEmailAndPassword(auth, em, pw);
      myName = nm; await setDoc(doc(db, 'users', c.user.uid), { name: nm, createdAt: serverTimestamp() });
      await sendEmailVerification(c.user); lastResend = Date.now(); setMode('sent'); msg.innerHTML = `<span class="cm-spam"><b class="cm-spam-t">✦ Verification email sent ✦</b>Check your inbox — and your <b>SPAM / Junk</b> folder! The verification email often lands there. Click the link, then sign out and sign in again.</span>`;
    } else { await signInWithEmailAndPassword(auth, em, pw); closeM(); }
  } catch (err) { msg.textContent = ({ name: 'Display name: 2–24 characters.', badname: 'Please choose another display name.', 'auth/email-already-in-use': 'This email already has an account.', 'auth/invalid-credential': 'Wrong email or password.', 'auth/wrong-password': 'Wrong email or password.', 'auth/user-not-found': 'Wrong email or password.', 'auth/weak-password': 'Password: at least 6 characters.', 'auth/invalid-email': 'Invalid email address.', 'auth/too-many-requests': 'Too many attempts. Try again later.', 'auth/unauthorized-domain': 'Coming online soon.', 'permission-denied': 'Coming online soon.' })[err.code] || 'Something went wrong. Please try again.'; }
});
let lastResend = 0;
async function resend() { if (!me) return; const w = 60000 - (Date.now() - lastResend);
  if (w > 0) return toast(`Please wait ${Math.ceil(w / 1000)} s before resending.`);
  lastResend = Date.now();
  try { await sendEmailVerification(me); toast('Verification email sent — check your Spam / Junk folder too.'); }
  catch (e) { toast(e.code === 'auth/too-many-requests' ? 'Too many requests. Try again in a few minutes.' : 'Could not send email. Try again later.'); } }
function toast(t, ms = 4200) { const el = $('#cm-toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), ms); }
async function verifyCheck() { if (!me) return; await me.reload(); await me.getIdToken(true); refreshUI(); toast(me.emailVerified ? 'Email verified. Welcome to the wall.' : 'Not verified yet. Check your inbox (and spam).'); }

function refreshUI() {
  const v = me && me.emailVerified, bar = document.querySelectorAll('.cm-acct');
  bar.forEach(b => b.innerHTML = !me ? '<button data-cm="in">Sign in</button><button data-cm="up">Join</button>'
    : `<span class="cm-who">${esc(myName || '…')}${admin ? ' <i>ADMIN</i>' : ''}</span><button data-cm="out">Sign out</button>`
      + (!v ? `<div class="cm-verify"><div class="cm-vin"><b class="cm-spam-t">✦ Verify your email to post ✦</b><p>Check your inbox — and your <b>SPAM / Junk</b> folder! The verification email often lands there. Click the link, then sign out and sign in again.</p><div class="cm-vbtns"><button data-cm="verify">I've verified</button><button data-cm="resend">Resend email</button></div></div></div>` : '')
      + (banned ? '<p class="cm-note">Your account cannot post.</p>' : ''));
  const can = !!(v && !banned);
  document.querySelectorAll('.cm-compose').forEach(f => { f.hidden = !can; });
  $('#poll-new').hidden = !admin;
  document.body.classList.toggle('cm-admin', admin);
  renderIdeas(); renderPolls();
}
onAuthStateChanged(auth, async u => { me = u; admin = banned = false; myName = '';
  if (u) { try { const p = await getDoc(doc(db, 'users', u.uid)); myName = p.exists() ? p.data().name : ''; } catch {}
    try { admin = (await getDoc(doc(db, 'admins', u.uid))).exists(); } catch {}
    try { banned = (await getDoc(doc(db, 'banned', u.uid))).exists(); } catch {}
    voted = {}; }
  refreshUI(); loadVotes(); });

// ---- LIVE WALL ----
const list = $('#chat-list'); let lastSend = 0;
onSnapshot(query(collection(db, 'messages'), orderBy('createdAt', 'desc'), limit(120)), s => {
  const near = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  const rows = s.docs.slice().reverse().map(d => { const m = d.data(), t = m.createdAt?.toDate?.() || new Date();
    return `<div class="cm-row"><span class="cm-t">${t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><b class="cm-n">${esc(m.name)}</b><span class="cm-x">${esc(clean(m.text))}</span>`
      + `<span class="cm-mod"><button data-del="messages/${d.id}" title="Delete">✕</button><button data-ban="${esc(m.uid)}" data-nm="${esc(m.name)}" title="Ban user">ban</button></span></div>`; });
  list.innerHTML = rows.join('') || '<p class="cm-empty">The void is silent. Say something.</p>';
  if (near || !list.dataset.init) { list.scrollTop = list.scrollHeight; list.dataset.init = 1; }
}, () => { list.innerHTML = SOON; });
$('#chat-form').addEventListener('submit', async e => { e.preventDefault(); const inp = e.target.text, t = inp.value.trim(); if (!t) return;
  const wait = 5000 - (Date.now() - lastSend); if (wait > 0) return toast(`Slow down: ${Math.ceil(wait / 1000)} s`);
  lastSend = Date.now(); inp.value = '';
  try { const b = writeBatch(db); b.set(doc(db, 'rate', me.uid), { last: serverTimestamp() }); b.set(doc(collection(db, 'messages')), { uid: me.uid, name: myName, text: t.slice(0, 300), createdAt: serverTimestamp() }); await b.commit(); }
  catch (err) { inp.value = t; toast(!me.emailVerified ? 'Verify your email first — check your Spam/Junk folder too.' : err.code === 'permission-denied' ? 'Could not post (wait 5 s and try again).' : 'Could not post.', 6000); }
});

// ---- FAN IDEAS ----
let ideas = [], voted = {};
const ilist = $('#ideas-list');
onSnapshot(query(collection(db, 'ideas'), orderBy('votes', 'desc'), limit(60)), s => { ideas = s.docs.map(d => ({ id: d.id, ...d.data() })); renderIdeas(); loadVotes(); }, () => { ideas = null; renderIdeas(); });
async function loadVotes() { if (!me || !ideas) return; await Promise.all(ideas.filter(i => voted[i.id] === undefined).map(async i => { try { voted[i.id] = (await getDoc(doc(db, 'ideas', i.id, 'votes', me.uid))).exists(); } catch { voted[i.id] = false; } })); renderIdeas(); }
function renderIdeas() { if (!ilist) return; if (ideas === null) { ilist.innerHTML = SOON; return; }
  ilist.innerHTML = ideas.length ? ideas.map(i => `<article class="idea"><button class="up${voted[i.id] ? ' on' : ''}" data-vote="${i.id}" ${voted[i.id] ? 'disabled' : ''} aria-label="Upvote">▲<b>${i.votes || 0}</b></button>
    <div><h4>${esc(clean(i.title))}</h4>${i.desc ? `<p>${esc(clean(i.desc))}</p>` : ''}<small>by ${esc(i.name)}</small></div>
    <span class="cm-mod"><button data-del="ideas/${i.id}" title="Delete">✕</button><button data-ban="${esc(i.uid)}" data-nm="${esc(i.name)}">ban</button></span></article>`).join('')
    : '<p class="cm-empty">No ideas yet. Be the first.</p>'; }
$('#idea-form').addEventListener('submit', async e => { e.preventDefault(); const f = e.target, ti = f.title.value.trim(), de = f.desc.value.trim();
  if (ti.length < 3) return toast('Title: at least 3 characters.');
  try { const b = writeBatch(db); b.set(doc(collection(db, 'ideas')), { uid: me.uid, name: myName, title: ti.slice(0, 80), desc: de.slice(0, 400), votes: 0, createdAt: serverTimestamp() }); await b.commit(); f.reset(); toast('Idea submitted.'); }
  catch { toast(me && !me.emailVerified ? 'Verify your email first — check your Spam/Junk folder too.' : 'Could not submit. Try again.', 6000); } });
document.addEventListener('click', async e => {
  const v = e.target.closest('[data-vote]');
  if (v) { if (!me) return openM('in'); if (!me.emailVerified) return toast('Verify your email first — check your Spam/Junk folder too.', 6000); const id = v.dataset.vote;
    try { const b = writeBatch(db); b.update(doc(db, 'ideas', id), { votes: increment(1) }); b.set(doc(db, 'ideas', id, 'votes', me.uid), { createdAt: serverTimestamp() }); await b.commit(); voted[id] = true; renderIdeas(); }
    catch { voted[id] = true; renderIdeas(); toast('Already voted (or coming online soon).'); } return; }
  const d = e.target.closest('[data-del]');
  if (d && admin) { if (confirm('Delete this?')) try { await deleteDoc(doc(db, ...d.dataset.del.split('/'))); } catch { toast('Delete failed.'); } return; }
  const bn = e.target.closest('[data-ban]');
  if (bn && admin) { if (confirm(`Ban ${bn.dataset.nm}? They will no longer be able to post or vote.`)) try { await setDoc(doc(db, 'banned', bn.dataset.ban), { name: bn.dataset.nm, at: serverTimestamp() }); toast('User banned.'); } catch { toast('Ban failed.'); } return; }
  const pv = e.target.closest('[data-poll]');
  if (pv) { if (!me) return openM('in'); if (!me.emailVerified) return toast('Verify your email first — check your Spam/Junk folder too.', 6000); const [id, o] = pv.dataset.poll.split(':');
    try { const b = writeBatch(db); b.update(doc(db, 'polls', id), { ['c' + o]: increment(1) }); b.set(doc(db, 'polls', id, 'votes', me.uid), { opt: +o, createdAt: serverTimestamp() }); await b.commit(); pvoted[id] = +o; renderPolls(); }
    catch { toast('Already voted (or coming online soon).'); } }
});

// ---- POLLS (admin-created) ----
let polls = [], pvoted = {};
const plist = $('#polls-list');
onSnapshot(query(collection(db, 'polls'), orderBy('createdAt', 'desc'), limit(5)), async s => { polls = s.docs.map(d => ({ id: d.id, ...d.data() }));
  if (me) await Promise.all(polls.map(async p => { try { const v = await getDoc(doc(db, 'polls', p.id, 'votes', me.uid)); pvoted[p.id] = v.exists() ? v.data().opt : undefined; } catch {} }));
  renderPolls(); }, () => { polls = []; renderPolls(); });
function renderPolls() { if (!plist) return;
  plist.innerHTML = polls.map(p => { const tot = p.opts.reduce((a, _, i) => a + (p['c' + i] || 0), 0) || 0, mine = pvoted[p.id];
    return `<article class="poll"><h4>${esc(p.q)}</h4>${p.opts.map((o, i) => { const pc = tot ? Math.round((p['c' + i] || 0) / tot * 100) : 0;
      return `<button class="opt${mine === i ? ' on' : ''}" data-poll="${p.id}:${i}" ${mine !== undefined ? 'disabled' : ''}><span class="fill" style="width:${mine !== undefined ? pc : 0}%"></span><span>${esc(o)}</span>${mine !== undefined ? `<b>${pc}%</b>` : ''}</button>`; }).join('')}
      <small>${tot} vote${tot === 1 ? '' : 's'}</small><span class="cm-mod"><button data-del="polls/${p.id}">✕</button></span></article>`; }).join(''); }
$('#poll-new').addEventListener('submit', async e => { e.preventDefault(); const f = e.target, q = f.q.value.trim(), opts = f.opts.value.split('|').map(s => s.trim()).filter(Boolean).slice(0, 4);
  if (q.length < 3 || opts.length < 2) return toast('Question + 2–4 options separated by |');
  try { await setDoc(doc(collection(db, 'polls')), { q, opts, c0: 0, c1: 0, c2: 0, c3: 0, createdAt: serverTimestamp() }); f.reset(); toast('Poll created.'); } catch { toast('Poll failed.'); } });
