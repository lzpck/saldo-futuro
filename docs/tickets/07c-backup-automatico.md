# 07c — Backup automático diário para uma pasta configurável

**Depende de:** 07a (tela e tabela `settings`). Idealmente depois de 07b.

## Contexto

Planejamento aceito: **cópia automática diária do arquivo do banco para uma pasta que o usuário escolhe** (por
exemplo, uma pasta sincronizada com OneDrive/Google Drive).

## Decisões já tomadas

- Diário, para pasta configurável, retendo um número limitado de cópias.
- A pasta pode ficar numa nuvem sincronizada: **a cópia sai da proteção de senha do app**. A tela deve dizer isso
  com clareza. Criptografar as cópias é opcional e fica como pergunta ao usuário (ver "Perguntas em aberto").

## Como copiar com segurança

Use a API de backup online do `better-sqlite3` (`db.backup(destino)`, assíncrona), que é consistente mesmo com
o banco em modo WAL e em uso. **Não** copie `saldo.db` com `fs.copyFile` (pode pegar o arquivo no meio de uma
escrita e ignora o `-wal`). Confirme a assinatura na documentação da versão instalada.

- Escreva em arquivo temporário na pasta de destino e **renomeie** ao terminar (nunca deixe um `.db` pela
  metade com nome final).
- Nome: `saldo-futuro-AAAA-MM-DD.db` (um por dia; rodar de novo no mesmo dia sobrescreve o do dia).
- **Retenção:** manter os últimos N (padrão 14). Ao podar, apague **somente** arquivos que casem com o padrão
  acima, nunca qualquer outro arquivo da pasta.
- Depois de copiar, abrir a cópia somente leitura e rodar `PRAGMA integrity_check` (falha = apagar a cópia e
  registrar erro).

## Agendamento

O app é um servidor local, não há cron. Usar `src/instrumentation.ts` (`register()` roda uma vez quando o
servidor sobe; ver `node_modules/next/dist/docs/01-app/02-guides/instrumentation.md`):

- Só no runtime Node (`process.env.NEXT_RUNTIME === "nodejs"`), importando o módulo de backup **dentro** de `register()`.
- Ao subir: se não houve backup hoje, rodar. Depois, `setInterval` de 1 h (com `unref()`) que repete a verificação.
- Proteger contra duplicidade (HMR do `next dev`, várias instâncias) com uma *flag* em `globalThis`.
- Se o app não estiver aberto na virada do dia, o backup acontece na próxima vez que subir. Documentar.

## Configurações e tela (`/configuracoes`, seção Backup)

- Campos: ativado (padrão: desligado até escolher pasta), pasta (caminho absoluto, com validação de
  existência/criação e teste de escrita ao salvar), quantidade a manter.
- Estado: data/hora e resultado do último backup (sucesso/erro com mensagem) em `settings`.
- Lista das cópias existentes (nome, tamanho, data) e botão "Fazer backup agora".
- **Falha visível:** se o último backup falhou, ou passou de 2 dias sem sucesso com a opção ligada, mostrar
  um aviso no Resumo. Falha nunca derruba o app nem a requisição.
- Windows: aceitar caminhos com barra invertida e espaços; recusar raiz de unidade e a pasta `data/` do próprio banco.

## Módulos puros (testes primeiro): `src/lib/backup-plan.ts`

`shouldRunBackup(lastSuccessAt, now, enabled)`, `backupFileName(date)`, `pickFilesToPrune(files, keep)`
(só nomes que casam com o padrão; ordena por data no nome, não por data de modificação).

## Critérios de aceite

- [ ] Com a pasta configurada, sobe-se o app e uma cópia do dia aparece; subir de novo no mesmo dia não duplica.
- [ ] A cópia abre e tem os mesmos dados (teste lê contagens de linhas das duas).
- [ ] Retenção apaga as mais antigas e **não toca** em arquivos de outros nomes na pasta.
- [ ] Pasta inválida/sem permissão: erro claro na tela, aviso no Resumo, app segue funcionando.
- [ ] "Fazer backup agora" funciona e atualiza o estado.
- [ ] Nada roda no Edge runtime nem duas vezes em desenvolvimento.

## Testes esperados

Unitários dos módulos puros; teste de repositório com diretório temporário real (cópia, integridade,
poda, falha de escrita); e2e `t07c-backup-automatico.spec.ts` configurando uma pasta temporária e clicando em
"Fazer backup agora" (o agendador em si é coberto por teste unitário com relógio injetado).

## Fora de escopo

Backup incremental, restauração automática (a restauração é manual: 07b ou trocar o arquivo `.db`),
envio para a nuvem por API.

## Perguntas em aberto

- Criptografar as cópias com uma senha de backup? (Hoje: não; só aviso na tela.) Se sim, vira ADR.
