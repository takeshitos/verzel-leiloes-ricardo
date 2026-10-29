# Testes de falha e recuperação (etapa 18)

Rodada focada nas falhas que escapam do caminho feliz, feita em 29/10/2026, **só em ambiente isolado**: bancos `verzel_test` e `verzel_anchor_test`, servidores locais e o navegador controlado pelo Playwright. Nada foi executado contra produção.

Cada linha diz o que foi verificado e onde está a evidência. "API" = `apps/api/test/*.test.ts` (Vitest, PostgreSQL real); "E2E" = `e2e/*.spec.ts` (Playwright no Chrome, aplicação real nos bancos `_test`).

## Defeitos encontrados e corrigidos

| # | Defeito reproduzido | Correção | Regressão |
| --- | --- | --- | --- |
| D1 | Se a confirmação na âncora **depois do COMMIT** do lance lançasse um erro inesperado (diferente de "âncora indisponível", ex.: falha do banco principal ao marcar o checkpoint), o erro subia e a API respondia **500 para um lance já gravado**; o evento de tempo real também não saía. O cliente acharia que o lance falhou. | `bids/service.ts`: o erro pós-commit é registrado no log e a resposta sai 201 com `audit.status: "pending"`; o evento é publicado como pendente. O reconciliador termina a confirmação com a assinatura gravada no lance. | API `bids.test.ts` "falha inesperada ao confirmar na âncora DEPOIS do commit": 201, lance gravado, evento pendente, verificação PENDENTE (nunca ÍNTEGRO) e ÍNTEGRO depois do reconciliador. **Sem a correção o teste falha com "expected 500 to be 201"** (conferido com `git stash` da correção). |
| D2 | Mensagens de interface tratavam "sem resposta do servidor" como recusa no **cancelamento** e na **criação de lote**. Na criação isso é perigoso: o lote pode ter sido criado e a pessoa tentaria de novo (criar lote não tem chave de idempotência). | `SellerLotList.tsx` e `CreateLotForm.tsx`: rede ou 5xx (exceto `CATALOG_UNAVAILABLE`, que é recusa definitiva antes de gravar) mostram "Sem resposta do servidor..." e a lista de lotes é relida para a pessoa conferir. | Revisão de código e typecheck. Lance e depósito já distinguiam recusa, sem resposta e pendente desde a etapa 15. |

## Cenários verificados

| Cenário | Estado inicial e passos | Esperado | Observado | Evidência |
| --- | --- | --- | --- | --- |
| Resposta HTTP perdida **depois** do commit (cliente perde a conexão após enviar a oferta) | Licitante com R$ 1.000,00 na sala do lote do seed. O Playwright deixa o `POST /bids` chegar ao servidor (201) e corta a resposta antes do navegador | A tela não diz "recusado" nem reenvia sozinha; relê o histórico e mostra o lance | "A resposta se perdeu, mas o histórico do servidor mostra o seu lance de R$ 500,00" e "Você está ganhando" | E2E `falhas.spec.ts` (1º teste) |
| Mesmo pedido repetido | Mesma `Idempotency-Key` capturada no cenário acima, reenviada pela API | Mesma resposta guardada, sem segundo lance | 201 com `Idempotent-Replayed: true`; histórico com +1 lance só | E2E `falhas.spec.ts` (1º); API `bids` "repetir o pedido..." e "4 pedidos simultâneos com a mesma chave"; `wallet` "8 requisições simultâneas com a mesma chave" |
| Socket perde um evento | Visitante na sala; o Playwright derruba o Socket.IO só dessa aba e bloqueia a reconexão; outro licitante dá um lance pela API | O evento se perde; a tela mostra que está sem tempo real | "Sem tempo real: tentando reconectar..." e o histórico sem o lance novo | E2E `falhas.spec.ts` (2º); API `realtime` "lance aceito enquanto o cliente estava desconectado..." |
| Navegador volta de suspensão | Continuação: a aba recebe "foco" ainda sem tempo real | Busca o estado por HTTP | O lance perdido aparece; depois o tempo real reconecta sozinho ("Tempo real conectado") | E2E `falhas.spec.ts` (2º) |
| API do museu: timeout, 429, 5xx, JSON inválido, fora do ar | Imitador local da API | `CATALOG_UNAVAILABLE` (503) sem nova tentativa automática; cache vencido servido por até 10 min informando a idade | Conforme esperado | API `catalog-client`: "timeout curto...", "429 vira...", "erro 5xx vira...", "resposta que não é JSON...", "API fora do ar..." e "com a API falhando, serve o cache vencido..."; `lot-offline` (lote continua consultável) |
| Imagem do museu falha | O Playwright bloqueia `openaccess-cdn.clevelandart.org` | Imagem substituta local com texto alternativo; o resto do lote aparece | `src="/obra-sem-imagem.svg"`, `alt` termina com "(imagem indisponível)", título visível | E2E `falhas.spec.ts` (3º) |
| Servidor reinicia com lote vencido | Lote vencido com o servidor parado | O job liquida no startup | Liquidado na primeira execução do job (intervalo de 10 min no teste) | API `settlement` "startup: lote que venceu com o servidor parado..."; ponta a ponta local da etapa 11 |
| Job de liquidação em paralelo | Dois executores parados no mesmo bloqueio | Uma única liquidação | Uma linha em `settlements`, um comprovante, dois lançamentos | API `settlement` "dois executores ao mesmo tempo..." e "repetir o job..." |
| Falha no meio da liquidação | Gatilho só no banco de teste derruba o INSERT do comprovante | Tudo desfeito; pendência registrada; próximo ciclo liquida uma vez | Conforme esperado | API `settlement` "falha no meio da transação desfaz tudo..." |
| Carteira disputada por dois lotes | Cliente sem saldo para os dois lances, enviados ao mesmo tempo em lotes diferentes | Só um aceito | Só um aceito; comprometido coerente | API `bids` "mesmo cliente em dois lotes sem saldo para os dois..." e "lances cruzados em dois lotes trocando liderança não travam" |
| Horário sob bloqueio demorado | Lance enviado antes do fim, mas que só consegue o bloqueio do lote depois do fim | Recusado (o relógio é lido depois dos bloqueios) | `LOT_ENDED`, nada muda; liberado antes do fim, aceita e prorroga | API `bids` "lance enviado antes do fim, mas que só obtém o bloqueio depois do fim, é recusado" e "o mesmo cenário, liberado antes do fim..." |

