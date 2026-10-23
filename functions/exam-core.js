/* Logica della verifica finale, identica a quella dell'app ma eseguita sul server.
   Nessuna dipendenza da Firebase: si può collaudare con `npm test`. */
'use strict';
const DAY = 86400000;
const gk = id => 'g' + String(id).replace(/\./g, '_');
function shuffle(arr){
  const a = [...arr];
  for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const pick = a => a[Math.floor(Math.random() * a.length)];
/* Sorteggia n elementi, almeno uno per contenitore finché possibile */
function sampleItems(game, n){
  n = Math.min(n, game.items.length);
  const pool = shuffle(game.items);
  if(n === pool.length) return pool;
  const out = [];
  for(const b of shuffle(game.buckets)){
    const i = pool.findIndex(it => it.answer === b);
    if(i >= 0 && out.length < n) out.push(pool.splice(i, 1)[0]);
  }
  while(out.length < n) out.push(pool.shift());
  return shuffle(out);
}
const allGames = c => c.levels.flatMap(l => l.games);
const gameById = (c, id) => allGames(c).find(g => g.id === id);
const trainingDone = (c, d) => allGames(c).every(g => d.games && d.games[gk(g.id)] && d.games[gk(g.id)].solved);
const examAllowed = (cfg, d) => cfg.EXAM.ATTEMPTS + (d.extraAttempts || 0);

/* Si può iniziare la verifica? */
function examGate(cfg, c, d, now = Date.now()){
  if(!c.examEnabled) return {ok:false, reason:'La verifica di questo corso non è ancora disponibile.'};
  if(d.passed) return {ok:false, reason:'Hai già superato la verifica.'};
  if(d.exam) return {ok:true, resume:true};
  if(!trainingDone(c, d)) return {ok:false, reason:'Completa prima tutti i giochi dell’allenamento.'};
  const tries = d.examAttempts || [];
  if(tries.length >= examAllowed(cfg, d)) return {ok:false, reason:'Hai usato tutti i tentativi disponibili: chiedi al docente.'};
  const last = tries[tries.length - 1];
  if(last){
    const end = new Date(last.completedAt).getTime() + cfg.EXAM.COOLDOWN_HOURS * 3600000;
    const reset = d.cooldownResetAt && d.cooldownResetAt > last.completedAt;
    if(now < end && !reset) return {ok:false, reason:'Devi aspettare prima di riprovare.', nextAt:new Date(end).toISOString()};
  }
  return {ok:true};
}
function buildExam(cfg, c){
  const games = c.levels.map(lv => {
    const pool = lv.games.filter(g => g.type !== 'order' && g.type !== 'write' && g.exam !== false);
    const g = pick(pool);
    return {id:g.id, items: sampleItems(g, cfg.EXAM.ITEMS_PER_LEVEL).map(it => it.id)};
  });
  const wl = shuffle(c.levels.filter(l => l.games.some(g => g.type === 'write'))).slice(0, c.examWrite || 0).sort((a,b) => a.id - b.id);
  for(const l of wl) games.push({id: pick(l.games.filter(g => g.type === 'write')).id, write:true});
  return {startedAt:new Date().toISOString(), step:0, games, answers:{}};
}

/* ---- Correzione delle query (stessa regola dell'app: risultato uguale, anche sui dati nascosti) ---- */
const normVal = v => {
  if(v === null || v === undefined) return null;
  if(typeof v === 'number') return Math.round(v * 100) / 100;
  if(/^-?\d+(\.\d+)?$/.test(String(v).trim())) return Math.round(parseFloat(v) * 100) / 100;
  return String(v);
};
const rowKey = r => JSON.stringify(r.map(normVal));
function compareResults(mine, exp, ordered){
  if(mine.cols.length !== exp.cols.length) return 'cols';
  const a = mine.rows.map(rowKey), b = exp.rows.map(rowKey);
  if(a.length !== b.length) return 'count';
  if(a.join('\n') === b.join('\n')) return 'ok';
  if([...a].sort().join('\n') === [...b].sort().join('\n')) return ordered ? 'order' : 'ok';
  return 'rows';
}
const stripComments = s => String(s).replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
function makeDB(SQL, sqlData, mode){
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  db.exec(sqlData.schema); db.exec(sqlData.data); db.exec(sqlData.more);
  if(mode === 'hidden') db.exec(sqlData.hidden);
  return db;
}
function runQuery(SQL, sqlData, mode, q){
  const db = makeDB(SQL, sqlData, mode);
  try{
    const st = db.prepare(stripComments(q).trim().replace(/;\s*$/, ''));
    const cols = st.getColumnNames(), rows = [];
    while(st.step()) rows.push(st.get());
    st.free();
    return {cols, rows};
  }catch(e){ return {error:e.message}; }
  finally{ db.close(); }
}
function checkQuery(SQL, sqlData, g, text){
  const clean = stripComments(text || '').trim();
  if(!clean) return {ok:false, msg:'Nessuna query.'};
  if(!/^SELECT\b/i.test(clean)) return {ok:false, msg:'La risposta deve essere una query SELECT.'};
  if(clean.replace(/;\s*$/, '').includes(';')) return {ok:false, msg:'Va scritta una sola query.'};
  const mine = runQuery(SQL, sqlData, 'full', text), exp = runQuery(SQL, sqlData, 'full', g.solution);
  if(mine.error) return {ok:false, msg:'Il database risponde con un errore: ' + mine.error};
  const c = compareResults(mine, exp, g.ordered);
  const msgs = {cols:'Numero di colonne diverso da quello richiesto.', count:'Numero di righe diverso da quello atteso.',
                order:'Righe giuste ma nell’ordine sbagliato.', rows:'Valori diversi da quelli attesi.'};
  if(c !== 'ok') return {ok:false, msg:msgs[c]};
  const mineH = runQuery(SQL, sqlData, 'hidden', text), expH = runQuery(SQL, sqlData, 'hidden', g.solution);
  if(mineH.error || compareResults(mineH, expH, g.ordered) !== 'ok')
    return {ok:false, msg:'Risultato giusto con questi dati, ma la query non è generale: sui dati nascosti sbaglia.'};
  return {ok:true, msg:'Risultato corretto, anche sui dati nascosti.'};
}

/* Corregge la verifica usando le domande salvate sul server (exam), non quelle inviate dal browser */
function gradeExam(SQL, cfg, c, sqlData, exam, answers){
  let correct = 0, total = 0; const wrong = [], all = [], writeRes = {};
  for(const eg of exam.games){
    const g = gameById(c, eg.id), ans = (answers && answers[eg.id]) || {};
    if(!g) continue;
    if(eg.write){
      const key = eg.id + '|*'; all.push(key); total += cfg.WRITE_POINTS;
      const r = SQL ? checkQuery(SQL, sqlData, g, typeof ans.sql === 'string' ? ans.sql.slice(0, 4000) : '') : {ok:false, msg:'Motore SQL non disponibile.'};
      writeRes[eg.id] = r;
      if(r.ok) correct += cfg.WRITE_POINTS; else wrong.push(key);
      continue;
    }
    for(const iid of eg.items){
      const it = g.items.find(x => x.id === iid), key = eg.id + '|' + iid;
      all.push(key); total++;
      if(it && ans[iid] === it.answer) correct++; else wrong.push(key);
    }
  }
  return {correct, total, percent: total ? Math.round(1000 * correct / total) / 10 : 0, wrong, all, writeRes};
}
function makeCode(s){
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
  for(const ch of s){ const c = ch.charCodeAt(0); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822519) >>> 0; }
  const x = (h1.toString(36) + h2.toString(36)).toUpperCase().padEnd(8, '0');
  return 'DBQ-' + x.slice(0, 4) + '-' + x.slice(4, 8);
}
function reviewAdd(review, keys, cfg, nowIso){
  const out = {...(review || {})};
  const due = new Date(new Date(nowIso).getTime() + cfg.REVIEW.DAYS[0] * DAY).toISOString();
  for(const k of keys){
    const r = {...(out[k] || {added: nowIso, lapses: 0})};
    r.streak = 0; r.lapses = (r.lapses || 0) + 1; r.due = due; out[k] = r;
  }
  return out;
}
module.exports = {gk, sampleItems, trainingDone, examGate, buildExam, gradeExam, checkQuery, compareResults, makeCode, reviewAdd, examAllowed, gameById};
