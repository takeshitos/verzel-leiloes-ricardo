import { Link, useParams } from 'react-router';
import { useApi } from '../api/useApi';
import { CopyLinkButton } from '../components/CopyLinkButton';
import { EmptyState, ErrorState, Loading, PageHeader } from '../components/ui';
import { formatBrl, formatDateTime } from '../format';
import type { PublicLot } from '../realtime/types';
import { NotFoundPage } from './NotFoundPage';

type AuditStatus = 'intact' | 'tampered' | 'pending' | 'unavailable';

/** GET /api/lots/:id/audit → audit (verificação feita na hora, no servidor, sobre o histórico inteiro). */
type AuditReport = {
  status: AuditStatus;
  statusLabel: string;
  reason: string;
  lotId: string;
  checkedAt: string;
  genesisHash: string;
  signedCount: number;
  anchoredCount: number;
  bidCount: number;
  bids: { seq: number; alias: string; amountCents: number; acceptedAt: string; bidderRef: string; prevHash: string; hash: string }[];
};

type PublicKeyResponse = { algorithm: string; format: string; keys: { keyVersion: number; publicKeyPem: string }[] };

const TONE: Record<AuditStatus, 'ok' | 'error' | 'warning'> = {
  intact: 'ok',
  tampered: 'error',
  pending: 'warning',
  unavailable: 'warning',
};

/** O que cada estado significa, sem prometer mais do que foi verificado. */
const MEANING: Record<AuditStatus, string> = {
  intact:
    'A cadeia de hashes confere do primeiro ao último lance, cada lance está coberto por um checkpoint assinado pelo servidor e todos estão registrados na âncora independente.',
  tampered:
    'Algo no histórico guardado não confere com as assinaturas ou com a âncora independente. Os dados deste lote não devem ser considerados confiáveis.',
  pending:
    'O histórico confere até onde foi possível verificar, mas o(s) último(s) lance(s) ainda não foram confirmados na âncora independente. Isso costuma se resolver em segundos; verifique de novo.',
  unavailable:
    'Não foi possível concluir a verificação agora (âncora inacessível ou lances sem evidência assinada). Sem essa confirmação, a página não afirma que o histórico está íntegro.',
};

/**
 * Auditoria pública do lote: abre por link direto, sem login. A verificação é feita pelo servidor
 * sobre o histórico inteiro; esta página só mostra o resultado e os dados públicos usados nela.
 */
