# Progresso

Estado atual: etapas 00, 01 e 02 concluídas. Existe a base executável (web React e API Express) sem nenhuma regra de negócio. R01 a R20 continuam pendentes; R01 está em andamento (falta o banco).

**Prazo: desafio recebido em 22/10/2026; entrega até 29/10/2026 (hora limite a confirmar pelo candidato).** O cronograma de 7 dias do guia não cabe no tempo restante. Em 28/10/2026 o candidato decidiu seguir a sequência normal dos prompts em vez do prompt auxiliar E.

Etapa 03 concluída: esqueleto publicado em https://verzel-leiloes-ricardo.onrender.com/ e verificado de fora em 28/10/2026 (detalhes em `docs/DEPLOY.md`).

Etapa 04 concluída localmente (28/10/2026): PostgreSQL 18.3 no Docker Compose, migração aplicada em banco vazio, seed idempotente, 23 restrições e o helper de transação verificados (resultados abaixo). Commit local feito a pedido do candidato, **sem push**.

Próxima ação: **antes do push**, o candidato cria o projeto Neon e cadastra `DATABASE_URL` no Render; sem isso o novo deploy falha no startup (o anterior continua no ar). Depois, etapa 05 (autenticação).

Use este arquivo para registrar etapa, requisitos relacionados, arquivos alterados, comandos executados, resultados reais, pendências e próximo passo. Não marque um requisito como concluído apenas porque existe código para ele.

## Etapa 00 — Início e controle (28/10/2026)

### O que foi feito

- Lidos: `CLAUDE.md`, `docs/prompts/00-inicio-e-controle.md`, `docs/DESAFIO.md`, seções 2 a 10 de `GUIA_COMPLETO_VERZEL.md`, `docs/DECISOES.md`, `docs/PROGRESSO.md`, `docs/USO_DE_IA.md` e as 7 páginas do PDF original.
- Criado `docs/REQUISITOS.md`: R01 a R20 com fonte no PDF, critério de aceite, etapas planejadas e estado pendente; extras E01 a E05 separados; fluxo principal, pontos críticos e diferenças entre o PDF e `DESAFIO.md`.
- Atualizados `docs/DECISOES.md` (novas linhas de ambiente, repositório, prazo, encerramento e interpretações), este arquivo e `docs/USO_DE_IA.md`.
- PDF renomeado de `docs/desafio-original.pdf.pdf` para `docs/desafio-original.pdf`, com autorização do candidato.
- Nenhum código do produto, `.gitignore`, `git init`, commit ou push.

### Leitura do PDF e limitação

O PDF não tem camada de texto: cada página é uma imagem JPEG. `pdftotext` gerou arquivos vazios e `pdftoppm` não está instalado. As 7 imagens foram extraídas com um script Node temporário (sem dependências), salvo fora do projeto, e lidas visualmente. Não houve OCR; os requisitos em `REQUISITOS.md` são paráfrases dessa leitura. A conferência não encontrou contradição com `DESAFIO.md`, apenas os detalhes listados em "Notas da conferência com o PDF" de `REQUISITOS.md`.

### Ambiente conferido (somente leitura)

| Comando ou verificação | Resultado |
| --- | --- |
| `node --version` | v26.13.0 (compatibilidade com Vite e demais pacotes a confirmar na etapa 01) |
| `npm --version` / `npx --version` | 11.20.0 |
| `git --version` | git version 2.56.0.windows.4 |
| `git config` (sem exibir valores) | user.name e user.email definidos; credential helper configurado; `core.autocrlf=true` no nível de sistema |
| `psql --version` | psql (PostgreSQL) 18.3, em `D:\postgre\bin` |
| `pg_isready -h localhost -p 5432` | aceitando conexões |
| `Get-Service *postgres*` | `postgresql-x64-18` em execução, início automático |
| `docker --version` / `docker compose version` | Docker não encontrado (nem no PATH nem em `C:\Program Files\Docker`) |
| `wsl --status` / `wsl -l -v` | WSL 2 como padrão, mas nenhuma distribuição instalada |
| `$PSVersionTable` | PowerShell 5.1.26100 |
| Bash do Git | 5.3.15 (MINGW64) |
| `Get-ExecutionPolicy -List` | Escopos persistentes `Undefined` (o `Bypass` visto era só do processo da ferramenta) |
| `npm config get script-shell` | padrão (scripts npm rodam no cmd.exe no Windows) |
| Portas em escuta | 5432 (PostgreSQL) e 8080 (`httpd`); 3000 e 5173 livres no momento da conferência |
| `gh --version` | GitHub CLI não instalado |
| `claude --version` | CLI não está no PATH do terminal; a sessão roda no app desktop. `claude doctor` não foi executado |
| `python --version` | Python não instalado (só o atalho da Microsoft Store). Não é necessário para a stack proposta |
| API pública do GitHub para `takeshitos/verzel-leiloes-ricardo` | Público, vazio (sem branches), branch padrão `main` |

