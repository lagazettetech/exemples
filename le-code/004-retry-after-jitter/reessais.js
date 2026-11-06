// Le Code #004 — Erreur 429 : mille clients reviennent à la même seconde (JavaScript)
// La Gazette Tech · licence MIT · code écrit et testé par nous (`npm test`).
// Les lignes montrées dans la vidéo sont entre les marqueurs « extrait vidéo ».

/**
 * Lit l'en-tête Retry-After (RFC 9110) et renvoie le délai minimum en millisecondes, ou null s'il est absent/illisible.
 * Deux formes possibles : un nombre de secondes (« 120 ») ou une date HTTP (« Wed, 21 Oct 2015 07:28:00 GMT »).
 * @param {string | null | undefined} ra  valeur de l'en-tête
 * @param {number} maintenant  horloge en ms (injectable pour les tests)
 */
export function delaiServeur(ra, maintenant = Date.now()) {
  if (ra == null) return null;
  const v = String(ra).trim();
  if (/^\d+$/.test(v)) return Number(v) * 1000;
  const date = Date.parse(v);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - maintenant);
}

// ▼ extrait vidéo
// attente avant l'essai n (ms)
function attente(n, ra) {
  const plafond = Math.min(
    30_000, 1000 * 2 ** n);
  const hasard =
    Math.random() * plafond;
  const min = delaiServeur(ra);
  return (min ?? 0) + hasard;
}
// ▲ extrait vidéo

export { attente };

/** Codes qui valent un réessai : 429 (trop de requêtes) et 503 (service indisponible). */
const A_REESSAYER = new Set([429, 503]);

/**
 * Réessaie une requête SANS RISQUE (lecture, ou écriture protégée par une clé d'idempotence — voir Le Code #003).
 * Au plus `essais` envois au total ; ensuite on abandonne et on remonte l'erreur à l'interface.
 * @param {() => Promise<{status: number, headers: {get(n: string): string | null}}>} envoyer
 * @param {{ essais?: number, dormir?: (ms: number) => Promise<void> }} [options]
 */
export async function reessayer(envoyer, { essais = 5, dormir = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let n = 0; ; n++) {
    const rep = await envoyer();
    if (!A_REESSAYER.has(rep.status)) return rep;
    if (n + 1 >= essais) {
      const e = new Error(`abandon après ${essais} essais (HTTP ${rep.status})`);
      e.reponse = rep;
      throw e;
    }
    await dormir(attente(n, rep.headers.get('Retry-After')));
  }
}

/** Versions naïves, pour comparaison dans les tests. */
export const naif = {
  /** « j'attends une seconde et je réessaie » */
  fixe: () => 1000,
  /** on double l'attente, sans hasard */
  expo: (n) => Math.min(30_000, 1000 * 2 ** n),
  /** on respecte Retry-After à la lettre, sans hasard */
  retryAfterSeul: (n, ra) => delaiServeur(ra) ?? Math.min(30_000, 1000 * 2 ** n),
};
