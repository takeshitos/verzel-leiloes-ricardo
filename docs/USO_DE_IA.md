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

## Relato final

Preparar somente após a implementação, a partir deste registro. Não afirmar revisão manual completa, autoria exclusiva, testes, deploy ou resultados que não aconteceram.
