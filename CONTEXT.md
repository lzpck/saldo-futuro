# Saldo Futuro

App pessoal de finanças, de um único usuário, com lançamentos totalmente manuais. O foco é entender para onde o dinheiro vai e projetar o saldo ao longo dos dias.

## Linguagem

**Conta**:
Local onde o dinheiro está, com um saldo inicial informado pelo usuário. Pode ser corrente, carteira, benefício, caixinha ou cartão.
_Evitar_: carteira, banco

**Conta de cartão**:
Tipo de Conta que representa um cartão de crédito, com dia de fechamento, dia de vencimento e a Conta que paga a fatura. Seus gastos se acumulam em Faturas. Fica fora do Saldo total: o saldo dela é a dívida (negativo) e o dinheiro só sai da Conta de pagamento quando a Fatura é paga. Não tem saldo inicial. Pode ter um limite de crédito (opcional), usado para mostrar quanto do limite está comprometido.

**Caixinha**:
Tipo de Conta que representa dinheiro guardado e separado do dia a dia (como as caixinhas dos bancos). O dinheiro continua sendo do usuário, mas a Caixinha fica fora do Saldo total e da Projeção de saldo; seu saldo aparece à parte, no total Guardado. Tem saldo inicial. Entrar e sair dinheiro dela é Transferência (aplicar e resgatar); o Resgate nunca é automático, é uma Transferência que o usuário lança, Prevista ou Efetivada. O rendimento é uma Receita lançada na própria Caixinha, e ela aceita Despesa (tarifas). Aplicar numa Caixinha reduz o Saldo total e a Projeção no dia da Transferência, pois o dinheiro deixa de estar disponível. Filtrar a lista pela Caixinha mostra o saldo dela dia a dia, incluindo Resgates Previstos. Uma Conta pode virar Caixinha, e vice-versa, entre corrente, carteira, benefício e caixinha (o cartão continua travado). Uma Caixinha não paga Fatura, e a Conta que paga a Fatura de algum cartão não pode virar Caixinha: para pagar com o dinheiro guardado, o usuário primeiro faz o Resgate.
_Evitar_: cofrinho, reserva

**Benefício**:
Tipo de Conta que representa dinheiro recebido da empresa com uso restrito a certas Categorias (por exemplo, vale-alimentação). Fica fora do Saldo total e da Projeção de saldo, porque esse dinheiro não paga qualquer coisa; seu saldo aparece à parte, no total Benefício. A parte livre do que a empresa deposita fica numa Conta corrente comum, então o depósito vira duas Receitas. Cada Conta Benefício lista as Categorias aceitas (pode não ter nenhuma, e então se comporta sem restrição). Despesa de outra Categoria nela, ou que passe do saldo, e Transferência de saída dela geram aviso, mas são permitidas. O saldo acumula, sem expiração. Despesa paga com o Benefício abate só o saldo dele, não o Saldo total, mas conta normalmente nas Categorias e no Orçamento. Filtrar a lista pela Conta mostra o saldo dela dia a dia. A Conta que paga Fatura de algum cartão não pode ser Benefício: para pagar com ele, o usuário faz uma Transferência de saída.
_Evitar_: vale, saldo restrito

**Guardado**:
Soma dos saldos atuais das Caixinhas. É mostrado separado do Saldo total e nunca entra nele, no Resumo e na tela de Contas. Só o Patrimônio líquido, na tela de Contas, os soma.

**Patrimônio líquido**:
Visto na tela de Contas: Saldo total (disponível) + Benefício + Guardado − Faturas a pagar. As Faturas somadas são as já iniciadas (aberta, fechada ou vencida) com saldo a pagar; as de ciclos futuros ainda não contam.

**Saldo projetado (da conta)**:
Saldo atual de uma Conta menos as Faturas em aberto que ela paga e que vencem nos próximos 30 dias (inclui as vencidas). Quando fica negativo, a tela de Contas avisa quanto falta para cobrir as Faturas e até que vencimento. Não considera outros Lançamentos Previstos: para isso há a Projeção de saldo.

**Ajuste de saldo**:
Conferência do Saldo atual de uma Conta com o do banco. Se divergir, cria uma Receita ou Despesa Efetivada de hoje, sem Categoria, chamada "Ajuste de saldo", e a Conta guarda a data da última conferência. Não vale para cartão.

