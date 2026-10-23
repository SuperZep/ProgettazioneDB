/* Collaudo delle Cloud Functions senza Firebase: Firestore e Functions sono simulati in memoria.
   Viene eseguito automaticamente prima di ogni deploy (firebase.json → predeploy). */
'use strict';
const Module = require('module');
const assert = require('assert');
const store = {};                                   // Firestore finto: {coll: {uid: doc}}
const clone = x => JSON.parse(JSON.stringify(x));
const ref = (coll, id) => ({
  coll, id,
  async get(){ const d = store[coll] && store[coll][id]; return {exists: !!d, data: () => d && clone(d)}; },
  async update(u){ Object.assign(store[coll][id], clone(u)); }
});
const fakeDb = {
  collection: coll => ({doc: id => ref(coll, id)}),
  async runTransaction(fn){ return fn({get: r => r.get(), update: (r, u) => { Object.assign(store[r.coll][r.id], clone(u)); }}); }
};
class HttpsError extends Error{ constructor(code, msg, details){ super(msg); this.code = code; this.details = details; } }
const origLoad = Module._load;
Module._load = function(req, ...rest){
  if(req === 'firebase-admin') return {initializeApp(){}, firestore: () => fakeDb};
  if(req === 'firebase-functions/v2/https') return {onCall: fn => fn, HttpsError};
  if(req === 'firebase-functions/v2') return {setGlobalOptions(){}};
  return origLoad.call(this, req, ...rest);
};
const fns = require('../index.js');
const C = require('../content.json');
const core = require('../exam-core');

let ok = 0;
const t = async (name, f) => { try{ await f(); ok++; console.log('  ✔ ' + name); } catch(e){ console.log('  ✘ ' + name + ' → ' + e.message); process.exitCode = 1; } };
const allSolved = c => Object.fromEntries(c.levels.flatMap(l => l.games).map(g => [core.gk(g.id), {solved: true, attempts: 1, errors: 0}]));
const newDoc = (c, extra = {}) => ({name:'Test', email:'t@t.it', games: allSolved(c), review:{}, exam:null, examAttempts:[], extraAttempts:0, passed:null, history:[], ...extra});
const req = (uid, course, data = {}) => ({auth: {uid}, data: {course, ...data}});
const answersFor = (c, exam, wrongBuckets = 0, badQueries = 0) => {
  const ans = {}; let wb = 0, bq = 0;
  for(const eg of exam.games){
    const g = core.gameById(c, eg.id);
    if(eg.write){ ans[eg.id] = {sql: bq++ < badQueries ? 'SELECT 1' : g.solution}; continue; }
    ans[eg.id] = Object.fromEntries(eg.items.map(iid => { const it = g.items.find(x => x.id === iid);
      return [iid, wb++ < wrongBuckets ? g.buckets.find(b => b !== it.answer) : it.answer]; }));
  }
  return ans;
};

(async () => {
  console.log(`Collaudo correzione sul server (contenuti ${C.version})`);
  await t('ping risponde', async () => assert.strictEqual((await fns.ping()).ok, true));
  await t('senza login: rifiutato', async () => {
    await assert.rejects(fns.startExam({data:{course:'db'}}), e => e.code === 'unauthenticated');
  });
  for(const id of ['db', 'sql']){
    const c = C.courses[id], coll = c.coll;
    store[coll] = {};
    await t(`${id}: allenamento incompleto → non si può iniziare`, async () => {
      store[coll].u0 = newDoc(c, {games: {}});
      await assert.rejects(fns.startExam(req('u0', id)), e => e.code === 'failed-precondition');
    });
    let exam;
    await t(`${id}: avvio verifica, domande salvate dal server`, async () => {
      store[coll].u1 = newDoc(c);
      exam = (await fns.startExam(req('u1', id))).exam;
      assert.strictEqual(exam.games.length, c.levels.length + (c.examWrite || 0));
      assert.deepStrictEqual(store[coll].u1.exam, exam);
    });
    await t(`${id}: ripresa della stessa verifica`, async () => {
      const again = (await fns.startExam(req('u1', id))).exam;
      assert.strictEqual(again.startedAt, exam.startedAt);
    });
    await t(`${id}: risposte giuste → 100% e attestato`, async () => {
      const r = await fns.submitExam(req('u1', id, {answers: answersFor(c, exam)}));
      assert.strictEqual(r.percent, 100); assert.strictEqual(r.passed, true);
      const d = store[coll].u1;
      assert.ok(d.passed && d.passed.code.startsWith('DBQ-') && d.passed.server);
      assert.strictEqual(d.exam, null); assert.strictEqual(d.examAttempts.length, 1);
    });
    await t(`${id}: dopo il superamento non si riparte`, async () => {
      await assert.rejects(fns.startExam(req('u1', id)), e => e.code === 'failed-precondition');
    });
    await t(`${id}: risposte inventate dal browser non contano (si corregge sulle domande del server)`, async () => {
      store[coll].u2 = newDoc(c);
      const ex2 = (await fns.startExam(req('u2', id))).exam;
      const fake = {}; fake['finto'] = {x:'y'};
      const r = await fns.submitExam(req('u2', id, {answers: fake}));
      assert.strictEqual(r.correct, 0); assert.strictEqual(r.total, ex2.games.reduce((a, g) => a + (g.write ? C.config.WRITE_POINTS : g.items.length), 0));
      assert.strictEqual(store[coll].u2.passed, null);
      assert.ok(Object.keys(store[coll].u2.review).length > 0, 'errori nel ripasso');
    });
    await t(`${id}: doppia consegna rifiutata`, async () => {
      await assert.rejects(fns.submitExam(req('u2', id, {answers:{}})), e => e.code === 'failed-precondition');
    });
    await t(`${id}: attesa tra un tentativo e l’altro`, async () => {
      await assert.rejects(fns.startExam(req('u2', id)), e => e.code === 'failed-precondition' && !!(e.details && e.details.nextAt));
    });
    await t(`${id}: tentativo concesso dal docente → si riparte subito`, async () => {
      store[coll].u2.extraAttempts = 1; store[coll].u2.cooldownResetAt = new Date(Date.now() + 1000).toISOString();
      const ex3 = (await fns.startExam(req('u2', id))).exam;
      const r = await fns.submitExam(req('u2', id, {answers: answersFor(c, ex3, 2, c.examWrite ? 1 : 0)}));
      const expect = r.total - 2 - (c.examWrite ? C.config.WRITE_POINTS : 0);
      assert.strictEqual(r.correct, expect);
    });
    if(c.examWrite) await t(`${id}: query scritte corrette anche sui dati nascosti`, async () => {
      const g = core.gameById(c, 's3.5');
      const SQL = await require('sql.js')();
      assert.ok(core.checkQuery(SQL, C.sql, g, g.solution).ok);
      assert.ok(core.checkQuery(SQL, C.sql, g, "select ragione_sociale, citta from Cliente where citta = 'Rimini';").ok);
      const hard = core.checkQuery(SQL, C.sql, g, 'SELECT ragione_sociale, citta FROM Cliente WHERE id_cliente IN (1, 4, 6)');
      assert.ok(!hard.ok && /non è generale/.test(hard.msg));
      assert.ok(!core.checkQuery(SQL, C.sql, g, 'DELETE FROM Cliente').ok);
    });
  }
  console.log(`${ok} controlli superati` + (process.exitCode ? ' — CI SONO ERRORI' : ''));
})();
