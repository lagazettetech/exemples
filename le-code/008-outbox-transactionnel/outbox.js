// Le Code #008 — Commande enregistrée, mail jamais parti (SQL, PostgreSQL ; harnais de test en Node)
// Une commande doit (1) être enregistrée en base et (2) publier l'événement « commande.creee » vers une file de
// messages, que le service mail consomme. Ce sont DEUX écritures, dans deux systèmes : l'une peut réussir, l'autre non.

// Une file de messages simulée (le « broker ») : elle peut tomber en panne.
export class FileDeMessages {
  constructor() { this.recus = []; this.enPanne = false; }
  async publier(evenement) {
    if (this.enPanne) throw new Error('file de messages indisponible');
    this.recus.push(evenement);
  }
}

// ── Naïf n° 1 : enregistrer, PUIS publier. La base valide ; si la publication échoue (file en panne, service qui
// redémarre entre les deux), la commande existe et l'événement est perdu : le mail ne partira jamais.
export async function creerCommandeNaive(db, file, { id, mail }) {
  await db.query('INSERT INTO commandes (id, mail) VALUES ($1, $2)', [id, mail]);
  await file.publier({ type: 'commande.creee', ref: id });
}

// ── Naïf n° 2 : publier, PUIS enregistrer. Si l'écriture en base échoue ensuite, l'événement est déjà parti :
// le mail confirme une commande qui n'existe pas.
export async function creerCommandePublierDabord(db, file, { id, mail }) {
  await file.publier({ type: 'commande.creee', ref: id });
  await db.query('INSERT INTO commandes (id, mail) VALUES ($1, $2)', [id, mail]);
}

// ── Outbox : la commande ET l'événement dans la MÊME transaction locale. Tout est validé, ou rien.
// (mêmes instructions que l'extrait de la vidéo, avec des paramètres : voir extrait-video.txt)
export async function creerCommande(db, { id, mail }) {
  await db.query('BEGIN');
  try {
    await db.query('INSERT INTO commandes (id, mail) VALUES ($1, $2)', [id, mail]);
    await db.query("INSERT INTO outbox (type, ref) VALUES ('commande.creee', $1)", [id]);
    await db.query('COMMIT');
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  }
}

// ── Le relais : lit les événements pas encore envoyés, les publie, puis les marque comme envoyés.
// FOR UPDATE SKIP LOCKED : plusieurs relais peuvent tourner en parallèle sans prendre la même ligne.
// Si la file est en panne, ROLLBACK : les lignes restent « à envoyer » et repartent au tour suivant.
// Limite (assumée) : si le relais plante APRÈS avoir publié et AVANT d'avoir marqué la ligne, l'événement
// sera publié une 2e fois au tour suivant → livraison « au moins une fois » → consommateur idempotent.
export async function relayer(db, file, { lot = 10, planteApresEnvoi = false } = {}) {
  await db.query('BEGIN');
  try {
    const { rows } = await db.query(
      `SELECT id, type, ref FROM outbox
        WHERE envoye_le IS NULL
        ORDER BY cree_le
        LIMIT $1
          FOR UPDATE SKIP LOCKED`, [lot]);
    for (const e of rows) {
      await file.publier({ id: e.id, type: e.type, ref: e.ref });
      if (planteApresEnvoi) throw new Error('le relais plante avant de marquer la ligne');
      await db.query('UPDATE outbox SET envoye_le = clock_timestamp() WHERE id = $1', [e.id]);
    }
    await db.query('COMMIT');
    return rows.length;
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  }
}

// ── Le consommateur idempotent (service mail) : il note l'identifiant de chaque événement traité, dans la même
// transaction que son propre travail. Un doublon heurte la clé primaire → ignoré, pas de 2e mail.
// (Pour un vrai fournisseur de mails, passe aussi l'identifiant de l'événement comme clé d'idempotence de l'API.)
export async function consommer(db, evenement) {
  await db.query('BEGIN');
  try {
    const r = await db.query(
      'INSERT INTO evenements_traites (evenement_id) VALUES ($1) ON CONFLICT DO NOTHING', [evenement.id]);
    if (r.rowCount === 0) { await db.query('ROLLBACK'); return 'doublon ignoré'; }
    await db.query('INSERT INTO mails_envoyes (commande_id) VALUES ($1)', [evenement.ref]);
    await db.query('COMMIT');
    return 'mail envoyé';
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  }
}
