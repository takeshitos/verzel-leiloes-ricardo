-- Up Migration

-- Âncora independente do histórico de lances (banco SEPARADO do principal).
-- Cada linha é um checkpoint assinado (Ed25519) pelo servidor: lote, quantidade de lances,
-- hash do último lance e versão da chave. A tabela é somente inserção.
CREATE TABLE anchor_entries (
  lot_id      UUID NOT NULL,
  bid_count   INTEGER NOT NULL,
  last_hash   TEXT NOT NULL,
  signature   TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lot_id, bid_count),
  CONSTRAINT anchor_entries_bid_count_positive CHECK (bid_count > 0),
  CONSTRAINT anchor_entries_last_hash_format CHECK (last_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT anchor_entries_key_version_positive CHECK (key_version > 0)
);

-- Recusa UPDATE, DELETE e TRUNCATE. Em produção o usuário da aplicação também só tem
-- INSERT e SELECT (ver docs/DEPLOY.md); o gatilho protege mesmo contra erro de configuração.
CREATE FUNCTION anchor_entries_insert_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'anchor_entries é somente inserção: % não é permitido', TG_OP;
END;
$$;

CREATE TRIGGER anchor_entries_no_update_or_delete
  BEFORE UPDATE OR DELETE ON anchor_entries
  FOR EACH ROW EXECUTE FUNCTION anchor_entries_insert_only();

CREATE TRIGGER anchor_entries_no_truncate
  BEFORE TRUNCATE ON anchor_entries
  FOR EACH STATEMENT EXECUTE FUNCTION anchor_entries_insert_only();

-- Down Migration

DROP TABLE IF EXISTS anchor_entries;
DROP FUNCTION IF EXISTS anchor_entries_insert_only();