**Conta favorita**:
Conta (ou Conta de cartão) que o usuário marcou como de uso frequente. Pode haver várias, sem limite. Nos seletores de Conta aparece antes das demais do seu grupo (Contas, Caixinhas ou Cartões), em ordem alfabética, e a primeira favorita é a pré-selecionada num novo Lançamento. Uma Conta arquivada deixa de ser favorita.

**Conta arquivada**:
Conta que o usuário tirou de uso sem apagar: deixa de ser oferecida para novos Lançamentos, mas mantém o histórico e continua aparecendo onde um Lançamento antigo precisa dela.

**Fatura**:
Conjunto de compras e estornos de uma Conta de cartão num ciclo de fechamento. É calculada a partir dos Lançamentos (não é gravada) e gera um Lançamento previsto de pagamento no vencimento, debitado da Conta de pagamento, cujo valor se ajusta a novas compras. A compra entra na Fatura que fecha no dia dela ou depois (no dia do fechamento ainda entra). Parcelas (Efetivadas) e Ocorrências previstas no cartão entram nas Faturas futuras.

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

Numa Conta de cartão, uma compra ou estorno lançado é sempre Efetivado, qualquer que seja a data ou a Fatura em que caia: a compra já aconteceu, e todas as Parcelas de uma Compra parcelada no cartão nascem Efetivadas. O que fica Previsto é o pagamento da Fatura, que o usuário confirma ao pagar. A exceção são as Ocorrências de uma Recorrência no cartão: ainda não são compra, ficam Previstas e viram Efetivadas sozinhas quando a data chega, sem confirmação. Fora do cartão, a data só sugere o estado e a escolha do usuário vale.

**Efetivado**:
Estado de um Lançamento que aconteceu, com o valor real. Só os Efetivados compõem o Saldo atual.
_Evitar_: pago, confirmado

**Em atraso**:
Lançamento Previsto cuja data já passou sem ter sido Efetivado. Na Projeção de saldo conta como se fosse hoje, até o usuário Efetivar, reagendar ou descartar.
Numa Conta de cartão as compras são Efetivadas e nunca ficam Em atraso: o que fica Em atraso é o pagamento da Fatura vencida e ainda com saldo a pagar (mesmo com pagamento parcial), contando os dias do vencimento. Esse atraso aparece também no painel de Contas em aberto.

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
Numa Conta de cartão, a Conta em aberto é a Fatura (o que falta pagar dela), nunca as compras avulsas. A próxima Fatura em aberto de cada cartão conta mesmo vencendo depois do horizonte.
_Evitar_: pendência

**Antecipar parcelas**:
Pagar hoje as últimas N Parcelas restantes de uma Compra parcelada (N de 1 até o total restante; todas é o caso "quitar"). O usuário informa o valor cobrado, que vem preenchido com a soma original; o desconto é a diferença, dividido em partes iguais entre as Parcelas antecipadas. Cada Parcela mantém seu número, mas passa a ter a data de hoje e o valor ajustado: no cartão cai na Fatura aberta, fora dele fica Efetivada. Substitui o antigo "Quitar o restante".

**Cancelar o restante**:
Apagar as Parcelas restantes de uma Compra parcelada. Fora do cartão, são as ainda Previstas; no cartão, as de Faturas ainda não pagas. As demais ficam.

**Recorrência variável**:
Recorrência cujo valor muda a cada ciclo (luz, gás). O valor real é informado ao Efetivar e o valor Previsto vem da Previsão de valor.

**Previsão de valor**:
Estimativa do valor de uma Recorrência variável, calculada por média ponderada dos últimos meses ajustada por sazonalidade. Explicável ao usuário.

**Compra parcelada**:
Compra dividida em N parcelas, cada uma sendo um Lançamento no seu mês: Previsto, fora do cartão. No cartão, todas as Parcelas são Efetivadas e cada uma cai na Fatura do seu mês.
Pode ser registrada já em andamento, informando a **Parcela inicial**: o número da primeira Parcela que o usuário lança. As anteriores (pagas antes de usar o app) não existem como Lançamentos, e a numeração segue o total original (ex.: 8/10, 9/10, 10/10).

**Parcela inicial**:
Número da primeira Parcela lançada de uma Compra parcelada (1 quando a compra é registrada desde o começo).

**Parcela**:
Cada Lançamento de uma Compra parcelada (Previsto fora do cartão, Efetivado no cartão). Pode ser editada individualmente (valor, data). As futuras podem ser canceladas em bloco ("cancelar restante") ou antecipadas.

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
