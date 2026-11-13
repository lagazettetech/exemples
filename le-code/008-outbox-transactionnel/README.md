# Le Code #008 — Commande enregistrée, mail jamais parti (SQL, PostgreSQL)

La commande 42 est bien en base. Le mail de confirmation, lui, n'est jamais parti.

**Le problème : deux écritures.** Créer une commande, c'est (1) l'enregistrer en base et (2) publier l'événement
« commande.creee » vers une file de messages, que le service mail consomme. Deux systèmes, pas de transaction commune :
- enregistrer **puis** publier : si la file est en panne, ou si le service plante entre les deux, la commande existe
  et l'événement est perdu (test 1) ;
- publier **puis** enregistrer : si l'écriture en base échoue ensuite, le mail confirme une commande qui n'existe pas
  (test 2).

**Le pattern : transactional outbox.** On écrit l'événement dans une table `outbox`, **dans la même transaction**
que la commande. Une transaction est tout ou rien : les deux lignes sont validées ensemble, ou aucune (test 3).

```sql
BEGIN;
INSERT INTO commandes (id, mail)
  VALUES (42, 'ines@ex.fr');
INSERT INTO outbox (type, ref)
  VALUES ('commande.creee', 42);
COMMIT;
-- tout est validé, ou rien
```

**Le relais.** Un processus à part lit les lignes pas encore envoyées, les publie dans la file, puis les marque
(`envoye_le`). File en panne : `ROLLBACK`, l'événement reste dans la table et repart au tour suivant (test 4).
`FOR UPDATE SKIP LOCKED` permet de faire tourner plusieurs relais sans qu'ils prennent la même ligne (test 7).
Autre façon de faire le relais : lire le journal des transactions (CDC, par exemple Debezium et son « Outbox Event
Router ») au lieu d'interroger la table.

**Le prix : au moins une fois.** Si le relais plante juste **après** avoir publié et **avant** d'avoir marqué la
ligne, il republie l'événement au tour suivant (test 5). Le consommateur doit donc être **idempotent** : il note
l'identifiant de chaque événement traité (clé primaire), dans la même transaction que son travail, et ignore un
doublon (test 6). Si le service mail appelle un fournisseur externe, passe aussi l'identifiant de l'événement comme
clé d'idempotence de l'API (voir l'exemple 003).

Autres limites : la table `outbox` grossit (purge les lignes envoyées), et le relais ajoute un délai (l'intervalle
d'interrogation). Si tout reste dans une seule base (pas de file de messages), une transaction suffit : pas besoin de ce pattern.

```
npm install && npm test   # Node 18+ ; PostgreSQL réel via embedded-postgres (binaires téléchargés par npm)
```

Fichiers : `schema.sql` (tables), `outbox.js` (les deux versions naïves, la transaction, le relais, le consommateur),
`test.mjs` (8 tests), `extrait-video.txt` (l'extrait de la vidéo, exécuté tel quel par le test 8).

Sources : Chris Richardson, microservices.io, « Pattern: Transactional outbox » et « Pattern: Idempotent Consumer » ·
documentation PostgreSQL 18, « 3.4. Transactions » et « SELECT » (clause de verrouillage, `SKIP LOCKED`) ·
documentation Debezium, « Outbox Event Router » (consultées le 13/11/2026).

Licence MIT — La Gazette Tech.
