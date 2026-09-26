# MVP 1 Execution Plan — KofLith Full-Stack & Design System Triad Specification

**Feature**: `mvp1-koflith-attack`
**Status**: Approved
**Baseline**: KofLith Monolith (`backend/*.kf` 100% E2E GREEN on port 3000; Legacy Java archived in `archive/legacy-backend-java/`, Issue #37 closed)
**Design System Sources of Truth**:
- **Design System (Tokens, Tipografia, Componentes & Notificações):** [https://claude.ai/artifact/JVjueTmHeJsnHLsow3LDVb](https://claude.ai/artifact/JVjueTmHeJsnHLsow3LDVb)
- **Desktop Prototype (Web / KofJS Responsivo):** [https://claude.ai/artifact/64FYjX5UiveVxTtRGYurQP](https://claude.ai/artifact/64FYjX5UiveVxTtRGYurQP)
- **Mobile Prototype (Viewport 360×640 Canônico):** [https://claude.ai/artifact/8b3jFV4BrGj4YkDQAwDvDF](https://claude.ai/artifact/8b3jFV4BrGj4YkDQAwDvDF)
- **Local Reference:** [`DESIGN_SYSTEM.md`](../../../DESIGN_SYSTEM.md)

---

## Problem Statement (Arquitetura Monolítica Modular — KofLith)

O Organiza IA se trata especificamente de uma **Arquitetura Monolítica Modular** batizada de **KofLith**: todo o domínio do backend (`backend/*.kf` — `models.kf`, `auth.kf`, `services.kf`, `coach.kf`, `main.kf`) já se encontra unificado e homologado na porta 3000 (`9/9 E2E GREEN`), com o legado Java arquivado em `archive/legacy-backend-java/` (Issue #37). Como o frontend (`frontend/*.kf`) teve seus 35 arquivos antigos expurgados no commit `5d58ca9150` por conterem componentes alucinados (`Router`, `Component`, `Spacer`), precisamos agora reconstruir e integrar os módulos da interface `kof.ui` (`frontend/core/`, `frontend/components/`, `frontend/screens/`) do **MVP 1** (11 telas Mobile `360×640` + workspace Desktop `1280×800`), mantendo as fronteiras modulares estritas do monólito, 100% fiel à tríade final do Design System e aderente ao corpus `KofLang/Kof4j/training`.

## Goals

- [ ] Implementar 100% dos tokens visuais, componentes e as 11 telas do MVP 1 em `frontend/*.kf` seguindo os 3 artefatos finais (`JVjueTmHeJsnHLsow3LDVb`, `64FYjX5UiveVxTtRGYurQP`, `8b3jFV4BrGj4YkDQAwDvDF`).
- [ ] Integrar o frontend `kof.ui` ao monólito KofLith (`http://localhost:3000`), fechando as Issues #11, #32, #33, #34 e #41 com `0` erros no `kof check`.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| ------- | ------ |
| Migrações Flyway em banco relacional externo | Mantido para fase pós-MVP 1 conforme `PROJECT_STATUS.md` |
| Compilação de APK Android nativo (`kof.mobile.onPush`) | Depende da futura API Mobile do compilador Kof4j; no MVP 1 o push é demonstrado via Toast Overlay da Tela 11 |
| Retorno ao backend Java/Spring Boot | Arquivado definitivamente na Issue #37 (`archive/legacy-backend-java/`) |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here - nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Workaround para bug de `static Color` no `Default.mjs` (KofJS) | Expor todas as cores e estilos via funções top-level (`colorBgPrimary()`, `styleCard()`) em `frontend/core/theme.kf` | Campos `static Color` são emitidos dentro de `constructor()` de instância no JS gerado e chegam `undefined` (`rgba(0,0,0,0)`) se lidos estaticamente | yes |
| Compatibilidade de gráficos/ondas (`Canvas` vs `View`/`Row`) entre versões do `kof-cli` | Usar barras segmentadas `Row`/`View` por padrão com suporte opcional a `Canvas(200, 200)` se `kof-cli >= 0.4.0-beta` | O commit `5d58ca9150` documentou que `Canvas` falhava no `kof check` da versão `0.3.1-beta`, enquanto `0.4.0-beta` adicionou `Canvas`; o fallback híbrido garante `kof check` verde em qualquer ambiente | yes |
| Persistência de estado reativo e navegação entre telas no `kof.ui` | Classes com campos `static` (`AppState.currentScreen`) + `window.bind(buildActiveScreen(window))` | Lambdas em KOF capturam escopo somente-leitura e `Router`/`Component` não existem na stdlib `kof.ui` | yes |
| Tratamento do crash `ASM COMPUTE_FRAMES` (Issue #41) em `backend/coach.kf` | Substituir o 5º argumento `null` literal de `GetDailyPulseOutput` por `""` em `calculateDailyPulse` | O emissor ASM da JVM falha ao calcular stack frames quando `ACONST_NULL` sucede pares de slots `Double` | yes |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Core Theme Tokens, Reactive State & KofLith HTTP Client (`MVP1-01`, `MVP1-02`, `MVP1-03`) ⭐ MVP

**User Story**: As a user opening Organiza IA on Web/Desktop or Mobile, I want the interface to render with the official dark cyan palette (`#0A0D18` / `#00D4FF`), switch smoothly between screens and viewports (`360×640` Mobile and `1280×800` Desktop), and communicate with the KofLith backend on port 3000 so that my session and financial data stay synchronized.

**Why P1**: Foundation required by every screen and widget in MVP 1.

**Acceptance Criteria**:

1. The `frontend/core/theme.kf` module SHALL expose top-level functions returning `Color` and `Style` tokens matching the official Design System (`#0A0D18` background `Color(10, 13, 24)`, `#12162A` card `Color(18, 22, 42)`, `#1A1F3A` cardSecondary `Color(26, 31, 58)`, `#00D4FF` accent cyan `Color(0, 212, 255)`, `#0066FF` accentBlue `Color(0, 102, 255)`, `#F0F0F0` textPrimary `Color(240, 240, 240)`, `#7B8EAD` textSecondary `Color(123, 142, 173)`, `#4A5578` textMuted `Color(74, 85, 120)`, `#00E5A0` success, `#FFB800` warning, and `#FF4A6E` danger).
2. IF a UI widget in `frontend/` requires a `Color` or `Style`, THEN the system SHALL invoke a top-level function or instantiate `Color(r, g, b)` inline rather than reading uninitialized `static Color` fields in `Default.mjs`.
3. The `frontend/core/app_state.kf` module SHALL store mutable session, navigation (`currentScreen`), viewport mode (`isDesktop`), onboarding inputs, dashboard metrics, envelopes, and chat messages exclusively in `static` fields of state classes (`AppState`, `SessionState`, `OnboardingState`, `DashboardState`, `ChatState`).
4. WHEN `navigateTo(Window w, String screenName)` is invoked, THEN the system SHALL update `AppState.currentScreen = screenName` and re-bind the active root `View` on `Window w` via `w.bind(view)`.
5. WHEN the frontend communicates with `http://localhost:3000`, THEN `frontend/core/api_client.kf` SHALL call `http.get(url, headers)` and `http.post(url, body, headers)` passing headers as a newline-separated `String` and treating the return value as a raw `String`.

**Independent Test**: Run `kof check frontend/main.kf` and verify that `AppState` transitions and `theme.kf` top-level color functions compile with 0 errors and render visible labels in `--target=js`.

---

### P1: Welcome, JWT Authentication & Adaptive Onboarding Flow — Screens 1 to 7 (`MVP1-04`, `MVP1-05`) ⭐ MVP

**User Story**: As a new or returning user, I want to authenticate (Screens 1–3) and answer the adaptive onboarding questions on salary, income type, and overdue debt (Screens 4, 5, 6, 6.1, and 7) so that Organiza IA calculates and recommends the ideal budget model (`Anti-Dívida`, `50/30/20`, `70/20/10`, `80/20`, `Kakeibo`, or `Base Zero`) for my reality.

**Why P1**: Delivers the core differentiation of adaptive budgeting and closes Issues #11 and #33.

**Acceptance Criteria**:

1. WHILE `SessionState.token == ""`, the system SHALL render Screen 1 (Boas-vindas com slogan `"SUA GRANA ORGANIZADA E SEM ESTRESSE."` e botões `"Criar conta"` / `"Já tenho conta"`), Screen 2 (Login), or Screen 3 (Cadastro) with aligned 48px/68px header blocks.
2. WHEN the user submits valid credentials on Login (`/api/auth/login`) or Register (`/api/auth/register`), THEN the system SHALL store the returned JWT in `SessionState.token` and navigate to Onboarding (Screen 4) or Dashboard (Screen 8).
3. WHILE on Screen 5 (Tipo de renda) before an option (`FIXED` or `VARIABLE`) is selected, the system SHALL render the `"Próximo"` button in disabled style (`#12162A` background, `#4A5578` text).
4. WHEN the user selects `"Sim, tenho dívidas"` on Screen 6, THEN the system SHALL route to Screen 6.1 (Valor da Dívida `debtAmount`) before submitting `POST /api/users/onboarding`.
5. WHEN `POST /api/users/onboarding` responds with `suggestedModel|description|buckets`, THEN Screen 7 (Resultado) SHALL display the suggested model title, bucket progress bars, and a model switcher allowing the user to change between the 6 adaptive models before opening Screen 8.

**Independent Test**: Complete the onboarding wizard with `salary = 3000`, `incomeType = FIXED`, `hasDebt = true`, `debtAmount = 5000` and verify Screen 7 displays `Anti-Dívida (70/10/20)` with `R$ 2.100`, `R$ 300`, and `R$ 600`.

---

### P1: Dashboard, Conversational AI Coach, Envelopes & Dual Viewport — Screens 8 to 11 (`MVP1-06`, `MVP1-07`, `MVP1-08`) ⭐ MVP

**User Story**: As an authenticated user, I want to view my Daily Pulse and bucket breakdown on the Dashboard (Screen 8), register expenses conversationally with the AI Coach (Screen 9), manage category Envelopes and Push Notification alerts (Screens 10–11), and toggle between Mobile (`360×640`) and Desktop (`1280×800`) layouts so that I know what I can spend today without stress.

**Why P1**: Completes the end-to-end MVP 1 experience and closes Issues #32, #34, and #41.

**Acceptance Criteria**:

1. WHEN Screen 8 (Dashboard) mounts, THEN the system SHALL fetch `GET /api/budgets/daily-pulse`, `GET /api/envelopes`, and `GET /api/transactions`, rendering the Daily Pulse card (`"Você pode gastar hoje"`, valor em cyan `#00D4FF`, dias restantes e dica de economia), the 3 bucket visualizers (`<80%` `#00D4FF`, `80–99%` `#FFB800`, `≥100%` `#FF4A6E`), and recent transactions.
2. WHEN the user sends a message in Screen 9 (Chat Coach), THEN the system SHALL append the right-aligned user bubble (`#00D4FF`, text `#06121C`), invoke `POST /api/chat/message`, append the left-aligned AI Coach reply bubble (`#1A1F3A`, text `#F0F0F0`), and refresh `DashboardState.dailyPulseStr`.
3. WHILE on Screen 10 (Caixinhas), the system SHALL group envelopes under `Necessidades`, `Desejos`, and `Futuro` with category chip colors (`Moradia #7C8CFF`, `Mercado #2DD4BF`, `Transporte #38BDF8`, `Delivery #A78BFA`, `Lazer #F472B6`, `Reserva #A3E635`), highlight `Assinaturas (120%)` in danger state (`#FF4A6E`), and provide a trigger for the Screen 11 Push Notification Toast overlay with all 5 official templates.
4. WHEN the user toggles the viewport mode (`AppState.isDesktop`), THEN the system SHALL resize `Window` between `360×640` (Mobile single-column + bottom NavBar) and `1280×800` (Desktop 3-column `Row`: Left Sidebar + Center Dashboard/Envelopes + Right Live AI Coach panel).
5. WHEN `calculateDailyPulse` executes in `backend/coach.kf`, THEN the system SHALL pass `""` instead of literal `null` as the 5th argument to `GetDailyPulseOutput` so JVM bytecode generation succeeds without `ASM COMPUTE_FRAMES` crashes.

**Independent Test**: Run `scripts/test_e2e_flow.ps1` (`9/9 GREEN`), `scripts/run_parity_tests.ps1` (`5/5 GREEN`), and `kof check frontend/main.kf` (`0 errors`).

---

## Edge Cases

- IF `List<T>` elements are accessed in any `.kf` file THEN the system SHALL use `.get(i)` instead of `list[i]` to prevent compiler error `[SEM054]`.
- IF a variable can hold `null` THEN the system SHALL declare an explicit nullable type (`String? x = null`) or initialize with `""` to prevent compiler error `[SEM048]`.
- IF a UI builder function grows beyond 35 lines THEN the system SHALL decompose it into smaller helper functions to prevent JVM `COMP002` / `ASM COMPUTE_FRAMES` local slot overflow.
- IF `http://localhost:3000` is unreachable during local UI preview THEN `frontend/core/api_client.kf` SHALL catch the `String` exception and return deterministic fallback demo data matching `DESIGN_SYSTEM.md` (`R$ 92,00` daily pulse, `Necessidades 82%`, `Desejos 65%`, `Futuro 33%`, `Assinaturas 120%`).

---

## Requirement Traceability

Each requirement gets a unique ID for tracking across design, tasks, and validation.

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| MVP1-01 | P1: Core Theme Tokens & Static Color Workaround | Phase 1 | In Tasks |
| MVP1-02 | P1: Reactive State Classes & Screen Navigation (`AppState`) | Phase 1 | In Tasks |
| MVP1-03 | P1: KofLith HTTP Client (`api_client.kf`) | Phase 1 | In Tasks |
| MVP1-04 | P1: Welcome & JWT Auth Screens (Screens 1–3) | Phase 2 | In Tasks |
| MVP1-05 | P1: Adaptive Onboarding & Model Switcher (Screens 4–7, #11, #33) | Phase 2 | In Tasks |
| MVP1-06 | P1: Dashboard, Daily Pulse & Bucket Visualizers (Screen 8, #32) | Phase 3 | In Tasks |
| MVP1-07 | P1: Conversational AI Coach & Action Engine (Screen 9, #34) | Phase 3 | In Tasks |
| MVP1-08 | P1: Envelopes, Push Notification Toast & Dual Viewport (Screens 10–11, #41) | Phase 4 | In Tasks |

**ID format:** `[CATEGORY]-[NUMBER]` (`MVP1-01` through `MVP1-08`)

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 8 total, 8 mapped to tasks, 0 unmapped

---

## Success Criteria

How we know the feature is successful:

- [ ] `kof check backend/main.kf` and `kof check frontend/main.kf` exit with `0` errors.
- [ ] `scripts/test_e2e_flow.ps1` passes `9/9` (`100% GREEN`) and `scripts/run_parity_tests.ps1` passes `5/5` (`100% GREEN`).
- [ ] All 11 Mobile screens (`360×640`) and the 3-column Desktop workspace (`1280×800`) are wired and navigable via `AppState`.
- [ ] Zero automatic `git commit` or `git push` executed by AI; working tree free of temporary/untracked junk files.
