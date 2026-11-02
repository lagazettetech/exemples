# Le Code #001 — Défilement infini : pourquoi tu revois le même post

Langage : **SQL (PostgreSQL)**. Code écrit et testé pour la vidéo, sous licence MIT.

## Le problème
Un fil infini paginé avec `LIMIT … OFFSET …`. Pendant que tu lis la page 1, 3 nouveaux posts arrivent en haut :
tout glisse de 3 crans, et la page 2 te remontre les 3 derniers posts de la page 1. En plus, PostgreSQL calcule
quand même toutes les lignes sautées par `OFFSET` : plus tu descends, plus c'est lent.

## La solution naïve (`offset.sql`)
```sql
SELECT * FROM posts
ORDER BY created_at DESC
LIMIT 20 OFFSET $1;
```

## La pagination par curseur (`cursor.sql`)
On garde la date et l'identifiant du dernier post vu, et on demande les posts « plus anciens que lui ».
L'identifiant départage deux posts publiés à la même seconde ; l'index `(created_at DESC, id DESC)`
(`schema.sql`) permet d'aller droit au bon endroit.
```sql
SELECT * FROM posts
WHERE (created_at, id)
    < ($1, $2)
ORDER BY created_at DESC,
         id DESC
LIMIT 20;
```

## Quand l'utiliser, quand l'éviter
- Utilise-la pour un fil infini, un flux qui bouge, une grosse API.
- Évite-la si l'utilisateur doit sauter directement à la page 37 ou voir le nombre total de pages : `OFFSET`
  reste plus simple.

## Tester
```bash
npm install
npm test
```
`test.mjs` exécute ces requêtes sur un vrai moteur PostgreSQL (PGlite) : 3 doublons avec `OFFSET`, 0 doublon et
aucun post sauté avec le curseur, départage par `id` à la même seconde, index utilisé.

Sources : documentation PostgreSQL 18, « LIMIT and OFFSET » ; Slack Engineering, « Evolving API Pagination at
Slack » (2017, mis à jour 2020).
