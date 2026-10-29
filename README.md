# Casa de Leilões (teste técnico Verzel)

Casa de leilões **fictícia** de obras de arte. Leiloeiros criam lotes com obras do acervo aberto (CC0) do Cleveland Museum of Art; licitantes depositam **saldo simulado**, disputam lotes em tempo real e arrematam. Nenhum valor é real, nenhuma obra é vendida e não há pagamento de verdade. O museu não tem relação com este projeto.

- **Aplicação publicada:** https://verzel-leiloes-ricardo.onrender.com/
- **Repositório:** https://github.com/takeshitos/verzel-leiloes-ricardo

> No plano gratuito do Render o serviço **dorme após 15 min sem acesso**. O primeiro acesso depois disso pode levar cerca de 1 minuto. O encerramento automático roda dentro do servidor: um lote que vence enquanto ele dorme **não é encerrado no horário**, e sim no próximo acesso (o job roda ao acordar). Durante uma disputa ativa há tráfego e o serviço fica acordado.

## Estado da entrega

Os 15 requisitos funcionais (R01 a R15 de `docs/REQUISITOS.md`) estão implementados e testados. Exceções e comportamentos que um avaliador pode estranhar:

| Ponto | Situação |
| --- | --- |
| Auditoria (R13) | Atendida **dentro do modelo de ameaça** de `docs/AUDITORIA.md`, não de forma absoluta. Um lance apagado antes de chegar à âncora (janela de milissegundos) pode não ser detectado. |
| Cancelar lote **com** lances e estornar | **Não implementado** de propósito (extra opcional; mexeria em reservas, concorrência, auditoria e liquidação). Só é possível cancelar lote sem lances. |
| Criar lote | Não tem chave de idempotência. Se a resposta se perder, a tela avisa e pede para conferir a lista antes de tentar de novo. |
| Tempo real | Uma instância do servidor. Com várias, seria preciso um adapter do Socket.IO. A tela sempre se recupera por HTTP. |
| Lote do seed em produção | Termina em 08/11/2026. Para ver um encerramento rápido, crie um lote curto (seção "Preparar lotes para a avaliação"). |
| Prorrogação (anti-sniping) | **Interpretação** nossa do enunciado; está explicada abaixo. |
| Cobertura de testes | Número de testes medido (`docs/TESTES.md`); cobertura de linhas **não** foi medida. |

## Contas de demonstração

Criadas pelo seed (local e produção). Senha das três: `leilao-demo-2026`. São contas fictícias, só para avaliação.

| Email | Papel | O que faz |
| --- | --- | --- |
| `leiloeiro@example.com` | Leiloeiro | Busca obras, cria e cancela lotes, vê resultados e total recebido. Não dá lances. |
| `cliente1@example.com` | Licitante | Começa com R$ 10.000,00 simulados. Deposita, dá lances, arremata. |
| `cliente2@example.com` | Licitante | Igual ao cliente1. |

Também é possível criar contas novas em "Entrar → Criar conta", escolhendo o papel (o papel não muda depois).

## Roteiro para avaliar

1. **Visitante:** abra a vitrine (ao vivo, agendados e encerrados; cancelados não aparecem). Filtre por título ou estado. Abra um lote e a "Auditoria do histórico".
2. **Leiloeiro:** entre como `leiloeiro@example.com` → **Painel**. Busque uma obra (ex.: "landscape"), escolha, informe lance inicial, incremento e fim (o fuso aparece na tela) e crie o lote. Crie outro e cancele-o (só sem lances).
3. **Licitante A** (`cliente1`) em uma janela e **licitante B** (`cliente2`) em uma **janela anônima** (sessões separadas). Em **Carteira**, deposite um valor. Na sala do lote, A dá o lance mínimo: aparece "Você está ganhando" e o valor fica reservado. B vê o lance sem recarregar e cobre; A passa a "Você foi superado" e a reserva volta na hora.
4. Lance nos **2 minutos finais** prorroga o fim nas duas telas.
5. Quando o lote termina, o servidor liquida sozinho: B vê "Você arrematou este lote" e o link do comprovante; o total de B cai; o painel do leiloeiro mostra o valor recebido.
6. **Participações** (licitante) lista todos os lotes com lance, posição e resultado, com link do comprovante para copiar e compartilhar. O comprovante abre sem login.

