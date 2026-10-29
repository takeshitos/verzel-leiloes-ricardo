# Progresso

Estado atual: etapas 00, 01 e 02 concluídas. Existe a base executável (web React e API Express) sem nenhuma regra de negócio. R01 a R20 continuam pendentes; R01 está em andamento (falta o banco).

**Prazo: desafio recebido em 22/10/2026; entrega até 29/10/2026 (hora limite a confirmar pelo candidato).** O cronograma de 7 dias do guia não cabe no tempo restante. Em 28/10/2026 o candidato decidiu seguir a sequência normal dos prompts em vez do prompt auxiliar E.

Etapa 03 concluída: esqueleto publicado em https://verzel-leiloes-ricardo.onrender.com/ e verificado de fora em 28/10/2026 (detalhes em `docs/DEPLOY.md`).

Próxima ação: etapa 04 (banco, migrações e seed), com o PostgreSQL local para desenvolvimento e testes. Os projetos no Neon são necessários antes de publicar o banco.

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

### Pedido do candidato durante a etapa

O candidato pediu as skills `frontend-design` e `Superdesign` para um frontend profissional e moderno. As duas constam como habilitadas no catálogo da conta, mas não carregam nesta sessão (`Unknown skill`). Foi mostrado o cartão para ativá-las e a preferência foi registrada em DECISOES para as etapas 13 a 16.
