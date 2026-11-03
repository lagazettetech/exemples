// Le Code #003 — Pourquoi ton « Payer » ne débite pas 2 fois : la clé d'idempotence (JavaScript)
// La Gazette Tech · licence MIT · code écrit et testé par nous (`npm test`).
// Les lignes montrées dans la vidéo sont entre les marqueurs « extrait vidéo » (client, puis serveur).

/**
 * Côté serveur : un registre « clé → promesse du résultat ».
 * On garde la PROMESSE (pas le résultat) : deux essais simultanés avec la même clé attendent le même débit.
 * On garde aussi les échecs : un réessai reçoit la même réponse, erreurs comprises (comme l'API v1 de Stripe).
 * En production : une table avec la clé en contrainte UNIQUE, une expiration (Stripe : une clé peut être effacée
 * après 24 h), et un contrôle que la même clé n'arrive pas avec une autre commande (Stripe répond alors une erreur).
 * @param {(cmd: object) => Promise<object>} debiter  l'opération qui ne doit arriver qu'une fois
 */
export function creerServeur(debiter) {
  const vus = new Map();
  // ▼ extrait vidéo (serveur)
  // serveur
  async function payer(cle, cmd) {
    if (vus.has(cle))
      return vus.get(cle);
    const p = debiter(cmd);
    vus.set(cle, p);
    return p;
  }
  // ▲ extrait vidéo (serveur)
  return { payer, cles: () => vus.size };
}

/**
 * Côté client : une clé par paiement, tirée AVANT le premier essai, renvoyée telle quelle à chaque nouvel essai.
 * @param {(cle: string, cmd: object) => Promise<object>} envoyer  la requête (ex. fetch avec l'en-tête Idempotency-Key)
 */
export async function payerAvecReessais(envoyer, cmd, essais = 3) {
  // ▼ extrait vidéo (client)
  // client : 1 clé par paiement
  const cle = crypto.randomUUID();
  // ▲ extrait vidéo (client)
  let derniere;
  for (let i = 0; i < essais; i++) {
    try { return await envoyer(cle, cmd); } catch (e) { derniere = e; }
  }
  throw derniere;
}

/** Version naïve (pour comparaison) : on réessaie sans clé, le serveur ne peut pas reconnaître le même paiement. */
export function creerServeurNaif(debiter) {
  return { payer: (_cle, cmd) => debiter(cmd) };
}
