# KOF_REFERENCE.md -- Referencia Tecnica para IA

> Este documento orienta modelos de linguagem (Claude Code, etc.) a escrever
> codigo KOF correto para o projeto Organiza IA. Baseado na documentacao
> oficial do KOF 0.2.0-beta e no capitulo 35 (kof.ui) do curso.

---

## 1. Linguagem KOF -- Fundamentos

### Tipos primitivos
```kof
Int          // inteiro
Float        // ponto flutuante
String       // texto (imutavel)
Boolean      // true / false
```

### Variaveis
```kof
var x = 10              // mutavel
val y = "constante"     // imutavel (se suportado; usar var por padrao)
```

### Funcoes
```kof
soma(Int a, Int b) -> Int {
    return a + b
}

// Sem retorno
imprime(String msg) {
    println(msg)
}
```

### Classes
```kof
class User(String name, String email)

// Uso:
var u = User("Luiza", "luiza@email.com")
println(u.name)
```

### Records (dados imutaveis)
```kof
record Transaction(Float amount, String category, String description)
```

### Enums
```kof
// Comparacao com == por conteudo
// Switch exaustivo
```

### Colecoes
```kof
var list = listOf("a", "b", "c")
list.map((item) -> item + "!")
list.filter((item) -> item != "b")
list.reduce((acc, item) -> acc + item)
```

### Lambdas
```kof
var fn = () -> println("acao")
var soma = (Int a, Int b) -> a + b

// Com captura (foto somente-leitura do escopo externo)
var nome = "Kof"
var saudacao = () -> println("Ola " + nome)
```

### Null safety
```kof
String? nullable = null     // tipo anulavel com ?
```

### Heranca e interfaces
```kof
class Animal(String nome)
class Cachorro(String nome, String raca) : Animal(nome)

interface Falante {
    falar() -> String
}
```

---

## 2. kof.web -- Servidor HTTP (BFF)

