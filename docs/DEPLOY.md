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
| `DATABASE_URL` | Painel do Render → Environment (segredo) | Etapa 04 | String de conexão do projeto Neon principal, com `sslmode=require` |
| `ANCHOR_DATABASE_URL` | Painel do Render (segredo) | Etapa 10 | Projeto Neon da âncora, com usuário só de INSERT/SELECT |
| `AUDIT_SIGNING_PRIVATE_KEY` | Painel do Render (segredo) | Etapa 10 | Chave Ed25519 gerada uma vez e guardada offline; nunca regenerar no deploy |

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

- O serviço dorme após 15 minutos sem tráfego; a primeira visita depois disso leva cerca de 1 minuto. Durante o sono, o job de encerramento de lotes não roda: os lotes vencidos são liquidados quando o serviço acorda (a partir da etapa 11).
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

## Pendências

1. Conferir no log do Render a versão do Node e o SIGTERM num redeploy.
2. Criar os projetos no Neon até a etapa 04.
3. Deploy final e smoke test completo na etapa 21.
