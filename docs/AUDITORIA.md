# Auditoria do histórico de lances (R13)

Documento escrito antes da implementação da etapa 10 (29/10/2026) e atualizado com os resultados dos testes no fim da etapa. Descreve o que a auditoria garante, contra quem, e o que **não** garante.

## 1. O que se quer proteger

O histórico de lances de cada lote:
- quem deu cada lance: o pseudônimo público e a ligação privada com o usuário (`bidder_ref` = SHA-256 de `bidder_id:lot_id`);
- o valor, em centavos;
- o instante, em UTC com milissegundos;
- a ordem (sequência 1, 2, 3...);
- os parâmetros do lote que definem a disputa: dono, obra (snapshot), lance inicial, incremento, início e fim original;
- o fim atual (prorrogações), que precisa ser coerente com os lances.

## 2. Modelo de ameaça

| Quem | O que consegue | Coberto? |
| --- | --- | --- |
| **Atacante com escrita no PostgreSQL principal** (ex.: `DATABASE_URL` vazada, alguém com acesso ao painel do Neon principal) | `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` e restauração de backup no banco principal | **Sim.** Este é o atacante de referência |
| Atacante que também tem a chave privada de assinatura (`AUDIT_SIGNING_PRIVATE_KEY`, só no servidor) | Assinar checkpoints falsos | **Não**, se ele também puder escrever na âncora. Só com a chave, ainda esbarra na âncora para remoções e alterações já ancoradas |
| Atacante que controla o servidor da aplicação (chave e credencial da âncora) | Tudo o que a aplicação faz | **Não.** Fora do modelo |
| Dono da conta Neon da âncora (pode apagar ou restaurar a âncora) | Reescrever a âncora | **Não.** Fora do modelo |
| Visitante comum | Só ler a API pública | Não altera nada; vê o resultado da verificação |

A garantia é sempre relativa a esse modelo. A interface não usa a frase "à prova de adulteração" sem explicar estes limites.

## 3. Técnica (sem blockchain)

1. **Cadeia de hashes por lote.** O primeiro lance encadeia na gênese do lote: o hash dos parâmetros do lote. `hash = SHA-256(prev_hash + "\n" + conteúdo canônico v1)`. O conteúdo canônico tem campos em ordem fixa, centavos como texto e horário ISO em UTC com milissegundos. Alterar, inserir, remover ou reordenar quebra a cadeia.
2. **Checkpoint assinado (Ed25519) a cada lance.** A mensagem assinada é `verzel-audit-v1|lot_id|bid_count|last_hash|key_version`. A chave privada fica só no servidor (variável de ambiente), fora do banco e do repositório, e não muda no deploy. A chave pública é publicada em `GET /api/audit/public-key`. Quem só tem acesso ao banco **não consegue gerar assinaturas válidas**: recalcular os hashes não basta.
3. **Âncora independente.** Cada checkpoint assinado também é gravado num **segundo PostgreSQL** (outro projeto Neon, com credencial própria), numa tabela só de inserção (`anchor_entries`): um gatilho recusa `UPDATE`, `DELETE` e `TRUNCATE` (em produção a aplicação usa o usuário dono; o usuário restrito a `INSERT` e `SELECT` não foi aplicado, ver seção 7). A âncora guarda o que já aconteceu. Se o banco principal "voltar no tempo" (remoção da cauda, backup antigo, checkpoint antigo), ele terá menos lances que a âncora.

**Por que não blockchain:** o problema é detectar mudanças feitas por quem tem acesso ao banco, não obter consenso entre partes que não confiam umas nas outras. Uma assinatura digital (só o servidor assina) mais uma cópia independente (o banco principal não apaga) resolvem isso com duas tecnologias simples e verificáveis. Blockchain traria custo, complexidade e dependência externa sem acrescentar garantia ao modelo acima.

**Por que não um arquivo em disco:** o disco do Render no plano gratuito é efêmero (some no deploy), e o disco persistente exige plano pago e fica no mesmo servidor da aplicação. Por isso a âncora é um banco separado (decisão da etapa 01).

## 4. Protocolo entre o banco e a âncora

Não existe transação atômica entre dois bancos. O protocolo torna a janela entre eles **visível e recuperável**:

1. **Na transação do lance** (banco principal): grava o lance com `prev_hash` e `hash`, assina o checkpoint e grava em `audit_checkpoints` com `anchor_status = 'pending'`. `COMMIT`.
2. **Depois do commit:** `INSERT ... ON CONFLICT (lot_id, bid_count) DO NOTHING` na âncora e leitura da linha.
   - Linha igual (inserida agora ou numa tentativa anterior): marca o checkpoint `confirmed`.
   - Linha diferente: **conflito**. Não sobrescreve e mantém `pending`; a verificação mostra adulteração.
   - Âncora fora do ar ou lenta (timeout de 3 s): mantém `pending`.
