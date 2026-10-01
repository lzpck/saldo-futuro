# 06d — Exportar lançamentos para CSV

**Depende de:** 06c (usa os mesmos filtros). Pode ser feito antes, exportando "tudo" e acrescentando os
filtros depois.

## Contexto

"Exportar para CSV" está no escopo aceito da v1. Serve para abrir no Excel e como cópia legível dos dados
(o backup completo é o ticket 07b, em JSON).

## Decisões já tomadas

- Só exportação; **importação de extratos está fora do projeto** (tudo é manual).
- Uso pessoal e local, mas os dados financeiros exigem sessão válida até para baixar.

## Formato (pensado para Excel em pt-BR)

- UTF-8 **com BOM**, separador `;`, fim de linha CRLF, decimal com **vírgula** (`1234,56`), sem separador de
  milhar, datas `DD/MM/AAAA`.
- Colunas: `Data;Descrição;Tipo;Situação;Conta;Conta destino;Categoria;Subcategoria;Valor;Parcela;Recorrente`.
  `Valor` com sinal (receita +, despesa −; transferência sem sinal). `Parcela` como `2/6`. `Recorrente`
  Sim/Não. Categoria e subcategoria em colunas separadas.
- Nome do arquivo: `lancamentos-AAAA-MM.csv` (mês filtrado) ou `lancamentos-AAAA-MM-DD.csv` (período/tudo).
- Padrão: só lançamentos **gravados**; opção "incluir previstos calculados" (ocorrências e pagamentos de
  fatura virtuais) desligada.

## Segurança

- **Injeção de fórmula em planilha:** em colunas de texto (descrição, conta, categoria), se a célula começa
  com `=`, `+`, `-`, `@`, tabulação ou CR, prefixe com `'`. **Não** aplique à coluna Valor (precisa ficar
  numérica; ela é gerada pelo app, nunca texto livre).
- Escapar aspas (`""`), `;` e quebras de linha dentro de campos.
- **Route Handler** `GET /api/export/lancamentos` deve checar a sessão por conta própria (o `proxy.ts` só vê
  o cookie) e responder `401` sem redirecionar. Crie um `isAuthenticated()` não-redirecionador em
  `src/lib/auth/dal.ts` reaproveitando `validateSession`.
- Cabeçalhos: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment`, `Cache-Control: no-store`.

## Módulo puro: `src/lib/csv.ts` (testes primeiro)

`toCsv(rows: string[][]): string` e `csvCell(value)`; formatação de valor (`formatCsvAmount(cents)`) e data.
Casos: acentos, aspas, `;` e quebra de linha no campo, prefixos de fórmula, BOM presente uma única vez,
valores negativos e centavos (`5` → `0,05`), CRLF.

## UI

Botão "Exportar CSV" em `/lancamentos`, respeitando os filtros ativos (a URL do botão repassa os parâmetros
de 06c). Estado de carregamento não é necessário (download direto).

## Critérios de aceite

- [ ] Sem sessão, o endpoint responde 401 e não devolve dados.
- [ ] Arquivo abre no Excel pt-BR com acentos corretos e colunas separadas.
- [ ] Descrição `=HYPERLINK("http://x")` sai neutralizada.
- [ ] Soma da coluna Valor do arquivo bate com o líquido mostrado na tela para o mesmo filtro.
- [ ] Valores exatos em centavos (sem erro de ponto flutuante).

## Testes esperados

Unitários de `csv.ts`; teste do handler (com e sem sessão) chamando a função de rota diretamente; e2e
`t06d-csv.spec.ts` usando `page.waitForEvent("download")` e lendo o conteúdo.

## Fora de escopo

Importar CSV, exportar relatórios/orçamento, formato XLSX.
