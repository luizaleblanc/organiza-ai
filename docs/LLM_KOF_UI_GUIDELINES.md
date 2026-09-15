# KOF UI - Guideline para LLMs (Inteligência Artificial)

> **Contexto:** Este guia deve ser lido por qualquer IA (Claude, Gemini, etc) antes de escrever ou refatorar código KOF para o frontend do Organiza IA. Ele compila as limitações e atualizações baseadas na pasta `training/learn` do repositório oficial Kof4j.

## 1. Regras de Componentes Nativos (kof.ui)
O KOF **não** possui tags HTML nem widgets complexos do Flutter pré-prontos. Use APENAS os blocos construtores estruturais fornecidos pelo compilador:
- `Window`, `Label`, `Button`, `Input`
- `Column`, `Row`, `View`
- `Canvas`

**Proibições:**
- Não tente instanciar `BottomNavigationBar`, `ListView`, `PieChart` ou `Dropdown`. Eles não existem.
- Se precisar de uma NavBar inferior, construa manualmente com `Row(listOf(Button(...), Button(...)))`.
- Se precisar de Scroll, simule com `Column` (KofJS aplica overflow automático sob demanda).

## 2. A Atualização do Canvas (Custom Widgets)
O Kof 0.4.0-beta suporta `Canvas(width, height)`. Nós o utilizamos para contornar a falta de gráficos nativos (ex: `PieChart`).
- Para desenhar, use a sequência estrita: `canvas.setFill(cor) -> canvas.beginPath() -> canvas.moveTo(x, y) -> canvas.arc(x, y, r, start, end) -> canvas.closePath() -> canvas.fill()`.

## 3. Acesso a Listas (List Indexing)
- **CRÍTICO:** O KOF 0.4.0-beta introduziu uma validação estrita no compilador (Erro `[SEM054]`).
- **NUNCA** use sintaxe de array `[]` para acessar listas.
- ❌ Errado: `var item = lista[0]`
- ✅ Correto: `var item = lista.get(0)`

## 4. Estilos e Temas (Style & Color)
O construtor de estilo é rígido: `Style(background, foreground, padding, radius)`.
- O parâmetro `padding` é único (aplica para todos os 4 lados). Não tente aplicar padding assimétrico nativamente via construtor.
- Gradientes em `Color` não existem nativamente. Se o design system exigir gradientes complexos, substitua pelas cores base sólidas (ex: `AppTheme.cardSecondary`) ou desenhe via Canvas se for absolutamente indispensável.

## 5. Gerenciamento de Estado
- Não declare variáveis mutáveis (`var`) soltas em nível de arquivo.
- O estado compartilhado entre telas em KOF deve viver em **campos estáticos de classes** (`class SessionState { static String token = "" }`).
- As Lambdas de UI (ex: `Button("OK", () -> { ... })`) capturam variáveis globais/estáticas perfeitamente.

## 6. Null Safety e Instanciação
- Null safety rigoroso: NUNCA inicie variáveis explicitamente com `= null` sem tipagem estrita (Gera erro `SEM048`). Use strings vazias `""` ou inicialização condicional.
- Exemplo: `String? text` (certo) vs `String text = null` (errado).

---
**Atualizado em:** Setembro de 2026.
**Base de Referência:** `Kof4j/training/learn/35-kof-ui.md`
