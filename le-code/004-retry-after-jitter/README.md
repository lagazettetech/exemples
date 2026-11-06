# Le Code #004 — Erreur 429 : mille clients reviennent à la même seconde (JavaScript)

Ton API répond `429 Too Many Requests` (« trop de requêtes », RFC 6585). Tes clients réessaient… et elle retombe.
Ils ont tous reçu le 429 au même instant : s'ils attendent tous la même durée, ils reviennent **ensemble**.

- **Attente fixe** (« j'attends 1 s ») : les 1 000 clients reviennent dans la même fenêtre de 100 ms.
- **Backoff exponentiel sans hasard** (1, 2, 4, 8 s…) : le paquet reste groupé, il revient juste plus tard.
- **Backoff exponentiel + hasard (« full jitter »)** : chaque client tire son attente entre 0 et un plafond qui double
  (plafonné à 30 s) → les retours s'étalent.
- **`Retry-After`** (RFC 9110 : un nombre de secondes ou une date HTTP) est un **minimum** : si 1 000 clients lisent
  « 30 », ils reviennent tous à la 30e seconde. On attend donc *Retry-After + le tirage*.
- On limite le nombre d'essais (5 envois au total), puis on affiche l'erreur.
- On ne réessaie que ce qui est **sans risque** : une lecture, ou une écriture protégée par une clé d'idempotence
  ([Le Code #003](../003-cle-idempotence/)).

```
npm test   # Node 18+, aucune dépendance
```

`reessais.js` : `attente(n, retryAfter)` (l'extrait de la vidéo), `delaiServeur()` (lecture de Retry-After, secondes
ou date), `reessayer(envoyer)` (la boucle). `test.mjs` simule 1 000 clients et compare les stratégies.

Sources : IETF, RFC 6585 §4 « 429 Too Many Requests » (avril 2012) · IETF, RFC 9110 §10.2.3 « Retry-After » ·
MDN, « Retry-After » · Marc Brooker, « Exponential Backoff And Jitter », AWS Architecture Blog (2015) · Amazon Builders'
Library, « Timeouts, retries, and backoff with jitter ».

Licence MIT — La Gazette Tech.
