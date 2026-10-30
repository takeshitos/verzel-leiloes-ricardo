| `tour/logic.test.ts` | 16 | Tour guiado: perfil e página pela rota, tour certo por perfil (carteira só para licitante, painel só para leiloeiro), etapa de lance só para licitante, etapas opcionais sem elemento saem, navegação nos limites, preferência por perfil sem dados pessoais, posição do cartão |
# Testes

Como rodar, o que cada suíte prova e onde cada requisito é verificado. Números medidos em 29/10/2026 (etapa 17). **Cobertura de linhas não foi medida** (nenhuma ferramenta de cobertura está instalada).

## Como rodar

Pré-requisitos: dependências instaladas (`npm install`), o PostgreSQL de desenvolvimento no ar (`docker compose up -d`) e o `apps/api/.env` com `TEST_DATABASE_URL` e `TEST_ANCHOR_DATABASE_URL` apontando para bancos cujo nome termina em `_test`. Os testes destrutivos se recusam a rodar em qualquer outro banco; produção e a âncora de produção nunca são alvo.

No PowerShell, use `npm.cmd` no lugar de `npm` se a política de execução bloquear o `npm.ps1`.

| Comando | O que roda | Tempo aproximado |
| --- | --- | --- |
| `npm test` | API (Vitest + Supertest, PostgreSQL e âncora de teste reais) e web (Vitest, regras puras) | 1 a 2 min |
| `npm run test:e2e` | Build do web + Playwright no Chrome instalado, com a aplicação real nos bancos de teste | ~4 min |
| `npm run test:live -w apps/api` | 3 testes contra a API real do museu (precisa de internet; fora do `npm test`) | segundos |
| `npm run typecheck` | API, web e arquivos do E2E | segundos |
| `npm run lint` | ESLint em tudo | segundos |

As migrações dos bancos de teste rodam sozinhas no início do `npm test` (global setup). Os arquivos da API rodam um por vez porque compartilham o banco de teste; o E2E também limpa esse banco, então **não rode `npm test` e `npm run test:e2e` ao mesmo tempo**.

## Princípios

- **Banco real, não mock**: transações, bloqueios e restrições são testados no PostgreSQL de verdade. Concorrência usa conexões distintas; as corridas seguram o bloqueio do lote e esperam os concorrentes aparecerem em `pg_stat_activity` antes de soltar.
- **Doubles só nas bordas**: relógio injetável (`Clock`), imitador local da API do museu (`test/catalog-stub.ts`, com respostas reais salvas) e âncora "fora do ar" (porta sem resposta). A lógica financeira nunca é simulada.
- **Asserções sobre comportamento e invariantes** (saldos, histórico, estado do lote, o que cada cliente recebe), não sobre detalhes internos.
- **Prova de que os testes pegam erros** (feita de propósito e desfeita em seguida):
  - etapa 10: com a checagem "âncora tem mais lances que o banco" desligada, os 3 testes de remoção e rollback falharam;
  - etapa 17: aceitar lance R$ 0,01 abaixo do mínimo fez 3 testes falharem; expor `bidderId` no histórico público fez o teste de privacidade falhar.

## Suítes

### API (`apps/api/test`, 239 testes em 14 arquivos)

