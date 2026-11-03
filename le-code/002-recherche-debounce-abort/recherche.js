// Le Code #002 — Recherche instantanée : debounce + AbortController (JavaScript)
// La Gazette Tech · licence MIT · code écrit et testé par nous (`npm test`).
// Les 10 lignes montrées dans la vidéo sont entre les deux marqueurs « extrait vidéo ».

/**
 * Branche une recherche « au fil de la frappe » sur un champ.
 * @param {{ value: string, oninput: Function|null }} input  un <input> du DOM (ou un objet équivalent)
 * @param {() => string} url       renvoie l'URL à interroger pour la valeur actuelle du champ
 * @param {(data: any) => void} afficher  reçoit les résultats de la DERNIÈRE requête seulement
 * @param {(e: Error) => void} [erreur]   reçoit les vraies erreurs (réseau, HTTP 500…), jamais les annulations
 */
export function brancherRecherche(input, url, afficher, erreur = console.error) {
  let t, ctrl; // minuteur du debounce, contrôleur de la requête en cours
  // ▼ extrait vidéo
  input.oninput = () => {
    clearTimeout(t);
    t = setTimeout(go, 300);
  };
  async function go() {
    ctrl?.abort();
    ctrl = new AbortController();
    try {
      const r = await fetch(url(),
        { signal: ctrl.signal });
  // ▲ extrait vidéo
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      afficher(await r.json());
    } catch (e) {
      // Une requête annulée rejette avec une DOMException « AbortError » : ce n'est pas une erreur.
      if (e.name !== 'AbortError') erreur(e);
    }
  }
}

/** Version naïve (pour comparaison dans les tests) : une requête par frappe, aucune annulation. */
export function rechercheNaive(input, url, afficher) {
  input.oninput = async () => {
    const r = await fetch(url());
    afficher(await r.json());
  };
}

/** Debounce seul (pour comparaison) : moins de requêtes, mais une vieille réponse lente peut encore gagner. */
export function debounceSeul(input, url, afficher) {
  let t;
  input.oninput = () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const r = await fetch(url());
      afficher(await r.json());
    }, 300);
  };
}
