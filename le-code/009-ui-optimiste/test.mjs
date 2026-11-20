// Tests du Code #009 : un serveur simulé (latence et pannes réglées requête par requête).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bouton, boutonNaif } from './like.js';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
// `plan` = une entrée par envoi, dans l'ordre des clics : { ms, panne }.
// Le serveur applique chaque envoi réussi au moment où il le traite (fin de sa latence).
function serveur(plan, depart = false) {
  const etat = { aime: depart, envois: 0 };
  const envoyer = async (id, oui) => {
    const { ms, panne } = plan[etat.envois++];
    await dormir(ms);
    if (panne) throw new Error('503');
    etat.aime = oui;
  };
  const lire = async () => { await dormir(5); return etat.aime; };
  return { etat, envoyer, lire };
}
const post = (aime = false) => ({ id: 42, aime, clics: 0 });
const ecran = () => { const vus = []; return { vus, maj: (p) => vus.push(p.aime) }; };
let ok = 0; const test = async (nom, f) => { await f(); ok++; console.log('OK  ', nom); };

// Le scénario de la vidéo : j'aime, je n'aime plus, j'aime. Le 1er envoi échoue… en dernier.
const TROIS_CLICS = [{ ms: 60, panne: true }, { ms: 10 }, { ms: 20 }];
async function troisClics(aimer, p) {
  const a = aimer(p, true); await dormir(2);
  const b = aimer(p, false); await dormir(2);
  const c = aimer(p, true);
  await Promise.all([a, b, c]);
}

await test('naïf, 3 clics rapides : la panne en retard efface le dernier clic (cœur vide, serveur « aimé »)', async () => {
  const s = serveur(TROIS_CLICS); const e = ecran(); const p = post();
  await troisClics(boutonNaif({ ...s, ...e }), p);
  assert.equal(s.etat.aime, true);           // le serveur a bien enregistré le dernier clic
  assert.equal(p.aime, false);               // l'écran dit le contraire
});
await test('numéro de clic, 3 clics rapides : la vieille panne est ignorée, écran = serveur', async () => {
  const s = serveur(TROIS_CLICS); const e = ecran(); const p = post();
  await troisClics(bouton({ ...s, ...e }), p);
  assert.equal(s.etat.aime, true);
  assert.equal(p.aime, true);
  assert.equal(p.clics, 3);
});
await test('le cœur change avant la réponse du serveur (optimiste)', async () => {
  const s = serveur([{ ms: 30 }]); const e = ecran(); const p = post();
  const fini = bouton({ ...s, ...e })(p, true);
  assert.deepEqual(e.vus, [true]);           // affiché tout de suite…
  assert.equal(s.etat.aime, false);          // …alors que le serveur n'a encore rien enregistré
  await fini;
  assert.equal(s.etat.aime, true); assert.deepEqual(e.vus, [true]);
});
await test('un seul clic refusé : retour à l\'état réel du serveur', async () => {
  const s = serveur([{ ms: 10, panne: true }]); const e = ecran(); const p = post();
  await bouton({ ...s, ...e })(p, true);
  assert.equal(p.aime, false); assert.deepEqual(e.vus, [true, false]);
});
await test('le dernier clic échoue : on relit le serveur au lieu de deviner', async () => {
  // j'aime (ok), je n'aime plus (refusé) → le serveur dit toujours « aimé »
  const s = serveur([{ ms: 10 }, { ms: 15, panne: true }]); const e = ecran(); const p = post();
  const aimer = bouton({ ...s, ...e });
  const a = aimer(p, true); await dormir(2); const b = aimer(p, false);
  await Promise.all([a, b]);
  assert.equal(s.etat.aime, true); assert.equal(p.aime, true);
});
await test('un nouveau clic pendant la relecture : la relecture périmée n\'écrase pas l\'écran', async () => {
  const s = serveur([{ ms: 5, panne: true }, { ms: 30 }]); const e = ecran(); const p = post();
  const aimer = bouton({ ...s, ...e });
  const a = aimer(p, true);
  await dormir(7);                           // l'envoi 1 a échoué, la relecture (5 ms) est en cours
  const b = aimer(p, true);                  // nouveau clic
  await Promise.all([a, b]);
  assert.equal(p.aime, true); assert.equal(s.etat.aime, true);
});
await test('extrait-video.txt = le corps de aimer() dans like.js, ≤ 10 lignes, ≤ 32 caractères', async () => {
  const extrait = readFileSync(new URL('./extrait-video.txt', import.meta.url), 'utf8').trimEnd().split('\n');
  const src = readFileSync(new URL('./like.js', import.meta.url), 'utf8');
  const corps = src.split('export function bouton(')[1].split('\n').slice(2)
    .filter((l) => l.startsWith('    ')).map((l) => l.slice(4));
  assert.deepEqual(extrait, corps.slice(0, extrait.length));
  assert.equal(corps[extrait.length], undefined);
  assert.ok(extrait.length <= 10);
  for (const l of extrait) assert.ok(l.length <= 32, l);
});
console.log(`\n${ok}/7 tests verts`);
