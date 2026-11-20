# Le Code #009 — Le like s'affiche avant la réponse du serveur : et s'il refuse ? (JavaScript)

Un bouton « j'aime » **optimiste** : le cœur change tout de suite, la requête part ensuite. Si le serveur refuse,
il faut revenir en arrière.

La version naïve « annule » le clic qui a échoué (`p.aime = !oui`). Ça marche pour un clic. Avec trois clics rapides
— j'aime, je n'aime plus, j'aime — si le **premier** envoi échoue **en dernier**, son annulation écrase le dernier
clic : le cœur est vide alors que le serveur a enregistré « aimé » (test 1).

La correction (`bouton()` dans `like.js`) :
- chaque clic reçoit un **numéro** (`p.clics`) ; seul le **dernier** clic a le droit de corriger l'écran ;
- en cas d'échec, il ne devine pas l'état d'avant : il **relit l'état du serveur** (`lire`), puis vérifie qu'aucun
  clic plus récent n'est arrivé pendant la relecture (test 6).

Quand l'utiliser : actions fréquentes, rapides, qui échouent rarement et qui se défont sans dommage (j'aime, favori,
cocher une tâche). Quand l'éviter : paiement, envoi irréversible, action qui échoue souvent — là, attends la réponse.

Limites :
- un envoi ancien qui échoue déclenche quand même une relecture (inutile) avant d'être ignoré : simple et sans risque ;
- `envoyer` transmet l'**état voulu** (`oui` / `non`), pas « bascule » : renvoyer deux fois la même valeur ne change
  rien. Si le serveur peut traiter deux envois réussis dans le désordre, numérote-les aussi côté serveur (il ignore
  un numéro plus ancien que le dernier appliqué) : aucun code côté client ne rattrape ce cas.

```
npm test   # Node 18+, aucune dépendance
```

`extrait-video.txt` = le corps de `aimer()` dans `bouton()`, désindenté de 4 espaces (vérifié par le test 7).

Licence MIT — La Gazette Tech.