### Diferenças entre Windows, WSL e Linux que afetam os próximos comandos

- **PowerShell 5.1 não aceita `&&` e `||`.** Use `;` ou `if ($?) { ... }`, ou rode os comandos no Git Bash.
- **Scripts do npm rodam no cmd.exe no Windows e no sh no Linux (deploy).** Evitar em `package.json`: `rm -rf`, `VAR=valor comando`, `export`, aspas simples e globs de shell. Preferir comandos em Node ou ferramentas multiplataforma, a definir na etapa 01/02.
- **Política de execução do PowerShell.** Sem política persistente definida, o Windows costuma bloquear scripts `.ps1`, e `npm` no PowerShell chama `npm.ps1`. Se aparecer erro de "execução de scripts desabilitada", use `npm.cmd`, o Git Bash ou o cmd. Mudar a política é decisão do candidato.
- **Fim de linha.** `core.autocrlf=true` converte para CRLF na cópia local. Scripts executados no Linux podem quebrar com CRLF; propor `.gitattributes` na etapa 02.
- **Maiúsculas e minúsculas.** O Windows não diferencia `Lote.ts` de `lote.ts`; o Linux do deploy diferencia. Um import com caixa errada funciona aqui e quebra em produção. Typecheck e build devem rodar antes do deploy.
- **Variáveis de ambiente.** PowerShell usa `$env:NOME="valor"`; bash usa `NOME=valor comando`. A aplicação deve ler um arquivo `.env` (fora do git) para não depender do shell.
- **WSL.** Não há distribuição instalada; usar WSL exigiria instalar uma e repetir Node, npm e Git dentro dela. Recomendação: continuar no Windows nativo. Se mudar, manter o projeto no sistema de arquivos do Linux, não em `/mnt/e`.
- **PostgreSQL local.** O serviço nativo ocupa a porta 5432. Um PostgreSQL via Docker Compose precisaria de outra porta (ex.: 5433). Testes destrutivos devem usar um banco separado do de desenvolvimento. As credenciais ficam com o candidato e vão para o `.env`, nunca para o chat ou o repositório.
- **Porta 8080 ocupada** por `httpd`; não usar essa porta para a API local.

### Bloqueios e pendências

1. **Prazo muito curto.** Entrega até 29/10/2026 e a hora limite ainda não foi informada. Concluir todos os requisitos obrigatórios com evidência em cerca de um dia é improvável; o prompt E deve definir o que entra, mantendo deploy, saldos, liquidação, privacidade, auditoria, README e relato de IA, e dizendo o que fica parcial.
2. **Hospedagem não escolhida nem contratada.** O deploy público é obrigatório (R18). Depende de conta e autorização do candidato.
3. **Git local ainda não iniciado.** Decidido para a etapa 02, junto com o `.gitignore` que exclui PDF, guia e prompts.
4. **Credenciais do PostgreSQL local** não foram usadas nem solicitadas; serão necessárias na etapa 04 via `.env`.
5. **Docker ausente.** Afeta só o extra E03 (Docker Compose).

### Próximo passo (registrado ao fim da etapa 00)

Recomendado: prompt E. O candidato preferiu seguir a ordem normal; ver etapa 01 abaixo.

## Etapa 01 — Validar plano e dependências (28/10/2026)

Requisitos relacionados: R01, R03, R09, R10, R13, R15, R18 (planejamento; nada implementado).

### Arquivos

