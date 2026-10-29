# Registro do uso de IA

## Resumo consolidado (29/10/2026, etapa 20)

**Planejamento.** Antes do código, um assistente de IA analisou o PDF do desafio e preparou um kit com requisitos, decisões propostas, cronograma, critérios de validação e uma sequência de prompts (etapas 00 a 23) para o Claude Code. As decisões desse kit foram tratadas como propostas até serem implementadas e verificadas.

**Implementação.** Todas as etapas (00 a 20) foram executadas com o **Claude Code no app desktop, modelo Claude Opus 5.5**, uma etapa por vez, a partir dos prompts do kit. A IA escreveu o código, os testes e a documentação, rodou os comandos e verificou no navegador embutido. O candidato decidiu os pontos abertos (catálogo de Cleveland, Docker, Neon, extras), autorizou cada commit e push, criou as contas e serviços externos (GitHub, Render, Neon), gerou e cadastrou a chave de auditoria de produção e fez os logins em produção quando foi preciso. A IA não criou contas, não acessou painéis do Render ou do Neon e não digitou senha em produção.

**Arquivos.** Praticamente todo o conteúdo de `apps/api`, `apps/web`, `e2e`, `render.yaml`, `docker-compose.yml`, `README.md` e `docs/` foi gerado pela IA; o detalhe por etapa está abaixo.

**Defeitos encontrados pela própria verificação e corrigidos** (detalhes em `docs/PROGRESSO.md`):
- build do Render sem devDependencies (`npm ci --include=dev`, etapa 03);
- perda de microssegundos ao regravar o fim do lote, que daria erro 500 no lance (etapa 09);
- índice duplicado numa migração (etapa 11) e lotes de teste curtos demais (prorrogação);
- regras de efeito do React apontadas pelo lint e avisos de interface antigos ou contraditórios (etapas 12 a 15);
- lance já gravado respondendo 500 quando a confirmação na âncora falhava depois do commit (etapa 18);
- "sem resposta" tratada como recusa no cancelamento e na criação de lote (etapa 18);
- `npm start` na raiz não encontrava `apps/api/.env` (etapa 20, achado ao reproduzir o README num clone limpo).

**Limites do trabalho com IA registrados.** As skills de design pedidas (`frontend-design` e `Superdesign`) não estavam disponíveis; a interface foi feita com CSS próprio. Uma tentativa de contornar o bloqueio de imagens da AIC foi recusada pela política da sessão e o catálogo foi trocado.

**O que o candidato leu, revisou ou ajustou** (informado pelo candidato em 29/10/2026): li os resumos de cada etapa antes de autorizar commit e push, testei o site publicado, li o README e as docs em docs/ e li parte do código.

### Texto curto para o formulário (só fatos; completar o campo pendente)

> Usei o Claude Code (modelo Claude Opus 5.5) para planejar e implementar o projeto etapa por etapa, a partir de um roteiro de prompts preparado com IA a partir do PDF. A IA escreveu o código, os testes (Vitest com PostgreSQL real e Playwright) e a documentação, e verificou cada etapa com testes, typecheck, build e navegador; os defeitos que ela encontrou e corrigiu estão listados em docs/USO_DE_IA.md. Eu tomei as decisões abertas, criei as contas e o deploy (Render e Neon), gerei a chave de auditoria de produção e autorizei cada commit e push. Revisei pessoalmente: li os resumos de cada etapa antes de autorizar commit e push, testei o site publicado, li o README e as docs em docs/ e li parte do código.

## Planejamento inicial

Um assistente de IA analisou o PDF fornecido e preparou este kit com requisitos, decisões propostas, cronograma, critérios de validação e prompts para Claude Code. Este parágrafo foi escrito antes da implementação; o resumo acima descreve o que aconteceu depois.

## Registro durante a implementação

Para cada etapa, preencha com fatos: ferramenta usada, tarefa solicitada, arquivos gerados ou alterados, verificação executada, erro encontrado, correção aplicada e o que o candidato efetivamente leu, compreendeu ou ajustou.

