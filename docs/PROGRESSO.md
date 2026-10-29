# Progresso

Estado atual: etapas 00, 01 e 02 concluídas. Existe a base executável (web React e API Express) sem nenhuma regra de negócio. R01 a R20 continuam pendentes; R01 está em andamento (falta o banco).

**Prazo: desafio recebido em 22/10/2026; entrega até 29/10/2026 (hora limite a confirmar pelo candidato).** O cronograma de 7 dias do guia não cabe no tempo restante. Em 28/10/2026 o candidato decidiu seguir a sequência normal dos prompts em vez do prompt auxiliar E.

Etapa 03 concluída: esqueleto publicado em https://verzel-leiloes-ricardo.onrender.com/ e verificado de fora em 28/10/2026 (detalhes em `docs/DEPLOY.md`).

Etapa 04 concluída: PostgreSQL 18.3 no Docker Compose localmente, migração e seed idempotentes, 23 restrições e o helper de transação verificados. Commit `d75f85c` enviado depois que o candidato cadastrou `DATABASE_URL` (Neon) no Render. Em produção, `/api/health` responde `database: ok` desde 02:03 UTC. O log do Render (captura do candidato) mostra a migração aplicada no Neon, o seed criado e o SIGTERM tratado com encerramento limpo na instância antiga (detalhes em `docs/DEPLOY.md`).

Etapa 05 concluída localmente (28/10/2026): cadastro, login, logout e `/me` com sessão opaca; middlewares de autenticação, papel e propriedade; CSRF e limite de tentativas. 30 testes com PostgreSQL real passam. Commit e push feitos a pedido do candidato.

Etapa 06 concluída localmente (28/10/2026): cliente real da Cleveland com timeout, cache e falhas tratadas; busca e detalhe para o leiloeiro; snapshot gravado pelo servidor; detalhe público do lote lido só do banco. 52 testes + 3 contra a API real passam. Commit e push feitos a pedido do candidato.

Etapa 07 concluída localmente (28/10/2026): criação de lote pelo snapshot, vitrine pública, cancelamento sob bloqueio e painel HTTP do vendedor. 83 testes passam (+1 pendente para a etapa 09). A liquidação **ainda não existe**. Commit e push feitos a pedido do candidato.

Etapa 08 concluída localmente (29/10/2026): carteira do licitante, depósito simulado idempotente (inclusive com requisições simultâneas) e regras de bloqueio da carteira centralizadas. 120 testes passam (+1 pendente). Commit e push feitos a pedido do candidato.

Etapa 09 concluída localmente (29/10/2026): lance transacional com bloqueios, idempotência, prorrogação, cadeia de hashes real e eventos pós-commit. 165 testes passam. **Ainda faltam** encerramento/liquidação (etapa 11) e auditoria com checkpoint assinado e âncora (etapa 10); R13 continua pendente. Commit e push feitos a pedido do candidato.

Etapa 10 concluída localmente (29/10/2026): checkpoint Ed25519 a cada lance, âncora independente só de inserção, reconciliador e verificação pública. 192 testes passam (27 de ataques e falhas). **R13 parcial** até a âncora e a chave estarem em produção; limites declarados em `docs/AUDITORIA.md`. Commit local feito a pedido do candidato, **sem push** (aguardando a configuração da produção).

Etapa 10 publicada: o candidato configurou chave, âncora e Render; commit `679e200` no ar.

Etapa 11 concluída e publicada (29/10/2026): liquidação automática com auditoria ÍNTEGRA, comprovante por token e participações. 210 testes passam. Commit `8b0b36b` no ar.

Etapa 12 concluída localmente (29/10/2026): Socket.IO no mesmo servidor, sala pública por lote, sala privada por usuário decidida pela sessão, reconexão com snapshot HTTP e sala ao vivo mínima em `/lotes/:id`. 239 testes passam (224 da API, 15 do web). Commit `b8d5eea` no ar desde 15:06 UTC.

Etapa 13 concluída localmente (29/10/2026): base visual, sessão real no app (login, cadastro, logout), navegação por papel, vitrine com três seções ao vivo e telas de leitura (carteira, participações, painel, auditoria, comprovante) ligadas à API. 242 testes passam (224 da API, 18 do web). Commit `63c7028` no ar desde 16:16 UTC.

Etapa 14 concluída localmente (29/10/2026): painel do leiloeiro com busca real no acervo, criação de lote (valores em R$ convertidos para centavos por texto, datas locais convertidas para UTC com o fuso visível), lista dos lotes dele com resultado e total recebido, e cancelamento com confirmação. 249 testes passam (224 da API, 25 do web). Commit `e6a097f` no ar desde 16:43 UTC.

Etapa 15 concluída localmente (29/10/2026): depósito simulado e lance pela tela com chave de idempotência por intenção, posição e "você está ganhando / foi superado" calculados do estado do servidor, mensagens para cada recusa, resposta perdida tratada sem reenvio automático, comprovante com link para compartilhar. Cenário A/B do guia feito em duas sessões reais. 252 testes passam (224 da API, 28 do web). Commit `b08fff3` no ar desde 17:11 UTC.

Etapa 16 concluída localmente (29/10/2026): páginas públicas de auditoria (histórico completo, estado com explicação fiel, detalhes técnicos, chave pública e limites) e de comprovante (snapshot da liquidação, identificador da transação, copiar link, imprimir), ambas sem login; 404 sem detalhes. Conferidas com lote íntegro, sem lances, adulterado e âncora fora do ar nos bancos de teste. 252 testes passam. Commit `4423568` no ar desde 17:46 UTC.

Etapa 17 concluída localmente (29/10/2026): mapa dos testes por requisito em `docs/TESTES.md`, teste de privacidade de todas as respostas públicas e E2E com Playwright (leiloeiro, dois licitantes e visitante). 235 testes da API, 28 do web e 1 E2E passam. Commit `d26efe7` no ar desde 18:02 UTC.

Etapa 18 concluída localmente (29/10/2026): rodada de falhas em ambiente isolado registrada em `docs/TESTES_DE_FALHA.md`. Dois defeitos corrigidos com regressão (500 para lance já gravado quando a confirmação pós-commit falhava; mensagens de "sem resposta" no cancelamento e na criação de lote). 238 testes da API, 28 do web e 4 E2E passam. Ainda sem commit.

Próxima ação: commit e push da etapa 18 (a pedido do candidato); depois, etapa 19 (extras com limite).

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

1. Commit `d75f85c` enviado em 2026-10-29T01:58Z, depois de `DATABASE_URL` no Render. Nova versão no ar às 02:03:09 UTC com `database: ok`.
2. Migrações e seed em produção confirmados pelo log do Render (23:03 de Brasília). Antes disso, uma instância parou na validação por `DATABASE_URL` inválida, corrigida pelo candidato.
3. Invariantes que dependem do código das etapas 08 a 11.
4. No terminal desta sessão o `docker` precisou do caminho completo (o PATH foi carregado antes da instalação). Num terminal novo do candidato ele já funciona.

### Pedido do candidato durante a etapa

O candidato pediu as skills `frontend-design` e `Superdesign` para um frontend profissional e moderno. As duas constam como habilitadas no catálogo da conta, mas não carregam nesta sessão (`Unknown skill`). Foi mostrado o cartão para ativá-las e a preferência foi registrada em DECISOES para as etapas 13 a 16.

## Etapa 05 — Autenticação e autorização (28/10/2026, concluída localmente)

Requisitos relacionados: R02 (papéis e permissões) e R14 (nada pessoal nas respostas).

### Arquivos

- `apps/api/src/modules/auth/`: `session.ts` (token, cookie, hash), `service.ts` (cadastro e login), `middleware.ts` (`loadSessionUser`, `requireAuth`, `requireRole`), `routes.ts` (`/api/auth/register`, `/login`, `/logout`, `/me`).
- `apps/api/src/modules/lots/ownership.ts` (`requireLotOwner`, usado a partir da etapa 07).
- `apps/api/src/shared/`: `request-guards.ts` (CSRF, JSON obrigatório, IP do cliente), `rate-limit.ts`, `validation.ts`.
- `apps/api/src/types/express.d.ts` (`req.user`).
- `app.ts`, `config.ts`, `server.ts`, `render.yaml` e `.env.example` (`TRUST_PROXY`, `CLIENT_IP_HEADER`).
- Testes: `apps/api/vitest.config.ts`, `tsconfig.test.json`, `test/global-setup.ts`, `test/helpers.ts`, `test/auth.test.ts`, `test/authorization.test.ts`. Novos comandos: `npm test`; o `typecheck` da API agora inclui os testes.
- Dependências: `cookie-parser` 1.4.7; para desenvolvimento, `vitest` 5.0.5, `supertest` 7.3.1 e tipos.

### Como funciona (resumo para defender)

- **Sessão opaca:** no login, o servidor sorteia 32 bytes, manda no cookie e guarda só o SHA-256 no banco. Quem lê o banco não consegue se passar pelo usuário. Logout apaga a linha; cada login gera um token novo.
- **Cookie:** `HttpOnly` (o JavaScript não lê), `SameSite=Lax` (não vai em POST de outro site) e, em produção, `Secure` com o prefixo `__Host-`.
- **CSRF:** como front e API estão na mesma origem, toda requisição que altera estado precisa vir da mesma origem (cabeçalhos `Origin` e `Sec-Fetch-Site`) e ter corpo JSON.
- **Papel:** escolhido no cadastro (`seller` ou `bidder`), validado por lista fechada e lido do banco a cada requisição. Não há rota que altere o papel, e campos extras no corpo são recusados.
- **Quem age:** sempre `req.user`, vindo da sessão. Id ou papel no corpo e nos cabeçalhos são ignorados.
- **Tentativas:** limites em memória por IP e por email; o IP vem de `CF-Connecting-IP` no Render.
- Mapa de permissões por rota em `docs/PLANO.md`, seção 4.

### Comandos e resultados reais

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | Sem erros (API, testes e web) |
| `npm run lint` | Sem erros (3 problemas corrigidos na primeira execução) |
| `npm test` | **30 de 30 testes passando** em 2 arquivos, contra o `verzel_test` no Docker |
| Prova de que os testes detectam falha: checagem de papel e de dono desligada de propósito | 5 testes de autorização falharam; código restaurado e 30/30 de novo |
| `npm run build` | Ok |
| Servidor compilado em produção (`TRUST_PROXY=1`, `CLIENT_IP_HEADER`) no `verzel_dev` | Login 200 com cookie `__Host-sid=…; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax`; `/me` 200; logout de outra origem 403 `FORBIDDEN_ORIGIN`; logout 204; `/me` depois 401; SIGTERM ok |

Casos cobertos pelos testes: cadastro dos dois papéis; email duplicado (inclusive com maiúsculas); papel inválido; campo extra (`isAdmin`); mensagens por campo; nenhuma senha, hash, token ou id na resposta; login das 3 contas do seed; mesma resposta para senha errada e email inexistente; token novo a cada login com revogação do anterior; 429 com `Retry-After` na 11ª tentativa; `/me` sem e com sessão; logout revoga no banco; sessão expirada; token inventado; CSRF (Origin estranho, `cross-site`, mesma origem, formulário); cookie de produção; visitante 401; licitante em rota de leiloeiro 403; leiloeiro dando lance 403; papel ou id falsos em corpo e cabeçalhos ignorados; dono gerencia o lote; outro leiloeiro 403; lote inexistente ou id inválido 404.