- Criados: `docs/PLANO.md`; `docs/fixtures/catalog/README.md`, `cma-artworks-search.json`, `cma-artwork-152006.json`, `aic-artworks-search.json` (respostas reais, copiadas sem alteração).
- Atualizados: `docs/DECISOES.md`, este arquivo, `docs/USO_DE_IA.md`.
- Nenhum código do produto, `package.json`, `git init`, conta criada ou serviço contratado.

### Comandos e resultados reais

| Verificação | Resultado |
| --- | --- |
| `npm view <pacote> version engines dist-tags` para 29 pacotes | Versões estáveis e requisitos de Node registrados em DECISOES |
| `npm view typescript-eslint peerDependencies` | `typescript >=4.8.4 <6.1.0`: TypeScript 7.0.2 incompatível; escolhido 6.0.3 |
| `curl https://nodejs.org/dist/index.json` | v26.13.0 LTS "Lithium" (28/10/2026); v24.22.2 LTS "Krypton" |
| AIC: busca `q=landscape` com `is_public_domain=true`, `limit=2` | HTTP 200 em 0,83 s; 62.119 resultados; licença CC0 (exceto `description`) no corpo |
| AIC: item 874 / item inexistente | 200 / 404 JSON |
| AIC: `limit=100` / `limit=101` / `page=200&limit=100` | 200 / 403 "Invalid limit" / 403 "too many results" (há limite de profundidade na paginação; o valor exato não foi medido) |
| AIC: imagem IIIF `.../full/843,/0/default.jpg` | **403, página de bloqueio do Cloudflare** no `curl`; no navegador embutido do app, "Sorry, you have been blocked" |
| AIC: documentação `https://api.artic.edu/docs/` | 403 para a ferramenta de leitura e para o `curl` |
| Cleveland: busca `q=landscape&cc0=1&has_image=1&limit=2` | HTTP 200 em 0,25 a 0,57 s; 1.590 resultados |
| Cleveland: item 152006 / item inexistente | 200 (60 campos) / 404 `{"detail":"Artwork not found"}` |
| Cleveland: imagem `images.web` | 200 `image/jpeg` no `curl`; abre no navegador embutido (778×893) |
| Met Museum: `/public/collection/v1/search` | 410: rota desativada em 01/10/2026 (não usada) |
| Timeout forçado (`curl --max-time 0.001`) | Código 28, sem resposta: confirma a necessidade de tratar timeout no cliente |
| Documentação do Render (free, disks, node-version) | Free dorme após 15 min, acorda em cerca de 1 min, suporta WebSocket, sem disco; Postgres free expira em 30 dias; disco só em instância paga; Node padrão 24.22.1, Node 26 não mencionado |
| Página de preços do Render | Valores não foram lidos pela ferramenta; conferir no painel antes de qualquer contratação |
| Documentação do Neon (plans) | Free: 100 projetos, 1 GB cada, compute suspende após 5 min, sem expiração informada |

Uma tentativa de repetir a requisição da imagem da AIC com cabeçalho de navegador foi recusada pela política de segurança da sessão, por ser contorno de proteção anti-robô. O pedido não foi repetido e nenhuma proteção foi contornada.

### Decisões e mudanças em relação ao kit

- Catálogo: **Cleveland Museum of Art** no lugar do Art Institute of Chicago, porque a imagem da AIC está bloqueada. Precisa da conferência do candidato.
- TypeScript 6.0.3; Node 24 LTS em produção.
- Hospedagem: Render gratuito + dois projetos Neon gratuitos (principal e âncora). Nada criado.
- Protocolo de auditoria, modelo de ameaça, ordem de bloqueios, rotas, erros, eventos e testes em `docs/PLANO.md`.

### Pendências

1. Candidato confirmar a troca do catálogo para Cleveland (ou manter a AIC aceitando imagens com falha).
2. Hora limite de 29/10/2026.
3. Contas no Render e no Neon (ação do candidato, na etapa 03).
4. Comando exato das migrações SQL do `node-pg-migrate` a confirmar na etapa 04.

### Como validar manualmente