### Etapa 00 — Início e controle (28/10/2026)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** ler `CLAUDE.md` e o prompt 00 e executar só a etapa 00: conferir o PDF, criar a lista de requisitos, atualizar os documentos de controle e conferir o ambiente sem implementar o produto.
- **Arquivos gerados ou alterados:** criado `docs/REQUISITOS.md`; atualizados `docs/DECISOES.md`, `docs/PROGRESSO.md` e este arquivo; PDF renomeado para `docs/desafio-original.pdf`. Nenhum código.
- **Verificações executadas:** comandos de versão e estado somente leitura (lista e resultados em `PROGRESSO.md`); consulta à API pública do GitHub sobre o repositório; contagem das 20 linhas de requisitos e busca por referências ao nome antigo do PDF.
- **Problema encontrado:** o PDF não tem texto extraível (páginas em imagem) e `pdftoppm` não está instalado. **Contorno:** as imagens JPEG das páginas foram extraídas por um script Node temporário fora do projeto e lidas visualmente pela IA, sem OCR.
- **Decisões tomadas pelo candidato nesta etapa:** data de recebimento (22/10/2026, prazo 29/10/2026); deixar `git init` para a etapa 02; não versionar PDF, guia e prompts; renomear o PDF.
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).

### Etapa 01 — Validar plano e dependências (28/10/2026)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5, com terminal, leitura de páginas web e navegador embutido do app.
- **Tarefa solicitada:** o candidato pediu para seguir o passo a passo normal em vez do prompt de prazo curto; a IA executou só a etapa 01.
- **Arquivos gerados ou alterados:** criados `docs/PLANO.md` e `docs/fixtures/catalog/` (README e três respostas reais de API); atualizados `docs/DECISOES.md`, `docs/PROGRESSO.md` e este arquivo. Nenhum código.
- **Verificações executadas:** consultas ao registro do npm (versões, engines e peerDependencies); índice oficial de versões do Node; chamadas reais às APIs da AIC, de Cleveland e do Met; abertura de imagens no navegador embutido; leitura da documentação do Render e do Neon. Resultados em `PROGRESSO.md`.
- **Problemas encontrados:**
  - A imagem IIIF da AIC foi bloqueada pelo Cloudflare. A IA tentou repetir a requisição com cabeçalho de navegador; a política da sessão recusou o pedido por ser contorno de proteção, e ele não foi repetido. A IA propôs trocar o catálogo para Cleveland.
  - O TypeScript 7 é incompatível com o `typescript-eslint`, então foi escolhido o 6.0.3.
  - A página de preços do Render não pôde ser lida.
- **Decisão do candidato nesta etapa:** seguir a ordem normal dos prompts.
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).

### Etapa 02 — Estrutura do projeto (28/10/2026)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5, com terminal e navegador embutido (preview dos servidores locais).
- **Tarefa solicitada:** o candidato confirmou o catálogo de Cleveland e pediu a etapa 02.
- **Arquivos gerados pela IA:** `package.json`, `package-lock.json` (gerado pelo npm), `tsconfig.base.json`, `eslint.config.js`, `.gitignore`, `.gitattributes`, todo o conteúdo de `apps/api` e `apps/web` e `.claude/launch.json` (local, ignorado pelo git). Também `git init` e remote `origin`, sem commit.
- **Verificações executadas:** instalação, typecheck, lint (com conferência de que os arquivos foram de fato analisados), build, servidor de produção testado com `curl` (health, SPA, 404 JSON, JSON malformado, corpo grande, arquivo inexistente), encerramento, configuração inválida, porta indisponível e o modo de desenvolvimento no navegador. Resultados em `PROGRESSO.md`.
- **Erros encontrados e correções:**
  - O teste de encerramento por sinal travou no Windows. Foi trocado por um evento disparado no processo; a entrega real do sinal fica para o deploy em Linux.
  - A ferramenta de preview injetou `PORT=5173` e a API subiu na porta errada. A correção foi feita só na configuração local do preview, sem mudar o código.
  - Uma leitura de página feita logo após um clique mostrou o conteúdo antigo. Repetida com espera, a navegação estava correta.
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).
- **Commit:** `dae1242`, criado pela IA a pedido do candidato, com a linha de coautoria da IA.

