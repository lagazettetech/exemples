# Le Code #010 — 1 page, 101 requêtes : le problème N+1 (JavaScript, PostgreSQL)

La page « Mes commandes » affiche 100 lignes. Dans les journaux de la base : 101 requêtes.

**Le problème : une requête par ligne.** On charge la liste (1 requête), puis, dans la boucle, le nom du client de
chaque commande (1 requête par commande) : **1 + N** requêtes. Pour 100 commandes, 101 requêtes (test 1) ; pour 10,
11 (test 5). Chaque requête est un aller-retour réseau : en local, c'est invisible ; vers une base distante, ça
s'additionne. Avec 2 ms simulées par aller-retour, la version naïve met environ 260 ms, la version groupée environ
5 ms (test 6, un exemple : la latence réelle dépend de ton réseau). Avec un ORM, la boucle est souvent cachée :
`commande.client.nom` déclenche une requête à chaque tour (chargement paresseux).

```js
for (const c of cmds) {
  await db.query('SELECT nom FROM clients WHERE id = $1', [c.client_id]);
}
```

**La solution : grouper.** On récupère les ids de clients (sans doublons, `Set`), on les demande **en une seule
requête** avec `WHERE id = ANY($1)` (le tableau JavaScript devient un tableau PostgreSQL), puis on recolle avec une
`Map`. **2 requêtes, quel que soit N** (tests 2 et 5), et les mêmes lignes que la version naïve (test 4). C'est ce que
font les « DataLoader » (GraphQL) et le chargement anticipé des ORM (`include`, `prefetch_related`…).

```js
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
```

Deux détails (test 7) : liste vide → on renvoie `[]` sans lancer la requête `ANY` ; ids en double (10 commandes de
3 clients) → chaque client n'est demandé qu'une fois.

**Ou une jointure : 1 requête** (test 3). Parfait ici, car chaque commande a **un** client. Attention dans l'autre
sens (un-à-plusieurs : un client → ses commandes) : les colonnes du client sont **répétées** sur chaque ligne, le
volume transféré grossit, et un `LIMIT` sur la jointure coupe au milieu d'un client. Dans ce cas, **pagine d'abord**
(les 20 clients de la page), puis charge leurs commandes en une requête groupée, comme ci-dessus.

Limites : `ANY($1)` avec des dizaines de milliers d'ids devient lourd (pagine, la page reste petite) ; la Map ne
garantit pas qu'un client existe (ici, la clé étrangère le garantit) ; et compter les requêtes, c'est le test qui
attrape une régression N+1 avant la production (le compteur `compterRequetes` de `n-plus-un.js`). Côté base,
`pg_stat_statements` montre la même requête exécutée des milliers de fois.

```
npm install && npm test   # Node 18+ ; PostgreSQL réel via embedded-postgres (binaires téléchargés par npm)
```

Fichiers : `schema.sql` (tables), `n-plus-un.js` (naïf, groupée, jointure, compteur de requêtes),
`test.mjs` (8 tests), `extrait-video.txt` (l'extrait de la vidéo, présent à l'identique dans `n-plus-un.js`, vérifié par le test 8).

Sources : documentation PostgreSQL 18, « Row and Array Comparisons » (`= ANY (array)`) et
« pg_stat_statements » · node-postgres, « Queries » (paramètres, tableaux convertis en tableaux PostgreSQL) ·
dépôt graphql/dataloader (regroupement des chargements) · documentation Django, `prefetch_related` (consultées le 23/11/2026).

Licence MIT — La Gazette Tech.
