# Cartão fora do saldo total; faturas calculadas e pagamentos abatidos do mais antigo para o mais novo

Uma conta de cartão de crédito **não entra no saldo total nem na projeção**: ela guarda a dívida (saldo negativo) e
o dinheiro só sai da conta que paga a fatura no **vencimento**, por um pagamento previsto. A fatura não é gravada:
é **calculada** a partir das compras do cartão (inclusive parcelas e ocorrências de recorrência previstas) e o
pagamento previsto se ajusta a novas compras. Os pagamentos efetivados para o cartão **abatem as faturas da mais
antiga para a mais nova**, sem vínculo entre um pagamento e uma fatura específica.

## Por que

O usuário quer ver o saldo que terá em cada dia. Se a compra no cartão reduzisse o saldo na data da compra, a
projeção mostraria uma queda que só acontece semanas depois, no vencimento. A categoria, porém, deve valer na
data da compra. Por isso a compra é um lançamento comum na conta do cartão (categoria e relatórios por data da
compra) e o impacto no saldo é o pagamento da fatura.

## Alternativas descartadas

- **Cartão dentro do saldo total** (compra reduz o saldo na hora): mais simples, mas mente sobre o saldo de cada
  dia até o vencimento, que é a funcionalidade central do app.
- **Fatura gravada como registro** (com itens vinculados): exigiria manter o total sincronizado a cada compra
  editada, movida, parcelada ou estornada, e tratar mudança do dia de fechamento. Calculada, ela fica sempre
  coerente; é o mesmo raciocínio do ADR 0002 para recorrências.
- **Pagamento vinculado a uma fatura** (chave estrangeira): um Pix manual para o cartão, ou um pagamento feito
  em outra ordem, não teria a que se ligar e a projeção cobraria duas vezes. O abatimento por ordem de
  antiguidade trata qualquer transferência para o cartão, ligada ou não, e deixa o pagamento parcial e a compra
  tardia em ciclo já pago saírem naturalmente (sobra o restante, ou uma nova diferença no mesmo vencimento).

## Consequências

- `totalBalanceCents` e o escopo padrão da projeção excluem cartões. Filtrar a lista pelo próprio cartão mostra a
  dívida ao longo do tempo (compras descem, pagamentos sobem).
- Como não há vínculo, **pagar uma fatura futura antes da mais antiga abate primeiro a mais antiga**. É o
  comportamento esperado de uma dívida, mas pode surpreender quem pensa "paguei a fatura de novembro".
- O saldo de um cartão não tem valor inicial: a dívida nasce dos lançamentos.
- Mudar o dia de fechamento reorganiza as compras entre as faturas (elas são derivadas); a tela de edição avisa.
- Quem lê a listagem (`listSchedule`) deve tratar `invoiceCardId` como pagamento previsto calculado, com id
  negativo, que não existe no banco e não pode ser pulado.
- Não há limite de crédito nem ajuste de vencimento para dia útil.
