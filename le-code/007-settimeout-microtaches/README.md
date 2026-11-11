# Le Code #007 — Pourquoi ton setTimeout(0) passe après la Promise (JavaScript)

Un import de 50 000 lignes, traité par paquets, avec une barre de progression. Pour « laisser respirer » l'interface,
le code fait une pause après chaque paquet : `await Promise.resolve()`. Résultat : la barre reste figée à 0 %, les clics
ne répondent plus… puis tout saute à 100 %.

**Le modèle mental.** La boucle d'événements a deux files :
- les **tâches** : un clic, un `setTimeout` ;
- les **microtâches** : la suite d'une Promise (`then`, `await`), `queueMicrotask`.

Après chaque tâche, la boucle vide **toute** la file des microtâches — y compris celles ajoutées pendant le vidage —
et ce n'est qu'ensuite que le navigateur peut redessiner la page et passer à la tâche suivante (MDN). D'où l'ordre
`synchrone → Promise → setTimeout(0)` (test 1).

**Pourquoi la pause naïve échoue.** `await Promise.resolve()` reprend… en microtâche. Chaque paquet remet le suivant
dans la file des microtâches : elle ne se vide jamais pendant l'import, donc pas de rendu, pas de clic (tests 3 et 4).

**La correction.** Faire la pause par la file des tâches : `await new Promise((r) => setTimeout(r, 0))`. Entre deux
paquets, le navigateur redessine et traite les clics (tests 5 et 6).

**Le compromis.** `setTimeout(0)` ne veut pas dire zéro : après 5 appels imbriqués, les navigateurs imposent au moins
4 ms (standard HTML, MDN). Mesuré sous Chromium 156 (11/11/2026, 300 paquets de 2 ms) : pause par microtâche = 0 image
dessinée en 604 ms ; pause par `setTimeout(0)` = 120 images, mais ≈ 4,5 ms par pause dès la 7e → 1 960 ms au total.
Cède **par paquets de quelques millisecondes**, pas à chaque élément. Pour un vrai calcul lourd : un Web Worker.

```
npm test   # Node 18+, aucune dépendance
```

`extrait-video.txt` = la fonction `pause` + le corps de `importer()` (désindenté de 2 espaces) dans `import.js`
(vérifié par le test 7).

Sources : MDN, « Utiliser les microtâches en JavaScript avec queueMicrotask() », « Aller plus loin : les microtâches et
l'environnement d'exécution JavaScript », « Utiliser les promesses », « setTimeout() » · HTML Living Standard, § Event
loop processing model et § Timers.

Licence MIT — La Gazette Tech.
