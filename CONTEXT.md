# Saldo Futuro

App pessoal de finanças, de um único usuário, com lançamentos totalmente manuais. O foco é entender para onde o dinheiro vai e projetar o saldo ao longo dos dias.

## Linguagem

**Conta**:
Local onde o dinheiro está, com um saldo inicial informado pelo usuário. Pode ser corrente, carteira, benefício ou cartão.
_Evitar_: carteira, banco

**Conta de cartão**:
Tipo de Conta que representa um cartão de crédito, com dia de fechamento, dia de vencimento e a Conta que paga a fatura. Seus gastos se acumulam em Faturas. Fica fora do Saldo total: o saldo dela é a dívida (negativo) e o dinheiro só sai da Conta de pagamento quando a Fatura é paga. Não tem saldo inicial.

**Fatura**:
Conjunto de compras e estornos de uma Conta de cartão num ciclo de fechamento. É calculada a partir dos Lançamentos (não é gravada) e gera um Lançamento previsto de pagamento no vencimento, debitado da Conta de pagamento, cujo valor se ajusta a novas compras. A compra entra na Fatura que fecha no dia dela ou depois (no dia do fechamento ainda entra). Parcelas e Ocorrências previstas no cartão entram nas Faturas futuras.

**Pagamento de fatura**:
Transferência efetivada da Conta de pagamento para o cartão. Os pagamentos abatem as Faturas da mais antiga para a mais nova, então uma transferência manual para o cartão também conta. Pagamento parcial deixa o restante previsto no mesmo vencimento; compra tardia num ciclo já pago gera um novo pagamento só da diferença.

**Lançamento**:
Registro de dinheiro entrando, saindo ou se movendo entre Contas, numa data. Tem um tipo (Receita, Despesa ou Transferência) e um estado (Previsto ou Efetivado).
_Evitar_: transação, movimentação

**Receita**:
Lançamento de entrada de dinheiro (salário, rendimento).
_Evitar_: ganho

**Despesa**:
Lançamento de saída de dinheiro, classificado em uma Categoria.
_Evitar_: gasto, conta (no sentido de boleto)

**Transferência**:
Lançamento que move dinheiro entre duas Contas (inclui pagamento de Fatura). Não é gasto nem ganho e não entra nos relatórios por Categoria.

**Previsto**:
Estado de um Lançamento que ainda não aconteceu de fato. Entra na Projeção de saldo.

**Efetivado**:
Estado de um Lançamento que aconteceu, com o valor real. Só os Efetivados compõem o Saldo atual.
_Evitar_: pago, confirmado

**Em atraso**:
Lançamento Previsto cuja data já passou sem ter sido Efetivado. Na Projeção de saldo conta como se fosse hoje, até o usuário Efetivar, reagendar ou descartar.
Numa Conta de cartão a data da compra não conta: o Lançamento só está Em atraso quando a Fatura dele já venceu e ainda tem saldo a pagar (todas as compras da Fatura, mesmo com pagamento parcial). Os dias de atraso contam do vencimento da Fatura. Esse atraso aparece na lista de Lançamentos e no filtro, mas não no painel de Contas em aberto, onde fica só o pagamento da Fatura.

**Saldo atual**:
Saldo inicial da Conta mais todos os Lançamentos Efetivados dela.

**Projeção de saldo**:
Saldo esperado em um dia futuro: o Saldo atual somado aos Lançamentos Previstos até aquele dia.
_Evitar_: previsão (reservar para "Previsão de valor")

**Recorrência**:
Regra que gera Lançamentos Previstos periodicamente (mensal, semanal, quinzenal, anual), com término opcional. Editar vale "a partir de uma data"; uma única ocorrência também pode ser editada.

**Ocorrência**:
Cada data em que uma Recorrência se aplica. É virtual (calculada) até ser Efetivada ou editada, quando passa a ser um Lançamento gravado que sobrepõe a virtual. Em regras mensais, o dia original é preservado e meses curtos usam o último dia do mês.

**Frequência**:
Periodicidade de uma Recorrência: semanal (7 dias), quinzenal (a cada 14 dias, não "duas vezes por mês"), mensal ou anual.

**Pular ocorrência**:
Descartar uma única Ocorrência sem afetar as demais. Excluir um Lançamento que veio de uma Recorrência também a pula, para a versão virtual não reaparecer.

**Conta em aberto**:
Lançamento Previsto que ainda precisa de ação do usuário: Em atraso ou vencendo nos próximos dias. Aparece no painel do Resumo.
_Evitar_: pendência

**Quitar o restante**:
Efetivar de uma vez, hoje, todas as Parcelas ainda previstas de uma Compra parcelada. **Cancelar o restante** apaga essas Parcelas; as já efetivadas ficam.

**Recorrência variável**:
Recorrência cujo valor muda a cada ciclo (luz, gás). O valor real é informado ao Efetivar e o valor Previsto vem da Previsão de valor.

**Previsão de valor**:
Estimativa do valor de uma Recorrência variável, calculada por média ponderada dos últimos meses ajustada por sazonalidade. Explicável ao usuário.

**Compra parcelada**:
Compra dividida em N parcelas, cada uma sendo um Lançamento Previsto no seu mês (ou na Fatura do seu mês, se for no cartão).

**Parcela**:
Cada Lançamento Previsto de uma Compra parcelada. Pode ser editada individualmente (valor, data). As futuras podem ser canceladas em bloco ("cancelar restante") ou antecipadas.

**Saldo de fim de dia**:
Saldo total depois de todos os Lançamentos do dia; é o valor mostrado em cada dia da lista. Hoje divide a lista entre Efetivado (acima) e projetado (abaixo).

**Categoria**:
Classificação de uma Despesa ou Receita, com cor e ícone. Pode ter um nível de Subcategoria.

**Orçamento**:
Limite mensal de gasto por Categoria de despesa. O limite definido num mês vale nos seguintes até ser alterado. Quando o gasto o alcança, a Categoria está em Atenção ou Estourou.

## Relações

- Toda Conta tem muitos Lançamentos; uma Transferência envolve duas Contas.
- Uma Fatura pertence a uma Conta de cartão e produz um Lançamento (Transferência) de pagamento no vencimento.
- Uma Recorrência ou Compra parcelada gera vários Lançamentos Previstos.
- Despesas e Receitas têm uma Categoria; Transferências não.

## Ambiguidades resolvidas

- "Gasto" e "ganho" do usuário viram **Despesa** e **Receita**; o dinheiro mover entre Contas é **Transferência**.
- No cartão, a data da compra define a Categoria nos relatórios, e o vencimento da Fatura define o impacto no saldo.
