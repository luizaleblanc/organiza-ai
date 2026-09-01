# FRONTEND_PATTERNS.md -- Padroes de UI em KOF

> Documento corrigido para referenciar o projeto real:
> [KofLang/Kof4j/docs/ui](https://github.com/KofLang/Kof4j/tree/main/docs/ui),
> especialmente `docs/ui/architecture.md`.
>
> O arquivo anterior apontava incorretamente para outro repositorio. Essa
> referencia foi removida porque o Organiza IA deve seguir a arquitetura
> oficial do `kof.ui`, dentro do ecossistema KOF/JVM, com renderizacao real no
> alvo KofJS.

---

## 1. Fonte correta

A referencia correta para o frontend KOF e a documentacao de UI do Kof4j:

- Repositorio: https://github.com/KofLang/Kof4j
- Documentacao de UI: https://github.com/KofLang/Kof4j/tree/main/docs/ui
- Arquivo-base: `docs/ui/architecture.md`

O `kof.ui` e uma stdlib intrinsic do compilador KOF. Seus tipos sao
reconhecidos pelo compilador e baixados para funcoes de runtime `kof_ui_*`.
A interface e descrita em KOF, compila dentro do ecossistema KOF/JVM, e tem
renderizacao efetiva no alvo JavaScript/KofJS, que desenha DOM no webview
nativo ou no browser.

---

## 2. Regra de arquitetura para o Organiza IA

O frontend do Organiza IA deve ser implementado com `kof.ui`, nao como pagina
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

Esse padrao representa uma arvore de UI composta por `Window`, componentes,
layouts e widgets. A renderizacao, eventos, estado, ciclo de vida e navegacao
devem seguir a arquitetura do `kof.ui`.

---

## 3. Pipeline esperado do `kof.ui`

```text
KOF source
  -> SemanticAnalyzer reconhece tipos kof.ui.*
  -> CompilerDriver baixa construtores/metodos para chamadas kof_ui_*
  -> Backend JVM/Native mantem no-ops documentados para UI
  -> Backend JS/KofJS executa a implementacao DOM real
```

Pontos importantes para manter a documentacao e o codigo alinhados:

- `kof.ui` e plataforma de interface, nao apenas colecao de widgets.
- A renderizacao real da UI acontece no alvo KofJS.
- JVM e Native preservam compatibilidade de compilacao com no-ops para UI.
- O codigo do app deve expressar UI como arvore de componentes e widgets.

---

## 4. Primitivas de UI relevantes

Inventario arquitetural usado como base:

| Categoria | Tipos | Uso esperado |
|---|---|---|
| Janela | `Window` | Host raiz da aplicacao |
| Folhas | `Label`, `Button`, `Input`, `Link`, `Image`, `Icon` | Widgets visiveis e interativos |
| Layout | `Column`, `Row`, `View`, `Box`, `Stack`, `Spacer`, `Wrap`, `Grid`, `Center`, `Align` | Estrutura visual |
| Tema | `Color`, `Palette`, `Theme` | Cores e tokens semanticos |
| Fonte | `Font` | Familia, tamanho e peso |
| Componente | `Component` | Unidade de estado, renderizacao e ciclo de vida |
| Navegacao | `Router` | `route`, `go`, `replace`, `back`, `forward`, `param`, `current`, `depth` |

---

## 5. Component model

O `Component` e o no de composicao da UI. Ele concentra:

- estado local;
- funcao de view;
- lifecycle;
- efeitos com cleanup;
- invalidacao;
- reconciliacao de renderizacao.

Padrao recomendado:

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

O estado deve viver no componente sempre que possivel. Evite espalhar estado
em campos estaticos globais quando a mudanca pertence a uma tela ou parte da
arvore de UI.

---

## 6. Navegacao

A navegacao deve usar `Router` quando a UI tiver mais de uma tela.

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

## 7. Aplicacao ao Organiza IA

| Necessidade do Organiza IA | Padrao correto em KOF |
|---|---|
| Tela inicial | `Window` + `Component("App")` |
| Layout de tarefas | `Column`, `Row`, `Box`, `Grid`, `Scroll` quando disponivel |
| Estado da tela | `Component.state(...)` |
| Eventos de botao/input | handlers registrados no componente/widget |
| Troca de telas | `Router.go`, `Router.replace`, `Router.back` |
| Tema visual | `Theme`, `Palette`, `Color`, tokens semanticos |
| Execucao visual | alvo KofJS/webview |
| Compatibilidade JVM | UI compila no ecossistema KOF/JVM; runtime visual e KofJS |

---

## 8. Decisao documental

Este documento usa somente o Kof4j UI como referencia de frontend. Qualquer
link, exemplo ou explicacao de UI deve apontar para:

```text
https://github.com/KofLang/Kof4j/tree/main/docs/ui
```

Para detalhes de arquitetura, consulte:

```text
https://github.com/KofLang/Kof4j/blob/main/docs/ui/architecture.md
```

Commit sugerido:

```text
docs(ui): corrige referencia de frontend para Kof4j UI
```
