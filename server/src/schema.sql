CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS friendships (
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (requester_id, receiver_id),
  CHECK (requester_id <> receiver_id)
);

CREATE TABLE IF NOT EXISTS worlds (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_open BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS world_members (
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (world_id, user_id)
);

CREATE TABLE IF NOT EXISTS world_edits (
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL CHECK (dimension IN ('overworld', 'nether', 'end', 'end_city')),
  x SMALLINT NOT NULL,
  y SMALLINT NOT NULL,
  z SMALLINT NOT NULL,
  block_id TEXT,
  PRIMARY KEY (world_id, dimension, x, y, z)
);

CREATE TABLE IF NOT EXISTS world_entities (
  id UUID PRIMARY KEY,
  world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL CHECK (dimension IN ('overworld', 'nether', 'end', 'end_city')),
  kind TEXT NOT NULL,
  x REAL NOT NULL,
  z REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS workshop (
  id UUID PRIMARY KEY,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('skin', 'block_mod')),
  name TEXT NOT NULL,
  payload JSONB NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0 AND price <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchases (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS worlds_owner_idx ON worlds(owner_id);
CREATE INDEX IF NOT EXISTS workshop_created_idx ON workshop(created_at DESC);
