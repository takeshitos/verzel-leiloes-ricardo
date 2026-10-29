# Plano técnico

Criado na etapa 01 (28/10/2026). É o plano de implementação, não a descrição de algo pronto. Versões, catálogo e hospedagem estão em `docs/DECISOES.md`; requisitos em `docs/REQUISITOS.md`.

## 1. Arquitetura

```
apps/web   React + Vite + React Router + socket.io-client
apps/api   Express + pg + Socket.IO + jobs (encerramento e reconciliação da âncora)
           └─ em produção também serve o build do web (mesma origem)
PostgreSQL principal (Neon)    usuários, lotes, lances, carteiras, auditoria
PostgreSQL da âncora (Neon)    só a tabela anchor_entries, credencial própria, só INSERT/SELECT
```

Módulos da API (`apps/api/src/modules/`), cada um com `routes.ts`, `service.ts` e `queries.ts` quando necessário:

| Módulo | Responsabilidade |
| --- | --- |
| `auth` | cadastro, login, logout, sessão, middleware `requireUser` e `requireRole` |
| `catalog` | busca e item na API de Cleveland, timeout, cache curto, normalização para snapshot |
| `lots` | criar, cancelar, listar vitrine, detalhe público, painel do vendedor |
| `wallet` | saldo (total, comprometido, disponível), depósito idempotente |
| `bids` | lance transacional, prorrogação, idempotência |
| `settlement` | job de encerramento, liquidação idempotente |
| `audit` | cadeia de hashes, checkpoint assinado, âncora, verificação, reconciliação |
| `receipts` | comprovante público por token |
| `realtime` | Socket.IO, salas públicas por lote e sala privada por usuário |

Compartilhado (`apps/api/src/shared/`): `db.ts` (pool e `withTransaction`), `money.ts`, `clock.ts`, `errors.ts`, `config.ts` (valida variáveis de ambiente no startup).

## 2. Entidades

| Tabela | Campos principais e restrições |
| --- | --- |
| `users` | `id` uuid; `email` único (minúsculo); `password_hash` (scrypt); `role` (`seller` ou `bidder`); `public_alias` único aleatório (`LIC-7F3A9C` ou `VEN-...`) |
| `sessions` | `token_hash` PK (SHA-256 do token do cookie); `user_id`; `expires_at` |
| `wallets` | `user_id` PK; `total_cents` BIGINT `CHECK >= 0` |
| `wallet_entries` | `id`; `user_id`; `kind` (`deposit`, `settlement_debit`, `settlement_credit`); `amount_cents`; `operation_key` única |
| `item_snapshots` | `id`; `provider` (`cma`); `external_id`; título, autores, data, técnica, tipo, cultura, medidas; `image_url`, `image_width`, `image_height`; `source_url`; `license`; `fetched_at` |
| `lots` | `id`; `seller_id`; `snapshot_id`; `starting_bid_cents`; `min_increment_cents`; `starts_at`; `original_ends_at`; `ends_at`; `cancelled_at`; `leader_bid_id`; `bid_count`; `version` (sobe a cada mudança) |
| `bids` | `id`; `lot_id`; `seq` (único por lote); `bidder_id` (privado); `public_alias` (congelado); `amount_cents`; `accepted_at`; `bidder_ref`; `prev_hash`; `hash` |
| `reservations` | `lot_id` PK (uma reserva ativa por lote); `bidder_id`; `amount_cents` |
| `idempotency_keys` | PK (`user_id`, `scope`, `key`); `request_fingerprint`; `response_status`; `response_body` |
| `settlements` | `lot_id` único; `winner_id` (nulo se sem lances); `amount_cents`; `settled_at` |
| `receipts` | `lot_id` único; `public_token` único (32 bytes aleatórios em base64url); `payload` jsonb público |
| `audit_checkpoints` | PK (`lot_id`, `bid_count`); `last_hash`; `signature`; `key_version`; `anchor_status` (`pending` ou `confirmed`). Funciona como outbox da âncora |
| `anchor_entries` (banco da âncora) | PK (`lot_id`, `bid_count`); `last_hash`; `signature`; `key_version`; `created_at`. Gatilho recusa UPDATE e DELETE; o usuário da aplicação só tem INSERT e SELECT |

