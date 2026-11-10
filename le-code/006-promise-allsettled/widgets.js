// Le Code #006 — Promise.all : une API tombe, toute la page tombe (JavaScript)
// Un tableau de bord charge 4 widgets en parallèle (météo, agenda, actus, trafic).

// Naïf : Promise.all rompt dès la première erreur. Les 3 réponses qui arrivent quand même sont perdues.
export async function chargerNaif(appels, afficher, erreur) {
  try {
    const valeurs = await Promise.all(appels);
    valeurs.forEach((v, i) => afficher(i, v));
  } catch (e) {
    erreur('page', e);            // une seule erreur pour toute la page : aucun widget affiché
  }
}

// Correct : Promise.allSettled attend tout le monde et décrit chaque résultat.
// (le corps ci-dessous est l'extrait montré dans la vidéo, désindenté de 2 espaces : voir extrait-video.txt)
export async function charger(appels, afficher, erreur) {
  const res = await Promise
    .allSettled(appels);
  res.forEach((r, i) => {
    if (r.status === "fulfilled")
      afficher(i, r.value);
    else
      erreur(i, r.reason);
  });
}
