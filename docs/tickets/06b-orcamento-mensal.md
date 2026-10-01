# 06b — Orçamento mensal por categoria, com alerta

**Depende de:** 06a (usa a agregação por categoria de `src/lib/reports.ts`).

## Contexto

"Orçamento mensal por categoria, com alerta ao estourar" faz parte do escopo aceito da v1.

## Decisões já tomadas

- Orçamento por categoria e por mês, com alerta ao estourar.
- Gasto conta pela **data da compra** (cartão incluso) e ignora transferências.

## Propostas a confirmar com o usuário (não foram discutidas)

1. **Valor que "vale para os meses seguintes até ser alterado"** (*carry-forward*): o limite de um mês é a
   linha mais recente com `month <= mês`. Evita redigitar 12 vezes. Alternativa: um limite por mês, com botão
   "copiar do mês anterior". Recomendo o carry-forward.
2. **Limite no pai inclui as subcategorias**; limite numa subcategoria é independente e mostrado à parte.
3. Limiares de alerta: 80% = atenção, 100% = estourou.

## Modelo de dados (migração nova, aditiva)

`budgets(id, category_id → categories, month TEXT 'AAAA-MM', amount_cents INTEGER, UNIQUE(category_id, month))`.
`amount_cents = 0` significa "sem limite a partir deste mês" (interrompe o carry-forward).

## Módulo puro: `src/lib/budget.ts` (testes primeiro)

```ts
resolveLimit(rows, categoryId, month) -> number | null        // carry-forward
budgetStatus({ spentCents, plannedCents, limitCents }) -> {
  percent: number; remainingCents: number;
  level: "ok" | "atencao" | "estourou";
  projectedLevel: ...     // considerando gasto + previstos até o fim do mês
}
```

Casos: sem limite; limite 0; exatamente 80%/100%; só previstos estouram; gasto > limite; mês passado (sem
projeção); virada de ano no carry-forward.

## UI

- `/orcamento?mes=AAAA-MM`: lista as categorias de despesa (pai, com subcategorias recolhíveis), campo de
  limite editável em linha, barra de progresso com **gasto efetivado** + trecho mais claro para os
  **previstos**, texto "R$ 420 de R$ 600 · restam R$ 180". Nível por **ícone + texto**, não só cor.
- Resumo: cartão "Orçamento do mês" com as 3 categorias mais perto do limite (ou estouradas), link para a página.
- Aviso discreto ao salvar um lançamento que faz estourar o limite (mensagem após o redirect, sem bloquear).

## Critérios de aceite

- [ ] Definir limite num mês vale nos seguintes até ser mudado; mudar num mês não altera os anteriores.
- [ ] Gasto do pai soma as subcategorias; compras no cartão contam no mês da compra.
- [ ] Previstos (parcelas, recorrências) aparecem como projeção separada do gasto efetivado.
- [ ] Estouro mostra ícone + texto e aparece no Resumo.
- [ ] Remover limite (0) interrompe o carry-forward.

## Testes esperados

Unitários de `budget.ts`; repositório (upsert, carry-forward, UNIQUE); e2e `t06b-orcamento.spec.ts`:
definir limite, lançar despesas até estourar, ver alerta no Resumo.

## Fora de escopo

Orçamento por conta, rollover de sobra para o mês seguinte, metas de economia (reserva de emergência).