Saldo: `comprometido = SUM(reservations.amount_cents WHERE bidder_id = usuário)` e `disponível = total − comprometido`. Valores em centavos chegam ao JavaScript como string do `pg` e são convertidos com verificação de inteiro seguro.

## 3. Bloqueios e algoritmo do lance

**Ordem única de bloqueio:** (1) a linha do lote (`SELECT ... FROM lots WHERE id = $1 FOR UPDATE`); (2) as carteiras envolvidas, em ordem crescente de `user_id` (`SELECT ... FROM wallets WHERE user_id = ANY($1) ORDER BY user_id FOR UPDATE`). Toda transação bloqueia no máximo um lote, então não há ciclo entre lotes; entre carteiras, a ordem é sempre a mesma. Mesmo assim, erros `40P01` (deadlock) e `40001` são repetidos até 3 vezes.

**Lance** (tudo no mesmo cliente `pg`):

1. `BEGIN`; bloquear o lote; ler a reserva atual do lote; bloquear as carteiras do licitante e do líder anterior.
2. Ler `clock_timestamp()` **depois** dos bloqueios (truncado em milissegundos).
3. Validar: papel `bidder`; lote não cancelado; `starts_at <= agora < ends_at`; licitante não é o líder; valor ≥ lance inicial (primeiro lance) ou ≥ atual + incremento; valor ≤ disponível do licitante, considerando todas as reservas dele.
4. Gravar o lance (`seq` seguinte, `prev_hash`, `hash`); substituir a reserva do lote (libera o líder anterior); atualizar líder, `bid_count` e `version`.
5. Prorrogação: se `ends_at − agora <= 120 s`, então `ends_at = agora + 120 s`.
6. Assinar o checkpoint (`lot_id`, `bid_count`, `last_hash`) e gravar em `audit_checkpoints` como `pending`; gravar o registro de idempotência; `COMMIT`.
7. Depois do commit: gravar na âncora, marcar `confirmed` e emitir os eventos.

Recusa = `ROLLBACK`: nada muda em histórico, saldo, reserva ou fim.

**Depósito:** bloqueia só a carteira do usuário; `operation_key` única = `deposit:{userId}:{Idempotency-Key}`.

**Cancelamento:** bloqueia o lote; recusa se `bid_count > 0` ou se não for o dono.

**Liquidação:** seleciona lotes vencidos com `FOR UPDATE SKIP LOCKED`; bloqueia carteiras do vencedor e do vendedor em ordem; relê `ends_at` com `clock_timestamp()`; exige auditoria confirmada e íntegra; debita o vencedor, credita o vendedor, remove a reserva, grava o settlement e o comprovante. As restrições únicas (`settlements.lot_id` e `operation_key`) impedem duplicação mesmo com dois executores ou job repetido. **Implementado na etapa 11 com um ajuste:** a seleção não usa `SKIP LOCKED`, porque a auditoria (que consulta a âncora) roda antes do bloqueio; cada lote é bloqueado com `FOR UPDATE` comum e o segundo executor encontra o lote já liquidado (ver DECISOES).

**Idempotência de lance e depósito:** cabeçalho `Idempotency-Key` (UUID gerado no navegador). Mesma chave com o mesmo conteúdo devolve a resposta guardada; com conteúdo diferente, `409 IDEMPOTENCY_KEY_REUSED`.

## 4. Rotas HTTP

| Área | Rotas |
| --- | --- |
| Operação | `GET /api/health` (inclui teste do banco); qualquer `/api/*` desconhecida responde 404 em JSON |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Catálogo (vendedor) | `GET /api/catalog/search?q=&page=`, `GET /api/catalog/items/:externalId` |
| Público | `GET /api/lots`, `GET /api/lots/:id`, `GET /api/lots/:id/bids`, `GET /api/lots/:id/audit`, `GET /api/audit/public-key`, `GET /api/receipts/:token` |
| Vendedor | `POST /api/lots`, `POST /api/lots/:id/cancel`, `GET /api/seller/lots`, `GET /api/seller/summary` |
| Licitante | `GET /api/wallet`, `POST /api/wallet/deposits`, `POST /api/lots/:id/bids`, `GET /api/me/participations` (inclui vitórias e links de comprovante) |