### Etapa 03 — Primeiro deploy (28/10/2026, concluída)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 03; o candidato autorizou o push da `main` para o GitHub.
- **Arquivos gerados pela IA:** `render.yaml`, `.node-version` e `docs/DEPLOY.md`; atualizações em DECISOES, REQUISITOS, PROGRESSO e neste arquivo.
- **Verificações executadas:** push e conferência do conteúdo público pela API do GitHub; leitura da documentação do Render (Blueprint) e do Neon (regiões); simulação do build do Render numa cópia limpa, com e sem `--include=dev`; servidor de produção na porta 10000. A IA não criou contas nem serviços e não acessou painéis do Render ou do Neon.
- **Erro encontrado:** com `NODE_ENV=production`, o `npm ci` não instala as devDependencies e o build quebra. Corrigido com `--include=dev` no comando de build.
- **Pedido do candidato:** usar as skills `frontend-design` e `Superdesign`. Elas não carregaram nesta sessão; a IA mostrou o cartão de ativação e registrou a preferência para as etapas de interface.
- **Deploy:** o candidato criou o serviço no Render e informou a URL. A IA verificou a URL com `curl` e com o navegador embutido. A primeira navegação, numa aba antiga, foi recusada pelo navegador; em uma aba nova funcionou.
- **Commit `80536a7`:** criado e enviado pela IA dentro do push autorizado da etapa 03.
- **Commit `66bb563`:** documentação, enviado a pedido do candidato.

### Etapa 04 — Banco, migrações e seed (28/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 04.
- **Arquivos gerados pela IA:** migração SQL inicial, camada `src/db`, hash de senha, pseudônimo, normalização do catálogo, seed, lote de demonstração, `docker-compose.yml`, `.env.example` e `render.yaml` atualizados. A IA também criou o `apps/api/.env` local, só com credenciais de desenvolvimento do Compose.
- **Verificações executadas:** leitura do código e dos tipos do `node-pg-migrate` 9 (formato SQL, opções do runner, CLI); conferência da tag `postgres:18.3-alpine` e da mudança de volume do PostgreSQL 18 no Docker Hub; typecheck, lint e caminhos de erro sem banco. Resultados em `PROGRESSO.md`.
- **Erro encontrado e corrigido:** a mensagem de falha de conexão saía vazia (`AggregateError`); foi criado `describeError`.
- **Bloqueio resolvido:** o PostgreSQL local exige senha, que a IA não tem nem pediu na conversa. O candidato escolheu Docker e instalou o Docker Desktop; a IA rodou `docker compose up -d`.
- **Verificações com banco real:** migração em banco vazio e repetida; down/up no banco de teste; seed duas vezes com estado idêntico; 23 restrições; helper de transação com deadlock real; conversão de BIGINT; senhas; lote de demonstração; inicialização de produção duas vezes num banco descartável; persistência do volume. Os scripts de verificação ficaram fora do repositório (pasta temporária da sessão).
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).

## Relato final

Preparar somente após a implementação, a partir deste registro. Não afirmar revisão manual completa, autoria exclusiva, testes, deploy ou resultados que não aconteceram.

### Etapa 05 — Autenticação e autorização (28/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 05.
- **Arquivos gerados pela IA:** módulo `auth` (sessão, serviço, middlewares, rotas), `requireLotOwner`, proteções de requisição (CSRF, JSON, IP), limitador, validação, configuração de proxy e os testes Vitest/Supertest.
- **Pesquisa:** busca na web sobre como o Render repassa o IP do cliente. As fontes encontradas foram artigos e fórum do Render, não documentação formal; a decisão ficou registrada como "a confirmar".
- **Verificações executadas:** typecheck, lint, 30 testes com PostgreSQL real, prova de que os testes falham quando a checagem de papel e de dono é desligada (depois restaurada), build e fluxo completo no servidor compilado em modo produção.
- **Erros encontrados e corrigidos:** 3 apontamentos do lint (variável descartada e atribuição inútil), resolvidos com funções próprias para opções do cookie e para extrair o host.
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).

