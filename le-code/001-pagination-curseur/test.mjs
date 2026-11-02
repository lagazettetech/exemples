// Le Code #001 — Défilement infini : pagination OFFSET vs pagination par curseur (PostgreSQL).
// Exécute exactement les requêtes affichées dans la vidéo (offset.sql, cursor.sql) sur un vrai moteur PostgreSQL
// (PGlite, Postgres compilé en WebAssembly) et vérifie ce que dit la vidéo :
//   1. avec OFFSET, si 3 posts arrivent en haut entre la page 1 et la page 2, la page 2 contient 3 doublons ;
//   2. avec le curseur (date, id), aucun doublon et aucun post sauté, même scénario ;
//   3. l'identifiant départage deux posts publiés à la même seconde (aucun post perdu à la frontière des pages) ;
//   4. avec l'index (created_at, id), le plan de la requête curseur utilise l'index.
// Lancer : npm install && npm test
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const sql = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const db = new PGlite();
await db.exec(sql('schema.sql'));

// 100 posts, un par minute, avec deux posts à la MÊME seconde pile à la frontière page 1 / page 2 (test du départage)
const t0 = Date.parse('2026-11-02T08:00:00Z');
for (let i = 1; i <= 100; i++) {
  let ts = new Date(t0 + i * 60_000);
  if (i === 80) ts = new Date(t0 + 81 * 60_000); // post 80 et post 81 publiés à la même seconde
  await db.query('INSERT INTO posts (id, created_at, title) VALUES ($1, $2, $3)', [i, ts.toISOString(), `Post ${i}`]);
}
const addNew = async () => {
  for (let i = 101; i <= 103; i++) {
    await db.query('INSERT INTO posts (id, created_at, title) VALUES ($1, $2, $3)', [i, new Date(t0 + (100 + i) * 60_000).toISOString(), `Nouveau ${i}`]);
  }
};
const ids = (r) => r.rows.map((x) => x.id);
const dup = (a, b) => a.filter((x) => b.includes(x));
const log = [];

// ---- 1. OFFSET ----
const offsetQ = sql('offset.sql');                       // LIMIT 20 OFFSET $1
const p1 = ids(await db.query(offsetQ, [0]));
await addNew();                                          // 3 nouveaux posts arrivent en haut pendant la lecture
const p2 = ids(await db.query(offsetQ, [20]));
const d = dup(p1, p2);
log.push(`OFFSET   page 1 : ${p1.join(',')}`, `OFFSET   page 2 : ${p2.join(',')}`, `OFFSET   doublons : ${d.join(',')} (${d.length})`);
assert.equal(d.length, 3, 'OFFSET doit produire 3 doublons');

// ---- 2. Curseur (même scénario, base remise à zéro) ----
await db.exec('DELETE FROM posts WHERE id > 100');
const cursorQ = sql('cursor.sql');                       // WHERE (created_at, id) < ($1, $2) ... LIMIT 20
const first = await db.query('SELECT * FROM posts ORDER BY created_at DESC, id DESC LIMIT 20');
const c1 = ids(first);
const last = first.rows.at(-1);
await addNew();
const second = await db.query(cursorQ, [last.created_at, last.id]);
const c2 = ids(second);
const dc = dup(c1, c2);
log.push(`CURSEUR  page 1 : ${c1.join(',')}`, `CURSEUR  page 2 : ${c2.join(',')}`, `CURSEUR  doublons : ${dc.length}`);
assert.equal(dc.length, 0, 'Le curseur ne doit produire aucun doublon');
// aucun post sauté : pages 1+2 = les 40 posts les plus récents de l'état initial (ids 100..61 avec 80/81 au même instant)
const expected = (await db.query('SELECT id FROM posts WHERE id <= 100 ORDER BY created_at DESC, id DESC LIMIT 40')).rows.map((x) => x.id);
assert.deepEqual([...c1, ...c2], expected, 'Le curseur ne doit sauter aucun post');
log.push('CURSEUR  aucun post sauté : OK');

// ---- 3. Départage par id à la même seconde ----
const same = (await db.query('SELECT id FROM posts WHERE created_at = (SELECT created_at FROM posts WHERE id = 80) ORDER BY id')).rows.map((x) => x.id);
assert.deepEqual(same, [80, 81]);
log.push(`Même seconde : posts ${same.join(' et ')} — tous deux présents une seule fois : ${[...c1, ...c2].filter((x) => same.includes(x)).length === 2 ? 'OK' : 'ÉCHEC'}`);

// ---- 4. L'index est utilisé ----
await db.exec('SET enable_seqscan = off');               // petite table : on force le planificateur à montrer s'il PEUT utiliser l'index
const plan = (await db.query('EXPLAIN ' + cursorQ.replace('$1', `'${new Date(last.created_at).toISOString()}'`).replace('$2', String(last.id)))).rows.map((r) => r['QUERY PLAN']).join('\n');
assert.match(plan, /Index/, "La requête curseur doit pouvoir utiliser l'index");
log.push('Plan curseur : ' + plan.split('\n').find((l) => /Index/.test(l)).trim());

console.log(log.join('\n'));
console.log('\nTOUS LES TESTS PASSENT');