Não existe rota pública para liquidar, adulterar ou reconfigurar a auditoria.

### Onde cada permissão é aplicada (definido na etapa 05)

O usuário vem sempre da sessão (`req.user`, carregado por `loadSessionUser` a partir do cookie). Id, papel ou email enviados no corpo, na URL ou em cabeçalhos nunca identificam quem está agindo.

| Rota ou canal | Middleware | Regra no serviço |
| --- | --- | --- |
| `GET /api/lots`, `/api/lots/:id`, `/bids`, `/audit`, `/api/audit/public-key`, `/api/receipts/:token`, `/api/health` | nenhum (público) | Respostas só com dados públicos (pseudônimos) |
| `POST /api/auth/register`, `/login` | limite de tentativas | Papel só `seller` ou `bidder`, escolhido no cadastro e imutável |
| `GET /api/auth/me` | `requireAuth` | Devolve email, papel e pseudônimo do próprio usuário |
| `GET /api/catalog/*` | `requireRole('seller')` | Busca na API externa só para leiloeiro |
| `POST /api/lots` | `requireRole('seller')` | `seller_id` = `req.user.id` |
| `POST /api/lots/:id/cancel` | `requireRole('seller')` + `requireLotOwner` | Bloqueia o lote e recusa se `bid_count > 0` (o banco também impede) |
| `GET /api/seller/lots`, `/summary` | `requireRole('seller')` | Filtra por `req.user.id` |
| `GET /api/wallet`, `POST /api/wallet/deposits` | `requireRole('bidder')` | Carteira de `req.user.id` |
| `POST /api/lots/:id/bids` | `requireRole('bidder')` | Leiloeiro nunca oferta; licitante = `req.user.id` |
| `GET /api/me/participations` | `requireRole('bidder')` | Só participações de `req.user.id` |
| Socket.IO, sala `user:{id}` (etapa 12) | sessão do cookie no handshake | Sessão expirada ou revogada não entra na sala privada |

Toda requisição `/api` que altera estado passa antes por `requireSameOrigin` (Origin e Sec-Fetch-Site) e `requireJsonBody`.

Proteção de sessão: cookie `sid` HttpOnly, `SameSite=Lax`, `Secure` em produção, validade de 7 dias; rotas que alteram estado exigem JSON e conferem o cabeçalho `Origin`; `app.set('trust proxy', 1)` no Render.

## 5. Códigos de erro

Formato: `{ "error": { "code": "...", "message": "texto em português", "details": {...} } }`. `details` pode trazer `minNextBidCents` e `serverTime`, nunca dados pessoais.

| HTTP | Códigos |
| --- | --- |
| 400 | `VALIDATION_ERROR` (com `details.fields`, uma mensagem por campo), `IDEMPOTENCY_KEY_REQUIRED` |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` |
| 403 | `FORBIDDEN` (inclui leiloeiro ofertando e lote de outro dono), `FORBIDDEN_ORIGIN` (CSRF) |
| 404 | `NOT_FOUND`, `CATALOG_ITEM_NOT_FOUND` |
| 409 | `EMAIL_ALREADY_USED`, `LOT_HAS_BIDS`, `LOT_ALREADY_CANCELLED`, `LOT_ENDED` (ao cancelar), `IDEMPOTENCY_KEY_REUSED` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` (corpo que não é JSON) |
| 429 | `TOO_MANY_REQUESTS` (com cabeçalho `Retry-After`) |
| 422 | `LOT_NOT_STARTED`, `LOT_ENDED`, `LOT_CANCELLED`, `BID_BELOW_MINIMUM`, `ALREADY_LEADING`, `INSUFFICIENT_FUNDS`, `CATALOG_ITEM_WITHOUT_IMAGE`, `WALLET_LIMIT_EXCEEDED` |
| 503 | `CATALOG_UNAVAILABLE` (timeout, 429 ou resposta inválida da API externa) |
| 500 | `INTERNAL_ERROR` (sem stack trace na resposta) |