### Pendências

1. Rotas de lotes, carteira e lances (etapas 07 a 09) devem usar estes middlewares, conforme o mapa do PLANO.
2. Sessão no Socket.IO (etapa 12).
3. Confirmar no Render que `TRUST_PROXY` e `CLIENT_IP_HEADER` aparecem em Environment depois do próximo deploy.
4. O limite de tentativas é por instância (memória); suficiente para uma instância só.

### Deploy da etapa 05

Commit `fa28393` enviado a pedido do candidato; nova versão no ar às 02:17:46 UTC. Na URL pública, sem credenciais, conferi:
- `/me` sem sessão responde 401;
- a validação responde 400 com mensagens por campo;
- o CSRF recusa outra origem (403) e formulário (415);
- o logout da mesma origem responde 204 e limpa `__Host-sid` com `Secure`.

Detalhes em `docs/DEPLOY.md`. O login das contas de demonstração em produção fica para o candidato conferir:

```bash
curl -s -i -X POST https://verzel-leiloes-ricardo.onrender.com/api/auth/login -H "Content-Type: application/json" -H "Origin: https://verzel-leiloes-ricardo.onrender.com" -d '{"email":"cliente1@example.com","password":"leilao-demo-2026"}'
```

Esperado: `HTTP/1.1 200`, `Set-Cookie: __Host-sid=...; HttpOnly; Secure; SameSite=Lax` e `{"user":{"email":"cliente1@example.com","role":"bidder","publicAlias":"LIC-..."}}`.

Resultado (candidato, 02:21 UTC, PowerShell): `200`, cookie `__Host-sid` com `HttpOnly; Secure; SameSite=Lax` e usuário `cliente1@example.com` / `bidder` / `LIC-A465A1`. **Login das contas do seed em produção confirmado.** No PowerShell 5.1, `curl` é um apelido de `Invoke-WebRequest`; use `curl.exe` ou o Git Bash para os comandos em bash.

## Etapa 06 — API externa e snapshots (28/10/2026, concluída localmente)

Requisitos relacionados: R03 (busca e snapshot) e R15 (funcionar sem a API externa). A API usada é a da Cleveland, conforme a troca registrada na etapa 01 (imagem da AIC bloqueada).

### Arquivos

- `apps/api/src/modules/catalog/client.ts`: cliente HTTP com timeout, cache de 60 s / 5 min, cache vencido de até 10 min identificado, tratamento de 404, 429, 5xx, JSON inválido e formato inesperado, sem nova tentativa automática.
- `apps/api/src/modules/catalog/cma.ts`: normalização aceita só imagem `https` do CDN oficial e link de fonte em `clevelandart.org`.
- `apps/api/src/modules/catalog/routes.ts`: `GET /api/catalog/search?q=&page=` e `GET /api/catalog/items/:externalId`, só para leiloeiro, 30 buscas/min.
- `apps/api/src/modules/catalog/snapshots.ts`: `fetchItemForLot` (busca pelo id, exige imagem) e `upsertSnapshot` (movido do seed).
- `apps/api/src/modules/lots/public-routes.ts`: `GET /api/lots/:id`, detalhe público lido só do banco. Antecipado da etapa 07 para provar R15; listagem, criação e cancelamento continuam na 07.
- `apps/web/public/obra-sem-imagem.svg` e `apps/web/src/components/ArtworkImage.tsx` (placeholder local; as telas chegam nas etapas 13 a 15).
- Configuração `CMA_API_BASE_URL` (padrão: API da Cleveland) e `CATALOG_TIMEOUT_MS` (padrão 5000); nada a configurar no Render.
- Testes: `test/catalog-stub.ts` (servidor local que imita o museu com as respostas reais das fixtures), `catalog-client.test.ts`, `catalog-routes.test.ts`, `lot-offline.test.ts` e `catalog.live.test.ts` (API real, `npm run test:live -w apps/api`).

### Comandos e resultados reais

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` / `npm run lint` | Sem erros (1 erro de tipo no teste corrigido) |
| `npm test` | **52 de 52** em 5 arquivos |
| `npm run test:live -w apps/api` (API real) | **3 de 3**: busca `landscape` (total 1590, 12 recebidas, 0 descartadas, imagens no CDN oficial); obra 152006 aceita para lote; imagem do CDN responde |
| Primeira execução do teste real | A checagem da imagem com `HEAD` estourou 10 s. Investigado com `curl -I` (sem resposta em 15 s), `GET` (200, 641.874 bytes) e `GET` com `Range` (206 em 0,1 s): **o CDN não responde a HEAD**. O teste passou a usar `GET` com `Range`, mantendo o mesmo objetivo |
| Ponta a ponta local (servidor compilado, API real, `verzel_dev`) | Login do leiloeiro 200; busca "still life" 200 (12 itens, origem `live`; repetida: `cache`); obra 147016 200; `GET /api/lots/<lote do seed>` 200 `live` com título, lance mínimo e `VEN-...` |
| `npm run build` | Ok |

Casos cobertos pelos testes:
- **Busca:** parâmetros enviados ao museu; normalização da resposta real; cache de 60 s; 429 com `Retry-After`; 5xx sem nova tentativa; HTML no lugar de JSON; formato inesperado; timeout de 300 ms; conexão recusada; cache vencido servido com idade e origem até 10 min e recusado depois; obras inválidas ou não CC0 descartadas; imagem de host estranho anulada.
- **Obra:** obra real; 404; obra diferente da pedida; obra não CC0; para criar lote, obra inexistente (404) ou sem imagem (422).
- **Rotas:** visitante 401; licitante 403 (sem chegar ao museu); termo e página validados; URL enviada pelo cliente ignorada; erro do museu como 503 sem vazar o corpo; id inválido 400.
- **Museu fora do ar:** detalhe do lote vindo do snapshot; busca honesta com 503; **o servidor real reiniciado duas vezes em processos novos continua servindo o lote**.

### Pendências

1. Criar lote a partir do snapshot (etapa 07, `POST /api/lots` usa `fetchItemForLot` + `upsertSnapshot`).
2. Vitrine, auditoria e comprovante também lendo só o banco (etapas 07, 11 e 16) e o teste de falha da etapa 18.
3. Telas usarem `ArtworkImage` (etapas 13 a 15).

### Deploy da etapa 06

Commit `eeee068` enviado a pedido do candidato; nova versão no ar às 02:32:04 UTC. Verificado de fora, sem credenciais:
- busca do catálogo sem login: 401;
- lote inexistente: 404;
- **lote do seed de produção: 200, ao vivo**, com obra, lance mínimo, `VEN-4AF320` e fonte CC0, sem dados pessoais;
- placeholder local: 200.

Detalhes em `docs/DEPLOY.md`.

## Etapa 07 — Gestão de lotes (28/10/2026, concluída localmente)

Requisitos relacionados: R03 (criação), R04 (vitrine), R05 (cancelamento) e R12 (painel do vendedor, sem liquidação ainda).

### Arquivos

- `apps/api/src/modules/lots/queries.ts`: estado calculado no SQL, formato público, vitrine, lotes do vendedor e resumo.
- `apps/api/src/modules/lots/service.ts`: `createLot` (obra buscada no museu fora da transação, datas conferidas com o relógio do banco) e `cancelLot` (`FOR UPDATE` no lote antes de qualquer conferência).
- `apps/api/src/modules/lots/routes.ts`: `POST /api/lots`, `POST /api/lots/:id/cancel`, `GET /api/seller/lots`, `GET /api/seller/summary`.
- `apps/api/src/modules/lots/public-routes.ts`: `GET /api/lots` (vitrine) e `GET /api/lots/:id`.
- `apps/api/test/lots.test.ts` (31 testes + 1 pendente).

### Regras (para defender)

- **Criação:** o leiloeiro envia só `externalId`, centavos e datas. Título, imagem e atributos vêm do museu; o dono vem da sessão. Campos extras são recusados.
- **Datas:** formato ISO 8601 com fuso, guardadas em UTC. Início entre 5 min atrás e 90 dias à frente; duração de 2 min a 30 dias.
- **Estado:** calculado na hora (`CASE` com `now()` no PostgreSQL). Não existe coluna de status para ficar desatualizada. "Encerrado aguardando liquidação" aparece como `status: "ended"` e `settled: false`.
- **Vitrine:** ao vivo (fim mais próximo primeiro), agendados (início mais próximo) e encerrados (mais recentes); cancelados nunca aparecem.
- **Cancelamento:** só o dono, só sem lances, só antes do fim. A conferência acontece depois de bloquear a linha do lote (`FOR UPDATE`), o mesmo bloqueio que o lance usará; o banco ainda recusa cancelamento com lance por uma restrição própria.
- **Painel:** total recebido = soma dos créditos de liquidação na carteira do vendedor. Lances e reservas não contam como receita.

### Comandos e resultados reais

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` / `npm run lint` | Sem erros |
| `npx vitest run test/lots.test.ts` (1ª vez) | 29 passaram e 2 falharam: **defeito real**. `sum()` de BIGINT volta como NUMERIC, e o total recebido saía como texto (`"123450"`). Corrigido com `sum(...)::bigint`; regra anotada em `db/pool.ts` |
| `npm test` (depois da correção) | Uma execução teve 1 teste "durando" 920 s e falhando. Não se repetiu: sozinho passou em 0,4 s, e a suíte completa repetida em seguida passou. Com o limite de 30 s por teste, a duração indica o processo parado (provável suspensão da máquina ou do Docker), não um bloqueio no código |
| `npm test` (repetição) | **83 passaram + 1 pendente**, 6 arquivos, 30 s |
| `npm run build` | Ok |
| Ponta a ponta local (servidor compilado, API real do museu) | Criar lote com a obra 147016: 201 ao vivo; aparece na vitrine; cancelar: 200; some da vitrine; resumo do leiloeiro com total recebido 0 e 1 lote encerrado aguardando liquidação |

Casos cobertos pelos testes de lotes:
- **Criação:** dados da obra vindos do museu e dono da sessão; datas UTC com entrada em -03:00; título, imagem ou dono enviados pelo cliente recusados; 10 casos de valor ou formato inválido; 4 regras de data conferidas com o relógio do banco; obra inexistente (404), sem imagem (422) e museu fora (503) sem criar lote; licitante 403 e visitante 401.
- **Vitrine e estado:** separação dos grupos sem cancelados e sem dados pessoais; estado mudando só pelo horário.
- **Cancelamento:** sem lances (e repetido: 409); lote agendado; com lance (409, nada muda); lote encerrado (409); outro leiloeiro, licitante e lote inexistente.
- **Disputa real com o bloqueio:** uma transação "lance" segura o `FOR UPDATE`; o cancelamento espera; o lance é confirmado; o cancelamento recusa com `LOT_HAS_BIDS`.
- **Painel:** só os lotes do vendedor; total 0 com lance e reserva ativos; total = soma dos créditos de liquidação; licitante 403.