- Abrir no navegador `https://openaccess-cdn.clevelandart.org/1972.47/1972.47_web.jpg` (deve aparecer a pintura) e `https://www.artic.edu/iiif/2/3a34f988-f779-2e96-1786-8945b6b9c87d/full/843,/0/default.jpg` (para conferir se a AIC também bloqueia no seu navegador).
- Ler `docs/PLANO.md`, seções 3 (bloqueios) e 7 (auditoria), que são as decisões mais difíceis de defender.

O candidato confirmou a troca para Cleveland em 28/10/2026.

## Etapa 02 — Estrutura do projeto (28/10/2026)

Requisitos relacionados: R01 (em andamento). Nenhuma regra de negócio, login, saldo ou lote.

### Estrutura criada

```
package.json            workspaces, scripts dev/build/start/typecheck/lint, engines Node >=24.11 <27
package-lock.json       lockfile gerado pelo npm 11.20.0
tsconfig.base.json      opções comuns do TypeScript (strict)
eslint.config.js        ESLint 10 + typescript-eslint + regras de React
.gitignore              exclui node_modules, dist, .env, .claude/, PDF, guia e prompts
.gitattributes          fim de linha LF no repositório e na cópia local
apps/api                Express 5 + TypeScript (ESM, NodeNext)
  src/server.ts           lê config, sobe o HTTP, encerra limpo com SIGTERM/SIGINT
  src/app.ts              rotas /api, 404 JSON em /api, build do React + rotas da SPA
  src/shared/config.ts    valida NODE_ENV, PORT e HOST com zod; carrega apps/api/.env só fora de produção
  src/shared/errors.ts    AppError e formato { error: { code, message } }
  src/modules/health      GET /api/health
  .env.example            exemplos sem segredos
apps/web                React 19 + Vite 8 + React Router 8
  vite.config.ts          proxy de /api e /socket.io para http://localhost:3000
  src/api/client.ts       cliente HTTP único que interpreta os erros da API
  src/pages/              Início (consulta /api/health), Sobre, Página não encontrada
  .env.example            aviso de que VITE_* é público; nenhuma variável necessária
```

Git: `git init -b main` e `origin` apontando para o GitHub. **Sem commit e sem push.**

### Comandos e resultados reais

| Comando | Resultado |
| --- | --- |
| `npm install` | 259 pacotes, 0 vulnerabilidades, `package-lock.json` criado. Aviso: o npm 11 não executou o script de pós-instalação do `esbuild` 0.28.2 (dependência do `tsx`) por não estar em `allowScripts`. `tsx --version` e uma transformação com `esbuild` funcionaram mesmo assim; nada foi liberado |
| `npm ls --depth=0 --workspaces` | Versões instaladas iguais às de DECISOES |
| `npm run typecheck` | Sem erros (api e web) |
| `npm run lint` | Sem erros nem avisos; 13 arquivos analisados; 17 regras de React ativas no web |
| `npm run build` | Web: 97 módulos, JS 259,15 kB (82,63 kB gzip), CSS 1,29 kB. API: `tsc` sem erros |
| Produção local (`NODE_ENV=production PORT=3100 HOST=127.0.0.1 node apps/api/dist/server.js`) | `GET /api/health` 200 JSON; `GET /` e `GET /sobre` 200 HTML; `GET /api/inexistente` 404 JSON; `POST /api/health` 404 JSON; JSON malformado 400 `VALIDATION_ERROR`; corpo > 100 kB 413 `PAYLOAD_TOO_LARGE`; `/assets/inexistente.js` 404 JSON; asset real 200; sem `X-Powered-By` |
| Encerramento (evento `SIGTERM` disparado no processo) | "Recebido SIGTERM... Servidor encerrado.", saída 0 |
| `PORT=abc` / `NODE_ENV=prod` | Saída 1 com "Configuração inválida" citando a variável, sem mostrar o valor |
| Porta indisponível (`PORT=5432`) | "Falha ao iniciar o servidor: listen EACCES", saída 1 |
| Desenvolvimento no navegador embutido (API na 3000, Vite na 5173) | Início mostrou "Conectada. Horário do servidor: 28/10/2026, 22:04:14"; link Sobre e acesso direto a `/sobre` funcionaram; rota inexistente mostrou "Página não encontrada" |

### Problemas encontrados e como foram tratados

