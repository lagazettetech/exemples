-- Le Code #010 — 1 page, 101 requêtes : le problème N+1 (SQL, PostgreSQL)
-- Schéma de l'exemple : des clients, et leurs commandes (une commande appartient à un client).

CREATE TABLE clients (
  id  integer PRIMARY KEY,
  nom text    NOT NULL
);

CREATE TABLE commandes (
  id        integer PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients (id),
  total     integer NOT NULL   -- en euros, entier pour rester simple
);

CREATE INDEX commandes_client_id ON commandes (client_id);
