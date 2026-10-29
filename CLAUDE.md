# Projeto do desafio Verzel

Construir uma casa de leilões fictícia para o teste técnico. Comunicação, interface e documentação em português do Brasil. Código com nomes consistentes e fáceis de explicar por um candidato júnior.

Leia `docs/DESAFIO.md`, `docs/DECISOES.md`, `docs/PROGRESSO.md` e o prompt da etapa antes de alterar código. O PDF original em `docs/desafio-original.pdf`, quando presente, é a fonte primária. Decisões sugeridas não são frases do enunciado.

## Escopo e stack proposta

React com Vite e TypeScript; Node.js com Express e TypeScript; PostgreSQL com pg e SQL parametrizado; Socket.IO; npm workspaces. Um serviço serve SPA e API na mesma origem em produção. Valide versões e APIs na documentação oficial. Prefira módulos simples e dependências necessárias.

## Invariantes

- Autorizações e regras financeiras pertencem ao backend. Leiloeiro não oferta e só gerencia seus lotes.
- Dinheiro em centavos inteiros; nenhuma conta financeira com decimais de ponto flutuante.
- Total, reservas e disponível consistentes em todos os lotes do usuário.
- Lance e liquidação são transacionais; lote e carteiras envolvidos são bloqueados em ordem estável. Use o mesmo cliente pg na transação.
- Releia relógio confiável depois dos bloqueios. Intervalo de lance: início inclusivo, fim exclusivo.
- Líder não cobre próprio lance. Recusa não altera histórico, saldo ou fim.
- Prorrogação proposta: lance aceito com até 120 segundos restantes leva fim para aceitação + 120 segundos. Registre como interpretação.
- Liquidação idempotente, automática no backend e recuperável após reinício. Eventos só depois de commit.
- Snapshot local dos itens permite operar lotes quando API externa cai.
- Histórico autenticado, proteção contra remoção de cauda e âncora confiável independente para detectar rollback. Não prometa garantia que os testes/modelo de ameaça não sustentam.
- Auditoria pendente/indisponível nunca recebe resultado íntegro. Não re-assine dados suspeitos para fazer um teste passar.
- APIs e eventos públicos usam pseudônimos aleatórios; não expõem email, nome real, senha, sessão ou saldo.

## Modo de execução

Execute somente a etapa solicitada, preservando o trabalho anterior. Inspecione antes de editar. Complete a etapa com verificações pertinentes, reporte comandos e resultados reais e atualize `docs/PROGRESSO.md` e `docs/USO_DE_IA.md`. Não diga que teste passou se não foi executado. Se o ambiente impedir algo, registre o bloqueio e o comando exato para o candidato executar.

Não enfraqueça testes para esconder falhas e não substitua integração real por mock em produção. Use banco isolado para testes destrutivos. Não use reset destrutivo ou force push. Não publique, envie formulários, contrate serviços ou execute ações pagas sem instrução específica do candidato. Não exponha segredos nem os coloque em `VITE_*`, logs, commits ou documentação.

Ao concluir: descreva a mudança, arquivos relevantes, verificações, pendências e como validar manualmente. Explique as decisões centrais. Faça mudanças focadas; evite reescrever a arquitetura ou adicionar extras fora da etapa. Registre commits somente quando solicitado pelo candidato.
