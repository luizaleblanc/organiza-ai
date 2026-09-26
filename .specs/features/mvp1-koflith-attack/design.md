# Design: MVP 1 KofLith Full-Stack & Design System Triad (Desk + Mobile)

**Feature**: `mvp1-koflith-attack`
**Spec**: `.specs/features/mvp1-koflith-attack/spec.md`
**Design System Artifacts**:
- **Design System:** [https://claude.ai/artifact/JVjueTmHeJsnHLsow3LDVb](https://claude.ai/artifact/JVjueTmHeJsnHLsow3LDVb)
- **Desktop:** [https://claude.ai/artifact/64FYjX5UiveVxTtRGYurQP](https://claude.ai/artifact/64FYjX5UiveVxTtRGYurQP)
- **Mobile:** [https://claude.ai/artifact/8b3jFV4BrGj4YkDQAwDvDF](https://claude.ai/artifact/8b3jFV4BrGj4YkDQAwDvDF)

---

## 1. Arquitetura Monolítica Modular KofLith (`backend/` + `frontend/`)

O projeto se trata especificamente de uma **Arquitetura Monolítica Modular**: uma única unidade de deploy na plataforma Kof (JVM + KofJS) organizada internamente em módulos de domínio coesos (`backend/*.kf`) e módulos de interface bem delimitados (`frontend/core/`, `frontend/components/`, `frontend/screens/`).

```mermaid
flowchart LR
    subgraph Frontend ["Frontend KofUI (kof run --target=js frontend/main.kf)"]
        W["Window (Mobile 360x640 | Desk 1280x800)"]
        AS["AppState / SessionState / DashboardState (static fields)"]
        TH["core/theme.kf (Top-Level Color & Style Functions)"]
        API["core/api_client.kf (kof.http -> String)"]
        SC["11 Telas + Componentes (View, Column, Row, Label, Button, Input)"]
        W --> SC
        SC --> AS
        SC --> TH
        SC --> API
    end

    subgraph Backend ["Monólito KofLith (kof serve backend/main.kf --port 3000)"]
        GW["backend/main.kf (web.app() :3000)"]
        AU["backend/auth.kf (JWT HS256)"]
        SV["backend/services.kf (User, Envelope, Transaction, VariableIncome, Tier)"]
        CO["backend/coach.kf (DailyPulse, Balance, SuggestModel, Kakeibo)"]
        MD["backend/models.kf (Entities, Enums & Records)"]
        GW --> AU
        GW --> SV
        GW --> CO
        SV --> MD
        CO --> MD
    end

    API -- "HTTP + Bearer JWT (porta 3000)" --> GW
```

---

## 2. Decisões Técnicas Baseadas no Corpus `KofLang/Kof4j/training`

### 2.1. Firewall Anti-Alucinação KOF (`training/anti-patterns/fake-idioms.md`, `training/language/`, `training/idioms/`)
| Conceito | ❌ Proibido (Alucinação Comum) | ✅ Padrão Oficial `Kof4j/training/` |
|---|---|---|
| Declaração de função | `fun foo()`, `fn foo()`, `foo() -> String {}` | `String foo(Int a) { ... }` ou `foo(Int a): String { ... }` |
| Acesso a `List<T>` | `lista[0]` (Erro `SEM054` no Kof 0.4.x) | `lista.get(0)` |
| Iteração `for` | `for (x in xs)` (sem `var`) | `for (var x in xs) { ... }` |
| Inicialização nula | `String s = null` (Erro `SEM048`) | `String? s = null` (com narrowing `if (s != null)`) ou `""` |
| Parâmetros de função | `var db`, `var w` na assinatura | Sempre tipo explícito: `Window w`, `String s`, `Double v` |
| Estado de UI em Lambdas | `var count = 0` mutado dentro de `() -> {}` | `class AppState { static Int count = 0 }` |
| Cores Estáticas no KofJS | `AppTheme.bgPrimary` (`undefined` no `Default.mjs`) | Funções top-level: `Color colorBgPrimary() = Color(10, 13, 24)` |
| Navegação entre telas | `Router.go()`, `Router.push()`, `Component()` | `AppState.currentScreen = "..."` + `window.bind(buildActiveScreen(window))` |
| HTTP Client (`kof.http`) | `resp.body`, `resp.status`, `headers: {...}` | `String body = http.post(url, payload, "Authorization: Bearer " + tok)` |
| Exceções (`training/idioms/errors.md`) | `catch (Exception e)` | `throw "Erro"` / `catch (String e)` |
| Segurança (`training/language/security.md`) | `sha256(pwd)`, `tok1 == tok2` | `passwords.hash(pwd)`, `security.constantTimeEquals(a, b)` |

### 2.2. Estratégia Híbrida de Gráficos e Ondas (`View`/`Row` 100% Portável + `Canvas` Opcional 0.4.x)
- **Contexto Real do Repositório**: Em `frontend/main.kf` (commit `5d58ca9150`), constatou-se que `kof check` na versão `0.3.1-beta` rejeita `Router`, `Component`, `Spacer` e `Canvas` se o binário local ainda não estiver na `0.4.0-beta+`.
- **Solução Arquitetural**:
  1. Os módulos `frontend/components/navigation_chrome.kf` e `frontend/components/visual_widgets.kf` constroem o Logomark (3 ondas empilhadas com opacidade `1.0 / 0.7 / 0.45`) e o Gráfico de Buckets (`Necessidades`, `Desejos`, `Futuro`) usando composições puras de `Row` + `View(Style)` + `Label` como caminho primário 100% garantido no `kof check` (`0.3.x` e `0.4.x`), mantendo um helper isolado para `Canvas(200, 200)` (`setFill -> beginPath -> moveTo -> arc -> closePath -> fill`) quando executado no runtime `0.4.0-beta+`.

### 2.3. Dual Viewport: Mobile (`360×640`) & Desktop (`1280×800`)
- **Mobile (`8b3jFV4BrGj4YkDQAwDvDF`)**: Layout vertical `360×640` com `StatusBar` superior, conteúdo central em `Column` e `NavBar` inferior fixa (`Dashboard`, `Chat`, `Caixinhas`).
- **Desktop (`64FYjX5UiveVxTtRGYurQP`)**: Layout horizontal `1280×800` usando `Row(listOf(sidebarView, mainContentView, rightCoachPanelView))`, permitindo alternar em tempo real entre o modo Mobile (`360×640`) e o modo Desktop (`1280×800`) através do botão de alternância no cabeçalho (`AppState.isDesktop`), compartilhando os mesmos builders e estado reativo.

### 2.4. Árvore Modular de Arquivos (`frontend/` — 1 Arquivo por Tarefa Atômica)
```text
frontend/
  main.kf                         # T13: Entrypoint Window + Dispatcher Mobile (360x640) / Desktop (1280x800)
  core/
    theme.kf                      # T1: Funções top-level de Color e Style (Design System JVjueTmHeJsnHLsow3LDVb)
    app_state.kf                  # T2: Classes estáticas: AppState, SessionState, OnboardingState, DashboardState, ChatState
    api_client.kf                 # T3: Integração HTTP com KofLith (:3000) + parsers de String/JSON + fallback offline
  components/
    navigation_chrome.kf          # T4: Logomark 3 ondas + toggle Mobile/Desk + NavBar inferior (Mobile) & Sidebar (Desk)
    cards.kf                      # T5: PulseCard, EnvelopeCard (3 estados: normal/alerta/perigo), TransactionCard e ChatBubble
    visual_widgets.kf             # T6: Bucket Chart interativo + NotificationToast (5 modelos oficiais da Tela 11)
  screens/
    auth_screens.kf               # T7: Telas 1 (Boas-vindas), 2 (Login) e 3 (Cadastro)
    onboarding_steps_screens.kf   # T8: Telas 4 (Salário), 5 (Tipo de Renda), 6 (Dívidas) e 6.1 (Valor da Dívida)
    onboarding_result_screen.kf   # T9: Tela 7 (Resultado do Onboarding + Seletor de 6 Modelos Adaptativos — #11 e #33)
    dashboard_screen.kf           # T10: Tela 8 (Dashboard Mobile + Visão Expandida Desktop — #32)
    chat_screen.kf                # T11: Tela 9 (AI Coach Conversacional conectado a /api/chat/message — #34)
    envelopes_screen.kf           # T12: Tela 10 (Caixinhas agrupadas por Bucket + Overlay Tela 11 Notificação Push)
```
