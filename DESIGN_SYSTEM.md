# Design System — Organiza IA

> Documento de referência visual gerado a partir do protótipo criado no Claude Design
> (artifact `9b4531f0-a9f9-444e-8555-36c2b92ec978`).
> Identidade: fundo preto-azulado, ondas cyan quase imperceptíveis ao fundo, cyan usado com parcimônia (só em destaques: valores, ações primárias, estado ativo).

---

## 1. Paleta de cores

### Cores base

| Nome | Hex | Uso |
|---|---|---|
| Fundo (background) | `#0A0D18` | Fundo de todas as telas |
| Card | `#12162A` | Fundo de cards, inputs, nav bar |
| Card secundário (gradiente) | `#1A1F3A` | Segunda cor do gradiente do card de pulso diário |
| Borda de card | `rgba(255,255,255,.06)` | Borda sutil de cards |
| Borda de chrome (phone) | `rgba(255,255,255,.08)` | Borda do "aparelho" nos mockups |

### Cores de destaque (accent)

| Nome | Hex | Uso |
|---|---|---|
| Accent (cyan) | `#00D4FF` | Cor de destaque principal — valores, ícones ativos, bordas de foco, ondas de fundo |
| Accent 2 (azul) | `#0066FF` | Segunda cor do gradiente do botão primário |
| Accent contrast | `#06121C` | Cor de texto sobre fundo cyan (ex.: texto do botão primário, bolha do usuário no chat) |

### Cores de texto

| Nome | Hex | Uso |
|---|---|---|
| Texto principal | `#F0F0F0` | Títulos, corpo de texto, valores |
| Texto secundário | `#7B8EAD` | Subtítulos, legendas, placeholders de maior destaque |
| Texto muted | `#4A5578` | Placeholders, dicas de campo, texto desabilitado |

### Cores de estado

| Nome | Hex | Uso |
|---|---|---|
| Sucesso | `#00E5A0` | Estados positivos (não usado diretamente nas telas, reservado) |
| Alerta (warning) | `#FFB800` | Barra de progresso entre 80%–99% de uso da caixinha |
| Perigo (danger) | `#FF4A6E` | Barra de progresso ≥100% (estourou o limite) |

### Cores de categoria (ícones de caixinhas)

Usadas como fundo translúcido (`.16` de opacidade) + cor sólida do ícone, uma por categoria de caixinha:

| Categoria | Cor | Hex |
|---|---|---|
| Moradia | Azul-violeta | `#7C8CFF` (fundo `rgba(124,140,255,.16)`) |
| Mercado | Verde-água | `#2DD4BF` (fundo `rgba(45,212,191,.16)`) |
| Transporte | Azul-céu | `#38BDF8` (fundo `rgba(56,189,248,.16)`) |
| Delivery | Roxo | `#A78BFA` (fundo `rgba(167,139,250,.16)`) |
| Lazer | Rosa | `#F472B6` (fundo `rgba(244,114,182,.16)`) |
| Reserva (Futuro) | Verde-limão | `#A3E635` (fundo `rgba(163,230,53,.16)`) |

### Gradiente

- **Botão primário**: `linear-gradient(90deg, #00D4FF, #0066FF)` — único lugar da interface com gradiente.
- **Card de pulso diário**: `linear-gradient(135deg, #12162A, #1A1F3A)` com borda `rgba(0,212,255,.15)`.

### Ondas de fundo

Todas as telas têm ondas SVG em cyan quase imperceptíveis atrás do conteúdo (nunca em primeiro plano):
- `stroke: #00D4FF`
- `stroke-opacity`: entre `0.06` e `0.13`
- `stroke-width`: `1.5`–`2.5`

### 1.1 Marca (logomark)

