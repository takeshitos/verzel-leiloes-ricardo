-- Up Migration

-- Esquema inicial da casa de leilões.
-- Regras gerais:
--   * dinheiro em centavos inteiros (BIGINT), nunca decimal de ponto flutuante;
--   * datas com fuso (TIMESTAMPTZ), gravadas em UTC;
--   * texto com CHECK no lugar de ENUM, para facilitar migrações futuras.

-- Usuários ------------------------------------------------------------------
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL,
  -- Pseudônimo público aleatório (ex.: LIC-7F3A9C). É o único identificador exibido publicamente.
  public_alias  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT users_role_valid CHECK (role IN ('seller', 'bidder')),
  CONSTRAINT users_public_alias_unique UNIQUE (public_alias),
  CONSTRAINT users_public_alias_format CHECK (public_alias ~ '^(VEN|LIC)-[0-9A-F]{6}$')
);

-- Sessões: o cookie guarda o token; o banco guarda só o hash SHA-256 (hex).
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT sessions_token_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT sessions_expiry_after_creation CHECK (expires_at > created_at)
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- Carteiras -----------------------------------------------------------------
-- O total é persistido; o comprometido é a soma das reservas ativas (tabela reservations).
-- Disponível = total - comprometido, calculado sob bloqueio da carteira.
CREATE TABLE wallets (
  user_id     UUID PRIMARY KEY REFERENCES users (id),
  total_cents BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallets_total_not_negative CHECK (total_cents >= 0)
);

-- Snapshots do catálogo externo -----------------------------------------------
-- Cópia local e congelada do item no momento da criação do lote. Páginas de lotes
-- leem daqui e não dependem da API externa.
CREATE TABLE item_snapshots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         TEXT NOT NULL,
  external_id      TEXT NOT NULL,
  accession_number TEXT,
  title            TEXT NOT NULL,
  creators         TEXT,
  creation_date    TEXT,
  technique        TEXT,
  item_type        TEXT,
  culture          TEXT,
  measurements     TEXT,
  image_url        TEXT,
  image_width      INTEGER,
  image_height     INTEGER,
  source_url       TEXT,
  license          TEXT NOT NULL,
  raw              JSONB NOT NULL,
  fetched_at       TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT item_snapshots_provider_valid CHECK (provider IN ('cma')),
  CONSTRAINT item_snapshots_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT item_snapshots_image_size_positive CHECK (
    (image_width IS NULL OR image_width > 0) AND (image_height IS NULL OR image_height > 0)
  ),
  CONSTRAINT item_snapshots_unique_fetch UNIQUE (provider, external_id, fetched_at)
);

-- Lotes ---------------------------------------------------------------------
CREATE TABLE lots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id           UUID NOT NULL REFERENCES users (id),
  snapshot_id         UUID NOT NULL REFERENCES item_snapshots (id),
  starting_bid_cents  BIGINT NOT NULL,
  min_increment_cents BIGINT NOT NULL,
  starts_at           TIMESTAMPTZ NOT NULL,
  -- Fim definido pelo vendedor; ends_at pode crescer com a prorrogação (anti-sniping).
  original_ends_at    TIMESTAMPTZ NOT NULL,
  ends_at             TIMESTAMPTZ NOT NULL,
  cancelled_at        TIMESTAMPTZ,
  bid_count           INTEGER NOT NULL DEFAULT 0,
  leader_bid_id       UUID,
  -- Versão sobe a cada mudança; os eventos em tempo real a usam para descartar dados antigos.
  version             INTEGER NOT NULL DEFAULT 0,
  -- Chave usada só por scripts de seed/demo para criar lotes de forma idempotente.
  seed_key            TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lots_starting_bid_positive CHECK (starting_bid_cents > 0),
  CONSTRAINT lots_min_increment_positive CHECK (min_increment_cents > 0),
  CONSTRAINT lots_end_after_start CHECK (original_ends_at > starts_at),
  CONSTRAINT lots_end_never_before_original CHECK (ends_at >= original_ends_at),
  CONSTRAINT lots_bid_count_not_negative CHECK (bid_count >= 0),
  CONSTRAINT lots_version_not_negative CHECK (version >= 0),
  -- Lote cancelado nunca tem lances; lote com lances nunca pode ser cancelado.
  CONSTRAINT lots_cancelled_only_without_bids CHECK (cancelled_at IS NULL OR bid_count = 0),
  -- Há líder se e somente se houver lances.
  CONSTRAINT lots_leader_matches_bid_count CHECK ((leader_bid_id IS NULL) = (bid_count = 0)),
  CONSTRAINT lots_seed_key_unique UNIQUE (seed_key)
);
CREATE INDEX lots_seller_id_idx ON lots (seller_id);
CREATE INDEX lots_open_ends_at_idx ON lots (ends_at) WHERE cancelled_at IS NULL;
CREATE INDEX lots_starts_at_idx ON lots (starts_at);

