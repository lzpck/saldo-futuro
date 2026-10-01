# Saldo Futuro

App pessoal de finanças com lançamentos manuais e projeção de saldo. Veja `CONTEXT.md` para o vocabulário
do domínio e `docs/adr/` para as decisões de arquitetura.

## Rodando

```
npm install
npm run dev      # http://127.0.0.1:3000 (só escuta em localhost)
```

No primeiro acesso o app pede para criar a senha. Os dados ficam em `data/saldo.db`
(ou no caminho de `DATABASE_PATH`); para fazer backup, copie esse arquivo.

## Testes

```
npm test                 # unitários (Vitest): valores, datas, saldo, login, formulários
npx playwright test      # ponta a ponta (usa o Edge instalado e um banco temporário)
```
