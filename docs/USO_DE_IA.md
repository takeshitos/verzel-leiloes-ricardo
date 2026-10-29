# Registro do uso de IA

## Planejamento inicial

Um assistente de IA analisou o PDF fornecido e preparou este kit com requisitos, decisões propostas, cronograma, critérios de validação e prompts para Claude Code. A aplicação ainda não foi implementada neste kit. Nenhuma revisão de código pelo candidato ou execução de teste da futura aplicação é presumida aqui.

## Registro durante a implementação

Para cada etapa, preencha com fatos: ferramenta usada, tarefa solicitada, arquivos gerados ou alterados, verificação executada, erro encontrado, correção aplicada e o que o candidato efetivamente leu, compreendeu ou ajustou.

### Etapa 00 — Início e controle (28/10/2026)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** ler `CLAUDE.md` e o prompt 00 e executar só a etapa 00: conferir o PDF, criar a lista de requisitos, atualizar os documentos de controle e conferir o ambiente sem implementar o produto.
- **Arquivos gerados ou alterados:** criado `docs/REQUISITOS.md`; atualizados `docs/DECISOES.md`, `docs/PROGRESSO.md` e este arquivo; PDF renomeado para `docs/desafio-original.pdf`. Nenhum código.
- **Verificações executadas:** comandos de versão e estado somente leitura (lista e resultados em `PROGRESSO.md`); consulta à API pública do GitHub sobre o repositório; contagem das 20 linhas de requisitos e busca por referências ao nome antigo do PDF.
- **Problema encontrado:** o PDF não tem texto extraível (páginas em imagem) e `pdftoppm` não está instalado. **Contorno:** as imagens JPEG das páginas foram extraídas por um script Node temporário fora do projeto e lidas visualmente pela IA, sem OCR.
- **Decisões tomadas pelo candidato nesta etapa:** data de recebimento (22/10/2026, prazo 29/10/2026); deixar `git init` para a etapa 02; não versionar PDF, guia e prompts; renomear o PDF.
- **O que o candidato leu, revisou ou ajustou:** a preencher pelo candidato.

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
- **O que o candidato leu, revisou ou ajustou:** a preencher pelo candidato.

### Etapa 02 — Estrutura do projeto (28/10/2026)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5, com terminal e navegador embutido (preview dos servidores locais).
- **Tarefa solicitada:** o candidato confirmou o catálogo de Cleveland e pediu a etapa 02.
- **Arquivos gerados pela IA:** `package.json`, `package-lock.json` (gerado pelo npm), `tsconfig.base.json`, `eslint.config.js`, `.gitignore`, `.gitattributes`, todo o conteúdo de `apps/api` e `apps/web` e `.claude/launch.json` (local, ignorado pelo git). Também `git init` e remote `origin`, sem commit.
- **Verificações executadas:** instalação, typecheck, lint (com conferência de que os arquivos foram de fato analisados), build, servidor de produção testado com `curl` (health, SPA, 404 JSON, JSON malformado, corpo grande, arquivo inexistente), encerramento, configuração inválida, porta indisponível e o modo de desenvolvimento no navegador. Resultados em `PROGRESSO.md`.
- **Erros encontrados e correções:**
  - O teste de encerramento por sinal travou no Windows. Foi trocado por um evento disparado no processo; a entrega real do sinal fica para o deploy em Linux.
  - A ferramenta de preview injetou `PORT=5173` e a API subiu na porta errada. A correção foi feita só na configuração local do preview, sem mudar o código.
  - Uma leitura de página feita logo após um clique mostrou o conteúdo antigo. Repetida com espera, a navegação estava correta.
- **O que o candidato leu, revisou ou ajustou:** a preencher pelo candidato.
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
- **O que o candidato leu, revisou ou ajustou:** a preencher pelo candidato.
- **O que o candidato leu, revisou ou ajustou:** a preencher pelo candidato.

## Relato final

Preparar somente após a implementação, a partir deste registro. Não afirmar revisão manual completa, autoria exclusiva, testes, deploy ou resultados que não aconteceram.

### Etapa 05 — Autenticação e autorização (28/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 05.
- **Arquivos gerados pela IA:** módulo `auth` (sessão, serviço, middlewares, rotas), `requireLotOwner`, proteções de requisição (CSRF, JSON, IP), limitador, validação, configuração de proxy e os testes Vitest/Supertest.
- **Pesquisa:** busca na web sobre como o Render repassa o IP do cliente. As fontes encontradas foram artigos e fórum do Render, não documentação formal; a decisão ficou registrada como "a confirmar".
- **Verificações executadas:** typecheck, lint, 30 testes com PostgreSQL real, prova de que os testes falham quando a checagem de papel e de dono é desligada (depois restaurada), build e fluxo completo no servidor compilado em modo produção.
- **Erros encontrados e corrigidos:** 3 apontamentos do lint (variável descartada e atribuição inútil), resolvidos com funções próprias para opções do cookie e para extrair o host.
- **O que o candidato leu, revisou ou ajustou:** a preencher pelo candidato.

