// Tests du Code #002 : on simule une frappe au clavier et un serveur dont les réponses arrivent dans le désordre.
// « chaus » (5 lettres ou moins) répond lentement (900 ms), « chaussures » vite (150 ms) — comme un vrai serveur
// pour qui une recherche courte renvoie beaucoup plus de résultats.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brancherRecherche, rechercheNaive, debounceSeul } from './recherche.js';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let requetes = 0, annulees = 0, statut = 200;

// faux fetch : respecte AbortSignal comme le vrai (rejet DOMException « AbortError »)
globalThis.fetch = (url, { signal } = {}) => new Promise((resolve, reject) => {
  requetes++;
  const q = new URL(url, 'https://exemple.test').searchParams.get('q');
  const lent = q.length <= 5 ? 900 : 150;
  const fin = setTimeout(() => resolve({ ok: statut < 400, status: statut, json: async () => ({ q }) }), lent);
  signal?.addEventListener('abort', () => { clearTimeout(fin); annulees++; reject(new DOMException('annulée', 'AbortError')); });
});

function champ() { return { value: '', oninput: null }; }
async function taper(input, texte, ecart = 60) {
  for (const c of texte) { input.value += c; input.oninput(); await dormir(ecart); }
}
async function scenario(brancher, frappes) {
  requetes = 0; annulees = 0;
  const input = champ(), affiches = [], erreurs = [];
  brancher(input, () => '/recherche?q=' + encodeURIComponent(input.value), (d) => affiches.push(d.q), (e) => erreurs.push(e));
  await frappes(input);
  await dormir(1500); // on laisse toutes les réponses arriver
  return { requetes, annulees, affiches, final: affiches.at(-1), erreurs };
}
const motDUnCoup = (i) => taper(i, 'chaussures');
const avecPause = async (i) => { await taper(i, 'chaus'); await dormir(400); await taper(i, 'sures'); };
let ok = 0; const test = async (nom, f) => { await f(); ok++; console.log('OK  ', nom); };

await test('naïf : 10 lettres = 10 requêtes, et « chaus » arrive en dernier', async () => {
  const r = await scenario(rechercheNaive, motDUnCoup);
  assert.equal(r.requetes, 10);
  assert.equal(r.final, 'chaus');
  console.log('      affichés dans l\'ordre :', r.affiches.join(' → '));
});
await test('debounce seul, frappe continue : 1 requête', async () => {
  const r = await scenario(debounceSeul, motDUnCoup);
  assert.equal(r.requetes, 1); assert.equal(r.final, 'chaussures');
});
await test('debounce seul, pause au milieu du mot : la vieille réponse écrase la bonne', async () => {
  const r = await scenario(debounceSeul, avecPause);
  assert.equal(r.requetes, 2); assert.equal(r.final, 'chaus');
});
await test('debounce + AbortController, frappe continue : 1 requête, bon résultat', async () => {
  const r = await scenario(brancherRecherche, motDUnCoup);
  assert.equal(r.requetes, 1); assert.deepEqual(r.affiches, ['chaussures']); assert.equal(r.erreurs.length, 0);
});
await test('debounce + AbortController, pause : « chaus » annulée, jamais affichée, pas d\'erreur', async () => {
  const r = await scenario(brancherRecherche, avecPause);
  assert.equal(r.requetes, 2); assert.equal(r.annulees, 1);
  assert.deepEqual(r.affiches, ['chaussures']); assert.equal(r.erreurs.length, 0);
});
await test('une vraie erreur (HTTP 500) remonte, elle', async () => {
  statut = 500;
  const r = await scenario(brancherRecherche, motDUnCoup);
  statut = 200;
  assert.equal(r.erreurs.length, 1); assert.match(r.erreurs[0].message, /HTTP 500/);
});
await test('l\'extrait de la vidéo est identique au code testé (≤ 10 lignes, ≤ 32 caractères)', async () => {
  const src = readFileSync(new URL('./recherche.js', import.meta.url), 'utf8').split('\n');
  const a = src.findIndex((l) => l.includes('▼ extrait vidéo')), b = src.findIndex((l) => l.includes('▲ extrait vidéo'));
  const code = src.slice(a + 1, b).map((l) => l.slice(2)).join('\n');
  const ecran = readFileSync(new URL('./extrait-video.txt', import.meta.url), 'utf8').trimEnd();
  assert.equal(code, ecran);
  const lignes = ecran.split('\n');
  assert.ok(lignes.length <= 10, lignes.length + ' lignes');
  assert.ok(lignes.every((l) => l.length <= 32), 'ligne > 32 caractères');
});
console.log(`\nTOUS LES TESTS PASSENT (${ok})`);