## Stack

| Parte | Tecnologia |
| --- | --- |
| Frontend | React 19.3.1, React Router 8.5.1, Vite 8.3.5, TypeScript 6.0.3, socket.io-client 4.8.4, CSS próprio (tema claro/escuro) |
| Backend | Node.js 24 LTS (`engines`: `>=24.11.0 <27`), Express 5.3.0, Socket.IO 4.8.4, zod 4.6.7, TypeScript 6.0.3 |
| Banco | PostgreSQL 18 com `pg` 8.23.1 e SQL parametrizado; migrações em SQL puro com node-pg-migrate 9.0.0 |
| Auditoria | SHA-256, Ed25519 (`node:crypto`) e um segundo PostgreSQL como âncora |
| Testes | Vitest 5.0.5 + Supertest (PostgreSQL real), Playwright 1.64.1 (E2E) |
| Deploy | Render (um serviço Node com SPA, API e Socket.IO na mesma origem) + Neon (dois projetos PostgreSQL) |

Monorepo com npm workspaces: `apps/api` e `apps/web`. Em produção, um único servidor serve o build do React, a API em `/api` e o Socket.IO.

## Rodar localmente

### Requisitos

- Node.js **24.11 ou mais novo, antes do 27** (desenvolvido com 26.13.0; produção usa 24.22.1) e npm 11.
- PostgreSQL 18, **instalado** ou pelo **Docker Compose** do projeto.
- Git. Para o E2E, o Google Chrome instalado.

No **PowerShell do Windows**, se aparecer "a execução de scripts foi desabilitada", use `npm.cmd` no lugar de `npm` (ou o Git Bash).

### 1. Clonar e instalar

```bash
git clone https://github.com/takeshitos/verzel-leiloes-ricardo.git
cd verzel-leiloes-ricardo
npm ci
```

### 2. Banco de dados

**Com Docker Compose** (PostgreSQL 18.3 na porta **5433**, credenciais só de desenvolvimento):

```bash
docker compose up -d
```

**Sem Docker:** use um PostgreSQL 18 já instalado; o usuário precisa poder criar bancos (os scripts criam os bancos locais que faltarem).

### 3. Variáveis de ambiente

```bash
cp apps/api/.env.example apps/api/.env
```

Edite `apps/api/.env`:

- `DATABASE_URL` e `TEST_DATABASE_URL`: escolha a opção A (PostgreSQL instalado, troque usuário e senha) **ou** a B (Compose, já preenchida e comentada). O banco de teste precisa terminar em `_test` (os testes destrutivos se recusam a rodar em outro).
- `ANCHOR_DATABASE_URL` e `TEST_ANCHOR_DATABASE_URL`: a âncora da auditoria, outro banco. O exemplo usa o Compose; com PostgreSQL instalado, aponte para ele (ex.: `.../verzel_anchor` e `.../verzel_anchor_test`).
- `AUDIT_SIGNING_PRIVATE_KEY`: gere uma chave só sua de desenvolvimento e cole o valor impresso:

```bash
npm run audit:keygen -w apps/api
```

As demais variáveis têm padrão (comentadas no `.env.example`). O `.env` não vai para o git.

### 4. Migrações e seed

```bash
npm run db:migrate
npm run db:migrate:anchor
npm run db:seed
```

O seed é idempotente: cria as três contas, os depósitos iniciais e um lote ao vivo de 10 dias com obra salva no banco (não precisa da API do museu).

### 5. Desenvolvimento

```bash
npm run dev
```

Abre a API em http://localhost:3000 e o Vite em **http://localhost:5173** (use este endereço; o Vite encaminha `/api` e `/socket.io` para a API).

### 6. Build e execução como em produção

```bash
npm run build
npm start
```

Serve tudo em http://localhost:3000 (SPA, API e Socket.IO).

### 7. Testes

