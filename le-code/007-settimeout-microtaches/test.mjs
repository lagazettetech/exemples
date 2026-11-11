// Tests du Code #007 : un import de 50 000 lignes par paquets de 500, avec une barre de progression.
// L'« écran » est simulé par une TÂCHE (setTimeout) qui relit la barre à chaque tour de boucle d'événements,
// comme le navigateur qui ne redessine qu'entre deux tâches.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importer, importerNaif, enPaquets } from './import.js';

const LIGNES = Array.from({ length: 50000 }, (_, i) => i);
const PAQUETS = enPaquets(LIGNES, 500);
const traiter = (p) => { let s = 0; for (const x of p) s += x; return s; };

// lance un « écran » : une tâche qui relit la barre, puis se reprogramme, tant que `actif`
function ecran(barre) {
  const vus = []; let actif = true;
  const lire = () => { if (!actif) return; vus.push(barre.value); setTimeout(lire, 0); };
  setTimeout(lire, 0);
  return { vus, stop: () => { actif = false; } };
}
let ok = 0; const test = async (nom, f) => { await f(); ok++; console.log('OK  ', nom); };

await test('ordre : code synchrone, puis la Promise (microtâche), puis setTimeout(0) (tâche)', async () => {
  const o = [];
  setTimeout(() => o.push('setTimeout(0)'), 0);
  Promise.resolve().then(() => o.push('Promise'));
  o.push('synchrone');
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(o, ['synchrone', 'Promise', 'setTimeout(0)']);
});
await test('microtâches ajoutées pendant le vidage : toutes passent avant la tâche suivante', async () => {
  let n = 0, vuParLaTache = -1;
  setTimeout(() => { vuParLaTache = n; }, 0);
  const encore = () => { if (++n < 10000) queueMicrotask(encore); };
  queueMicrotask(encore);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(vuParLaTache, 10000);
});
await test('naïf (await Promise.resolve()) : l\'écran ne voit jamais la barre avancer — gel puis 100 %', async () => {
  const barre = { value: 0 }; const e = ecran(barre);
  await importerNaif(PAQUETS, traiter, barre);
  await new Promise((r) => setTimeout(r, 5)); e.stop();
  assert.equal(barre.value, 50000);
  assert.ok(e.vus.length > 0);
  assert.ok(e.vus.every((v) => v === 50000), 'aucune valeur intermédiaire : ' + e.vus.slice(0, 5));
});
await test('naïf : un clic arrivé au début de l\'import n\'est traité qu\'à la fin', async () => {
  const barre = { value: 0 }; let vuAuClic = -1;
  setTimeout(() => { vuAuClic = barre.value; }, 0);       // le clic = une tâche
  await importerNaif(PAQUETS, traiter, barre);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(vuAuClic, 50000);
});
await test('setTimeout(0) entre les paquets : l\'écran voit la barre avancer paquet par paquet', async () => {
  const barre = { value: 0 }; const e = ecran(barre);
  await importer(PAQUETS, traiter, barre); e.stop();
  assert.equal(barre.value, 50000);
  const inter = e.vus.filter((v) => v > 0 && v < 50000);
  assert.ok(inter.length >= 50, 'valeurs intermédiaires vues : ' + inter.length);
});
await test('setTimeout(0) : le clic est traité dès le premier paquet', async () => {
  const barre = { value: 0 }; let vuAuClic = -1;
  setTimeout(() => { vuAuClic = barre.value; }, 0);
  await importer(PAQUETS, traiter, barre);
  assert.ok(vuAuClic > 0 && vuAuClic <= 1000, 'barre au moment du clic : ' + vuAuClic);
});
await test('extrait de la vidéo = code testé (≤ 10 lignes, ≤ 32 caractères)', async () => {
  const ex = readFileSync(new URL('./extrait-video.txt', import.meta.url), 'utf8').replace(/\n$/, '').split('\n');
  const src = readFileSync(new URL('./import.js', import.meta.url), 'utf8').split('\n');
  assert.ok(ex.length <= 10); assert.ok(ex.every((l) => l.length <= 32), 'ligne trop longue');
  // lignes 1–2 : la fonction pause, mot pour mot
  const i = src.indexOf(ex[0]); assert.ok(i >= 0); assert.equal(src[i + 1], ex[1]); assert.equal(ex[2], '');
  // lignes 4–8 : le corps de importer(), désindenté de 2 espaces
  const j = src.indexOf('export async function importer(paquets, traiter, barre) {');
  const corps = src.slice(j + 1, j + 1 + ex.length - 3).map((l) => l.slice(2));
  assert.deepEqual(corps, ex.slice(3));
});
console.log(`\n${ok}/7 tests OK`);
