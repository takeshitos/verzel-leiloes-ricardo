# Revisão final por requisito (etapa 22)

Revisão técnica feita em 29/10/2026, ~23:50 UTC, sobre o commit `7bf261a` (o mesmo que está na `main` do GitHub e publicado). Base: `docs/DESAFIO.md` (paráfrase conferida do PDF), o código, as migrações, os testes e execuções registradas com comando e resultado. Os resumos de progresso não foram tomados como prova: cada linha abaixo aponta para código, teste ou execução.

Legenda: **Atendido** (há implementação e evidência), **Parcial**, **Pendente**, **Não verificável** (depende de algo fora do alcance da revisão). "Empresa" = obrigação do enunciado; "Projeto" = decisão nossa; "Extra" = opcional do enunciado.

## R01 a R20

| Req. | Tipo | Estado | Evidência |
| --- | --- | --- | --- |
| R01 Stack React + Node + PostgreSQL | Empresa | Atendido | `apps/web` (React 19), `apps/api` (Express 5), `pg` com SQL parametrizado; produção em Neon (`/api/health` `database: ok`, 29/10 23:26 UTC) |
| R02 Dois papéis e propriedade | Empresa | Atendido | `requireRole('seller')` em `lots/routes.ts:33,39,45,49` e `catalog/routes.ts:58`; `requireRole('bidder')` em `bids/routes.ts:44`, `wallet/routes.ts:25,29`, `settlement/routes.ts:32`; `requireLotOwner` no cancelamento; testes `authorization.test.ts`; em produção, leiloeiro dando lance → 403 (etapa 15) |
| R03 Busca na API e criação de lote | Empresa | Atendido | `catalog/client.ts` + `snapshots.ts`; smoke de produção: busca real "harbor" e criação de lote (29/10, 1 passed) |
| R04 Vitrine sem cancelados | Empresa | Atendido | `lots/queries.ts:141` (`cancelled_at IS NULL`); `lots.test.ts` (seções e filtro); produção: vitrine com 1 ao vivo e encerrados |
| R05 Cancelar lote sem lances | Empresa | Atendido | `lots/service.ts` (bloqueio do lote) + restrição `lots_cancelled_only_without_bids`; teste "cancelamento e primeiro lance simultâneos"; produção (etapa 14) |
| R06 Sala ao vivo | Empresa | Atendido | `realtime/socket.ts`, `web/src/realtime/*`; `realtime.test.ts` (dois clientes reais), E2E e smoke de produção (lance visto sem recarregar, "ganhando/superado", posição) |
| R07 Carteira, reservas, disponível | Empresa | Atendido | `wallet/ledger.ts` (`lockWallets`, `readBalance` soma reservas de todos os lotes); `wallet.test.ts`, `bids.test.ts` ("mesmo cliente em dois lotes sem saldo para os dois"); smoke de produção (depósito) |
| R08 Regras de lance e recusas | Empresa | Atendido | `bids/rules.ts` (`validateBid`); `bids/service.ts:90` lote `FOR UPDATE`, `:111` carteiras, `:114` relógio depois dos bloqueios; `bid-rules.test.ts` e `bids.test.ts` (recusa não muda 6 tabelas) |
| R09 Prorrogação | Empresa + **interpretação do projeto** | Atendido | `extendedEnd` em `bids/rules.ts` (≤120 s restantes → aceitação + 120 s); bordas 119,999/120/120,001 s testadas; README explica a interpretação |
| R10 Encerramento e liquidação | Empresa | Atendido, com limite operacional | `settlement/service.ts:131` lote `FOR UPDATE`, `:150` carteiras, `:153` relógio, `:195` auditoria antes de pagar, PK de `settlements`/`receipts`; `settlement.test.ts` (repetição, dois executores, falha no meio, startup); smoke de produção liquidou sozinho. **Limite:** no Render gratuito o processo dorme; lote que vence sem tráfego é liquidado no próximo acesso (achado F3) |
| R11 Participações, vitórias, comprovante e link | Empresa | Atendido | `listBidderParticipations`, `ReceiptPage`, `CopyLinkButton`; smoke de produção: comprovante `LIQ-87F3689F22` aberto sem login |
| R12 Painel: resultado e total recebido | Empresa | Atendido | `sellerSummary` soma só `settlement_credit`; `lots.test.ts`; smoke de produção ("Arrematado por LIC-… por R$ 110,00") |
| R13 Auditoria que detecta alteração, remoção e inserção | Empresa | Atendido **dentro do modelo de ameaça** | Cadeia + checkpoint Ed25519 + âncora em outro banco; `audit/verify.ts` nunca devolve ÍNTEGRO sem âncora (`:126`, `:159`, `:165`); 21 testes de ataque em `audit.test.ts`; página pública verificada (íntegro, adulterado, indisponível). **Não absoluto:** lance removido antes de chegar à âncora (ms) não é detectado; primeiro lance inserido sem evidência anterior aparece como INDISPONÍVEL, não ADULTERADO (`docs/AUDITORIA.md` §8). Ver F1 e F2 |
| R14 Sem dados pessoais em auditoria/comprovante | Empresa | Atendido | `public-privacy.test.ts` (todas as respostas públicas como texto, com mutação provando que o teste pega vazamento); `realtime.test.ts` (eventos públicos) |
| R15 Funciona com a API externa fora do ar | Empresa | Atendido | `lot-offline.test.ts`, `catalog-client.test.ts`; páginas leem só o banco; E2E de imagem bloqueada |
| R16 Seed: 1 vendedor, 2 clientes, lote aberto | Empresa | Atendido | `db/seed-data.ts` (idempotente); produção: lote do seed ao vivo até 08/11/2026 02:03 UTC (conferido 29/10 23:26 UTC) |
| R17 README com configuração, execução e comportamentos inesperados | Empresa | Atendido | `README.md` reproduzido num clone limpo (etapa 20). Ver F1 (uma frase do README promete mais do que foi feito na âncora) |
| R18 Deploy público e repositório público | Empresa | Atendido | https://verzel-leiloes-ricardo.onrender.com/ (smoke com login: 1 passed, 29/10); GitHub público (API do GitHub, sem sessão) |
| R19 Relato de uso de IA | Empresa | Atendido | `docs/USO_DE_IA.md` (registro por etapa, resumo e texto para o formulário com a revisão informada pelo candidato) |
| R20 Entrega no prazo pelo formulário | Empresa | **Pendente** | Recebido em 22/10/2026, prazo 29/10/2026 (hora limite não informada). O envio do formulário (nome, email, repositório, deploy, relato de IA) só o candidato pode fazer |

