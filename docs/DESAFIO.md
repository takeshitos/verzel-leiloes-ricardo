# Especificação conferida do desafio Verzel

Paráfrase do PDF fornecido. O PDF original tem prioridade. Os detalhes da implementação sugerida estão no guia e em DECISOES; não são novos requisitos da empresa.

## Produto e papéis

Casa de leilões online com itens originados em uma API pública escolhida pelo candidato. Leiloeiro cria e gerencia os próprios lotes e não dá lances. Licitante deposita saldo simulado, disputa lotes e arremata itens. Autenticação distingue esses papéis.

O lote contém imagem, título, atributos do item externo, lance inicial, incremento mínimo, início e fim. O vendedor busca o item na API, cancela lote que ainda não recebeu lances, vê resultado dos encerrados e o total recebido.

## Frontend obrigatório

Vitrine com lotes ao vivo, agendados e encerrados; cancelados não aparecem. Sala mostra lance atual, histórico, posição do usuário, contagem regressiva e indicador de liderança/superação, atualizados sem recarregar. Carteira mostra saldo total, comprometido e disponível e depósito simulado. Meus arremates mostra participações, vitórias, comprovante e link compartilhável. Auditoria pública sem login mostra histórico completo e sua integridade. Recusas têm motivos claros.

## Backend obrigatório

Lances só durante a janela do lote. Primeiro lance maior ou igual ao inicial; seguintes maiores ou iguais ao atual mais incremento mínimo. Líder não cobre o próprio lance. Valor só é aceito se couber no disponível. Disponível é total menos comprometido. Liderar reserva o valor; ser superado o libera imediatamente.

Lance aceito nos últimos dois minutos prorroga o fim para mais dois minutos; a expressão não formaliza a base do cálculo, que deve ser explicitada como decisão do projeto. Ao encerrar, debitar vencedor, creditar leiloeiro e gerar comprovante. Sem lances, sem vencedor.

Qualquer alteração, remoção ou inserção posterior no histórico, inclusive direto no banco, deve ser detectada pela auditoria. A técnica fica a critério do candidato e precisa ser explicada. Auditoria e comprovante identificam participantes sem dados pessoais. Vitrine, salas, auditoria e comprovante continuam funcionando se a API externa cair.

## Tecnologia e entrega

React é obrigatório no frontend. Backend pode ser Node.js ou Python. Banco pode ser PostgreSQL, MySQL ou NoSQL, com configuração documentada. Prazo de sete dias corridos a partir do recebimento, sem presumir data a partir do arquivo.

Seed obrigatório: um vendedor, dois clientes e pelo menos um lote publicado aberto para lances. README detalha configuração e execução e menciona comportamentos inesperados. Deploy público obrigatório e código em repositório público do GitHub; informar ambos se houver repositórios separados.

Envio pelo formulário informado no PDF: https://elitedev.verzel.com.br/?elite-dev-2026-2, com nome, email, repositório, deploy e relato de onde/como usou IA e o que revisou ou ajustou. IA é permitida.

## Extras e exclusões

Opcionais: busca/filtro de lotes, cancelamento com estorno automático, Docker Compose, testes automatizados e tema claro/escuro. Cancelamento básico de lote sem lance é obrigatório. Não são necessários nota fiscal, revenda entre usuários, app nativo ou recuperação de senha.