### Pendências

1. `it.todo` em `lots.test.ts`: cancelamento contra o primeiro lance pelo serviço de lances real (etapa 09).
2. Liquidação, resultado por lote e total recebido real (etapa 11).
3. Telas da vitrine e do painel (etapas 13 e 14).

### Deploy da etapa 07

Commit `d3985b7` enviado a pedido do candidato; nova versão no ar por volta de 02:59:39 UTC. Verificado de fora, sem credenciais:
- a vitrine pública mostra o lote do seed ao vivo, sem dados pessoais;
- criar, cancelar e o painel sem login respondem 401;
- cancelar vindo de outro site responde 403;
- o lote do seed segue ao vivo.

Detalhes em `docs/DEPLOY.md`.

## Etapa 08 — Carteira e depósitos (29/10/2026, concluída localmente)

Requisito relacionado: R07 (carteira, comprometido, disponível, depósito simulado).

### Arquivos

- `apps/api/src/modules/wallet/ledger.ts`: `lockWallets` (bloqueio em ordem de `user_id`) e `readBalance` (total, comprometido e disponível). Protocolo de bloqueio descrito no topo do arquivo.
- `apps/api/src/modules/wallet/service.ts` e `routes.ts`: `GET /api/wallet` e `POST /api/wallet/deposits`, só para licitante.
- `apps/api/src/shared/idempotency.ts`: `withIdempotency`, `requireIdempotencyKey` e `requestFingerprint` (reaproveitáveis pelo lance).
- `apps/api/src/shared/money.ts`: limites, `centsSchema` e `formatBrl`. As rotas de lotes passaram a usar o mesmo `centsSchema`.
- Testes: `apps/api/test/wallet.test.ts` (22) e `apps/api/test/money.test.ts` (15).

### Exemplo do enunciado: R$ 1.000 e uma reserva de R$ 100

| Momento | Total | Comprometido | Disponível |
| --- | --- | --- | --- |
| Depósito simulado de R$ 1.000,00 | 100000 | 0 | 100000 |
| Lidera um lote com R$ 100,00 (reserva) | 100000 | 10000 | 90000 |

- O **total** só muda com depósito e liquidação; reservar não debita.
- O **comprometido** é a soma das reservas do usuário em **todos** os lotes; com outra reserva de R$ 250,00 em outro lote, ficaria 35000 comprometido e 65000 disponível.
- O **disponível** é sempre total − comprometido, e nunca fica negativo, porque o lance (etapa 09) só reserva o que cabe no disponível, com a carteira bloqueada.
- Os valores trafegam em centavos inteiros: 100000 = R$ 1.000,00.

### Depósito e idempotência (para defender)

1. O navegador manda o valor em centavos e um cabeçalho `Idempotency-Key` gerado para aquela ação.
2. Numa única transação: grava a chave (se já existir, espera a outra requisição terminar), bloqueia a carteira, grava o lançamento `deposit` com `operation_key` única, soma no total e grava a resposta junto com a chave.
3. Repetição com a mesma chave e o mesmo valor: devolve a mesma resposta, com o cabeçalho `Idempotent-Replayed: true`, sem depositar de novo. Com outro valor: 409.
4. Limites: até R$ 100.000,00 por depósito e saldo total até R$ 10.000.000,00 (422 se passar). Até 20 depósitos por minuto por usuário.
5. Nenhum evento em tempo real foi criado: a carteira privada via socket depende da autenticação do socket (etapa 12).

### Comandos e resultados reais

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` / `npm run lint` | Sem erros |
| `vitest run test/wallet.test.ts test/money.test.ts` (1ª vez) | 36 de 37: falhou "8 requisições simultâneas com a mesma chave". **Não houve depósito duplicado**: a resposta original e as repetidas tinham as mesmas informações em ordem diferente de chaves (o JSONB reordena). Corrigido: a primeira resposta também passa a vir do registro gravado |
| O mesmo grupo de testes 3 vezes seguidas | 5/5 em cada execução |
| `npm test` | **120 passaram + 1 pendente**, 8 arquivos, 44 s |
| `npm run build` | Ok |

Casos cobertos:
- **Consulta:** carteira nova zerada e marcada como simulada; exemplo de R$ 1.000 com reserva de R$ 100 (90000 disponível); reservas em dois lotes somadas; id de outro usuário na URL ou no corpo sem efeito; leiloeiro 403 e visitante 401.
- **Depósito:** lançamento e total juntos, com total = soma dos lançamentos; 8 valores inválidos (zero, negativo, decimais, texto, "NaN", nulo, acima do limite, 1e20); corpo vazio e JSON com `Infinity`; chave ausente ou inválida; limite de saldo (422) sem gravar lançamento nem chave.
- **Idempotência:** repetição sequencial; mesma chave com outro valor (409); chave por usuário; **8 requisições simultâneas com a mesma chave = 1 lançamento**; **8 simultâneas com chaves diferentes = 8 lançamentos, sem perder atualização**.
- **Dinheiro:** `formatBrl` e `centsSchema`.

### Pendências

1. O lance (etapa 09) precisa usar `lockWallets`, `readBalance` e `withIdempotency`.
2. Débito e crédito da liquidação (etapa 11) com `lockWallets`.
3. Tela da carteira e conversão do valor digitado em reais para centavos por texto (etapas 13 e 15).
4. Evento privado `wallet.updated` só depois da autenticação do socket (etapa 12).

### Deploy da etapa 08

Commit `63d97a7` enviado a pedido do candidato; nova versão no ar por volta de 03:21:44 UTC. Verificado de fora, sem credenciais:
- carteira e depósito sem login: 401;
- depósito vindo de outro site: 403;
- depósito como formulário: 415;
- health e vitrine: 200.

Detalhes em `docs/DEPLOY.md`.

## Etapa 09 — Lances transacionais (29/10/2026, concluída localmente)

Requisitos relacionados: R07 (reserva e liberação), R08 (regras de lance) e R09 (prorrogação). Base para R13 (cadeia de hashes) sem concluí-lo.

### Arquivos

- `apps/api/src/modules/bids/rules.ts`: regras puras (`validateBid`, `minimumNextBid`, `extendedEnd`).
- `apps/api/src/modules/bids/service.ts`: `placeBid`, a transação completa.
- `apps/api/src/modules/bids/routes.ts`: `POST /api/lots/:id/bids` (só licitante, `Idempotency-Key`) e `GET /api/lots/:id/bids` (histórico público).
- `apps/api/src/modules/audit/chain.ts` (cadeia v1) e `recorder.ts` (contrato para a etapa 10).
- `apps/api/src/modules/realtime/events.ts`: evento `bid.accepted` publicado depois do commit (a etapa 12 liga o Socket.IO).
- `lots/queries.ts`: `leaderAlias` no formato público. `db/seed-data.ts`: horários em milissegundos.
- Testes: `test/bid-rules.test.ts` (16) e `test/bids.test.ts` (29). O `it.todo` da etapa 07 virou teste real.

### A transação do lance (ordem)

1. Grava a chave de idempotência (repetição simultânea espera aqui).
2. `SELECT ... FROM lots ... FOR UPDATE` e leitura do líder anterior.
3. `lockWallets`: carteiras do licitante e do líder anterior, em ordem de `user_id`.
4. Relógio do banco **depois** dos bloqueios; releitura do saldo (`readBalance`).
5. Validação: cancelado, não iniciado, encerrado (fim exclusivo), líder, mínimo, saldo. Recusa = `ROLLBACK`; nada muda.
6. Grava o lance (seq, alias, valor, horário, `bidder_ref`, `prev_hash`, `hash`); a reserva do lote passa ao novo líder (a do anterior é liberada); atualiza líder, contagem, versão e fim (`GREATEST`).
7. `COMMIT`; depois, `afterCommit` da auditoria e o evento.

### Resultado permitido em cada disputa (todas testadas com disputa real)

Nos testes, uma transação externa segura o bloqueio e só libera quando `pg_stat_activity` mostra todas as requisições paradas esperando. Isso prova conexões separadas disputando o mesmo bloqueio, não execução em série numa conexão só.

| Disputa | Resultado permitido | Por quê |
| --- | --- | --- |
| Duas ofertas iguais (= inicial) | Uma 201 e a outra 422 `BID_BELOW_MINIMUM` (3 rodadas) | O bloqueio do lote serializa; a segunda já vê o novo mínimo |
| Ofertas diferentes (R$ 100 e R$ 150) | (as duas aceitas, líder R$ 150) **ou** (R$ 150 aceita e R$ 100 recusada); nunca líder menor (4 rodadas) | A ordem de chegada ao bloqueio decide; os valores aceitos são sempre crescentes |
| Mesmo cliente, dois lotes, saldo para um | Um 201 e o outro 422 `INSUFFICIENT_FUNDS`; disponível nunca negativo (3 rodadas) | A carteira é bloqueada; o segundo relê as reservas do primeiro |
| Líder mandando dois lances juntos | Só um entra; o outro `ALREADY_LEADING` ou abaixo do mínimo | O segundo já encontra o próprio licitante como líder |
| 4 pedidos com a mesma chave | 1 lance; 4 respostas idênticas | Índice único da chave de idempotência |
| Lances cruzados em dois lotes | Os dois aceitos, sem deadlock | Carteiras sempre bloqueadas em ordem de `user_id` |
| Lance enviado antes do fim, bloqueio liberado depois do fim | 422 `LOT_ENDED`, nada muda | O relógio é lido depois do bloqueio |
| O mesmo, liberado antes do fim | 201 e prorrogação | Faltavam menos de 120 s |
| Cancelamento × primeiro lance | Sempre exatamente um vence (4 rodadas) | Os dois bloqueiam a linha do lote |

### Defeitos encontrados e corrigidos

1. **Microssegundos (defeito real de produção):** o PostgreSQL guarda microssegundos e o JavaScript só milissegundos. Sem prorrogação, o serviço regravava o fim lido no JS, alguns µs menor que o original. O banco recusou (`lots_end_never_before_original`) e o lance dava 500; isso aconteceria com o lote do seed em produção. Corrigido com `GREATEST(ends_at, $4)` no SQL e horários do seed em milissegundos. Teste de regressão incluído.
2. **Testes que não disputavam de verdade:** o `supertest` só envia a requisição quando alguém a aguarda, então a "corrida" não acontecia, e o bloqueio de teste não era liberado quando a espera falhava (os testes seguintes travavam). Corrigido com `Promise.resolve(...)` e `try/finally`.

### Comandos e resultados reais

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` / `npm run lint` | Sem erros (1 erro de tipo em `req.params` corrigido) |
| `vitest run test/bid-rules.test.ts test/bids.test.ts` (1ª vez) | Vários 500 e timeouts: os dois defeitos acima |
| O mesmo após as correções | **45 de 45** |
| `npm test` | **165 de 165**, 10 arquivos, 61 s |
| `npm run build` | Ok |
| Ponta a ponta local no lote do seed (fim `01:44:50.003005`, microssegundos) | cliente1 R$ 500 (201, R$ 500 comprometidos); cliente2 cobre com R$ 550 (201); a reserva do cliente1 volta a 0; cliente2 cobrindo a si mesmo: 422 `ALREADY_LEADING`; histórico público só com pseudônimos |