- Conceito: **3 ondas** horizontais fluidas, empilhadas com espaçamento vertical uniforme e opacidade decrescente de cima para baixo (1 / .7 / .45). Lê-se como um recorte da textura de ondas de fundo já usada em todo o app.
- **Amplitude padronizada**: a primeira onda é a referência — as outras duas repetem exatamente a mesma curva (mesma amplitude), só deslocada verticalmente, nunca encolhendo o traço. Isso é proposital: evita que a marca vire 3 arcos concêntricos de tamanhos diferentes (o que lembraria o logo do Spotify) — aqui são 3 ondas idênticas e paralelas, como ondulações reais na água, sem círculo nem moldura.
- Construção: **um único SVG** (`viewBox` 240×120), reutilizado em toda a interface só com `width`/`height` diferentes — não existem duas versões (ícone pequeno vs. arte grande) com paths distintos; é sempre exatamente o mesmo traçado escalado, garantindo que a marca pequena e a arte da tela de boas-vindas sejam idênticas
- Proporção fixa 2:1 (largura:altura) — ao redimensionar, sempre `height = width / 2`
- Cor: gradiente de marca `linear-gradient(135deg, #00D4FF, #0066FF)` (mesmo gradiente do botão primário) aplicado ao `stroke` de todos os elementos — uma única definição de gradiente reutilizada em todas as instâncias da marca na interface
- **Variante mono**: mesma construção, mas com `stroke: currentColor` em vez do gradiente — usada quando a marca aparece sobre um fundo já colorido (ex.: ícone de app na notificação), garantindo contraste em vez de competir com o próprio gradiente de fundo
- **A marca é sempre isolada nas telas do app** — sem o wordmark "OrganizaIA" ao lado. O wordmark existe apenas como referência de documentação (seção "Marca" do design system), nunca pareado com o símbolo dentro do produto
- Larguras de uso (altura sempre a metade): 120px (logo de Login), 92px (logo compacto de Cadastro), 80px (cabeçalho do Chat), 30px (ícone da notificação, variante mono), 78px (documentação do design system), 230px (arte da tela de boas-vindas)

### 1.2 Arte de boas-vindas (hero)

- É a mesma marca da seção 1.1, só que na largura máxima (230px) — não é uma peça separada, é o mesmo componente
- Composição da Tela 1: marca em tamanho hero (230px) → slogan abaixo
- Slogan com a tipografia de **Legenda** (ver seção 2 — Tipografia, mesmo estilo de "ATUALIZADO HÁ 2 MIN"): 14px/400/texto secundário, `letter-spacing` .08em, caixa alta, `max-width` 240px, centralizado — "SUA GRANA ORGANIZADA E SEM ESTRESSE."

---

## 2. Tipografia

**Fonte**: Manrope (Google Fonts), pesos 400 e 600. Fallback: `ui-sans-serif, system-ui, sans-serif`.

| Estilo | Tamanho | Peso | Cor | Uso |
|---|---|---|---|---|
| Título | 24px | 400 | Texto principal (`#F0F0F0`) | Títulos de tela (ex.: "Seus gastos essa semana") |
| Subtítulo | 18px | 400 | Texto principal | Subtítulos de seção (ex.: "Caixinha Mercado") |
| Corpo | 16px | 400 | Texto principal | Texto corrido, mensagens de chat, labels de escolha |
| Legenda | 14px | 400 | Texto secundário (`#7B8EAD`) | Legendas, timestamps, dicas ("ATUALIZADO HÁ 2 MIN") |
| Valor monetário | 24px | 400 | Accent (`#00D4FF`) | Valores em destaque (pulso diário, resumo) |

Outras variações usadas nas telas:
- Logo (`Organiza` + `IA`): 28px / 600 / texto principal, duas palavras lado a lado com leve espaçamento negativo.
- Números tabulares: `font-variant-numeric: tabular-nums` aplicado globalmente para alinhamento de valores.
- Texto monoespaçado (`ui-monospace, 'SF Mono', Menlo, monospace`): usado apenas em elementos de documentação/dev (eyebrow, specs), não aparece nas telas do produto.

---

## 3. Componentes

### 3.1 Botões

**Botão primário**
- Altura: 48px, largura 100%
- `border-radius`: 12px
- Fundo: gradiente `90deg, #00D4FF → #0066FF`
- Texto: 16px / 600 / `#06121C` (accent-contrast)
- Sem borda
- Exemplos de uso: "Entrar", "Criar conta", "Próximo", "Começar a organizar", "Registrar gasto"

**Botão secundário**
- Mesma altura/radius do primário
- Fundo transparente
- Borda: 1.5px sólida cyan (`#00D4FF`)
- Texto: 16px / 600 / cyan
- Exemplo: "Ver detalhes"

**Botão desabilitado**
- Fundo: cor de card (`#12162A`)
- Borda: 1px `rgba(255,255,255,.06)`
- Texto: cor muted (`#4A5578`)
- Usado quando uma escolha obrigatória ainda não foi feita (ex.: tela de tipo de renda antes de selecionar uma opção)

