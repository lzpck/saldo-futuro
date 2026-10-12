# Cards de Lançamentos em regime de caixa, com o mesmo escopo do saldo

Os cards da tela de Lançamentos (Entradas, Saídas, Resultado do mês, saídas previstas, saldo previsto ao fim do mês)
e o subtotal semanal medem **o caixa das Contas que compõem o saldo**, no mesmo escopo da projeção. A Fatura é uma
Saída no vencimento; a compra no cartão não é Saída. Receita ou Despesa em Benefício e Caixinha só aparece quando a
lista é filtrada por essa Conta. Transferência que tira dinheiro do saldo (aplicar, resgatar) não é Entrada nem
Saída: aparece à parte, como Movimento fora do saldo. Assim, por construção, saldo de abertura + Resultado do mês +
Movimento fora do saldo = saldo ao fim do mês, e o subtotal da semana é a variação do "Saldo ao fim".

## Por que

Os cards misturavam duas réguas: o saldo seguia o caixa (ADR 0003), mas "Total Despesas" e o subtotal semanal
seguiam a competência, e os totais olhavam todas as Contas enquanto o saldo olhava só as de uso livre. Em novembro de
2026 isso mostrava "− R$ 194,70 previstos" ao lado de "Saídas previstas − R$ 1.905,11", entradas que incluíam o
Benefício e não fechavam com o saldo, e um "Déficit" em mês futuro causado por parcelas de cartão Efetivadas com
data futura. O usuário precisa olhar cards diferentes e ver os mesmos números.

## Alternativas descartadas

- **Competência nos totais, com um card "Fluxo de caixa" extra**: preserva "Total Despesas" como gasto do mês, mas
  deixa dois conjuntos de números na tela e o usuário continua tendo de reconciliá-los.
- **Contar Movimento fora do saldo como Saída/Entrada**: a identidade fecha sem linha extra, mas "Saídas" passaria a
  incluir dinheiro guardado e o Resultado do mês pareceria um déficit quando o usuário poupa.

## Consequências

- "Saídas" deixa de ser a soma das Despesas (inclui Faturas, exclui compras no cartão): o gasto por Categoria
  continua nos Relatórios e no Orçamento, que seguem a competência (data da compra).
- No mês corrente, as Saídas Efetivadas incluem as Faturas pagas no mês, que são de compras do mês anterior.
- O botão "Filtrar" dos cards usa os tipos `entrada` e `saida`, que listam exatamente o que compõe o total; o
  filtro "Despesa" continua listando todas as Despesas, inclusive as do cartão.
- Compras no cartão aparecem numa linha informativa no card de Saídas, fora do total.