Extras: E01 filtro da vitrine e E05 tema (etapa 19), E03 Compose (etapa 04) e E04 testes (etapas 09 a 18) atendidos; E02 cancelamento com estorno **não implementado de propósito**.

## Verificações de risco pedidas

| Risco | Resultado | Evidência |
| --- | --- | --- |
| Gasto duplo entre lotes | Não encontrado | Todo lance bloqueia a carteira do licitante antes de ler o disponível (soma de reservas de todos os lotes); teste com o mesmo cliente em dois lotes ao mesmo tempo |
| Bloqueio incompleto / deadlock | Não encontrado | Ordem fixa: lote e depois carteiras em ordem de `user_id` (`ledger.ts`); teste de lances cruzados em dois lotes |
| Transação em conexões diferentes | Não encontrado | Nenhum `pool.query` dentro de `withTransaction`/`withIdempotency` (revisão da etapa 18) |
| Relógio lido antes do bloqueio | Não encontrado | `bids/service.ts:114`, `settlement/service.ts:153`; teste "lance enviado antes do fim, mas que só obtém o bloqueio depois do fim" |
| Corrida prorrogação × encerramento | Não encontrado | `settlement.test.ts`: último lance antes e depois da liquidação |
| Liquidação duplicada | Não encontrado | PK `settlements.lot_id`, `receipts.lot_id`, `wallet_entries.operation_key` única; teste com dois executores |
| Idempotência sem restrição no banco | Não encontrado | PK `(user_id, scope, key)` em `idempotency_keys`; 8 depósitos simultâneos com a mesma chave = 1 |
| Dependência externa nas páginas | Não encontrado | Vitrine, sala, auditoria e comprovante leem o snapshot; testes com o museu fora do ar |
| Vazamento em JSON/socket | Não encontrado | `public-privacy.test.ts`, `realtime.test.ts`, varredura do bundle de produção (sem segredos) |
| Falsa garantia de auditoria | **Encontrado na documentação** (F1) | Código correto; texto promete permissão restrita da âncora que não foi aplicada |
| Âncora independente e persistente | Parcialmente verificável | Banco separado por configuração (`ANCHOR_DATABASE_URL`), Neon persistente; segundo projeto Neon criado pelo candidato (registro da etapa 10), não acessível à IA; sem trava contra apontar para o banco principal (F2) |
| Falhas no protocolo de confirmação | Tratadas | Pendente nunca vira ÍNTEGRO; erro pós-commit corrigido na etapa 18 (antes respondia 500); reconciliador não reassina |

