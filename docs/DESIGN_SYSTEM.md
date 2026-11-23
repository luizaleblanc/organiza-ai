# Design System do Organiza AI (MVP 1)

Este documento descreve o design system do app. Ele reproduz os três artefatos e diz qual valor o app usa quando eles discordam. O MVP 1 tem só o tema escuro.

| Artefato | Link |
|---|---|
| Design system | https://claude.ai/artifact/JVjueTmHeJsnHLsow3LDVb |
| Desktop | https://claude.ai/artifact/64FYjX5UiveVxTtRGYurQP |
| Mobile | https://claude.ai/artifact/8b3jFV4BrGj4YkDQAwDvDF |

No código, os tokens ficam em `frontend/core/theme.kf`. O documento antigo, [`DESIGN_SYSTEM_LEGACY.md`](DESIGN_SYSTEM_LEGACY.md) em `docs/`, vale só como histórico. Quando os dois discordarem, este aqui prevalece.

## 1. Fonte oficial da marca e do fundo

A usuária entregou dois SVGs oficiais. Eles são servidos como assets estáticos e o app os carrega com `Image(...)`, como faz com os ícones. Por serem vetoriais, ficam nítidos em qualquer dpr. O Canvas não desenha mais a logo nem as ondas.

| Arquivo | Uso | Conteúdo |
|---|---|---|
| `frontend/assets/brand/organiza-simbolo.svg` | Logo (`components/brand_mark.kf`) | 3 curvas quadráticas (`M8 y Q60 y-22 120 y T232 y`, y = 24/58/92), gradiente #00D4FF → #0066FF, traço 3.5, opacidades 1/.78/.58, `stroke-linecap: round`, viewBox `4.25 9.25 231.5 97.5` |
| `frontend/assets/brand/organiza-fundo-ondas.svg` | Fundo das telas de entrada (`components/background_waves.kf`) | 1200×630, gradiente #0A0D18 → #0B1430, brilho radial #0066FF a .18, 6 ondas #0066FF com opacidades de .2 a .3 |

Não edite os dois arquivos à mão. Se precisar de uma versão nova, ela vem da usuária.

## 2. Paleta (tema escuro)

| Token | Valor | Função em `theme.kf` | Uso |
|---|---|---|---|
| bg | `#0A0D18` | `colorBgPrimary()` | Fundo das telas |
| canvas | `#05060B` | `colorCanvas()` | Fundo atrás das janelas e da sidebar |
| card | `#12162A` | `colorCard()` | Cards, inputs, barra inferior |
| card-2 | `#1A1F3A` | `colorCardSecondary()` | Segunda cor do gradiente do card de pulso, bolha da IA |
| accent | `#00D4FF` | `colorAccent()` | Destaques, valores, estado ativo |
| accent-end | `#0066FF` | `colorAccent2()` | Fim dos gradientes |
| on-accent | `#06121C` | `colorAccentContrast()` | Texto sobre o accent |
| text | `#F0F0F0` | `colorTextPrimary()` | Texto principal |
| secondary | `#7B8EAD` | `colorTextSecondary()` | Texto secundário, labels |
| muted | `#4A5578` | `colorTextMuted()` | Legendas, placeholder |
| success | `#00E5A0` | `colorSuccess()` | Futuro, meta batida |
| warning | `#FFB800` | `colorWarning()` | Quase no limite |
| danger | `#FF4A6E` | `colorDanger()` | Estourada, erro |
| chart-des | `#0066FF` | `colorChartDes()` | Fatia Desejos |
| border | `rgba(255,255,255,.06)` | literal no CSS | Borda de card |
| border-soft | `rgba(255,255,255,.1)` | `borderSoft()` (composto sobre o card: `#2A2D3F`) e literal no CSS | Bordas de input, topbar e notificação |

Derivados com alfa, sempre a partir das cores acima: accent-sel `rgba(0,212,255,.08)`, danger-bg `rgba(255,74,110,.12)`, input-bg `rgba(255,255,255,.04)`, track-bg `rgba(255,255,255,.08)`, dot-inactive `rgba(255,255,255,.15)` e dot-visited `rgba(0,212,255,.4)`.

Regra: nenhum hex fora desta lista. As cores de categoria e de logo que eram compostas à mão (`colorCat*`, `colorWave*`) agora devolvem cores da paleta (as categorias das Caixinhas usam accent, warning, secondary, chart-des, danger e success). Exceção: o SVG oficial de fundo traz `#0B1430`, que é da usuária e não é token do app.

## 3. Tipografia

