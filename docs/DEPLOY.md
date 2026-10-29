# Deploy

**Estado em 28/10/2026:** esqueleto publicado e verificado em **https://verzel-leiloes-ricardo.onrender.com/**. O candidato criou o serviço no Render pelo Blueprint; a verificação foi feita de fora, com o commit `80536a7` em `main`. R18 fica parcial até o deploy final (etapa 21), quando a aplicação completa precisa estar publicada.

## Arquitetura publicada

Um único web service Node no Render:

- serve o build do React (`apps/web/dist`), inclusive rotas profundas como `/sobre`;
- responde a API em `/api`;
- mais tarde, também o Socket.IO.

Front e API ficam na mesma origem, sem CORS. Banco principal e âncora de auditoria ficam em dois projetos separados no Neon (a partir das etapas 04 e 10).

## Configuração (`render.yaml` e `.node-version`)

| Campo | Valor | Motivo |
| --- | --- | --- |
| Tipo / runtime / plano | `web` / `node` / `free` | Serviço persistente com WebSocket, sem custo |
| Região | `virginia` | Perto do Neon `aws-us-east-1`. Não pode ser mudada depois |
| Branch | `main` | Deploy automático a cada commit (`autoDeployTrigger: commit`) |
| Build | `npm ci --include=dev && npm run build` | Com `NODE_ENV=production`, o `npm ci` pula as devDependencies e o build quebra (verificado) |
| Start | `node apps/api/dist/server.js` | Mesmo que `npm start`, mas o SIGTERM do Render chega direto ao Node |
| Health check | `/api/health` | O Render só troca a versão quando a nova responde |
| Node | `24.22.1` (arquivo `.node-version`) | Versão padrão confirmada na documentação do Render; localmente usamos 26.13.0 |
| `NODE_ENV` | `production` | Ativa `HOST=0.0.0.0` |
| `PORT` | definido pelo Render | A API lê `process.env.PORT` |

## Variáveis de ambiente

| Variável | Onde | Quando | Observação |
| --- | --- | --- | --- |
| `NODE_ENV` | `render.yaml` | já | `production` |
| `PORT` | Render (automático) | já | Não definir manualmente |
| `HOST` | não definir | — | Padrão `0.0.0.0` em produção |
| `DATABASE_URL` | Painel do Render → Environment (segredo) | Etapa 04, **antes do push dessa etapa** | String de conexão do projeto Neon principal, com `sslmode=require`. Sem ela, o novo deploy falha no startup (o anterior continua no ar) |
| `TRUST_PROXY` / `CLIENT_IP_HEADER` | `render.yaml` (`1` / `cf-connecting-ip`) | Etapa 05 | Sem elas, o limite de login usaria o IP do proxy do Render e todos os usuários dividiriam o mesmo limite. Conferir em Environment se apareceram após o deploy |
| `RUN_MIGRATIONS_ON_START` / `RUN_SEED_ON_START` | `render.yaml` (`true`) | Etapa 04 | Aplica migrações pendentes e o seed idempotente antes de aceitar conexões. Variáveis novas de um Blueprint existente podem precisar de "Manual Sync" no painel |
| `ANCHOR_DATABASE_URL` | Painel do Render (segredo) | Etapa 10 | Projeto Neon da âncora (usuário dono; usuário restrito a INSERT/SELECT é endurecimento opcional **não aplicado**) |
| `AUDIT_SIGNING_PRIVATE_KEY` | Painel do Render (segredo) | Etapa 10 | Chave Ed25519 gerada uma vez e guardada offline; nunca regenerar no deploy |
| `SETTLEMENT_INTERVAL_MS` | não definir | Etapa 11 | Opcional. Intervalo do job de encerramento; padrão 5000 ms. O job também roda no startup |

Segredos nunca vão para o repositório, para variáveis `VITE_*`, para logs ou para a conversa com a IA.

## Verificado localmente (simulação do Render, 28/10/2026)

Cópia limpa dos arquivos versionados num diretório temporário, com Node 26.13.0 (o Render usará 24.22.1):

