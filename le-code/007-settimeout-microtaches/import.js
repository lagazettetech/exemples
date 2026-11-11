// Le Code #007 — Pourquoi ton setTimeout(0) passe après la Promise (JavaScript)
// Un import de 50 000 lignes, traité par paquets, avec une barre de progression.

// Naïf : la « pause » est un await sur une promesse déjà résolue.
// La suite reprend en MICROTÂCHE : la file des microtâches ne se vide jamais pendant la boucle,
// le navigateur ne peut ni redessiner la barre ni traiter un clic → l'interface est gelée jusqu'à la fin.
export async function importerNaif(paquets, traiter, barre) {
  for (const paquet of paquets) {
    traiter(paquet);
    barre.value += paquet.length;
    await Promise.resolve();
  }
}

// Correct : la pause repasse par la file des TÂCHES (setTimeout).
// Entre deux paquets, le navigateur peut redessiner et traiter les clics.
// (les lignes ci-dessous sont l'extrait montré dans la vidéo : voir extrait-video.txt)
const pause = () => new Promise(
  (r) => setTimeout(r, 0));

export async function importer(paquets, traiter, barre) {
  for (const paquet of paquets) {
    traiter(paquet);
    barre.value += paquet.length;
    await pause();
  }
}

export { pause };

// Découpe un tableau en paquets de `taille` éléments.
export function enPaquets(lignes, taille) {
  const out = [];
  for (let i = 0; i < lignes.length; i += taille) out.push(lignes.slice(i, i + taille));
  return out;
}