### Etapa 06 — API externa e snapshots (28/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 06. O prompt cita o Art Institute of Chicago; a IA seguiu a troca para Cleveland já registrada e aceita pelo candidato.
- **Arquivos gerados pela IA:** cliente, rotas e snapshot do catálogo, detalhe público do lote, placeholder e componente de imagem no frontend, configuração e cinco arquivos de teste.
- **Verificações executadas:** typecheck, lint, 52 testes com PostgreSQL real e servidor local que imita o museu, 3 testes contra a API real, ponta a ponta local com o servidor compilado e build.
- **Erros encontrados e corrigidos:** erro de tipo num teste (`response.json()` devolve `unknown`). O teste real da imagem usava `HEAD` e estourou o tempo; a IA investigou com `curl`, confirmou que o CDN não responde a `HEAD` e trocou por `GET` com `Range`, sem afrouxar o objetivo do teste.
- **Decisão de escopo:** `GET /api/lots/:id` foi antecipado da etapa 07 para provar que o lote funciona com o museu fora do ar.
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).

### Etapa 07 — Gestão de lotes (28/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 07.
- **Arquivos gerados pela IA:** consultas, serviço e rotas de lotes; vitrine pública; painel do vendedor; 31 testes + 1 pendente.
- **Verificações executadas:** typecheck, lint, suíte completa com PostgreSQL real, build e ponta a ponta local com a API real do museu.
- **Erro encontrado pelos testes e corrigido:** soma de centavos voltando como texto (`sum()` de BIGINT é NUMERIC no PostgreSQL); corrigido com `::bigint`.
- **Ocorrência não reproduzida:** uma execução com um teste "durando" 920 s; repetida sozinha e completa, passou. Registrada como provável suspensão do processo.
- **Falha de ferramenta:** a primeira tentativa de atualizar estes documentos por um comando de shell falhou por causa de aspas; refeita com um script em arquivo.
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).

### Etapa 08 — Carteira e depósitos (29/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 08.
- **Arquivos gerados pela IA:** módulo `wallet` (regras centrais de bloqueio e saldo, serviço e rotas), idempotência genérica, utilitários de dinheiro e 37 testes.
- **Verificações executadas:** typecheck, lint, testes com PostgreSQL real (inclusive requisições simultâneas), suíte completa e build.
- **Erro encontrado pelos testes e corrigido:** respostas com as chaves do JSON em ordem diferente entre a primeira requisição e as repetidas (JSONB reordena). A IA confirmou que não houve depósito duplicado e passou a devolver sempre a resposta gravada.
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).

### Etapa 09 — Lances transacionais (29/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 09.
- **Arquivos gerados pela IA:** regras e serviço de lance, rotas, cadeia de hashes e contrato de integridade, eventos pós-commit e 45 testes.
- **Verificações executadas:** typecheck, lint, testes com PostgreSQL real e disputas reais (bloqueio segurado e conferência no `pg_stat_activity`), suíte completa, build e ponta a ponta local.
- **Erros encontrados e corrigidos:** perda de microssegundos ao regravar o fim do lote (erro 500 que também atingiria o seed em produção); testes de corrida que não disparavam as requisições; bloqueio de teste não liberado em falha.
- **Limite declarado:** R13 continua pendente; a cadeia de hashes sozinha não protege contra quem edita o banco.
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).

### Etapa 10 — Integridade e âncora (29/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 10.
- **Arquivos gerados pela IA:** `docs/AUDITORIA.md` (antes do código), migração da âncora, módulo `audit` completo, configuração, comandos e 27 testes de ataques e falhas.
- **Verificações executadas:** testes de adulteração e das janelas banco/âncora nos bancos isolados de teste, prova de que os testes falham com uma checagem desligada, suíte completa, build, ponta a ponta local e verificação global.
- **Erros encontrados e corrigidos:** regex quebrado por escape do shell na configuração; barras invertidas indevidas no Markdown (o primeiro conserto com `sed` piorou o arquivo, que foi recuperado por script); três scripts de ataque mal montados (barrados pelas restrições do banco).
- **Segredos:** a chave local de desenvolvimento foi gravada direto no `apps/api/.env` (ignorado pelo git) sem ser exibida. A chave de produção será gerada pelo candidato.
- **Limite declarado:** R13 fica parcial até a configuração em produção; ataques que ainda passam listados em `docs/AUDITORIA.md`.
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).