## Achados

### Defeitos

| # | Impacto | Achado | Reprodução | Causa | Menor correção |
| --- | --- | --- | --- | --- | --- |
| F1 | **Médio** (garantia documentada maior que a real) | `docs/DEPLOY.md:39`, `docs/AUDITORIA.md:86` e o README afirmam que o usuário da âncora em produção só tem `INSERT` e `SELECT`, e o README cita um "SQL" em `DEPLOY.md` que não existe. O próprio `DEPLOY.md` (etapa 10) trata isso como "endurecimento opcional", sem registro de execução | Ler `DEPLOY.md` "Configuração da auditoria em produção": usa a string do projeto da âncora (usuário dono) | Texto escrito como plano e não ajustado depois | Corrigir os três textos para "opcional, não aplicado; a aplicação usa o usuário dono, e o gatilho impede `UPDATE`/`DELETE` pela aplicação". Alternativa: o candidato aplica o usuário restrito no Neon e registra |
| F2 | Baixo | Nenhuma validação impede `ANCHOR_DATABASE_URL` igual (mesmo host e banco) ao `DATABASE_URL`, o que anularia a independência da âncora sem aviso | Subir com as duas variáveis iguais: o servidor aceita | Falta de checagem na configuração | Em `shared/config.ts` (`superRefine`), recusar quando host + nome do banco forem iguais |

### Limitações conhecidas (documentadas, não são defeitos de código)

| # | Impacto | Limitação |
| --- | --- | --- |
| F3 | Médio na avaliação | Render gratuito dorme: lote que vence sem visitantes é liquidado no próximo acesso, não no horário. Documentado no README e no DEPLOY. Mitigação sem custo: um ping externo periódico (não configurado); ou plano pago (não contratado) |
| F4 | Baixo | Criar lote não tem chave de idempotência; após resposta perdida a tela pede para conferir antes de repetir |
| F5 | Baixo | Contas de demonstração com senha pública em produção: qualquer pessoa pode entrar e criar lotes ou lances de demonstração. Intencional para a avaliação |
| F6 | Baixo | Tempo real de uma instância; janela de milissegundos antes da âncora; dados financeiros fora da cadeia de hashes (`docs/AUDITORIA.md` §8) |

### Melhorias opcionais (não fazer no último dia)

- Mostrar no `/api/health` o commit implantado (facilita a conferência do deploy).
- Evitar o 401 esperado de `/api/auth/me` no console do visitante.
- Formulário de lance escondido para quem já lidera (hoje a API recusa com "Você já está ganhando").

## Bloqueios de entrega

1. **R20 — enviar o formulário** em https://elitedev.verzel.com.br/?elite-dev-2026-2 com nome, email, repositório (https://github.com/takeshitos/verzel-leiloes-ricardo), deploy (https://verzel-leiloes-ricardo.onrender.com/) e o relato de IA (`docs/USO_DE_IA.md`, "Texto curto para o formulário"). Prazo: 29/10/2026.
2. **F1 — corrigir o texto sobre o usuário da âncora** antes de enviar, para não declarar uma proteção que não foi aplicada (alteração só de documentação).

F2 a F6 não bloqueiam a entrega.

## Correções aplicadas (pedido do candidato, 29/10/2026)

| Achado | Correção | Verificação |
| --- | --- | --- |
| F1 | README, `docs/DEPLOY.md` (tabela e "Endurecimento opcional"), `docs/AUDITORIA.md` (§3 e §7) e `docs/PLANO.md` agora dizem que a âncora usa o usuário dono e que a restrição a `INSERT`/`SELECT` **não foi aplicada**; o README não cita mais um SQL inexistente | Busca por "INSERT/SELECT" e "SQL do usuário" sem afirmações restantes |
| F2 | `apps/api/src/shared/config.ts`: o servidor não sobe se `ANCHOR_DATABASE_URL` apontar para o mesmo servidor, porta e banco do `DATABASE_URL` (mesmo com outro usuário) | `test/config.test.ts` (3 testes); suíte completa API 242 de 242 e web 28 de 28; typecheck, lint e build ok; servidor local sobe; produção conferida depois do deploy |

Com isso, o único bloqueio de entrega restante é **R20: enviar o formulário**.