### Pendências (o produto ainda não está pronto)

1. **Auditoria (etapa 10):** checkpoint assinado, âncora independente, verificação e testes de adulteração. Hoje todo lance sai com `audit.status: "pending"`.
2. **Encerramento e liquidação (etapa 11):** nada debita o vencedor ainda.
3. **Tempo real (etapa 12):** o evento existe, mas ninguém escuta.
4. As recusas de negócio não são guardadas na idempotência: repetir a mesma chave depois de uma recusa reavalia o lance (seguro, porque a recusa não mudou nada).

### Deploy da etapa 09

Commit `58adfdf` enviado a pedido do candidato; nova versão no ar por volta de 06:03:06 UTC. Verificado de fora, sem credenciais:
- histórico público de lances: 200;
- lance sem login: 401; vindo de outro site: 403; como formulário: 415;
- lote inexistente: 404;
- lote do seed ao vivo.

Confirmação opcional em produção, feita pelo candidato. Cria um lance real de R$ 500,00 do cliente1 no lote do seed:

```powershell
$B='https://verzel-leiloes-ricardo.onrender.com'; Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$B/api/auth/login" -ContentType 'application/json' -Headers @{ Origin=$B } -Body '{"email":"cliente1@example.com","password":"leilao-demo-2026"}' -SessionVariable s | Out-Null; $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$B/api/lots/7a350b42-e23a-4a0a-942d-9b808a1656c5/bids" -ContentType 'application/json' -Headers @{ Origin=$B; 'Idempotency-Key'=[guid]::NewGuid().ToString() } -Body '{"amountCents":50000}' -WebSession $s; $r.StatusCode; $r.Content
```

Esperado: `201` e um JSON com `bid.amountCents: 50000` e `wallet.committedCents: 50000`.

## Etapa 10 — Integridade do histórico e âncora (29/10/2026, concluída localmente)

Requisitos relacionados: R13 (auditoria) e R14 (sem dados pessoais na auditoria).

### Antes do código

`docs/AUDITORIA.md` foi escrito primeiro: modelo de ameaça, técnica e por que não blockchain, protocolo entre banco e âncora, matriz de falhas, regras de cada estado, operação e limites.

### Arquivos

- `apps/api/migrations-anchor/1793250000000_anchor-entries.sql`: tabela da âncora com gatilho que recusa `UPDATE`, `DELETE` e `TRUNCATE`.
- `apps/api/src/modules/audit/`: `keys.ts` (Ed25519, troca de chave), `anchor.ts` (adaptador com timeout), `verify.ts` (verificação pura), `service.ts` (checkpoint na transação, âncora pós-commit, reconciliador, verificação global), `routes.ts` (`GET /api/lots/:id/audit`, `GET /api/audit/public-key`), `keygen.ts`, `check.ts`.
- `recorder.ts`: o contrato da etapa 09 agora é implementado de verdade; o serviço de lance **exige** o componente de integridade.
- `config.ts`: `AUDIT_SIGNING_PRIVATE_KEY` (obrigatória), `AUDIT_KEY_VERSION`, `AUDIT_PREVIOUS_PUBLIC_KEYS`, `ANCHOR_DATABASE_URL` (obrigatória em produção), `ANCHOR_TIMEOUT_MS`, `AUDIT_RECONCILE_INTERVAL_MS`.
- `server.ts`: migrações da âncora no startup, reconciliador no startup e a cada 30 s, encerramento fecha a âncora.
- Comandos: `db:migrate:anchor`, `db:migrate:anchor:test`, `audit:keygen`, `audit:check`.
- Testes: `test/audit.test.ts` (27); helpers com chave gerada na hora, âncora de teste e âncora "fora do ar".
- `apps/api/.env` local: chave de desenvolvimento gerada direto no arquivo (valor não exibido) e URLs das âncoras locais. `render.yaml` e `.env.example` atualizados.

### Comandos e resultados reais

| Comando | Resultado |
| --- | --- |
| `npm run db:migrate:anchor` / `:test` | Criou `verzel_anchor` e `verzel_anchor_test` e aplicou a migração; repetido: nada pendente |
| `UPDATE`, `DELETE` e `TRUNCATE` na âncora (psql) | Recusados: "anchor_entries é somente inserção" |
| `vitest run test/audit.test.ts` (1ª vez) | 24 de 27: as 3 falhas eram nos **scripts de ataque** (as restrições do banco recusaram ataques mal montados; um deles perdia microssegundos ao restaurar o término). Corrigidos os ataques, sem mexer na verificação |
| O mesmo depois | **27 de 27** |
| Checagem da âncora desligada de propósito | 3 testes falharam (remoção da cauda, histórico inteiro, rollback); código restaurado |
| `npm test` | **192 de 192**, 11 arquivos, 80 s |
| `npm run typecheck` / `npm run lint` / `npm run build` | Ok |
| Ponta a ponta local (servidor compilado, `verzel_dev` + `verzel_anchor`) | Lote do seed com 2 lances da etapa 09: VERIFICAÇÃO INDISPONÍVEL ("registrados antes da auditoria"); lote novo: ÍNTEGRO sem lances e ÍNTEGRO com 2 lances (2 assinados, 2 ancorados); chave pública publicada |
| `npm run audit:check -w apps/api` | 3 ÍNTEGRO, 1 INDISPONÍVEL; nenhum lote da âncora ausente no banco |

### Limites (o que ainda passa), também em `docs/AUDITORIA.md` §8

1. Remover um lance **ainda não ancorado** (janela entre o commit e a âncora) junto com o checkpoint dele.
2. Inserir o primeiro lance falso num lote sem nenhuma evidência: aparece INDISPONÍVEL, não ADULTERADO.
3. Apagar o lote inteiro só é detectado pela verificação global (`audit:check`).
4. Quem controla o servidor (chave e credencial da âncora) está fora do modelo.

### Por que não blockchain

O objetivo é detectar mudanças feitas por quem tem acesso ao banco. Assinatura digital (só o servidor assina) mais uma cópia independente só de inserção (o banco principal não consegue apagar) resolvem isso. Consenso distribuído não acrescentaria garantia contra esse atacante.

### Pendências

1. **Configuração em produção** (ação do candidato, antes do push): chave, projeto Neon da âncora e variáveis no Render (`docs/DEPLOY.md`).
2. ~~A liquidação (etapa 11) precisa exigir auditoria ÍNTEGRA antes de pagar.~~ Feito na etapa 11.
3. Página pública da auditoria (etapa 16).

### Deploy da etapa 10

O candidato configurou a chave, a âncora (Neon) e as variáveis no Render. Commit `679e200` enviado; nova versão no ar às 06:35:02 UTC. Verificado de fora:
- chave pública Ed25519 publicada;
- auditoria do lote do seed: **ÍNTEGRO**, o que só acontece com a âncora alcançável;
- lote inexistente: 404;
- health: ok.

Detalhes em `docs/DEPLOY.md`.

Confirmação opcional de ponta a ponta em produção, feita pelo candidato. Cria um lance real de R$ 500,00 do cliente1 no lote do seed e depois mostra a auditoria:

```powershell
$B='https://verzel-leiloes-ricardo.onrender.com'; $L='7a350b42-e23a-4a0a-942d-9b808a1656c5'; Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$B/api/auth/login" -ContentType 'application/json' -Headers @{ Origin=$B } -Body '{"email":"cliente1@example.com","password":"leilao-demo-2026"}' -SessionVariable s | Out-Null; $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$B/api/lots/$L/bids" -ContentType 'application/json' -Headers @{ Origin=$B; 'Idempotency-Key'=[guid]::NewGuid().ToString() } -Body '{"amountCents":50000}' -WebSession $s; $r.StatusCode; (Invoke-RestMethod "$B/api/lots/$L/audit").audit | Select-Object statusLabel, bidCount, signedCount, anchoredCount, reason
```

Esperado: `201` e depois `ÍNTEGRO`, 1 lance, 1 assinado, 1 ancorado.

## Etapa 11 — Liquidação automática e comprovantes (29/10/2026, concluída localmente)

O backend agora encerra sozinho os lotes vencidos. Com vencedor: debita o vencedor, credita o leiloeiro e gera um comprovante público por token. Sem lances: fecha sem vencedor e sem cobrança. A liquidação só paga com a auditoria ÍNTEGRA.

### Arquivos

- `apps/api/migrations/1793260000000_settlement-issues.sql`: tabela `settlement_issues` (lote vencido não liquidado e o motivo) e índice único da referência do comprovante.
- `apps/api/src/modules/settlement/service.ts`: `settleLot` (auditoria e transação), `recordSettlementIssue` e formato do comprovante.
- `apps/api/src/modules/settlement/job.ts`: job de encerramento (startup e a cada 5 s).
- `apps/api/src/modules/settlement/routes.ts`: `GET /api/receipts/:token` (público) e `GET /api/me/participations` (licitante).
- `apps/api/src/modules/lots/queries.ts`: participações (posição e resultado); lotes do leiloeiro com link do comprovante e motivo de pendência; `settlementBlocked` no resumo.
- `apps/api/src/modules/bids/service.ts`: lote liquidado recusa lance (defesa extra).
- `apps/api/src/modules/realtime/events.ts`: evento `lot.closed`.
- `apps/api/src/server.ts`, `src/shared/config.ts`, `.env.example`: job ligado no startup e parado no desligamento; `SETTLEMENT_INTERVAL_MS` (padrão 5000).
- `apps/api/test/settlement.test.ts`: 18 testes. `test/helpers.ts` também limpa a tabela nova.

### A liquidação, em ordem

1. **Auditoria, fora da transação** (consulta a âncora, que é I/O externo). Só ÍNTEGRO segue. ADULTERADO, PENDENTE ou INDISPONÍVEL: nada é pago e o motivo vai para `settlement_issues`.
2. **Transação.** Bloqueia o lote e depois as carteiras do vencedor e do vendedor, em ordem de `user_id` (o mesmo protocolo do lance). Lê o relógio do banco depois dos bloqueios.
3. **Nada a fazer** se o lote já está liquidado ou cancelado, ou se o relógio ainda é anterior ao fim (o último lance pode ter prorrogado). Se o lote bloqueado não é o mesmo que a auditoria aprovou (entrou outro lance no meio), tenta de novo no próximo ciclo.
4. **Com vencedor:** remove a reserva, debita o total do vencedor, credita o vendedor, grava os dois lançamentos (`settlement:<lote>:debit` e `:credit`), a liquidação e o comprovante. **Sem lances:** só a liquidação.
5. Apaga a pendência, sobe a versão do lote e faz COMMIT. Só então publica `lot.closed`.

Defesas no próprio banco, se o código falhar: lote como chave primária em `settlements` e `receipts`; `operation_key` única; total da carteira nunca negativo; token único com pelo menos 32 caracteres; referência única.

### Exemplo do guia (teste automatizado "exemplo do guia")