3. **Reconciliador** (no startup e a cada 30 s): para cada checkpoint `pending`, confere a assinatura com a chave pública e confere que a cadeia atual do banco, até aquela contagem, ainda gera o `last_hash` assinado. Só então grava na âncora. **Nunca assina de novo**: só reenvia assinaturas criadas na hora do lance. Checkpoint que não confere não é ancorado.
4. **O lance é aceito antes da âncora**: ele é financeiramente válido logo após o commit, mas a resposta diz `audit.status: "pending"`. A confirmação definitiva aparece na verificação pública. Lote com checkpoint pendente **não pode ser liquidado** até a reconciliação. Implementado na etapa 11: a liquidação verifica o lote antes de pagar e só segue com ÍNTEGRO; pendente, indisponível ou adulterado ficam registrados em `settlement_issues` com o motivo.

## 5. Matriz de falhas

| Situação | O que acontece | Estado mostrado |
| --- | --- | --- |
| Commit ok, gravação na âncora falhou | Checkpoint fica `pending`; o reconciliador grava depois | VERIFICAÇÃO PENDENTE até confirmar |
| Âncora gravou, mas a resposta se perdeu | Checkpoint segue `pending`; o reconciliador tenta de novo, encontra a mesma linha e confirma | PENDENTE → ÍNTEGRO |
| Servidor reiniciou entre o commit e a âncora | O reconciliador no startup retoma | PENDENTE → ÍNTEGRO |
| Âncora atrasada (falta o último) | Lances além da âncora estão cobertos por checkpoint assinado | PENDENTE |
| Âncora adiantada (tem mais lances que o banco) | Indica remoção da cauda ou restauração antiga do banco principal | ADULTERADO |
| Escrita repetida | A chave primária `(lot_id, bid_count)` e a comparação tornam a repetição inofensiva | — |
| Escrita fora de ordem (n+1 antes de n) | Aceita; cada entrada é assinada e independente | — |
| Âncora fora do ar na hora de verificar | Sem a âncora não se afirma integridade | VERIFICAÇÃO INDISPONÍVEL (ou ADULTERADO, se o próprio banco já mostra a adulteração) |
| Restauração legítima de backup do banco principal | Fica igual a um ataque de rollback | ADULTERADO; exige ação do operador (seção 7) |

## 6. Verificação (`GET /api/lots/:id/audit`, pública)

Ordem dos testes:
1. Sequência contínua 1..N.
2. Para cada lance: `bidder_ref` confere com o participante privado, `prev_hash` encadeia e o `hash` recalculado confere.
3. Lote coerente: contagem de lances, líder = último lance, fim = fim original + prorrogações calculadas a partir dos lances.
4. Checkpoints do banco: assinatura válida e `last_hash` igual à cadeia naquela contagem.
5. Âncora: cada entrada com assinatura válida e igual à cadeia; a âncora não pode ter mais lances que o banco.
6. Cobertura: lances além da última confirmação na âncora precisam de checkpoint assinado.

| Estado | Quando |
| --- | --- |
| **ÍNTEGRO** | Tudo confere e todos os lances estão confirmados na âncora (ou o lote não tem lances e a âncora também não) |
| **ADULTERADO** | Qualquer divergência nos passos 1 a 5; ou lance sem checkpoint assinado num lote que já tem evidência de auditoria |
| **VERIFICAÇÃO PENDENTE** | Tudo confere, mas o(s) último(s) lance(s) ainda não foram confirmados na âncora |
| **VERIFICAÇÃO INDISPONÍVEL** | Âncora inacessível; ou lote com lances sem nenhuma evidência assinada (lances anteriores à auditoria) |

A resposta traz o histórico completo (pseudônimo, valor, horário, `bidder_ref`, `prev_hash`, `hash`), sem email, nome ou id interno, e o motivo em português.

## 7. Operação

- **Gerar a chave uma única vez:** `npm run audit:keygen -w apps/api` no computador do candidato. Cadastrar no Render como segredo e guardar uma cópia offline (gerenciador de senhas). Não regenerar no deploy: checkpoints antigos deixariam de ser verificáveis.
- **Troca de chave:** nova `AUDIT_KEY_VERSION`, com a chave pública antiga em `AUDIT_PREVIOUS_PUBLIC_KEYS`.
- **Usuário da âncora em produção:** o dono do projeto Neon da âncora. O gatilho recusa `UPDATE`, `DELETE` e `TRUNCATE` vindos da aplicação. Um usuário restrito a `INSERT` e `SELECT` é um endurecimento opcional **não aplicado** (`docs/DEPLOY.md`); quem tiver a credencial da âncora poderia remover o gatilho, e esse atacante está fora do modelo (seção 2).
- **Restauração legítima do banco principal:** os lotes afetados passam a aparecer como adulterados. O operador deve registrar o incidente; não há "re-assinatura" automática.

