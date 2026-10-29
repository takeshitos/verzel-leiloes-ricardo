-- Up Migration

-- Lotes vencidos que o job de liquidação NÃO conseguiu liquidar, com o motivo.
-- Torna o estado operacional visível (painel do leiloeiro e logs) em vez de falhar em silêncio.
--   tampered     auditoria ADULTERADO: o lote não é liquidado
--   pending      auditoria VERIFICAÇÃO PENDENTE: espera a âncora confirmar o último lance
--   unavailable  auditoria VERIFICAÇÃO INDISPONÍVEL: âncora fora do ar ou lances sem checkpoint
--   failed       erro inesperado na transação (tudo desfeito); tenta de novo no próximo ciclo
-- A linha é apagada na mesma transação que liquida o lote.
CREATE TABLE settlement_issues (
  lot_id      UUID PRIMARY KEY REFERENCES lots (id),
  status      TEXT NOT NULL,
  reason      TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 1,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT settlement_issues_status_valid CHECK (status IN ('tampered', 'pending', 'unavailable', 'failed')),
  CONSTRAINT settlement_issues_attempts_positive CHECK (attempts > 0)
);

-- Referência pública da transação no comprovante (ex.: LIQ-3F9A1C07B2): única.
CREATE UNIQUE INDEX receipts_reference_unique ON receipts ((payload ->> 'reference'));

-- Down Migration

DROP INDEX IF EXISTS receipts_reference_unique;
DROP TABLE IF EXISTS settlement_issues;
