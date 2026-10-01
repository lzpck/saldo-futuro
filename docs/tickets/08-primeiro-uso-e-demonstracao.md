# 08 — Primeiro uso guiado e dados de demonstração

**Depende de:** nada. Independente dos demais; é um bom primeiro ticket porque facilita testar e fotografar o resto.

## Contexto

No planejamento (rodada 4, Q6) ficou combinado **os dois**: (a) um *seed* de demonstração só para
desenvolvimento e (b) um assistente de primeiro uso. Nenhum dos dois foi feito: o primeiro acesso hoje mostra
só um cartão "Bem-vindo" com o botão "Criar primeira conta" (`src/app/(app)/page.tsx`).

## Decisões já tomadas

- O *seed* fica **em banco separado**, nunca no banco real do usuário.
- Quanto ao histórico antigo (planilha/app anterior): se for pouco, digitar vale mais do que construir
  importação; se for muito, um **script de uso único a partir de CSV, fora do app**.

## (a) Seed de demonstração

- Comando `npm run seed:demo` (script em `scripts/seed-demo.ts`). Os módulos de `src/lib` usam imports sem
  extensão e o alias `@/`, que o Node puro **não** resolve (nem com *type stripping*). Rode com `tsx`
  (devDependency pequena) ou como entrada do Vitest. Verifique que o alias `@/` funciona no caminho escolhido.
- Escreve em `data/demo.db` (ou `DATABASE_PATH`). **Recusa** rodar se o destino for `data/saldo.db`/o banco
  padrão, a menos que a variável `ALLOW_SEED_ON_REAL_DB=1` esteja definida de propósito; mensagem explícita.
- Idempotente: apaga e recria o arquivo de demonstração.
- Conteúdo realista e **relativo à data de hoje**: 2 contas, 1 cartão com compras nos dois últimos ciclos,
  salário recorrente, aluguel e assinaturas recorrentes, uma compra parcelada, algumas contas em atraso e a
  vencer, categorias usadas, alguns meses de histórico. Senha de demonstração conhecida (documentada).
- Documentar no `README.md` do projeto: `DATABASE_PATH=data/demo.db npm run dev` para usar.
- Reutilizar as funções dos repositórios (`createAccount`, `createRecurrence`, `createInstallmentPurchase`…),
  não SQL cru, para o seed quebrar se o domínio mudar.

## (b) Assistente de primeiro uso

Substitui o cartão "Bem-vindo". Aparece enquanto o app estiver "vazio" (sem contas); o estado é **derivado dos
dados** (nenhuma tabela de wizard), então dá para sair e voltar.

1. **Contas e saldos iniciais:** adicionar várias contas rapidamente (nome, tipo, saldo de hoje).
2. **Cartões (opcional):** nome, fecha dia, vence dia, conta que paga.
3. **Contas fixas e renda (opcional):** atalhos para criar recorrências comuns (salário, aluguel/condomínio,
   luz, internet, assinaturas) usando o formulário/ação existentes de `saveTransaction` com repetição.
4. **Pronto:** resumo do que foi criado e botão para o Resumo.

Cada passo pode ser pulado. Linguagem curta, em pt-BR; reaproveitar os componentes e ações existentes.

## (c) Opcional: importador único de CSV (só se o usuário tiver muito histórico)

`scripts/import-csv.ts`: lê CSV com colunas `data;descricao;valor;conta;categoria`, valida e cria lançamentos
**efetivados** (nunca previstos) via repositório, em transação, com `--dry-run` obrigatório na primeira
execução. Fora do app, sem tela. Só fazer se o usuário pedir.

## Critérios de aceite

- [ ] `npm run seed:demo` cria o banco de demonstração e **não** toca em `data/saldo.db`.
- [ ] Com o banco de demonstração, todas as telas têm dados para conferir (gráfico, painel, fatura, agenda).
- [ ] Usuário novo é conduzido do cadastro da senha até um Resumo com contas e saldo, sem becos sem saída.
- [ ] Pular tudo leva ao estado atual (Resumo vazio com convite para criar conta).
- [ ] Reabrir o app no meio do assistente retoma de onde parou (derivado dos dados).

## Testes esperados

Teste de que o seed recusa o banco real; teste que roda o seed em `:memory:`/arquivo temporário e verifica
contagens e que `listSchedule` não lança erro; e2e `t08-primeiro-uso.spec.ts` **num banco novo** (atenção ao
encadeamento: este spec precisa rodar com o banco ainda vazio, então nomeie-o para ordenar **antes** de
`fatia1` (ex.: `a08-primeiro-uso.spec.ts`) e deixe o banco no estado esperado por `fatia1`, ou configure
um projeto/arquivo de configuração separado do Playwright com banco próprio).

## Fora de escopo

Importação de extratos bancários (descartada no projeto), vídeo/tutorial, múltiplos perfis.