## 6. Eventos Socket.IO

Emitidos só depois do `COMMIT`. Cada lote tem `version` crescente; o cliente descarta evento com versão menor e busca o estado por HTTP ao conectar, reconectar, voltar o foco ou detectar lacuna de versão.

| Sala | Evento | Conteúdo |
| --- | --- | --- |
| `lot:{id}` (pública) | `lot.updated` | `lotId`, `version`, `status`, `endsAt`, `currentBidCents`, `minNextBidCents`, `bidCount`, `leaderAlias`, `auditStatus`, `serverTime` |
| `lot:{id}` | `bid.accepted` | `lotId`, `version`, `seq`, `alias`, `amountCents`, `acceptedAt` |
| `lot:{id}` | `lot.extended` | `lotId`, `version`, `endsAt` |
| `lot:{id}` | `lot.closed` | `lotId`, `version`, `winnerAlias` (ou nulo), `amountCents` |
| `user:{id}` (privada) | `wallet.updated` | `totalCents`, `committedCents`, `availableCents` |
| `user:{id}` | `bid.outbid` | `lotId`, `version` |

A sala privada é decidida no servidor, a partir do cookie de sessão no handshake; o cliente não escolhe o `user_id`.

## 7. Integridade do histórico (R13)

### Modelo de ameaça

- **Protegido:** o histórico de lances de cada lote (quem, pelo pseudônimo e pela referência privada; valor; instante; ordem) e os parâmetros do lote que definem a disputa.
- **Atacante coberto:** quem tem escrita no PostgreSQL principal (SQL direto), mas **não** tem a chave privada Ed25519 (variável de ambiente do servidor) **nem** a credencial do banco da âncora.
- **Detectado nesse modelo:** alterar qualquer campo de lance; inserir, reordenar ou remover lances (inclusive o último ou todos); recalcular todos os hashes; restaurar um checkpoint antigo ou um backup antigo do banco principal.
- **Fora da garantia:** quem controla o servidor da aplicação (chave) e também a âncora; o dono das contas Render e Neon; a janela entre o commit e a gravação na âncora (aparece como pendente); restauração legítima de backup (também aparece como adulteração e exige ação do operador). A documentação não pode chamar isso de "à prova de adulteração" sem citar esse modelo.

### Formato

- Gênese do lote: `prev_hash` do lance 1 = SHA-256 do JSON canônico de `{v, lotId, sellerId, snapshotId, startingBidCents, minIncrementCents, startsAt, originalEndsAt}`.
- Conteúdo do lance (versão 1, ordem fixa de chaves, centavos como string, instante ISO-8601 UTC com milissegundos): `{v, lotId, seq, bidId, bidderRef, alias, amountCents, acceptedAt}`. `bidderRef = SHA-256(bidderId + ":" + lotId)` liga o lance ao participante privado sem expor o id.
- `hash = SHA-256(prev_hash + "\n" + conteúdoCanônico)`.
- Checkpoint assinado (Ed25519): `verzel-audit-v1|lotId|bidCount|lastHash|keyVersion`.
- A chave privada fica em `AUDIT_SIGNING_PRIVATE_KEY`, fora do banco e do repositório. Ela não é gerada no deploy; o candidato guarda uma cópia offline. A chave pública fica em `GET /api/audit/public-key`.

### Protocolo entre commit e âncora