## 8. O que ainda passa (limites declarados)

1. **Remoção de lances ainda não ancorados.** Se o atacante apagar um lance e o checkpoint dele **antes** de chegar à âncora (janela de milissegundos com a âncora no ar; maior se ela estiver fora), o banco volta a um estado coerente com a âncora e a verificação mostra ÍNTEGRO. Mitigação: gravação na âncora logo após o commit e reconciliador a cada 30 s.
2. **Lote sem nenhum lance ancorado:** inserir o primeiro lance falso (sem assinatura) aparece como VERIFICAÇÃO INDISPONÍVEL, não como ADULTERADO, porque não há evidência anterior para comparar. Nunca aparece como ÍNTEGRO.
3. **Apagar o lote inteiro** (linha do lote, lances e checkpoints): a rota do lote responde 404. A detecção depende da verificação global (`npm run audit:check -w apps/api`), que lista lotes presentes na âncora e ausentes no banco.
4. **Quem tem a chave e a credencial da âncora** (o servidor) pode forjar tudo. Fora do modelo.
5. **Dados fora do histórico de lances** (carteiras, reservas, liquidações) não são cobertos por esta cadeia; a consistência financeira vem das restrições do banco e das transações.

Com esses limites, R13 é considerado **atendido no modelo de ameaça acima**, não de forma absoluta.

## 9. Resultados (etapa 10, 29/10/2026)

Implementação: `apps/api/src/modules/audit/` (`chain.ts`, `keys.ts`, `anchor.ts`, `verify.ts`, `service.ts`, `routes.ts`, `keygen.ts`, `check.ts`) e `apps/api/migrations-anchor/`.

Testes em `apps/api/test/audit.test.ts` (27), contra o banco `verzel_test` e a âncora `verzel_anchor_test`, ambos isolados:

| Ataque ou falha | Resultado |
| --- | --- |
| Alterar valor, horário ou pseudônimo de um lance | ADULTERADO ("conteúdo do lance N foi alterado") |
| Trocar o participante privado | ADULTERADO ("participante do lance 1 foi alterado") |
| Alterar parâmetros do lote (gênese) ou o término | ADULTERADO |
| Alterar valor e recalcular toda a cadeia | ADULTERADO (não confere com o checkpoint assinado) |
| Recalcular a cadeia e apagar todos os checkpoints | ADULTERADO (diverge da âncora) |
| Remover lance intermediário; inserir no meio; reordenar | ADULTERADO |
| Remover o último lance de forma coerente (lote, reserva e checkpoint) | ADULTERADO ("a âncora registra 3 lance(s), mas o banco tem 2") |
| Remover todo o histórico | ADULTERADO (a âncora registra lances) |
| Restaurar o banco a um estado antigo (rollback) | ADULTERADO ("restaurado a um estado antigo") |
| Checkpoint forjado com outra chave | ADULTERADO ("assinatura inválida") |
| `UPDATE`/`DELETE` na âncora | Recusados pelo gatilho |
| Lote apagado por inteiro | 404 na rota do lote; a verificação global aponta o lote ausente |
| Âncora fora do ar no lance | Lance aceito com `audit.status: "pending"`; verificação INDISPONÍVEL sem a âncora e PENDENTE com ela; o reconciliador confirma (reinício simulado) |
| Confirmação pós-commit falha com erro inesperado (etapa 18) | Antes: API respondia 500 para o lance já gravado. Corrigido: 201 com auditoria pendente; o reconciliador confirma |
| Âncora gravou, resposta perdida | O reconciliador repete sem duplicar e confirma |
| Gravação fora de ordem (2 antes de 1) | Aceita; ÍNTEGRO |
| Pendente com histórico adulterado | O reconciliador **recusa** ancorar; não assina de novo; ADULTERADO |
| Conflito na âncora (outro conteúdo para o mesmo lance) | Não sobrescreve; ADULTERADO |
| Âncora indisponível na verificação | INDISPONÍVEL (nunca ÍNTEGRO); adulteração local continua aparecendo |
| Lances sem nenhum checkpoint (anteriores à auditoria) | INDISPONÍVEL, nunca ÍNTEGRO |

Prova de que os testes detectam falha: com a checagem "a âncora tem mais lances que o banco" desligada de propósito, os 3 testes de remoção e rollback falharam; depois o código foi restaurado.

**Estado de R13:** implementado e testado localmente, **atendido dentro do modelo de ameaça da seção 2, com os limites da seção 8**. Em produção, a chave e a âncora foram configuradas em 29/10/2026 e a API de auditoria responde (`docs/DEPLOY.md`). A página pública (`/lotes/:id/auditoria`) foi feita na etapa 16 e conferida com lote íntegro, sem lances, adulterado e âncora fora do ar (nunca mostra ÍNTEGRO sem a âncora).
