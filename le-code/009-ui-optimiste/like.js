// Le Code #009 — Le like s'affiche avant la réponse du serveur : et s'il refuse ? (JavaScript)
// Un bouton « j'aime » optimiste : le cœur change tout de suite, la requête part ensuite.
// `envoyer(id, oui)` enregistre l'état voulu sur le serveur (rejette en cas de refus ou de panne),
// `lire(id)` renvoie l'état réel du serveur, `maj(p)` redessine le bouton.

// Naïf : on affiche, puis on annule le clic si la requête échoue.
// Avec plusieurs clics rapides, une réponse en retard annule… un clic plus récent.
export function boutonNaif({ envoyer, maj }) {
  return async function aimer(p, oui) {
    p.aime = oui; maj(p);
    try {
      await envoyer(p.id, oui);
    } catch {
      p.aime = !oui; maj(p);      // « annuler » = deviner l'état d'avant
    }
  };
}

// Correct : chaque clic reçoit un numéro ; seul le dernier clic a le droit de corriger l'écran,
// et il ne devine pas : il relit l'état du serveur.
// (le corps ci-dessous est l'extrait montré dans la vidéo, désindenté de 4 espaces : voir extrait-video.txt)
export function bouton({ envoyer, lire, maj }) {
  return async function aimer(p, oui) {
    const n = ++p.clics;
    p.aime = oui; maj(p);
    try {
      await envoyer(p.id, oui);
    } catch {
      const v = await lire(p.id);
      if (n !== p.clics) return;
      p.aime = v; maj(p);
    }
  };
}
