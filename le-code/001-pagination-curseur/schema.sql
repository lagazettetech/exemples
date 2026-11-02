CREATE TABLE posts (
  id         bigint PRIMARY KEY,
  created_at timestamptz NOT NULL,
  title      text NOT NULL
);

-- L'index qui rend la pagination par curseur rapide : même ordre que la requête
CREATE INDEX posts_created_at_id_idx ON posts (created_at DESC, id DESC);
