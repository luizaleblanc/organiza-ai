# FRONTEND_PATTERNS.md -- Padrões de UI em KOF

> Documento corrigido para referenciar o projeto real:
> [KofLang/Kof4j/docs/ui](https://github.com/KofLang/Kof4j/tree/main/docs/ui),
> especialmente `docs/ui/architecture.md`.
>
> O arquivo anterior apontava incorretamente para outro repositório. Essa
> referência foi removida porque o Organiza IA deve seguir a arquitetura
> oficial do `kof.ui`, dentro do ecossistema KOF/JVM, com renderização real no
> alvo KofJS.

---

## 1. Fonte correta

A referência correta para o frontend KOF e a documentação de UI do Kof4j:

- Repositório: https://github.com/KofLang/Kof4j
- Documentação de UI: https://github.com/KofLang/Kof4j/tree/main/docs/ui
- Arquivo-base: `docs/ui/architecture.md`

O `kof.ui` é uma stdlib intrínseca do compilador KOF. Seus tipos são
reconhecidos pelo compilador e baixados para funções de runtime `kof_ui_*`.
A interface é descrita em KOF, compila dentro do ecossistema KOF/JVM, e tem
renderização efetiva no alvo JavaScript/KofJS, que desenha DOM no webview
nativo ou no browser.

---

## 2. Regra de arquitetura para o Organiza IA

O frontend do Organiza IA deve ser implementado com `kof.ui`, não como página
HTML gerada por strings.

Modelo correto:

```kof
var win = Window("Organiza IA")

var app = Component("App")
app.state(0)
app.view { state ->
    Column([
        Label("Tarefas: " + state),
        Button("+1", () -> {
            app.state(state + 1)
        })
    ])
}

win.bind(app)
win.show()
```

Esse padrão representa uma árvore de UI composta por `Window`, componentes,
layouts e widgets. A renderização, eventos, estado, ciclo de vida e navegação
devem seguir a arquitetura do `kof.ui`.

---

## 3. Pipeline esperado do `kof.ui`

```text
KOF source
  -> SemanticAnalyzer reconhece tipos kof.ui.*
  -> CompilerDriver baixa construtores/metodos para chamadas kof_ui_*
  -> Backend JVM/Native mantem no-ops documentados para UI
  -> Backend JS/KofJS executa a implementação DOM real
```

Pontos importantes para manter a documentação e o código alinhados:

- `kof.ui` e plataforma de interface, não apenas coleção de widgets.
- A renderização real da UI acontece no alvo KofJS.
- JVM e Native preservam compatibilidade de compilação com no-ops para UI.
- O código do app deve expressar UI como árvore de componentes e widgets.

---

## 4. Primitivas de UI relevantes

Inventário arquitetural usado como base:

| Categoria | Tipos | Uso esperado |
|---|---|---|
| Janela | `Window` | Host raiz da aplicação |
| Folhas | `Label`, `Button`, `Input`, `Link`, `Image`, `Icon` | Widgets visíveis e interativos |
| Layout | `Column`, `Row`, `View`, `Box`, `Stack`, `Spacer`, `Wrap`, `Grid`, `Center`, `Align` | Estrutura visual |
| Tema | `Color`, `Palette`, `Theme` | Cores e tokens semânticos |
| Fonte | `Font` | Família, tamanho e peso |
| Componente | `Component` | Unidade de estado, renderização e ciclo de vida |
| Navegação | `Router` | `route`, `go`, `replace`, `back`, `forward`, `param`, `current`, `depth` |

---

## 5. Component model

O `Component` é o nó de composição da UI. Ele concentra:

- estado local;
- função de view;
- lifecycle;
- efeitos com cleanup;
- invalidação;
- reconciliação de renderização.

Padrão recomendado:

```kof
var screen = Component("Dashboard")

screen.state("loading")
screen.view { status ->
    Column([
        Label("Status: " + status),
        Button("Atualizar", () -> {
            screen.state("ready")
        })
    ])
}

screen.onMount {
    // carregar dados iniciais
}

screen.onDispose {
    // liberar recursos da tela
}
```

O estado deve viver no componente sempre que possível. Evite espalhar estado
em campos estáticos globais quando a mudança pertence a uma tela ou parte da
árvore de UI.

---

## 6. Navegação

A navegação deve usar `Router` quando a UI tiver mais de uma tela.

```kof
Router.route("home", HomeScreen())
Router.route("tasks", TasksScreen())

Router.go("home")
Router.go("tasks", "today")
Router.back()
```

Navegar significa trocar o componente raiz ativo. O runtime deve desmontar a
rota anterior, executar cleanup de lifecycle e montar a nova tela.

---

## 7. Aplicação ao Organiza IA

| Necessidade do Organiza IA | Padrão correto em KOF |
|---|---|
| Tela inicial | `Window` + `Component("App")` |
| Layout de tarefas | `Column`, `Row`, `Box`, `Grid`, `Scroll` quando disponível |
| Estado da tela | `Component.state(...)` |
| Eventos de botão/input | handlers registrados no componente/widget |
| Troca de telas | `Router.go`, `Router.replace`, `Router.back` |
| Tema visual | `Theme`, `Palette`, `Color`, tokens semânticos |
| Execução visual | alvo KofJS/webview |
| Compatibilidade JVM | UI compila no ecossistema KOF/JVM; runtime visual e KofJS |

---

## 8. Decisão documental

Este documento usa somente o Kof4j UI como referência de frontend. Qualquer
link, exemplo ou explicação de UI deve apontar para:

```text
https://github.com/KofLang/Kof4j/tree/main/docs/ui
```

Para detalhes de arquitetura, consulte:

```text
https://github.com/KofLang/Kof4j/blob/main/docs/ui/architecture.md
```

Commit sugerido:

```text
docs(ui): corrige referência de frontend para Kof4j UI
```