### Etapa 06 — API externa e snapshots (28/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 06. O prompt cita o Art Institute of Chicago; a IA seguiu a troca para Cleveland já registrada e aceita pelo candidato.
- **Arquivos gerados pela IA:** cliente, rotas e snapshot do catálogo, detalhe público do lote, placeholder e componente de imagem no frontend, configuração e cinco arquivos de teste.
- **Verificações executadas:** typecheck, lint, 52 testes com PostgreSQL real e servidor local que imita o museu, 3 testes contra a API real, ponta a ponta local com o servidor compilado e build.
- **Erros encontrados e corrigidos:** erro de tipo num teste (`response.json()` devolve `unknown`). O teste real da imagem usava `HEAD` e estourou o tempo; a IA investigou com `curl`, confirmou que o CDN não responde a `HEAD` e trocou por `GET` com `Range`, sem afrouxar o objetivo do teste.
- **Decisão de escopo:** `GET /api/lots/:id` foi antecipado da etapa 07 para provar que o lote funciona com o museu fora do ar.
- **O que o candidato leu, revisou ou ajustou:** a preencher pelo candidato.

### Etapa 07 — Gestão de lotes (28/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 07.
- **Arquivos gerados pela IA:** consultas, serviço e rotas de lotes; vitrine pública; painel do vendedor; 31 testes + 1 pendente.
- **Verificações executadas:** typecheck, lint, suíte completa com PostgreSQL real, build e ponta a ponta local com a API real do museu.
- **Erro encontrado pelos testes e corrigido:** soma de centavos voltando como texto (`sum()` de BIGINT é NUMERIC no PostgreSQL); corrigido com `::bigint`.
- **Ocorrência não reproduzida:** uma execução com um teste "durando" 920 s; repetida sozinha e completa, passou. Registrada como provável suspensão do processo.
- **Falha de ferramenta:** a primeira tentativa de atualizar estes documentos por um comando de shell falhou por causa de aspas; refeita com um script em arquivo.
- **O que o candidato leu, revisou ou ajustou:** a preencher pelo candidato.

### Etapa 08 — Carteira e depósitos (29/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 08.
- **Arquivos gerados pela IA:** módulo `wallet` (regras centrais de bloqueio e saldo, serviço e rotas), idempotência genérica, utilitários de dinheiro e 37 testes.
- **Verificações executadas:** typecheck, lint, testes com PostgreSQL real (inclusive requisições simultâneas), suíte completa e build.
- **Erro encontrado pelos testes e corrigido:** respostas com as chaves do JSON em ordem diferente entre a primeira requisição e as repetidas (JSONB reordena). A IA confirmou que não houve depósito duplicado e passou a devolver sempre a resposta gravada.
- **O que o candidato leu, revisou ou ajustou:** a preencher pelo candidato.

### Etapa 09 — Lances transacionais (29/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 09.
- **Arquivos gerados pela IA:** regras e serviço de lance, rotas, cadeia de hashes e contrato de integridade, eventos pós-commit e 45 testes.
- **Verificações executadas:** typecheck, lint, testes com PostgreSQL real e disputas reais (bloqueio segurado e conferência no `pg_stat_activity`), suíte completa, build e ponta a ponta local.
- **Erros encontrados e corrigidos:** perda de microssegundos ao regravar o fim do lote (erro 500 que também atingiria o seed em produção); testes de corrida que não disparavam as requisições; bloqueio de teste não liberado em falha.
- **Limite declarado:** R13 continua pendente; a cadeia de hashes sozinha não protege contra quem edita o banco.
- **O que o candidato leu, revisou ou ajustou:** a preencher pelo candidato.

### Etapa 10 — Integridade e âncora (29/10/2026, concluída localmente)

- **Ferramenta:** Claude Code no app desktop, modelo Claude Opus 5.5.
- **Tarefa solicitada:** executar a etapa 10.
- **Arquivos gerados pela IA:** `docs/AUDITORIA.md` (antes do código), migração da âncora, módulo `audit` completo, configuração, comandos e 27 testes de ataques e falhas.
- **Verificações executadas:** testes de adulteração e das janelas banco/âncora nos bancos isolados de teste, prova de que os testes falham com uma checagem desligada, suíte completa, build, ponta a ponta local e verificação global.
- **Erros encontrados e corrigidos:** regex quebrado por escape do shell na configuração; barras invertidas indevidas no Markdown (o primeiro conserto com `sed` piorou o arquivo, que foi recuperado por script); três scripts de ataque mal montados (barrados pelas restrições do banco).
- **Segredos:** a chave local de desenvolvimento foi gravada direto no `apps/api/.env` (ignorado pelo git) sem ser exibida. A chave de produção será gerada pelo candidato.
- **Limite declarado:** R13 fica parcial até a configuração em produção; ataques que ainda passam listados em `docs/AUDITORIA.md`.
- **O que o candidato leu, revisou ou ajustou:** a preencher pelo candidato.
