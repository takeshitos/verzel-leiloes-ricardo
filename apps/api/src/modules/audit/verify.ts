import { extendedEnd } from '../bids/rules.js';
import type { AnchorEntry } from './anchor.js';
import { bidderRef, bidHash, genesisHash, type GenesisInput } from './chain.js';
import { checkpointMessage, type Keyring } from './keys.js';

/**
 * Verificação do histórico de um lote, como função pura (sem banco): recebe os dados lidos
 * do banco principal e da âncora e decide o estado. A ordem dos testes está em docs/AUDITORIA.md.
 */

export type AuditStatus = 'intact' | 'tampered' | 'pending' | 'unavailable';

export const AUDIT_STATUS_LABEL: Record<AuditStatus, string> = {
  intact: 'ÍNTEGRO',
  tampered: 'ADULTERADO',
  pending: 'VERIFICAÇÃO PENDENTE',
  unavailable: 'VERIFICAÇÃO INDISPONÍVEL',
};

export type StoredBid = {
  id: string;
  seq: number;
  bidderId: string;
  bidderRef: string;
  alias: string;
  amountCents: number;
  acceptedAt: Date;
  prevHash: string;
  hash: string;
};

export type StoredCheckpoint = { bidCount: number; lastHash: string; signature: string; keyVersion: number };

export type LotForAudit = GenesisInput & { endsAt: Date; bidCount: number; leaderBidId: string | null };

export type AnchorView = { available: true; entries: AnchorEntry[] } | { available: false; reason: string };

export type VerificationResult = {
  status: AuditStatus;
  reason: string;
  genesisHash: string;
  signedCount: number;
  anchoredCount: number;
};

/** Passos 1 e 2: sequência e cadeia. Devolve o motivo da falha, ou null se estiver tudo certo. */
export function checkChain(lot: GenesisInput, bids: StoredBid[]): string | null {
  let previous = genesisHash(lot);
  for (let index = 0; index < bids.length; index++) {
    const bid = bids[index];
    if (bid.seq !== index + 1) {
      return `A sequência de lances está quebrada na posição ${index + 1} (encontrado o lance ${bid.seq}).`;
    }
    if (bid.bidderRef !== bidderRef(bid.bidderId, lot.lotId)) {
      return `O participante do lance ${bid.seq} foi alterado.`;
    }
    if (bid.prevHash !== previous) {
      return `O lance ${bid.seq} não se encadeia com o anterior (lance inserido, removido ou reordenado).`;
    }
    const expected = bidHash(previous, {
      lotId: lot.lotId,
      seq: bid.seq,
      bidId: bid.id,
      bidderRef: bid.bidderRef,
      alias: bid.alias,
      amountCents: bid.amountCents,
      acceptedAt: bid.acceptedAt,
    });
    if (expected !== bid.hash) {
      return `O conteúdo do lance ${bid.seq} foi alterado.`;
    }
    previous = bid.hash;
  }
  return null;
}

