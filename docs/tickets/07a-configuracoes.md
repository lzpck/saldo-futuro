# 07a — Tela de Configurações (trocar senha, tempo de bloqueio)

**Depende de:** nada. **Libera:** 07b, 07c, 05b (todos pendurados nesta tela).

## Contexto

Não existe tela de configurações. Já existe a função `changePassword(db, password)` em
`src/lib/auth/sessions.ts` (troca a senha e **encerra todas as sessões**), mas **nenhuma UI a usa**: hoje o
usuário não consegue trocar a senha. O tempo de bloqueio por inatividade é a constante `IDLE_TIMEOUT_MS`
(15 min) no mesmo arquivo.

## Decisões já tomadas

- Proteção do app: senha única, sessão por cookie, servidor só em `localhost`, bloqueio por inatividade
  (escolha "a" com bloqueio automático do planejamento). Um usuário só.
- Sem criptografia do arquivo do banco (o usuário aceitou o risco: quem acessa o Windows dele chega ao arquivo).

## Escopo

1. **Tabela de configurações** (migração nova, aditiva): `settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)`
   e repositório tipado `src/lib/repos/settings.ts` (`getSetting`, `setSetting`, com chaves conhecidas e
   valores validados por Zod). Será usado por 07c (pasta de backup) e 05b (IA).
2. **Página `/configuracoes`** com ligação no rodapé do menu lateral (ao lado de "Sair") e no menu inferior do
   celular **sem** estourar o espaço (talvez dentro de "Contas" ou como ícone de engrenagem no cabeçalho).
3. **Trocar senha:** formulário com senha atual, nova e confirmação. Exige a atual correta (use
   `checkPassword`), mínimo `MIN_PASSWORD_LENGTH`, nova diferente da atual. Respeitar o *throttle* de login
   também aqui (`loginThrottle()`), para a tela não virar via de força bruta. Ao concluir, `changePassword`
   derruba as sessões: redirecionar para `/login` com mensagem "Senha alterada. Entre de novo."
4. **Tempo de bloqueio por inatividade:** opções 5 / 15 / 30 / 60 min (padrão 15), guardado em `settings`.
   Refatorar `validateSession`/`createSession` para receber o valor em vez de ler a constante (mantendo os
   testes existentes em `auth.test.ts` verdes). Leia a configuração uma vez por requisição, não por consulta.
   A duração máxima absoluta (12 h) continua fixa.

## Critérios de aceite

- [ ] Trocar senha com a atual errada falha com mensagem clara e conta para o *throttle*.
- [ ] Depois de trocar, a sessão antiga não vale mais e a senha nova entra.
- [ ] Mudar o tempo de bloqueio vale para as próximas sessões/validações (testar com relógio injetado).
- [ ] A página exige sessão (Server Actions com `verifySession`).
- [ ] Migração roda sobre banco existente sem perder dados.

## Testes esperados

Unitários do repositório de configurações (valor inválido rejeitado, padrão quando ausente) e de
`sessions.ts` com timeout configurável; e2e `t07a-configuracoes.spec.ts`: trocar senha, ser deslogado, entrar
com a nova (**no fim do spec, volte à senha usada pelos outros specs** ou faça este spec rodar por último
dentro do seu arquivo, para não quebrar o encadeamento).

## Fora de escopo

Backup (07b/07c), tema claro, múltiplos usuários, recuperação de senha esquecida (é app local: o caminho é
apagar a linha de `auth_settings` com acesso ao arquivo, e vale uma nota no README).
