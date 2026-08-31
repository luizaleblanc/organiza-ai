# CLAUDE.md -- Organiza IA

## Projeto
Coach financeiro com IA conversacional. KOF full-stack no frontend.
O usuario informa o salario, registra gastos via chat natural, e recebe orientacao financeira proativa.
Modelo: hibrido 50/30/20 + Envelopes personalizaveis. Monetizacao freemium.

## Stack

### Frontend + BFF: KOF (linguagem compilada para JVM)
- Linguagem: Kof (.kf) -- estaticamente tipada, compilada, zero cerimonia
- UI: kof.ui (Window, Label, Button, Input, Column, Row, View, Style, Color, Theme)
- Renderizacao: KofJS -> ES Modules -> webview nativo (WebKitGTK desktop, Android WebView mobile)
- BFF: kof.web (web.app(), rotas, middleware, JSON tipado, HTTP server embutido)
- Compilador: kof-cli (kof run, kof build, kof serve)
- Documentacao: https://koflang.github.io/docs
- Repositorio: https://github.com/KofLang/Kof4j

### Backend: Java/Spring Boot
- Java 17, Spring Boot 3.3.x, Spring AI (GPT-4o-mini)
- MySQL (Aiven), Redis (cache)
- Build: Gradle (./gradlew)
- Arquitetura: monolito modular

## Comandos

### KOF
- Compilar e rodar: `kof run arquivo.kf`
- Rodar com target JS (UI): `kof run --target=js arquivo.kf`
- Servir como web server: `kof serve arquivo.kf --port 3000`
- Build: `kof build arquivo.kf --target=jvm`
- Info: `kof info`
- Testes: `kof test`

### Backend
- Rodar: `./gradlew bootRun`
- Testes: `./gradlew test`
- Build: `./gradlew build`

## Arquitetura

```
┌─────────────────────────────────┐
│  KOF Frontend (kof.ui)          │
│  Target: KofJS -> webview       │
│  Telas: onboarding, chat,      │
│  dashboard, envelopes, config   │
│  Arquivos: frontend/*.kf        │
└────────────┬────────────────────┘
             │ HTTP + JWT
             v
┌─────────────────────────────────┐
│  KOF BFF (kof.web)              │
│  Target: JVM                    │
│  Proxy autenticado + rotas      │
│  Arquivo: bff/main.kf           │
└────────────┬────────────────────┘
             │ HTTP
             v
┌─────────────────────────────────┐
│  Spring Boot (Backend)          │
│  Modulos: auth, user,           │
│  transaction, budget, coach,    │
│  notification, bank-reader      │
│  Spring AI (tool calling)       │
│  MySQL + Redis                  │
└─────────────────────────────────┘
```

## Estrutura do Projeto

```
organiza-ai/
  frontend/                   # KOF UI (kof.ui)
    main.kf                   # Entrypoint: monta Window, rotas de tela
    screens/
      onboarding.kf           # Tela de salario
      chat.kf                 # Chat principal + pulso diario
      dashboard.kf            # Barras de progresso por bucket
      envelopes.kf            # CRUD de envelopes
      history.kf              # Lista de transacoes
      settings.kf             # Configuracoes, perfil
    components/
      pulse_card.kf           # Widget do pulso diario
      bucket_bar.kf           # Barra de progresso de um bucket
      envelope_card.kf        # Card de um envelope
      message_bubble.kf       # Bolha de mensagem do chat
      nav_bar.kf              # Barra de navegacao inferior
    theme/
      app_theme.kf            # Theme.dark(), cores, estilos padrao
    api/
      http_client.kf          # Chamadas HTTP ao BFF (http.get/post)

  bff/                        # KOF BFF (kof.web)
    main.kf                   # web.app() + todas as rotas
    middleware/
      auth.kf                 # Validacao JWT
      cors.kf                 # CORS headers

  src/                        # Backend Spring Boot (Java)
    main/java/com/organiza/
      auth/
      user/
      transaction/
      budget/
      coach/
      notification/
      bankreader/
      shared/

  specs/                      # Specs por fase (versionado no Git)
  CLAUDE.md                   # Este arquivo (local)
  PROJECT_STATUS.md           # Handoff entre sessoes (local)
```

## Referencia Rapida: kof.ui

### Componentes disponiveis

```kof
// Janela (container raiz)
var w = Window("Titulo")
w.title = "Novo Titulo"
w.size(360, 640)
w.theme = Theme.dark()
w.bind(widget)
w.show()

// Label (texto)
var l = Label("texto")
l.text = "atualizado"
l.fontSize = 16
l.bold = true
l.color = Palette.white

// Button (com acao via lambda)
var b = Button("Clique", () -> fazAlgo())
b.text = "Novo texto"

// Input (campo editavel)
var i = Input("placeholder")
i.text = "valor preenchido"
i.text()  // le valor atual

// Layout
var col = Column(listOf(widget1, widget2))   // vertical
var row = Row(listOf(widget1, widget2))       // horizontal

// Estilo e View (container com fundo/padding)
var style = Style(Palette.black, Palette.white, 16, 8)
// Style(background, foreground, padding, radius)
var view = View(style)
view.bind(col)

// Composicao
w.bind(view)  // monta view na janela
```

