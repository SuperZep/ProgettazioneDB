/* Estrae da index.html i contenuti necessari al server (giochi, risposte, query, regole della verifica)
   e li scrive in content.json. Va rieseguito ogni volta che cambiano i giochi: firebase.json lo fa da solo prima del deploy. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const {JSDOM} = require('jsdom');
const file = path.join(__dirname, '..', '..', 'index.html');
const html = fs.readFileSync(file, 'utf8').replace(/apiKey: '[^']*'/, "apiKey: ''").replace(/projectId: '[^']*'/, "projectId: ''");
const dom = new JSDOM(html, {runScripts: 'dangerously', url: 'https://localhost/'});
const S = e => dom.window.eval(e);
const out = S(`(() => {
  const courses = {};
  for(const c of Object.values(COURSES)){
    courses[c.id] = {coll: c.coll, examEnabled: !!c.examEnabled, examWrite: c.examWrite || 0, sql: !!c.sql,
      levels: c.levels.map(l => ({id: l.id, games: l.games.map(g => ({
        id: g.id, type: g.type, show: g.show || null, exam: g.exam !== false, ordered: !!g.ordered, solution: g.solution || null,
        buckets: (g.buckets || []).map(b => b.id),
        items: g.type === 'order' || g.type === 'write' ? [] : g.items.map(it => ({id: it.id, answer: it.answer}))
      }))}))};
  }
  return JSON.parse(JSON.stringify({
    config: {PASS_THRESHOLD: CONFIG.PASS_THRESHOLD, EXAM: CONFIG.EXAM, REVIEW: CONFIG.REVIEW, WRITE_POINTS, region: CONFIG.FUNCTIONS_REGION},
    sql: {schema: AZ_SCHEMA, data: AZ_DATA, more: AZ_DATA_MORE, hidden: AZ_DATA_HIDDEN},
    courses
  }));
})()`);
out.version = crypto.createHash('sha256').update(JSON.stringify(out)).digest('hex').slice(0, 12);
fs.writeFileSync(path.join(__dirname, '..', 'content.json'), JSON.stringify(out));
const n = Object.values(out.courses).map(c => `${c.coll}: ${c.levels.reduce((a,l)=>a+l.games.length,0)} giochi`).join(', ');
console.log(`content.json aggiornato (versione ${out.version}) — ${n}`);
