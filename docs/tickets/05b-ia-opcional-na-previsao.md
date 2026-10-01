# 05b — IA opcional para refinar a previsão de valor

**Depende de:** 05 (previsão local) e 07a (tela de Configurações). **Status:** *condicional*. Não implemente
antes do passo 1 mostrar que vale a pena.

## Contexto

O usuário disse que "se necessário podemos usar IA para melhorar a previsão". A decisão do planejamento foi
**estatística local primeiro, IA só depois, como opção**, porque com poucos meses de histórico uma LLM raramente
supera uma média sazonal bem feita, e a estatística é determinística e explicável.

## Decisões já tomadas

- Privacidade: se a IA entrar, enviar **somente meses e valores** (nada de descrição, nome de conta, categoria
  ou qualquer texto livre).
- Desligada por padrão; ligar é uma escolha explícita nas Configurações.
- A previsão local continua sendo a base e o *fallback*.

## Passo 1 (obrigatório): avaliar antes de construir

1. Escrever `scripts/backtest-previsao.ts` (somente leitura, sobre **uma cópia** do banco real): para cada
   série variável com histórico, prever cada mês passado usando só os meses anteriores e medir o erro
   percentual absoluto médio (MAPE) da previsão local.
2. Mostrar o resultado ao usuário. Só seguir para o passo 2 se o erro local for alto para contas que ele
   considera importantes (ponto de partida: MAPE > 15%) **e ele quiser**. Se não, fechar este ticket como
   "não necessário" e registrar o número.

## Passo 2: implementação (se aprovado)

- Chamada **no servidor** à API da Anthropic. Use a skill `claude-api` (se disponível na sessão) e o ID de
  modelo vigente na hora da implementação; não copie IDs de modelo de exemplos antigos.
- Chave em `ANTHROPIC_API_KEY` no `.env.local` (já ignorado pelo git via `.env*`). Sem a chave, a opção some
  da interface com uma explicação.
- Nunca no caminho de renderização: botão "Refinar com IA" na página da recorrência, que chama uma Server
  Action (com `verifySession`). Resultado **em cache** (tabela nova, chave = série + mês-alvo + hash do
  histórico enviado); o histórico mudou, o cache invalida.
- Saída estruturada (JSON com `amountCents` e `rationale` curto). Validar com Zod e **limitar** o resultado a
  uma faixa em torno da previsão local (ex.: 0,5×–2×) para impedir valor absurdo.
- Timeout e erro caem silenciosamente na previsão local, com aviso discreto.
- Na linha e na página: selo "Estimado por IA" e a justificativa; sempre mostrar também o valor local.
- Opcional, só se o usuário pedir: campo de consumo (kWh/m³) e tarifa como entrada extra.

## Critérios de aceite

- [ ] Backtest executado e resultado registrado no ticket (e decisão do usuário anotada).
- [ ] (Se aprovado) Opção desligada por padrão, com texto claro sobre o que é enviado.
- [ ] Payload enviado contém apenas pares mês/valor (teste automatizado inspecionando o corpo da requisição).
- [ ] Falha de rede ou chave ausente nunca quebra a tela nem a projeção.
- [ ] Resultado limitado à faixa configurada e cacheado.

## Testes esperados

Unitários com cliente falso: construção do payload (sem texto livre), validação/clamp da resposta, cache e
invalidação, fallback em erro/timeout. Sem chamadas reais à API nos testes automatizados.

## Fora de escopo

Chat, categorização automática por IA, qualquer outro uso de IA.

## Andamento

- **Passo 1 implementado:** `npm run backtest -- [caminho do banco]` (`scripts/backtest-previsao.ts`, lógica em
  `src/lib/backtest.ts`). Trabalha numa cópia temporária do banco e imprime o MAPE por série e geral.
- **Resultado:** o banco atual (`data/saldo.db`) ainda não tem nenhuma recorrência variável, então não há número
  para registrar. Rodar de novo quando houver histórico real (≥ 2 meses) e decidir com o usuário.
- **Passo 2:** não iniciado (aguardando o resultado do backtest e a decisão do usuário).
