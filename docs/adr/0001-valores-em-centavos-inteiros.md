# Valores monetários em centavos inteiros

Todo valor monetário é armazenado e calculado como inteiro em centavos, no banco e no módulo de projeção. A formatação em R$ acontece só na camada de exibição.

A alternativa era `Float` (usado no projeto anterior `financas`) ou `Decimal`. Ponto flutuante acumula erro de centavos ao somar centenas de Lançamentos, o que corromperia silenciosamente a Projeção de saldo. Inteiros também tornam exata a divisão de Compras parceladas (o resto de centavos é distribuído, 1 centavo por vez, pelas primeiras Parcelas).
