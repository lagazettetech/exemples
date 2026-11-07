// Le Code #005 — tests sur un VRAI PostgreSQL (embedded-postgres), avec deux connexions = deux acheteurs.
// Vérifie ce que dit la vidéo :
//   1. lire puis écrire dans une transaction : 1 article en stock, 2 commandes passent, le stock finit à −1 ;
//   2. le 2e UPDATE attend la fin de la 1re transaction (il est bloqué, puis il passe quand même) ;
//   3. l'UPDATE atomique `… WHERE id = $1 AND stock > 0` : 1 commande, puis 0 ligne pour le 2e acheteur = rupture ;
//   4. 50 acheteurs en même temps sur 1 article : exactement 1 commande, stock 0 ;
//   5. SELECT … FOR UPDATE : le 2e acheteur attend, lit 0 et refuse ;
//   6. le niveau d'isolation par défaut est bien Read Committed ;
//   7. paniers de 2 articles (requête atomique par article, ou FOR UPDATE … ORDER BY id) : 1 panier, pas d'interblocage ;
//   8. l'extrait de la vidéo est identique à la requête testée (≤ 10 lignes, ≤ 32 caractères).
// Lancer : npm install && npm test   (Node 18+ ; télécharge les binaires PostgreSQL via npm)
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { SCHEMA, UPDATE_ATOMIQUE, commandeNaive, commander, commanderAvecVerrou, commanderPanier, commanderPanierAvecVerrou } from './commande.js';

const dir = mkdtempSync(join(tmpdir(), 'lecode005-'));
const port = 54000 + Math.floor(Math.random() * 1000);
const serveur = new EmbeddedPostgres({ databaseDir: dir, user: 'gazette', password: 'gazette', port, persistent: false, onLog: () => {} });
await serveur.initialise();
await serveur.start();
await serveur.createDatabase('boutique');
const conf = { host: 'localhost', port, user: 'gazette', password: 'gazette', database: 'boutique' };
const connexion = async () => { const c = new pg.Client(conf); await c.connect(); return c; };

let n = 0; const ok = (m) => { n++; console.log('OK   ' + m); };
const EN_ATTENTE = Symbol('en attente');
const bloque = (p, ms = 400) => Promise.race([p.then(() => 'fini'), new Promise((r) => setTimeout(() => r(EN_ATTENTE), ms))]);
const admin = await connexion();
await admin.query(SCHEMA);
const remettre = async (stock = 1) => { await admin.query('TRUNCATE commandes'); await admin.query('DELETE FROM produits'); await admin.query("INSERT INTO produits VALUES (1, 'Console', $1)", [stock]); };
const etat = async () => ({
  stock: (await admin.query('SELECT stock FROM produits WHERE id = 1')).rows[0].stock,
  commandes: Number((await admin.query('SELECT count(*) FROM commandes')).rows[0].count),
});

