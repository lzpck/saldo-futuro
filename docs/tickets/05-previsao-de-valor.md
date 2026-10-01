# 05 — Previsão de valor para recorrências variáveis (luz, gás, água)

**Depende de:** nada (fatias 1–4 prontas). **Libera:** 05b.

## Contexto

Hoje uma Recorrência tem valor fixo (`recurrences.amount_cents`). Contas como luz e gás mudam todo mês, então
a projeção de saldo erra justamente nelas. O usuário pediu "prever o valor de contas como luz e gás com base nos
gastos recentes". O `CONTEXT.md` já define **Recorrência variável** e **Previsão de valor**.

## Decisões já tomadas (rodada 2 do planejamento, Q4)

- Previsão por **estatística local**: média ponderada dos últimos meses, ajustada por **sazonalidade** (mesmo
  mês do ano anterior, quando existir). Determinística e **explicável** ("Estimado em R$ 182 · média ponderada
  dos últimos 3 meses + ajuste sazonal").
- O **valor real é informado ao efetivar**; o previsto vem da previsão.
- IA fica para o ticket 05b, só depois de avaliar este resultado com dados reais.

## Modelo de dados (migração nova, aditiva)

- `recurrences.is_variable INTEGER NOT NULL DEFAULT 0`.
- `recurrences.series_id INTEGER`: identifica a "série" da conta (preencher com o próprio `id` no insert e
  fazer `updateRecurrenceFrom` herdar o `series_id` da regra dividida). **Motivo:** editar "a partir de uma
  data" cria uma regra nova (`src/lib/repos/recurrences.ts`); o histórico precisa seguir a série, não o id da
  regra. Backfill: `UPDATE recurrences SET series_id = id`.
- `recurrence_history_seed(series_id, month TEXT 'AAAA-MM', amount_cents, PRIMARY KEY(series_id, month))`:
  valores de meses anteriores informados à mão para a previsão funcionar desde o dia 1, **sem criar lançamentos**
  (não mexe em saldo).
- `amount_cents` de uma regra variável passa a ser a **estimativa inicial** (fallback sem histórico).

## Módulo puro novo: `src/lib/prediction.ts` (escreva os testes primeiro)

```ts
type HistoryPoint = { month: string /* AAAA-MM */; amountCents: number };
predictAmount(history, targetMonth, fallbackCents) -> {
  amountCents: number; method: "historico" | "inicial";
  monthsUsed: number; seasonal: boolean; explanation: string /* pt-BR */;
}
```

Algoritmo proposto (pode refinar, desde que os testes documentem o comportamento):

1. Agrupar por mês (somar se houver mais de um lançamento no mês), usar só meses **anteriores** a `targetMonth`,
   pegar os últimos 6.
2. Média ponderada linear (mais recente pesa mais: pesos 1…n).
3. Sazonalidade: se existir o mesmo mês do ano anterior (`targetMonth − 12`), misturar 50/50 com a média
   recente, aplicando fator de tendência = (média recente ÷ média do mesmo recorte um ano antes), limitado a
   [0,7; 1,4]. Sem recorte comparável, fator 1.
4. Sem histórico: `fallbackCents`, `method: "inicial"`. Com um só ponto: esse valor.
5. Outlier: valor maior que 2,5× a mediana entra limitado (winsorizado) na média.
6. Arredondar para centavo inteiro, mínimo 1 centavo.

Casos de teste obrigatórios: sem histórico; 1, 2 e 6+ pontos; buracos nos meses; virada de ano; com e sem ano
anterior; outlier; mês-alvo no passado de parte do histórico (ignorar dados "do futuro"); resultado sempre
inteiro e positivo; explicação cita número de meses e se usou sazonalidade.

## Integração

- **Histórico de uma série** = lançamentos efetivados com `recurrence_id` na série (use o mês de
  `occurrence_date`, não o da data do pagamento) **mais** as linhas de `recurrence_history_seed`.
  Ocorrências puladas não entram.
- `listVirtualOccurrences` (`recurrences.ts`): para regra variável, calcular `amountCents` de cada ocorrência
  virtual com `predictAmount` usando só histórico anterior ao mês dela. Não encadear previsões (previsão não
  vira dado de entrada de outra previsão). Carregar o histórico uma vez por chamada (não por ocorrência).
- Acrescentar a `Transaction` os campos `isEstimate: boolean` e `estimateNote: string | null` (só virtuais de
  regra variável). Atualizar os literais que constroem `Transaction` (hoje: `toTransaction`,
  `listVirtualOccurrences`, `listInvoicePayments`, página `agenda/ocorrencia/...`).
- A projeção, o gráfico e o painel já usam `amountCents`, então herdam a estimativa sem mudança.

## UI

- **Formulário** (`lancamentos/transaction-form.tsx`), em Repetição = Recorrente: caixa "O valor muda todo mês
  (luz, água, gás…)". Marcada: o campo Valor vira "Valor estimado (usado até haver histórico)" e aparece
  "Valores dos últimos meses (opcional)" com até 6 pares mês/valor (grava no `history_seed`).
- **Linha de lançamento** (`components/transaction-list.tsx`): selo "Estimado" no lugar de só "Previsto", com
  `title` mostrando `estimateNote`.
- **Efetivar uma ocorrência variável**: o botão "Paguei" **não** deve pagar o valor estimado em silêncio, que
  é o ponto de ter valor variável. Ele leva à página da ocorrência (`agenda/ocorrencia/[recurrenceId]/[date]`)
  com "Já paguei" marcado, valor pré-preenchido com a estimativa e foco no campo. Pular continua igual.
- **Página da recorrência** (`agenda/recorrencias/[id]`): mostrar a próxima estimativa com a explicação e uma
  tabela dos últimos 12 meses (realizado × estimado na época, se der, ou só realizado). Permitir editar os
  valores do `history_seed`.
- **Agenda**: lista mostra "≈ R$ 182,00" e selo "Variável".

## Critérios de aceite

- [ ] Criar recorrência variável com e sem histórico inicial; a ocorrência futura mostra o valor previsto.
- [ ] Efetivar com o valor real grava o lançamento com esse valor; a previsão do mês seguinte considera-o.
- [ ] Editar a regra "a partir de" preserva o histórico da série (nova regra herda `series_id`).
- [ ] A estimativa aparece na projeção do saldo (gráfico e saldo por dia).
- [ ] Explicação legível na linha e na página da recorrência.
- [ ] Recorrência fixa existente continua idêntica (nenhuma mudança de comportamento).
- [ ] Migração roda sobre banco com dados das fatias 1–4 sem perdê-los.

## Testes esperados

Unitários de `prediction.ts`; de repositório (histórico por série atravessando divisão de regra, seed,
ocorrência pulada fora do histórico, regra fixa inalterada); e2e `t05-previsao.spec.ts`: criar luz variável
com 3 meses de seed → conferir valor previsto na linha → efetivar com outro valor → conferir saldo atual e
nova previsão.

## Fora de escopo

IA (05b); campo de consumo (kWh/m³) e tarifa; detecção automática de contas variáveis; faixa mínimo–máximo.

## Perguntas em aberto (confirmar com o usuário usando dados reais)

- Os pesos e a mistura sazonal 50/50 servem para as contas dele? Se ele tiver 12+ meses de histórico real,
  vale um mini backtest (prever cada mês passado e medir o erro) antes de fechar os parâmetros.