export function verifyHistory(params: {
  lot: LotForAudit;
  bids: StoredBid[];
  checkpoints: StoredCheckpoint[];
  anchor: AnchorView;
  keyring: Keyring;
}): VerificationResult {
  const { lot, bids, checkpoints, anchor, keyring } = params;
  const genesis = genesisHash(lot);
  const base = { genesisHash: genesis, signedCount: 0, anchoredCount: 0 };
  const tampered = (reason: string): VerificationResult => ({ ...base, status: 'tampered', reason });
  const hashAt = (count: number) => bids[count - 1]?.hash;

  // 1-2. Sequência, participante e cadeia.
  const chainProblem = checkChain(lot, bids);
  if (chainProblem) return tampered(chainProblem);

  // 3. O lote precisa ser coerente com o histórico.
  if (lot.bidCount !== bids.length) {
    return tampered(`O lote diz ter ${lot.bidCount} lance(s), mas o histórico tem ${bids.length}.`);
  }
  if (lot.leaderBidId !== (bids.at(-1)?.id ?? null)) {
    return tampered('O líder registrado no lote não é o último lance do histórico.');
  }
  const expectedEnd = bids.reduce((end, bid) => extendedEnd(end, bid.acceptedAt), lot.originalEndsAt);
  if (expectedEnd.getTime() !== lot.endsAt.getTime()) {
    return tampered('O horário de término do lote não confere com as prorrogações causadas pelos lances.');
  }

  // 4. Checkpoints do banco principal: assinatura e conteúdo.
  for (const checkpoint of checkpoints) {
    const message = checkpointMessage({ lotId: lot.lotId, ...checkpoint });
    if (!keyring.verify(message, checkpoint.signature, checkpoint.keyVersion)) {
      return tampered(`O checkpoint do lance ${checkpoint.bidCount} tem assinatura inválida.`);
    }
    if (checkpoint.bidCount > bids.length) {
      return tampered(`Um checkpoint assinado registra ${checkpoint.bidCount} lance(s), mas o histórico tem ${bids.length} (lances removidos).`);
    }
    if (hashAt(checkpoint.bidCount) !== checkpoint.lastHash) {
      return tampered(`O histórico não confere com o checkpoint assinado do lance ${checkpoint.bidCount}.`);
    }
  }
  const signedCount = Math.max(0, ...checkpoints.map((checkpoint) => checkpoint.bidCount));

  // 5. Âncora independente. Sem ela, não se afirma integridade.
  if (!anchor.available) {
    return {
      ...base,
      signedCount,
      status: 'unavailable',
      reason: 'A âncora independente não respondeu agora. Sem ela não é possível confirmar a integridade.',
    };
  }
  for (const entry of anchor.entries) {
    const message = checkpointMessage({ lotId: lot.lotId, bidCount: entry.bidCount, lastHash: entry.lastHash, keyVersion: entry.keyVersion });
    if (!keyring.verify(message, entry.signature, entry.keyVersion)) {
      return { ...tampered(`A entrada da âncora do lance ${entry.bidCount} tem assinatura inválida.`), signedCount };
    }
    if (entry.bidCount > bids.length) {
      return {
        ...tampered(
          `A âncora registra ${entry.bidCount} lance(s), mas o banco tem ${bids.length}: lances removidos ou banco restaurado a um estado antigo.`,
        ),
        signedCount,
      };
    }
    if (hashAt(entry.bidCount) !== entry.lastHash) {
      return { ...tampered(`O histórico do banco diverge da âncora a partir do lance ${entry.bidCount} ou antes.`), signedCount };
    }
  }
  const anchoredCount = Math.max(0, ...anchor.entries.map((entry) => entry.bidCount));
  const counts = { ...base, signedCount, anchoredCount };

  // 6. Cobertura: todo lance precisa estar coberto por assinatura (e, para ÍNTEGRO, pela âncora).
  if (bids.length === 0) {
    return { ...counts, status: 'intact', reason: 'Lote sem lances, e a âncora também não registra nenhum.' };
  }
  const covered = Math.max(signedCount, anchoredCount);
  if (covered < bids.length) {
    if (checkpoints.length === 0 && anchor.entries.length === 0) {
      return {
        ...counts,
        status: 'unavailable',
        reason: 'Os lances deste lote não têm checkpoint assinado (registrados antes da auditoria). Não é possível confirmar a integridade.',
      };
    }
    return { ...counts, status: 'tampered', reason: `Os lances ${covered + 1} a ${bids.length} não têm checkpoint assinado.` };
  }
  if (anchoredCount < bids.length) {
    return {
      ...counts,
      status: 'pending',
      reason: `Os lances ${anchoredCount + 1} a ${bids.length} têm checkpoint assinado, mas ainda não foram confirmados na âncora.`,
    };
  }
  return { ...counts, status: 'intact', reason: 'O histórico completo confere com as assinaturas e com a âncora independente.' };
}