| Arquivo | Testes | O que prova |
| --- | --- | --- |
| `config.test.ts` | 3 | Âncora precisa ser outro banco: recusa mesmo servidor, porta e nome (etapa 22) |
| `auth.test.ts` | 21 | Cadastro, login, logout que revoga a sessão, papéis fixos, CSRF (Origin e Sec-Fetch-Site), limite de tentativas, cookie seguro em produção |
| `authorization.test.ts` | 9 | Visitante 401; papéis (leiloeiro não oferta, licitante não cria lote); propriedade do lote; id/papel enviados pelo cliente são ignorados |
| `money.test.ts` | 2 | Centavos inteiros e formatação sem ponto flutuante |
| `catalog-client.test.ts`, `catalog-routes.test.ts` | 13 + 6 | API do museu: timeout, 429, 500, resposta inválida, cache, busca só para leiloeiro |
| `lot-offline.test.ts` | 3 | Museu fora do ar: detalhe do lote vem do banco, também depois de reiniciar o processo |
| `lots.test.ts` | 17 | Criação com dados do museu e dono da sessão, validação de valores e datas, vitrine sem cancelados, cancelamento (inclusive esperando o bloqueio de um lance), painel e total recebido |
| `wallet.test.ts` | 14 | Total, comprometido e disponível; depósito idempotente (8 pedidos simultâneos com a mesma chave = 1 depósito); 8 depósitos diferentes simultâneos sem perder atualização |
| `bid-rules.test.ts` | 18 | Bordas: início inclusivo, fim exclusivo, mínimo exato, líder, saldo igual ao disponível, prorrogação a 120 s, 119,999 s e 120,001 s, formato da cadeia de hashes |
| `bids.test.ts` | 21 | Lance pela rota real: exemplo do guia A/B, cada recusa sem mudar nada (snapshot de 6 tabelas), idempotência, ofertas simultâneas, cliente em dois lotes sem saldo para os dois, lances cruzados sem deadlock, lance que chega antes do fim mas só bloqueia depois, cancelamento contra primeiro lance, eventos só depois do COMMIT |
| `audit.test.ts` | 21 | Alterar valor, horário, pseudônimo e participante; recalcular a cadeia; apagar checkpoints; remover no meio, no fim e tudo; inserir; reordenar; rollback (checkpoint antigo); checkpoint forjado; âncora só de inserção; lote apagado; âncora fora do ar, resposta perdida, gravação fora de ordem, conflito; pendente nunca é ÍNTEGRO |
| `settlement.test.ts` | 18 | Exemplo do guia na liquidação, lote sem lances, fim exclusivo, cancelado, repetição, dois executores ao mesmo tempo, último lance antes e depois da liquidação, falha no meio da transação, recuperação no startup, auditoria antes de pagar, comprovante e participações |
| `realtime.test.ts` | 14 | Dois clientes Socket.IO reais, sala privada só do dono, tentativa de entrar na sala alheia, origem de outro site, logout e expiração, evento perdido recuperado por HTTP |
| `public-privacy.test.ts` | 11 | Todas as respostas públicas (vitrine, lote, lances, auditoria, comprovante, chave pública, 404) lidas como texto, depois de um cenário real com lances e liquidação: sem `@`, email, id de usuário, hash de sessão, saldos ou ids privados; nenhuma cria sessão |

### Web (`apps/web/src`, 44 testes em 4 arquivos)

| Arquivo | Testes | O que prova |
| --- | --- | --- |
| `realtime/lot-sync.test.ts` | 18 | Evento antigo descartado, lacuna pede snapshot HTTP, prorrogação nunca volta o fim, resposta HTTP atrasada não apaga estado novo, relógio do servidor, posição pelo melhor lance, "ganhando/superado/venceu" a partir do estado |
| `format.test.ts` | 3 | BRL exato até R$ 1.000.000.000,99, duração |
| `input-parsing.test.ts` | 7 | "1.234,56" → centavos só com texto e inteiros (inclusive 1,15 e 4,35, que erram com ponto flutuante), recusas, data local ↔ UTC |
| `tour/logic.test.ts` | 16 | Tour guiado: perfil e página pela rota, tour certo por perfil (carteira só para licitante, painel só para leiloeiro), etapa de lance só para licitante, opcionais sem elemento saem, navegação nos limites, preferência por perfil sem dados pessoais, posição do cartão |

### E2E (Playwright no Chrome, 8 cenários)

`e2e/falhas.spec.ts` (3, etapa 18): resposta cortada depois do commit, evento perdido com volta de suspensão, imagem do museu bloqueada. Detalhes em `docs/TESTES_DE_FALHA.md`.

`e2e/tour.spec.ts` (4, tour guiado): convite uma vez, controles e Esc, vitrine → sala, licitante sem alteração de saldo, lista vazia explicada, sair encerra o tour, leiloeiro no celular e lance de outra pessoa chegando com o tour aberto.

`e2e/leilao.spec.ts` (1):

`e2e/server.ts` sobe a aplicação real (API, build do web, Socket.IO e job de liquidação a cada 1 s) nos bancos `_test`, limpa e semeia esses bancos e usa o imitador local da API do museu. Não há relógio falso nem rota extra: o lote termina de verdade alguns minutos depois.