| Momento | A (total / comprometido / disponível) | B | Leiloeiro (total) |
| --- | --- | --- | --- |
| Depósitos de R$ 1.000 | 1.000 / 0 / 1.000 | 1.000 / 0 / 1.000 | 0 |
| A lidera com R$ 100 | 1.000 / 100 / 900 | 1.000 / 0 / 1.000 | 0 |
| B cobre com R$ 120 | 1.000 / 0 / 1.000 | 1.000 / 120 / 880 | 0 |
| Liquidação | 1.000 / 0 / 1.000 | 880 / 0 / 880 | 120 |

### O que os 18 testes provam (PostgreSQL e âncora de teste reais, relógio injetado)

- **Fechamento normal:** totais do exemplo do guia, os 2 lançamentos, a liquidação, o comprovante, o lote público e o resumo do leiloeiro (R$ 120 recebidos). Evento publicado uma vez.
- **Sem lances:** fecha sem vencedor, sem cobrança e sem comprovante.
- **Fim exclusivo:** 1 ms antes do fim não liquida; exatamente no fim liquida. **Lote cancelado:** não liquida.
- **Repetição:** rodar o job de novo ou chamar a liquidação outra vez não muda nada.
- **Dois executores ao mesmo tempo** (como dois servidores), parados no mesmo bloqueio: uma única liquidação.
- **Último lance antes da liquidação:** o lance entra 1 ms antes do fim e prorroga; a liquidação, na fila logo atrás, encontra o novo fim e não fecha; depois do novo fim, o novo líder vence.
- **Liquidação antes do último lance:** o lote fecha e o lance é recusado (`LOT_ENDED`) sem mudar nada. Mesmo com um relógio "antes do fim", lote liquidado não aceita lance.
- **Falha parcial:** um gatilho só no banco de teste derruba o INSERT do comprovante (a última escrita). Tudo é desfeito; fica a pendência `failed` com motivo genérico. Um novo executor ("reinício") liquida uma vez e apaga a pendência.
- **Startup:** lote que venceu com o servidor parado é liquidado pela execução imediata do job, com intervalo de 10 min.
- **Auditoria:** histórico ADULTERADO não é liquidado (motivo visível ao leiloeiro, tentativas contadas); âncora fora do ar (INDISPONÍVEL) espera e liquida quando volta; checkpoint ainda não ancorado (PENDENTE) espera a reconciliação.
- **Comprovante:** abre sem login; sem email, ids de usuário, saldo ou sessão; snapshot imutável (mudar a obra depois não muda o comprovante); token inválido ou desconhecido recebe 404 sem detalhes; a API pública do lote não expõe o token.
- **Participações:** posição e resultado ao vivo (liderando, superado), aguardando liquidação e depois (venceu, perdeu); link do comprovante só para o vencedor e para o leiloeiro; só licitante logado.

### Comandos e resultados reais

| Comando | Resultado |
| --- | --- |
| `npm run db:migrate` e `db:migrate:test` | Migração `1793260000000_settlement-issues` aplicada nos dois bancos locais |
| `npx vitest run test/settlement.test.ts` | **18 de 18** |
| `npm test` | **210 de 210**, 12 arquivos |
| `npm run typecheck` / `npm run lint` / `npm run build` | Ok |
| Ponta a ponta local (`tsx src/server.ts` com `verzel_dev` e `verzel_anchor`) | Lote de 2 min criado com `db:demo-lot`; lance real do cliente1 (R$ 500,00) pela API prorrogou o fim. O job liquidou **2,7 s depois do fim**, sem tela aberta: carteira do cliente1 9.500 / 0 / 9.500 com o lançamento `settlement_debit`; participação `won` com link; comprovante 200 sem login (`no-store`, `noindex`, referência `LIQ-…`, auditoria `intact`, nenhum email); resumo do leiloeiro com R$ 500,00 recebidos e 1 lote vendido. No startup, o job também liquidou um lote antigo do banco local, vencido sem lances (recuperação após o servidor parado) |

### Ajustes durante a etapa

- A primeira versão da migração (ainda vazia, só nos bancos locais) foi desfeita e refeita para incluir falhas inesperadas e a referência única; um índice duplicado do esquema inicial foi retirado.
- Os testes começaram com lotes de 60 s, e o lance real (com menos de 2 min restantes) prorrogava o fim. O auxiliar passou a criar lotes de 10 min.

### Limites e decisões para defender

- **Atraso:** o job roda a cada 5 s. No Render gratuito, enquanto o serviço dorme, nada roda; ao acordar, o ciclo do startup liquida o que venceu.
- **Auditoria pendente:** se a âncora estava fora do ar no lance, a liquidação espera o reconciliador (a cada 30 s).
- **Lances antigos sem checkpoint** (anteriores à etapa 10) deixam o lote INDISPONÍVEL; ele não é liquidado e o motivo aparece para o leiloeiro. No banco local, o lote do seed tem 2 lances assim.
- **Comprovante** nesta etapa é JSON; a página HTML vem na etapa 16 (PDF não foi exigido).

### Deploy da etapa 11

Commit `8b0b36b` enviado às 14:20:15 UTC; nova versão no ar às 14:21:30 UTC (`/api/me/participations` passou de 404 para 401). A migração de `settlement_issues` rodou no startup sem erro (o servidor não sobe se ela falhar). Nenhuma variável nova foi necessária. Verificado de fora:
- comprovante com token desconhecido ou malformado: 404 em JSON, "Comprovante não encontrado.";
- participações sem login: 401;
- health: ok; página inicial: 200; lote do seed continua ao vivo, sem liquidação.

Detalhes em `docs/DEPLOY.md`.

### Pendências

1. Socket.IO (etapa 12) deve repassar `lot.closed`: a parte pública para a sala do lote; o link do comprovante só para o vencedor e o leiloeiro.
2. Telas: painel do leiloeiro (14), participações (15) e comprovante (16).
3. Ver uma liquidação real em produção: o lote do seed termina em cerca de 10 dias; a etapa 21 cria lotes curtos de demonstração.

## Etapa 12 — Tempo real e reconexão (29/10/2026, concluída localmente)

Socket.IO no mesmo servidor HTTP da API (mesma porta e origem). Ele só **projeta** o que já foi gravado: lance, depósito, cancelamento e liquidação continuam nas rotas e serviços transacionais. O HTTP é sempre a fonte da verdade; a tela se recupera por ele.

### Arquivos

- `apps/api/src/modules/realtime/socket.ts` (novo): servidor Socket.IO, conferência de origem, sessão pelo cookie no handshake, salas, projeção dos eventos e conferência periódica das sessões.
- `apps/api/src/modules/realtime/events.ts`: eventos novos `lot.changed` (cancelamento), `wallet.changed` (depósito) e `session.revoked` (logout, só com o hash do token).
- `apps/api/src/modules/lots/service.ts`, `wallet/service.ts`, `auth/routes.ts`: publicam esses eventos depois do COMMIT (depósito repetido por idempotência não publica).
- `apps/api/src/modules/lots/queries.ts`: lote público agora expõe `version`.
- `apps/api/src/server.ts`: liga o Socket.IO e fecha as conexões no desligamento.
- `apps/api/test/realtime.test.ts` (novo): 14 testes com servidor e clientes reais.
- `apps/web/src/realtime/` (novo): `lot-sync.ts` (regras puras de versão, lacuna, prorrogação e relógio), `socket.ts` (conexão única), `useLiveLot.ts`, `useMyWallet.ts`, `useConnectionStatus.ts`, `types.ts` e `lot-sync.test.ts` (15 testes).
- `apps/web/src/pages/LotPage.tsx` (rota `/lotes/:id`), `components/Countdown.tsx`, `components/ConnectionBadge.tsx`, `format.ts` e estilos: sala ao vivo mínima. Visual definitivo e formulário de lance nas etapas 13 e 15.
- Dependências: `socket.io` 4.8.4 (API), `socket.io-client` 4.8.4 (web e testes da API), `vitest` 5.0.5 (web). `npm test` na raiz roda os testes da API e do web.

### Protocolo

| Sala | Quem entra | Eventos |
| --- | --- | --- |
| `lot:{id}` (pública) | qualquer conexão, até visitante, pedindo `lot.subscribe` (o servidor confere que o lote existe; até 30 salas por conexão) | `bid.accepted` (seq, pseudônimo, valor, horário, status da âncora), `lot.extended` (novo fim), `lot.updated` (resumo relido do banco), `lot.closed` (resultado) |
| `user:{id}` (privada) | só o servidor coloca, pelo cookie de sessão do handshake | `wallet.updated` (saldo + `asOf`), `bid.outbid`, `lot.won` e `lot.sold` (link do comprovante) |
| conexão | — | `session.state` ao conectar; `session.ended` quando a sessão é revogada ou expira |

- **Origem:** handshake com `Origin` de outro host é recusado (`allowRequest`). O WebSocket não passa por CORS, então essa conferência é necessária. Clientes sem navegador (sem `Origin`) passam, como nas rotas HTTP.
- **Sessão:** logout tira a conexão da sala privada na hora; sessão expirada sai na conferência periódica (a cada 60 s). A conexão continua como visitante.
- **Ordem:** todo evento sai depois do COMMIT. O lance é projetado depois do `afterCommit` da auditoria. `version` cresce a cada mudança do lote; `lot.updated` relê o banco, então a versão dele nunca é menor que a do evento que o gerou.
- **Cliente:** busca `GET /api/lots/:id` e `/bids` ao abrir, ao (re)entrar na sala, ao voltar o foco para a aba, ao perceber lacuna (`seq` pulado ou `bidCount` maior que o histórico) e a cada 15 s enquanto o tempo real está fora. Descarta evento com versão menor. O cronômetro usa a diferença para o horário do servidor (meio da requisição) e recalcula quando o fim muda; ele não aceita nem encerra nada. No fim do prazo, a tela pergunta o novo status ao servidor; vencido sem liquidação, consulta a cada 10 s.
- **Uma instância:** as salas vivem na memória do processo. Várias instâncias exigiriam um adapter do Socket.IO (ex.: Redis) e coordenação extra, fora do escopo.

### O que os testes provam

API (`realtime.test.ts`, servidor HTTP real em porta livre, clientes `socket.io-client` reais, PostgreSQL e âncora de teste reais; lances, depósitos e cancelamento pelas rotas HTTP):
- dois clientes (visitante e licitante) recebem lance, prorrogação e resumo com o mesmo novo fim da resposta HTTP, sem email, ids, token ou saldo;
- versões crescentes; cancelamento e encerramento chegam à sala; comprovante só para vencedor e leiloeiro;
- carteira e aviso de superado só para o dono; depósito atualiza a carteira;
- tentativa de entrar na sala alheia (eventos inventados, `user:<id>` e id de usuário como lote): no servidor o socket continua só na própria sala, e o saldo do outro não chega;
- cookie forjado e sessão expirada entram como visitante; logout e expiração encerram a sala privada;
- origem de outro site recusada;
- lance aceito durante a desconexão: o evento se perde e o estado volta pelo HTTP ao reconectar; falha na projeção depois do COMMIT não desfaz o lance.

Web (`lot-sync.test.ts`): evento antigo descartado, lacuna pede snapshot, prorrogação nunca volta o fim, resposta HTTP atrasada não apaga estado mais novo, diferença de relógio e saldo fora de ordem.

### Comandos e resultados reais