### Cores e temas

```kof
// Cores por construtor
var c = Color(255, 0, 0)            // RGB (alpha=255)
var c2 = Color.rgba(10, 20, 30, 128) // RGBA

// Cores nomeadas
Palette.red / Palette.green / Palette.blue / Palette.white
Palette.black / Palette.gray / Palette.orange / Palette.purple
Palette.transparent

// Temas
var dark = Theme.dark()
var light = Theme.light()
dark.background()   // Color
dark.primary()      // Color
dark.isDark()       // true
```

### Estado mutavel

```kof
// Estado entre cliques vive em campos estaticos
class AppState {
    static Int count = 0
    static String currentScreen = "chat"
}

// Lambda captura foto somente-leitura do escopo
// Para mutar: usar campos estaticos da classe
w.bind(Button("+1", () -> {
    AppState.count = AppState.count + 1
    label.text = "total: " + AppState.count
}))
```

### Execucao da UI

```bash
# Compilar e abrir no webview
kof run --target=js main.kf

# Fluxo interno:
# 1. Compila para Default.mjs + kof-runtime.mjs
# 2. Executa no runner embarcado (GraalJS)
# 3. Gera index.html + modulos
# 4. Abre no webview nativo (WebKitGTK) ou browser do sistema
```

## Referencia Rapida: kof.web (BFF)

```kof
main() {
    var app = web.app()

    // Rota GET
    app.get("/health") {
        return "OK"
    }

    // Rota com path param
    app.get("/users/:id") {
        return "user " + param("id")
    }

    // Rota POST com JSON
    app.post("/chat/message") {
        var msg = json.decode<MessageRequest>(body())
        // proxy para backend
        var response = http.post("http://localhost:8080/chat/message",
            json.encode(msg))
        return response.body
    }

    app.listen(3000)
}
```

## Convencoes KOF

### Nomeacao
- Arquivos: snake_case.kf (pulse_card.kf, chat_screen.kf)
- Classes: PascalCase (AppState, ChatMessage)
- Funcoes: camelCase (sendMessage, getDailyPulse)
- Constantes: SCREAMING_SNAKE em campos estaticos

### Organizacao de tela
Cada tela e uma funcao que retorna ou monta widgets num Window/View:

```kof
// screens/chat.kf

class ChatState {
    static String lastMessage = ""
}

buildChatScreen(Window w) {
    var input = Input("Digite seu gasto...")
    var messageLabel = Label("")
    messageLabel.fontSize = 14

    var sendBtn = Button("Enviar", () -> {
        ChatState.lastMessage = input.text()
        messageLabel.text = "Enviando: " + ChatState.lastMessage
        // chamar API aqui
    })

    var col = Column(listOf(
        messageLabel,
        input,
        sendBtn
    ))

    var style = Style(Palette.black, Palette.white, 16, 8)
    var view = View(style)
    view.bind(col)
    w.bind(view)
}
```

### Chamadas HTTP (API client)

```kof
// api/http_client.kf

record ChatResponse(String reply, Float dailyPulse)

sendChatMessage(String message) -> ChatResponse {
    var body = json.encode(MessageRequest(message))
    var response = http.post("http://localhost:3000/api/chat/message", body)
    return json.decode<ChatResponse>(response.body)
}
```

## Regras Inviolaveis

1. **Frontend e KOF (kof.ui), nao Flutter, nao React.**
   Toda tela, componente e interacao e escrita em .kf usando kof.ui.

2. **BFF e KOF (kof.web), nao Next.js.**
   O proxy HTTP e servidor BFF e escrito em .kf usando web.app().

3. **Backend permanece Java/Spring Boot.**
   Spring AI, JPA, MySQL, auth -- tudo no backend. KOF nao substitui o backend.

4. **UI roda via KofJS (target JS).**
   Compilar com `kof run --target=js`. Renderiza no webview/browser.
   JVM e Native renderizam no-op (sem UI).

5. **Estado mutavel em campos estaticos de classe.**
   Lambdas capturam foto somente-leitura. Para mutar entre cliques,
   usar campos static da classe de estado (ex: AppState, ChatState).

6. **Composicao e hierarquica: Window > View > Column/Row > widgets.**
   Nao pular niveis. Sempre montar via .bind().

7. **kof.ui NAO tem (ainda):**
   - ListView scrollavel (usar Column com itens fixos por enquanto)
   - Image widget (usar Label como placeholder)
   - Navegacao entre telas (simular via show/hide de Views)
   - BottomNavigationBar (construir com Row + Buttons)
   - Dialog/Modal (construir com View overlay)
   Quando a API Mobile da Melissa entregar esses componentes,
   atualizar esta secao.

8. **Valores monetarios:** usar String formatada ("R$ 1.234,56").
   KOF nao tem BigDecimal -- formatacao vem do backend.

9. **Commits:** `feat(frontend): descricao` | `feat(bff): descricao`

## Fase Atual
Consulte `specs/PHASE_X_*.md` para escopo da fase em andamento.
Consulte `PROJECT_STATUS.md` para estado atual do projeto.
