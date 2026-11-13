// Le Code #008 — tests sur un VRAI PostgreSQL (embedded-postgres) ; la file de messages est simulée.
// Vérifie ce que dit la vidéo :
//   1. enregistrer puis publier : file en panne → commande en base, aucun événement (le mail ne partira jamais) ;
//   2. publier puis enregistrer : l'INSERT échoue → un événement pour une commande qui n'existe pas ;
//   3. outbox : commande + événement dans la même transaction → les deux lignes, ou aucune ;
//   4. relais : file en panne → l'événement attend dans la table, puis part au tour suivant (une fois) ;
//   5. relais qui plante après l'envoi, avant de marquer la ligne → l'événement est publié 2 fois (au moins une fois) ;
//   6. consommateur idempotent : le même événement livré 2 fois → 1 seul mail ;
//   7. deux relais en parallèle (FOR UPDATE SKIP LOCKED) : 200 événements, chacun publié une seule fois ;
//   8. l'extrait de la vidéo (exécuté tel quel) écrit la commande et l'événement ; ≤ 10 lignes, ≤ 32 caractères.
// Lancer : npm install && npm test   (Node 18+ ; télécharge les binaires PostgreSQL via npm)
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { FileDeMessages, creerCommandeNaive, creerCommandePublierDabord, creerCommande, relayer, consommer } from './outbox.js';

const dir = mkdtempSync(join(tmpdir(), 'lecode008-'));
const port = 55000 + Math.floor(Math.random() * 1000);
const serveur = new EmbeddedPostgres({ databaseDir: dir, user: 'gazette', password: 'gazette', port, persistent: false, onLog: () => {} });
await serveur.initialise();
await serveur.start();
await serveur.createDatabase('boutique');
const conf = { host: 'localhost', port, user: 'gazette', password: 'gazette', database: 'boutique' };
const connexion = async () => { const c = new pg.Client(conf); await c.connect(); return c; };

