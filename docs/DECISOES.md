# Decisões do projeto

Conferido na etapa 00 (28/10/2026) contra o PDF original e revisado na etapa 01 (28/10/2026) com consultas reais ao registro do npm, às APIs de catálogo e à documentação de hospedagem. Na etapa 02 passou a existir a base executável; só as linhas marcadas como "Implementada" foram exercitadas no código. Estados usados:

- **Proposta**: sugestão do plano, ainda sem verificação.
- **Verificada por consulta**: conferida em fonte oficial ou chamada real na etapa 01, mas ainda não exercitada no código do projeto.
- **Interpretação**: leitura do projeto para um ponto que o PDF não detalha; precisa estar no README.
- **Decidido pelo candidato**: escolha informada pelo candidato na conversa.

## Técnica e produto

| Tema | Decisão | Estado |
| --- | --- | --- |
| Stack | React + Vite + TypeScript; Express + TypeScript; PostgreSQL com `pg`; Socket.IO. Versões na tabela abaixo | Verificada por consulta |
| Estrutura | npm workspaces em `apps/web` e `apps/api`; em produção, um serviço Node serve o React, a API em `/api` e o Socket.IO na mesma origem | Implementada na etapa 02 (exceto Socket.IO); build e servidor de produção testados localmente |
| Módulos e portas | ESM nos dois apps; API em TypeScript `NodeNext` (imports relativos terminam em `.js`); API na porta 3000 e Vite na 5173 em desenvolvimento; `HOST` padrão `127.0.0.1` em dev e `0.0.0.0` em produção | Implementada na etapa 02 |
| Banco e migrações (etapa 04) | `pg` 8.23.1 com pool (máx. 10, timeout de conexão 5 s); BIGINT convertido para `number` só se for inteiro seguro, senão erro. Migrações em SQL puro com `node-pg-migrate` 9.0.0 (`apps/api/migrations`, tabela `pgmigrations`, advisory lock). Em dev, `db:migrate` cria o banco local se faltar. Em produção, `RUN_MIGRATIONS_ON_START=true` aplica as pendentes antes de aceitar conexões | Implementada e verificada localmente na etapa 04 (migração, repetição, down/up, inicialização de produção) |
| Transações | `withTransaction(pool, work)`: um único cliente, `BEGIN`/`COMMIT`, `ROLLBACK` em erro, `release` no `finally`, conexão descartada se o ROLLBACK falhar, até 3 tentativas em deadlock (`40P01`) ou falha de serialização (`40001`) | Implementada; rollback, devolução da conexão e repetição após deadlock real verificados |
| Senhas e pseudônimos | `scrypt` do `node:crypto` (N=32768, r=8, p=1, sal de 16 bytes, comparação em tempo constante). Pseudônimo `VEN-`/`LIC-` + 6 hex aleatórios | Implementada e verificada |
| Seed | Idempotente: leiloeiro `leiloeiro@example.com`, clientes `cliente1@example.com` e `cliente2@example.com`, senha padrão `leilao-demo-2026` (sobrescrevível por `SEED_DEMO_PASSWORD`), depósito simulado inicial de R$ 10.000,00 por cliente via lançamento com `operation_key` única, lote ao vivo de 10 dias com a obra real 152006. `db:demo-lot` cria lotes novos por chave, sem apagar nada. Em produção, `RUN_SEED_ON_START=true` | Implementada e verificada localmente (duas execuções com estado idêntico); produção pendente |
| Banco local | Docker Compose (`postgres:18.3-alpine`, porta 5433, credenciais só de dev, volume em `/var/lib/postgresql`). O PostgreSQL 18.3 nativo fica como alternativa documentada (opção A do `.env.example`) | Decidido pelo candidato; funcionando com Docker Desktop 29.9.2 |
| Configuração | API valida `NODE_ENV`, `PORT` e `HOST` com zod no startup; fora de produção carrega `apps/api/.env` com `process.loadEnvFile` (sem dependência extra). O frontend não usa variáveis `VITE_*` | Implementada na etapa 02 |
| Catálogo | **Cleveland Museum of Art Open Access API** (sem chave, dados CC0, imagens CC0 em CDN), com snapshot local dos metadados no lote. **Substitui a proposta do Art Institute of Chicago** (motivo abaixo) | Implementada na etapa 06 (cliente, rotas do leiloeiro, snapshot e leitura pública offline); 52 testes + 3 testes contra a API real |
| Dinheiro | Centavos inteiros (`BIGINT`); total persistido na carteira e comprometido = soma das reservas ativas. A API só aceita inteiros seguros (zod `int` + limites): depósito até R$ 100.000,00, saldo total até R$ 10.000.000,00, lance inicial e incremento até R$ 100.000.000,00. Somas no SQL com `::bigint`. Formatação em texto (`formatBrl`), sem ponto flutuante | Implementada nas etapas 04 a 08 |
| Carteira (etapa 08) | `lockWallets` (FOR UPDATE em ordem crescente de `user_id`) e `readBalance` (total, comprometido e disponível numa só consulta) centralizados em `modules/wallet/ledger.ts`, para depósito, lance e liquidação. Depósito simulado só para licitante, com lançamento e total na mesma transação | Implementada e testada na etapa 08 |
| Idempotência | `withIdempotency`: a chave (cabeçalho `Idempotency-Key`, por usuário e escopo) é gravada no início da transação da operação com `ON CONFLICT DO NOTHING`; requisição simultânea com a mesma chave espera e recebe a resposta gravada; mesma chave com outro corpo dá 409. A resposta devolvida vem sempre do registro gravado (idêntica nas repetições). Falha de negócio não grava a chave | Implementada e testada na etapa 08; o lance usará o mesmo mecanismo |
| Concorrência | Bloqueio do lote e depois das carteiras envolvidas em ordem crescente de `user_id`, na mesma conexão `pg` (detalhes em PLANO) | Proposta |
| Tempo | UTC; início inclusivo e fim exclusivo; horário lido com `clock_timestamp()` depois dos bloqueios; relógio injetável nos testes | Proposta |
| Lotes (etapa 07) | Criação só por leiloeiro, com `externalId`, lance inicial e incremento em centavos inteiros (1 a 10.000.000.000) e início e fim ISO 8601 com fuso, guardados em UTC. Datas conferidas com o relógio do banco: início até 5 min no passado e até 90 dias à frente; duração de 2 min a 30 dias. Sem edição depois de publicado. Estado calculado na consulta (agendado, ao vivo, encerrado, cancelado; encerrado sem liquidação = `settled: false`), sem coluna de status. Cancelamento só pelo dono, sem lances e antes do fim, conferido após `FOR UPDATE` no lote | Implementada e testada na etapa 07 |
| Prorrogação | Lance aceito com até 120 s restantes: novo fim = hora de aceitação + 120 s | Interpretação a documentar no README |
| Encerramento | Backend encerra sozinho os lotes vencidos (job periódico e na inicialização), sem depender da tela | Interpretação: o PDF diz "ao encerrar", sem dizer quem dispara (p. 4) |
| Auth | Sessão opaca: 32 bytes aleatórios (base64url) no cookie, só o SHA-256 no banco, validade de 7 dias, revogada no logout e trocada a cada login. Cookie `HttpOnly`, `SameSite=Lax`, `Path=/`; em produção `__Host-sid` com `Secure`. Senha com `scrypt`. CSRF: Origin/Sec-Fetch-Site da mesma origem + corpo JSON obrigatório + SameSite. Limite em memória: login 30/15 min por IP e 10/15 min por email; cadastro 10/hora por IP | Implementada e testada na etapa 05 (30 testes com banco real) |
| Proxy e IP do cliente | Produção: `TRUST_PROXY=1` (o Render termina o HTTPS) e `CLIENT_IP_HEADER=cf-connecting-ip`, porque no Render o `X-Forwarded-For` acumula valores e o primeiro pode ser falsificado. Fonte: artigos e fórum do Render, não documentação formal | Implementada; comportamento real no Render a confirmar |
| Integridade | Cadeia SHA-256 por lote, checkpoint assinado com Ed25519 (chave fora do banco) e âncora em PostgreSQL separado, só de inserção. Protocolo e modelo de ameaça em PLANO | Proposta; protocolo definido na etapa 01, testes na etapa 10 |
| Hospedagem | Render (web service gratuito, Node 24.22.1 via `.node-version`, região `virginia`) + Neon gratuito em `aws-us-east-1`: um projeto para o banco principal e outro, com credenciais próprias, para a âncora. Configuração em `render.yaml`; detalhes em `docs/DEPLOY.md` | Implementada na etapa 03: serviço criado pelo candidato e URL pública verificada; Neon ainda não criado |
| Interface | Usar as skills `frontend-design` e `Superdesign` para um frontend profissional e moderno nas etapas de interface (13 a 16) | Decidido pelo candidato em 28/10/2026. As skills ainda não carregam nesta sessão (`Unknown skill`); o candidato recebeu o cartão para ativá-las |
| Extras | Testes críticos acompanham as etapas 09 a 18; filtros, dark mode e Compose só depois da base | Proposta |