try {
  // 6. Niveau par défaut
  assert.equal((await admin.query('SHOW default_transaction_isolation')).rows[0].default_transaction_isolation, 'read committed');
  ok('niveau d\'isolation par défaut : read committed');

  // 1 + 2. Le réflexe, dans une transaction, avec deux clics entrelacés
  await remettre(1);
  const [ca, cb] = [await connexion(), await connexion()];
  const A = commandeNaive(ca, 1, 'A'), B = commandeNaive(cb, 1, 'B');
  await A.debut(); await B.debut();
  const lu = [await A.lire(), await B.lire()];
  assert.deepEqual(lu, [1, 1]);                                  // les deux voient « 1 en stock » : feu vert
  await A.ecrire(); await A.enregistrer();
  const ecritureB = B.ecrire();                                  // B veut la même ligne : verrouillée par A
  assert.equal(await bloque(ecritureB), EN_ATTENTE);
  ok('le 2e UPDATE attend la fin de la transaction de A (ligne verrouillée)');
  await A.valider();
  await ecritureB; await B.enregistrer(); await B.valider();     // … puis il passe : rien ne revérifie le « 1 » lu par B
  let e = await etat();
  assert.deepEqual(e, { stock: -1, commandes: 2 });
  ok('lire puis écrire, même dans une transaction : 1 article, 2 commandes, stock −1');

  // 3. L'UPDATE atomique, même entrelacement
  await remettre(1);
  await ca.query('BEGIN'); await cb.query('BEGIN');
  const ra = await ca.query(UPDATE_ATOMIQUE, [1]);
  const rbPromesse = cb.query(UPDATE_ATOMIQUE, [1]);
  assert.equal(await bloque(rbPromesse), EN_ATTENTE);            // B attend A…
  await ca.query("INSERT INTO commandes (produit_id, acheteur) VALUES (1, 'A')"); await ca.query('COMMIT');
  const rb = await rbPromesse;                                   // … puis la condition stock > 0 est réévaluée : fausse
  await cb.query('ROLLBACK');
  assert.equal(ra.rowCount, 1); assert.equal(rb.rowCount, 0);
  e = await etat();
  assert.deepEqual(e, { stock: 0, commandes: 1 });
  ok('UPDATE … WHERE stock > 0 : A = 1 ligne (commande), B attend puis 0 ligne (rupture), stock 0');

  // 4. 50 acheteurs en même temps, 1 article
  await remettre(1);
  const foule = await Promise.all(Array.from({ length: 50 }, () => connexion()));
  const res = await Promise.all(foule.map((c, i) => commander(c, 1, 'client' + i)));
  e = await etat();
  assert.equal(res.filter((r) => r.ok).length, 1);
  assert.deepEqual(e, { stock: 0, commandes: 1 });
  ok('50 acheteurs simultanés, 1 article : exactement 1 commande, 49 ruptures, stock 0');
  // même foule sur 3 articles
  await remettre(3);
  const res3 = await Promise.all(foule.map((c, i) => commander(c, 1, 'client' + i)));
  assert.equal(res3.filter((r) => r.ok).length, 3); assert.deepEqual(await etat(), { stock: 0, commandes: 3 });
  ok('50 acheteurs, 3 articles : exactement 3 commandes, stock 0');
  await Promise.all(foule.map((c) => c.end()));

  // 5. SELECT … FOR UPDATE
  await remettre(1);
  const va = commanderAvecVerrou(ca, 1, 'A');
  await new Promise((r) => setTimeout(r, 50));
  const vb = commanderAvecVerrou(cb, 1, 'B');
  const [sa, sb] = await Promise.all([va, vb]);
  assert.equal([sa, sb].filter((r) => r.ok).length, 1);
  assert.deepEqual(await etat(), { stock: 0, commandes: 1 });
  ok('SELECT … FOR UPDATE : le 2e acheteur attend, lit 0 et refuse (1 commande)');
  await ca.end(); await cb.end();

  // 5 bis. Paniers de 2 articles (1 en stock chacun), 20 acheteurs, dont la moitié dans l'ordre inverse
  for (const [nom, f] of [['UPDATE atomique par article', commanderPanier], ['SELECT … FOR UPDATE … ORDER BY id', commanderPanierAvecVerrou]]) {
    await admin.query('TRUNCATE commandes'); await admin.query('DELETE FROM produits');
    await admin.query("INSERT INTO produits VALUES (1, 'Console', 1), (2, 'Manette', 1)");
    const cs = await Promise.all(Array.from({ length: 20 }, () => connexion()));
    const rs = await Promise.all(cs.map((c, i) => f(c, i % 2 ? [2, 1] : [1, 2], 'panier' + i)));
    await Promise.all(cs.map((c) => c.end()));
    const stocks = (await admin.query('SELECT stock FROM produits ORDER BY id')).rows.map((r) => r.stock);
    const nbCmd = Number((await admin.query('SELECT count(*) FROM commandes')).rows[0].count);
    assert.equal(rs.filter((r) => r.ok).length, 1); assert.deepEqual(stocks, [0, 0]); assert.equal(nbCmd, 2);
    ok(`panier de 2 articles, 20 acheteurs (ordres mélangés), ${nom} : 1 panier passe, stocks 0/0, aucun interblocage`);
  }

  // 7. Extrait vidéo = requête testée
  const fichier = readFileSync(new URL('commande.sql', import.meta.url), 'utf8');
  const bloc = fichier.split('-- >>> extrait vidéo\n')[1].split('-- <<< extrait vidéo')[0].trimEnd();
  const extrait = readFileSync(new URL('extrait-video.txt', import.meta.url), 'utf8').trimEnd();
  assert.equal(extrait, bloc);
  const lignes = extrait.split('\n');
  assert.ok(lignes.length <= 10 && lignes.every((l) => l.length <= 32), 'extrait ≤ 10 lignes, ≤ 32 caractères');
  assert.ok(UPDATE_ATOMIQUE.includes('AND stock > 0'));
  ok(`l'extrait de la vidéo est identique à la requête testée (${lignes.length} lignes, ≤ 32 caractères)`);

  console.log(`\nTOUS LES TESTS PASSENT (${n})`);
} finally {
  await admin.end().catch(() => {});
  await serveur.stop().catch(() => {});
  rmSync(dir, { recursive: true, force: true });
}
