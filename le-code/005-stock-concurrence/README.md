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
- **La limite** : ça marche tant que ta règle tient dans le `WHERE`. Un panier « tout ou rien » marche encore : une
  requête atomique par article dans une transaction, `ROLLBACK` si l'une renvoie 0 ligne (`commanderPanier`). Si ton code
  doit **lire avant de décider** (une règle métier sur plusieurs lignes, un calcul), verrouille dès la lecture avec
  `SELECT … FOR UPDATE` (`commanderAvecVerrou`, `commanderPanierAvecVerrou`), ou passe en `REPEATABLE READ` /
  `SERIALIZABLE` et réessaie la transaction quand PostgreSQL la refuse (« could not serialize access »).
- **Sur plusieurs lignes, verrouille toujours dans le même ordre** (`ORDER BY id`) : deux paniers qui prennent les mêmes
  articles dans l'ordre inverse s'attendraient l'un l'autre (interblocage, doc §13.3.4).
- `CHECK (stock >= 0)` sur la table est un bon filet de sécurité (la 2e commande échoue au lieu de laisser −1), pas une
  correction : l'erreur arrive quand même chez ton utilisateur.

```
npm test   # Node 18+ ; un vrai PostgreSQL est lancé localement (embedded-postgres), deux connexions = deux acheteurs
```

`commande.sql` : la requête de la vidéo. `commande.js` : `commandeNaive` (lire puis écrire, étape par étape pour
entrelacer deux clics), `commander` (l'UPDATE atomique + nombre de lignes), `commanderAvecVerrou` (`SELECT … FOR UPDATE`).
`test.mjs` : 2 clics entrelacés pour chaque version, 50 acheteurs simultanés, puis 20 paniers de 2 articles (ordres mélangés).

Sources : PostgreSQL 18, documentation, « 13.2. Transaction Isolation » (Read Committed par défaut ; réévaluation du
`WHERE` sur la version mise à jour de la ligne) · « 13.3. Explicit Locking » (`SELECT … FOR UPDATE`, §13.3.4 interblocages) · « UPDATE »
(nombre de lignes modifiées renvoyé par la commande).

Licence MIT — La Gazette Tech.