**Botão de ícone (icon button)**
- 40×40px, `border-radius`: 12px
- Fundo card, borda de card
- Ícone: 20×20px, cor texto secundário
- Usado para configurações (engrenagem) e adicionar caixinha (+)

**Botão de enviar (chat)**
- 48×48px, `border-radius`: 12px
- Fundo cyan sólido (`#00D4FF`)
- Ícone: cor accent-contrast

### 3.2 Inputs

- Altura: 48px, largura 100%
- `border-radius`: 8px
- Fundo: cor de card (`#12162A`)
- Borda: 1px `rgba(255,255,255,.06)`
- Padding horizontal: 16px
- Placeholder: 16px / cor muted (`#4A5578`)
- Campo de senha: ícone de olho (mostrar/ocultar) à direita, 20px, cor texto secundário
- Campo de valor (onboarding): prefixo "R$" (16px/600/texto secundário) + valor digitado (20px/600/cyan) + cursor piscante (`caret`) cyan de 2×18px com animação `blink` (1.1s)

### 3.3 Cards

**Card de pulso diário**
- `border-radius`: 12px (documentação) / 16px (tela real do dashboard)
- Padding: 24px
- Fundo: gradiente `135deg, #12162A → #1A1F3A`
- Borda: 1px `rgba(0,212,255,.15)`
- Conteúdo: eyebrow em caps (12px/600/texto secundário/letter-spacing .1em), linha de contexto (16px/texto secundário), valor grande (32px/600/cyan), rodapé (13px/muted)
- Dica de economia (opcional): divisor 1px na cor da borda do card + linha de texto 13px/600/accent apontando uma categoria específica para cortar gastos (ex.: "Dica: economize em Uber para cortar gastos.") — mesma lógica de gatilho da notificação (seção 3.9), só que sempre visível no dashboard em vez de pop-up

**Card de transação**
- `border-radius`: 12px
- Padding: 16px (dashboard usa 12px)
- Fundo: card, borda de card
- Layout: ícone (36–40px, `border-radius` 10px, fundo `rgba(255,255,255,.03)`, cor texto secundário) + nome (16px/600) + categoria/hora (13px/muted) + valor (16px/600/texto principal, alinhado à direita)

**Card de caixinha (envelope)**
- `border-radius`: 12px, padding 16px
- Fundo card, borda de card
- Chip de ícone: 36×36px, `border-radius` 10px, fundo translúcido na cor da categoria (ver seção 1)
- Corpo: nome (16px/600) + porcentagem (13px/texto secundário) + barra de progresso + valor "R$ X de R$ Y" (13px/muted)

### 3.4 Barras de progresso

- Trilho (`track`): altura 8px, `border-radius` 4px, fundo cor de card
- Preenchimento (`fill`): altura 100% do trilho, `border-radius` 4px
- **3 estados por cor**:
  - Normal (0–79%): cyan `#00D4FF`
  - Alerta (80–99%): amarelo `#FFB800`
  - Perigo (≥100%): vermelho `#FF4A6E` (preenchimento visualmente limitado a 100% de largura mesmo que o valor real ultrapasse)
- Label acima: nome do bucket (14px/600) à esquerda + porcentagem (14px/texto secundário) à direita
- Valor absoluto abaixo (opcional): 13–14px/muted ou texto principal, ex. "R$ 1.640 de R$ 2.000"

### 3.5 Nav bar (navegação inferior)

- Altura: 64px
- `border-radius`: 16px 16px 0 0 (topo arredondado, ancorada no rodapé)
- Fundo: cor de card, borda superior 1px de card
- 3 itens distribuídos com `justify-content: space-around`: Dashboard, Chat, Caixinhas
- Cada item: ícone 20×20px + label 12px/600, empilhados verticalmente, área mínima de toque 48×48px
- Item ativo: cor cyan (ícone + label); itens inativos: cor texto secundário

### 3.6 Bolhas de chat