> Fonte: `KOF_WEB_REFERENCE.md`, gerado a partir de `training/` do repositorio
> [KofLang/Kof4j](https://github.com/KofLang/Kof4j) e verificado contra o
> codigo-fonte do compilador (`KofWeb.java`, `KofHttp.java`). Versao 0.2.6-beta.

### Criar servidor
```kof
main() {
    var app = web.app()

    app.get("/users") { return json.encode(users) }
    app.get("/users/:id") { return param("id") }
    app.post("/users") { var u = json.decode<User>(body()); return json.encode(u) }
    app.put("/users/:id") { return "atualizado" }
    app.delete("/users/:id") { return "removido" }
    app.patch("/users/:id") { return "parcial" }
    app.options("/users") { return "" }

    app.use { /* logica de middleware */ }
    app.ws("/chat") { wsSend("echo: " + wsMessage()) }
    app.sse("/events") { sse.send("tick"); sse.event("ev", "dados"); sse.close() }

    app.listen(8080)
    app.listenSecure(8443)   // TLS
}
```

Metodos de rota confirmados: `get, post, put, delete, patch, options, ws, sse`
-- todos os seis verbos HTTP existem em `app.*`, nao apenas `get`/`post`.
Assinatura `(path: String, handler: () -> String)`, exceto `ws`/`sse` que tem
protocolo proprio (`wsSend`/`wsMessage`, `sse.send/event/close`).
Suportado na JVM (`kof serve` / `kof run` target JVM); Native/JS reportam
gaps (`WEB001`-`WEB004`).

### Funcoes disponiveis nas rotas
```kof
body()                     // corpo da requisicao (String), 0 args
param("id")                // path parameter (:id), String
header("Authorization")    // header HTTP, String
query("page")              // query string (?page=1), String
method()                   // verbo HTTP da requisicao, String
path()                     // path da requisicao, String

status(201, json.encode(u))       // define status code E retorna o body -- usar em return
headerSet("X-Custom", "value")    // define header de resposta customizado
```

**IMPORTANTE:** `header("Authorization")` retorna `null` (nao `""`) quando o
header nao existe -- confirmado rodando o BFF real. Verificar sempre com
`token == null || token == ""`, nunca so `token == ""`.

### Middleware
```kof
app.use { /* logica de middleware */ }
```

### JSON
```kof
record User(String name, Int age)

// Serializar
var jsonStr = json.encode(User("Mel", 25))

// Deserializar
var user = json.decode<User>(jsonString)
```

### HTTP Client
```kof
// GET -- retorna String pura (corpo da resposta), NAO um objeto com .body
var resposta = http.get("https://api.example.com/data")

// GET com headers -- headers e uma String "Nome: valor", nunca um mapa
var pagina = http.get(url, "Accept: text/html")

// POST
var resposta = http.post("https://api.example.com/data", jsonBody)

// POST com headers
var resposta = http.post(url, jsonBody, "Content-Type: application/json")

// PUT / DELETE / PATCH -- existem, mesma forma de get/post
var resposta = http.put(url, jsonBody, "Authorization: " + token)
var resposta = http.delete(url, "Authorization: " + token)
var resposta = http.patch(url, jsonBody, "Authorization: " + token)

// Status HTTP de uma URL (chamada GET separada, retorna Int)
if (http.status(url) == 404) { }

// Resiliencia
http.timeout(30)     // ms, timeout global
http.retry(3)        // repete em excecao + HTTP 5xx
http.circuit(5)      // abre circuito apos N falhas por 30s; circuit(0) recupera
```

Verbos confirmados no dispatch table do compilador:
`get/post/put/delete/patch/options` + `status/timeout/retry/circuit`.
`get/delete/options` aceitam 1 arg (url) ou 2 (url, headers);
`post/put/patch` aceitam 2 args (url, body) ou 3 (url, body, headers).
Todos retornam `String` -- **nunca** um objeto de resposta com
`.body`/`.status`/`.headers`.

### Headers -- sintaxe confirmada

Headers sao uma unica `String`, uma linha `Nome: valor` por header:

```kof
var headers = "Authorization: " + token + "\nContent-Type: application/json"
var resp = http.post(url, body(), headers)
```

Nao existe sintaxe de mapa/objeto para headers (`headers: {"Authorization": token}`)
-- essa forma nao compila.

### Rodar
```bash
kof serve main.kf --port 3000
```

---

## 3. kof.ui -- Interface Grafica

### IMPORTANTE: Paradigma de renderizacao
- kof.ui compila para KofJS (ES Modules)
- Renderiza no webview nativo (WebKitGTK/Android WebView) ou browser
- Compilar com: `kof run --target=js arquivo.kf`
- JVM e Native: handles sao no-ops (nao renderizam)

### Window (container raiz)
```kof
var w = Window("Titulo da Janela")
w.title = "Novo Titulo"          // bind do titulo
w.size(360, 640)                 // largura x altura (mobile: 360x640)
w.theme = Theme.dark()           // aplica tema
w.bind(widget)                   // monta widget na janela
w.show()                         // exibe
w.close()                        // fecha
```

### Label (texto)
```kof
var l = Label("Texto visivel")
l.text = "Texto atualizado"     // bind reativo
l.fontSize = 18                  // tamanho em px
l.bold = true                    // negrito
l.color = Palette.white          // cor do texto
l.text()                         // le o texto atual
l.remove()                       // remove da arvore
```

### Button (botao com acao)
```kof
var b = Button("Texto do botao", () -> {
    // acao ao clicar
    println("clicou")
})
b.text = "Novo texto"           // atualiza label
```

### Input (campo de texto editavel)
```kof
var i = Input("placeholder")
i.text = "valor inicial"        // bind do valor
i.text()                         // le valor digitado pelo usuario
i.remove()                       // remove da arvore
```

### Column (layout vertical)
```kof
var col = Column(listOf(label1, label2, button1))
// Empilha widgets verticalmente
```

### Row (layout horizontal)
```kof
var row = Row(listOf(btn1, btn2, btn3))
// Alinha widgets horizontalmente
```

### View (container estilizado)
```kof
var style = Style(
    Palette.black,    // background
    Palette.white,    // foreground (texto)
    16,               // padding (px)
    8                  // border-radius (px)
)

var view = View(style)
view.bind(col)        // monta Column/Row/widget dentro
```

### Color
```kof
var c = Color(255, 0, 0)                // RGB (alpha=255)
var c2 = Color.rgba(10, 20, 30, 128)    // RGBA
var c3 = Color(0xFF0000FF)              // hex empacotado

c.red()          // 255
c.isOpaque()     // true
c.withAlpha(64)  // nova cor com alpha 64
c.toCss()        // "rgba(255, 0, 0, 255)"
```

### Palette (cores nomeadas)
```kof
Palette.red
Palette.green
Palette.blue
Palette.yellow
Palette.cyan
Palette.magenta
Palette.black
Palette.white
Palette.gray
Palette.orange
Palette.purple
Palette.pink
Palette.brown
Palette.transparent
```

### Theme
```kof
var dark = Theme.dark()
var light = Theme.light()

dark.isDark()         // true
dark.background()     // Color (rgb(18, 18, 18))
dark.primary()        // Color
```

### Composicao hierarquica (arvore de widgets)
```kof
// Padrao de montagem:
// Window > View(Style) > Column/Row > widgets

main() {
    var w = Window("Organiza IA")
    w.size(360, 640)
    w.theme = Theme.dark()

    // Widgets
    var titulo = Label("Organiza IA")
    titulo.fontSize = 24
    titulo.bold = true
    titulo.color = Theme.dark().primary()

    var input = Input("Quanto voce ganha?")
    var btn = Button("Comecar", () -> {
        var salario = input.text()
        println("Salario: " + salario)
    })

    // Layout
    var col = Column(listOf(titulo, input, btn))

    // Container com estilo
    var style = Style(
        Theme.dark().background(),
        Palette.white,
        24,
        0
    )
    var container = View(style)
    container.bind(col)

    // Montar na janela
    w.bind(container)
    w.show()
}
```

---

## 4. Padrao de estado (State Management)

KOF usa campos estaticos de classe para estado mutavel entre interacoes:

```kof
class ChatState {
    static String lastReply = ""
    static Int messageCount = 0
    static Float dailyPulse = 0.0
}

// Lambda captura foto somente-leitura do escopo
// Para mutar: acessar campos estaticos
Button("Enviar", () -> {
    ChatState.messageCount = ChatState.messageCount + 1
    label.text = "Mensagens: " + ChatState.messageCount
})
```

### Padrao recomendado para telas

```kof
// Cada tela tem sua classe de estado
class OnboardingState {
    static String salary = ""
    static Boolean completed = false
}

class DashboardState {
    static Float needsSpent = 0.0
    static Float wantsSpent = 0.0
    static Float savingsSpent = 0.0
    static Float dailyPulse = 0.0
}
```

---

## 5. Simulacao de navegacao entre telas

kof.ui tem uma unica Window. Para simular navegacao, usar o padrao
show/hide com Views:

```kof
class NavState {
    static String currentScreen = "onboarding"
}

main() {
    var w = Window("Organiza IA")
    w.size(360, 640)
    w.theme = Theme.dark()

    // Montar todas as telas como Views
    // Controlar visibilidade via NavState
    // Cada botao de navegacao atualiza NavState.currentScreen
    // e reconstroi a arvore de widgets
}
```

---

## 6. O que NAO fazer (limites atuais)

### NAO disponivel em kof.ui (ate API Mobile chegar)
- NAO usar Image (nao existe widget de imagem)
- NAO assumir ListView scrollavel (usar Column com itens limitados)
- NAO assumir BottomNavigationBar nativo (construir com Row + Buttons)
- NAO assumir Dialog/Modal nativo (construir com View overlay)
- NAO assumir animacoes/transicoes (CSS transitions futuras)
- NAO tentar acessar APIs nativas do device (camera, mic, GPS) pelo kof.ui
  -- essas virao via API Mobile

### NAO confundir targets
- `kof run arquivo.kf` -> roda na JVM (UI nao renderiza)
- `kof run --target=js arquivo.kf` -> compila para JS e abre no webview (UI FUNCIONA)
- `kof serve arquivo.kf` -> levanta servidor HTTP (BFF, sem UI)

### NAO inventar sintaxe de kof.web / kof.http (confirmado no compilador)
- NAO declarar funcao nomeada com `foo() -> Tipo { }` -- essa e sintaxe de
  **lambda**. Funcao nomeada e `foo(): Tipo { }` ou `Tipo foo() { }`
  (ex.: `add(Int a, Int b): Int { return a + b }`).
- NAO tratar o retorno de `http.get/post/put/delete/patch/options` como
  objeto (`response.body`, `response.status`) -- e uma `String` pura com o
  corpo da resposta.
- NAO passar headers como mapa/objeto nomeado
  (`headers: {"Authorization": token}`) -- headers e uma unica `String`
  `"Nome: valor"` (multiplos headers: linhas separadas por `\n`).
- NAO checar `header("Authorization")` so com `== ""` para detectar
  ausencia -- o runtime retorna `null` quando o header nao existe; checar
  `token == null || token == ""`.
- NAO evitar `app.put`/`app.delete`/`http.put`/`http.delete` achando que nao
  existem -- os seis verbos (`get/post/put/delete/patch/options`) existem
  tanto em `app.*` (rotas) quanto em `http.*` (client).
- NAO inventar `Thread`/`Executor` -- usar `spawn`/`await` com `Handle<T>`.
- NAO usar `Option<T>` generico -- usar `String?`/`Int?`.
- NAO usar array literais `[1,2,3]`/`{1,2,3}` -- usar `new Int[n]` ou `listOf(...)`.
- NAO usar `for (x in xs)` sem `var` -- precisa ser `for (var x in xs)`.

### NAO mutar estado via closure
```kof
// ERRADO: var local nao muta entre cliques
var count = 0
Button("+1", () -> {
    count = count + 1    // NAO funciona -- captura foto
})

// CERTO: campo estatico muta entre cliques
class S { static Int count = 0 }
Button("+1", () -> {
    S.count = S.count + 1    // funciona
    label.text = "" + S.count
})
```

---

## 7. Fluxo de desenvolvimento

```bash
# 1. Editar .kf
# 2. Testar UI:
kof run --target=js frontend/main.kf

# 3. Testar BFF:
kof serve bff/main.kf --port 3000

# 4. Testar backend:
./gradlew bootRun

# 5. Stack completa rodando:
#    - kof.ui no webview (porta nenhuma, abre direto)
#    - kof.web BFF em localhost:3000
#    - Spring Boot em localhost:8080
```

---

## 8. Checklist de validacao para cada tela

Ao implementar uma tela em kof.ui, validar:

- [ ] Window com tamanho mobile (360x640)
- [ ] Theme.dark() aplicado
- [ ] Todos os textos visiveis com fontSize e color definidos
- [ ] Inputs com placeholder descritivo
- [ ] Buttons com lambda funcional (usando campos estaticos para estado)
- [ ] Layout montado hierarquicamente: Window > View(Style) > Column/Row > widgets
- [ ] Compilar com `kof run --target=js` e verificar no webview