A pilha de fontes de todo texto, botão e input é:

```
system-ui, -apple-system, "Segoe UI", Roboto, sans-serif
```

O `.kof-button` do index.html do Kof não herda a fonte e cairia em Arial, e o body herda a fonte mono. Por isso todo Style de texto, botão e input declara `font-family`.

| Papel | Tamanho/peso | Fonte no artefato |
|---|---|---|
| Título de tela | 24 / 600 | DS |
| Título do onboarding (Desktop) | 26 / 600 | Desktop |
| Subtítulo | 18 / 600 | DS |
| Título da topbar | 16 / 600 | Desktop |
| Corpo | 14 / 400 | DS |
| Item de navegação | 13 / 600 | DS |
| Label de campo | 12 / 600, letter-spacing .04em, #7B8EAD | DS |
| Legenda | 12 / 600, caixa alta, .08em, muted | DS |
| Subtítulo da topbar | 11 / 400, #7B8EAD | Desktop (ver inconsistências) |
| Badge | 10 / 700, caixa alta, .04em | Desktop e Mobile |
| Valor monetário | 28 / 700, accent | DS |
| Valor grande (salário) | 52 / 700, accent | Desktop |

## 4. Raios, espaçamentos e alturas

| Token | Valor |
|---|---|
| Raio do card | 14 |
| Raio do card pequeno | 10 |
| Raio do botão | 10 |
| Raio do input | 8 |
| Raio do choice card | 12 |
| Raio do chip | 20 |
| Raio da tab | 9 por fora e 7 por dentro |
| Grade base | 8 |
| Margem lateral | 20 |
| Gap da grade | 14 |
| Gap entre seções | 20 |
| Sidebar | 190 (Desktop) |
| Topbar | 56 |
| Botão | 48 (atual do app), com variante de 40 (login e cadastro do Desktop) |
| Campo | 48 (atual do app), com variante de 38 (`formField`, login e cadastro do Desktop) |
| Radio | 18, com ponto de 9 |
| Ponto de "online" | 6, #00E5A0 |

## 5. Ícones

Os ícones são os do objeto `I` do artefato do design system, com traço (sem preenchimento): viewBox `0 0 24 24`, `fill="none"` e o stroke-width e o linecap de cada um. O script `scripts/gen-icons.sh` gera um arquivo por nome e tom em `frontend/assets/icons/<nome>-<tom>.svg`. A API fica em `components/icons.kf`: `icon(name, size, tone)` devolve um Image, e `iconView(name, size, tone, id)` devolve um View.

- Nomes: dash, chat, box, bell, gear, warn, check, mic, send, plus, pulse. O `pulse` usa o path do `zap`, que é o ícone de "Seu pulso de hoje".
- Tons: accent, secondary, muted, primary, onaccent, danger, warning, success.

O `kof build` não copia os assets. O Dockerfile copia `frontend/assets` inteiro para a saída web e confere se chegou.

## 6. Ondas de fundo

O fundo é `organiza-fundo-ondas.svg` (seção 1), montado por `backgroundWaves()` num Image absoluto atrás do conteúdo, com `pointer-events: none`. O conteúdo fica em `z-index: 1`. A camada entra só nas telas de entrada, em `core/navigation.kf`:

- Desktop: boas-vindas, salário, resultado, login e cadastro. No login e no cadastro, o fundo fica atrás da tela inteira até elas ganharem o painel da marca.
- Mobile: boas-vindas e todo o onboarding.

Para referência, a geometria das ondas nos artefatos é esta:

| Artefato | viewBox | Ondas | Cor | Traço | Opacidade |
|---|---|---|---|---|---|
| Desktop e DS (`Waves`) | 920×580 | 3 | #00D4FF | 2 / 1.5 / 2 | .1 |
| Mobile (`Waves`) | 400×780 | 4 | #00D4FF | 2 / 1.5 / 2 / 1.5 | .08 |
| Card "Fundo com ondas" do DS | 300×96 | 3 | #00D4FF | 2 / 1.5 / 2 | .1 |

## 7. Inconsistências entre os artefatos