1. Dentro da transação do lance: assinar o checkpoint e gravar em `audit_checkpoints` como `pending`.
2. Depois do `COMMIT`: `INSERT ... ON CONFLICT (lot_id, bid_count) DO NOTHING` na âncora, depois ler a linha. Se for igual, sucesso, inclusive em repetição. Se for diferente, conflito: não sobrescreve e marca alerta.
3. Sucesso: marcar o checkpoint `confirmed`. A resposta do lance informa `auditStatus` (`confirmed` ou `pending`). O lance pendente já é financeiramente válido, mas não recebe selo de integridade.
4. Reconciliador (no startup e a cada 30 s): para cada checkpoint `pending`, confere a assinatura e recalcula a cadeia no banco. Se bater, grava na âncora; se não bater, marca adulterado. **Nunca assina de novo dados encontrados no banco**; só envia assinaturas criadas no commit.
5. Falhas previstas:
   - commit ok e âncora falhou: fica pendente até o reconciliador;
   - âncora ok e resposta perdida: a repetição é idempotente;
   - reinício entre os passos: o reconciliador retoma;
   - âncora atrasada: pendente;
   - âncora adiantada (banco voltou no tempo): adulterado;
   - gravação repetida ou fora de ordem: a chave primária e a verificação de igualdade resolvem.
6. Não existe atomicidade entre os dois bancos. O protocolo só garante que o estado pendente é visível e recuperável.

### Verificação (página pública)

1. Recalcular a cadeia a partir da gênese; a primeira divergência dá **ADULTERADO**, com o `seq`.
2. Conferir as assinaturas dos checkpoints com a chave pública.
3. Ler o maior registro da âncora para o lote. Se a âncora não responder: **VERIFICAÇÃO PENDENTE OU INDISPONÍVEL**, nunca íntegro.
4. Comparar com o banco:
   - banco com menos lances que a âncora, ou hash diferente na mesma contagem: **ADULTERADO**;
   - banco com mais lances, cobertos por checkpoints assinados ainda pendentes: **PENDENTE**;
   - lances extras sem checkpoint assinado válido: **ADULTERADO**;
   - lote sem lances e âncora vazia: **ÍNTEGRO**;
   - lote sem lances com registros na âncora: **ADULTERADO**.
5. Conferir que `ends_at` é coerente com `original_ends_at` mais as prorrogações calculadas a partir dos instantes dos lances.

A liquidação só ocorre com o lote **ÍNTEGRO** e o último checkpoint confirmado. Lote adulterado não é liquidado e mostra o motivo.

### Implementação da etapa 10

O protocolo acima foi implementado como descrito; a especificação final e os resultados estão em `docs/AUDITORIA.md`. A verificação responde `status` (`intact`, `tampered`, `pending`, `unavailable`), `statusLabel` (ÍNTEGRO, ADULTERADO, VERIFICAÇÃO PENDENTE, VERIFICAÇÃO INDISPONÍVEL) e `reason`.

### Contrato implementado na etapa 09

`apps/api/src/modules/audit/recorder.ts` define `IntegrityRecorder`:
- `prepareBid`: calcula `bidder_ref`, `prev_hash` e `hash` dentro da transação;
- `afterBidInserted`: na etapa 10, grava o checkpoint assinado como `pending`;
- `afterCommit`: na etapa 10, grava na âncora e devolve `confirmed`.

A implementação atual (`chainOnlyRecorder`) calcula a cadeia real e devolve sempre `pending`. Os eventos (`modules/realtime/events.ts`) são publicados depois do commit e de `afterCommit`; repetição idempotente não republica.

## 8. Checklist das regras

- [ ] Leiloeiro não oferta; licitante não cria lote; só o dono cancela, e só sem lances (backend).
- [ ] Lance só com `starts_at <= agora < ends_at`, horário do servidor depois dos bloqueios.
- [ ] Primeiro lance ≥ inicial; seguintes ≥ atual + incremento.
- [ ] Líder não cobre o próprio lance.
- [ ] Valor ≤ disponível, considerando reservas em todos os lotes.
- [ ] Liderar reserva; ser superado libera na mesma transação.
- [ ] Recusa não muda nada.
- [ ] Prorrogação: até 120 s restantes, novo fim = aceitação + 120 s.
- [ ] Encerramento automático, idempotente, recuperável após reinício; sem lances, sem vencedor.
- [x] Liquidação debita o total do vencedor, credita o vendedor, remove a reserva e gera comprovante (etapa 11, testado localmente).
- [ ] Centavos inteiros em todo o caminho; nenhuma conta de dinheiro com ponto flutuante.
- [ ] Eventos só depois do commit; nada de saldo em evento público.
- [ ] Respostas públicas sem email, nome real, senha, sessão ou saldo.
- [ ] Vitrine, sala, auditoria e comprovante funcionam sem a API externa.
- [ ] Auditoria nunca mostra íntegro quando a âncora está pendente ou indisponível.

