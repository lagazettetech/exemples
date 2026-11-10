// Tests du Code #006 : 4 API simulées (météo, agenda, actus, trafic) ; la météo tombe en panne.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { charger, chargerNaif } from './widgets.js';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const NOMS = ['météo', 'agenda', 'actus', 'trafic'];
// lance les 4 appels ; `panne` = index de l'API qui échoue ; `finies` compte les réponses réellement arrivées
function lancer(panne = 0) {
  const etat = { finies: 0 };
  const appels = NOMS.map(async (nom, i) => {
    await dormir(10 + i * 15);
    if (i === panne) throw new Error(nom + ' : 503');
    etat.finies++;
    return nom + ' OK';
  });
  return { appels, etat };
}
function ecran() {
  const vus = [], erreurs = [];
  return { vus, erreurs, afficher: (i, v) => vus.push([i, v]), erreur: (i, e) => erreurs.push([i, e.message]) };
}
let ok = 0; const test = async (nom, f) => { await f(); ok++; console.log('OK  ', nom); };

await test('Promise.all : la météo tombe → aucun widget affiché, une seule erreur pour la page', async () => {
  const { appels } = lancer(0); const e = ecran();
  await chargerNaif(appels, e.afficher, e.erreur);
  assert.equal(e.vus.length, 0);
  assert.deepEqual(e.erreurs, [['page', 'météo : 503']]);
});
await test('Promise.all n\'annule rien : les 3 autres réponses arrivent quand même… et sont perdues', async () => {
  const { appels, etat } = lancer(0); const e = ecran();
  await chargerNaif(appels, e.afficher, e.erreur);
  assert.equal(etat.finies, 0);              // le rejet arrive avant les autres réponses
  await dormir(80);
  assert.equal(etat.finies, 3);              // elles sont bien arrivées, mais personne ne les affiche
  assert.equal(e.vus.length, 0);
});
await test('allSettled : la météo tombe → 3 widgets affichés + 1 erreur localisée', async () => {
  const { appels } = lancer(0); const e = ecran();
  await charger(appels, e.afficher, e.erreur);
  assert.deepEqual(e.vus, [[1, 'agenda OK'], [2, 'actus OK'], [3, 'trafic OK']]);
  assert.deepEqual(e.erreurs, [[0, 'météo : 503']]);
});
await test('allSettled garde l\'ordre des appels, pas l\'ordre d\'arrivée', async () => {
  const lents = [dormir(40).then(() => 'A'), dormir(5).then(() => 'B'), Promise.reject(new Error('C'))];
  const e = ecran(); await charger(lents, e.afficher, e.erreur);
  assert.deepEqual(e.vus, [[0, 'A'], [1, 'B']]); assert.deepEqual(e.erreurs, [[2, 'C']]);
});
await test('allSettled : tout va bien → 4 widgets, aucune erreur', async () => {
  const { appels } = lancer(-1); const e = ecran();
  await charger(appels, e.afficher, e.erreur);
  assert.equal(e.vus.length, 4); assert.equal(e.erreurs.length, 0);
});
await test('allSettled : forme des résultats { status, value } / { status, reason }', async () => {
  const r = await Promise.allSettled([Promise.resolve(1), Promise.reject(new Error('x'))]);
  assert.deepEqual(r[0], { status: 'fulfilled', value: 1 });
  assert.equal(r[1].status, 'rejected'); assert.equal(r[1].reason.message, 'x'); assert.ok(!('value' in r[1]));
});
await test('extrait de la vidéo = code testé (≤ 10 lignes, ≤ 32 caractères)', async () => {
  const ext = readFileSync(new URL('./extrait-video.txt', import.meta.url), 'utf8').trimEnd().split('\n');
  const src = readFileSync(new URL('./widgets.js', import.meta.url), 'utf8');
  assert.ok(ext.length <= 10); ext.forEach((l) => assert.ok(l.length <= 32, l));
  const corps = ext.map((l) => '  ' + l).join('\n');
  assert.ok(src.includes(corps), 'extrait absent de widgets.js (désindenté de 2 espaces)');
});
console.log(`\n${ok}/7 tests OK`);