| Passo | Resultado |
| --- | --- |
| `NODE_ENV=production npm ci` (sem `--include=dev`) e build | 77 pacotes; o build falhou porque o `tsc` não estava instalado. Isso confirma a necessidade do `--include=dev` |
| `NODE_ENV=production npm ci --include=dev && npm run build` | 259 pacotes; build ok (JS 259,15 kB) |
| `loadConfig` com `NODE_ENV=production` e `PORT=10000` | `host: 0.0.0.0`, `port: 10000` |
| Servidor com `PORT=10000` | `/api/health` 200 JSON; `/`, `/sobre` e `/lotes/123/auditoria` 200 HTML; `/api/rota-inexistente` 404 JSON |
| Evento SIGTERM | "Servidor encerrado.", saída 0 |
| Repositório público (API do GitHub) | Commit `dae1242` em `main`; 37 arquivos; nenhum PDF, guia, prompt, `.env`, `dist` ou `node_modules` |

**Não verificado ainda:** build real no Render com Node 24, URL pública, entrega real do SIGTERM pelo Render e tempo de acordar no plano gratuito.

## Passo a passo para o candidato

### A. Render (cerca de 5 minutos)

1. Acesse https://dashboard.render.com e entre com a conta do GitHub `takeshitos`.
2. Clique em **New** → **Blueprint**.
3. Conecte o GitHub e dê acesso **só** ao repositório `verzel-leiloes-ricardo`.
4. Escolha o repositório, branch `main`. O Render lê o `render.yaml` e mostra o serviço `verzel-leiloes-ricardo` (plano **Free**, região **Virginia**).
5. Em **Blueprint Name**, use `verzel-leiloes`. Clique em **Deploy Blueprint** (ou **Apply**).
6. **Se aparecer qualquer cobrança ou plano pago, pare e me avise.** O plano previsto é gratuito.
7. Abra o serviço e acompanhe **Logs**. Deve aparecer o build e, no fim, `API ouvindo em http://0.0.0.0:10000 (production)` (a porta pode variar).
8. Copie a URL do serviço (algo como `https://verzel-leiloes-ricardo.onrender.com`) e envie na conversa. A URL não é segredo.

### B. Neon (pode ser feito agora ou na etapa 04)

1. Acesse https://console.neon.tech e entre com o GitHub.
2. Crie o projeto `verzel-leiloes`: região **AWS US East 1 (N. Virginia)**, banco `verzel`.
3. Crie o projeto `verzel-leiloes-ancora`, na mesma região (usado na etapa 10).
4. **Não cole as strings de conexão na conversa.** Na etapa 04 você vai colá-las direto no painel do Render (Environment → Add Environment Variable).

## Comportamentos conhecidos do plano gratuito

- O serviço dorme após 15 minutos sem tráfego; a primeira visita depois disso leva cerca de 1 minuto. Durante o sono, o job de encerramento de lotes não roda: os lotes vencidos são liquidados quando o serviço acorda (ciclo do startup, implementado na etapa 11).
- Com o serviço acordado, o job consulta o banco a cada 5 s e o reconciliador da auditoria a cada 30 s; por isso o Neon não suspende enquanto o Render está acordado. Os dois dormem juntos depois de 15 min sem tráfego.
- Conexões WebSocket ativas contam como tráfego e mantêm o serviço acordado.
- O compute do Neon suspende após 5 minutos ocioso e volta na primeira conexão.

## Verificação pública

Feita em 2026-10-29T01:24Z (28/10/2026, 22:24 em Brasília) com `curl` e com o navegador embutido do app, sem sessão de login.

| Verificação | Resultado |
| --- | --- |
| `GET /api/health` | 200 JSON, `uptimeSeconds: 260`, 0,61 s (serviço já acordado) |
| `GET /` | 200 HTML; no navegador: "Status da API: Conectada. Horário do servidor: 28/10/2026, 22:24:17" |
| `GET /sobre` (acesso direto e pelo menu) | 200 HTML; página Sobre renderizada |
| `GET /lotes/123/auditoria` (rota profunda) | 200 HTML (SPA) |
| Rota inexistente no navegador | "Página não encontrada" |
| `GET /api/rota-inexistente` | 404 JSON `NOT_FOUND` |
| Asset `/assets/index-BVEDv9yu.js` | 200 `text/javascript` |
| `http://` | 301 para `https://` |
| Console do navegador | Sem erros |

- [x] `GET /` abre a página inicial com "Status da API: Conectada".
- [x] `GET /api/health` responde 200 JSON.
- [x] `GET /sobre` (acesso direto) abre a página Sobre.
- [x] `GET /api/rota-inexistente` responde 404 JSON.
- [ ] Log do Render mostra Node 24.22.1 e "API ouvindo em http://0.0.0.0:..." (a IA não tem acesso ao painel; conferência do candidato).
- [ ] Num redeploy, o log mostra "Recebido SIGTERM" e "Servidor encerrado" (conferência do candidato).
- [ ] Tempo de acordar após 15 minutos ocioso (não medido).