| Comando | O que roda |
| --- | --- |
| `npm run db:migrate:test` e `npm run db:migrate:anchor:test` | Preparam os bancos de teste (o `npm test` também aplica as migrações sozinho) |
| `npm test` | API (Vitest + Supertest com PostgreSQL e âncora de teste reais) e web |
| `npm run test:e2e` | Build + Playwright no Chrome instalado, com a aplicação real nos bancos `_test` (~5 min; o lote termina de verdade) |
| `npm run test:live -w apps/api` | 3 testes contra a API real do museu (precisa de internet) |
| `SMOKE_PASSWORD=... npm run smoke:prod` | Smoke test contra a **URL pública** com as contas de demonstração (cria um lote curto e dá lances reais de demonstração; ~6 min). Sem a senha, é pulado |
| `npm run typecheck`, `npm run lint` | Tipos (API, web e E2E) e ESLint |

Não rode `npm test` e `npm run test:e2e` ao mesmo tempo: os dois limpam o banco de teste. Resultados medidos e o mapa de testes por requisito estão em `docs/TESTES.md`; testes de falha em `docs/TESTES_DE_FALHA.md`.

### Lote de demonstração extra (local)

```bash
npm run db:demo-lot -- --key minha-demo --minutes 5
```

Cria um lote ao vivo que termina em 5 minutos (`--item 152006` troca a obra). Não apaga nada.

## Como as regras funcionam

- **Dinheiro em centavos inteiros.** A API recebe e devolve centavos; o banco guarda `BIGINT`. A tela converte "1.234,56" em centavos só com texto e inteiros, nunca com ponto flutuante.
- **Carteira:** total (depósitos menos arremates), comprometido (soma das reservas em **todos** os lotes que a pessoa lidera) e disponível = total − comprometido. Liderar reserva o valor do lance; ser superado libera a reserva na mesma transação do novo lance. Um lance só é aceito se couber no disponível.
- **Regras de lance:** o primeiro lance pode ser igual ao inicial; os seguintes, no mínimo o atual + o incremento. O líder não cobre o próprio lance. Leiloeiro não dá lance. Cada recusa tem código e mensagem própria e não altera histórico, saldo nem fim.
- **Intervalo:** lance aceito se `início ≤ agora < fim` (início inclusivo, fim exclusivo), pelo **relógio do PostgreSQL lido depois dos bloqueios**. Um lance enviado antes do fim que só consegue o bloqueio depois do fim é recusado.
- **Concorrência:** cada lance roda numa transação que bloqueia o lote (`FOR UPDATE`) e depois as carteiras envolvidas em ordem crescente de id (sem deadlock). Lance e depósito exigem `Idempotency-Key`: repetir o mesmo pedido devolve a mesma resposta, sem duplicar.
- **Prorrogação (anti-sniping), interpretação:** se um lance é aceito com **até 120 segundos** restantes, o novo fim passa a ser **horário de aceitação + 120 segundos** (o fim nunca diminui). Ex.: fim 15:00:00, lance às 14:59:30 → novo fim 15:01:30.
- **Encerramento e liquidação:** automáticos no servidor (job no startup e a cada 5 s), sem depender de tela aberta. A liquidação só paga com a auditoria ÍNTEGRA e numa transação: debita o vencedor, credita o leiloeiro, gera o comprovante. É idempotente (repetir ou rodar em dois servidores não cobra duas vezes) e recuperável após reinício. Lote sem lances fecha sem vencedor.
- **Snapshot da obra:** ao criar o lote, o servidor busca a obra no museu e guarda uma cópia no banco. Vitrine, sala, auditoria e comprovante leem só o banco e funcionam com o museu fora do ar; só a busca do leiloeiro mostra "indisponível". Imagem que não carrega vira uma imagem local.
- **Tempo real e reconexão:** eventos do Socket.IO só depois do COMMIT, com versão crescente por lote. A tela descarta evento antigo e busca o estado por HTTP ao conectar, reconectar, voltar à aba e perceber lacuna; sem tempo real, consulta periodicamente. Sala privada por usuário decidida pelo cookie de sessão no servidor.
- **Pseudônimos:** respostas e eventos públicos mostram só pseudônimos aleatórios (`LIC-…`, `VEN-…`), nunca email, nome, id interno, sessão ou saldo (há teste lendo todas as respostas públicas como texto).