## Estados intermediários da integridade

| Estado | Esperado | Observado | Evidência |
| --- | --- | --- | --- |
| Lance gravado no banco, âncora não confirmada (âncora fora do ar) | Lance aceito com `audit.status: "pending"`; verificação PENDENTE ou INDISPONÍVEL, nunca ÍNTEGRO; reconciliador confirma | Conforme esperado | API `audit` "âncora fora do ar no lance..." |
| Lance gravado, confirmação pós-commit falha com erro inesperado | 201 pendente (não 500); reconciliador confirma | **Era 500 (D1)**; corrigido | API `bids` "falha inesperada ao confirmar na âncora DEPOIS do commit" |
| Âncora gravou, resposta perdida | Repetir é inofensivo e confirma | Conforme esperado | API `audit` "âncora gravou mas a resposta se perdeu..." |
| Replay repetido e fora de ordem na âncora | Aceito sem duplicar | Conforme esperado | API `audit` "gravação fora de ordem na âncora (2 antes de 1) é aceita" |
| Âncora ausente ou inacessível na verificação | INDISPONÍVEL (nunca ÍNTEGRO); adulteração local continua aparecendo | Conforme esperado; a página pública mostra em amarelo | API `audit` "âncora indisponível na verificação..."; navegador na etapa 16 |
| Banco restaurado para um checkpoint válido antigo (rollback) | ADULTERADO | Conforme esperado | API `audit` "restaurar o banco a um estado antigo (rollback): a âncora denuncia" |
| Operação dependente com pendência real | A liquidação espera a confirmação | Conforme esperado | API `settlement` "último lance ainda sem confirmação na âncora: espera a reconciliação..." e "âncora fora do ar: VERIFICAÇÃO INDISPONÍVEL não liquida..." |
| Recuperação sem reassinar conteúdo suspeito | O reconciliador recusa ancorar checkpoint de histórico adulterado e nunca assina de novo | Conforme esperado | API `audit` "o reconciliador não ancora checkpoint pendente de um histórico adulterado e nunca assina de novo" |
| Chave ausente ou inválida | O servidor não sobe e não cria chave sozinho | `AUDIT_SIGNING_PRIVATE_KEY` vazia ou inválida: "Configuração inválida", código de saída 1 (comando abaixo) | Execução manual nesta etapa |

Comando usado para a chave (sem banco envolvido; o servidor para na leitura da configuração):

```bash
cd apps/api
PORT=3400 AUDIT_SIGNING_PRIVATE_KEY= npx tsx src/server.ts
```

## Revisões de código

| Verificação | Resultado |
| --- | --- |
| `pool.query` dentro de transação | Nenhum: todas as transações (`withTransaction`, `withIdempotency`) usam o cliente recebido |
| SQL não parametrizado | Nenhum com entrada do usuário. Interpolações são constantes do código (`PUBLIC_LOT_SELECT`, `LOT_STATUS_SQL`); o `CREATE DATABASE` do script local usa um nome validado por expressão regular (identificador não aceita parâmetro) |
| Limites de centavos e overflow de lance + incremento | Maior lance aceito (R$ 10.000.000,00, teto da carteira) + maior incremento (R$ 100.000.000,00) = R$ 110.000.000,00, inteiro seguro; o esquema da rota recusa valores acima do teto e acima do maior inteiro seguro; o banco converte BIGINT com checagem de inteiro seguro. Testes novos em `bid-rules.test.ts` ("limites de centavos") |
| Falha de auditoria virando sucesso silencioso | Não acontece: a verificação nunca mostra ÍNTEGRO sem a âncora; a liquidação só paga com ÍNTEGRO e registra o motivo; a resposta do lance diz "pendente" |
| Mensagens de interface | Lance e depósito: recusa (título + mensagem da API), sem resposta (reenviar o mesmo pedido) e aceito com auditoria pendente. Cancelamento e criação de lote: corrigidos (D2) |

## Limitações que permanecem

- Não há resiliência genérica: valem só os cenários acima.
- Um lance apagado antes de chegar à âncora (janela de milissegundos) pode não ser detectado (`docs/AUDITORIA.md` §8).
- Criar lote não tem chave de idempotência: depois de uma resposta perdida, a tela pede para conferir a lista antes de tentar de novo, mas não impede um segundo lote se a pessoa insistir.
- O tempo real é de uma instância; com várias, eventos de uma não chegam às conexões da outra (a tela se recupera por HTTP).
- No Render gratuito, o serviço dorme sem tráfego; a liquidação de lotes vencidos acontece quando ele acorda (no startup).
