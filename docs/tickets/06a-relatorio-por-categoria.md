# 06a — Relatório de gastos por categoria e comparativo entre meses

**Depende de:** nada. **Libera:** 06b (reaproveita a agregação por categoria).

## Contexto

O objetivo central do app é "entender onde o dinheiro está indo". Hoje só existe a lista de lançamentos e
os totais de receita/despesa do mês. Falta ver **gastos por categoria** e comparar meses.

## Decisões já tomadas

- Escopo da v1 aceito: gastos por categoria no mês (rosca ou barras) **e comparativo entre meses**.
- A **categoria vale na data da compra** (cartão incluso): uma compra no cartão aparece no mês em que foi
  feita, não no do vencimento da fatura. Isso já é o comportamento dos lançamentos; o relatório só agrega.
- **Transferências não entram** em relatórios por categoria (nem pagamentos de fatura).
- Categorias têm um nível de subcategoria; o relatório agrega no pai e permite detalhar.

## Módulo puro novo: `src/lib/reports.ts` (testes primeiro)

```ts
spendingByCategory(txs, categories, { from, to, kind: "despesa" | "receita", includePlanned })
  -> { categoryId | null, name, color, icon, totalCents, children: [...] }[]  // ordenado por total desc
monthlyTotalsByCategory(txs, categories, months[], opts)  // para o comparativo
```

- `kind` seleciona Despesas ou Receitas; estorno no cartão é uma Receita (categoria de receita) e aparece na
  aba de receitas, não abate a categoria de despesa.
- Lançamento sem categoria vai para "Sem categoria".
- Subcategoria soma no pai; `children` traz o detalhe. Pai que também recebe lançamento direto entra como
  "Outros de <pai>" dentro de `children`.
- `includePlanned`: soma também Previstos (parcelas, ocorrências virtuais). Entrada vem de
  `listSchedule(db, to, today)` filtrando fora transferências e pagamentos de fatura.
- Totais em centavos inteiros; a soma das fatias deve fechar com o total (teste de propriedade).

## UI: `/relatorios` (item novo no menu, ou dentro de Lançamentos se o menu ficar apertado no celular)

- Seletor de mês (mesmo padrão de `lancamentos/page.tsx`), abas Despesas | Receitas, alternância "Incluir
  previstos" (padrão: ligado no mês atual e futuros, desligado no passado).
- Gráfico de rosca **ou** barras horizontais das categorias (top 7 + "Outras", conforme a regra de ≤ 8
  séries). Ao lado, a **tabela** completa (categoria, valor, % do total, variação vs. mês anterior).
- Clicar na categoria mostra as subcategorias e um link para `/lancamentos?mes=…&categoria=…`.
- Comparativo: últimos 6 meses (barras empilhadas por categoria principal ou *small multiples* das 5 maiores).
- No Resumo, link "Ver relatório" no cartão de despesas do mês.

## Visualização de dados

Se a skill `dataviz` estiver disponível, leia-a antes de escrever o gráfico: forma, cor, marcas, legenda,
tooltip e versão em tabela. Pontos que valem aqui:

- As cores das categorias são escolhidas pelo usuário (`categories.color`) e **podem não passar** na
  validação de daltonismo. Rode o `validate_palette.js` da skill sobre as cores exibidas; onde falhar, a
  identidade tem de vir também por rótulo/legenda/textura, nunca só por cor.
- Mantenha o padrão visual do app (tokens em `globals.css`, números tabulares, acento verde-azulado) e o
  componente existente `components/balance-chart.tsx` como referência de tooltip e acessibilidade
  (`role="img"`, tabela equivalente).
- Sem eixo duplo; linha/barra fina; grade discreta.

## Critérios de aceite

- [ ] Totais por categoria batem com a soma dos lançamentos do mês (efetivados; e com previstos quando ligado).
- [ ] Cartão: compra de setembro com fatura em outubro aparece em **setembro**.
- [ ] Transferências e pagamentos de fatura não aparecem.
- [ ] Subcategorias somam no pai e dá para detalhar.
- [ ] Mês vazio mostra estado vazio claro; mês sem categoria mostra "Sem categoria".
- [ ] Funciona no celular (390 px) sem rolagem horizontal da página.
- [ ] Gráfico acessível (tabela equivalente, foco por teclado nas fatias/barras).

## Testes esperados

Unitários de `reports.ts` (incluindo pai+filho, sem categoria, previstos on/off, estorno, soma fecha com o
total, mês sem dados); e2e `t06a-relatorio.spec.ts`: lançar despesas em categorias e subcategorias, conferir
valores e percentuais na tabela e o link para a lista filtrada.

## Fora de escopo

Orçamento (06b), exportação (06d), metas de economia, relatórios por conta/tag.
