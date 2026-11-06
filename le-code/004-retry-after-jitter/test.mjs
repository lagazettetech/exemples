// Tests du Code #004 : 1 000 clients reçoivent un 429 au même instant ; quand reviennent-ils ?
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attente, delaiServeur, reessayer, naif } from './reessais.js';

// hasard reproductible (mulberry32) à la place de Math.random, pour des tests stables
function graine(s) { return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
Math.random = graine(2026);

const CLIENTS = 1000;
// pic = le plus grand nombre de retours tombant dans la même fenêtre de 100 ms
function pic(instants, fenetre = 100) {
  const n = new Map();
  for (const t of instants) { const k = Math.floor(t / fenetre); n.set(k, (n.get(k) ?? 0) + 1); }
  return Math.max(...n.values());
}
const retours = (f, essai, ra) => Array.from({ length: CLIENTS }, () => f(essai, ra));

let ok = 0; const test = async (nom, f) => { await f(); ok++; console.log('OK  ', nom); };

await test('attente fixe (1 s) : les 1 000 clients reviennent dans la même fenêtre de 100 ms', () => {
  assert.equal(pic(retours(naif.fixe, 0)), CLIENTS);
});
await test('backoff exponentiel sans hasard : 1, 2, 4, 8 s… le paquet reste groupé à chaque essai', () => {
  for (let n = 0; n < 4; n++) assert.equal(pic(retours(naif.expo, n)), CLIENTS);
  assert.deepEqual([0, 1, 2, 3].map(naif.expo), [1000, 2000, 4000, 8000]);
});
await test('avec hasard : les retours s\'étalent (pic ≤ 15 % des clients au 1er essai, ≤ 5 % au 4e)', () => {
  assert.ok(pic(retours(attente, 0)) <= 0.15 * CLIENTS, 'essai 1');
  assert.ok(pic(retours(attente, 3)) <= 0.05 * CLIENTS, 'essai 4');
});
await test('Retry-After: 30 respecté à la lettre : tout le monde revient à la 30e seconde', () => {
  const t = retours(naif.retryAfterSeul, 0, '30');
  assert.ok(t.every((x) => x === 30_000)); assert.equal(pic(t), CLIENTS);
});
await test('Retry-After: 30 + tirage : personne avant 30 s, et les retours s\'étalent', () => {
  const t = retours(attente, 0, '30');
  assert.ok(t.every((x) => x >= 30_000 && x < 31_000)); assert.ok(pic(t) <= 0.15 * CLIENTS);
});
await test('Retry-After en date HTTP : délai calculé depuis maintenant ; absent ou illisible : null', () => {
  const now = Date.parse('Wed, 21 Oct 2015 07:27:00 GMT');
  assert.equal(delaiServeur('Wed, 21 Oct 2015 07:28:00 GMT', now), 60_000);
  assert.equal(delaiServeur('Wed, 21 Oct 2015 07:26:00 GMT', now), 0);
  assert.equal(delaiServeur('120'), 120_000);
  assert.equal(delaiServeur(null), null); assert.equal(delaiServeur('bientôt'), null);
});
await test('plafond : jamais plus de 30 s de tirage, même au 10e essai', () => {
  assert.ok(retours(attente, 10).every((x) => x >= 0 && x < 30_000));
});
const rep = (status, ra = null) => ({ status, headers: { get: (h) => (h === 'Retry-After' ? ra : null) } });
const sansAttendre = { dormir: async () => {} };
await test('reessayer : 429, 429 puis 200 = 3 envois, la réponse 200 est rendue', async () => {
  const suite = [rep(429, '1'), rep(429), rep(200)]; let envois = 0;
  const r = await reessayer(async () => suite[envois++], sansAttendre);
  assert.equal(r.status, 200); assert.equal(envois, 3);
});
await test('reessayer : toujours 429 = 5 envois, puis abandon avec l\'erreur', async () => {
  let envois = 0;
  await assert.rejects(reessayer(async () => { envois++; return rep(429); }, sansAttendre), /abandon après 5 essais/);
  assert.equal(envois, 5);
});
await test('reessayer : une erreur 400 n\'est pas réessayée', async () => {
  let envois = 0; const r = await reessayer(async () => { envois++; return rep(400); }, sansAttendre);
  assert.equal(r.status, 400); assert.equal(envois, 1);
});
await test('reessayer : l\'attente suit Retry-After (au moins 2 s quand le serveur dit « 2 »)', async () => {
  const pauses = []; const suite = [rep(429, '2'), rep(200)]; let i = 0;
  await reessayer(async () => suite[i++], { dormir: async (ms) => { pauses.push(ms); } });
  assert.equal(pauses.length, 1); assert.ok(pauses[0] >= 2000 && pauses[0] < 3000);
});
await test('l\'extrait de la vidéo est identique au code testé (≤ 10 lignes, ≤ 32 caractères)', () => {
  const src = readFileSync(new URL('./reessais.js', import.meta.url), 'utf8').split('\n');
  const a = src.findIndex((l) => l.includes('▼ extrait vidéo')), b = src.findIndex((l) => l.includes('▲ extrait vidéo'));
  const code = src.slice(a + 1, b).join('\n');
  const ecran = readFileSync(new URL('./extrait-video.txt', import.meta.url), 'utf8').trimEnd();
  assert.equal(code, ecran);
  const lignes = ecran.split('\n'); assert.ok(lignes.length <= 10, lignes.length + ' lignes'); assert.ok(lignes.every((l) => l.length <= 32), 'ligne > 32');
});
console.log(`\nTOUS LES TESTS PASSENT (${ok})`);