- `border-radius`: 12px, padding 12px 16px, fonte 16px/1.45
- **IA** (assistente): alinhada à esquerda, fundo `#1A1F3A` (card-2), texto principal, canto inferior-esquerdo com radius reduzido (4px) — "rabinho" da bolha
- **Usuário**: alinhada à direita, fundo cyan sólido (`#00D4FF`), texto accent-contrast, peso 600, canto inferior-direito com radius reduzido (4px)
- Largura máxima da bolha: 78% da tela
- Campo de digitação abaixo: input padrão (48px altura) com placeholder + ícone de microfone (32×32px) à direita dentro do campo, e botão de enviar cyan separado à direita

### 3.7 Escolhas de onboarding (choice cards)

- Altura: 72px, `border-radius` 12px, padding horizontal 16px
- Fundo card, borda de card
- Estado selecionado: borda cyan + fundo `rgba(0,212,255,.08)`
- Label: 16px/600, ocupa o espaço flexível
- Radio à direita: círculo 20px, borda 1.5px muted (ou cyan se selecionado) com ponto interno cyan de 10px quando selecionado

### 3.7.1 Gráfico de pizza (dashboard)

- Diâmetro: 200px, centralizado horizontalmente
- 3 fatias proporcionais aos gastos de cada bucket
- Cores: Necessidades (`#00D4FF`), Desejos (`#0066FF`), Futuro (`#00E5A0`)
- Espaço de 2px entre fatias (separação visual)
- Centro: círculo `#0A0D18` com percentual total usado (24px, bold, `#F0F0F0`)
- Fatia com uso > 80%: cor muda para `#FFB800` (alerta)
- Fatia com uso > 90%: cor muda para `#FF4A6E` (perigo)
- Interação:
  - Tap na fatia: fatia destaca (desloca 8px na direção radial), mostra label
  - Label: "Necessidades: R$ 1.640 de R$ 2.000" (14px, `#F0F0F0`)
  - Segundo tap na fatia destacada: abre lista dos envelopes do bucket
  - Tap fora: volta ao estado normal

### 3.8 Indicadores de progresso (dots de onboarding)

- 4 pontos de 8px, `border-radius` 50%, `gap` 12px, centralizados
- Estados: `active` (cyan sólido), `visited` (cyan a 40% de opacidade), `inactive` (branco a 15% de opacidade)

### 3.9 Notificação push (mobile)

- Apresentação: pop-up isolado (estilo toast do Steam/Epic Games), não uma tela de bloqueio completa — o resto da tela fica escurecido (`rgba(0,0,0,.55)`) atrás do card, reforçando que é um artefato do sistema operacional sobreposto ao app
- Card: largura máx. 300px, `border-radius` 10px, padding 14px, fundo cinza-escuro translúcido `rgba(40,42,48,.82)` com `backdrop-filter: blur(16px)`, borda `rgba(255,255,255,.08)`, sombra `0 12px 32px rgba(0,0,0,.5)`
- Cores do card são fixas (não seguem o tema claro/escuro do app) — é um elemento do SO, igual a um toast do Steam ou da Epic Games Store
- Botão de fechar "×" no canto superior direito, discreto (`rgba(255,255,255,.4)`)
- Ícone do app: 40×40px, `border-radius` 8px, gradiente cyan→azul, com a marca Organiza (ver seção 1.1) em 30px de largura, variante mono (`stroke: currentColor`), cor accent-contrast
- **Traço mais grosso nesse tamanho específico** (`stroke-width` 16, contra o padrão 3.5 da marca): em ícones muito pequenos o traço padrão da marca fica fino demais e perde legibilidade — só essa instância usa o traço reforçado, o resto da marca na interface mantém o padrão
- Cabeçalho: "ORGANIZA" em caixa alta (12px/700) à esquerda + "agora" (11px/muted) à direita
- Título da notificação: 14px/700, cor de texto principal
- Corpo: 13px/400/texto secundário, até 2 linhas
- Gatilho: gerado quando uma caixinha ultrapassa 80–90% do limite (mesmo threshold de alerta das barras de progresso e do gráfico de pizza)
- Tom de voz: descontraído e direto, sem jargão financeiro, para atingir qualquer público — não é um alerta de banco, é um toque de amigo (ver `CLAUDE.md`)
- Exemplo de conteúdo: "Ô psit, dá um trégua no delivery" / "Já foi 90% da caixinha esse mês. Pede uma vez a menos essa semana e o mês fecha redondo, sem dívida e sem drama."

---

## 4. Layout

### Grid e espaçamento

