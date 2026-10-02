# Saldo Futuro

App pessoal de finanças, de um único usuário, com lançamentos totalmente manuais. O foco é entender para onde o dinheiro vai e projetar o saldo ao longo dos dias.

## Funcionalidades

- **Contas**: corrente, carteira, benefício, caixinha e cartão, com conta favorita e arquivamento.
- **Lançamentos**: receitas, despesas e transferências, previstos ou efetivados.
- **Projeção de saldo**: saldo dia a dia considerando lançamentos previstos, recorrências e parcelas.
- **Cartões e faturas**: faturas calculadas a partir das compras, com pagamento abatendo da mais antiga para a mais nova.
- **Agenda**: recorrências (inclusive de valor variável com previsão), parcelamentos e ocorrências.
- **Caixinhas e Benefício**: dinheiro guardado ou de uso restrito, fora do Saldo total e da Projeção.
- **Categorias, orçamento e relatórios**: gastos por categoria, limites mensais e busca.

O vocabulário do domínio está em [`CONTEXT.md`](CONTEXT.md) e as decisões de arquitetura em [`docs/adr/`](docs/adr/).

## Tecnologias

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, SQLite (`better-sqlite3`), Zod. Testes com Vitest e Playwright.

> Esta versão do Next.js tem mudanças incompatíveis com versões anteriores. Consulte `node_modules/next/dist/docs/` antes de alterar código do framework (veja `AGENTS.md`).

## Como rodar

Requer Node.js 20 ou superior.

```bash
npm install
npm run dev      # http://127.0.0.1:3000 (só escuta em localhost)
```

No primeiro acesso o app pede para criar a senha.

Para produção local:

```bash
npm run build
npm start
```

## Dados e backup

Os dados ficam em `data/saldo.db` (ou no caminho definido em `DATABASE_PATH`). A pasta `data/` não é versionada. Para fazer backup, copie esse arquivo.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e execução de produção |
| `npm run lint` | ESLint |
| `npm test` | Testes unitários (Vitest): valores, datas, saldo, login, formulários |
| `npx playwright test` | Testes ponta a ponta (usa o Edge instalado e um banco temporário) |
| `npm run backtest` | Backtest da previsão de valor de recorrências variáveis |

## Estrutura

```
src/app/        rotas e telas (contas, lançamentos, cartões, agenda, categorias, orçamento, relatórios)
e2e/            testes ponta a ponta (Playwright)
scripts/        scripts utilitários
docs/adr/       decisões de arquitetura
CONTEXT.md      linguagem do domínio
```