## 9. Estratégia de testes

- **Unitários (Vitest):** conversão de dinheiro; regra de lance como função pura (`validateBid(estado, valor, agora)`); bordas da prorrogação (exatamente 120 s, 120 s + 1 ms, 0 ms); serialização canônica e hash; classificação da verificação; normalização do catálogo com as fixtures reais de `docs/fixtures/catalog/`.
- **Integração com PostgreSQL real** (bancos locais `verzel_test` e `verzel_anchor_test`; os testes se recusam a rodar se o nome do banco não terminar em `_test`):
  - lances simultâneos iguais e diferentes, cada um com seu próprio cliente do pool (não um `Promise.all` numa conexão só);
  - mesmo licitante em dois lotes sem saldo para os dois;
  - líder ofertando;
  - lance repetido com a mesma chave de idempotência;
  - lance na borda do horário depois de esperar bloqueio;
  - disputa entre cancelamento e lance;
  - job de liquidação repetido e em paralelo;
  - reinício com lote vencido;
  - adulterações: alterar, inserir, reordenar, remover o último, remover todos, recalcular hashes, restaurar checkpoint antigo, âncora fora do ar.
- **HTTP (Supertest):** autorização por papel e por dono; respostas públicas sem campos pessoais; `/api/inexistente` em JSON.
- **Falhas da API externa:** cliente HTTP do catálogo recebe o `fetch` por parâmetro; nos testes, um `fetch` falso simula timeout, 429 e JSON inválido. Produção sempre usa a API real.
- **Navegador (Playwright, etapa 17, se houver tempo):** dois contextos disputando o mesmo lote.

## 10. Deploy

| Fase | Caminho |
| --- | --- |
| Inicial (etapa 03) | Render web service gratuito: build `npm ci && npm run build`, start `npm start`, Node 24 via `.node-version`, health em `/api/health`. Banco principal: projeto Neon gratuito. Sem segredos no repositório |
| Final (etapa 21) | Mesmo serviço + segundo projeto Neon para a âncora + `AUDIT_SIGNING_PRIVATE_KEY` e URLs dos bancos como variáveis secretas no Render. Seed idempotente e lote de demonstração aberto no momento do envio |

**Volume persistente × armazenamento externo para a âncora**

| Critério | Disco persistente no Render | PostgreSQL separado (Neon) |
| --- | --- | --- |
| Custo | Exige instância paga (preço a conferir no painel; a página de preços não foi lida pela ferramenta) | Plano gratuito: 100 projetos, 1 GB cada, sem expiração informada |
| Independência do banco principal | Sim, mas no mesmo servidor da aplicação | Sim, com credencial própria e usuário só com INSERT/SELECT |
| Código | Escrever arquivo JSONL com `fsync` | Mesma biblioteca `pg` já usada no projeto |
| Riscos | Instância única, sem deploy sem interrupção; restaurar snapshot diário do disco volta a âncora no tempo | Mesmo dono de conta do banco principal; o compute suspende após 5 min ocioso |

**Escolha:** PostgreSQL separado no Neon, por ser o caminho mais simples que funciona sem custo e reaproveita o `pg`.

**Comportamentos esperados a documentar no README:**
- O web service gratuito do Render dorme após 15 min sem tráfego e leva cerca de 1 min para acordar. Lotes que vencerem nesse período são liquidados quando o serviço acorda (reconciliação no startup), não no segundo exato.
- O banco principal fica no Neon porque o PostgreSQL gratuito do Render expira em 30 dias e não tem backup.
- Antes de qualquer custo, o candidato decide; nada foi contratado.

