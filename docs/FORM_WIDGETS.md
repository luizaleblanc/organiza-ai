# Widgets de formulário (`frontend/components/form_widgets.kf`)

Os widgets antigos (`primaryButton`, `secondaryButton`, `disabledButton`, `textField`, `moneyField`, `moneyFieldWith`, `choiceCard`, `progressDots`, `bucketBar`, `errorBanner`) continuam com as mesmas assinaturas. Os estilos vêm de `core/theme.kf`; os valores estão em `docs/DESIGN_SYSTEM.md`.

## Novos (tarefa A1)

| Função | Devolve | O que faz |
|---|---|---|
| `formField(placeholder, type, id)` | Input | Campo de 38 px, raio 8, fundo `rgba(255,255,255,.04)`, borda border-soft, 14 px. |
| `labeled(label, field)` | View | Label 12/600 em `#7B8EAD` (letter-spacing .04em), 6 px acima do campo. |
| `passwordField(placeholder, id)` | Input | `formField` de senha com 38 px à direita para o olho. |
| `passwordBox(field, id)` | View | Campo + olho em Canvas (16 px). O clique alterna `setType("text")`/`setType("password")`. Id do olho: `<id>-eye`. |
| `radioChoiceCard(label, id, selected, action)` | View | Card de escolha (raio 12, padding 14×16) com radio de 18 px e ponto de 9 à direita; `View.on("click")`. |
| `bigMoneyField(value, id)` | Input | Valor 52/700 em accent. `on("input")` aplica a máscara de milhar (`3000` → `3.000`), até 7 dígitos. Parse com `parseMoney` (`core/format.kf`). |
| `bigMoneyAmount(field, id)` | View | Linha "R$" (52/700) + `bigMoneyField`, alinhada na base. |
| `moneyHint(text)` | Label | Dica 13 px em muted, centrada, 12 px abaixo do valor. |
| `chip(label, id, selected, action)` | Button | Chip de raio 20, borda 1,5; selecionado em accent-sel com texto accent 600. |
| `chipGroup(title, chips, id)` | View | Título 11/700 em caixa alta (muted) + chips com quebra de linha e gap 8. |

Exemplo:

```kof
var pwd = passwordField("Crie uma senha", "signup-password")
var form = Column(listOf(
    labeled("E-mail", formField("Seu e-mail", "email", "signup-email")),
    labeled("Senha", passwordBox(pwd, "signup-password-box"))))
```

Limitações medidas no Kof 0.6.6: `Canvas` não aceita `setId`/`setStyle`, por isso o olho vive num View; `Style("css")` só aceita literal, por isso cada variação é uma função em `theme.kf`.