-- Lances --------------------------------------------------------------------
-- Histórico encadeado por hash (detalhes do formato em docs/PLANO.md, seção 7).
CREATE TABLE bids (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id       UUID NOT NULL REFERENCES lots (id),
  seq          INTEGER NOT NULL,
  bidder_id    UUID NOT NULL REFERENCES users (id),
  -- Pseudônimo congelado no momento do lance (o que aparece na auditoria pública).
  public_alias TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  accepted_at  TIMESTAMPTZ NOT NULL,
  -- SHA-256 de bidder_id + lot_id: liga o lance ao participante sem expor o id.
  bidder_ref   TEXT NOT NULL,
  prev_hash    TEXT NOT NULL,
  hash         TEXT NOT NULL,
  CONSTRAINT bids_seq_positive CHECK (seq > 0),
  CONSTRAINT bids_amount_positive CHECK (amount_cents > 0),
  CONSTRAINT bids_bidder_ref_format CHECK (bidder_ref ~ '^[0-9a-f]{64}$'),
  CONSTRAINT bids_prev_hash_format CHECK (prev_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT bids_hash_format CHECK (hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT bids_lot_seq_unique UNIQUE (lot_id, seq),
  -- Permite chaves estrangeiras compostas que garantem "lance do mesmo lote".
  CONSTRAINT bids_lot_id_id_unique UNIQUE (lot_id, id)
);
CREATE INDEX bids_bidder_lot_idx ON bids (bidder_id, lot_id);

-- O líder do lote precisa ser um lance desse mesmo lote.
ALTER TABLE lots
  ADD CONSTRAINT lots_leader_bid_same_lot
  FOREIGN KEY (id, leader_bid_id) REFERENCES bids (lot_id, id);

-- Reservas ------------------------------------------------------------------
-- No máximo uma reserva ativa por lote: a do líder atual. Superar o líder troca esta linha.
CREATE TABLE reservations (
  lot_id       UUID PRIMARY KEY REFERENCES lots (id),
  bidder_id    UUID NOT NULL REFERENCES wallets (user_id),
  bid_id       UUID NOT NULL,
  amount_cents BIGINT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reservations_amount_positive CHECK (amount_cents > 0),
  CONSTRAINT reservations_bid_same_lot FOREIGN KEY (lot_id, bid_id) REFERENCES bids (lot_id, id)
);
CREATE INDEX reservations_bidder_id_idx ON reservations (bidder_id);

-- Lançamentos financeiros ---------------------------------------------------
-- Trilha de tudo que muda o total da carteira. operation_key única impede efeito duplicado.
CREATE TABLE wallet_entries (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES wallets (user_id),
  kind          TEXT NOT NULL,
  amount_cents  BIGINT NOT NULL,
  operation_key TEXT NOT NULL,
  lot_id        UUID REFERENCES lots (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallet_entries_kind_valid CHECK (kind IN ('deposit', 'settlement_debit', 'settlement_credit')),
  CONSTRAINT wallet_entries_amount_positive CHECK (amount_cents > 0),
  CONSTRAINT wallet_entries_operation_key_unique UNIQUE (operation_key),
  -- Depósito não tem lote; débito e crédito de liquidação sempre têm.
  CONSTRAINT wallet_entries_lot_matches_kind CHECK ((kind = 'deposit') = (lot_id IS NULL))
);
CREATE INDEX wallet_entries_user_created_idx ON wallet_entries (user_id, created_at);

-- Idempotência de requisições (lances e depósitos repetidos por falha de rede) --
CREATE TABLE idempotency_keys (
  user_id             UUID NOT NULL REFERENCES users (id),
  scope               TEXT NOT NULL,
  key                 TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  response_status     INTEGER NOT NULL,
  response_body       JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope, key),
  CONSTRAINT idempotency_keys_key_length CHECK (char_length(key) BETWEEN 8 AND 128)
);

-- Liquidações ---------------------------------------------------------------
-- Uma por lote (chave primária). Sem lances: sem vencedor, sem valor.
CREATE TABLE settlements (
  lot_id         UUID PRIMARY KEY REFERENCES lots (id),
  winner_id      UUID REFERENCES users (id),
  winning_bid_id UUID,
  amount_cents   BIGINT,
  settled_at     TIMESTAMPTZ NOT NULL,
  CONSTRAINT settlements_amount_positive CHECK (amount_cents IS NULL OR amount_cents > 0),
  CONSTRAINT settlements_winner_fields_together CHECK (
    (winner_id IS NULL) = (amount_cents IS NULL) AND (winner_id IS NULL) = (winning_bid_id IS NULL)
  ),
  CONSTRAINT settlements_bid_same_lot FOREIGN KEY (lot_id, winning_bid_id) REFERENCES bids (lot_id, id)
);

-- Comprovantes públicos -------------------------------------------------------
CREATE TABLE receipts (
  lot_id       UUID PRIMARY KEY REFERENCES settlements (lot_id),
  public_token TEXT NOT NULL,
  -- Dados públicos congelados (pseudônimos, valores, datas). Nunca email, nome ou saldo.
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT receipts_public_token_unique UNIQUE (public_token),
  CONSTRAINT receipts_public_token_length CHECK (char_length(public_token) >= 32)
);

-- Auditoria: checkpoints assinados e confirmação na âncora --------------------
-- Funciona como "outbox": nasce 'pending' na transação do lance e vira 'confirmed'
-- depois de gravado na âncora independente. Refinamentos na etapa 10.
CREATE TABLE audit_checkpoints (
  lot_id        UUID NOT NULL REFERENCES lots (id),
  bid_count     INTEGER NOT NULL,
  last_hash     TEXT NOT NULL,
  signature     TEXT NOT NULL,
  key_version   INTEGER NOT NULL,
  anchor_status TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at  TIMESTAMPTZ,
  PRIMARY KEY (lot_id, bid_count),
  CONSTRAINT audit_checkpoints_bid_count_positive CHECK (bid_count > 0),
  CONSTRAINT audit_checkpoints_last_hash_format CHECK (last_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT audit_checkpoints_key_version_positive CHECK (key_version > 0),
  CONSTRAINT audit_checkpoints_status_valid CHECK (anchor_status IN ('pending', 'confirmed')),
  CONSTRAINT audit_checkpoints_confirmed_at_matches_status CHECK (
    (anchor_status = 'confirmed') = (confirmed_at IS NOT NULL)
  )
);
CREATE INDEX audit_checkpoints_pending_idx ON audit_checkpoints (created_at) WHERE anchor_status = 'pending';

-- Down Migration

DROP TABLE IF EXISTS audit_checkpoints;
DROP TABLE IF EXISTS receipts;
DROP TABLE IF EXISTS settlements;
DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS wallet_entries;
DROP TABLE IF EXISTS reservations;
ALTER TABLE IF EXISTS lots DROP CONSTRAINT IF EXISTS lots_leader_bid_same_lot;
DROP TABLE IF EXISTS bids;
DROP TABLE IF EXISTS lots;
DROP TABLE IF EXISTS item_snapshots;
DROP TABLE IF EXISTS wallets;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
