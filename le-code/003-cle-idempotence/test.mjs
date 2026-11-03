// Tests du Code #003 : on simule un réseau qui perd la RÉPONSE (le serveur a bien débité) et un client qui réessaie.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creerServeur, creerServeurNaif, payerAvecReessais } from './paiement.js';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function banque({ refuser = false } = {}) {
  const debits = [];
  const debiter = async (cmd) => { await dormir(30); if (refuser) throw new Error('carte refusée'); debits.push(cmd.montant); return { recu: 'R' + debits.length, montant: cmd.montant }; };
  return { debiter, debits };
}
// réseau : la réponse du 1er appel se perd (le serveur a quand même traité la requête)
function reseau(serveur, perdre = 1) {
  let appels = 0;
  return async (cle, cmd) => { appels++; const rep = await serveur.payer(cle, cmd); if (appels <= perdre) throw new Error('délai dépassé'); return rep; };
}
const cmd = { commande: 'A-1042', montant: 49.9 };
let ok = 0; const test = async (nom, f) => { await f(); ok++; console.log('OK  ', nom); };

await test('sans clé : réponse perdue + réessai = débité 2 fois', async () => {
  const b = banque(); const rep = await payerAvecReessais(reseau(creerServeurNaif(b.debiter)), cmd);
  assert.equal(b.debits.length, 2); assert.equal(rep.recu, 'R2');
});
await test('avec clé : réponse perdue + réessai = 1 seul débit, même reçu', async () => {
  const b = banque(); const s = creerServeur(b.debiter); const rep = await payerAvecReessais(reseau(s), cmd);
  assert.equal(b.debits.length, 1); assert.equal(rep.recu, 'R1'); assert.equal(s.cles(), 1);
});
await test('double clic : 2 essais simultanés, même clé = 1 seul débit (on garde la promesse)', async () => {
  const b = banque(); const s = creerServeur(b.debiter); const cle = crypto.randomUUID();
  const [r1, r2] = await Promise.all([s.payer(cle, cmd), s.payer(cle, cmd)]);
  assert.equal(b.debits.length, 1); assert.deepEqual(r1, r2);
});
await test('deux paiements distincts = deux clés = deux débits', async () => {
  const b = banque(); const s = creerServeur(b.debiter);
  await payerAvecReessais(reseau(s, 0), cmd); await payerAvecReessais(reseau(s, 0), { commande: 'A-1043', montant: 12 });
  assert.equal(b.debits.length, 2); assert.equal(s.cles(), 2);
});
await test('carte refusée : le réessai reçoit le même refus, sans redébiter', async () => {
  const b = banque({ refuser: true }); const s = creerServeur(b.debiter); const cle = crypto.randomUUID();
  await assert.rejects(s.payer(cle, cmd), /carte refusée/); await assert.rejects(s.payer(cle, cmd), /carte refusée/);
  assert.equal(b.debits.length, 0);
});
await test('les extraits de la vidéo sont identiques au code testé (≤ 10 lignes, ≤ 32 caractères)', async () => {
  const src = readFileSync(new URL('./paiement.js', import.meta.url), 'utf8').split('\n');
  const bloc = (nom) => { const a = src.findIndex((l) => l.includes(`▼ extrait vidéo (${nom})`)), b = src.findIndex((l) => l.includes(`▲ extrait vidéo (${nom})`));
    return src.slice(a + 1, b).map((l) => l.slice(2)); };
  const code = [...bloc('client'), ...bloc('serveur')].join('\n');
  const ecran = readFileSync(new URL('./extrait-video.txt', import.meta.url), 'utf8').trimEnd();
  assert.equal(code, ecran);
  const lignes = ecran.split('\n'); assert.ok(lignes.length <= 10, lignes.length + ' lignes'); assert.ok(lignes.every((l) => l.length <= 32));
});
console.log(`\nTOUS LES TESTS PASSENT (${ok})`);