### Troca do catálogo: Art Institute of Chicago → Cleveland Museum of Art

- **Motivo:** a API de metadados da AIC respondeu normalmente (HTTP 200), mas a imagem IIIF em `www.artic.edu` devolveu HTTP 403 com página de bloqueio do Cloudflare, tanto para `curl` quanto no navegador embutido do app. R03 exige imagem no lote. Não foi tentado nenhum contorno da proteção.
- **Verificado em Cleveland:** busca com `cc0=1&has_image=1` (HTTP 200, 0,25 a 0,57 s), item por id (200), id inexistente (404 JSON), imagem do CDN (200 `image/jpeg` no `curl` e abrindo no navegador). Documentação oficial: limite máximo de 1000 por página, paginação por `skip`, dados CC0.
- **Consequência:** a etapa 06 integra Cleveland. A busca pede `cc0=1&has_image=1` e usa a imagem `images.web` (cerca de 900 px no maior lado). Largura e altura vêm como texto e precisam ser convertidas. A documentação não informa limite de requisições, então a busca terá timeout, cache curto e limite de 12 itens por página. A interface deixa claro que é uma simulação e não uma venda real de obras do museu.
- **Se o candidato preferir manter a AIC:** a imagem pode falhar para avaliadores. O placeholder local cobre a falha, mas o lote ficaria sem imagem real.

