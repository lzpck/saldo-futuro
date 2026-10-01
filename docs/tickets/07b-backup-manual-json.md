# 07b — Backup manual: exportar e importar tudo em JSON

**Depende de:** 07a (a tela `/configuracoes` hospeda os botões). **Libera:** 07c.

## Contexto

Os dados vivem num único arquivo SQLite (`data/saldo.db`). Se o disco falhar ou o arquivo corromper, perde-se
tudo, e isso é "quase impossível de consertar depois". O planejamento aceitou: **exportar/importar um backup
completo (JSON) pelo próprio app** (este ticket) **e cópia automática diária** (07c).

## Decisões já tomadas

- Formato JSON, pelo próprio app, com exportar e importar.
- O JSON **não contém a senha** (`auth_settings`) nem sessões: restaurar nunca troca a senha do usuário.

## Formato

```json
{ "app": "saldo-futuro", "schemaVersion": 3, "exportedAt": "2026-10-01T12:00:00Z",
  "tables": { "accounts": [...], "categories": [...], "transactions": [...], "recurrences": [...],
              "recurrence_skips": [...], "installment_purchases": [...], "settings": [...] } }
```

- `schemaVersion` = `PRAGMA user_version` no momento da exportação. Cada tabela é uma lista de objetos com os
  nomes de coluna do banco, **ids preservados** (transações apontam para contas/categorias por id).
- Gere a lista de tabelas a partir de uma constante única, para novas tabelas (ex.: `budgets`, `recurrence_history_seed`
  dos tickets 05 e 06b) não serem esquecidas. Teste que falha se existir tabela de domínio que não está na
  lista de exportação.

## Exportar

`GET /api/backup/export` (Route Handler; checar sessão com resposta `401`, ver convenções do README):
`Content-Disposition: attachment; filename="saldo-futuro-AAAA-MM-DD.json"`, `Cache-Control: no-store`. Botão
"Baixar backup (JSON)" em `/configuracoes`. Avisar que o arquivo **não é criptografado**.

## Importar (substitui tudo)

`POST /api/backup/import` com `multipart/form-data` (use Route Handler, não Server Action: o limite de corpo
padrão das Server Actions é pequeno). Passos, em uma transação:

1. Validar o arquivo com Zod (formato, `app`, tipos). Rejeitar se `schemaVersion` for **maior** que a versão do
   app ("atualize o app antes"). Se for menor, aceitar: **as migrações são aditivas**, então inserimos só as
   colunas presentes no backup e as colunas novas assumem o *default*. (Se uma migração futura deixar de ser
   aditiva, o importador precisa de tratamento explícito; documente isso no código.)
2. **Backup de segurança antes de substituir:** `db.backup()` do banco atual para `data/backups/antes-da-importacao-<data-hora>.db`.
3. `PRAGMA defer_foreign_keys = ON`; apagar as tabelas na ordem inversa das dependências; inserir na ordem
   certa preservando ids; `PRAGMA foreign_key_check` antes do *commit*; qualquer erro faz *rollback* e deixa o
   banco intacto.
4. Manter `auth_settings` e `sessions` como estão.
5. Confirmação forte na UI: mostrar o resumo do arquivo (data, quantidade de lançamentos/contas) e exigir
   digitar "SUBSTITUIR" (ou caixa de seleção explícita). Mensagem final com contagens importadas.

## Critérios de aceite

- [ ] **Ida e volta:** exportar de um banco rico (conta corrente + cartão com faturas, recorrência com
      ocorrência editada e pulada, compra parcelada, categorias com subcategoria) e importar num banco novo
      resulta em linhas idênticas **e** nos mesmos saldos, faturas e projeção.
- [ ] Importar arquivo inválido/corrompido/de versão futura não altera nada.
- [ ] Erro no meio da importação faz rollback completo.
- [ ] A senha atual continua funcionando depois de importar.
- [ ] Sem sessão, os dois endpoints respondem 401.
- [ ] Arquivo de backup de versão anterior (gerado com o esquema da fatia 3, por exemplo) importa com as
      colunas novas nos valores padrão.

## Testes esperados

Unitários com `openDb(":memory:")`: ida e volta; teste de "lista de tabelas completa"; versão futura rejeitada;
versão antiga aceita (monte o JSON à mão sem as colunas novas); *rollback*; chaves estrangeiras. e2e
`t07b-backup.spec.ts`: baixar, alterar dados, importar, conferir que voltou.

## Fora de escopo

Backup automático (07c), criptografar o arquivo (se o usuário pedir: senha própria do backup, AES-GCM com
chave derivada por scrypt, e vira decisão de ADR), mesclar em vez de substituir.
