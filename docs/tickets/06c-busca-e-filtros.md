# 06c — Busca e filtros avançados na lista de lançamentos

**Depende de:** nada. **Libera:** 06d (a exportação usa os mesmos filtros).

## Contexto

`/lancamentos` (`src/app/(app)/lancamentos/page.tsx`) hoje filtra só por mês, conta e categoria (id exato).
"Busca e filtros" está no escopo aceito da v1.

## Decisões já tomadas

- Entra na v1: busca e filtros na lista de lançamentos.
- O saldo por dia some quando o filtro deixa a lista de ser o fluxo completo (já é assim com categoria).

## Comportamento

- **Campos novos:** texto (descrição), tipo (receita/despesa/transferência), situação (previsto/efetivado/
  em atraso), faixa de valor (mín/máx, em reais com vírgula), período livre (de/até), além dos atuais conta
  e categoria.
- **Busca de texto sem diferenciar maiúsculas nem acentos** ("cafe" acha "Café"). O `LIKE` do SQLite só
  ignora caixa em ASCII: normalize no JS (`normalize("NFD")` sem diacríticos) ou guarde coluna normalizada.
- **Categoria pai inclui as subcategorias** (hoje é só o id exato; é uma mudança de comportamento
  intencional: filtrar "Moradia" deve mostrar Luz, Gás…).
- **Dois modos:** (a) *visão do mês* (atual: navegação por mês, saldo por dia, gráfico), quando não há texto
  nem período livre; (b) *resultados da busca*, quando há texto ou período livre ou valor: lista plana por
  data decrescente, **sem saldo por dia**, com totais (receitas, despesas, líquido) e paginação (50 por vez).
- "Incluir previstos" (padrão ligado) para ocorrências virtuais e parcelas futuras; vem de
  `listSchedule`. Pagamentos de fatura virtuais seguem a mesma opção.
- Todos os filtros ficam na URL (compartilháveis/recarregáveis) e há "Limpar filtros".

## Módulo puro novo: `src/lib/filters.ts` (testes primeiro)

```ts
parseFilters(searchParams) -> Filters          // valida e ignora lixo
filterTransactions(txs, filters, categories) -> Transaction[]
```

Casos: texto com acento/caixa; faixa de valor com vírgula; pai inclui filhos; situação "em atraso" usa
`isOverdue`; período invertido (de > até) é corrigido ou rejeitado com mensagem; parâmetros inválidos caem em
padrão sem erro; transferência casa por conta de origem **ou** destino.

## Critérios de aceite

- [ ] Cada filtro isolado e combinados retornam o esperado.
- [ ] Busca por "cafe" encontra "Café" e "CAFÉ".
- [ ] Filtrar por categoria pai traz as subcategorias.
- [ ] Resultados da busca mostram totais e paginam; a visão do mês continua como hoje.
- [ ] Estado dos filtros sobrevive a recarregar a página; "Limpar" volta ao padrão.
- [ ] Formulário de filtros usável no celular (recolhível).

## Testes esperados

Unitários de `filters.ts`; e2e `t06c-busca.spec.ts` (criar lançamentos variados, buscar, combinar filtros,
paginar, limpar).

## Fora de escopo

Exportar (06d), tags, buscas salvas, ordenação por coluna.