export function AuditPage() {
  const { id = '' } = useParams();
  const audit = useApi<{ audit: AuditReport }>(`/lots/${id}/audit`);
  const lot = useApi<{ lot: PublicLot }>(`/lots/${id}`);
  const publicKey = useApi<PublicKeyResponse>('/audit/public-key');

  if (audit.error?.status === 404) return <NotFoundPage title="Lote não encontrado" message="Não existe auditoria para este endereço." />;

  // Se a última verificação falhou, o resultado anterior (talvez verde) NÃO continua na tela.
  const report = audit.error ? undefined : audit.data?.audit;
  const title = lot.data?.lot.item.title;
  const lastHash = report && report.bids.length > 0 ? report.bids[report.bids.length - 1].hash : null;

  return (
    <>
      <PageHeader eyebrow="Auditoria pública" title={title ? `Histórico de lances: ${title}` : 'Histórico de lances'}>
        <p>
          Qualquer pessoa pode conferir esta página, sem login. <Link to={`/lotes/${id}`}>Abrir a sala do lote</Link> ·{' '}
          <CopyLinkButton path={`/lotes/${id}/auditoria`} label="Copiar link da auditoria" />
        </p>
      </PageHeader>

      {audit.loading && !report && <Loading label="Verificando o histórico no servidor..." />}
      {audit.error && (
        // Erro ao verificar NUNCA vira selo verde: mostra a falha e oferece tentar de novo.
        <ErrorState message={`Não foi possível verificar agora: ${audit.error.message}`} onRetry={audit.reload} />
      )}

      {report && (
        <>
          <section className={`audit-status audit-${TONE[report.status]}`} aria-labelledby="estado-auditoria">
            <p id="estado-auditoria" className="audit-label">
              {report.statusLabel}
            </p>
            <p>
              <strong>{report.reason}</strong>
            </p>
            <p>
              {report.status === 'intact' && report.bidCount === 0
                ? 'Não há lances para conferir, e a âncora independente também não registra nenhum para este lote.'
                : MEANING[report.status]}
            </p>
            <p className="muted small">
              Verificado pelo servidor em {formatDateTime(report.checkedAt, true)} sobre os {report.bidCount}{' '}
              {report.bidCount === 1 ? 'lance' : 'lances'} do lote.
            </p>
            <button type="button" className="button button-secondary button-small" onClick={audit.reload} disabled={audit.loading}>
              {audit.loading ? 'Verificando...' : 'Verificar de novo'}
            </button>
          </section>

          <section className="section" aria-labelledby="historico-completo">
            <h2 id="historico-completo">Histórico completo ({report.bidCount})</h2>
            {report.bids.length === 0 ? (
              <EmptyState title="Nenhum lance neste lote." />
            ) : (
              <div className="table-wrap">
                <table className="audit-table">
                  <caption className="sr-only">Lances em ordem de aceitação</caption>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Participante</th>
                      <th scope="col">Valor</th>
                      <th scope="col">Aceito em</th>
                      <th scope="col">Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.bids.map((bid) => (
                      <tr key={bid.seq}>
                        <td>{bid.seq}</td>
                        <td>{bid.alias}</td>
                        <td className="num">{formatBrl(bid.amountCents)}</td>
                        <td>{formatDateTime(bid.acceptedAt, true)}</td>
                        <td>
                          <details>
                            <summary>
                              <code>{bid.hash.slice(0, 12)}…</code>
                            </summary>
                            <dl className="hash-details">
                              <dt>Hash</dt>
                              <dd>
                                <code>{bid.hash}</code>
                              </dd>
                              <dt>Hash anterior</dt>
                              <dd>
                                <code>{bid.prevHash}</code>
                              </dd>
                              <dt>Referência do participante</dt>
                              <dd>
                                <code>{bid.bidderRef}</code>
                              </dd>
                              <dt>Horário exato (UTC)</dt>
                              <dd>
                                <code>{bid.acceptedAt}</code>
                              </dd>
                            </dl>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="section card technical" aria-labelledby="detalhes-tecnicos">
            <h2 id="detalhes-tecnicos">Detalhes técnicos</h2>
            <dl className="technical-list">
              <dt>Gênese do lote</dt>
              <dd>
                <code>{report.genesisHash}</code>
                <span className="muted small"> (hash dos parâmetros do lote: dono, obra, valores e horários)</span>
              </dd>
              <dt>Último checkpoint</dt>
              <dd>
                {lastHash ? (
                  <>
                    {report.bidCount} {report.bidCount === 1 ? 'lance' : 'lances'}, último hash <code>{lastHash}</code>
                  </>
                ) : (
                  'Nenhum (lote sem lances)'
                )}
              </dd>
              {report.status === 'tampered' ? (
                <>
                  <dt>Assinaturas e âncora</dt>
                  <dd>Não contadas: a verificação para na primeira divergência encontrada.</dd>
                </>
              ) : (
                <>
                  <dt>Lances com checkpoint assinado</dt>
                  <dd>
                    {report.signedCount} de {report.bidCount}
                  </dd>
                  <dt>Lances confirmados na âncora independente</dt>
                  <dd>
                    {report.anchoredCount} de {report.bidCount}
                  </dd>
                </>
              )}
              <dt>Mensagem assinada</dt>
              <dd>
                <code>{publicKey.data?.format ?? 'verzel-audit-v1|lotId|bidCount|lastHash|keyVersion'}</code> (
                {publicKey.data?.algorithm ?? 'Ed25519'})
              </dd>
            </dl>

            <h3>Como funciona</h3>
            <ol className="how-list">
              <li>
                Cada lance guarda o hash SHA-256 do lance anterior mais o próprio conteúdo (participante, valor, horário,
                ordem). Mudar, inserir, remover ou reordenar um lance quebra a cadeia.
              </li>
              <li>
                A cada lance, o servidor assina um checkpoint (quantidade de lances + último hash) com uma chave Ed25519
                que fica só na configuração do servidor, fora do banco. Quem altera o banco não consegue assinar.
              </li>
              <li>
                Cada checkpoint também vai para uma âncora: outro banco de dados, que só aceita inclusões. Se o banco
                principal perder lances ou voltar a um estado antigo, ele fica com menos lances do que a âncora.
              </li>
            </ol>

            <details className="public-key">
              <summary>Chave pública do servidor</summary>
              <p className="small muted">
                Publicada pelo servidor a partir da configuração dele (não é lida do banco auditado). Serve para conferir
                as assinaturas por conta própria.
              </p>
              {publicKey.data ? (
                publicKey.data.keys.map((key) => (
                  <div key={key.keyVersion}>
                    <p className="small">Versão {key.keyVersion}</p>
                    <pre>{key.publicKeyPem}</pre>
                  </div>
                ))
              ) : (
                <p className="small muted">{publicKey.error ? publicKey.error.message : 'Carregando...'}</p>
              )}
            </details>

            <h3>Limites</h3>
            <p className="small">
              A garantia vale contra quem consegue alterar o banco principal sem ter a chave do servidor nem acesso à
              âncora. Quem controla o próprio servidor da aplicação poderia forjar tudo. Um lance apagado antes de chegar à
              âncora (janela de milissegundos) pode não ser detectado. Carteiras e liquidações não fazem parte desta cadeia.
            </p>
          </section>
        </>
      )}
    </>
  );
}