- **Sinal pelo Git Bash no Windows:** `kill -INT` não chega a um processo Node nativo no Windows (o Node só recebe Ctrl+C de console), e o teste travou. O processo foi parado pela porta e o encerramento foi testado disparando o evento `SIGTERM` dentro do processo. **A entrega real do sinal pelo sistema não foi testada**; o Render (Linux) envia SIGTERM no deploy, então conferir no log da etapa 03.
- **Porta da API no preview do app:** a ferramenta de preview injeta `PORT=5173` no ambiente, e a API subiu na mesma porta do Vite (502 no proxy). Num terminal comum `PORT` não vem definido e a API usa 3000. Foi resolvido só na configuração local do preview (`.claude/launch.json`, ignorado pelo git), com uma entrada para a API (3000) e outra para o web (5173). O código não mudou. Se `PORT` estiver definido no seu terminal, `npm run dev` repete o problema: remova a variável antes de rodar, porque o `apps/api/.env` não sobrescreve uma variável que já existe no ambiente.
- **Erros 502 no console do navegador:** vieram das tentativas anteriores à correção, na mesma aba.

### Pendências

1. Commit feito a pedido do candidato; push ainda não autorizado.
2. `allowScripts` do `esbuild`: hoje desnecessário; liberar só se algum comando falhar por isso (decisão do candidato).
3. Teste do banco no `/api/health` entra na etapa 04.

### Como validar manualmente

```bash
npm install
```

```bash
npm run dev
```

Abrir http://localhost:5173: deve aparecer "Status da API: Conectada" com o horário do servidor. Depois testar o build de produção:

```bash
npm run build
```

```bash
npm start
```

Abrir http://localhost:3000/sobre e http://localhost:3000/api/inexistente (este deve mostrar JSON com `NOT_FOUND`).

### Proposta de mensagem de commit

```
chore: estrutura inicial do monorepo com web React e API Express

- npm workspaces com apps/web (React 19, Vite 8, React Router 8) e apps/api (Express 5)
- API: validação de configuração no startup, erros em JSON, GET /api/health,
  build do React servido em produção com rotas da SPA e encerramento limpo
- Web: navegação básica e página inicial consultando /api/health pelo proxy do Vite
- Scripts dev, build, start, typecheck e lint; TypeScript 6 e ESLint 10
- Documentos de controle das etapas 00 a 02 (requisitos, decisões, plano, fixtures)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Commit `dae1242` feito a pedido do candidato em 28/10/2026.

## Etapa 03 — Primeiro deploy (28/10/2026, concluída)

Requisito relacionado: R18 (pendente até a URL pública ser verificada).

### O que foi feito

- **Push autorizado pelo candidato:** `git push -u origin main` enviou o commit `dae1242`. A API pública do GitHub mostrou 37 arquivos em `main`, sem PDF, guia, prompts, `.env`, `dist` ou `node_modules`.
- Criados `render.yaml` (Blueprint: web service Free, região `virginia`, build, start, health check, `NODE_ENV`), `.node-version` (`24.22.1`) e `docs/DEPLOY.md` (configuração, variáveis, simulação, passo a passo do Render e do Neon, checklist da verificação pública).
- O caminho do PostgreSQL e da âncora ficou documentado: dois projetos Neon em `aws-us-east-1`, variáveis cadastradas no painel do Render nas etapas 04 e 10. Nenhuma migração ou seed foi executada.

### Comandos e resultados reais

| Comando | Resultado |
| --- | --- |
| `git push -u origin main` | `* [new branch] main -> main` |
| API do GitHub (`git/trees/main`) | 37 arquivos, nenhum proibido, commit `dae1242` |
| Cópia limpa + `NODE_ENV=production npm ci` + build | 77 pacotes; build falhou (`tsc` ausente): justifica `--include=dev` |
| Cópia limpa + `npm ci --include=dev && npm run build` | 259 pacotes; build ok |
| Config em produção sem `HOST` | `host: 0.0.0.0` |
| Servidor com `PORT=10000` | `/api/health` 200; `/`, `/sobre`, `/lotes/123/auditoria` 200 HTML; `/api/rota-inexistente` 404 JSON; encerramento ok |

Commit `80536a7` (configuração de deploy) criado e enviado como parte do push autorizado para a etapa 03, porque o Render lê o `render.yaml` do repositório.

### Verificação pública (após o candidato criar o serviço no Render)

URL: https://verzel-leiloes-ricardo.onrender.com/ (verificada em 2026-10-29T01:24Z).

| Verificação | Resultado |
| --- | --- |
| `GET /api/health` | 200 JSON |
| `GET /`, `/sobre`, `/lotes/123/auditoria` | 200 HTML |
| `GET /api/rota-inexistente` | 404 JSON `NOT_FOUND` |
| `http://` | 301 para `https://` |
| Navegador embutido | Página inicial com "Conectada. Horário do servidor: 28/10/2026, 22:24:17"; Sobre pelo menu e por acesso direto; rota inexistente com "Página não encontrada"; console sem erros |

