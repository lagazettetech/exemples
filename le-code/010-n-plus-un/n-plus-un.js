// Le Code #010 — 1 page, 101 requêtes : le problème N+1 (JavaScript + PostgreSQL)
// Une page affiche 100 commandes avec le nom du client. La version naïve fait 1 requête pour la liste,
// puis 1 requête PAR commande pour le nom : 1 + N requêtes. Chaque requête est un aller-retour réseau.

// `db` = n'importe quel objet avec `query(texte, valeurs)` : pg.Client, pg.Pool, ou le compteur ci-dessous.

const SQL_COMMANDES = 'SELECT id, client_id, total FROM commandes ORDER BY id LIMIT $1';

// ── Naïf : 1 requête pour la liste, puis 1 requête par commande, dans la boucle → 1 + N requêtes.
// Le même schéma se cache souvent derrière un ORM : `commande.client.nom` dans une boucle (chargement paresseux).
export async function listeNaive(db, limite = 100) {
  const { rows: cmds } = await db.query(SQL_COMMANDES, [limite]);
  const resultat = [];
  for (const c of cmds) {
    const { rows } = await db.query('SELECT nom FROM clients WHERE id = $1', [c.client_id]);
    resultat.push({ ...c, nom: rows[0].nom });
  }
  return resultat;
}

// ── Groupée : la liste, puis UNE requête pour tous les clients (ids uniques, `= ANY($1)`), recollés avec une Map.
// 2 requêtes, quel que soit N. (C'est ce que font les « DataLoader » et le `include` / `prefetch_related` des ORM.)
export async function listeGroupee(db, limite = 100) {
  const { rows: cmds } = await db.query(SQL_COMMANDES, [limite]);
  if (cmds.length === 0) return [];   // liste vide : inutile d'interroger les clients
  // ↓ l'extrait de la vidéo (extrait-video.txt), à l'identique
const ids = [...new Set(cmds
  .map((c) => c.client_id))];
const res = await db.query(`
  SELECT id, nom FROM clients
  WHERE id = ANY($1)`, [ids]);
const noms = new Map(res.rows
  .map((r) => [r.id, r.nom]));
return cmds.map((c) => ({ ...c,
  nom: noms.get(c.client_id),
}));
}

// ── Jointure : 1 seule requête. Parfait ici (chaque commande a UN client). Attention en un-à-plusieurs
// (un client → ses commandes) : chaque ligne du client est répétée, et un LIMIT coupe au milieu d'un client.
export async function listeJointure(db, limite = 100) {
  const { rows } = await db.query(
    `SELECT co.id, co.client_id, co.total, cl.nom
       FROM commandes co JOIN clients cl ON cl.id = co.client_id
      ORDER BY co.id LIMIT $1`, [limite]);
  return rows;
}

// ── Compteur : enveloppe le client et compte (et garde) chaque requête. `latenceMs` simule l'aller-retour réseau
// (en local, une requête prend une fraction de milliseconde ; vers une base distante, souvent 1 ms ou plus).
export function compterRequetes(client, { latenceMs = 0 } = {}) {
  const requetes = [];
  return {
    requetes,
    get nombre() { return requetes.length; },
    remettreAZero() { requetes.length = 0; },
    async query(texte, valeurs) {
      requetes.push({ texte, valeurs });
      if (latenceMs > 0) await new Promise((r) => setTimeout(r, latenceMs));
      return client.query(texte, valeurs);
    },
  };
}
