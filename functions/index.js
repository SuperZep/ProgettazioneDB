/* Cloud Functions di DB Quest + SQL Quest: la verifica finale viene avviata e corretta qui,
   così il punteggio e l'attestato non si possono modificare dal browser. */
'use strict';
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {setGlobalOptions} = require('firebase-functions/v2');
const admin = require('firebase-admin');
const initSqlJs = require('sql.js');
const core = require('./exam-core');
const C = require('./content.json');   // generato da index.html con `npm run build-content`

admin.initializeApp();
const db = admin.firestore();
setGlobalOptions({region: C.config.region, maxInstances: 5, memory: '512MiB'});
let SQLp = null;
const getSQL = () => (SQLp = SQLp || initSqlJs());

function courseOf(req){
  if(!req.auth || !req.auth.uid) throw new HttpsError('unauthenticated', 'Accedi prima di iniziare la verifica.');
  const c = C.courses[req.data && req.data.course];
  if(!c) throw new HttpsError('invalid-argument', 'Corso sconosciuto.');
  return {c, ref: db.collection(c.coll).doc(req.auth.uid)};
}

/* Serve all'app per sapere se la correzione sul server è attiva */
exports.ping = onCall(() => ({ok:true, version:C.version}));

/* Avvia (o riprende) la verifica: le domande vengono sorteggiate e salvate dal server */
exports.startExam = onCall(async req => {
  const {c, ref} = courseOf(req);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if(!snap.exists) throw new HttpsError('failed-precondition', 'Nessun progresso trovato per questo corso.');
    const d = snap.data();
    const gate = core.examGate(C.config, c, d);
    if(!gate.ok) throw new HttpsError('failed-precondition', gate.reason, {nextAt: gate.nextAt || null});
    if(gate.resume) return {exam: d.exam};
    const exam = core.buildExam(C.config, c);
    tx.update(ref, {exam, examDraft: null});
    return {exam};
  });
});

/* Consegna: corregge le risposte sulle domande salvate dal server e registra il risultato */
exports.submitExam = onCall(async req => {
  const {c, ref} = courseOf(req);
  const snap = await ref.get();
  const d = snap.exists ? snap.data() : null;
  if(!d || !d.exam) throw new HttpsError('failed-precondition', 'Nessuna verifica in corso.');
  const answers = (req.data && typeof req.data.answers === 'object' && req.data.answers) || {};
  const SQL = c.sql ? await getSQL() : null;
  const sc = core.gradeExam(SQL, C.config, c, C.sql, d.exam, answers);
  const at = new Date().toISOString(), passed = sc.percent >= C.config.PASS_THRESHOLD;
  return db.runTransaction(async tx => {
    const s2 = await tx.get(ref), cur = s2.data();
    if(!cur || !cur.exam || cur.exam.startedAt !== d.exam.startedAt) throw new HttpsError('aborted', 'La verifica è già stata consegnata.');
    const n = (cur.examAttempts || []).length + 1;
    const attempt = {n, startedAt: cur.exam.startedAt, completedAt: at, correct: sc.correct, total: sc.total, percent: sc.percent, passed,
                     wrong: sc.wrong, items: sc.all, server: true,
                     queries: Object.fromEntries(cur.exam.games.filter(g => g.write).map(g => [g.id, String((answers[g.id] || {}).sql || '').slice(0, 4000)]))};
    const upd = {
      examAttempts: [...(cur.examAttempts || []), attempt],
      exam: null, examDraft: null, lastSeen: at,
      review: core.reviewAdd(cur.review, sc.wrong, C.config, at)
    };
    if(passed) upd.passed = {percent: sc.percent, correct: sc.correct, total: sc.total, at, attempt: n, code: core.makeCode(req.auth.uid + '|' + at), server: true};
    tx.update(ref, upd);
    return {correct: sc.correct, total: sc.total, percent: sc.percent, passed, wrong: sc.wrong, all: sc.all, writeRes: sc.writeRes, at};
  });
});