## Deploy da etapa 04 (banco no Neon)

O candidato criou o projeto Neon e cadastrou `DATABASE_URL` no Render; a recomendação foi usar a conexão **direta** (sem `-pooler`) e `sslmode=verify-full`. Depois disso, o push de `d75f85c` foi feito em 2026-10-29T01:58Z.

| Horário (UTC) | Observado em `/api/health` |
| --- | --- |
| 01:58:16 a 02:02:54 | Versão anterior (sem o campo `database`), sempre 200. Houve um reinício às ~01:59:02, provavelmente ao salvar a variável no painel |
| 02:03:09 | Nova versão: `{"status":"ok","database":"ok",...}`, `uptimeSeconds: 13` |

Na nova versão: `/` 200, `/sobre` 200, `/api/rota-inexistente` 404 JSON. Nenhuma requisição falhou durante a troca.

**Log do Render (captura enviada pelo candidato; horários de Brasília, UTC−3):**

| Horário | Instância | Linha |
| --- | --- | --- |
| 23:01:34 | `vjvhc` | `- DATABASE_URL: deve começar com postgres:// ou postgresql://`: naquele momento a variável estava vazia ou em outro formato. A validação mostrou só o nome, sem o valor, e a versão anterior continuou no ar |
| 23:02:48 | — | `==> Deploying...` |
| 23:02:59 | `cjt45` | `Running 'node apps/api/dist/server.js'` |
| 23:03:02 | `cjt45` | `Aplicando migrações em ep-…us-east-1.aws.neon.tech:5432/…` (endereço sem `-pooler`: conexão direta) |
| 23:03:03 | `cjt45` | `Migrações aplicadas: 1793238000000_esquema-inicial` |
| 23:03:05 | `cjt45` | `Usuários criados: leiloeiro@example.com, cliente1@example.com, cliente2@example.com`; `Depósitos iniciais criados agora: 2`; `Lote inicial criado: 7a350b42-… (termina em 2026-11-08…)` |
| 23:03:05 | `cjt45` | `API ouvindo em http://0.0.0.0:10000 (production)` |
| 23:03:09 | `gg9s9` | `Recebido SIGTERM. Encerrando o servidor...` e `Servidor encerrado.` (**encerramento limpo confirmado no Linux**) |
| 23:03:09 | — | `==> Your service is live` |

Migrações e seed em produção: **verificados pelo log**. Conexão: verificada por `/api/health`.

## Pendências

1. Conferir no log de build do Render a versão do Node (24.22.1).
2. Projeto Neon da âncora (etapa 10).
3. Deploy final e smoke test completo na etapa 21.

## Deploy da etapa 05 (autenticação)

Push de `fa28393` às 02:16:42 UTC. A nova versão respondeu às 02:17:46 UTC (`/api/auth/me` passou de 404 para 401); `/api/health` ficou em 200 durante a troca.

Verificação de fora, **sem usar credenciais** (a IA não faz login em ambiente de produção):

| Requisição | Resultado |
| --- | --- |
| `GET /api/health` | 200, `database: ok` |
| `GET /api/auth/me` sem cookie | 401 `UNAUTHENTICATED` |
| `POST /api/auth/login` com `{}` | 400 `VALIDATION_ERROR` com mensagem por campo |
| `POST /api/auth/register` com papel `admin` | 400; `role`: "Escolha o papel: seller (leiloeiro) ou bidder (licitante)." |
| `POST /api/auth/logout` com `Origin` de outro site | 403 `FORBIDDEN_ORIGIN` |
| `POST /api/auth/login` como formulário | 415 `UNSUPPORTED_MEDIA_TYPE` |
| `POST /api/auth/logout` da mesma origem | 204 e `Set-Cookie: __Host-sid=; ... HttpOnly; Secure; SameSite=Lax`: a checagem de origem funciona atrás do proxy, com o modo produção ativo |
| `/` e `/sobre` | 200 |