## 11. Ordem dos prompts e critérios de passagem

| Prompt | Entrega | Só avance quando | Requisitos |
| --- | --- | --- | --- |
| 02 | Estrutura do monorepo, scripts, `.gitignore` (sem PDF, guia e prompts), `.gitattributes`, `git init` | Web e API sobem; typecheck, lint e build executam | R01 |
| 03 | Primeiro deploy (Render + Neon) | A URL abre de fora e o front fala com `/api/health` | R18 |
| 04 | Migrações SQL e seed idempotente | Migrações e seed rodam em banco vazio e de novo sem duplicar | R01, R16 |
| 05 | Autenticação e autorização | Cadastro, login, logout e restrições por papel funcionam via API | R02, R14 |
| 06 | Catálogo de Cleveland e snapshots | Busca real importa item; lote existente não depende da API | R03, R15 |
| 07 | Gestão de lotes | Dono cria e cancela; terceiros e lotes com lances protegidos; vitrine sem cancelados | R03, R04, R05 |
| 08 | Carteira e depósitos | Depósito idempotente; total, comprometido e disponível fecham | R07 |
| 09 | Lances transacionais | Testes concorrentes sem gasto duplo nem líder inválido; prorrogação nas bordas | R07, R08, R09 |
| 10 | Integridade e âncora | Adulterações detectadas; pendência diferenciada; recuperação documentada | R13, R14 |
| 11 | Liquidação e comprovantes | Job encerra sozinho; repetir não duplica débito nem comprovante | R10, R11, R12 |
| 12 | Tempo real e reconexão | Dois clientes atualizam e se recuperam após desconexão | R06, R09 |
| 13 | Base visual e navegação | Telas usam a API real com mensagens legíveis | R04, R08 |
| 14 | Painel do leiloeiro | Vendedor conclui o fluxo pela interface | R03, R05, R12 |
| 15 | Fluxo do licitante | Dois clientes disputam, veem reservas e participações | R06, R07, R11 |
| 16 | Auditoria e recibo públicos | Abrem em janela anônima sem dados pessoais | R11, R13, R14 |
| 17 | Testes automatizados | Suíte crítica roda com PostgreSQL real | E04 |
| 18 | Falhas e recuperação | Rede, relógio, reinício, API fora e adulteração exercitados | R10, R13, R15 |
| 19 | Extras com limite | Só extras escolhidos; nada quebra requisitos | E01–E05 |
| 20 | README e relato de IA | README reproduzível; relato bate com o registro | R17, R19 |
| 21 | Deploy final e smoke test | Produção íntegra, credenciais de demo, lote aberto | R16, R18 |
| 22 | Revisão final por requisito | Pendências resolvidas ou classificadas com honestidade | todos |
| 23 | Demonstração e envio | Links reais verificados; o candidato envia o formulário | R18, R19, R20 |

## 12. Inviabilidades e riscos encontrados

1. **Imagem da AIC bloqueada** (403 do Cloudflare para servidor e navegador embutido). Tratado com a troca para Cleveland.
2. **TypeScript 7 incompatível com o `typescript-eslint`**. Tratado com o TypeScript 6.0.3.
3. **Node 26 não confirmado no Render**. Produção em Node 24 LTS; o Node 26 local é compatível com todos os pacotes escolhidos.
4. **Plano gratuito do Render dorme**. A liquidação atrasa enquanto o serviço está parado; isso fica documentado. Liquidação no horário exato exigiria instância paga, que é decisão do candidato.
5. **Âncora sem atomicidade com o banco principal**. Tratado pelo protocolo de pendência acima.
6. **Prazo.** Entrega em 29/10/2026 com 22 prompts restantes. O candidato escolheu seguir a ordem normal; o risco de não concluir tudo com evidência é alto e deve ser reavaliado a cada etapa.
7. **Contas externas.** Render, Neon e GitHub dependem de ações do candidato. A IA não cria contas nem cola segredos.
