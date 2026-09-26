# Specification: MVP 1 Execution Plan — KofLith Full-Stack & Design System Triad

**Feature**: `mvp1-koflith-attack`
**Status**: Approved
**Baseline**: KofLith Monolith (`backend/*.kf` 100% E2E GREEN on port 3000; Legacy Java archived in `archive/legacy-backend-java/`, Issue #37 closed)
**Design System Sources of Truth**:
- **Design System (Tokens, Tipografia, Componentes & Notificações):** [https://claude.ai/artifact/JVjueTmHeJsnHLsow3LDVb](https://claude.ai/artifact/JVjueTmHeJsnHLsow3LDVb)
- **Desktop Prototype (Web / KofJS Responsivo):** [https://claude.ai/artifact/64FYjX5UiveVxTtRGYurQP](https://claude.ai/artifact/64FYjX5UiveVxTtRGYurQP)
- **Mobile Prototype (Viewport 360×640 Canônico):** [https://claude.ai/artifact/8b3jFV4BrGj4YkDQAwDvDF](https://claude.ai/artifact/8b3jFV4BrGj4YkDQAwDvDF)
- **Local Reference:** [`DESIGN_SYSTEM.md`](../../../DESIGN_SYSTEM.md)

---

## 1. Context & Problem Statement

O Organiza IA concluiu a transição arquitetural do backend para o padrão **KofLith** (`backend/models.kf`, `backend/services.kf`, `backend/coach.kf`, `backend/auth.kf`, `backend/main.kf`), validado por 9 testes E2E na porta 3000 (`scripts/test_e2e_flow.ps1`) e 5 testes de paridade diferencial (`tests/parity_test.kf`), com o legado Java arquivado em `archive/legacy-backend-java/`.

No frontend (`frontend/`), a auditoria contra o corpus oficial `training/` do compilador `Kof4j` expurgou componentes alucinados (`Router`, `Component`, `Spacer`) no commit `5d58ca9150`, estabelecendo uma baseline limpa (`frontend/main.kf` e `frontend/core/theme.kf`) que compila em `--target=js`.

O objetivo desta especificação é guiar a construção completa, modular e integrada do **MVP 1** (`frontend/*.kf` conectado ao `backend/main.kf` na porta 3000), respeitando 100% os 3 artefatos finais do Design System (Design System, Desktop e Mobile) e as regras do corpus `Kof4j/training/`.

---

## 2. Requirements & Acceptance Criteria (EARS Notation)

### REQ-MVP1-01: Tokens Visuais & Workaround de Cores Estáticas no KofJS
- **AC-01.1 (Ubiquitous):** The `frontend/core/theme.kf` module SHALL expose top-level functions returning `Color` and `Style` tokens matching the official Design System (`#0A0D18` background `Color(10, 13, 24)`, `#12162A` card `Color(18, 22, 42)`, `#1A1F3A` cardSecondary `Color(26, 31, 58)`, `#00D4FF` accent cyan `Color(0, 212, 255)`, `#0066FF` accent2 `Color(0, 102, 255)`, `#F0F0F0` textPrimary `Color(240, 240, 240)`, `#7B8EAD` textSecondary `Color(123, 142, 173)`, `#4A5578` textMuted `Color(74, 85, 120)`, `#00E5A0` success, `#FFB800` warning, `#FF4A6E` danger).
- **AC-01.2 (Unwanted-behavior):** IF a UI widget in `frontend/` requires a `Color` or `Style`, THEN it SHALL call a top-level function (e.g. `colorBgPrimary()`, `colorAccent()`) or instantiate `Color(r, g, b)` inline rather than reading uninitialized `static Color` fields in `Default.mjs`.

### REQ-MVP1-02: Gerenciamento de Estado & Navegação Multi-Tela (`AppState`)
- **AC-02.1 (Ubiquitous):** The `frontend/core/app_state.kf` module SHALL store mutable session, navigation (`currentScreen`), viewport mode (`isDesktop` — Mobile `360×640` vs Desktop `1280×800`), onboarding inputs, dashboard metrics, envelopes, and chat messages exclusively in `static` fields of state classes (`AppState`, `SessionState`, `OnboardingState`, `DashboardState`, `ChatState`).
- **AC-02.2 (Event-driven):** WHEN `navigateTo(Window w, String screenName)` is invoked, THEN the system SHALL update `AppState.currentScreen = screenName` and re-bind the active root `View` on `Window w` via `w.bind(view)` without invoking non-existent `Router.*` or `Component.*` APIs.

### REQ-MVP1-03: Cliente HTTP KofLith (`frontend/core/api_client.kf`)
- **AC-03.1 (Event-driven):** WHEN the frontend communicates with `http://localhost:3000`, THEN `frontend/core/api_client.kf` SHALL call `http.get(url, headers)` and `http.post(url, body, headers)` passing headers as a newline-separated `String` (`"Authorization: Bearer " + SessionState.token + "\nContent-Type: application/json"`) and treating the return value as a raw `String`.

### REQ-MVP1-04: Fluxo de Boas-Vindas e Autenticação (Telas 1, 2 e 3)
- **AC-04.1 (State-driven):** WHILE `SessionState.token == ""`, the system SHALL render Tela 1 (Boas-vindas com slogan `"SUA GRANA ORGANIZADA E SEM ESTRESSE."` e botões `"Criar conta"` / `"Já tenho conta"`), Tela 2 (Login) ou Tela 3 (Cadastro) com blocos de cabeçalho alinhados.
- **AC-04.2 (Event-driven):** WHEN the user submits valid credentials on Login (`/api/auth/login`) or Register (`/api/auth/register`), THEN the system SHALL store the returned JWT in `SessionState.token` and transition to Onboarding (Tela 4) or Dashboard (Tela 8).

### REQ-MVP1-05: Fluxo de Onboarding Adaptativo (Telas 4, 5, 6, 6.1 e 7 — Issue #33)
- **AC-05.1 (Event-driven):** WHEN the user progresses through Tela 4 (Salário `"Quanto você ganha por mês?"`), Tela 5 (Tipo de Renda Fixa/Variável — botão `"Próximo"` desabilitado até seleção), Tela 6 (Dívidas em atraso), e condicional Tela 6.1 (`hasDebt == true` → Valor da Dívida `debtAmount`), THEN the system SHALL submit `POST /api/users/onboarding` and parse `suggestedModel|description|buckets`.
- **AC-05.2 (Event-driven):** WHEN `POST /api/users/onboarding` responds, THEN Tela 7 (Resultado) SHALL display the suggested model title (e.g., `"Seu modelo: Anti-Dívida"` ou `"Seu modelo: 50/30/20"`), explanation, and the 3 bucket progress bars before `"Começar a organizar"` opens Tela 8.

### REQ-MVP1-06: Dashboard Principal, Pulso Diário e Gráfico de Pizza via Canvas (Tela 8 — Issue #32)
- **AC-06.1 (Event-driven):** WHEN Tela 8 (Dashboard) mounts, THEN it SHALL fetch `GET /api/budgets/daily-pulse`, `GET /api/envelopes`, and `GET /api/transactions`, rendering the Daily Pulse card (`"Você pode gastar hoje"`, valor em cyan `#00D4FF`, dias restantes e dica de economia), the 200px Pie Chart via `Canvas(200, 200)` (`setFill -> beginPath -> moveTo -> arc -> closePath -> fill`) with threshold colors (`<80%` normal, `80–99%` `#FFB800` warning, `≥100%` `#FF4A6E` danger), and the recent transactions list.

### REQ-MVP1-07: Motor Conversacional do AI Coach (Tela 9 — Issue #34)
- **AC-07.1 (Event-driven):** WHEN the user sends a message in Tela 9 (Chat), THEN the system SHALL append the user bubble (aligned right, cyan `#00D4FF`, text `#06121C`), call `POST /api/chat/message`, append the AI Coach reply bubble (aligned left, `#1A1F3A`, text `#F0F0F0`) grounded in the user's real Daily Pulse and envelopes, and update `DashboardState`.

### REQ-MVP1-08: Caixinhas / Envelopes & Catálogo de Notificações (Telas 10 e 11 — Issue #11)
- **AC-08.1 (State-driven):** WHILE on Tela 10 (Caixinhas), the system SHALL group envelopes by macro bucket (Necessidades, Desejos, Futuro) with category colors (`Moradia #7C8CFF`, `Mercado #2DD4BF`, `Transporte #38BDF8`, `Delivery #A78BFA`, `Lazer #F472B6`, `Reserva #A3E635`), progress bars in 3 state colors (`#00D4FF`, `#FFB800`, `#FF4A6E`), and allow creating new envelopes (`POST /api/envelopes`) plus previewing the Push Notification Toast (Tela 11) when any envelope is ≥80%.

---

## 3. Edge Cases & Constraints
1. **Zero `[]` Indexing (`SEM054`):** Every `List<T>` access in `.kf` MUST use `.get(i)`, never `list[i]`.
2. **Strict Null Safety (`SEM048`):** Variables cannot be initialized to `= null` without explicit nullable type annotation (`String? x = null`).
3. **JVM ASM Frame Crash (`COMP002` / Issue #41):** Keep UI builder functions modular (< 35 lines per helper function) so neither the KofJS backend nor the JVM bytecode generator overflows local frame slots.
4. **Monetary Formatting (CLAUDE.md Rule 8):** Format currency strings cleanly (`"R$ 1.640,00"`) via helper functions without floating-point representation artifacts (`1640.00000001`).
5. **Git & AI Governance:** Zero automatic commits, zero automatic pushes, zero `Co-authored-by:`, zero files created in the project root.