**Login com as contas de demonstração em produção:** conferido pelo candidato às 02:21 UTC, no próprio terminal (PowerShell, `Invoke-WebRequest`): `200`, `Set-Cookie: __Host-sid=<token>; Max-Age=604800; Path=/; ...; HttpOnly; Secure; SameSite=Lax` e `{"user":{"email":"cliente1@example.com","role":"bidder","publicAlias":"LIC-A465A1"}}`. O pseudônimo de produção é diferente do local, porque cada seed sorteia o seu.

## Deploy da etapa 06 (catálogo e lote público)

Push de `eeee068` às 02:30:53 UTC. Nova versão no ar às 02:32:04 UTC (`/api/catalog/search` sem login passou de 404 para 401); `/api/health` ficou em 200 durante a troca.

Verificação de fora, sem credenciais:

| Requisição | Resultado |
| --- | --- |
| `GET /api/catalog/search?q=landscape` sem login | 401 `UNAUTHENTICATED` (busca no museu só para leiloeiro) |
| `GET /api/lots/<uuid inexistente>` e `/api/lots/abc` | 404 "Lote não encontrado." |
| `GET /api/lots/7a350b42-e23a-4a0a-942d-9b808a1656c5` (lote do seed de produção, id visto no log) | 200: `status: live`, "Rocky, Wooded Landscape with a Dell and Weir", Thomas Gainsborough, lance mínimo 50000 centavos, 0 lances, vendedor `VEN-4AF320`, fim 2026-11-08T02:03:05Z, fonte Cleveland/CC0 com link. Sem email ou campo privado na resposta |
| `/obra-sem-imagem.svg` | 200 `image/svg+xml` (placeholder local publicado) |
| Imagem do lote no CDN (`GET` com `Range`) | 206 `image/jpeg` |

Isto confirma, de fora, que o seed rodou em produção e que o lote é lido do banco.

## Deploy da etapa 07 (gestão de lotes)

Push de `d3985b7` às 02:58:54 UTC. Nova versão no ar por volta de 02:59:39 UTC (`GET /api/lots` passou de 404 para 200); `/api/health` ficou em 200.

Verificação de fora, sem credenciais:

| Requisição | Resultado |
| --- | --- |
| `GET /api/lots` (vitrine) | 200: 1 ao vivo (lote do seed, "Rocky, Wooded Landscape with a Dell and Weir", mínimo 50000 centavos, fim 2026-11-08T02:03:05Z, `VEN-4AF320`), 0 agendados, 0 encerrados; sem dados pessoais |
| `POST /api/lots` sem login | 401 `UNAUTHENTICATED` |
| `POST /api/lots/<lote do seed>/cancel` sem login | 401 |
| O mesmo vindo de outro site | 403 `FORBIDDEN_ORIGIN` |
| `GET /api/seller/summary` sem login | 401 |
| Lote do seed depois das tentativas | Continua `live`, `settled: false`, 0 lances |

Criação e cancelamento com login de leiloeiro foram testados localmente (testes automatizados e ponta a ponta com a API real do museu). Em produção ficam para o candidato ou para as telas da etapa 14.

## Deploy da etapa 08 (carteira e depósitos)

Push de `63d97a7` às 03:20:28 UTC. Nova versão no ar por volta de 03:21:44 UTC (`GET /api/wallet` passou de 404 para 401); `/api/health` ficou em 200.

Verificação de fora, sem credenciais:

| Requisição | Resultado |
| --- | --- |
| `GET /api/wallet` sem login | 401 `UNAUTHENTICATED` |
| `POST /api/wallet/deposits` sem login | 401 |
| Depósito vindo de outro site | 403 `FORBIDDEN_ORIGIN` |
| Depósito como formulário | 415 `UNSUPPORTED_MEDIA_TYPE` |
| `/api/health` e `/api/lots` | 200 |

Depósito com login de licitante foi testado localmente (testes automatizados com PostgreSQL real, inclusive requisições simultâneas). Em produção, fica para o candidato ou para a tela da carteira (etapa 15).

## Deploy da etapa 09 (lances)

Push de `58adfdf` às 06:02:20 UTC. Nova versão no ar por volta de 06:03:06 UTC (`GET /api/lots/<lote do seed>/bids` passou de 404 para 200).

Verificação de fora, sem credenciais:

| Requisição | Resultado |
| --- | --- |
| `GET /api/lots/7a350b42-…/bids` | 200 `{"bids":[]}` |
| `POST /api/lots/7a350b42-…/bids` sem login | 401 |
| O mesmo vindo de outro site | 403 `FORBIDDEN_ORIGIN` |
| O mesmo como formulário | 415 |
| Histórico de lote inexistente | 404 |
| `GET /api/lots/7a350b42-…` | `live`, 0 lances, mínimo 50000, fim 2026-11-08T02:03:05Z |
| `/api/health` | 200, `database: ok` |