## Integridade do histórico (auditoria)

Resumo; o protocolo, o modelo de ameaça e os testes estão em **`docs/AUDITORIA.md`**.

1. **Cadeia de hashes** por lote: cada lance guarda o SHA-256 do anterior mais o próprio conteúdo.
2. **Checkpoint assinado (Ed25519)** a cada lance, com uma chave que fica só na configuração do servidor (fora do banco).
3. **Âncora independente:** cada checkpoint também vai para um **segundo PostgreSQL** (outro projeto Neon em produção), numa tabela que só aceita inclusões.

A página pública `/lotes/:id/auditoria` mostra **ÍNTEGRO**, **ADULTERADO**, **VERIFICAÇÃO PENDENTE** ou **VERIFICAÇÃO INDISPONÍVEL**. Sem a âncora, nunca mostra ÍNTEGRO.

- **Coberto:** quem altera o banco principal (valor, horário, autoria, inserção, remoção no meio, no fim ou de tudo, reordenação, recálculo de hashes, restauração de backup antigo) sem ter a chave nem a âncora.
- **Não coberto:** quem controla o próprio servidor (chave e âncora); o dono das contas Render/Neon; lance apagado antes de chegar à âncora; carteiras e liquidações (protegidas por transações e restrições do banco, não pela cadeia).
- **Onde persistem:** a chave privada fica só na variável `AUDIT_SIGNING_PRIVATE_KEY` do Render (e numa cópia offline do candidato); a pública é publicada em `/api/audit/public-key`. A âncora é o banco de `ANCHOR_DATABASE_URL`.
- **Recuperação:** a chave **nunca** é regenerada no deploy; sem ela (ou com chave inválida) o servidor não sobe. Checkpoints que não chegaram à âncora ficam pendentes e um reconciliador (startup e a cada 30 s) os grava **sem assinar de novo**. Uma restauração legítima de backup aparece como ADULTERADO e exige ação do operador (sem re-assinatura automática). `npm run audit:check -w apps/api` verifica todos os lotes, inclusive lotes que existem na âncora e sumiram do banco.

## Estrutura

```
apps/api/src/
  server.ts              startup: config, migrações/seed (produção), auditoria, job de liquidação, Socket.IO
  app.ts                 rotas Express e serviço do build do React
  db/                    pool, transação, migrações, seed, lote de demonstração
  modules/
    auth/                cadastro, login, sessão (cookie HttpOnly), papéis
    catalog/             cliente da API do museu (timeout, cache) e snapshot das obras
    lots/                criação, cancelamento, vitrine, painel do leiloeiro, participações
    wallet/              carteira, depósito simulado, bloqueio das carteiras
    bids/                regras e serviço transacional do lance
    audit/               cadeia, chaves, âncora, verificação, reconciliador
    settlement/          liquidação, job de encerramento, comprovante
    realtime/            eventos de domínio e Socket.IO
  shared/                config, erros, dinheiro, idempotência, proteções de requisição
apps/api/migrations/     SQL do banco principal;  migrations-anchor/  SQL da âncora
apps/api/test/           testes da API (PostgreSQL real)
apps/web/src/            páginas, componentes, sessão, tempo real e formulários
e2e/                     Playwright (servidor de teste e cenários)
docs/                    requisitos, decisões, plano, auditoria, testes, deploy, progresso, uso de IA
```

## Deploy

Render (Blueprint `render.yaml`): um web service Node no plano gratuito, `npm ci --include=dev && npm run build`, start `node apps/api/dist/server.js`, health check `/api/health`. No startup, aplica as migrações (banco e âncora) e roda o seed idempotente. Banco principal e âncora em **dois projetos Neon** separados.

Variáveis cadastradas no painel do Render (segredos nunca vão para o repositório): `DATABASE_URL`, `ANCHOR_DATABASE_URL`, `AUDIT_SIGNING_PRIVATE_KEY` (e `AUDIT_KEY_VERSION`). As demais estão no `render.yaml`. Passo a passo e verificações de cada deploy em `docs/DEPLOY.md`. A âncora usa o usuário dono do projeto Neon dela: o gatilho do banco recusa `UPDATE` e `DELETE` vindos da aplicação, mas um usuário restrito (só `INSERT` e `SELECT`) **não foi configurado** (endurecimento opcional descrito em `docs/DEPLOY.md`).

