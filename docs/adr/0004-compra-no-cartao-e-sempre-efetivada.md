# Compra no cartão é sempre Efetivada; só o pagamento da fatura é Previsto

Numa conta de cartão, toda compra, estorno e **parcela** é gravada como **efetivada**, qualquer que seja a data ou a
fatura em que caia. O que fica **previsto** é o pagamento da fatura (já calculado, ver ADR 0003), que a pessoa
confirma ao pagar. A única exceção são as ocorrências de uma recorrência no cartão (assinaturas): ainda não são
compra, ficam previstas e viram efetivadas sozinhas quando a data chega. Fora do cartão nada muda: o estado é
gravado, a data só sugere e a escolha da pessoa vale.

## Por que

"Previsto" significa "ainda não aconteceu". Uma compra já lançada na fatura aconteceu; o que falta é pagar a fatura.
Tratá-la como prevista fazia os relatórios com "Previstos" desligado ignorarem as compras parceladas do cartão
(todas as parcelas nasciam previstas) e misturava, na lista, dívida já assumida com dinheiro ainda por sair.
Também faz o saldo da conta de cartão ser a dívida real, coerente com o ADR 0003.

## Alternativas descartadas

- **Estado derivado só da data** (futuro é previsto, passado é efetivado) para todas as contas: eliminaria "Em
  atraso", "Conta em aberto" e a confirmação do valor real das recorrências variáveis, que dependem de a pessoa
  confirmar à mão que pagou.
- **Só a parcela da fatura corrente efetivada**, as seguintes previstas: a compra parcelada continuaria sumindo dos
  relatórios com "Previstos" desligado, e a dívida de parcelas futuras já assumida não apareceria.
- **Compra no cartão começa prevista até a escolha manual** (regra anterior): obrigava a pessoa a confirmar o que
  já tinha feito.

## Consequências

- "Em atraso" no cartão é só o pagamento da fatura vencida; compras nunca ficam em atraso.
- Os formulários não oferecem escolha de estado para conta de cartão.
- "Quitar o restante" foi substituído por **Antecipar parcelas** (últimas N parcelas, valor cobrado informado,
  desconto dividido entre elas, data de hoje); "Cancelar o restante" no cartão apaga as parcelas de faturas ainda
  não pagas.
- Uma migração única converteu compras e parcelas de cartão existentes para efetivadas.