O lote do seed em produção foi criado antes da correção de microssegundos. Um lance real nele (com login de licitante) confirmaria a correção em produção; localmente ela foi confirmada no lote equivalente. Fica para o candidato (comando no PROGRESSO).

## Configuração da auditoria em produção (etapa 10) — fazer ANTES do push

Sem estas variáveis o novo deploy não sobe: a configuração exige a chave, e a âncora em produção. A versão anterior continua no ar.

1. **Gerar a chave** (uma única vez), no seu terminal, na pasta do projeto:

   ```bash
   npm run audit:keygen -w apps/api
   ```

   Guarde a chave privada num gerenciador de senhas. Não cole na conversa nem em arquivo versionado.
2. **Criar a âncora no Neon:** novo projeto `verzel-leiloes-ancora`, região AWS US East 1 (N. Virginia), conexão **direta** (sem `-pooler`), terminando a URL em `sslmode=verify-full` (como no banco principal).
3. **Render → Environment**, adicionar:
   - `AUDIT_SIGNING_PRIVATE_KEY` = a chave privada gerada no passo 1;
   - `AUDIT_KEY_VERSION` = `1` (se não vier do `render.yaml`);
   - `ANCHOR_DATABASE_URL` = a string do projeto da âncora.
4. Fazer o push. No startup, com `RUN_MIGRATIONS_ON_START=true`, o servidor cria a tabela da âncora.
5. Conferir: `GET /api/audit/public-key` responde com a chave pública, e `GET /api/lots/<lote>/audit` responde ÍNTEGRO para o lote do seed (sem lances).

**Endurecimento opcional (não aplicado em 29/10/2026):** depois do primeiro deploy, criar no projeto da âncora um usuário só com `INSERT` e `SELECT` em `anchor_entries` e `SELECT` em `pgmigrations`, e trocar `ANCHOR_DATABASE_URL` para ele. Com o usuário dono, o gatilho já impede `UPDATE`/`DELETE` pela aplicação, mas quem tiver essa credencial poderia remover o gatilho; esse atacante está fora do modelo (`docs/AUDITORIA.md`, seção 2).

Nunca regenerar a chave em deploys: os checkpoints antigos deixariam de ser verificáveis.

## Deploy da etapa 10 (auditoria)

O candidato gerou a chave com `audit:keygen` (no PowerShell foi preciso usar `npm.cmd`, por causa da política de execução de scripts), criou o projeto Neon da âncora e cadastrou `AUDIT_SIGNING_PRIVATE_KEY` e `ANCHOR_DATABASE_URL` no Render. Push de `679e200` às 06:34:09 UTC. Nova versão no ar às 06:35:02 UTC (`/api/audit/public-key` passou de 404 para 200). Em produção o servidor só sobe com a chave e a âncora configuradas.

Verificação de fora, sem credenciais:

| Requisição | Resultado |
| --- | --- |
| `GET /api/audit/public-key` | 200, Ed25519, versão 1, PEM público; nada privado na resposta |
| `GET /api/lots/7a350b42-…/audit` | 200 **ÍNTEGRO**, 0 lances, "Lote sem lances, e a âncora também não registra nenhum"; `Cache-Control: no-store`. Esse resultado exige a âncora alcançável (sem ela seria INDISPONÍVEL) |
| Auditoria de lote inexistente | 404 |
| `/api/health` | 200, `database: ok` |

Ainda não verificado em produção: um lance real ancorado (exige login de licitante; comando no PROGRESSO).

## Deploy da etapa 11 (liquidação e comprovantes)

Push de `8b0b36b` às 14:20:15 UTC. Nova versão no ar às 14:21:30 UTC (`/api/me/participations` passou de 404 para 401). A migração `1793260000000_settlement-issues` roda no startup; o health respondeu `database: ok` com 23 s de uptime. Nenhuma variável nova: `SETTLEMENT_INTERVAL_MS` usa o padrão de 5 s.

Verificação de fora, sem credenciais:

| Requisição | Resultado |
| --- | --- |
| `GET /api/receipts/<43 caracteres desconhecidos>` | 404 JSON, "Comprovante não encontrado." |
| `GET /api/receipts/curto` (formato inválido) | 404 com a mesma resposta |
| `GET /api/me/participations` sem login | 401 `UNAUTHENTICATED` |
| `/api/health` | 200, `database: ok` |
| `/` | 200 |
| `GET /api/lots` | lote do seed ao vivo, `settled: false`, termina em 08/11 |

Ainda não verificado em produção: uma liquidação real. O lote do seed só termina em 08/11/2026; os lotes curtos de demonstração entram na etapa 21. No Render gratuito, o serviço dorme sem tráfego, e a liquidação acontece no ciclo do startup quando ele acorda.

## Tempo real (etapa 12)

O Socket.IO roda no mesmo serviço e na mesma porta (`/socket.io`), na mesma origem do site; não há variável nova. O Render aceita WebSocket no plano usado. A arquitetura é de **uma instância**: com várias, as salas precisariam de um adapter (ex.: Redis). Conexões abertas mantêm o serviço acordado; sem tráfego ele dorme e o cliente se recupera por HTTP ao voltar.

## Deploy da etapa 12 (tempo real)

Push de `b8d5eea` às 15:05:21 UTC. Nova versão no ar às 15:06:22 UTC (`GET /socket.io/?EIO=4&transport=polling` passou a responder o handshake com `sid` e `upgrades: ["websocket"]`). Nenhuma variável nova.

Verificação de fora, sem credenciais:

| Verificação | Resultado |
| --- | --- |
| Cliente `socket.io-client` como visitante, só WebSocket | Conectou pelo proxy do Render; `session.state` com `authenticated: false` |
| `lot.subscribe` no lote do seed | `ok: true` |
| `lot.subscribe` em lote inexistente | `NOT_FOUND` |
| Conexão com `Origin: https://site-malicioso.example` | Recusada |
| `GET /api/lots/<seed>` | Traz `version` (0, sem lances) |
| `/lotes/<seed>` no navegador | "Ao vivo", contagem pelo horário do servidor |
| `/api/health` | 200, `database: ok` |

Ainda não verificado em produção: lance e sala privada com usuário logado.

## Deploy da etapa 13 (base visual e navegação)

Push de `63c7028` às 16:15:29 UTC. Novo frontend no ar às 16:16:39 UTC (o bundle `/assets/index-CmTomKJ_.js` contém o texto novo "Tempo real conectado"). Nenhuma variável nova.

| Verificação (sem login) | Resultado |
| --- | --- |
| Vitrine `/` | Três seções; o lote do seed em "Ao vivo"; agendados e encerrados com estado vazio; selo "Tempo real conectado" |
| `/carteira` | Redireciona para `/entrar?next=/carteira` |
| `/lotes/<seed>/auditoria` | ÍNTEGRO, 0 lances |
| `/comprovantes/token-que-nao-existe` | "Comprovante não encontrado." |
| Rotas da SPA | 200 |
| `/api/health` | 200, `database: ok` |

Ainda não verificado em produção: telas com login.

## Deploy da etapa 14 (painel do leiloeiro)

Push de `e6a097f` às 16:42:00 UTC. Novo frontend no ar às 16:43:01 UTC (bundle `/assets/index-CYIz9qnd.js` com o texto novo "Será enviado como"). Nenhuma variável nova.

| Verificação (sem login) | Resultado |
| --- | --- |
| `/painel` | Redireciona para `/entrar?next=/painel` |
| `GET /api/catalog/search?q=harbor` | 401 `UNAUTHENTICATED` |
| `POST /api/lots` | 401 `UNAUTHENTICATED` |
| `POST /api/lots/<seed>/cancel` | 401 `UNAUTHENTICATED` |
| `/api/health` | 200, `database: ok` |

Teste em produção com login de leiloeiro (29/10/2026, autorizado pelo candidato; ele mesmo fez o login no navegador do app, a IA não digitou a senha):
- busca real "harbor": 63 obras;
- lote criado pela tela (R$ 100,00, incremento R$ 10, começar agora, fim 13:50 de Brasília): no servidor `startingBidCents` 10000, `minIncrementCents` 1000 e fim `2026-10-29T16:50:00.000Z`;
- segundo lote criado e cancelado com a confirmação da tela: "Lote cancelado. Ele saiu da vitrine."; `GET /api/lots` não o mostra mais;
- o primeiro lote terminou sem lances e o painel mudou sozinho, sem recarregar, para "Encerrado sem lances (sem vencedor)" (liquidação automática + tempo real em produção); total recebido R$ 0,00.

