# Le Code #003 — Pourquoi ton « Payer » ne débite pas 2 fois (JavaScript)

Tu cliques sur « Payer », le réseau coupe, tu réessaies… et tu es débité deux fois. La requête était bien arrivée :
c'est la **réponse** qui s'est perdue. Le serveur ne peut pas savoir que le 2e essai est le même paiement.

**Clé d'idempotence** : le client tire une clé unique avant le premier essai (`crypto.randomUUID()`) et la renvoie
à chaque nouvel essai (en HTTP : l'en-tête `Idempotency-Key`). Le serveur garde la réponse de chaque clé ; s'il revoit
la même clé, il renvoie la réponse gardée sans refaire l'opération.

- On garde la **promesse**, pas le résultat : deux essais simultanés (double clic) attendent le même débit.
- On garde aussi les échecs : le réessai reçoit le même refus (comme l'API v1 de Stripe, erreurs comprises).
- En production : une table avec la clé en contrainte `UNIQUE`, une expiration (chez Stripe, une clé peut être effacée
  après 24 h), et un refus si la même clé arrive avec une autre commande.
- Inutile pour une lecture (`GET`) : elle ne change rien, elle est déjà idempotente.

```
npm test   # Node 19+, aucune dépendance
```

Sources : Stripe, « Idempotent requests » (référence de l'API) · IETF, brouillon « The Idempotency-Key HTTP Header
Field » (httpapi).

Licence MIT — La Gazette Tech.