### Preparar lotes para a avaliação

- O seed mantém **um lote ao vivo** em produção (termina em 08/11/2026).
- Para um lote curto (ver encerramento e comprovante), entre como `leiloeiro@example.com` em produção e crie pelo **Painel** um lote com fim em poucos minutos.
- Alternativa pelo terminal, com a `DATABASE_URL` de produção apenas na sua sessão (não salve em arquivo do repositório): `npm run db:demo-lot -- --key avaliacao --minutes 30`.

## Documentação

| Arquivo | Conteúdo |
| --- | --- |
| `docs/REQUISITOS.md` | Requisitos R01–R20 e extras, com estado e evidência |
| `docs/DECISOES.md` | Decisões e interpretações (com o que foi decidido pelo candidato) |
| `docs/PLANO.md` | Arquitetura, contratos HTTP e eventos |
| `docs/AUDITORIA.md` | Protocolo de integridade, ameaças, limites e resultados |
| `docs/TESTES.md` / `docs/TESTES_DE_FALHA.md` | Suítes, resultados e testes de falha |
| `docs/DEPLOY.md` | Render, Neon e verificação de cada deploy |
| `docs/PROGRESSO.md` | Diário das etapas com comandos e resultados reais |
| `docs/USO_DE_IA.md` | Como a IA foi usada, etapa por etapa |

## Uso de IA

IA foi usada do planejamento à entrega. Esta seção resume o que aconteceu; o diário completo, com cada etapa, está em `docs/USO_DE_IA.md` e os comandos com resultados em `docs/PROGRESSO.md`.

### Ferramentas

- **Planejamento:** um assistente de IA leu o PDF do desafio e preparou um kit com requisitos, decisões propostas, cronograma, critérios de validação e uma sequência de prompts (etapas 00 a 23).
- **Implementação:** **Claude Code** (app desktop, modelo **Claude Opus 5.5**), com terminal, editor de arquivos e um navegador embutido para conferir as telas. Nas etapas finais, o Playwright passou a fazer parte dos testes automáticos.

### Como foi o processo

1. Cada etapa começava com o prompt do kit e a leitura dos documentos de controle (`docs/REQUISITOS.md`, `docs/DECISOES.md`, `docs/PROGRESSO.md`).
2. A IA implementava só aquela etapa, rodava as verificações (testes com PostgreSQL real, typecheck, lint, build e, quando havia tela, o navegador) e registrava comandos e resultados reais.
3. No fim de cada etapa, a IA perguntava se podia fazer commit e push; **nada foi para o GitHub sem a autorização explícita do candidato**.
4. Depois de cada push, a IA acompanhava o deploy no Render e conferia a URL pública de fora, sem login.

As decisões do kit foram tratadas como propostas até serem implementadas e verificadas. Quando algo mudou (por exemplo, a troca do catálogo), a mudança ficou registrada em `docs/DECISOES.md`.

### Quem fez o quê

| A IA (Claude Code) | O candidato |
| --- | --- |
| Escreveu praticamente todo o código de `apps/api`, `apps/web` e `e2e`, as migrações, o seed, o `render.yaml`, o `docker-compose.yml`, este README e os documentos em `docs/` | Decidiu os pontos abertos: catálogo de Cleveland, Docker, Neon, extras e se cada correção da revisão final entraria |
| Escreveu e rodou os testes (Vitest com PostgreSQL real, Supertest, Playwright) e conferiu as telas no navegador | Criou as contas e serviços externos: repositório no GitHub, serviço no Render, dois projetos no Neon |
| Fez commit e push quando autorizado e acompanhou cada deploy | Gerou e cadastrou a chave de auditoria de produção (a IA nunca viu a chave) |
| Registrou cada etapa com comandos e resultados reais | Fez os logins em produção quando foi preciso e rodou o smoke test com login (`npm run smoke:prod`, 1 passed) |

A IA **não** criou contas, não acessou os painéis do Render ou do Neon, não digitou senha em produção e não contratou nenhum serviço.