| Token | Valor |
|---|---|
| Grid base | 8px |
| Margens laterais da tela | 16px |
| Altura padrão de botão/input | 48px (100% da largura) |
| `border-radius` de botão/card | 12px |
| `border-radius` de input | 8px |
| `border-radius` de nav bar | 16px (topo) |
| Gap entre itens de uma lista/form | 16px |
| Gap entre seções | 24px |
| Gap entre linhas de progress bar em conjunto | 20px |

### Estrutura de tela (mobile, 360×640)

- **Status bar**: 24px de altura, hora à esquerda, indicador de sinal à direita
- **Home indicator**: 24px de altura, barra central de 120×4px, cor muted a 60% de opacidade
- Telas de **autenticação**: padding `0 16px 24px`
- Telas de **onboarding**: padding `24px 16px 24px`
- Telas do **app principal**: padding `16px 16px 0` (sem padding inferior — a nav bar ocupa até a borda)
- Áreas roláveis (`dash-scroll`, `env-scroll`, `messages`) usam `mask-image` com gradiente para suavizar o corte no topo/rodapé do scroll

---

## 5. Especificação das 11 telas

### Tela 1 — Boas-vindas (pré-login)
- Tela principal exibida antes de qualquer autenticação — primeiro contato com a marca
- Ondas no fundo
- Centro: arte de boas-vindas (ver seção 1.2) — as 3 ondas grandes da marca + slogan "SUA GRANA ORGANIZADA E SEM ESTRESSE." (tipografia de legenda), sem o wordmark "OrganizaIA"
- Rodapé: botão primário "Criar conta" + botão secundário "Já tenho conta" (empilhados, gap 12px), com respiro extra (`padding-bottom` 40px) para não colar na borda/home indicator
- Não tem dots de progresso nem botão de voltar — é o ponto de entrada do app

### Tela 2 — Login
- Apenas a marca isolada (68px, sem wordmark) centralizada no topo, grande respiro vertical
- Formulário: campo "E-mail" + campo "Senha" (com ícone de olho)
- Espaço flexível empurra o conteúdo seguinte para o rodapé
- Botão primário "Entrar", com respiro extra até a borda inferior (`padding-bottom` 32px)
- Rodapé: "Não tem conta?" em uma linha + link em destaque cyan "Cadastre-se" na linha abaixo

### Tela 3 — Cadastro
- Apenas a marca isolada (52px, sem wordmark) no topo
- Formulário: "Nome", "E-mail", "Senha" (com olho), "Confirmar senha" (com olho)
- Botão primário "Criar conta", com respiro extra até a borda inferior (`padding-bottom` 36px)
- Rodapé: "Já tem conta?" em uma linha + link cyan "Entre" na linha abaixo

### Tela 4 — Onboarding: Salário
- Dots de progresso: 1º ativo, demais inativos
- Título: "Quanto você ganha por mês?" (400)
- Subtítulo: "Vamos adaptar tudo ao seu salário" (400)
- Campo de valor centralizado horizontal e verticalmente (uma cor só, accent): prefixo "R$" (20px/400/cyan) + valor grande editável (20px/400/cyan) + cursor piscante cyan
- Dica abaixo do campo: "Pode ser aproximado — dá pra ajustar depois"
- Botão primário "Próximo"

### Tela 5 — Onboarding: Tipo de renda
- Dots: 1º visitado, 2º ativo
- Título: "Sua renda é fixa ou variável?"
- Subtítulo: "Isso muda como calculamos seu dia a dia"
- Duas choice cards: "Fixa (CLT, salário todo mês)" e "Variável (freela, PJ, bicos)"
- Botão "Próximo" fica **desabilitado** até selecionar uma opção

### Tela 6 — Onboarding: Dívidas
- Dots: 1º e 2º visitados, 3º ativo
- Título: "Você tem dívidas em atraso?"
- Subtítulo: "Isso ajuda a escolher o melhor modelo pra você"
- Choice cards: "Sim, tenho dívidas" / "Não, estou em dia"
- Botão primário "Próximo"

### Tela 6.1 — Onboarding: Valor da Dívida (Caso "Sim" na Tela 6)
- Dots: 1º, 2º e 3º visitados, 4º ativo
- Título: "Qual o valor aproximado da sua dívida?"
- Subtítulo: "Isso ajuda a modelar o modelo de economia que mais se adequa a sua realidade"
- Campo de valor centralizado horizontal e verticalmente (uma cor só, accent): prefixo "R$" (20px/400/cyan) + valor grande editável (ex. "5.000", 20px/400/cyan) + cursor piscante cyan
- Botão primário "Próximo"

