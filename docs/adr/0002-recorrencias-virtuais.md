# Recorrências são virtuais; só exceções viram registros

Uma Recorrência guarda apenas a regra (frequência, dia, valor, término). As ocorrências futuras são calculadas sob demanda ao listar ou projetar. Uma ocorrência só vira Lançamento gravado quando é Efetivada ou editada individualmente, e esse registro sobrepõe a ocorrência virtual da mesma data.

A alternativa era materializar ocorrências futuras para um horizonte fixo (ex.: 12 meses) e renová-las. Isso deixaria uma pilha de Lançamentos Previstos para reconciliar a cada edição da regra ("a partir de uma data") e exigiria um job de renovação. Já as Compras parceladas são finitas e conhecidas, então suas Parcelas são materializadas.

Consequência: o módulo de projeção precisa mesclar ocorrências virtuais com registros que as sobrepõem, e isso deve ser coberto por testes (dia 31 em meses curtos, edição "a partir de", ocorrência efetivada com valor diferente).
