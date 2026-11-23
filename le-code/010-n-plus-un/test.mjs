// Le Code #010 — tests sur un VRAI PostgreSQL (embedded-postgres).
// Vérifie ce que dit la vidéo :
//   1. naïf : 100 commandes → 101 requêtes (1 pour la liste + 1 par commande) ;
//   2. groupée : 100 commandes → 2 requêtes (la liste + 1 seule pour les 30 clients) ;
//   3. jointure : 100 commandes → 1 requête ;
//   4. les trois versions renvoient exactement les mêmes lignes ;
//   5. 10 commandes → naïf 11 requêtes, groupée toujours 2 ;
//   6. Exemple avec une latence simulée de 2 ms par requête : le naïf est bien plus lent que la groupée ;
//   7. cas limites : liste vide → la groupée ne lance pas la requête ANY ; ids en double → chaque client demandé une fois ;
//   8. l'extrait de la vidéo est dans n-plus-un.js à l'identique ; ≤ 10 lignes, ≤ 32 caractères.
// Lancer : npm install && npm test   (Node 18+ ; télécharge les binaires PostgreSQL via npm)
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { listeNaive, listeGroupee, listeJointure, compterRequetes } from './n-plus-un.js';

const dir = mkdtempSync(join(tmpdir(), 'lecode010-'));
const port = 55000 + Math.floor(Math.random() * 1000);
const serveur = new EmbeddedPostgres({ databaseDir: dir, user: 'gazette', password: 'gazette', port, persistent: false, onLog: () => {} });
await serveur.initialise();
await serveur.start();
await serveur.createDatabase('boutique');
const conf = { host: 'localhost', port, user: 'gazette', password: 'gazette', database: 'boutique' };

let n = 0; const ok = (m) => { n++; console.log('✓ ' + m); };
const client = new pg.Client(conf);
await client.connect();
await client.query(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
// 30 clients, 100 commandes réparties entre eux.
await client.query(`INSERT INTO clients (id, nom) SELECT i, 'Client ' || i FROM generate_series(1, 30) i`);
await client.query(`INSERT INTO commandes (id, client_id, total)
                    SELECT i, (i % 30) + 1, 10 + i * 7 % 90 FROM generate_series(1, 100) i`);

const ANY = (q) => q.texte.includes('ANY(');
const mesurer = async (f, db) => { const t = performance.now(); const r = await f(db); return { r, ms: performance.now() - t }; };

try {
  const db = compterRequetes(client);

  // 1. Naïf.
  const naif = await listeNaive(db);
  assert.equal(naif.length, 100);
  assert.equal(db.nombre, 101);
  ok(`naïf : 100 commandes → ${db.nombre} requêtes (1 pour la liste + 1 par commande)`);

  // 2. Groupée.
  db.remettreAZero();
  const groupee = await listeGroupee(db);
  assert.equal(groupee.length, 100);
  assert.equal(db.nombre, 2);
  assert.equal(db.requetes[1].valeurs[0].length, 30);   // 30 clients distincts, demandés une fois chacun
  ok(`groupée : 100 commandes → ${db.nombre} requêtes (la liste + 1 seule pour les 30 clients, WHERE id = ANY($1))`);

  // 3. Jointure.
  db.remettreAZero();
  const jointure = await listeJointure(db);
  assert.equal(db.nombre, 1);
  ok(`jointure : 100 commandes → ${db.nombre} requête`);

  // 4. Mêmes résultats.
  assert.deepEqual(groupee, naif);
  assert.deepEqual(jointure, naif);
  assert.deepEqual(naif[0], { id: 1, client_id: 2, total: 17, nom: 'Client 2' });
  ok('les trois versions renvoient exactement les mêmes 100 lignes (id, client_id, total, nom)');

  // 5. N change : le naïf suit N, la groupée reste à 2.
  db.remettreAZero(); await listeNaive(db, 10); const n10 = db.nombre;
  db.remettreAZero(); await listeGroupee(db, 10); const g10 = db.nombre;
  assert.equal(n10, 11);
  assert.equal(g10, 2);
  ok(`10 commandes → naïf ${n10} requêtes, groupée toujours ${g10}`);

  // 6. Exemple : 2 ms d'aller-retour réseau simulé par requête.
  const lent = compterRequetes(client, { latenceMs: 2 });
  const tn = await mesurer(listeNaive, lent);
  const tg = await mesurer(listeGroupee, lent);
  assert.ok(tn.ms >= 101 * 2, `naïf ${tn.ms} ms`);
  assert.ok(tn.ms > tg.ms * 5, `naïf ${tn.ms} ms, groupée ${tg.ms} ms`);
  assert.deepEqual(tg.r, tn.r);
  ok(`Exemple, latence simulée 2 ms/requête : naïf ${Math.round(tn.ms)} ms (101 requêtes), groupée ${Math.round(tg.ms)} ms (2 requêtes)`);

  // 7. Cas limites.
  await client.query('BEGIN');
  await client.query('DELETE FROM commandes');
  db.remettreAZero();
  assert.deepEqual(await listeGroupee(db), []);
  assert.equal(db.nombre, 1);
  assert.equal(db.requetes.filter(ANY).length, 0);
  // ids en double : 10 commandes de 3 clients seulement
  await client.query(`INSERT INTO commandes (id, client_id, total)
                      SELECT i, (i % 3) + 1, 20 FROM generate_series(1, 10) i`);
  db.remettreAZero();
  const doublons = await listeGroupee(db);
  assert.equal(doublons.length, 10);
  assert.equal(db.nombre, 2);
  assert.deepEqual(db.requetes[1].valeurs[0], [2, 3, 1]);   // ordre de première apparition
  assert.deepEqual(doublons, await listeNaive(client, 100));
  await client.query('ROLLBACK');
  ok('cas limites : liste vide → [] sans requête ANY ; 10 commandes de 3 clients → ANY([2, 3, 1]), chaque client demandé une fois');

  // 8. L'extrait de la vidéo.
  const extrait = readFileSync(new URL('./extrait-video.txt', import.meta.url), 'utf8').trimEnd();
  const lignes = extrait.split('\n');
  assert.ok(lignes.length <= 10, lignes.length + ' lignes');
  assert.ok(lignes.every((l) => l.length <= 32), 'ligne trop longue : ' + lignes.find((l) => l.length > 32));
  const src = readFileSync(new URL('./n-plus-un.js', import.meta.url), 'utf8');
  assert.ok(src.includes(extrait), "l'extrait n'est pas dans n-plus-un.js à l'identique");
  ok(`l'extrait de la vidéo est le code de listeGroupee, à l'identique (${lignes.length} lignes, ≤ 32 caractères)`);

  console.log(`\n${n}/${n} tests verts`);
} finally {
  await client.end();
  await serveur.stop();
}