### O que cada etapa produziu

| Etapa | Resultado |
| --- | --- |
| 00–01 | Requisitos R01–R20 a partir do PDF; validação de versões e APIs; troca do catálogo para o Cleveland Museum of Art (as imagens da primeira opção eram bloqueadas) |
| 02–03 | Monorepo, servidor único e primeiro deploy no Render |
| 04 | PostgreSQL (com e sem Docker), migrações em SQL, seed idempotente |
| 05 | Cadastro, login, sessão em cookie HttpOnly, papéis e proteção contra CSRF |
| 06–07 | Cliente da API do museu com timeout e cache, snapshot da obra, criação e cancelamento de lotes, vitrine |
| 08–09 | Carteira, depósito idempotente e lance transacional com reservas, bloqueios e prorrogação |
| 10 | Auditoria: cadeia de hashes, checkpoint assinado (Ed25519) e âncora em outro banco |
| 11 | Encerramento automático, liquidação idempotente, comprovante e participações |
| 12 | Tempo real (Socket.IO) com reconexão e recuperação por HTTP |
| 13–16 | Interface: navegação, painel do leiloeiro, fluxo do licitante, auditoria e comprovante públicos |
| 17 | Mapa de testes por requisito, teste de privacidade das respostas públicas e E2E com Playwright |
| 18 | Testes de falha (resposta perdida, evento perdido, âncora fora do ar) e correções |
| 19 | Extras: filtro da vitrine e tema claro/escuro |
| 20 | Este README, reproduzido num clone limpo |
| 21 | Verificação pública final e smoke test de produção |
| 22 | Revisão final por requisito (`docs/REVISAO_FINAL.md`) e correções aprovadas pelo candidato |

### Verificação do trabalho da IA

O código gerado não foi aceito só por "parecer certo":
- **Testes contra PostgreSQL real**, inclusive disputas com conexões simultâneas (bloqueio seguro de verdade antes de soltar os concorrentes), ataques à auditoria em banco isolado e falhas simuladas.
- **Provas de que os testes pegam erros:** mudanças erradas feitas de propósito e desfeitas em seguida (aceitar lance R$ 0,01 abaixo do mínimo derrubou 3 testes; expor o id do licitante derrubou o teste de privacidade; desligar uma checagem da auditoria derrubou 3 testes de remoção).
- **Navegador:** cada tela foi conferida em desktop e celular; os fluxos com dois licitantes usaram sessões separadas.
- **Produção:** cada deploy conferido de fora; smoke test completo com login rodado pelo candidato.
- **Resultados finais:** API 242 testes, web 28, E2E 4 cenários (`docs/TESTES.md`).

### Defeitos que a própria verificação encontrou e foram corrigidos

- Build do Render sem as dependências de desenvolvimento (corrigido com `npm ci --include=dev`).
- Perda de microssegundos ao regravar o fim do lote, que faria o lance dar erro 500.
- Índice duplicado numa migração; lotes de teste curtos demais (a prorrogação mudava o fim).
- Avisos de interface antigos ou contraditórios e regras de efeito do React apontadas pelo lint.
- Lance já gravado respondendo 500 quando a confirmação na âncora falhava depois do commit.
- "Sem resposta do servidor" tratada como recusa no cancelamento e na criação de lote.
- `npm start` na raiz não encontrava `apps/api/.env` (achado ao seguir este README num clone limpo).
- Revisão final: documentação que afirmava uma restrição de permissão da âncora não aplicada, e falta de trava contra configurar a âncora no mesmo banco principal.

### Limites e recusas

- As skills de design pedidas pelo candidato (`frontend-design` e `Superdesign`) não estavam disponíveis; a interface foi feita com CSS próprio.
- Uma tentativa de contornar o bloqueio de imagens do primeiro museu foi recusada pela política de segurança da sessão; a solução foi trocar o catálogo.
- A IA não faz login em produção; por isso o smoke test com login foi preparado por ela e executado pelo candidato.

### O que o candidato revisou

Informado pelo candidato em 29/10/2026: leu os resumos de cada etapa antes de autorizar commit e push, testou o site publicado, leu o README e os documentos em `docs/` e leu parte do código.
