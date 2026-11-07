// Le Code #005 — Deux clics, un seul article en stock (SQL / PostgreSQL).
// Trois façons de passer une commande ; `client` est une connexion `pg` (une par acheteur).
import { readFileSync } from 'node:fs';

export const SCHEMA = `
  CREATE TABLE produits (id int PRIMARY KEY, nom text NOT NULL, stock int NOT NULL);
  CREATE TABLE commandes (id serial PRIMARY KEY, produit_id int NOT NULL REFERENCES produits(id), acheteur text NOT NULL);
`;

// La requête montrée dans la vidéo (commande.sql), sans les commentaires.
export const UPDATE_ATOMIQUE = readFileSync(new URL('commande.sql', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.trim() && !l.trim().startsWith('--')).join('\n');

// 1. Le réflexe : lire le stock, décider dans l'appli, puis écrire. MÊME DANS UNE TRANSACTION, c'est cassé
//    en Read Committed (niveau par défaut de PostgreSQL) : la lecture et l'écriture sont deux instructions,
//    et entre les deux, un autre acheteur a pu lire le même « 1 ».
//    Les étapes sont exposées une par une pour que le test puisse les entrelacer comme deux vrais clics.
export function commandeNaive(client, produitId, acheteur) {
  return {
    debut: () => client.query('BEGIN'),
    lire: async () => (await client.query('SELECT stock FROM produits WHERE id = $1', [produitId])).rows[0].stock,
    ecrire: () => client.query('UPDATE produits SET stock = stock - 1 WHERE id = $1', [produitId]),
    enregistrer: () => client.query('INSERT INTO commandes (produit_id, acheteur) VALUES ($1, $2)', [produitId, acheteur]),
    valider: () => client.query('COMMIT'),
  };
}

// 2. La correction : une seule instruction qui contrôle ET décrémente. Si un autre acheteur modifie la ligne
//    au même moment, PostgreSQL attend la fin de sa transaction, puis réévalue la condition `stock > 0`
//    sur la nouvelle version de la ligne. Le nombre de lignes modifiées dit si la commande est passée.
export async function commander(client, produitId, acheteur) {
  await client.query('BEGIN');
  try {
    const r = await client.query(UPDATE_ATOMIQUE, [produitId]);
    if (r.rowCount === 0) { await client.query('ROLLBACK'); return { ok: false, raison: 'rupture' }; }
    await client.query('INSERT INTO commandes (produit_id, acheteur) VALUES ($1, $2)', [produitId, acheteur]);
    await client.query('COMMIT');
    return { ok: true };
  } catch (e) { await client.query('ROLLBACK'); throw e; }
}

// 3. Quand il faut lire avant de décider (panier de plusieurs articles, calcul complexe) : verrouiller la ligne
//    dès la lecture avec SELECT … FOR UPDATE. Le 2e acheteur attend, puis lit le stock à jour.
export async function commanderAvecVerrou(client, produitId, acheteur) {
  await client.query('BEGIN');
  try {
    const { stock } = (await client.query('SELECT stock FROM produits WHERE id = $1 FOR UPDATE', [produitId])).rows[0];
    if (stock <= 0) { await client.query('ROLLBACK'); return { ok: false, raison: 'rupture' }; }
    await client.query('UPDATE produits SET stock = stock - 1 WHERE id = $1', [produitId]);
    await client.query('INSERT INTO commandes (produit_id, acheteur) VALUES ($1, $2)', [produitId, acheteur]);
    await client.query('COMMIT');
    return { ok: true };
  } catch (e) { await client.query('ROLLBACK'); throw e; }
}
