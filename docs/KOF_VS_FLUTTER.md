# Relatorio Técnico: KOF vs Flutter

> Documento de feedback construtivo para a equipe do KOF.
> Objetivo: mapear lacunas do kof.ui em relação ao Flutter para orientar o
> desenvolvimento do frontend do Organiza IA inteiramente em KOF.
> Gerado em: 30/08/2026

---

## 1. Paradigma de UI

### Flutter: Árvore de widgets declarativa

Flutter usa composição declarativa -- toda UI é uma função que recebe estado e retorna uma árvore de widgets. O framework diff a árvore anterior com a nova e aplica apenas as mudanças no render.

```dart
// Flutter - declarativo, reativo
Widget build(BuildContext context) {
    return Column(children: [
        Text("Contagem: $count"),
        ElevatedButton(
            onPressed: () => setState(() => count++),
            child: Text("+1"),
        ),
    ]);
}
```

### KOF: Montagem imperativa + mutação via bind

kof.ui monta widgets imperativamente e atualiza via atribuição direta de propriedades (`label.text = "novo"`). O webview re-renderiza o DOM. Estado mutável vive em campos estáticos de classe.

```kof
// KOF - imperativo, bind manual
class S { static Int count = 0 }

var label = Label("Contagem: 0")
Button("+1", () -> {
    S.count = S.count + 1
    label.text = "Contagem: " + S.count
})
```

### Gap identificado

| Aspecto | Flutter | KOF (hoje) | Impacto |
|---|---|---|---|
| Reatividade | Automática (setState, BLoC, Provider rebuild a árvore) | Manual (atribuir .text, .color em cada widget) | Propenso a bugs: esquecer de atualizar um widget = UI dessincronizada do estado |
| Composição condicional | `if (loggedIn) DashboardPage() else LoginPage()` inline na árvore | Não existe renderização condicional declarativa | Dificulta navegação e UI dinâmica |
| Rebuild parcial | Framework sabe qual widget mudou e re-renderiza so ele | Atribuição direta modifica o DOM inteiro (depende do webview) | Performance aceitável para apps simples, pode degradar com UIs complexas |

### Sugestao para KOF

Implementar um mecanismo de **binding reativo** onde mudança de estado automaticamente atualiza os widgets dependentes. Algo como:

```kof
// Proposta conceitual
var count = State(0)              // valor observável
var label = Label(count.map((v) -> "Contagem: " + v))
// label.text atualiza automaticamente quando count muda
```

Prioridade: **ALTA** -- sem isso, apps com mais de 5 telas se tornam dificeis de manter.

---

## 2. Componentização e reutilização

### Flutter

```dart
// Widget customizado reutilizável
class BucketProgressBar extends StatelessWidget {
    final String label;
    final double percentage;
    final Color color;

    Widget build(context) => Column(children: [
        Text(label),
        LinearProgressIndicator(value: percentage, color: color),
        Text("${(percentage * 100).toInt()}%"),
    ]);
}

// Uso
BucketProgressBar(label: "Necessidades", percentage: 0.82, color: Colors.red)
```

### KOF (hoje)

```kof
// Função que constroi um grupo de widgets
buildBucketBar(String label, Float percentage) -> View {
    var lbl = Label(label)
    var pct = Label("" + (percentage * 100) + "%")
    var col = Column(listOf(lbl, pct))
    var style = Style(Palette.gray, Palette.white, 8, 4)
    var view = View(style)
    view.bind(col)
    return view
}
```

### Gap identificado

| Aspecto | Flutter | KOF (hoje) | Impacto |
|---|---|---|---|
| Encapsulamento | Widget é uma classe com props tipadas, estado próprio, lifecycle | Função que retorna View -- sem encapsulamento de estado próprio | Cada "componente" depende de estado global (campos estáticos) |
| Props tipadas | Constructor com parametros nomeados, defaults, required | Parametros de função | Funcional mas sem defaults ou named params |
| Lifecycle | initState, dispose, didChangeDependencies | Não existe | Sem cleanup (ex: cancelar timer, fechar stream ao sair da tela) |
| Inheritancia de tema | Theme.of(context) propaga automaticamente pela árvore | Theme aplicado na Window, não acessivel por widget individual | Widgets não "herdam" tema do pai |

