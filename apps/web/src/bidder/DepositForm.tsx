import { useState, type FormEvent } from 'react';
import { ApiError, apiPost } from '../api/client';
import { isUncertain, useIntentKey } from '../api/intent';
import { Field, Notice } from '../components/ui';
import { formatBrl } from '../format';
import { parseBrlToCents } from '../input-parsing';

type DepositResponse = {
  deposit: { amountCents: number; createdAt: string; simulated: true };
  wallet: { totalCents: number; committedCents: number; availableCents: number };
};

type Feedback =
  | { tone: 'success'; message: string }
  | { tone: 'error'; message: string }
  | { tone: 'uncertain'; message: string; amountCents: number };

/**
 * Depósito SIMULADO. Uma chave de idempotência por intenção: clique duplo e reenvio depois de
 * uma resposta perdida não depositam duas vezes. O saldo mostrado vem sempre do servidor.
 */
export function DepositForm({ onDone }: { onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const intent = useIntentKey();

  async function send(amountCents: number) {
    setSending(true);
    setFeedback(null);
    try {
      const response = await apiPost<DepositResponse>('/wallet/deposits', { amountCents }, {
        idempotencyKey: intent.keyFor(`deposit:${amountCents}`),
      });
      intent.settle();
      setAmount('');
      setFeedback({ tone: 'success', message: `Depósito simulado de ${formatBrl(response.deposit.amountCents)} registrado.` });
    } catch (error) {
      if (isUncertain(error)) {
        // Não sabemos se entrou. A chave fica guardada: reenviar não deposita duas vezes.
        setFeedback({
          tone: 'uncertain',
          amountCents,
          message: 'Não recebemos a resposta do servidor. O saldo abaixo foi conferido de novo; se o depósito não aparecer, reenvie o mesmo pedido.',
        });
      } else {
        intent.settle();
        const apiError = error as ApiError;
        setFeedback({ tone: 'error', message: apiError.details.fields?.amountCents ?? apiError.message });
      }
    } finally {
      setSending(false);
      onDone(); // relê a carteira do servidor (nunca soma no navegador)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    const parsed = parseBrlToCents(amount, 'O valor do depósito');
    if (!parsed.ok) {
      setFieldError(parsed.error);
      return;
    }
    setFieldError(undefined);
    void send(parsed.cents);
  }

  return (
    <form className="card form deposit-form" onSubmit={handleSubmit} noValidate aria-labelledby="deposito">
      <h2 id="deposito">Depósito simulado</h2>
      <p className="muted small">Sem cartão, banco ou dinheiro real. Até R$ 100.000,00 por depósito.</p>
      <div className="inline-form">
        <Field
          id="deposit-amount"
          label="Valor (R$)"
          inputMode="decimal"
          placeholder="1.000,00"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setFieldError(undefined);
          }}
          error={fieldError}
        />
        <button type="submit" className="button button-primary" disabled={sending}>
          {sending ? 'Depositando...' : 'Depositar'}
        </button>
      </div>
      {feedback?.tone === 'success' && <Notice tone="success">{feedback.message}</Notice>}
      {feedback?.tone === 'error' && <Notice tone="error">{feedback.message}</Notice>}
      {feedback?.tone === 'uncertain' && (
        <Notice tone="warning" title="Depósito sem confirmação">
          <p>{feedback.message}</p>
          <button
            type="button"
            className="button button-secondary button-small"
            disabled={sending}
            onClick={() => void send(feedback.amountCents)}
          >
            Reenviar o mesmo pedido ({formatBrl(feedback.amountCents)})
          </button>
        </Notice>
      )}
    </form>
  );
}
