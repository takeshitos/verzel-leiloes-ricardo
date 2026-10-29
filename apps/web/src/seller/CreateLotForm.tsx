import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiError, apiPost } from '../api/client';
import { isUncertain } from '../api/intent';
import { ArtworkImage } from '../components/ArtworkImage';
import { Field, Notice } from '../components/ui';
import { browserTimeZone, formatBrl, formatDateTime } from '../format';
import { localInputToIso, parseBrlToCents, toLocalInputValue, utcOffsetLabel } from '../input-parsing';
import type { PublicLot } from '../realtime/types';
import type { CatalogItem } from './types';

type FieldName = 'startingBid' | 'minIncrement' | 'startsAt' | 'endsAt';
type FieldErrors = Partial<Record<FieldName, string>>;

/** Nomes da API (details.fields) → campos do formulário. */
const API_FIELD: Record<string, FieldName> = {
  startingBidCents: 'startingBid',
  minIncrementCents: 'minIncrement',
  startsAt: 'startsAt',
  endsAt: 'endsAt',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mostra como o valor digitado foi entendido (ex.: "= R$ 1.000,00"). */
function moneyPreview(text: string): string | undefined {
  const parsed = parseBrlToCents(text);
  return parsed.ok ? `Será enviado como ${formatBrl(parsed.cents)}` : undefined;
}

type Props = {
  item: CatalogItem;
  onCreated: (lot: PublicLot) => void;
  onCancel: () => void;
  /** Sem resposta do servidor: o painel relê a lista de lotes. */
  onUncertain: () => void;
};

/**
 * Dados do lote. A validação aqui só ajuda quem digita: a API valida tudo de novo
 * (valores, datas pelo relógio do banco, obra com imagem) e é ela que decide.
 */
export function CreateLotForm({ item, onCreated, onCancel, onUncertain }: Props) {
  const [startingBid, setStartingBid] = useState('');
  const [minIncrement, setMinIncrement] = useState('');
  const [startMode, setStartMode] = useState<'now' | 'scheduled'>('now');
  const [startsAt, setStartsAt] = useState(() => toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [endsAt, setEndsAt] = useState(() => toLocalInputValue(new Date(Date.now() + DAY_MS)));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uncertain, setUncertain] = useState(false);

  const zone = `${browserTimeZone()}, ${utcOffsetLabel(new Date())}`;
  const endIso = localInputToIso(endsAt);
  const startIso = startMode === 'now' ? null : localInputToIso(startsAt);

  /** Ao editar um campo, o erro antigo dele sai (a validação roda de novo no envio). */
  function clearError(field: FieldName) {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return; // impede o segundo envio enquanto o primeiro não respondeu
    const nextErrors: FieldErrors = {};
    const starting = parseBrlToCents(startingBid, 'O lance inicial');
    const increment = parseBrlToCents(minIncrement, 'O incremento mínimo');
    if (!starting.ok) nextErrors.startingBid = starting.error;
    if (!increment.ok) nextErrors.minIncrement = increment.error;
    const startValue = startMode === 'now' ? new Date().toISOString() : localInputToIso(startsAt);
    if (!startValue) nextErrors.startsAt = 'Informe a data e a hora de início.';
    if (!endIso) nextErrors.endsAt = 'Informe a data e a hora de fim.';
    else if (startValue && Date.parse(endIso) <= Date.parse(startValue)) nextErrors.endsAt = 'O fim precisa ser depois do início.';
    setErrors(nextErrors);
    setApiError(null);
    setUncertain(false);
    if (Object.keys(nextErrors).length > 0 || !starting.ok || !increment.ok) return;

    setSubmitting(true);
    try {
      const { lot } = await apiPost<{ lot: PublicLot }>('/lots', {
        externalId: item.externalId,
        startingBidCents: starting.cents,
        minIncrementCents: increment.cents,
        startsAt: startValue,
        endsAt: endIso,
      });
      onCreated(lot);
    } catch (error) {
      const caught = error instanceof ApiError ? error : new ApiError(0, 'UNKNOWN', 'Erro inesperado ao criar o lote.');
      // Museu fora do ar (503) é recusa definitiva: a obra é buscada antes de gravar qualquer coisa.
      if (isUncertain(caught) && caught.code !== 'CATALOG_UNAVAILABLE') {
        // Sem resposta: o lote PODE ter sido criado. A lista é relida para a pessoa conferir
        // antes de tentar de novo (criar lote não tem chave de idempotência).
        setErrors({});
        setApiError(null);
        setUncertain(true);
        onUncertain();
        return;
      }
      const fromApi: FieldErrors = {};
      for (const [name, message] of Object.entries(caught.details.fields ?? {})) {
        const field = API_FIELD[name];
        if (field) fromApi[field] = message;
      }
      setErrors(fromApi);
      setApiError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form create-lot" onSubmit={handleSubmit} noValidate aria-labelledby="create-lot-title">
      <div className="create-lot-item">
        <ArtworkImage className="create-lot-image" src={item.image?.url ?? null} alt={item.title} />
        <div>
          <p className="eyebrow">Obra escolhida</p>
          <h3 id="create-lot-title">{item.title}</h3>
          <p className="muted small">{[item.creators, item.creationDate, item.technique].filter(Boolean).join(' · ')}</p>
          <p className="muted small">
            Fonte: Cleveland Museum of Art ({item.license})
            {item.sourceUrl && (
              <>
                {' · '}
                <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                  ver no museu
                </a>
              </>
            )}
          </p>
          <button type="button" className="button button-secondary button-small" onClick={onCancel}>
            Trocar obra
          </button>
        </div>
      </div>

      <Notice tone="info">
        Leilão simulado: nenhuma obra é vendida de verdade e os valores são fictícios. Ao criar, o servidor busca a obra
        no museu de novo e guarda uma cópia (snapshot) com a data da coleta.
      </Notice>

      {/* Mensagem da API (ex.: obra sem imagem, museu fora do ar); erros por campo ficam em cada campo. */}
      {apiError && <Notice tone="error">{apiError.message}</Notice>}
      {uncertain && (
        <Notice tone="warning" title="Sem resposta do servidor">
          O lote pode ter sido criado. A lista "Seus lotes" foi relida: confira antes de tentar de novo, para não criar o
          mesmo lote duas vezes.
        </Notice>
      )}

      <div className="form-row">
        <Field
          id="starting-bid"
          label="Lance inicial (R$)"
          inputMode="decimal"
          placeholder="1.000,00"
          value={startingBid}
          onChange={(event) => {
            setStartingBid(event.target.value);
            clearError('startingBid');
          }}
          error={errors.startingBid}
          hint={moneyPreview(startingBid)}
        />
        <Field
          id="min-increment"
          label="Incremento mínimo (R$)"
          inputMode="decimal"
          placeholder="50,00"
          value={minIncrement}
          onChange={(event) => {
            setMinIncrement(event.target.value);
            clearError('minIncrement');
          }}
          error={errors.minIncrement}
          hint={moneyPreview(minIncrement)}
        />
      </div>

      <fieldset className="role-choice">
        <legend>Início</legend>
        <label className={startMode === 'now' ? 'choice is-selected' : 'choice'}>
          <input type="radio" name="start-mode" checked={startMode === 'now'} onChange={() => setStartMode('now')} />
          <span>
            <strong>Começar agora</strong>
            <span className="muted small">O lote abre para lances assim que for criado.</span>
          </span>
        </label>
        <label className={startMode === 'scheduled' ? 'choice is-selected' : 'choice'}>
          <input type="radio" name="start-mode" checked={startMode === 'scheduled'} onChange={() => setStartMode('scheduled')} />
          <span>
            <strong>Agendar</strong>
            <span className="muted small">Fica em "Agendados" na vitrine até a hora escolhida.</span>
          </span>
        </label>
      </fieldset>

      <div className="form-row">
        {startMode === 'scheduled' && (
          <Field
            id="starts-at"
            label="Data e hora de início"
            type="datetime-local"
            value={startsAt}
            onChange={(event) => {
              setStartsAt(event.target.value);
              clearError('startsAt');
            }}
            error={errors.startsAt}
            hint={startIso ? `Em UTC: ${startIso.slice(0, 16).replace('T', ' ')}` : undefined}
          />
        )}
        <Field
          id="ends-at"
          label="Data e hora de fim"
          type="datetime-local"
          value={endsAt}
          onChange={(event) => {
            setEndsAt(event.target.value);
            clearError('endsAt');
          }}
          error={errors.endsAt}
          hint={endIso ? `Termina em ${formatDateTime(endIso)} · em UTC: ${endIso.slice(0, 16).replace('T', ' ')}` : undefined}
        />
      </div>
      {startMode === 'now' && errors.startsAt && <p className="field-error">{errors.startsAt}</p>}
      <p className="muted small">
        Horários no seu fuso ({zone}); o servidor recebe e guarda em UTC. Duração entre 2 minutos e 30 dias. Lance aceito
        nos 2 minutos finais prorroga o fim.
      </p>

      <div className="form-actions">
        <button type="submit" className="button button-primary" disabled={submitting}>
          {submitting ? 'Criando o lote...' : 'Criar lote'}
        </button>
        <Link to="/" className="small">
          Ver vitrine
        </Link>
      </div>
    </form>
  );
}