### Sugestao para KOF

Implementar um conceito de **Component** (similar a WebComponent ou SwiftUI View):

```kof
// Proposta conceitual
component BucketBar(String label, Float percentage) {
    view() -> View {
        return Column(listOf(
            Label(label),
            ProgressBar(percentage),   // widget novo
            Label("" + (percentage * 100) + "%")
        ))
    }
}
```

Prioridade: **MEDIA** -- funções resolvem pro MVP, mas escala mal em apps grandes.

---

## 3. Widgets ausentes (criticos para mobile)

| Widget | O que faz | Flutter tem | KOF tem | Prioridade |
|---|---|---|---|---|
| **ListView** | Lista scrollável com itens dinamicos | `ListView.builder` com lazy loading | Não | **P0** |
| **Image** | Exibir imagem via URL ou asset | `Image.network()`, `Image.asset()` | Não | **P0** |
| **ProgressBar** | Barra de progresso (linear ou circular) | `LinearProgressIndicator`, `CircularProgressIndicator` | Não | **P0** |
| **BottomNavigationBar** | Tabs na parte inferior da tela | `NavigationBar` | Não | **P0** |
| **AppBar** | Barra superior com título e ações | `AppBar` | Não (so Window.title) | **P1** |
| **Dialog/Modal** | Popup de confirmação/alerta | `showDialog()`, `AlertDialog` | Não | **P1** |
| **Snackbar/Toast** | Feedback visual temporario | `ScaffoldMessenger.showSnackBar()` | Não | **P1** |
| **Checkbox** | Seleção booleana | `Checkbox` | Não | **P2** |
| **Switch** | Toggle on/off | `Switch` | Não | **P2** |
| **Radio** | Seleção unica entre opções | `Radio` | Não | **P2** |
| **Slider** | Seleção numerica por deslizamento | `Slider` | Não | **P2** |
| **Dropdown** | Lista de seleção | `DropdownButton` | Não | **P2** |
| **DatePicker** | Seleção de data | `showDatePicker()` | Não | **P3** |
| **TabBar** | Abas dentro de uma tela | `TabBar` + `TabBarView` | Não | **P2** |
| **Card** | Container com elevação | `Card` | Parcial (View+Style) | -- |

### Sugestao de implementação

Dado que kof.ui renderiza via DOM no webview, cada widget pode ser implementado como HTML/CSS nativo. Exemplo:

```
ProgressBar(0.82) --> <div class="progress"><div style="width:82%"></div></div>
Image("url")      --> <img src="url" />
ListView(items)   --> <div class="scroll-container">...items renderizados...</div>
```

O custo de implementação e relativamente baixo porque o webview ja suporta todos esses elementos nativamente.

---

## 4. Navegação

### Flutter

```dart
// GoRouter - rotas declarativas
GoRouter(routes: [
    GoRoute(path: '/', builder: (_, __) => OnboardingPage()),
    GoRoute(path: '/chat', builder: (_, __) => ChatPage()),
    GoRoute(path: '/dashboard', builder: (_, __) => DashboardPage()),
]);

// Navegar
context.go('/chat');
context.push('/dashboard');
context.pop();
```

### KOF (hoje)

Não existe sistema de rotas. Uma única `Window` é criada. Para "navegar", é necessário remover todos os widgets e montar novos manualmente.

### Gap identificado

| Aspecto | Flutter | KOF (hoje) | Impacto |
|---|---|---|---|
| Rotas | Declarativas com path matching | Não existe | **Bloqueante para qualquer app com mais de 1 tela** |
| Transições | Slide, fade, hero animations entre telas | Não existe | UX mobile sem transição parece desktop |
| Back button (Android) | Tratado automaticamente pelo Navigator | Não existe | Usuário aperta voltar = fecha o app inteiro |
| Deep links | URI scheme registrado no OS | Não existe | Push notification não consegue abrir tela específica |
| Passagem de parametros | Arguments tipados entre rotas | Não existe | Dados entre telas precisam ser globais |

### Sugestao para KOF

Implementar um **Router** mínimo:

