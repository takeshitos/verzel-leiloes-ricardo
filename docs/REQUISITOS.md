# Requisitos do desafio

Controle dos requisitos obrigatórios (R01 a R20) e dos opcionais. A fonte é o PDF original (`docs/desafio-original.pdf`, 7 páginas), conferido na etapa 00 por leitura das imagens das páginas. As páginas citadas seguem a numeração do rodapé do PDF (a capa é a página 1).

Os textos abaixo são paráfrases. Quando um critério de aceite depende de uma interpretação do projeto, ela está marcada como **interpretação** e registrada em `docs/DECISOES.md`.

Estados possíveis: **Pendente**, **Em andamento**, **Parcial** (com motivo), **Concluído** (somente com verificação executada e registrada em `docs/PROGRESSO.md`).

## Requisitos obrigatórios

| ID | Requisito | Fonte no PDF | Critério de aceite | Etapas planejadas | Estado |
| --- | --- | --- | --- | --- | --- |
| R01 | Stack permitida: React no frontend; Node.js ou Python no backend; PostgreSQL, MySQL ou NoSQL | p. 5 (Tecnologias obrigatórias) | Frontend React e backend Node executando de verdade e persistindo dados no PostgreSQL; versões registradas em DECISOES | 01, 02, 04 | Em andamento (React + Express desde a etapa 02; PostgreSQL com migrações local e em produção no Neon desde a etapa 04, com `database: ok` na URL pública; as regras de negócio ainda faltam) |
| R02 | Autenticação com dois papéis: leiloeiro cria e gerencia só os próprios lotes e não dá lances; licitante deposita, dá lances e arremata | p. 2 (Usuários e Autenticação) | Cadastro, login e logout funcionam; chamadas diretas à API recusam leiloeiro ofertando, licitante criando lote e leiloeiro mexendo em lote de outro | 05, 07, 08, 09 | Em andamento (auth, papéis e propriedade implementados e testados na etapa 05; falta aplicá-los nas rotas das etapas 07 a 09) |
| R03 | Leiloeiro busca itens numa API pública escolhida e cria lote com imagem, título, atributos, lance inicial, incremento mínimo, início e fim | p. 2 (O desafio); p. 3 (Painel do leiloeiro) | Busca real na API externa; lote salvo com snapshot local do item; valores e datas validados no backend | 06, 07, 14 | Pendente |
| R04 | Vitrine separa lotes ao vivo, agendados e encerrados; cancelados não aparecem | p. 3 (Vitrine de lotes) | Estado calculado pelo horário do servidor; o lote muda de seção sem ação manual; cancelado fica fora da vitrine na API e na tela | 07, 12, 13 | Pendente |
| R05 | Leiloeiro cancela lote que ainda não recebeu lances | p. 3 (Painel do leiloeiro) | Dono cancela lote sem lances; lote com qualquer lance é recusado com motivo; outro usuário recebe proibição; cancelamento disputando com lance é resolvido sob bloqueio | 07, 14 | Pendente |
| R06 | Sala ao vivo com lance atual, histórico, posição do usuário, contagem regressiva e indicador "você está ganhando" / "você foi superado", sem recarregar | p. 3 (Sala do lote ao vivo); p. 2 | Dois navegadores acompanham a mesma disputa; ao reconectar, a tela busca o estado atual por HTTP; contagem baseada no horário do servidor | 12, 15 | Pendente |
| R07 | Carteira com saldo total, comprometido, disponível e depósito simulado; disponível = total − comprometido; liderar compromete o valor; ser superado libera na hora; lance só é aceito se couber no disponível | p. 3 (Carteira do licitante); p. 4 (Saldo comprometido) | Centavos inteiros; contas fecham considerando todos os lotes que o usuário lidera; depósito idempotente; reserva e liberação na mesma transação do lance | 08, 09, 15 | Pendente |
| R08 | Regras de lance: só entre início e fim; primeiro ≥ lance inicial; seguintes ≥ atual + incremento mínimo; líder não cobre o próprio lance; mensagem clara para cada recusa | p. 4 (Regras de lance); p. 3 (Mensagens de feedback) | Backend recusa cada caso com código estável e mensagem em português (abaixo do mínimo, saldo insuficiente, já está ganhando, não iniciado, encerrado); recusa não altera histórico, saldo nem fim; testes com PostgreSQL real | 09, 15, 17 | Pendente |
| R09 | Lance aceito nos últimos 2 minutos estende o fim do lote em 2 minutos | p. 4 (Prorrogação anti-sniping) | **Interpretação:** com até 120 s restantes, novo fim = hora de aceitação + 120 s. Fim persistido e enviado a todos os clientes; bordas testadas com relógio controlável; regra explicada no README | 09, 12 | Pendente |
| R10 | Ao encerrar: debitar o vencedor, creditar o leiloeiro e gerar comprovante; sem lances, sem vencedor | p. 4 (Liquidação) | **Interpretação:** o backend encerra sozinho após o fim, sem depender da tela. Liquidação idempotente e recuperável após reinício; repetir o job ou concorrer com o último lance não duplica débito, crédito nem comprovante | 11 | Pendente |
| R11 | Meus arremates: lotes em que o usuário deu lance e lotes vencidos, com comprovante e link de compartilhamento | p. 3 (Meus arremates); p. 2 | Licitante vê participações e vitórias; o link do comprovante abre sem login | 11, 15, 16 | Pendente |
| R12 | Painel do leiloeiro mostra o resultado de cada lote encerrado (arrematado ou não e por quanto) e o total recebido | p. 3 (Painel do leiloeiro) | Total igual à soma das liquidações efetivas dos lotes do leiloeiro | 11, 14 | Pendente |
| R13 | Auditoria pública, sem login, mostra o histórico completo de lances e informa se está íntegro ou adulterado; alteração, remoção ou inserção posterior (inclusive direto no banco) deve ser detectada; técnica explicada | p. 2; p. 3 (Página de auditoria); p. 4 (Histórico à prova de adulteração) | Testes em banco isolado: alterar, inserir, reordenar, remover o último e todos os lances, recalcular hashes e restaurar checkpoint antigo. Estados ÍNTEGRO, ADULTERADO e VERIFICAÇÃO PENDENTE OU INDISPONÍVEL. Modelo de ameaça e limites documentados | 10, 16, 18 | Pendente |
| R14 | Auditoria e comprovante identificam licitantes sem expor dados pessoais | p. 4 (Privacidade) | Respostas e eventos públicos usam pseudônimo aleatório; sem email, nome real, senha, sessão ou saldo, verificado por teste e inspeção das respostas | 05, 10, 12, 16 | Pendente |
| R15 | Vitrine, salas, auditoria e comprovante continuam funcionando se a API externa cair | p. 4 (Gestão da API externa) | Teste com a integração externa indisponível; páginas usam o snapshot local; a busca mostra indisponibilidade com timeout | 06, 18 | Pendente |
| R16 | Seed com um leiloeiro, dois clientes e pelo menos um lote publicado com lances abertos | p. 5 (Dados de teste) | Seed idempotente em banco vazio; credenciais fictícias no README; lote aberto no ambiente publicado no momento do envio | 04, 21 | Parcial (seed idempotente verificado localmente e executado em produção, conforme log do Render; faltam README e lote aberto no dia do envio) |
| R17 | README detalhado: passo a passo para configurar e executar, configuração do banco e funcionalidades com comportamento inesperado | p. 5 (Documentação; Banco de Dados) | Outra pessoa instala e executa a partir de um clone limpo seguindo só o README | 20, 21 | Pendente |
| R18 | Deploy público obrigatório e código em repositório público no GitHub (se front e back estiverem separados, informar os dois) | p. 2 (Deploy); p. 7 (Como enviar) | URL pública abre sem sessão pessoal e conversa com o backend; repositório público acessível | 03, 21 | Parcial (repositório público e esqueleto publicado em https://verzel-leiloes-ricardo.onrender.com/, verificados em 28/10/2026; falta publicar a aplicação completa) |
| R19 | Informar onde e como usou IA e o que revisou ou ajustou | p. 7 (Onde e como você usou IA) | Relato factual baseado em `docs/USO_DE_IA.md` | registro em todas; 20, 23 | Pendente (registro iniciado) |
| R20 | Entregar em até 7 dias corridos a partir do recebimento, pelo formulário indicado no PDF | p. 5 (Prazo); p. 7 (Como enviar) | Recebimento em 22/10/2026, informado pelo candidato; prazo em 29/10/2026, hora limite a confirmar; envio feito pelo candidato antes do limite | 00 (data anotada), 23 | Pendente (prazo 29/10/2026) |

## Opcionais do PDF (extras)

O PDF diz que nenhum destes itens é obrigatório, mas todos entram na avaliação (p. 6). Só começam depois que o fluxo obrigatório estiver fechado.

| ID | Extra | Fonte no PDF | Etapa planejada | Estado |
| --- | --- | --- | --- | --- |
| E01 | Busca e filtro de lotes na vitrine (diferente da busca de itens na API, que é obrigatória em R03) | p. 6 | 19 | Não iniciado |
| E02 | Cancelamento de lote com estorno automático (cancelar lote que já tem lances) | p. 6 | 19 | Não iniciado |
| E03 | Docker Compose | p. 6 | 19 (Docker não está instalado nesta máquina; ver PROGRESSO) | Não iniciado |
| E04 | Testes automatizados | p. 6 | 09 a 18 (testes críticos), 17 (suíte) | Não iniciado |
| E05 | Tema claro e escuro | p. 6 | 19 | Não iniciado |

Fora do escopo segundo o PDF (p. 6): nota fiscal, revenda entre usuários, aplicativo nativo e recuperação de senha.

## Fluxo principal

1. **Vendedor (leiloeiro)** faz login, busca um item na API externa e cria o lote com lance inicial, incremento mínimo, início e fim. O backend salva um snapshot do item (R02, R03).
2. **Lote** aparece na vitrine como agendado e passa a ao vivo no horário de início, calculado pelo relógio do servidor (R04). Enquanto não houver lances, o dono pode cancelar (R05).
3. **Depósito**: o licitante deposita saldo simulado. Total sobe; disponível = total − reservas ativas (R07).
4. **Lances**: o backend valida janela, mínimo, liderança e saldo disponível dentro de uma transação que bloqueia o lote e as carteiras envolvidas (R08). Com até 120 s restantes, o fim é prorrogado (R09). Eventos vão aos navegadores só depois do commit (R06).
5. **Reserva e liberação**: quem lidera tem o valor reservado; quando é superado, a reserva é liberada na mesma transação do novo lance. Reservar não debita o total (R07).
6. **Encerramento**: um processo do backend encontra lotes vencidos, relê o fim (que pode ter sido prorrogado) e liquida uma única vez: debita o vencedor, credita o vendedor e remove a reserva. Sem lances, o lote fecha sem vencedor (R10, R12).
7. **Comprovante**: gerado na liquidação, com link público e imprevisível, mostrando pseudônimos e valores, sem dados pessoais (R11, R14).
8. **Auditoria**: página pública que mostra o histórico completo e o resultado da verificação de integridade: íntegro, adulterado ou verificação pendente/indisponível (R13, R14).

### Pontos críticos

- **Concorrência entre lotes.** A carteira é compartilhada por todos os lotes que o licitante disputa. Bloquear só o lote não impede que o mesmo saldo seja usado em dois lotes ao mesmo tempo. Por isso, toda operação que muda saldo ou reserva também bloqueia a carteira, sempre na mesma ordem, e com o mesmo cliente `pg` durante a transação.
- **Idempotência.** Uma requisição repetida por falha de rede não pode depositar ou ofertar duas vezes (chave de idempotência). O job de encerramento pode rodar de novo, rodar em paralelo ou rodar depois de um reinício sem cobrar duas vezes (restrição única de liquidação por lote).
- **API externa indisponível.** A API só é necessária para buscar itens novos. Vitrine, sala, auditoria e comprovante leem do banco (snapshot salvo na criação do lote). Se a imagem remota falhar, a tela mostra um substituto local.
- **Limite de uma cadeia de hashes sem âncora confiável.** Encadear hashes dos lances detecta edição isolada, mas quem tem acesso de escrita ao banco pode recalcular toda a cadeia, apagar a cauda ou restaurar um estado antigo que continua coerente. Um checkpoint assinado com chave fora do banco impede recalcular, mas não impede restaurar um checkpoint antigo se tudo estiver no mesmo banco. Para detectar isso é preciso uma âncora independente do PostgreSQL. Mesmo assim, a garantia vale só para o modelo de ameaça definido na etapa 10 (invasor com escrita no banco, sem a chave e sem a âncora). Operações ainda não ancoradas aparecem como pendentes, nunca como íntegras.
- **Deploy é obrigatório**, não extra (p. 2 e p. 7). O serviço precisa ser persistente, aceitar WebSocket e rodar o job de encerramento.

## Notas da conferência com o PDF (etapa 00)

Pontos do PDF que `docs/DESAFIO.md` não menciona ou resume de forma diferente. Nenhum muda o escopo; ficam registrados para as próximas etapas.

- p. 5: o PDF avisa que a falta de explicações no README prejudica a nota. Reforça R17.
- p. 6: os opcionais "entram na avaliação", embora não sejam obrigatórios.
- p. 2: o PDF lista sites de referência de leilão (Catawiki, LiveAuctioneers, Superbid) como ponto de partida, pedindo para não copiar.
- p. 2 fala em "lance inicial" e "incremento mínimo"; p. 3 fala em "valor mínimo" no painel do leiloeiro. Tratados como os mesmos campos de R03.
- p. 4 diz "Ao encerrar", sem dizer quem dispara o encerramento. Encerramento automático no backend é interpretação do projeto (R10).
- p. 4 fala em identificar "licitantes" sem dados pessoais; o projeto estende a regra a qualquer participante exibido publicamente (R14).
- O título da p. 4 é "Histórico à prova de adulteração". A documentação do projeto deve descrever a garantia pelo modelo de ameaça, sem prometer mais do que os testes sustentam.
