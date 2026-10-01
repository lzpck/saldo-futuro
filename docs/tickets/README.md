# Tickets — Saldo Futuro

Backlog para ser implementado em outras sessões. Cada ticket é autossuficiente: traz o contexto, as
decisões já tomadas com o dono do projeto, os critérios de aceite e onde mexer no código.

## Estado atual (fatias 1 a 4 concluídas)

App pessoal de finanças de um usuário, lançamentos manuais, escuro, pt-BR/BRL, rodando só em
`127.0.0.1`. Next.js 16 + React 19 + SQLite (`better-sqlite3`, sem ORM) + Tailwind v4.

| Fatia | Entregue |
|---|---|
| 1 | Login (senha única, bloqueio por inatividade de 15 min, throttle), Contas, Categorias (1 nível de subcategoria), Lançamentos (Receita, Despesa, Transferência) |
| 2 | Lista por dias com saldo de fim de dia, gráfico real/projetado, Previsto × Efetivado, Em atraso conta como hoje |
| 3 | Recorrências virtuais (ADR 0002), ocorrências editáveis/puláveis, edição "a partir de", compras parceladas, painel Contas em aberto, Agenda |
| 4 | Contas de cartão: faturas calculadas, pagamento previsto no vencimento, pagar fatura (total/parcial), cartão fora do saldo total |

Pendentes (estes tickets): **05** previsão de valor, **06** relatórios/orçamento/busca/CSV,
**07** configurações e backup, **08** primeiro uso.

## Ordem sugerida e dependências

```
05  Previsão de valor (recorrência variável) ──► 05b  IA opcional (só após avaliar com dados reais)
06a Relatório por categoria ──► 06b Orçamento
06c Busca e filtros ──► 06d Exportar CSV
07a Configurações (+ trocar senha) ──► 07b Backup manual (JSON) ──► 07c Backup automático
08  Primeiro uso e dados de demonstração   (independente; melhor logo, ajuda a testar o resto)
```

05, 06 e 07 são independentes entre si. 05b depende de 05 e de 07a. Sugestão: **07a → 07b → 07c** cedo,
porque os dados reais do usuário passam a existir assim que ele começa a usar o app.

## Como retomar (leia antes de codar)

1. **`AGENTS.md`/`CLAUDE.md`**: este Next.js tem mudanças incompatíveis. Antes de escrever código de
   rota/ação/cache, leia o guia certo em `node_modules/next/dist/docs/` (ex.: `proxy` no lugar de
   `middleware`, `PageProps<"/rota">` tipado, `cookies()` assíncrono).
2. **`CONTEXT.md`**: glossário do domínio. Use esses termos no código e na UI (Lançamento, Previsto,
   Efetivado, Em atraso, Ocorrência, Fatura…). Quando um termo novo se firmar, registre lá na hora.
   Nada de detalhe de implementação no `CONTEXT.md`.
3. **`docs/adr/`**: 0001 valores em centavos inteiros; 0002 recorrências virtuais; 0003 cartão fora do
   saldo total, faturas calculadas e abatimento do mais antigo para o mais novo.
4. Rodar: `npm install`, `npm run dev` (`http://127.0.0.1:3000`). O usuário costuma ter o próprio
   `npm run dev` aberto: **não encerre** processos que você não iniciou, e peça para ele reiniciar o
   servidor depois de migrações.
5. Idioma: interface, mensagens de erro e commits em português do Brasil.

## Convenções do código

- **Lógica de domínio pura** em `src/lib/*.ts` (sem banco, sem React), com teste Vitest escrito junto
  (TDD). Exemplos: `projection.ts`, `recurrence.ts`, `cards.ts`. Banco em `src/lib/repos/*.ts`: funções
  que recebem `db` como primeiro argumento e são testadas com `openDb(":memory:")`.
- **Dinheiro em centavos inteiros**; datas como string `AAAA-MM-DD` (nunca `Date` com fuso);
  `todayISO()` de `src/lib/dates.ts`.
- **Migrações só acrescentam** ao fim do array em `src/lib/db/migrations.ts` (a posição é o
  `PRAGMA user_version`). Nunca edite uma já aplicada. Prefira migrações *aditivas* (coluna nova com
  default, tabela nova): o ticket 07b conta com isso para importar backups antigos.
- **Server Actions** (`src/app/actions/*.ts`) começam com `await verifySession()`. **Route Handlers**
  também precisam checar sessão (o `proxy.ts` só olha se existe cookie) e devem responder `401`, não
  redirecionar.
- Base de tudo que lista ou projeta: `listSchedule(db, to, today)` (`src/lib/repos/schedule.ts`) =
  lançamentos gravados + ocorrências virtuais (ids negativos, `isVirtual`) + pagamentos de fatura
  virtuais (`invoiceCardId`). Não use `listTransactions` direto para projeção.
- Cartões ficam **fora** do saldo total (`totalBalanceCents`, escopo da projeção).
- Componentes não podem ser declarados dentro de outro componente (o ESLint reprova).
- Depois de criar rotas novas: `npx next typegen` antes do `tsc` (gera os tipos `PageProps`).

## Definição de pronto (vale para todos os tickets)

- [ ] `npx vitest run` verde, com testes novos para a lógica nova.
- [ ] `npx eslint` e `npx tsc --noEmit` sem erros.
- [ ] `NEXT_DIST_DIR=.next-build npx next build` passa (apague `.next-build` depois).
- [ ] `npx playwright test` verde. Os specs são **encadeados** (um banco temporário compartilhado,
      arquivos em ordem alfabética: `fatia1…fatia4`). Crie o seu como `e2e/tNN-nome.spec.ts` (ordena
      depois dos atuais) e use valores relativos (meça o saldo antes/depois) em vez de absolutos.
      Rodar um spec isolado falha por falta de senha: rode a suíte inteira.
- [ ] Telas novas conferidas em captura de tela no desktop (1280) e no celular (390). Os avisos de
      hidratação "caret-color" que aparecem durante capturas são artefato do Playwright, não bug.
- [ ] `CONTEXT.md` atualizado se surgiu termo novo; ADR só se as três condições valerem (difícil de
      reverter, surpreendente sem contexto, fruto de trade-off real).
- [ ] Não commitar sem o usuário pedir (o repositório ainda não tem commits).

## Armadilhas já encontradas nos testes e2e

- `getByLabel("Valor")` casa por substring: pode pegar vários campos ("Valor informado"). Prefira ids
  ou rótulos exatos.
- Depois de `click()` que navega, espere `waitForURL` antes de procurar elementos que também existam
  na página anterior (ex.: o link "Editar").
- `allTextContents()` não espera a página carregar.

## Pendências e riscos conhecidos (sem ticket)

- **Recorrência com início no passado** deixa as ocorrências vencidas Em atraso (o formulário avisa).
  Se incomodar, considerar "valer só a partir de hoje" ou pular em lote.
- **Pagamentos de fatura abatem da fatura mais antiga para a mais nova** (sem vínculo pagamento→fatura);
  veja o ADR 0003. Não há limite de crédito nem lógica de dia útil.
- A projeção carrega todo o histórico em memória (`listSchedule`). Para uso pessoal é instantâneo; só
  revisitar se passar de dezenas de milhares de lançamentos.
- Mudar o dia de fechamento de um cartão reorganiza as compras entre as faturas (a tela avisa).