```kof
// Proposta conceitual
var router = Router()
router.route("/", () -> buildOnboarding(window))
router.route("/chat", () -> buildChat(window))
router.route("/dashboard", () -> buildDashboard(window))

// Navegar
router.go("/chat")
router.back()
```

Prioridade: **P0** -- sem rotas, não existe app mobile funcional.

---

## 5. APIs de plataforma mobile

Esses são os bridges nativos que a API Mobile precisa expor para o KOF:

| API | Função | Como Flutter resolve | Como KOF pode resolver |
|---|---|---|---|
| **Secure Storage** | Guardar JWT/tokens | Plugin Keychain (iOS) / Keystore (Android) | Bridge nativo: `kof.mobile.secureStore(key, value)` |
| **Microfone** | Gravar audio | MediaRecorder via plugin | Bridge: `kof.mobile.recordAudio()` retorna base64 |
| **Push Notifications** | Receber alertas | Firebase Messaging plugin | Bridge: `kof.mobile.onPush(callback)` |
| **Notification Listener** | Ler pushes de outros apps (bancos) | NotificationListenerService (Android) | Bridge: `kof.mobile.onNotification(callback)` |
| **Permissoes** | Solicitar acesso a mic, notificações | permission_handler plugin | Bridge: `kof.mobile.requestPermission("microphone")` |
| **Biometria** | Fingerprint/face login | local_auth plugin | Bridge: `kof.mobile.authenticate()` |
| **App Lifecycle** | Background/foreground | WidgetsBindingObserver | Bridge: `kof.mobile.onLifecycle(callback)` |
| **Safe Areas** | Evitar notch/barra de status | SafeArea widget | CSS `env(safe-area-inset-*)` no webview |
| **Teclado virtual** | Ajustar layout quando teclado abre | Automático no Scaffold | CSS `visualViewport` API ou bridge |
| **Status Bar** | Cor e estilo da barra de status | SystemChrome | Bridge: `kof.mobile.setStatusBar(color, style)` |
| **Haptics** | Vibração tatil | HapticFeedback | Bridge: `kof.mobile.vibrate()` |

### Modelo de bridge sugerido

```
KOF (.kf) --> KofJS (ES Modules) --> Android WebView
                                          |
                                    postMessage / JavaScriptInterface
                                          |
                                    Kotlin Bridge (API nativa)
                                          |
                                    Android SDK (Camera, FCM, etc.)
```

O webview Android expoe `addJavascriptInterface` que permite chamar metodos Kotlin diretamente do JavaScript. No iOS, `WKScriptMessageHandler` faz o equivalente.

---

## 6. Resumo executivo para a equipe do KOF (https://github.com/KofLang/Kof4j)

### O que KOF ja tem e funciona bem
- Compilação rápida para JVM e JS
- kof.ui com Window, Label, Button, Input, Column, Row, View, Style, Color, Theme
- kof.web com servidor HTTP completo
- Sistema de tipos forte e estático
- Lambdas com captura
- JSON encode/decode
- HTTP client

### Top 5 lacunas para mobile (em ordem de prioridade)

| # | Lacuna | Por que bloqueia | Esforco estimado |
|---|---|---|---|
| 1 | **Router/navegação** | App com mais de 1 tela não funciona sem | Medio |
| 2 | **ListView scrollável** | Qualquer lista de dados (transações, mensagens) precisa de scroll | Baixo (CSS overflow) |
| 3 | **State management reativo** | Atualizar UI manualmente escala mal e gera bugs | Alto |
| 4 | **Target Android (APK)** | Sem APK não entra na Play Store | Alto |
| 5 | **Bridge para APIs nativas** | Mic, push, notificações -- diferenciais do app | Alto |

### O que NÃO precisa ser igual ao Flutter

- **Skia/Impeller engine**: webview e suficiente para apps de dados/formularios. Não precisa renderizar pixels diretamente
- **Hot reload**: recompilação rápida do KOF + refresh do webview cobre 90% do caso
- **Material/Cupertino dualidade**: design unico e tendencia (Nubank, iFood, Notion não seguem guidelines de plataforma)
- **Ecossistema de pacotes (pub.dev)**: para o MVP, os widgets core + bridge nativo cobrem. Ecossistema cresce organicamente

---

*Este documento sera atualizado conforme a API Mobile evoluir.*
