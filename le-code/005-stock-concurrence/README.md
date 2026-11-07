# Le Code #005 — Deux clics, un seul article en stock (SQL · PostgreSQL)

Il reste **1** console. Deux acheteurs cliquent sur « Commander » au même instant. Les deux commandes passent,
et le stock affiche **−1**.

- **Le réflexe** : lire le stock (`SELECT stock …`), vérifier dans l'appli qu'il en reste, puis écrire
  (`UPDATE … SET stock = stock - 1`). Les deux acheteurs lisent « 1 » avant que l'un d'eux n'écrive : feu vert pour les deux.
- **« Je mets tout dans une transaction »** : ça ne suffit pas. En **Read Committed** (le niveau par défaut de
  PostgreSQL), la transaction verrouille la ligne au moment de l'`UPDATE` : le 2e acheteur **attend**… puis passe quand
  même, car rien ne revérifie le « 1 » qu'il a lu avant. Résultat testé : 2 commandes, stock −1.
- **La correction** : le contrôle et la décrémentation dans **une seule instruction** :

```sql
UPDATE produits
SET stock = stock - 1
WHERE id = $1
  AND stock > 0;
-- 1 ligne : commande OK
-- 0 ligne : rupture de stock
```

  Si un autre acheteur modifie la ligne au même moment, PostgreSQL attend la fin de sa transaction, puis **réévalue
  `stock > 0` sur la nouvelle version de la ligne** : le 2e acheteur obtient 0 ligne modifiée = rupture.
- **La limite** : ça marche pour un compteur sur une ligne. Si tu dois lire avant de décider (un panier de plusieurs
  articles, un calcul), verrouille dès la lecture avec `SELECT … FOR UPDATE` (fonction `commanderAvecVerrou`), ou passe
  en `SERIALIZABLE` et réessaie la transaction en cas d'échec de sérialisation.

```
npm test   # Node 18+ ; un vrai PostgreSQL est lancé localement (embedded-postgres), deux connexions = deux acheteurs
```

`commande.sql` : la requête de la vidéo. `commande.js` : `commandeNaive` (lire puis écrire, étape par étape pour
entrelacer deux clics), `commander` (l'UPDATE atomique + nombre de lignes), `commanderAvecVerrou` (`SELECT … FOR UPDATE`).
`test.mjs` : 2 clics entrelacés pour chaque version, puis 50 acheteurs simultanés.

Sources : PostgreSQL 18, documentation, « 13.2. Transaction Isolation » (Read Committed par défaut ; réévaluation du
`WHERE` sur la version mise à jour de la ligne) · « 13.3. Explicit Locking » (`SELECT … FOR UPDATE`) · « UPDATE »
(nombre de lignes modifiées renvoyé par la commande).

Licence MIT — La Gazette Tech.
