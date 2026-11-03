# Le Code #002 — Recherche instantanée : 1 frappe ≠ 1 requête (JavaScript)

Tu tapes « chaussures » : 10 lettres, 10 requêtes… et si la réponse de « chaus » est plus lente, elle arrive en
dernier et écrase les bons résultats (une « race condition »).

- **Debounce** : on attend 300 ms sans frappe avant de lancer la requête → une requête au lieu de dix.
- **AbortController** : avant chaque nouvelle requête, on annule la précédente → une vieille réponse ne peut plus
  s'afficher. La requête annulée rejette avec une `AbortError` : on l'ignore, et on laisse remonter les vraies erreurs.

`recherche.js` contient la version complète (`brancherRecherche`) et, pour comparaison, la version naïve et le
debounce seul. `test.mjs` simule la frappe et un serveur qui répond dans le désordre :

```
npm test   # Node 18+, aucune dépendance
```

Ce que vérifient les tests : naïf = 10 requêtes et « chaus » affiché en dernier ; debounce seul = la vieille
réponse gagne encore si tu fais une pause au milieu du mot ; debounce + AbortController = la requête « chaus » est
annulée, seul « chaussures » s'affiche, aucune erreur ; une vraie erreur HTTP 500 remonte ; l'extrait montré dans
la vidéo (`extrait-video.txt`) est identique au code testé.

Sources : MDN, « Debounce » (glossaire) · MDN, « AbortController : méthode abort() » · React, « You Might Not Need
an Effect », section « Fetching data » (race condition).

Licence MIT — La Gazette Tech.