Cenário, cada pessoa no próprio contexto do navegador (cookies separados):
1. Leiloeiro se cadastra, busca no acervo, escolhe a obra e cria o lote pela tela.
2. Licitantes A e B se cadastram e depositam R$ 1.000,00 cada.
3. A dá R$ 100,00 ("Você está ganhando", R$ 100,00 reservados); B vê o lance sem recarregar e cobre com R$ 120,00; A passa a "Você foi superado" com a reserva liberada.
4. O lote termina e é liquidado: B "Você arrematou este lote" com R$ 880,00 disponíveis; A "Você não venceu".
5. Painel do leiloeiro: R$ 120,00 recebidos e "Arrematado por LIC-… por R$ 120,00".
6. Visitante sem login abre o comprovante pelo link (e recarrega) e a auditoria (ÍNTEGRO, 2 lances); o HTML não contém email.

## Requisitos × testes

| Requisito | Onde é verificado |
| --- | --- |
| R02 papéis e propriedade | `auth`, `authorization`, `lots` (cancelar lote alheio), `bids` (leiloeiro não oferta), E2E |
| R03 criar lote com dados do museu | `lots`, `catalog-*`, E2E |
| R04 vitrine | `lots` (estado pelo relógio, sem cancelados), `realtime` |
| R05 cancelamento | `lots`, `bids` (cancelamento contra primeiro lance) |
| R06 sala ao vivo | `realtime`, `lot-sync`, E2E |
| R07 carteira e reservas | `wallet`, `bids` (exemplo do guia, vários lotes), `settlement`, E2E |
| R08 regras e recusas | `bid-rules`, `bids` |
| R09 prorrogação | `bid-rules` (bordas), `bids` (persistida e depois de esperar bloqueio), `realtime` |
| R10 encerramento e liquidação | `settlement`, E2E |
| R11 participações e comprovante | `settlement`, E2E |
| R12 painel do leiloeiro | `lots`, `settlement`, E2E |
| R13 auditoria | `audit`, `settlement` (só liquida ÍNTEGRO), E2E |
| R14 sem dados pessoais | `public-privacy`, `realtime`, `audit`, `settlement`, E2E |
| R15 museu fora do ar | `lot-offline`, `catalog-*` |

## Resultados de 29/10/2026 (etapa 17)

| Comando | Resultado |
| --- | --- |
| `npm test` | API: **235 de 235** (14 arquivos). Web: **28 de 28** (3 arquivos) |
| `npm run test:e2e` | **1 de 1** em 3,8 min (o lote foi liquidado pelo job: vencedor LIC-…, R$ 120,00) |
| `npm run typecheck` / `npm run lint` / `npm run build` | Ok |

## Limites conhecidos

- Cobertura de linhas não medida.
- O E2E usa o Chrome instalado na máquina (`channel: 'chrome'`); em outra máquina sem Chrome, troque para `msedge` ou instale o navegador do Playwright.
- Testes da API do museu real (`test:live`) dependem de internet e não entram no `npm test`.
- Janelas não cobertas pela auditoria (lance removido antes de chegar à âncora) estão descritas em `docs/AUDITORIA.md` §8; os testes não as escondem.

## Resultados de 29/10/2026 (etapa 18)

| Comando | Resultado |
| --- | --- |
| `npm test` | API: **238 de 238**. Web: **28 de 28** |
| `npm run test:e2e` | **4 de 4** em 4,1 min |
| `npm run typecheck` / `npm run lint` / `npm run build` | Ok |

## Resultados de 29/10/2026 (etapa 19)

| Comando | Resultado |
| --- | --- |
| `npm test` | API: **239 de 239** (novo: filtros da vitrine em `lots.test.ts`). Web: **28 de 28** |
| `npm run test:e2e` | **4 de 4** em 4,6 min |
| `npm run typecheck` / `npm run lint` / `npm run build` | Ok |

## Smoke test de produção (etapa 21)

`e2e/smoke.prod.ts` com `e2e/producao.config.ts` (`npm run smoke:prod`): fluxo completo pela URL pública com as contas de demonstração. Exige `SMOKE_PASSWORD`; sem ela é pulado. Não faz parte de `npm run test:e2e`. Executado pelo candidato em 29/10/2026: **1 passed em 4,4 min** (comprovante LIQ-87F3689F22, auditoria ÍNTEGRO).