| Item | DS | Desktop | Mobile | O app usa |
|---|---|---|---|---|
| Altura da topbar | 52 | 56 (min-height) | 52 | 56 |
| Título da topbar | 14 / 600 | 16 / 600 | 17 / 700 | 16 / 600 |
| Subtítulo da topbar | 10, muted | 11, muted | 11, muted | 11, #7B8EAD (o muted tem pouco contraste) |
| Borda da topbar | border (.06) | border (.06) | border (.06) | border-soft (.1) |
| Subtítulo do chat | não há | "Assistente online" | "Online" | "Assistente online" com ponto verde de 6 |
| Botão | 44, raio 10 | 48 nas boas-vindas e 40 no login, raio 10 | 50, raio 14 | 48 e 40, raio 10 |
| Input | 44, raio 8 | 38, raio 8 | 48, raio 12 | 48 e 38, raio 8 |
| Radio | 18 | 18 | 20 | 18 |
| Valor do salário | não há | 52 / 700 | 44 / 700 | 52 / 700 |
| Logo | viewBox 240×120, .78/.58 | igual ao DS | viewBox 240×108, .7/.45 | SVG oficial (1/.78/.58) |
| Ícones | traço | traço | preenchidos | traço (DS) |
| Ondas | 3, .1 | 3, .1 | 4, .08 | SVG oficial de fundo (6 ondas #0066FF) |
| Ondas no onboarding do Desktop | não há | salário, gastos e resultado | todo o onboarding | Desktop: salário e resultado, conforme a tarefa A1 |
| Sidebar | 200 (token) | 190 | não há | 190 |
| Fonte | system-ui | system-ui | system-ui | system-ui (o `theme.kf` antigo usava Manrope) |
| Tema claro | existe | existe | existe | existe, escolhido só em Configurações > Aparência (seção 8) |

## 8. Tema claro

O artefato Desktop (`64FYjX5UiveVxTtRGYurQP`) define o tema claro em `body[data-theme=light]`; os tokens abaixo foram conferidos nele e batem com o design system (`JVjueTmHeJsnHLsow3LDVb`). Onde o app diverge do artefato, a divergência está listada depois da tabela.

| Token | Escuro | Claro | Função em `theme.kf` |
|---|---|---|---|
| bg | `#0A0D18` | `#F8F9FC` | `colorBgPrimary()` |
| canvas | `#05060B` | `#E7EAF2` | `colorCanvas()` |
| card / card-2 | `#12162A` / `#1A1F3A` | `#FFFFFF` / `#FFFFFF` | `colorCard()` / `colorCardSecondary()` |
| accent / accent-end | `#00D4FF` / `#0066FF` | `#2563EB` / `#1D4ED8` | `colorAccent()` / `colorAccent2()` |
| on-accent | `#06121C` | `#FFFFFF` | `colorAccentContrast()` |
| text | `#F0F0F0` | `#1A1D2E` | `colorTextPrimary()` |
| secondary | `#7B8EAD` | `#6B7280` | `colorTextSecondary()` |
| muted | `#4A5578` | `#9CA3AF` | `colorTextMuted()` |
| success / warning / danger | `#00E5A0` / `#FFB800` / `#FF4A6E` | `#10B981` / `#F59E0B` / `#E63946` | `colorSuccess()` / `colorWarning()` / `colorDanger()` |
| chart-des | `#0066FF` | `#7C3AED` | `colorChartDes()` |
| border-soft | `rgba(255,255,255,.1)` | `#E5E7EB` | `borderSoft()` |
| border | `rgba(255,255,255,.06)` | `rgba(0,0,0,.06)` | literal nos Styles |
| input-bg / track-bg | `rgba(255,255,255,.04)` / `#1A1F3A` | `#FFFFFF` / `#E5E7EB` | literal nos Styles |
| ai-bubble | `#1A1F3A` | `#F1F3F9` | literal |
| card-shadow | nenhuma | `0 1px 3px rgba(0,0,0,.04)` | `cardCss()` |

**Mecanismo.** O `Style("css")` do kof.ui recusa `var()` (SEM078) e só aceita literal (SEM077); `Window.setTheme` não existe. Cada token é `pickColor(claro, escuro)` e cada Style é `themed(Style("claro"), Style("escuro"))`, lidos de `AppState.themeMode` na hora de desenhar; a troca chama `mountScreen`. Ícones: `<nome>-l<tom>.svg` (`scripts/gen-icons.sh`). Ondas: `organiza-fundo-ondas-light.svg`.

**Divergências do artefato (o artefato manda, salvo estas, por contraste AA):**
- Texto em tom `success`, `warning` e `danger` (badges, valores grandes como "Reserva acumulada") usa `text` `#1A1D2E`; o tom fica na borda, no fundo translúcido e nas barras. Sobre branco, `#10B981` dá 2,54:1, `#F59E0B` 2,15:1 e `#E63946` 4,17:1. Exceção: mensagens de erro e o botão "Sair" mantêm `danger` como texto (3,96 a 4,17:1, sem token mais escuro; passa só em texto grande).
- Texto em `muted` `#9CA3AF` (2,54:1 no branco) usa `secondary` `#6B7280`; `muted` fica para bordas do radio, ícones e placeholders.
- Sidebar do claro usa `bg` `#F8F9FC` (como o artefato), não `canvas`.
- Cartões de "pulso" do dashboard: branco com borda azul translúcida e sombra leve (como o `.pulse-card` claro), sem o gradiente azul do escuro.
- Escuro: três hex fora da paleta foram trocados pelos tokens (`#AAB9D3` por `secondary`, `#12141F` por `card`, `#FF6B85` por `danger`).

**Contraste (WCAG, texto sobre fundo; mínimo 4,5:1)**, calculado por `work/lm/contrast.py`:

| texto | card #FFFFFF | bg #F8F9FC | ai-bubble #F1F3F9 | track #E5E7EB |
|---|---|---|---|---|
| texto principal #1A1D2E | 16.68 ok | 15.84 ok | 15.03 ok | 13.47 ok |
| texto secundário #6B7280 | 4.83 ok | 4.59 ok | 4.36 FALHA | 3.90 FALHA |
| texto muted #9CA3AF | 2.54 FALHA | 2.41 FALHA | 2.29 FALHA | 2.05 FALHA |
| accent (links, rótulos) #2563EB | 5.17 ok | 4.91 ok | 4.66 ok | 4.17 FALHA |
| danger #E63946 | 4.17 FALHA | 3.96 FALHA | 3.76 FALHA | 3.37 FALHA |
| success #10B981 | 2.54 FALHA | 2.41 FALHA | 2.29 FALHA | 2.05 FALHA |
| warning #F59E0B | 2.15 FALHA | 2.04 FALHA | 1.94 FALHA | 1.73 FALHA |
on-accent #FFFFFF sobre accent-end #1D4ED8 6.70
on-accent #FFFFFF sobre accent #2563EB (botões, aba ativa) 5.17

Pares que falham e como foram resolvidos: `muted` como texto (virou `secondary`); `success`/`warning` como texto (viraram `text`); `danger` como texto só em erros (exceção acima); `secondary` sobre `ai-bubble` (4,36) não ocorre, porque a bolha da IA usa `text`; `accent` sobre `track` não ocorre.

## 9. Template de interacao financeira e registro de fatura do chat

Referencia: artefato oficial `JVjueTmHeJsnHLsow3LDVb` e tokens em `frontend/core/theme.kf`.

O template de interacao e os fluxos de selecao multipla (`SINGLE_ACTION`, `INVOICE_REGISTER`, `REVIEW_CHECKLIST`, `VIEW_CATEGORIES` e `INVOICE_REGISTERED`) sao renderizados por `frontend/screens/chat_screen.kf` com widgets KOF UI (`View`, `Button`, `Row`, `Column`, `Label`, `Input` e `icon`). O contrato tipado vem de `ChatInteractionResponse` e `ChatSelectableItemResponse` em `frontend/core/chat_api.kf`. A marca usa `frontend/assets/brand/organiza-simbolo.svg` ou sua variante clara; nao recriar o simbolo com SVG inline.

A abordagem segue Education First: destaque para o resultado em linguagem simples, bloco explicativo com `icon("pulse", 16, "accent")` (zero emojis), resumo dividido em **Entradas** e **Saidas** e informacoes tecnicas recolhidas sob o botao KOF UI `Detalhes da analise`.

Os checkboxes reutilizam indicadores KOF UI `20x20` (`border-radius: 6`, icone `icon("check", 13, "onaccent")` quando marcados) dentro de cards `border-radius: 12`, com atualizacao instantanea do subtotal local e confirmacao explicita antes de gravar no banco. Todos os controles usam exclusivamente os tokens claro/escuro definidos nas secoes 2 e 8. Informacoes tecnicas ficam sob o botao KOF UI `Detalhes da analise`, recolhidas por padrao.

## 10. Graficos de Gastos Calculados

O Dashboard e seus graficos sao montados em `frontend/screens/dashboard_screen.kf` com componentes KOF UI (`View`, `Row`, `Column`, `Button` e `Canvas`). A personalizacao dos graficos fica no header quando o periodo Ano esta ativo. Use os tokens de `frontend/core/theme.kf`, incluindo variantes claro/escuro das secoes 2 e 8; nao criar controles de dashboard em HTML ou folhas de estilo paralelas.
