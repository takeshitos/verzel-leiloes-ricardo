import { createHash } from 'node:crypto';

/**
 * Cadeia de hashes do histórico de lances (formato versão 1, descrito em docs/PLANO.md, seção 7).
 *
 * Cada lance guarda prev_hash (hash do lance anterior, ou a gênese do lote no primeiro) e
 * hash = SHA-256(prev_hash + "\n" + conteúdo canônico). Alterar, inserir, remover ou
 * reordenar um lance quebra a cadeia a partir dali.
 *
 * ATENÇÃO: a cadeia sozinha NÃO basta. Quem tem escrita no banco pode recalcular tudo.
 * O checkpoint assinado e a âncora independente (etapa 10) é que tornam isso detectável.
 */

export const AUDIT_FORMAT_VERSION = 1;

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** JSON com as chaves exatamente na ordem do array: o mesmo conteúdo gera sempre o mesmo texto. */
function canonical(entries: [string, string | number][]): string {
  return JSON.stringify(Object.fromEntries(entries));
}

export type GenesisInput = {
  lotId: string;
  sellerId: string;
  snapshotId: string;
  startingBidCents: number;
  minIncrementCents: number;
  startsAt: Date;
  originalEndsAt: Date;
};

/** prev_hash do primeiro lance: amarra a cadeia aos parâmetros do lote. */
export function genesisHash(lot: GenesisInput): string {
  return sha256Hex(
    canonical([
      ['v', AUDIT_FORMAT_VERSION],
      ['type', 'lot-genesis'],
      ['lotId', lot.lotId],
      ['sellerId', lot.sellerId],
      ['snapshotId', lot.snapshotId],
      ['startingBidCents', String(lot.startingBidCents)],
      ['minIncrementCents', String(lot.minIncrementCents)],
      ['startsAt', lot.startsAt.toISOString()],
      ['originalEndsAt', lot.originalEndsAt.toISOString()],
    ]),
  );
}

/** Liga o lance ao participante privado sem expor o id na auditoria pública. */
export function bidderRef(bidderId: string, lotId: string): string {
  return sha256Hex(`${bidderId}:${lotId}`);
}

export type BidContent = {
  lotId: string;
  seq: number;
  bidId: string;
  bidderRef: string;
  alias: string;
  amountCents: number;
  acceptedAt: Date;
};

export function bidCanonicalContent(bid: BidContent): string {
  return canonical([
    ['v', AUDIT_FORMAT_VERSION],
    ['lotId', bid.lotId],
    ['seq', bid.seq],
    ['bidId', bid.bidId],
    ['bidderRef', bid.bidderRef],
    ['alias', bid.alias],
    ['amountCents', String(bid.amountCents)], // texto: sem risco de arredondamento
    ['acceptedAt', bid.acceptedAt.toISOString()], // UTC com milissegundos
  ]);
}

export function bidHash(prevHash: string, bid: BidContent): string {
  return sha256Hex(`${prevHash}\n${bidCanonicalContent(bid)}`);
}
