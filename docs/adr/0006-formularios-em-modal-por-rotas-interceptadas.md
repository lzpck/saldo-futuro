# Formulários abrem em modal por rotas interceptadas, com a página inteira como reserva

Os formulários de Conta, Categoria, Lançamento (novo e editar), Ocorrência de recorrência e Compra parcelada (editar) abrem num modal por cima da tela de onde a pessoa veio (Resumo, Contas,
Cartão, Lançamento), usando a slot paralela `@modal` do layout `(app)` e rotas interceptadas `(...)contas/…` e
`(...)categorias/…`. Cada formulário continua existindo como página (`/contas/nova`, `/contas/[id]`,
`/contas/[id]/ajustar`, `/categorias/nova`, `/categorias/[id]`): acesso direto à URL ou atualização da página mostra
a página inteira, sem modal. O conteúdo vive uma vez só, em `account-views.tsx` e `category-views.tsx`; a página e o
modal são só moldura.

Salvar dentro do modal não redireciona: a action recebe o campo oculto `modal` e responde `{ done: true }`, e o
modal fecha voltando no histórico, então a tela de origem é a que reaparece, atualizada. Fora do modal a action
redireciona para a lista, como antes. Fechar com X ou Esc é sempre permitido; o clique no fundo só fecha se nada foi
digitado.

## Por que

O app tinha formulários em página própria e, no resto, um único diálogo (a confirmação de exclusão). Abrir Contas
a partir do Resumo ou do formulário de Lançamento tirava a pessoa da tela e sempre a devolvia à lista de Contas.

## Alternativas descartadas

- **Modal por estado no cliente**, sem URL: mais simples, mas some a URL compartilhável, o botão voltar não fecha o
  modal e os "Criar conta" de outras telas precisariam de outra solução.
- **Remover as páginas e deixar só o modal**: a interceptação é um comportamento de navegação suave; sem a página,
  atualizar ou abrir o link direto não teria o que mostrar.

## Consequências

- A pasta `@modal` e o `default.tsx`/`[...fora]` são necessários: sem o catch-all o modal ficaria aberto ao navegar
  para outra tela.
- Novo formulário em modal = uma view compartilhada + página + rota interceptada em `@modal`.
- Seguem em página: as telas de detalhe da Agenda (Recorrência e Compra parcelada, com histórico, parcelas e ações) e o limite do Orçamento, que já é inline.
- Lançamento salvo no modal vai para `next` (a origem, com o aviso de orçamento) trocando a entrada do modal no histórico; o botão de salvar fica desabilitado até a navegação terminar.
- No modal, uma Ocorrência já gravada mostra o formulário do lançamento em vez de redirecionar: salvar re-renderiza a mesma rota antes de fechar, e um redirect a trocaria por outro modal.
- "Ajustar saldo" deixou de ser uma âncora dentro da edição da Conta e virou a rota `/contas/[id]/ajustar`.
- O diálogo de confirmação virou o componente `ConfirmDialog`, usado pela exclusão de Lançamento e pelo Arquivar conta.