### Tela 7 — Onboarding: Resultado
- Dots: 1º, 2º, 3º visitados, 4º ativo
- Título: "Seu modelo: Anti-Dívida"
- Texto explicativo: "70% para necessidades, 10% para o mínimo pessoal, 20% para quitar suas dívidas."
- Três buckets com barra de progresso e valor: Necessidades (70% · R$ 2.100), Pessoal (10% · R$ 300), Quitação (20% · R$ 600)
- Botão primário "Começar a organizar" (encerra o onboarding)

### Tela 8 — Dashboard
- Cabeçalho: "Olá, Luiza" + botão de engrenagem (configurações)
- Card de pulso diário: "Você pode gastar hoje" → "R$ 92,00" → "Faltam 12 dias para acabar o mês" → divisor + dica de economia ("Dica: economize em Uber para cortar gastos.", 13px/600/accent)
- Seção "Seus buckets": gráfico de pizza (ver seção 3.7.1) com as 3 fatias (Necessidades 82% · R$ 1.640 de R$ 2.000; Desejos 65% · R$ 780 de R$ 1.200; Futuro 33% · R$ 266 de R$ 800)
- Seção "Últimas transações": lista de tx-cards (Uber -R$ 22 · Transporte; iFood -R$ 45 · Alimentação; Mercado -R$ 180 · Compras)
- Nav bar inferior com "Dashboard" ativo

### Tela 9 — Chat
- Cabeçalho centralizado: apenas a marca isolada (46px, sem wordmark)
- Mensagens: bolha IA ("Olá! Como posso te ajudar hoje?"), bolha usuário ("gastei R$ 35 no almoço, R$ 359 no mercado e R$ 75 no pet shop."), bolha IA com resposta descontraída confirmando o registro e dando orientação de gasto diário
- Campo de digitação com placeholder "Digite seu gasto..." + ícone de microfone + botão de enviar cyan
- Nav bar inferior com "Chat" ativo

### Tela 10 — Caixinhas (envelopes)
- Cabeçalho: "Suas caixinhas" + botão "+" (adicionar caixinha)
- Agrupado por categoria macro (mesmos buckets do modelo adaptativo):
  - **Necessidades**: Moradia (80% · R$ 1.200 de R$ 1.500, alerta), Mercado (64% · R$ 320 de R$ 500), Transporte (43% · R$ 130 de R$ 300)
  - **Desejos**: Delivery (90% · R$ 270 de R$ 300, alerta), Lazer (40% · R$ 120 de R$ 300)
  - **Futuro**: Reserva (33% · R$ 266 de R$ 800)
- Cada card de caixinha tem chip de ícone colorido por categoria (ver seção 1)
- Nav bar inferior com "Caixinhas" ativo

### Tela 11 — Notificação (push)
- Pop-up isolado sobre fundo escurecido (não é uma tela navegável do app — ver seção 3.9)
- Notificação do Organiza sugerindo economia na caixinha que está no limite, em tom descontraído
- Não faz parte do fluxo de navegação do app — é um artefato do sistema operacional (ver mapeamento KOF)

---

## Observações de implementação (KOF)

- KOF ainda não tem `ListView` scrollável — as listas roláveis das telas 7 e 9 devem ser simuladas com `Column` de itens fixos até o componente chegar.
- KOF não tem `BottomNavigationBar` nativa — construir a nav bar com `Row` + `Button`s, replicando o estado ativo (cor cyan) via campo estático de tela atual.
- Valores monetários devem ser strings já formatadas vindas do backend (KOF não tem `BigDecimal`).
- Cores devem ser definidas via `Color.rgba()` ou `Color(r,g,b)` usando os hex/rgba documentados acima.

---

## Mapeamento de componentes para KOF

| Componente do Design System | Suporte em kof.ui | Ação |
|---|---|---|
| Gráfico de pizza | NÃO EXISTE | Reportar para equipe KOF |
| Notificação push (nativa) | NÃO EXISTE | Depende da API Mobile (`kof.mobile.onPush`, ver `KOF_VS_FLUTTER.md` seção 5) — reportar para equipe KOF |