let n = 0; const ok = (m) => { n++; console.log('OK   ' + m); };
const db = await connexion();
await db.query(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
const vider = () => db.query('TRUNCATE commandes, outbox, evenements_traites, mails_envoyes');
const compte = async (table, where = 'true') => Number((await db.query(`SELECT count(*) FROM ${table} WHERE ${where}`)).rows[0].count);

try {
  // 1. Enregistrer, puis publier : la file tombe entre les deux.
  await vider();
  let file = new FileDeMessages(); file.enPanne = true;
  await assert.rejects(creerCommandeNaive(db, file, { id: 42, mail: 'ines@ex.fr' }));
  assert.equal(await compte('commandes'), 1);
  assert.equal(file.recus.length, 0);
  ok('naïf (enregistrer puis publier) : file en panne → commande 42 en base, 0 événement : le mail ne partira jamais');

  // 2. Publier, puis enregistrer : l'INSERT échoue (adresse invalide → CHECK).
  await vider();
  file = new FileDeMessages();
  await assert.rejects(creerCommandePublierDabord(db, file, { id: 43, mail: 'adresse-invalide' }));
  assert.equal(await compte('commandes'), 0);
  assert.equal(file.recus.length, 1);
  ok('naïf (publier puis enregistrer) : l\'INSERT échoue → 1 événement publié pour une commande qui n\'existe pas');

  // 3. Outbox : même transaction → tout ou rien.
  await vider();
  await creerCommande(db, { id: 42, mail: 'ines@ex.fr' });
  assert.equal(await compte('commandes'), 1);
  assert.equal(await compte('outbox', 'envoye_le IS NULL'), 1);
  await assert.rejects(creerCommande(db, { id: 43, mail: 'adresse-invalide' }));
  await assert.rejects(creerCommande(db, { id: 42, mail: 'doublon@ex.fr' }));   // clé déjà prise
  assert.equal(await compte('commandes'), 1);
  assert.equal(await compte('outbox'), 1);
  ok('outbox : commande + événement validés ensemble ; en cas d\'échec, ROLLBACK → ni commande, ni événement');

  // 4. Relais : file en panne → l'événement attend ; au tour suivant il part, une fois.
  file = new FileDeMessages(); file.enPanne = true;
  await assert.rejects(relayer(db, file));
  assert.equal(await compte('outbox', 'envoye_le IS NULL'), 1);
  file.enPanne = false;
  assert.equal(await relayer(db, file), 1);
  assert.equal(await relayer(db, file), 0);
  assert.equal(file.recus.length, 1);
  assert.equal(file.recus[0].ref, 42);
  assert.equal(await compte('outbox', 'envoye_le IS NULL'), 0);
  ok('relais : file en panne → l\'événement reste en attente ; au tour suivant il est publié une fois et marqué');

  // 5 + 6. Le relais plante juste après l'envoi : publié 2 fois. Le consommateur idempotent n'envoie qu'un mail.
  await vider();
  await creerCommande(db, { id: 44, mail: 'patrick@ex.be' });
  file = new FileDeMessages();
  await assert.rejects(relayer(db, file, { planteApresEnvoi: true }));
  assert.equal(await relayer(db, file), 1);
  assert.equal(file.recus.length, 2);
  assert.equal(file.recus[0].id, file.recus[1].id);
  ok('relais qui plante après l\'envoi, avant de marquer : le même événement est publié 2 fois (au moins une fois)');

  const consommateur = await connexion();
  const issues = [];
  for (const e of file.recus) issues.push(await consommer(consommateur, e));
  assert.deepEqual(issues, ['mail envoyé', 'doublon ignoré']);
  assert.equal(await compte('mails_envoyes'), 1);
  ok('consommateur idempotent : 2 livraisons du même événement (même id) → 1 seul mail');

  // 7. Deux relais en parallèle : SKIP LOCKED → aucune ligne prise deux fois.
  await vider();
  for (let i = 1; i <= 200; i++) await creerCommande(db, { id: 1000 + i, mail: `client${i}@ex.fr` });
  file = new FileDeMessages();
  const [r1, r2] = [await connexion(), await connexion()];
  const boucle = async (c) => { let k; do { k = await relayer(c, file, { lot: 7 }); } while (k > 0); };
  await Promise.all([boucle(r1), boucle(r2)]);
  assert.equal(file.recus.length, 200);
  assert.equal(new Set(file.recus.map((e) => e.id)).size, 200);
  assert.equal(await compte('outbox', 'envoye_le IS NULL'), 0);
  ok('deux relais en parallèle (FOR UPDATE SKIP LOCKED) : 200 événements, chacun publié une seule fois');
  await r1.end(); await r2.end(); await consommateur.end();

  // 8. L'extrait de la vidéo, exécuté tel quel.
  await vider();
  const extrait = readFileSync(new URL('./extrait-video.txt', import.meta.url), 'utf8').trimEnd();
  const lignes = extrait.split('\n');
  assert.ok(lignes.length <= 10, lignes.length + ' lignes');
  assert.ok(lignes.every((l) => l.length <= 32), 'ligne trop longue : ' + lignes.find((l) => l.length > 32));
  await db.query(extrait);
  assert.equal(await compte('commandes', "id = 42 AND mail = 'ines@ex.fr'"), 1);
  assert.equal(await compte('outbox', "ref = 42 AND type = 'commande.creee' AND envoye_le IS NULL"), 1);
  // et la version paramétrée de outbox.js contient bien les mêmes instructions
  const src = readFileSync(new URL('./outbox.js', import.meta.url), 'utf8');
  assert.ok(src.includes('INSERT INTO commandes (id, mail) VALUES ($1, $2)'));
  assert.ok(src.includes("INSERT INTO outbox (type, ref) VALUES ('commande.creee', $1)"));
  ok(`l'extrait de la vidéo, exécuté tel quel : commande 42 + événement en attente (${lignes.length} lignes, ≤ 32 caractères)`);

  console.log(`\nTOUS LES TESTS PASSENT (${n})`);
} finally {
  await db.end();
  await serveur.stop();
}