Ainda não verificado em produção: recusa de cancelamento com lance concorrente e liquidação com vencedor (exigem login de licitante).

## Deploy da etapa 15 (fluxo do licitante)

Push de `b08fff3` às 17:10:43 UTC. Novo frontend no ar às 17:11:37 UTC (bundle `/assets/index-TRGIn2qc.js` com "Reenviar o mesmo pedido"). Nenhuma variável nova.

| Verificação | Resultado |
| --- | --- |
| `POST /api/lots/<seed>/bids` sem login | 401 `UNAUTHENTICATED` |
| `POST /api/wallet/deposits` sem login | 401 `UNAUTHENTICATED` |
| Sala do lote do seed com a sessão de leiloeiro do candidato | Sem formulário de lance; "Leiloeiros acompanham a disputa, mas não dão lances." |
| Lance direto pela API com essa sessão | 403 `FORBIDDEN`, "Leiloeiros não dão lances." |
| `/api/health` | 200, `database: ok` |

Ainda não verificado em produção: depósito e lance com conta de licitante.

## Deploy da etapa 16 (auditoria e comprovante públicos)

Push de `4423568` às 17:45:26 UTC. Novo frontend no ar às 17:46:37 UTC (bundle `/assets/index-C18EwIv8.js` com "Identificador da transação"). Nenhuma variável nova.

| Verificação | Resultado |
| --- | --- |
| `/lotes/<seed>/auditoria` | ÍNTEGRO, lote sem lances, gênese, contagens 0 de 0, chave pública Ed25519 |
| Auditoria do lote de teste do candidato (encerrado sem lances) | ÍNTEGRO |
| `/comprovantes/token-invalido-123` | "Comprovante não encontrado" |
| `/api/health` | 200, `database: ok` |

Ainda não verificado em produção: comprovante real e auditoria de lote com lances (não há venda em produção ainda).

## Deploy da etapa 17 (testes)

Push de `d26efe7` às 18:01:21 UTC: só testes, `docs/TESTES.md` e `@playwright/test` como dependência de desenvolvimento (o pacote não baixa navegador). O serviço reiniciou às 18:02:33 UTC (`uptimeSeconds` 13). Verificado: `/api/health` 200 com `database: ok`, `/` 200, `/socket.io` respondendo o handshake.

## Deploy da etapa 18 (falhas e recuperação)

Push de `080b692` às 21:32:47 UTC. Novo frontend no ar às 21:33:43 UTC (bundle `/assets/index-CjycqQq1.js`). Verificado: `/api/health` 200 com `database: ok`; lance sem login 401; auditoria do lote do seed ÍNTEGRO. Os testes de falha da etapa rodaram só em ambiente isolado, nunca em produção.

## Deploy da etapa 19 (extras)

Push de `bc49166` às 21:49:14 UTC. No ar às 21:50:07 UTC (`/api/lots?status=invalido` passou a responder 400). Verificado: `?q=rocky` traz o lote do seed; `?q=zzz` devolve os grupos vazios; o `index.html` tem o script do tema.

## Deploy da etapa 20 (README)

Push de `c2d3c02` às 22:28:07 UTC; o serviço reiniciou às 22:29:01 UTC. Health ok, `/` 200, `README.md` público no GitHub. A correção de `config.ts` (achar `apps/api/.env` pela pasta da API) não afeta produção, que não lê arquivo `.env`.

## Deploy final e verificação pública (etapa 21)

URL: https://verzel-leiloes-ricardo.onrender.com/ — Repositório: https://github.com/takeshitos/verzel-leiloes-ricardo

Hospedagem mantida (Render free + Neon), sem serviço pago. Nenhum recurso novo foi criado nesta etapa e o banco público não foi adulterado.