Critério da etapa atendido: o frontend fala com o backend por URL pública.

### Ainda não verificado

Versão do Node e SIGTERM nos logs do Render (a IA não acessa o painel) e tempo de acordar depois de 15 minutos ocioso.

Depois da verificação, o commit `66bb563` (documentação) foi enviado a pedido do candidato. O Render publicou sozinho: às 01:29:04 UTC respondeu uma instância nova (`uptimeSeconds` 18), sem nenhuma requisição com erro durante a troca.

## Etapa 04 — Banco, migrações e seed (28/10/2026, concluída localmente)

Requisitos relacionados: R01 (banco), R16 (seed), e a base de R07, R10, R13 e R14.

### Arquivos

- `apps/api/migrations/1793238000000_esquema-inicial.sql`: todas as tabelas, chaves estrangeiras, índices e restrições (com `-- Down Migration`).
- `apps/api/src/db/`: `pool.ts`, `transaction.ts`, `database-url.ts`, `migrations.ts`, `migrate.ts`, `seed-data.ts`, `seed.ts`, `demo-lot.ts`.
- `apps/api/src/modules/auth/password.ts` e `alias.ts`; `apps/api/src/modules/catalog/cma.ts` (normalização validada com zod).
- `apps/api/src/shared/describe-error.ts`; `config.ts`, `server.ts`, `app.ts` e o health check atualizados.
- `docker-compose.yml`, `apps/api/.env.example` (opções A e B), scripts `db:*` e `render.yaml` (`RUN_MIGRATIONS_ON_START`, `RUN_SEED_ON_START`, `DATABASE_URL` como segredo).
- `apps/api/.env` local, ignorado pelo git, só com as credenciais de desenvolvimento do Compose.

### Invariantes garantidas pelo banco

- Dinheiro em `BIGINT`: total da carteira ≥ 0; lance inicial, incremento, lance, reserva, lançamento e liquidação > 0.
- `lots`: fim original > início; fim atual ≥ fim original; **cancelado só com zero lances**; há líder se e somente se há lances; o líder é um lance do mesmo lote.
- `bids`: sequência única por lote; hashes com 64 hex.
- **Uma reserva por lote** (chave primária), apontando para um lance do mesmo lote.
- **Uma liquidação por lote** (chave primária); vencedor, lance e valor presentes juntos ou ausentes juntos.
- `wallet_entries`: `operation_key` única; depósito sem lote e liquidação com lote.
- Um comprovante por liquidação, com token público único de pelo menos 32 caracteres.
- Checkpoints de auditoria: `pending`/`confirmed`, com `confirmed_at` coerente.
- Usuários: email único em minúsculas; papel `seller` ou `bidder`; pseudônimo único `VEN-`/`LIC-` + 6 hex.

Invariantes que dependem de código (etapas 08 a 11): disponível ≥ 0 considerando reservas de todos os lotes; total da carteira = soma dos lançamentos; ordem de bloqueio.