### Integração com a Cleveland (etapa 06): fonte e comportamento de falha

- **Fonte:** Cleveland Museum of Art Open Access API (`https://openaccess-api.clevelandart.org/api/`), dados CC0. Busca com `cc0=1&has_image=1`, 12 por página, até a página 50. O endereço vem só de `CMA_API_BASE_URL` no servidor. Cada obra guarda o link da fonte (`clevelandart.org/art/...`) e a licença CC0, e a interface informa que o museu não tem relação com o projeto.
- **Snapshot:** ao criar um lote, o leiloeiro informa só o `externalId`. O servidor busca a obra no museu (fora da transação), exige imagem e grava o snapshot com a data da coleta. Vitrine, sala, auditoria e comprovante leem só o banco.
- **Imagem:** só `https://openaccess-cdn.clevelandart.org/...`. URL de outro host vira "sem imagem". No navegador, o componente `ArtworkImage` troca a imagem que falha pelo placeholder local `/obra-sem-imagem.svg`. O servidor nunca baixa imagens.

| Situação | Comportamento |
| --- | --- |
| Museu lento | Timeout de 5 s (`CATALOG_TIMEOUT_MS`), sem nova tentativa: 503 `CATALOG_UNAVAILABLE` |
| 429 do museu | 503 com `retryAfterSeconds` quando o museu informa |
| 5xx, conexão recusada, resposta que não é JSON ou formato inesperado | 503 `CATALOG_UNAVAILABLE`; o detalhe técnico fica em `details.reason`, sem repassar o corpo do museu |
| Obra com formato estranho ou não CC0 dentro da busca | Descartada; a contagem aparece em `skipped` |
| Obra pedida não existe | 404 `CATALOG_ITEM_NOT_FOUND` |
| Obra sem imagem ao criar lote | 422 `CATALOG_ITEM_WITHOUT_IMAGE` |
| Cache | Busca: 60 s; obra: 5 min. Com o museu falhando, serve cache de até 10 min marcado `origin: "cache", stale: true`, com `fetchedAt` e `ageSeconds` |
| Excesso de buscas | 30 por minuto por leiloeiro: 429 `TOO_MANY_REQUESTS` |
| Lotes existentes com o museu fora do ar | Funcionam normalmente (testado, inclusive reiniciando o processo) |

Achado em 28/10/2026: o CDN de imagens não responde a `HEAD` (fica sem resposta); `GET` funciona. Não use `HEAD` para checar imagens.

### Versões verificadas (registro do npm em 28/10/2026)

Fixar versões exatas no `package.json` na etapa 02. Nenhuma versão beta, rc ou canary.

