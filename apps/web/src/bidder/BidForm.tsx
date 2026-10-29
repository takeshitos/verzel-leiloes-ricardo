import { useState, type FormEvent } from 'react';
import { ApiError, apiPost } from '../api/client';
import { isUncertain, useIntentKey } from '../api/intent';
import { Field, Notice } from '../components/ui';
import { formatBrl, formatDateTime } from '../format';
import { parseBrlToCents } from '../input-parsing';
import type { PublicBid, PublicLot } from '../realtime/types';

type BidResponse = {
  bid: { seq: number; amountCents: number; acceptedAt: string; alias: string };
  lot: { version: number; endsAt: string; extended: boolean };
  audit: { status: 'pending' | 'confirmed' };
};

// atVersion: versão do lote a que o aviso se refere. Se o lote mudar (outro lance), o aviso
// antigo some, para não contradizer o indicador atual.
type Feedback =
  | { tone: 'success'; message: string; atVersion: number }
  | { tone: 'error'; title: string; message: string; atVersion: number }
  | { tone: 'uncertain'; amountCents: number };

/** Títulos das recusas. A mensagem detalhada (com valores) vem da própria API. */
const REFUSAL_TITLE: Record<string, string> = {
  BID_BELOW_MINIMUM: 'Abaixo do mínimo',
  INSUFFICIENT_FUNDS: 'Saldo insuficiente',
  ALREADY_LEADING: 'Você já está ganhando',
  LOT_NOT_STARTED: 'Ainda não começou',
  LOT_ENDED: 'Leilão encerrado',
  LOT_CANCELLED: 'Lote cancelado',
  FORBIDDEN: 'Sem permissão',
  UNAUTHENTICATED: 'Sessão expirada',
  TOO_MANY_REQUESTS: 'Muitos lances seguidos',
};

/** Texto inicial do campo: o próximo mínimo, no formato brasileiro sem "R$". */
function centsToInput(cents: number): string {
  return formatBrl(cents).replace(/^R\$\s*/, '').replace(/\s/g, '');
}

type Props = {
  lot: PublicLot;
  bids: PublicBid[];
  alias: string;
  availableCents: number | null;
  /** Relê o lote e o histórico no servidor (a tela nunca muda por otimismo). */
  resync: () => void;
};

/**
 * Lance: valor em centavos (convertido por texto), usuário da sessão e chave de idempotência.
 * Nada muda na tela antes da resposta do servidor; depois dela, o estado é relido.
 */
export function BidForm({ lot, bids, alias, availableCents, resync }: Props) {
  // Enquanto a pessoa não digita, o campo acompanha o mínimo atual do servidor.
  const [typed, setTyped] = useState<string | null>(null);
  const amount = typed ?? centsToInput(lot.nextMinimumBidCents);
  const setAmount = (value: string | null) => setTyped(value);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const intent = useIntentKey();

  async function send(amountCents: number) {
    setSending(true);
    setFeedback(null);
    try {
      const response = await apiPost<BidResponse>(`/lots/${lot.id}/bids`, { amountCents }, {
        idempotencyKey: intent.keyFor(`bid:${lot.id}:${amountCents}`),
      });
      intent.settle();
      setAmount(null);
      const audit =
        response.audit.status === 'confirmed' ? 'registrado na auditoria' : 'registro na auditoria ainda pendente de confirmação';
      setFeedback({
        tone: 'success',
        atVersion: response.lot.version,
        message:
          `Lance de ${formatBrl(response.bid.amountCents)} aceito às ${formatDateTime(response.bid.acceptedAt, true)} (${audit}). ` +
          (response.lot.extended ? 'O fim foi prorrogado. ' : '') +
          'Liderar ainda não é vitória: vale quem estiver na frente no fim do prazo.',
      });
    } catch (error) {
      if (isUncertain(error)) {
        // Resposta perdida: o lance pode ter entrado. Conferimos pelo histórico, sem reenviar sozinhos.
        setFeedback({ tone: 'uncertain', amountCents });
      } else {
        intent.settle();
        const apiError = error as ApiError;
        setFeedback({
          tone: 'error',
          title: REFUSAL_TITLE[apiError.code] ?? 'Lance recusado',
          message: apiError.message,
          atVersion: lot.version,
        });
        // Abaixo do mínimo: o campo volta a acompanhar o mínimo atual (que o resync traz).
        if (apiError.code === 'BID_BELOW_MINIMUM') setAmount(null);
      }
    } finally {
      setSending(false);
      resync();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    const parsed = parseBrlToCents(amount, 'O valor do lance');
    if (!parsed.ok) {
      setFieldError(parsed.error);
      return;
    }
    setFieldError(undefined);
    void send(parsed.cents);
  }

  // Depois de uma resposta perdida: o histórico relido já mostra se o lance entrou?
  const uncertainLanded =
    feedback?.tone === 'uncertain' && bids.some((bid) => bid.alias === alias && bid.amountCents === feedback.amountCents);

  return (
    <form className="bid-form" onSubmit={handleSubmit} noValidate aria-labelledby="dar-lance">
      <h3 id="dar-lance">Dar lance</h3>
      <div className="inline-form">
        <Field
          id="bid-amount"
          label="Seu lance (R$)"
          inputMode="decimal"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setFieldError(undefined);
          }}
          error={fieldError}
          hint={`Mínimo agora: ${formatBrl(lot.nextMinimumBidCents)}${availableCents !== null ? ` · seu disponível: ${formatBrl(availableCents)}` : ''}`}
        />
        <button type="submit" className="button button-primary" disabled={sending}>
          {sending ? 'Enviando...' : 'Dar lance'}
        </button>
      </div>
      <button type="button" className="link-button small" onClick={() => setAmount(null)}>
        Usar o mínimo ({formatBrl(lot.nextMinimumBidCents)})
      </button>

      {feedback?.tone === 'success' && feedback.atVersion === lot.version && <Notice tone="success">{feedback.message}</Notice>}
      {feedback?.tone === 'error' && feedback.atVersion === lot.version && (
        <Notice tone="error" title={feedback.title}>
          {feedback.message}
        </Notice>
      )}
      {feedback?.tone === 'uncertain' &&
        (uncertainLanded ? (
          <Notice tone="success">
            A resposta se perdeu, mas o histórico do servidor mostra o seu lance de {formatBrl(feedback.amountCents)}.
          </Notice>
        ) : (
          <Notice tone="warning" title="Lance sem confirmação">
            <p>
              Não recebemos a resposta do servidor e o histórico ainda não mostra o lance de {formatBrl(feedback.amountCents)}.
              Reenviar usa o mesmo pedido: se ele já tiver entrado, não vira um segundo lance.
            </p>
            <button
              type="button"
              className="button button-secondary button-small"
              disabled={sending}
              onClick={() => void send(feedback.amountCents)}
            >
              Reenviar o mesmo pedido
            </button>
          </Notice>
        ))}
    </form>
  );
}