| Comando | Resultado |
| --- | --- |
| `npx vitest run test/realtime.test.ts` | **14 de 14** (2 falhas iniciais eram do teste: status calculado pelo relógio real e restrição `sessions_expiry_after_creation`) |
| `npm test` (raiz) | **224 de 224** na API (13 arquivos) e **15 de 15** no web |
| `npm run typecheck` / `npm run lint` / `npm run build` | Ok (o lint pegou 4 erros nas regras de efeito do React; corrigidos) |
| Duas abas do navegador em `http://localhost:3100/lotes/<lote de 3 min>` | Lance do cliente1 pela API apareceu nas duas sem recarregar; lance do cliente2 com 1:54 restantes levou o fim de 11:44:24 para 11:44:30 nas duas, com o aviso "Prorrogado"; o job liquidou e as duas mostraram "Vencedor: LIC-670E1A por R$ 110,00" |
| Sala privada no navegador (cliente2 logado na aba, lote de 8 min) | Lance próprio: reservado de R$ 550,00 para R$ 650,00; cliente1 cobriu: "Você foi superado neste lote" e reservado de volta a R$ 550,00. Logout numa aba tirou a carteira da outra na hora |
| Queda e reconexão no navegador | Servidor da aba (3100) parado; um lance aceito por uma segunda instância (3101) no mesmo banco. A aba mostrou "sem conexão", erro na atualização e o estado antigo. Servidor religado: as abas reconectaram sozinhas e mostraram o lance perdido (R$ 120,00, 3 lances) e o saldo novo |

### Limites e decisões para defender

- O evento perdido nunca é reenviado: a recuperação é sempre o snapshot HTTP.
- Ao parar uma tarefa em segundo plano, o processo Node filho do `npx tsx` continuou vivo nas portas 3100 e 3101; foram encerrados conferindo a linha de comando. Um processo igual (`tsx src/server.ts`, iniciado às 03:53) continua na porta 3000, provavelmente de uma sessão anterior. Não foi encerrado sem confirmação do candidato.
- A sala ao vivo desta etapa é funcional e simples; posição do usuário, formulário de lance e visual ficam para as etapas 13 e 15 (R06 continua em andamento).

### Deploy da etapa 12

Commit `b8d5eea` enviado às 15:05:21 UTC; nova versão no ar às 15:06:22 UTC (`/socket.io` passou a responder o handshake). Verificado de fora, sem credenciais:
- cliente `socket.io-client` como visitante conectou por **WebSocket** através do proxy do Render, recebeu `session.state` sem login e entrou na sala do lote do seed; lote inexistente: `NOT_FOUND`;
- conexão com `Origin` de outro site: recusada;
- `/lotes/<lote do seed>` no navegador: "Ao vivo", contagem pelo horário do servidor e lote público com `version`;
- health: ok.

Ainda não verificado em produção: lance e sala privada com usuário logado (exigem login; o candidato pode testar abrindo a sala em duas abas e dando um lance).

### Pendências

1. Etapa 13: base visual e navegação (vitrine com links para `/lotes/:id`, login). A sala chama `/api/auth/me` também para visitante e o navegador registra dois 401 no console (tratados, sem efeito na tela); com a sessão no app (etapa 13), a chamada deve sair só para quem está logado.
3. Etapa 15: formulário de lance, posição do usuário e indicadores definitivos na sala.

## Etapa 13 — Base visual e navegação (29/10/2026, concluída localmente)

Base visual de uma casa de leilões de arte, em português, com CSS próprio (sem biblioteca de layout) e sessão real. As skills `frontend-design` e `Superdesign`, pedidas pelo candidato para as etapas 13 a 16, continuam indisponíveis nesta sessão; o visual foi feito à mão seguindo o prompt (legibilidade, valores e estados primeiro).

### O que foi implementado

- **Sessão real** (`auth/AuthContext.tsx`, `auth/useAuth.ts`): `/api/auth/me` ao abrir; login, cadastro e logout pela API; depois de cada um, a conexão em tempo real é refeita para o servidor reler o cookie. Logout em outra aba (`session.ended`) também atualiza a navegação.
- **Cliente HTTP central** (`api/client.ts`): mesma origem, cookie, JSON, `Idempotency-Key` opcional, 204, e erro com `status`, `code`, mensagem e `details.fields`. `api/useApi.ts` dá carregando, erro e recarregar às telas de leitura.
- **Navegação por papel** (`App.tsx`): Vitrine e Sobre para todos; Carteira e Participações para licitante; Painel para leiloeiro; pseudônimo, papel e Sair no cabeçalho. `RequireRole` é só proteção visual: sem login leva a `/entrar?next=...` (só caminhos internos); papel errado vê "Área restrita". A API continua recusando (conferido: `GET /api/seller/lots` como licitante → 403 `FORBIDDEN`).
- **Rotas:** `/` vitrine, `/entrar` (login e cadastro com escolha de papel), `/lotes/:id` sala, `/lotes/:id/auditoria`, `/comprovantes/:token`, `/carteira`, `/participacoes`, `/painel`, `/sobre` e 404.
- **Vitrine** (`pages/ShowcasePage.tsx`, `realtime/useShowcase.ts`, `components/LotCard.tsx`): ao vivo, agendados e encerrados, com imagem, título, autoria, data e técnica, valor atual ou inicial, contagem ou horário, número de lances e resultado. Cancelados ficam de fora (a API já filtra e um `lot.updated` cancelado tira o card). Busca de novo ao reconectar, ao voltar o foco, quando um prazo vence (agendado começa, ao vivo termina) e a cada 30 s sem tempo real; acompanha até 25 salas para atualizar os cards na hora; descarta versão menor.
- **Telas de leitura com dados reais:** carteira (total, reservado, disponível e últimos lançamentos; relê ao receber `wallet.updated`), participações (todos os lotes com lance, posição, resultado e link do comprovante na vitória), painel (total recebido, contagens, lotes do leiloeiro com resultado, pendência de liquidação e comprovante), auditoria (estado, motivo, histórico, "verificar de novo") e comprovante.
- **Partes de etapas seguintes marcadas como "Em construção"**, sem fingir: depósito e formulário de lance (etapa 15), busca, criação e cancelamento (etapa 14), explicação da auditoria e versão para imprimir do comprovante (etapa 16).
- **Componentes de estado** (`components/ui.tsx`): carregando, erro com "tentar de novo", vazio, aviso (info, sucesso, alerta, erro), pendência de etapa, cabeçalho de página e campo de formulário com label, dica e erro ligados por `aria-describedby`.
- **Formatação** (`format.ts`): BRL com `Intl.NumberFormat` a partir de texto decimal montado com inteiros (sem ponto flutuante; testado até R$ 1.000.000.000,99), datas com `Intl.DateTimeFormat` no fuso do navegador, que aparece junto do fim do lote; o transporte continua em centavos e UTC.
- **Acessibilidade:** link "Pular para o conteúdo", foco visível em tudo que é interativo, navegação por teclado (formulário testado com Tab e Enter), alvos de toque de 44 px, contraste AA nos textos e botões, `role="alert"` em erros, `prefers-reduced-motion` respeitado.
- **Imagem quebrada:** `ArtworkImage` (etapa 06) mostra o placeholder local com texto alternativo.
- **Correção da etapa 12:** a sala só busca a carteira de quem é licitante logado (antes chamava `/auth/me` para visitante). Continua existindo um 401 esperado de `/auth/me` para visitante ao abrir o app.

### Verificação no navegador (servidor local na porta 3100, banco `verzel_dev`, contas do seed só no localhost)

| Tamanho | O que foi conferido |
| --- | --- |
| 1280 × 900 | Vitrine com 3 ao vivo, agendados vazio ("Nenhum lote agendado.") e 6 encerrados (resultado ou "Sem lances"); cards alinhados (a primeira versão deixava a obra vertical esticar o card; corrigido). `/carteira` sem login → `/entrar?next=/carteira`; senha errada → "Email ou senha incorretos."; login certo → volta para a carteira, com Carteira, Participações, pseudônimo e Sair no menu. Carteira, participações (5 lotes, 1 arremate), comprovante, auditoria ÍNTEGRA e sala ao vivo com dados reais. `/painel` como licitante → "Área restrita". Sair → menu volta a Vitrine, Sobre e Entrar. Login do leiloeiro só com teclado → Painel com R$ 840,00 recebidos, 4 vendidos e a lista de lotes |
| 375 × 812 | Menu em segunda linha, vitrine em uma coluna, sala com imagem, título e painel empilhados, sem rolagem horizontal (`scrollWidth` 375 = `clientWidth` 375). Cadastro com email e senha inválidos mostra o erro de cada campo vindo da API (nenhuma conta criada) |

Ajuste feito durante a inspeção: o selo de conexão também dizia "Ao vivo", igual ao status do lote; agora diz "Tempo real conectado".

