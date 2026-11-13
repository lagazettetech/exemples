-- Le Code #008 — Commande enregistrée, mail jamais parti (SQL, PostgreSQL 13+)
-- Schéma de l'exemple : les commandes, la table outbox, et le registre du consommateur (service mail).

CREATE TABLE commandes (
  id   integer PRIMARY KEY,
  mail text    NOT NULL CHECK (mail LIKE '%@%')
);

-- L'outbox : un événement par ligne, écrit DANS la transaction qui modifie les données métier.
CREATE TABLE outbox (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(), -- identifiant de l'événement (sert au dédoublonnage)
  type      text        NOT NULL,                              -- ex. 'commande.creee'
  ref       integer     NOT NULL,                              -- la commande concernée
  cree_le   timestamptz NOT NULL DEFAULT clock_timestamp(),
  envoye_le timestamptz                                        -- NULL = pas encore publié par le relais
);
CREATE INDEX outbox_a_envoyer ON outbox (cree_le) WHERE envoye_le IS NULL;

-- Côté consommateur (le service mail) : les événements déjà traités.
-- La clé primaire refuse un 2e passage du même événement.
CREATE TABLE evenements_traites (
  evenement_id uuid PRIMARY KEY,
  traite_le    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mails_envoyes (
  commande_id integer NOT NULL,
  envoye_le   timestamptz NOT NULL DEFAULT now()
);