| Verificação (29/10/2026, 23:26 UTC, sem login) | Resultado |
| --- | --- |
| Versão | `main` no GitHub = `99c734c`; o Render faz deploy automático a cada commit na `main` (último reinício com código novo conferido: `c2d3c02`, 22:29 UTC; os commits seguintes só mudaram docs) |
| Serviço dormindo | No primeiro acesso, `uptimeSeconds` 23: o serviço estava suspenso e acordou com a requisição |
| `/api/health` | 200, `database: ok` |
| Rotas profundas (`/`, `/entrar`, `/painel`, `/carteira`, `/participacoes`, `/lotes/<id>`, `/lotes/<id>/auditoria`, `/comprovantes/<x>`) | 200 `text/html` (refresh funciona) |
| `/api/nao-existe` | 404 `application/json` "Rota da API não encontrada." |
| HTTP → HTTPS | 301 para `https://` |
| WSS | Cliente Socket.IO como visitante conectou por WebSocket seguro, entrou na sala do lote do seed; lote inexistente `NOT_FOUND`; outra origem recusada |
| Segredos no bundle (`/assets/index-kS9KLzZk.js`) | Nenhum de: `AUDIT_SIGNING`, `PRIVATE KEY`, `postgres://`, `npg_`, `DATABASE_URL`, `VITE_`, senha de demonstração |
| Vitrine | 1 ao vivo (lote do seed, até 08/11/2026 02:03 UTC), 1 encerrado |
| Busca no museu sem login | 401 (só leiloeiro) |
| Chave pública | `/api/audit/public-key` Ed25519 |
| GitHub | Repositório público (API do GitHub, sem sessão), página 200 |
| Configuração | `render.yaml`: build `npm ci --include=dev && npm run build`, start `node apps/api/dist/server.js`, Node 24.22.1 (`.node-version`), `TRUST_PROXY=1`, `CLIENT_IP_HEADER=cf-connecting-ip`, health check; em produção o servidor escuta em `0.0.0.0:$PORT`; cookie `__Host-sid` HttpOnly, Secure, SameSite=Lax (conferido pelo candidato na etapa 05); migrações e seed **idempotente** no startup (nada destrutivo); banco e âncora em dois projetos Neon persistentes; chave só no ambiente do Render, nunca regenerada |

### Encerramento com o serviço dormindo

O job de liquidação roda **dentro do processo**. No plano gratuito, sem tráfego por 15 min, o processo é suspenso e **nada roda**: um lote que vence nesse período **não é encerrado no horário**, e sim quando o serviço acordar (o job roda no startup). Isso **não equivale** a encerramento pontual: o resultado e o comprovante só aparecem depois do próximo acesso. Durante a disputa ativa há tráfego (Socket.IO) e o serviço fica acordado. Para encerramento pontual sem visitante seria preciso um plano sem suspensão (pago, não contratado) ou um ping externo.

### Smoke test com login (pendente de execução pelo candidato)

A IA não faz login em produção. O fluxo completo com as contas do seed está automatizado em `e2e/smoke.prod.ts` (Playwright no Chrome; não sobe servidor nem mexe em banco). Ele cria um lote de ~5 min, deposita R$ 100,00 em cada cliente, dá dois lances (100,00 e 110,00), espera o encerramento real e confere o painel do leiloeiro, o comprovante e a auditoria como visitante. Os dados ficam no histórico público como demonstração.

```bash
SMOKE_PASSWORD='senha-das-contas-de-demonstracao' npm run smoke:prod
```

No PowerShell: `$env:SMOKE_PASSWORD='...'; npm.cmd run smoke:prod`. Sem a variável, o teste é pulado (conferido: "1 skipped").

**Estado:** Executado pelo candidato em 29/10/2026 (PowerShell, `npm.cmd run smoke:prod`): **1 passed em 4,4 min**. Lote `/lotes/10ac25ad-042e-48c9-adeb-47b1c1ff4808` ("Harbor of Boston, with the City in the Distance"), comprovante `LIQ-87F3689F22` de R$ 110,00 para LIC-C5B4DB, liquidado às 23:34:01 UTC. Conferido em seguida pela IA, sem login: `/api/receipts/<token>` 200 com esses dados e auditoria do lote ÍNTEGRO (2 lances, 2 assinados, 2 na âncora).

### Lote aberto para a avaliação

O seed mantém o lote "Rocky, Wooded Landscape with a Dell and Weir" ao vivo até 08/11/2026 02:03 UTC (23:03 de 07/11 em Brasília). Para um encerramento rápido durante a avaliação, crie um lote curto pelo Painel do leiloeiro (README, "Preparar lotes para a avaliação").

## Deploy das correções da revisão final (etapa 22)

Push de `fea0e75` às 23:44:11 UTC; reinício às 23:45:06 UTC. `/api/health` ok e auditoria do lote do seed ÍNTEGRO. A nova regra de configuração (âncora precisa ser outro banco) passou em produção, o que confirma que `ANCHOR_DATABASE_URL` aponta para um banco diferente do `DATABASE_URL`.