### Comandos e resultados reais

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` / `npm run lint` | Ok (o lint pediu separar o hook `useAuth` do componente, por causa do fast refresh) |
| `npm run build` | Ok (JS 340 kB, 106 kB com gzip) |
| `npm test` | **224 de 224** na API e **18 de 18** no web (3 novos de formatação de BRL e duração) |

### Deploy da etapa 13

Commit `63c7028` enviado às 16:15:29 UTC; novo frontend no ar às 16:16:39 UTC (o JavaScript servido passou a conter o texto novo). Verificado de fora, sem login:
- vitrine com as três seções (1 ao vivo, agendados e encerrados vazios) e "Tempo real conectado";
- `/carteira` sem login leva a `/entrar?next=/carteira`;
- auditoria do lote do seed: ÍNTEGRO;
- comprovante com token inexistente: "Comprovante não encontrado.";
- rotas da SPA (`/`, `/entrar`, `/carteira`, `/painel`, `/participacoes`, auditoria, comprovante) respondem 200; health ok.

Ainda não verificado em produção: telas com login (o candidato pode entrar com a própria conta).

### Pendências

1. Etapa 14: busca no acervo, criação e cancelamento no painel.
2. Etapa 15: depósito, formulário de lance, posição e indicadores definitivos na sala.
3. Etapa 16: auditoria explicada e comprovante para imprimir e compartilhar.
4. Nenhum lote agendado no banco local durante a inspeção: o card agendado só foi visto pelo estado vazio.

## Etapa 14 — Painel do leiloeiro (29/10/2026, concluída localmente)

Tela do leiloeiro ligada às rotas reais (`/api/catalog/search`, `POST /api/lots`, `POST /api/lots/:id/cancel`, `/api/seller/lots`, `/api/seller/summary`). Nenhuma mudança na API: as regras continuam no backend.

### Arquivos

- `apps/web/src/input-parsing.ts` (+ teste): `parseBrlToCents` (texto → centavos só com texto e inteiros: "1.234,56", "1234,56", "R$ 1.000", "1234.56"; recusa vírgula dupla, 3 casas, negativo, notação científica, zero e valores grandes demais) e `localInputToIso`/`toLocalInputValue`/`utcOffsetLabel` (hora local do formulário ↔ UTC).
- `apps/web/src/seller/CatalogSearch.tsx`: busca no acervo com imagem, título, autoria, data e técnica; "Mais resultados" e "Fim dos resultados"; avisa quando o resultado veio do cache; com o museu fora do ar mostra "Busca indisponível agora" só nessa parte.
- `apps/web/src/seller/CreateLotForm.tsx`: obra escolhida com fonte e licença, aviso de leilão simulado, lance inicial e incremento em R$ com prévia ("Será enviado como R$ 100,00"), início agora ou agendado, fim em `datetime-local` com o fuso do navegador e o horário em UTC visíveis. Validação de ajuda no navegador; os erros por campo da API (`details.fields`) aparecem em cada campo; envio protegido contra clique duplo.
- `apps/web/src/seller/SellerLotList.tsx`: só os lotes do leiloeiro (a API filtra pela sessão): estado, lance atual e líder, resultado (arrematado por quem e quanto, ou sem lances), pendência de liquidação, links de comprovante e auditoria. Botão "Cancelar lote" só em lote ao vivo ou agendado sem lances, com confirmação na tela; recusas da API (`LOT_HAS_BIDS`, `LOT_ENDED`, `LOT_ALREADY_CANCELLED`) viram mensagens claras; a lista é relida do servidor depois.
- `apps/web/src/pages/SellerPage.tsx`: resumo (total recebido só de vendas liquidadas, contagens), "Novo lote" e "Seus lotes". Acompanha as salas dos próprios lotes e a sala privada (`lot.sold`) para reler a lista sem recarregar.

### Verificação no navegador (servidores locais 3100, 3101 e 3102 no banco `verzel_dev`; contas do seed só no localhost)

| Cenário | Resultado |
| --- | --- |
| Login do leiloeiro | Vai para o Painel |
| Busca real "harbor" | 63 obras com imagem, vindas da API do museu |
| Valores inválidos ("dez reais", "1,234") | Erro em cada campo, nada enviado |
| Criação: R$ 100,00, R$ 10, começar agora, fim 13:27 (America/Sao_Paulo) | "Lote criado"; no banco `starting_bid_cents` 10000, `min_increment_cents` 1000 e fim `16:27:00Z` (UTC) |
| Lote novo na vitrine | Sim; o lote cancelado não aparece |
| Cancelar lote sem lance (com confirmação) | "Lote cancelado. Ele saiu da vitrine." e estado Cancelado |
| Cancelar com lance concorrente | Confirmação aberta; um lance entrou pela instância 3101 (a tela não foi avisada); ao confirmar, a API recusou e a tela mostrou "Não foi possível cancelar: o lote recebeu um lance..."; a lista foi relida com o lance e sem o botão |
| Museu fora do ar (instância 3102 com `CMA_API_BASE_URL` apontando para uma porta sem resposta) | Só a busca mostra "Busca indisponível agora"; resumo e lotes seguem normais |
| Resultado depois da liquidação | Lance real de R$ 100,00 do cliente1; após o fim, o painel mostrou "Arrematado por LIC-9E250C por R$ 100,00" e o total recebido foi de R$ 840,00 para R$ 940,00 (5 lotes vendidos) |
| Licitante | Tela: "Área restrita" (etapa 13). API direta como cliente1: criar lote, cancelar e buscar no acervo → 403 `FORBIDDEN` |
| 375 × 812 | Painel em uma coluna, sem rolagem horizontal |

Ajustes durante a verificação: o formulário aparecia abaixo dos 12 resultados (agora ocupa o lugar deles e "Trocar obra" volta aos mesmos resultados); o erro antigo de um campo continuava visível depois de corrigido (agora some ao editar).

### Comandos e resultados reais

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` / `npm run lint` / `npm run build` | Ok |
| `npm test` | **224 de 224** na API e **25 de 25** no web (7 novos de conversão de valores e datas) |

### Deploy da etapa 14

Commit `e6a097f` enviado às 16:42:00 UTC; novo frontend no ar às 16:43:01 UTC (o JavaScript servido passou a conter o texto novo do formulário). Verificado de fora, sem login:
- `/painel` leva a `/entrar?next=/painel`;
- busca no acervo, criação e cancelamento chamados direto sem sessão: 401 `UNAUTHENTICATED`;
- health: ok.

Teste em produção com login de leiloeiro (29/10/2026, autorizado pelo candidato; ele mesmo fez o login no navegador do app, a IA não digitou a senha):
- busca real "harbor": 63 obras;
- lote criado pela tela (R$ 100,00, incremento R$ 10, começar agora, fim 13:50 de Brasília): no servidor `startingBidCents` 10000, `minIncrementCents` 1000 e fim `2026-10-29T16:50:00.000Z`;
- segundo lote criado e cancelado com a confirmação da tela: "Lote cancelado. Ele saiu da vitrine."; `GET /api/lots` não o mostra mais;
- o primeiro lote terminou sem lances e o painel mudou sozinho, sem recarregar, para "Encerrado sem lances (sem vencedor)" (liquidação automática + tempo real em produção); total recebido R$ 0,00.

Ainda não verificado em produção: recusa de cancelamento com lance concorrente e liquidação com vencedor (exigem login de licitante).

### Limites e pendências

- A criação de lote não usa chave de idempotência (a API não pede); o botão fica desativado durante o envio. Uma repetição por perda de resposta criaria outro lote.
- Prettier aponta diferenças de estilo nos arquivos novos, como já acontecia em outros 70; o projeto não tem script de formatação e nada foi reformatado.
- Etapa 15: depósito, formulário de lance e indicadores definitivos da sala.

## Etapa 15 — Fluxo do licitante (29/10/2026, concluída localmente)

Carteira, depósito, sala de disputa e participações ligados às rotas e salas reais. Nenhuma mudança na API.

### Arquivos

- `apps/web/src/api/intent.ts`: `useIntentKey` (uma chave de idempotência por intenção; mesma chave para o mesmo pedido depois de resposta perdida, chave nova depois de resposta definitiva) e `isUncertain` (rede ou 5xx: não se sabe se gravou).
- `apps/web/src/bidder/DepositForm.tsx`: depósito simulado; botão travado durante o envio; resposta perdida vira "Depósito sem confirmação" com "Reenviar o mesmo pedido" (mesma chave); o saldo é sempre relido do servidor.
- `apps/web/src/bidder/BidForm.tsx`: valor em R$ convertido para centavos por texto; o campo acompanha o próximo mínimo do servidor até a pessoa digitar; recusas com título e a mensagem da API (abaixo do mínimo, saldo insuficiente, já está ganhando, não iniciado, encerrado, cancelado, sem permissão, sessão expirada, muitos lances); sucesso mostra o horário aceito e que o registro na auditoria ainda está pendente, avisando que liderar não é vitória; resposta perdida confere o histórico e oferece reenviar o mesmo pedido, sem reenvio automático. Avisos antigos somem quando o lote muda de versão.
- `apps/web/src/realtime/lot-sync.ts` (+ testes): `myPosition` (melhor lance aceito de cada participante; quem nunca ofertou não tem posição) e `myStanding` (ganhando, superado, aguardando, venceu, perdeu), sempre a partir do estado do servidor.
- `apps/web/src/pages/LotPage.tsx`: área pessoal com indicador, posição, saldo e, para o vencedor, o link do comprovante; formulário de lance só para licitante logado.
- `apps/web/src/pages/WalletPage.tsx`: explicação curta da reserva e o formulário de depósito.
- `apps/web/src/components/CopyLinkButton.tsx` e `pages/ParticipationsPage.tsx`: "Copiar link para compartilhar" do comprovante; se a área de transferência for negada, mostra o link para copiar à mão.
- `apps/web/src/realtime/useMyWallet.ts`: sem avisos por evento (o indicador vem do estado).

### Cenário A/B do guia (duas sessões reais: A = cliente1 em `localhost:3100`, B = cliente2 em `127.0.0.1:3100`; cookies separados por host)

| Passo | A (cliente1) | B (cliente2) | Leiloeiro |
| --- | --- | --- | --- |
| Início | 9.350,00 / 0 / 9.350,00 | 9.660,00 / 550,00 / 9.110,00 (550 = lance antigo no lote do seed local) | 990,00 recebidos, 6 vendidos |
| Depósito de R$ 1.000,00 pela tela (A com clique duplo) | 10.350,00 / 0 / 10.350,00 — um único lançamento | 10.660,00 / 550,00 / 10.110,00 | — |
| A dá R$ 100,00 | "Você está ganhando", 1º de 1; reserva 100,00, disponível 10.250,00 | Viu R$ 100,00 e mínimo R$ 110,00 sem recarregar | — |
| A tenta de novo | "Você já está ganhando" (recusa da API) | — | — |
| B tenta R$ 100,00 | — | "Abaixo do mínimo — O lance mínimo agora é R$ 110,00"; campo volta para 110,00 | — |
| B cobre com R$ 120,00 | "Você foi superado", 2º de 2; reserva liberada na hora: 10.350,00 / 0 / 10.350,00 | "Você está ganhando", 1º de 2; reservado 670,00 | — |
| Fim e liquidação (sem recarregar) | "Você não venceu este lote" | "Você arrematou este lote" + link do comprovante; reservado 550,00 | — |
| Depois de recarregar (nova conexão) e pela API | 10.350,00 / 0 / 10.350,00 (só o depósito mudou) | 10.540,00 / 550,00 / 9.990,00 (−120,00 `settlement_debit`) | 1.110,00 recebidos (+120,00), 7 vendidos; lote com vencedor e comprovante |

Participações de B: o lote aparece como "Você arrematou", posição 1 de 2, com "Ver comprovante" e "Copiar link para compartilhar".

### Resposta perdida

Sala aberta como A num lote novo; servidor parado; "Dar lance" → "Lance sem confirmação" (sem reenvio automático) e o selo "Sem tempo real". Servidor religado; a aba reconectou; "Reenviar o mesmo pedido" (mesma chave) → aceito; o histórico tem **um** lance.