### Verificado sem banco

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` / `npm run lint` | Sem erros |
| `db:migrate` com o banco fora do ar | Saída 1: "Falha nas migrações: connect ECONNREFUSED ::1:5433 \| connect ECONNREFUSED 127.0.0.1:5433" |
| `db:migrate:test` com banco sem `_test` | Recusado: "TEST_DATABASE_URL precisa apontar para um banco cujo nome termina em \"_test\"" |
| Servidor com `DATABASE_URL` vazia | Saída 1: "Configuração inválida: DATABASE_URL..." |
| `/api/health` com o banco fora do ar | 503 `{"status":"degraded","database":"unavailable",...}` |
| CLI do `node-pg-migrate` | Opções `--migrations-dir` e `--migration-file-language` confirmadas no `--help` |

**Defeito encontrado e corrigido:** a primeira falha de conexão saiu com mensagem vazia (o `AggregateError` do `localhost` tem `message` vazio). Foi criado `describeError`, que mostra os erros internos.

### Verificado com banco real (Docker)

O candidato instalou o Docker Desktop 29.9.2 (Compose v5.6.1). O container não existia, então a IA rodou `docker compose up -d` na pasta do projeto.

| Verificação | Resultado |
| --- | --- |
| `docker compose config --quiet` / `up -d` | Arquivo válido; container `healthy` em cerca de 6 s; PostgreSQL 18.3; porta 5433; volume em `/var/lib/postgresql` |
| `npm run db:migrate` em banco vazio | Aplicou `1793238000000_esquema-inicial`; 12 tabelas + `pgmigrations` |
| `npm run db:migrate` de novo | "Nenhuma migração pendente." |
| `npm run db:migrate:test` | Criou `verzel_test` automaticamente e aplicou a migração; repetido: nada pendente |
| Migração down/up no `verzel_test` | Down removeu as 12 tabelas; up recriou as 12 |
| `npm run db:seed` (1ª vez) | 3 usuários, 2 depósitos iniciais, 1 snapshot, 1 lote ao vivo (fim em 2026-11-08) |
| `npm run db:seed` (2ª vez) | "nada alterado"; estado idêntico (contagens e hash de usuários e lotes iguais) |
| Carteiras × lançamentos | Total = soma dos lançamentos nas 3 carteiras (R$ 10.000,00, R$ 10.000,00, R$ 0,00) |
| Senhas do seed | Formato `scrypt$32768$...`; senha padrão confere para as 3 contas |
| Pseudônimos | `VEN-BA4F3F`, `LIC-9E250C`, `LIC-670E1A` (aleatórios) |
| Restrições (script de verificação no `verzel_test`, transação desfeita no fim) | **23 de 23** violações recusadas pelo banco com a restrição esperada |
| `withTransaction` | Rollback em erro; commit em sucesso; conexão sempre devolvida; **deadlock real** (duas transações em ordem oposta): o PostgreSQL abortou uma (40P01), o helper repetiu, e as duas terminaram com efeitos aplicados uma única vez |
| Conversão de BIGINT | `9007199254740991` vira number; `9007199254740993` gera erro em vez de arredondar |
| `db:demo-lot --key teste-etapa-04 --minutes 30` | Criou o lote; repetir a chave não duplica; chave inválida e obra fora das fixtures recusadas com mensagem |
| Inicialização de produção em banco novo (`RUN_MIGRATIONS_ON_START` e `RUN_SEED_ON_START`), duas vezes | 1ª: migração + seed + `/api/health` 200 com `database: ok`; 2ª: nada pendente, seed sem mudanças; banco descartável removido depois |
| `docker compose down` e `up -d` | Dados preservados (3 usuários, 2 lotes) |

Os scripts de verificação ficaram fora do repositório. A suíte automatizada da etapa 17 deve transformar esses casos em testes versionados.

### Pendências

1. Commit local feito a pedido do candidato; push só depois de `DATABASE_URL` no Render.
2. Projeto Neon principal (ação do candidato) e conferência do seed em produção.
3. Invariantes que dependem do código das etapas 08 a 11.
4. No terminal desta sessão o `docker` precisou do caminho completo (o PATH foi carregado antes da instalação). Num terminal novo do candidato ele já funciona.

### Pedido do candidato durante a etapa

O candidato pediu as skills `frontend-design` e `Superdesign` para um frontend profissional e moderno. As duas constam como habilitadas no catálogo da conta, mas não carregam nesta sessão (`Unknown skill`). Foi mostrado o cartão para ativá-las e a preferência foi registrada em DECISOES para as etapas 13 a 16.