### Etapa 11 — Liquidação e comprovantes (29/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 11.
- **Arquivos gerados pela IA:** módulo `settlement` (serviço, job e rotas), migração `settlement_issues`, consultas de participações e do painel do leiloeiro, evento `lot.closed`, defesa extra no lance e 18 testes.
- **Verificações executadas:** migrações nos bancos locais, testes com PostgreSQL e âncora reais (disputas com bloqueio segurado, falha simulada por gatilho no banco de teste), suíte completa, typecheck, lint, build e ponta a ponta local com o servidor.
- **Erros encontrados e corrigidos:** índice duplicado na primeira versão da migração; lotes de teste curtos demais (o lance prorrogava o fim e o job não encontrava o lote).
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).

### Etapa 12 — Tempo real e reconexão (29/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 12.
- **Arquivos gerados pela IA:** módulo `realtime/socket.ts`, eventos novos (cancelamento, depósito, logout), `version` no lote público, cliente de tempo real no web (regras puras, hooks, sala `/lotes/:id`), 14 testes da API com clientes reais e 15 testes do web.
- **Verificações executadas:** testes com servidor HTTP e clientes Socket.IO reais, suíte completa, typecheck, lint, build e verificação em duas abas do navegador embutido (lance, prorrogação, liquidação, carteira privada, logout e queda/reconexão com uma segunda instância).
- **Erros encontrados e corrigidos:** dois testes mal montados (relógio do status e restrição da sessão); 4 erros de lint nas regras de efeito do React; o status de conexão mostrava "Conectando..." durante uma queda longa; o aviso de superado continuava depois de a pessoa voltar a liderar.
- **Credenciais:** login de teste só no localhost, com as contas do seed; nada de produção.
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).

### Etapa 13 — Base visual e navegação (29/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5. As skills `frontend-design` e `Superdesign`, pedidas pelo candidato, não estavam disponíveis; o CSS foi escrito à mão.
- **Tarefa solicitada:** executar a etapa 13.
- **Arquivos gerados pela IA:** sessão (`auth/`), cliente HTTP e `useApi`, componentes de estado e formulário, card e selo de lote, vitrine com atualização ao vivo, páginas de login e cadastro, carteira, participações, painel, auditoria e comprovante, sala refeita, CSS completo e testes de formatação.
- **Verificações executadas:** typecheck, lint, build, suíte completa e inspeção no navegador embutido em 1280 × 900 e 375 × 812 (login, erro, cadastro inválido, navegação por papel, área restrita, logout, teclado e rolagem horizontal).
- **Erros encontrados e corrigidos:** obra vertical esticando o card; dois selos "Ao vivo" na sala; regra de fast refresh do lint.
- **Credenciais:** só as contas de teste do seed, no localhost.
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).

### Etapa 14 — Painel do leiloeiro (29/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 14.
- **Arquivos gerados pela IA:** conversão de valores e datas (com 7 testes), busca no acervo, formulário de criação, lista com cancelamento e o painel.
- **Verificações executadas:** typecheck, lint, build, suíte completa e verificação no navegador embutido com três instâncias locais (normal, lance concorrente e museu fora do ar), além de chamadas diretas à API como licitante.
- **Erros encontrados e corrigidos:** formulário longe da vista; erro de campo que não sumia depois de corrigido; tipo errado da origem do cache (`live`, não `network`).
- **Credenciais:** só as contas de teste do seed, no localhost.
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).