### Comandos e resultados reais

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` / `npm run lint` / `npm run build` | Ok |
| `npm test` | **224 de 224** na API e **28 de 28** no web (3 novos: posição e situação do usuário) |

### Deploy da etapa 15

Commit `b08fff3` enviado às 17:10:43 UTC; novo frontend no ar às 17:11:37 UTC (o JavaScript servido passou a conter "Reenviar o mesmo pedido"). Verificado:
- sem login: `POST /api/lots/<seed>/bids` e `POST /api/wallet/deposits` → 401 `UNAUTHENTICATED`;
- com a sessão de leiloeiro do candidato (login feito por ele): a sala do lote do seed mostra "Leiloeiros acompanham a disputa, mas não dão lances." e nenhum formulário de lance; um lance direto pela API → 403 "Apenas licitantes podem fazer isso. Leiloeiros não dão lances.";
- health: ok.

Ainda não verificado em produção: depósito e lance com uma conta de licitante (exige login do candidato como licitante).

### Limites

- O caso "o lance entrou mas a resposta se perdeu" não foi forçado no navegador (exigiria derrubar a conexão depois do COMMIT). A repetição com a mesma chave devolvendo a resposta guardada está coberta pelos testes de idempotência da API (etapas 08 e 09).
- O navegador embutido negou a área de transferência; o "Copiar link" caiu no modo manual, que mostra o link.
- O formulário de lance aparece também para quem já lidera; a API recusa com "Você já está ganhando".
- Ficaram no banco local os lotes e lances deste teste.

## Etapa 16 — Auditoria e comprovante públicos (29/10/2026, concluída localmente)

Só frontend: as páginas consomem as rotas públicas reais (`/api/lots/:id/audit`, `/api/lots/:id`, `/api/audit/public-key`, `/api/receipts/:token`). Nenhuma mudança na API.

### Arquivos

- `apps/web/src/pages/AuditPage.tsx`: estado (ÍNTEGRO, ADULTERADO, VERIFICAÇÃO PENDENTE, VERIFICAÇÃO INDISPONÍVEL) com o motivo do servidor e uma explicação do que foi conferido; histórico completo em ordem (`#`, pseudônimo, valor, horário, hash com detalhes: hash anterior, referência do participante e horário UTC exato); detalhes técnicos (gênese, último checkpoint, lances assinados e ancorados, formato da mensagem assinada), "como funciona", chave pública do servidor e limites. Se a última verificação falhar, o resultado anterior não continua na tela (nunca sobra um selo verde velho). Com ADULTERADO, as contagens aparecem como "não contadas", porque a verificação para na primeira divergência.
- `apps/web/src/pages/ReceiptPage.tsx`: obra (imagem, título, autoria, fonte e licença), valor final, identificador da transação (`LIQ-…`), data da liquidação, pseudônimos do arrematante e do leiloeiro, lance vencedor, lote e a auditoria registrada na liquidação; "Copiar link do comprovante" e "Imprimir" (CSS de impressão esconde menu e botões).
- `apps/web/src/pages/NotFoundPage.tsx`: 404 reutilizável, sem dados internos (comprovante e lote inexistentes).
- `apps/web/src/api/useApi.ts`: "recarregar" volta a mostrar o carregamento.
- Estilos de tabela, detalhes técnicos, comprovante e impressão.

### Verificação (servidor local na porta 3200 apontando para `verzel_test` e `verzel_anchor_test`; navegador sem sessão válida nesses bancos, como uma janela anônima)

| Caso | Resultado |
| --- | --- |
| Lote com 2 lances reais | ÍNTEGRO, 2 de 2 assinados e 2 de 2 na âncora, hashes e chave pública visíveis |
| Lote sem lances | ÍNTEGRO, "Não há lances para conferir, e a âncora independente também não registra nenhum" |
| Lote adulterado (fixture: valor do lance 1 mudado por SQL só no banco de teste) | ADULTERADO, "O conteúdo do lance 1 foi alterado." |
| Âncora fora do ar (instância 3201 com a âncora numa porta sem resposta) | VERIFICAÇÃO INDISPONÍVEL em amarelo: "A âncora independente não respondeu agora..." (nunca verde) |
| Lote inexistente | 404 "Lote não encontrado" |
| Comprovante por link direto, sem login | Abre; recarregar a página mantém o comprovante e não pede login |
| Copiar link | O navegador do app negou a área de transferência; o botão mostrou o link para copiar à mão |
| Token inválido (`token-invalido-123`) e desconhecido (43 caracteres) | A mesma página "Comprovante não encontrado", sem detalhes |
| 375 × 812 | Auditoria e comprovante sem rolagem horizontal (a tabela rola dentro da própria caixa) |

### Revisão das respostas, eventos e logs

- Script contra o servidor de teste: comprovante, auditoria, lote, lances, vitrine, chave pública e as respostas 404 **não contêm** `@`, email, id de usuário, senha, sessão, `token_hash`, saldos nem stack trace.
- Eventos públicos do Socket.IO: já testados na etapa 12 (sem ids, email, token ou saldo).
- Logs do servidor: só ids de lote e pseudônimos (liquidação e auditoria); nenhum email.
- A chave pública vem da configuração do servidor (`AUDIT_SIGNING_PRIVATE_KEY`), não do banco auditado; a verificação também usa só essa chave.
- As páginas não consultam a API do museu: leem o banco (snapshot), como vitrine e sala.

### Comandos e resultados reais

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` / `npm run lint` / `npm run build` | Ok |
| `npm test` | **224 de 224** na API e **28 de 28** no web |

### Deploy da etapa 16

Commit `4423568` enviado às 17:45:26 UTC; novo frontend no ar às 17:46:37 UTC (o JavaScript servido passou a conter "Identificador da transação"). Verificado em produção:
- auditoria do lote do seed: ÍNTEGRO, "Não há lances para conferir...", gênese, contagens 0 de 0 e chave pública Ed25519 (a mesma de `/api/audit/public-key`);
- auditoria do lote de teste do candidato encerrado sem lances: ÍNTEGRO;
- `/comprovantes/token-invalido-123`: "Comprovante não encontrado";
- health: ok.

Ainda não verificado em produção: um comprovante real (nenhum lote de produção foi vendido ainda) e um lote com lances na auditoria.

### Limites

- A resposta da auditoria não traz as assinaturas dos checkpoints; a página mostra hashes, contagens, formato e a chave pública, mas conferir as assinaturas por conta própria exigiria expor também as assinaturas (não feito para não mudar a API nesta etapa).
- O caminho "Link copiado." do botão não pôde ser visto no navegador do app (área de transferência negada); o modo manual funcionou.
- Os bancos de teste ficaram com os dados deste teste; a suíte os limpa a cada execução.

## Etapa 17 — Testes automatizados (29/10/2026, concluída localmente)

Revisão dos testes existentes contra a lista do prompt e os requisitos. A maior parte já estava coberta nas etapas 05 a 16 (inclusive casos em `it.each`: recusas por saldo, início, fim e cancelamento; alteração de valor, horário e pseudônimo na auditoria). Lacunas fechadas nesta etapa: uma varredura única de dados pessoais nas respostas públicas e o E2E. Mapa completo em `docs/TESTES.md`.

### Arquivos

- `apps/api/test/public-privacy.test.ts` (11 testes): cenário real (lote, dois lances pela rota, liquidação, comprovante) e leitura como texto de vitrine, lote, lances, auditoria, comprovante, chave pública, saúde e três respostas 404: sem `@`, email, id de usuário, hash de sessão, saldos ou ids privados (`bidderId`, `winnerId`, `receiptToken`...); nenhuma cria sessão.
- `e2e/playwright.config.ts`, `e2e/server.ts`, `e2e/leilao.spec.ts`, `e2e/tsconfig.json`: E2E com o Chrome instalado (sem baixar navegador). O servidor do E2E é o mesmo `server.ts`, nos bancos `_test` (recusa outro nome), com o imitador local da API do museu e liquidação a cada 1 s. Sem relógio falso nem rota extra.
- `package.json`: `@playwright/test` 1.64.1 (dev), `npm run test:e2e`, e `typecheck` também cobre o E2E. `eslint.config.js`: globals de Node para `e2e/`.
- `docs/TESTES.md`: como rodar, o que cada arquivo prova, requisitos × testes, resultados e limites.

### Prova de que os testes pegam erros (mudanças temporárias, desfeitas com `git checkout` do arquivo e conferidas com `git diff`)

| Mudança de propósito | Resultado |
| --- | --- |
| Expor `bidderId` no histórico público de lances | `public-privacy`: 1 falha ("histórico de lances") |
| Aceitar lance R$ 0,01 abaixo do mínimo | `bid-rules`/`bids`: 3 falhas (abaixo do inicial, primeiro igual ao inicial, atual + incremento exato) |

### Comandos e resultados reais

| Comando | Resultado |
| --- | --- |
| `npm test` | API **235 de 235** (14 arquivos); web **28 de 28** (3 arquivos) |
| `npm run test:e2e` | **1 de 1** em 3,8 min; o job liquidou o lote ("vencedor LIC-9DC84A, R$ 120,00") |
| `npm run typecheck` (API, web e E2E) / `npm run lint` / `npm run build` | Ok |

Cobertura de linhas **não foi medida**.

### Deploy da etapa 17

Commit `d26efe7` enviado às 18:01:21 UTC (só testes, docs e dependências de desenvolvimento). O serviço reiniciou com a nova versão às 18:02:33 UTC (`uptimeSeconds` voltou a 13). Health ok, página inicial 200 e Socket.IO respondendo. Nenhuma variável nova; o Playwright não baixa navegador no build.

### Limites

- O E2E espera o lote terminar de verdade (~4 min no total). Não há relógio falso nem rota para fechar lote, por decisão: nada que possa ficar aberto em produção.
- O E2E usa o Chrome instalado; sem Chrome, troque `channel` para `msedge` ou instale o navegador do Playwright.
- `npm test` e `npm run test:e2e` usam o mesmo banco de teste: não rode os dois ao mesmo tempo.

## Etapa 18 — Falhas e recuperação (29/10/2026, concluída localmente)

Rodada focada em falhas, só nos bancos `_test`, em servidores locais e no navegador do Playwright. Nada contra produção. Relatório completo (estado inicial, passos, esperado, observado e evidência de cada cenário) em `docs/TESTES_DE_FALHA.md`.

### Defeitos corrigidos

1. **Lance já gravado respondia 500** quando a confirmação na âncora depois do COMMIT lançava um erro inesperado; o evento também não saía. Agora: 201 com `audit.status: "pending"`, evento publicado como pendente e o reconciliador termina (`apps/api/src/modules/bids/service.ts`). Regressão em `bids.test.ts`; sem a correção o teste falha com "expected 500 to be 201".
2. **"Sem resposta" tratada como recusa** no cancelamento e na criação de lote. Agora a tela diz que não dá para saber, relê a lista e, na criação, pede para conferir antes de tentar de novo (`SellerLotList.tsx`, `CreateLotForm.tsx`, `SellerPage.tsx`).

### Testes novos

- `e2e/falhas.spec.ts` (3 cenários no navegador): resposta cortada depois do commit (a tela confere o histórico e a mesma chave repetida não duplica); Socket.IO derrubado com um lance perdido e recuperação pelo HTTP ao voltar o foco, depois reconexão automática; imagem do museu bloqueada mostrando a substituta.
- `bids.test.ts`: regressão do defeito 1.
- `bid-rules.test.ts`: limites de centavos (maior lance + maior incremento é inteiro seguro; esquema recusa acima do teto).

### Revisões

- Nenhum `pool.query` dentro de transação; nenhum SQL com entrada do usuário fora de parâmetro.
- Sem a chave de auditoria (vazia ou inválida), o servidor não sobe e não cria chave sozinho (código de saída 1).
- Mensagens: lance e depósito já separavam recusa, sem resposta e pendente; cancelamento e criação de lote corrigidos.

### Comandos e resultados reais

| Comando | Resultado |
| --- | --- |
| `npm test` | API **238 de 238** (14 arquivos); web **28 de 28** |
| `npm run test:e2e` | **4 de 4** em 4,1 min (3 de falhas + o fluxo completo) |
| `npm run typecheck` / `npm run lint` / `npm run build` | Ok |

### Limites que permanecem

Listados em `docs/TESTES_DE_FALHA.md`: janela antes da âncora, criação de lote sem chave de idempotência, tempo real de uma instância e serviço que dorme no Render gratuito.
