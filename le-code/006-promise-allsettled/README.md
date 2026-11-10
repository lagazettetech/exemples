# Le Code #006 — Promise.all : une API tombe, toute la page tombe (JavaScript)

Un tableau de bord charge 4 widgets en parallèle : météo, agenda, actus, trafic. Avec `Promise.all`, il suffit que
l'API météo réponde une erreur pour que **toute la page** passe en erreur : `Promise.all` rompt dès la première
promesse rompue, avec la raison de celle-ci.

Le piège dans le piège : `Promise.all` **n'annule rien**. Les trois autres requêtes continuent et leurs réponses
arrivent… mais ton code ne les reçoit jamais (test 2).

**`Promise.allSettled`** attend que toutes les promesses soient acquittées et renvoie, **dans l'ordre des appels**,
un objet par promesse : `{ status: "fulfilled", value }` ou `{ status: "rejected", reason }`. Chaque widget affiche
sa donnée ou sa propre erreur.

- Garde `Promise.all` quand les tâches dépendent les unes des autres (tout ou rien : un paiement en plusieurs étapes,
  des données sans lesquelles la page n'a aucun sens).
- `allSettled` ne rejette jamais : pense à traiter les `rejected` (sinon les erreurs passent en silence).
- Disponible dans tous les navigateurs depuis juillet 2020 (MDN, Baseline) et dans Node.

```
npm test   # Node 18+, aucune dépendance
```

`extrait-video.txt` = le corps de `charger()` dans `widgets.js`, désindenté de 2 espaces (vérifié par le test 7).

Sources : MDN, « Promise.all() » et « Promise.allSettled() » · ECMAScript, § Promise.allSettled.

Licence MIT — La Gazette Tech.