| Pacote | Versão | Requisito de Node ou par | Uso |
| --- | --- | --- | --- |
| Node.js | 24 LTS em produção (Render: padrão 24.22.1); 26.13.0 LTS na máquina local | `engines`: `>=24.11.0 <27` | Runtime |
| npm | 11.20.0 (local) | workspaces | Monorepo |
| react / react-dom | 19.3.1 | — | Interface |
| react-router | 8.5.1 | Node >=22.22.0; react >=19.2.7 | Rotas da SPA |
| vite | 8.3.5 | Node ^20.19 ou >=22.12 | Dev server e build |
| @vitejs/plugin-react | 6.1.2 | vite ^8 | React no Vite |
| socket.io / socket.io-client | 4.8.4 | — | Tempo real |
| express / @types/express | 5.3.0 / 5.0.6 | Node >=18 | API |
| pg / @types/pg | 8.23.1 / 8.23.1 | — | PostgreSQL |
| node-pg-migrate | 9.0.0 | Node >=20.11; pg <9 | Migrações em SQL puro (suporte a `.sql` com `-- Up Migration` confirmado na documentação oficial) |
| zod | 4.6.7 | — | Validação de entrada |
| cookie-parser / @types/cookie-parser | 1.4.7 / 1.4.10 | — | Leitura do cookie de sessão |
| typescript | **6.0.3** (não 7.0.2) | — | Typecheck e build da API |
| tsx | 4.23.15 | Node >=18 | Rodar a API em desenvolvimento |
| @types/node | 24.19.2 (mesma linha do Node de produção) | — | Tipos do Node |
| @types/react / @types/react-dom | 19.3.0 / 19.3.0 | — | Tipos |
| eslint / @eslint/js | 10.13.0 / 10.0.1 | Node >=24 na linha atual | Lint |
| typescript-eslint | 8.72.1 | typescript >=4.8.4 <6.1.0; eslint ^10 | Lint de TS |
| eslint-plugin-react-hooks / -react-refresh | 7.1.1 / 0.5.7 | eslint ^10 | Lint React |
| globals | 17.13.0 | — | Config do ESLint |
| concurrently | 10.0.6 | Node >=22 | Subir web e API juntos no dev, sem sintaxe de shell |
| vitest | 5.0.5 | Node ^24 ou >=26; vite ^8 | Testes |
| supertest / @types/supertest | 7.3.1 / 7.2.1 | — | Testes HTTP |
| @playwright/test | 1.64.1 | Node >=20 | Fluxo em dois navegadores (etapa 17, se houver tempo) |

Sem dependência extra para criptografia: `node:crypto` cobre `scrypt`, tokens aleatórios, SHA-256 e Ed25519.

Motivos das escolhas de versão:

- **TypeScript 6.0.3 em vez de 7.0.2:** o `typescript-eslint` 8.72.1 aceita só TypeScript abaixo de 6.1. O TypeScript 7 também expõe a API JavaScript apenas como `unstable`.
- **Node 24 em produção:** a documentação do Render confirma 24.22.1 como padrão e não menciona o 26. O Node 26 virou LTS (Lithium) só em 28/10/2026. Todos os pacotes acima aceitam 24 e 26.

## Ambiente, repositório e prazo

| Tema | Decisão ou registro | Estado |
| --- | --- | --- |
| Ambiente local | Windows nativo (PowerShell 5.1 e Git Bash). PostgreSQL 18.3 local para desenvolvimento e testes, com bancos separados: `verzel_dev`, `verzel_test` e `verzel_anchor_test`. WSL2 sem distribuição | Proposta (ambiente observado na etapa 00) |
| Docker Compose | Extra opcional do PDF. Docker não está instalado; se adotado, usar outra porta, porque a 5432 está ocupada | Proposta; depende de instalar Docker |
| Repositório | Monorepo em https://github.com/takeshitos/verzel-leiloes-ricardo, público e vazio em 28/10/2026, branch padrão `main` | Informado pelo candidato; `git init` e remote na etapa 02 |
| Arquivos fora do repositório público | Não versionar `docs/desafio-original.pdf`, `GUIA_COMPLETO_VERZEL.md` e `docs/prompts/` | Decidido pelo candidato; aplicar no `.gitignore` da etapa 02 |
| Nome do PDF | Renomeado de `desafio-original.pdf.pdf` para `desafio-original.pdf` | Decidido pelo candidato e feito na etapa 00 |
| Prazo | Recebido em 22/10/2026; entrega até 29/10/2026, hora limite a confirmar | Informado pelo candidato |
| Ordem de execução | Seguir a sequência normal dos prompts (01, 02, ...) em vez do prompt auxiliar E | Decidido pelo candidato em 28/10/2026 |

## Interpretações propostas que não estão no PDF

Estas regras vêm do guia (seção 4). Nenhuma deve ser apresentada como frase do PDF; todas precisam aparecer no README se forem mantidas.

- Sem taxas e sem saque.
- Lote publicado não é editado; o leiloeiro só pode cancelar enquanto não houver lances.
- Cadastro e login simples para os dois papéis.
- Posição do usuário na sala = colocação do melhor lance de cada participante.
- Comprovante é uma página pública acessada por token imprevisível.
- Pseudônimo aleatório estável por usuário (ex.: `LIC-7F3A9C`); permite ligar as participações públicas do mesmo usuário.
- Cancelar lote que já tem lances (com estorno) é o extra E02 e fica fora da primeira versão.
- Liquidação de um lote espera a confirmação da âncora de auditoria; lote com auditoria pendente fica "encerrado, liquidação pendente" até a reconciliação.