### Etapa 15 — Fluxo do licitante (29/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 15.
- **Arquivos gerados pela IA:** chave de idempotência por intenção, formulário de depósito, formulário de lance, posição e situação do usuário (com testes), área pessoal da sala, botão de copiar link e ajustes na carteira e nas participações.
- **Verificações executadas:** typecheck, lint, build, suíte completa, cenário A/B do guia em duas sessões reais no navegador embutido (depósito com clique duplo, reserva, recusas, superação, liberação, encerramento, carteiras e leiloeiro) e resposta perdida com o servidor parado.
- **Erros encontrados e corrigidos:** aviso de recusa antigo continuava ao lado do indicador "Você foi superado" (agora some quando o lote muda de versão).
- **Credenciais:** só as contas de teste do seed, no localhost.
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).

### Etapa 16 — Auditoria e comprovante públicos (29/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 16.
- **Arquivos gerados pela IA:** páginas de auditoria e comprovante completas, página 404 reutilizável, ajuste no `useApi` e estilos (inclusive impressão).
- **Verificações executadas:** typecheck, lint, build, suíte completa; no navegador, lote íntegro, sem lances, adulterado (fixture só no banco de teste) e âncora fora do ar; comprovante por link direto, recarregar, copiar link, token inválido e desconhecido, celular; script procurando dados pessoais nas respostas públicas.
- **Erros encontrados e corrigidos:** um ÍNTEGRO antigo poderia continuar na tela se a nova verificação falhasse; contagens "0 de 2" enganosas num lote adulterado; texto do lote sem lances.
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).

### Etapa 17 — Testes automatizados (29/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 17.
- **Arquivos gerados pela IA:** teste de privacidade das respostas públicas, E2E com Playwright (configuração, servidor nos bancos de teste e cenário), scripts e `docs/TESTES.md`.
- **Verificações executadas:** suíte completa, E2E (passou na primeira execução), typecheck, lint, build e duas mutações de propósito para provar que os testes falham com o erro.
- **Erros encontrados e corrigidos:** o `tsconfig` do E2E não incluía a extensão de tipos do Express da API.
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).

### Etapa 18 — Falhas e recuperação (29/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 18.
- **Arquivos gerados pela IA:** correção pós-commit do lance, mensagens de "sem resposta" no painel, 3 testes E2E de falha, regressões na API e `docs/TESTES_DE_FALHA.md`.
- **Verificações executadas:** revisão de código (transações, SQL), servidor sem chave, E2E completo, suíte completa, typecheck, lint e build; a regressão foi rodada sem a correção para provar que pega o defeito.
- **Erros encontrados e corrigidos:** os dois defeitos acima; no teste de evento perdido, fechar só o lado da página do WebSocket não derrubava a conexão (o Socket.IO estava em long-polling), então o teste espera a queda real, como um navegador sem rede.
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).

### Etapa 19 — Extras com limite (29/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 19.
- **Arquivos gerados pela IA:** filtro parametrizado da vitrine (API, teste e tela), tema escuro por tokens, botão de tema e script de tema no `index.html`.
- **Verificações executadas:** teste da API do filtro, suíte completa, E2E, typecheck, lint, build e verificação manual no navegador (filtros, vazios, URL, persistência e contraste do tema).
- **Erros encontrados e corrigidos:** uma linha da vitrine quebrou ao gerar o arquivo pelo shell (crases interpretadas); corrigida e conferida pelo typecheck.
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).

### Etapa 20 — README e relato de IA (29/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 20.
- **Arquivos gerados pela IA:** `README.md`, o resumo consolidado e o texto para o formulário neste arquivo, e a correção de `apps/api/src/shared/config.ts`.
- **Verificações executadas:** reprodução do README num clone limpo do repositório, com bancos próprios e chave nova (instalação, `.env`, migrações, seed, build, `npm start`, login, vitrine, auditoria, Socket.IO e `npm test`); depois, os bancos e o clone foram apagados.
- **Erro encontrado e corrigido:** `npm start` na raiz não encontrava `apps/api/.env` (o servidor não subia); agora o `.env` é procurado pela pasta da API.
- **O que o candidato leu, revisou ou ajustou:** ver o resumo consolidado no topo (informado pelo candidato em 29/10/2026).
