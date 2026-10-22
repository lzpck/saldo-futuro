# Saldo Futuro · Guia de uso do logo

## A ideia

O saldo até hoje é sólido; o futuro é um ponto que ainda vai chegar. O símbolo é um S traçado como a linha do saldo, com a ponta final solta como um ponto. O ponto é a previsão que o app calcula dia a dia.

## Versões

| Versão | Quando usar | Arquivo |
| --- | --- | --- |
| Horizontal | Padrão: cabeçalhos, README, documentos | `svg/horizontal-*.svg` |
| Empilhada | Telas de login, capas, espaços mais altos que largos | `svg/empilhado-*.svg` |
| Símbolo | Avatares, ícone do app, espaços quadrados | `svg/simbolo-*.svg` |
| Símbolo pequeno | 32 px ou menos (favicon, listas): traço e ponto maiores, uma cor | `svg/simbolo-pequeno*.svg` |

Cada versão existe em quatro variações de cor: `cor` (sobre fundo claro), `cor-escuro` (sobre fundo escuro), `preto` e `branco`.

## Cores

| Nome | HEX | RGB | Uso |
| --- | --- | --- | --- |
| Esmeralda | `#059669` | 5 150 105 | S sobre fundo claro |
| Esmeralda viva | `#34D399` | 52 211 153 | S sobre fundo escuro |
| Turquesa | `#0D9488` | 13 148 136 | Ponto sobre fundo claro |
| Turquesa viva | `#2DD4BF` | 45 212 191 | Ponto sobre fundo escuro |
| Noite | `#0B0E13` | 11 14 19 | Fundo escuro e texto do logo no claro |
| Gelo | `#E8EDF3` | 232 237 243 | Texto do logo no escuro |
| Esmeralda do app | `#10B981` | 16 185 129 | Fundo do ícone do app |
| Esmeralda do favicon | `#0A9E70` | 10 158 112 | Favicon e símbolo pequeno (lê bem em aba clara e escura) |

CMYK aproximado (convertido da tela, confirme a prova de cor antes de imprimir): Esmeralda 97 0 30 41 · Esmeralda viva 75 0 27 17 · Turquesa 91 0 8 42 · Noite 42 26 0 93. Não defini cores Pantone.

Contrastes calculados: esmeralda sobre branco 3,8:1; esmeralda viva sobre noite 10,1:1; turquesa sobre branco 3,7:1; turquesa viva sobre noite 10,4:1.

## Tamanhos e espaço livre

- **Espaço livre:** duas vezes o diâmetro do ponto, em todos os lados do logo.
- **Símbolo:** mínimo de 16 px (tela) ou 6 mm (impresso). Até 32 px, use o símbolo pequeno.
- **Horizontal:** mínimo de 120 px de largura ou 30 mm. Abaixo disso, use só o símbolo.
- **Empilhado:** mínimo de 90 px de largura ou 24 mm.

## Fundos aprovados

Fundo claro ou branco: versão `cor`. Noite ou fundos escuros: `cor-escuro`. Sobre esmeralda ou fotos escuras: `branco`. Impressão em uma cor: `preto`.

## O que evitar

- Distorcer, girar ou inclinar o logo.
- Trocar as cores (o ponto sempre em turquesa na versão colorida, ou na mesma cor do S nas versões de uma cor).
- Aplicar sombra, brilho, contorno ou gradiente.
- Usar sobre fundo de baixo contraste ou carregado (listras, fotos cheias).
- Separar o símbolo do nome para formar outro arranjo que não esteja neste kit.
- Reescrever o nome com outra fonte: use os arquivos prontos.

## Ícones web

| Arquivo | Para quê |
| --- | --- |
| `icones/favicon.ico` (16, 32 e 48 px), `icones/favicon.svg` | Aba do navegador |
| `icones/apple-touch-icon.png` (180 px) | Tela inicial do iPhone e iPad |
| `icones/icon-192.png`, `icones/icon-512.png` | Ícones do app instalável |
| `icones/icon-maskable-512.png` | Ícone adaptável do Android (S dentro da área segura) |
| `icones/site.webmanifest` | Manifesto com nome, cores e ícones |
| `icones/icone-app-1024.png` e `icones/icone-app-escuro-1024.png` | Ícone mestre, em esmeralda e em noite |

### Para usar no projeto Next.js

O projeto usa a convenção de arquivos do App Router. Copie os três arquivos de `icones/next-app/` para `src/app/` (o `favicon.ico` atual será substituído):

- `favicon.ico`
- `icon.svg`
- `apple-icon.png`

Se for instalar o app como PWA, coloque `icon-192.png`, `icon-512.png` e `icon-maskable-512.png` em `public/` e `site.webmanifest` também em `public/`. Antes de mexer no código do framework, confira `node_modules/next/dist/docs/` (veja `AGENTS.md`), já que esta versão do Next.js tem mudanças.

O menu lateral (`src/components/nav.tsx`) hoje desenha um "S" provisório num quadrado com gradiente. Para trocá-lo, use `svg/horizontal-cor-escuro.svg` ou `svg/simbolo-cor-escuro.svg`.

## Notas técnicas e limites

- O nome está desenhado em **Plus Jakarta Sans** (a mesma fonte do app, licença OFL), peso 700 em "Saldo" e 300 em "Futuro", já convertido em curvas nos SVGs, sem texto editável.
- O símbolo está construído com um traço de 40 unidades e um círculo. Se for preciso o símbolo como contorno puro (por exemplo, para corte ou bordado), peça a conversão: em editores como Figma, Illustrator ou Inkscape, use "contornar traço".
- Não testei a marca no Illustrator nem em impressão; os testes de tamanho foram feitos em imagens geradas (16, 24, 32, 64 e 128 px, claro e escuro).
- Não é uma garantia de registro: antes de usar comercialmente fora do app pessoal, faça uma busca de anterioridade (INPI) e uma busca reversa de imagem.
