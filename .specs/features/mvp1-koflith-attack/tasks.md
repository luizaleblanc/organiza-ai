# MVP 1 KofLith & Design System Attack — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/mvp1-koflith-attack/design.md`
**Spec**: `.specs/features/mvp1-koflith-attack/spec.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines (`README.md`, `CONTRIBUTING.md`, `AGENT_GUIDELINES.md`, `docs/LLM_KOF_UI_GUIDELINES.md`), and spec.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Domain / Backend KofLith (`backend/*.kf`) | unit + parity | 1:1 to spec ACs; cent-level financial parity | `tests/parity_test.kf` | `powershell -ExecutionPolicy Bypass -File scripts/run_parity_tests.ps1` |
| Gateway HTTP / API (`backend/main.kf`) | e2e | All 9 E2E user flows on port 3000 | `scripts/test_e2e_flow.ps1` | `powershell -ExecutionPolicy Bypass -File scripts/test_e2e_flow.ps1` |
| Frontend KofUI (`frontend/**/*.kf`) | build + typecheck | 0 syntax/semantic errors in KOF compiler (`kof check`) + KofJS bundle generation (`--target=js`) | `frontend/**/*.kf` | `kof check frontend/main.kf` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After any `.kf` file creation or edit in `frontend/` | `kof check frontend/main.kf` |
| Full | After API integration tasks (`api_client.kf`, Onboarding, Dashboard, Chat, Envelopes) | `kof check frontend/main.kf; powershell -ExecutionPolicy Bypass -File scripts/test_e2e_flow.ps1` |
| Build | At the end of each Batch / Phase | `kof check backend/main.kf; kof check frontend/main.kf; powershell -ExecutionPolicy Bypass -File scripts/run_parity_tests.ps1; powershell -ExecutionPolicy Bypass -File scripts/test_e2e_flow.ps1` |

---

## Execution Plan

Phases are ordered and run sequentially. Following `tlc-spec-driven` Sub-Agent Delegation (`~5–6 tasks per worker, whole phases`), the 15 atomic tasks across 4 phases pack into **3 Sequential Batch Workers** running on **Gemini Flash 3.6 (Effort Alto)** trained on `KofLang/Kof4j/training`, followed by **1 Independent Verifier Sub-Agent**:

- **Batch Worker 1 (Phase 1 — Foundation, Theme Tokens, State & HTTP Client):** `T1 → T2 → T3 → T4` (4 tasks)
- **Batch Worker 2 (Phase 2 — Design System Components, Auth & Onboarding Screens 1–7):** `T5 → T6 → T7 → T8 → T9` (5 tasks)
- **Batch Worker 3 (Phase 3 & Phase 4 — Dashboard, AI Coach Chat, Envelopes, Desk/Mobile Layout & E2E Verification):** `T10 → T11 → T12 → T13 → T14 → T15` (6 tasks)

### Phase 1: Core Infrastructure, Design System Tokens & KofLith Client
```
T1 → T2 → T3 → T4
```

### Phase 2: Reusable Design System Widgets, Auth & Adaptive Onboarding (Screens 1–7)
```
T5 → T6 → T7 → T8 → T9
```

### Phase 3: Main App Screens (Dashboard, Chat Coach, Envelopes & Dual Shell — Screens 8–11)
```
T10 → T11 → T12 → T13
```

### Phase 4: Backend Bytecode Fix (Issue #41) & Full E2E Homologation
```
T14 → T15
```

---

## Task Breakdown

### Phase 1: Core Infrastructure, Design System Tokens & KofLith Client

### T1: Normalize `frontend/core/` & Implement Official Design System Tokens (`theme.kf`)
**What**: Remove/archive unused UTF-16LE `frontend/core/database.kf` and rewrite `frontend/core/theme.kf` with top-level `Color` and `Style` functions matching `https://claude.ai/artifact/JVjueTmHeJsnHLsow3LDVb` (`#0A0D18` background, `#12162A` card, `#1A1F3A` card2, `#00D4FF` cyan accent, `#0066FF` blue accent, `#06121C` contrast, `#F0F0F0` textPrimary, `#7B8EAD` textSecondary, `#4A5578` textMuted, `#00E5A0` success, `#FFB800` warning, `#FF4A6E` danger, and 6 category colors).
**Where**: `frontend/core/theme.kf`
**Depends on**: None
**Reuses**: `DESIGN_SYSTEM.md`
**Requirement**: MVP1-01
**Done when**:
- [ ] All color tokens exposed via top-level functions (bypassing KofJS `static Color` constructor bug)
- [ ] Gate check passes: `kof check frontend/main.kf`
**Tests**: build
**Gate**: quick
**Suggested Manual Commit**: `feat(frontend): atualizar tokens de cor e estilo do design system mvp 1 em theme.kf`

---

### T2: Create Centralized Reactive State Classes (`app_state.kf`)
**What**: Create `frontend/core/app_state.kf` defining `AppState` (`currentScreen`, `isDesktop`, `activeNotificationModel`, `showNotificationOverlay`), `SessionState` (`token`, `userId`, `userName`, `userEmail`, `tier`), `OnboardingState` (`salaryStr`, `incomeType`, `hasDebt`, `debtAmountStr`, `suggestedModel`, `modelDescription`), `DashboardState` (`dailyPulseStr`, `daysRemaining`, `tipText`, `needsPct`, `wantsPct`, `savingsPct`, `selectedBucket`), and `ChatState` (`messages`).
**Where**: `frontend/core/app_state.kf`
**Depends on**: T1
**Reuses**: `KOF_REFERENCE.md` section 4
**Requirement**: MVP1-02
**Done when**:
- [ ] All mutable state fields are `static` inside PascalCase classes with explicit non-null default values (zero `SEM048`)
- [ ] Gate check passes: `kof check frontend/main.kf`
**Tests**: build
**Gate**: quick
**Suggested Manual Commit**: `feat(frontend): criar classes de estado estatico global em app_state.kf`

---

### T3: Implement KofLith HTTP Client & String Parsers (`api_client.kf`)
**What**: Create `frontend/core/api_client.kf` with functions calling `http://localhost:3000` (`apiLogin`, `apiRegister`, `apiSubmitOnboarding`, `apiFetchDailyPulse`, `apiFetchDashboard`, `apiFetchEnvelopes`, `apiCreateEnvelope`, `apiSendChatMessage`) using `http.get` / `http.post` with newline-joined header strings and deterministic fallback data if offline.
**Where**: `frontend/core/api_client.kf`
**Depends on**: T2
**Reuses**: `KOF_WEB_REFERENCE.md`, `backend/main.kf`
**Requirement**: MVP1-03
**Done when**:
- [ ] Uses `http.post(url, body, headers)` returning `String` (zero `.body` / `.status` fake properties)
- [ ] Uses `.get(i)` for all `List` accesses (zero `SEM054`)
- [ ] Gate check passes: `kof check frontend/main.kf`
**Tests**: integration
**Gate**: full
**Suggested Manual Commit**: `feat(frontend): implementar cliente http integrado ao monolito koflith em api_client.kf`

---

### T4: Build Brand Logomark & Responsive Navigation Chrome (`navigation_chrome.kf`)
> **Implementado como (Issue #38):** `frontend/components/brand_header.kf` (`buildBrandHeader`) + `frontend/components/nav_bar.kf` (`buildNavBar`, `buildSidebar`). O dispatcher `buildActiveScreen`/`navigateTo`/`mountScreen` vive em `frontend/core/navigation.kf` (o `main.kf` não é importável — `PKG006`).

**What**: Create `frontend/components/navigation_chrome.kf` providing `buildBrandHeader` (rendering the 3 parallel cyan waves in 2:1 aspect ratio with decreasing opacity `1.0 / 0.7 / 0.45` + Mobile/Desktop viewport toggle button) and `buildNavBar` / `buildDesktopSidebar` (bottom 3-tab navigation bar for Mobile `360×640` and vertical Sidebar for Desktop `1280×800`: `Dashboard`, `Chat`, `Caixinhas`).
**Where**: `frontend/components/navigation_chrome.kf`
**Depends on**: T3
**Reuses**: `DESIGN_SYSTEM.md` sections 1.1 & 3.5
**Requirement**: MVP1-02, MVP1-04
**Done when**:
- [ ] Brand header renders the 3 parallel cyan waves (`1.0 / 0.7 / 0.45`) without wordmark inside app screens
- [ ] Active tab highlights in cyan (`#00D4FF`) and triggers screen re-binding
- [ ] Gate check passes: `kof check frontend/main.kf`
**Tests**: build
**Gate**: quick
**Suggested Manual Commit**: `feat(frontend): criar componentes de marca 3 ondas e navegacao responsiva em navigation_chrome.kf`

---

### Phase 2: Reusable Design System Widgets, Auth & Adaptive Onboarding (Screens 1–7)

### T5: Build Core UI Cards & Chat Bubbles (`cards.kf`)
**What**: Create `frontend/components/cards.kf` implementing the reusable cards from `https://claude.ai/artifact/JVjueTmHeJsnHLsow3LDVb`: Daily Pulse card with economy tip (`buildPulseCard`), Envelope card with category icon chip and 3-state progress bar (`0–79% #00D4FF`, `80–99% #FFB800`, `≥100% #FF4A6E` in `buildEnvelopeCard`), Transaction card (`buildTransactionCard`), Choice Card (`buildChoiceCard`), and Chat Bubbles (`buildChatBubble`).
**Where**: `frontend/components/cards.kf`
**Depends on**: T4
**Reuses**: `DESIGN_SYSTEM.md` sections 3.3, 3.4, 3.6, 3.7
**Requirement**: MVP1-06, MVP1-07, MVP1-08
**Done when**:
- [ ] Progress bars switch color automatically at `80%` (`#FFB800`) and `100%` (`#FF4A6E`)
- [ ] Gate check passes: `kof check frontend/main.kf`
**Tests**: build
**Gate**: quick
**Suggested Manual Commit**: `feat(frontend): implementar cards de pulso, envelopes, transacoes e bolhas de chat em cards.kf`

---

### T6: Build Interactive Bucket Chart & Push Notification Toast Catalog (`visual_widgets.kf`)
**What**: Create `frontend/components/visual_widgets.kf` implementing the interactive 3-bucket visualizer (`Necessidades #00D4FF`, `Desejos #0066FF`, `Futuro #00E5A0` with `>80% #FFB800` and `>90% #FF4A6E` overrides and radial tap inspection) plus `buildNotificationToast` implementing the 5 push notification models from Screen 11 (`Alerta · caixinha estourada`, `Aviso · quase no limite`, `Marca · dica do dia`, `Sucesso · meta batida`, `Lembrete · registro pendente`).
**Where**: `frontend/components/visual_widgets.kf`
**Depends on**: T5
**Reuses**: `DESIGN_SYSTEM.md` sections 3.7.1 & 3.9
**Requirement**: MVP1-06, MVP1-08
**Done when**:
- [ ] Bucket slice tap highlights the selected bucket (`Necessidades: R$ 1.640 de R$ 2.000`)
- [ ] All 5 notification toast templates are selectable and renderable
- [ ] Gate check passes: `kof check frontend/main.kf`
**Tests**: build
**Gate**: quick
**Suggested Manual Commit**: `feat(frontend): implementar visualizador interativo de buckets e catalogo de notificacoes push em visual_widgets.kf`

---

### T7: Implement Welcome, Login & Register Screens (Screens 1, 2 & 3 — `auth_screens.kf`)
**What**: Create `frontend/screens/auth_screens.kf` implementing Screen 1 (Boas-vindas com hero de 3 ondas 230px, slogan `"SUA GRANA ORGANIZADA E SEM ESTRESSE."`, botões `"Criar conta"` e `"Já tenho conta"`), Screen 2 (Login conectado a `POST /api/auth/login`), e Screen 3 (Cadastro conectado a `POST /api/auth/register`) com alinhamento vertical idêntico de cabeçalho.
**Where**: `frontend/screens/auth_screens.kf`
**Depends on**: T6
**Reuses**: `DESIGN_SYSTEM.md` sections 5.1, 5.2, 5.3
**Requirement**: MVP1-04
**Done when**:
- [ ] Submitting Login or Register stores JWT in `SessionState.token` and navigates to Onboarding/Dashboard
- [ ] Gate check passes: `kof check frontend/main.kf`
**Tests**: integration
**Gate**: full
**Suggested Manual Commit**: `feat(frontend): implementar telas de boas-vindas, login e cadastro integradas ao auth jwt`

---

### T8: Implement Onboarding Input Screens: Salary, Income Type, Debt & Debt Amount (Screens 4, 5, 6 & 6.1)
**What**: Create `frontend/screens/onboarding_steps_screens.kf` implementing Screen 4 (Salário com prefixo `R$` em cyan `#00D4FF` e progress dots `1/4`), Screen 5 (Renda Fixa vs Variável com choice cards e botão `"Próximo"` desabilitado até escolha), Screen 6 (Dívidas em atraso: Sim/Não), e Screen 6.1 (Valor aproximado da dívida `debtAmount` quando `hasDebt == true`).
**Where**: `frontend/screens/onboarding_steps_screens.kf`
**Depends on**: T7
**Reuses**: `DESIGN_SYSTEM.md` sections 5.4, 5.5, 5.6, 5.6.1
**Requirement**: MVP1-05
**Done when**:
- [ ] Choice cards update static state and enable `"Próximo"` button
- [ ] Selecting `"Sim, tenho dívidas"` routes to Screen 6.1 (`debtAmount`); `"Não, estou em dia"` submits straight to `/api/users/onboarding` and routes to Screen 7
- [ ] Gate check passes: `kof check frontend/main.kf`
**Tests**: integration
**Gate**: full
**Suggested Manual Commit**: `feat(frontend): implementar fluxo de perguntas do onboarding adaptativo (telas 4 a 6.1)`

---

### T9: Implement Onboarding Result Screen & Adaptive Model Switcher (Screen 7 — Issues #11 & #33)
**What**: Create `frontend/screens/onboarding_result_screen.kf` implementing Screen 7 (Resultado do Onboarding) connected to `POST /api/users/onboarding`, displaying the suggested model (`Anti-Dívida 70/10/20`, `Padrão 50/30/20`, `Sobrevivência 70/20/10`, `Simplificado 80/20`, `Kakeibo`, ou `Base Zero`), the 3 calculated buckets in `R$`, and a model-switcher selector (Issue #11) before `"Começar a organizar"` navigates to Dashboard (Screen 8).
**Where**: `frontend/screens/onboarding_result_screen.kf`
**Depends on**: T8
**Reuses**: `backend/services.kf::suggestBudgetModel`
**Requirement**: MVP1-05
**Done when**:
- [ ] Parses `suggestedModel|description|buckets` from `/api/users/onboarding`
- [ ] Allows switching between the 6 adaptive budget models (closes Issue #11 & Issue #33)
- [ ] Gate check passes: `kof check frontend/main.kf`
**Tests**: integration
**Gate**: full
**Suggested Manual Commit**: `feat(frontend): integrar tela de resultado do onboarding com suggestmodel e troca de modelo (#11, #33)`

---

### Phase 3: Main App Screens (Dashboard, Chat Coach, Envelopes & Dual Shell — Screens 8–11)

### T10: Implement Dashboard Screen with Live Buckets & Transactions (Screen 8 — Issue #32)
**What**: Create `frontend/screens/dashboard_screen.kf` implementing Screen 8 (`"Olá, Luiza"`, botão de engrenagem/troca de modelo, `PulseCard` alimentado por `GET /api/budgets/daily-pulse`, seção `"Seus buckets"` com gráfico interativo de buckets e barras de progresso, e lista `"Últimas transações"` alimentada por `GET /api/transactions` + botão rápido de lançamento).
**Where**: `frontend/screens/dashboard_screen.kf`
**Depends on**: T9
**Reuses**: `DESIGN_SYSTEM.md` section 5.8
**Requirement**: MVP1-06
**Done when**:
- [ ] Connects live `/api/budgets/daily-pulse`, `/api/envelopes`, and `/api/transactions` responses to `DashboardState` (closes Issue #32)
- [ ] Gate check passes: `kof check frontend/main.kf`
**Tests**: integration
**Gate**: full
**Suggested Manual Commit**: `feat(frontend): implementar tela de dashboard integrada a pulso diario, buckets e transacoes (#32)`

---

### T11: Implement Conversational AI Coach Screen (Screen 9 — Issue #34)
**What**: Create `frontend/screens/chat_screen.kf` implementing Screen 9 (cabeçalho com marca 46px isolada, histórico de bolhas de mensagens `IA` e `Usuário`, campo `"Digite seu gasto..."`, atalho de voz simulado e botão de enviar cyan conectado a `POST /api/chat/message` e registro automático de despesa em `POST /api/transactions` quando o usuário digita `"gastei R$ ..."`).
**Where**: `frontend/screens/chat_screen.kf`
**Depends on**: T10
**Reuses**: `DESIGN_SYSTEM.md` section 5.9, `backend/main.kf`
**Requirement**: MVP1-07
**Done when**:
- [ ] Sending a chat message persists via `/api/chat/message`, updates `ChatState.messages`, and refreshes `DashboardState.dailyPulseStr` (closes Issue #34)
- [ ] Gate check passes: `kof check frontend/main.kf`
**Tests**: integration
**Gate**: full
**Suggested Manual Commit**: `feat(frontend): implementar tela de chat e integrar motor de acao do coach financeiro (#34)`

---

### T12: Implement Envelopes Screen & Notification Toast Trigger (Screens 10 & 11)
**What**: Create `frontend/screens/envelopes_screen.kf` implementing Screen 10 (`"Suas caixinhas"` + botão `"+"` para criar envelope via `POST /api/envelopes`), agrupando caixinhas por bucket macro (`Necessidades`: Moradia, Mercado, Transporte; `Desejos`: Delivery, Assinaturas 120% perigo, Lazer; `Futuro`: Reserva) e exibindo o banner de perigo isolado + seletor para inspecionar o pop-up da Screen 11 (Notificação Push com os 5 modelos do Design System).
**Where**: `frontend/screens/envelopes_screen.kf`
**Depends on**: T11
**Reuses**: `DESIGN_SYSTEM.md` sections 5.10 & 5.11
**Requirement**: MVP1-08
**Done when**:
- [ ] Renders macro bucket groups with category-specific chip colors and danger state (`120%` on Assinaturas)
- [ ] Triggers Screen 11 notification pop-up overlay with the 5 official notification models
- [ ] Gate check passes: `kof check frontend/main.kf`
**Tests**: integration
**Gate**: full
**Suggested Manual Commit**: `feat(frontend): implementar tela de caixinhas por bucket e overlay de notificacoes push (telas 10 e 11)`

---

### T13: Wire Dual Viewport Dispatcher (Mobile `8b3jFV4BrGj4YkDQAwDvDF` + Desktop `64FYjX5UiveVxTtRGYurQP`) in `frontend/main.kf`
**What**: Update `frontend/main.kf` to import `core.*`, `components.*`, and `screens.*`, wiring `navigateTo(Window w, String screen)` and the responsive shell that renders either the canonical **Mobile 360×640 frame** (`https://claude.ai/artifact/8b3jFV4BrGj4YkDQAwDvDF`) or the multi-panel **Desktop 1280×800 workspace** (`https://claude.ai/artifact/64FYjX5UiveVxTtRGYurQP` — Sidebar + Dashboard/Envelopes + Live AI Coach side-panel).
**Where**: `frontend/main.kf`
**Depends on**: T12
**Reuses**: `frontend/core/app_state.kf`
**Requirement**: MVP1-02, MVP1-04, MVP1-06, MVP1-07, MVP1-08
**Done when**:
- [ ] `kof check frontend/main.kf` passes with 0 errors
- [ ] Switching Mobile/Desktop mode resizes `Window` (`360×640` vs `1280×800`) and re-binds the layout cleanly
**Tests**: build
**Gate**: build
**Suggested Manual Commit**: `feat(frontend): conectar todas as 11 telas e layout dual mobile/desktop em main.kf`

---

### Phase 4: Backend Bytecode Fix (Issue #41) & Full E2E Homologation

### T14: Fix/Isolate Nullable String Record Construction in `backend/coach.kf` (Issue #41) & Verify Parity
**What**: In `backend/coach.kf::calculateDailyPulse`, replace the literal `null` 5th argument in `GetDailyPulseOutput(pulse, daysRemaining, totalSpent, salary, null)` with an empty string `""` so `ASM COMPUTE_FRAMES` in Kof4j does not push `ACONST_NULL` after `Double` slot pairs (resolving Issue #41), and verify `scripts/validate_architecture.ps1` + `scripts/run_parity_tests.ps1`.
**Where**: `backend/coach.kf`
**Depends on**: T13
**Reuses**: `tests/parity_test.kf`
**Requirement**: MVP1-08
**Done when**:
- [ ] `calculateDailyPulse` no longer triggers `ASM COMPUTE_FRAMES` `ArrayIndexOutOfBoundsException`
- [ ] `scripts/run_parity_tests.ps1` passes 5/5 (100%)
**Tests**: unit
**Gate**: build
**Suggested Manual Commit**: `fix(backend): contornar crash asm compute_frames em calculateDailyPulse substituindo literal null (#41)`

---

### T15: Run Full-Stack E2E Homologation & Generate Final Verifier Report (`validation.md`)
**What**: Execute full build gate (`kof check backend/main.kf`, `kof check frontend/main.kf`, `scripts/run_parity_tests.ps1`, `scripts/test_e2e_flow.ps1`), synchronize `PROJECT_STATUS.md` checkboxes for MVP 1 completion (Issues #11, #32, #33, #34, #41), and generate `.specs/features/mvp1-koflith-attack/validation.md` with `file:line` evidence citations.
**Where**: `.specs/features/mvp1-koflith-attack/validation.md`
**Depends on**: T14
**Reuses**: `scripts/test_e2e_flow.ps1`
**Requirement**: MVP1-01, MVP1-02, MVP1-03, MVP1-04, MVP1-05, MVP1-06, MVP1-07, MVP1-08
**Done when**:
- [ ] `kof check backend/main.kf` & `kof check frontend/main.kf` pass with 0 errors
- [ ] `scripts/test_e2e_flow.ps1` passes 9/9 (100% GREEN)
- [ ] `validation.md` reports `PASS` with `file:line` citations and `validate_state.py` exits 0
**Tests**: e2e
**Gate**: build
**Suggested Manual Commit**: `docs(status): homologar fechamento do mvp 1 full-stack koflith e gerar relatorio de validacao`

---

## Phase Execution Map

Visual representation of task ordering. Phases run in sequence, and tasks within a phase run in order:

```
Phase 1:  T1 → T2 → T3 → T4
Phase 2:  T5 → T6 → T7 → T8 → T9
Phase 3:  T10 → T11 → T12 → T13
Phase 4:  T14 → T15
```

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: `frontend/core/theme.kf` | 1 file (Design System tokens) | ✅ Granular |
| T2: `frontend/core/app_state.kf` | 1 file (Static state classes) | ✅ Granular |
| T3: `frontend/core/api_client.kf` | 1 file (HTTP client to :3000) | ✅ Granular |
| T4: `frontend/components/navigation_chrome.kf` | 1 file (Brand header + NavBar/Sidebar) | ✅ Granular |
| T5: `frontend/components/cards.kf` | 1 file (Pulse, Envelope, Tx & Chat cards) | ✅ Granular |
| T6: `frontend/components/visual_widgets.kf` | 1 file (Bucket Chart + Notification Toast) | ✅ Granular |
| T7: `frontend/screens/auth_screens.kf` | 1 file (Screens 1–3 Auth flow) | ✅ Granular |
| T8: `frontend/screens/onboarding_steps_screens.kf` | 1 file (Screens 4–6.1 Onboarding steps) | ✅ Granular |
| T9: `frontend/screens/onboarding_result_screen.kf` | 1 file (Screen 7 Result + Model Switcher) | ✅ Granular |
| T10: `frontend/screens/dashboard_screen.kf` | 1 file (Screen 8 Dashboard) | ✅ Granular |
| T11: `frontend/screens/chat_screen.kf` | 1 file (Screen 9 AI Coach chat) | ✅ Granular |
| T12: `frontend/screens/envelopes_screen.kf` | 1 file (Screens 10–11 Envelopes & Toast) | ✅ Granular |
| T13: `frontend/main.kf` | 1 file (Mobile 360x640 + Desktop 1280x800 shell) | ✅ Granular |
| T14: `backend/coach.kf` | 1 file (Issue #41 fix) | ✅ Granular |
| T15: `.specs/features/mvp1-koflith-attack/validation.md` | 1 file (E2E Verification report) | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | Start of Phase 1 | ✅ Match |
| T2 | T1 | `T1 → T2` | ✅ Match |
| T3 | T2 | `T2 → T3` | ✅ Match |
| T4 | T3 | `T3 → T4` | ✅ Match |
| T5 | T4 | Start of Phase 2 (after Phase 1 `T4`) | ✅ Match |
| T6 | T5 | `T5 → T6` | ✅ Match |
| T7 | T6 | `T6 → T7` | ✅ Match |
| T8 | T7 | `T7 → T8` | ✅ Match |
| T9 | T8 | `T8 → T9` | ✅ Match |
| T10 | T9 | Start of Phase 3 (after Phase 2 `T9`) | ✅ Match |
| T11 | T10 | `T10 → T11` | ✅ Match |
| T12 | T11 | `T11 → T12` | ✅ Match |
| T13 | T12 | `T12 → T13` | ✅ Match |
| T14 | T13 | Start of Phase 4 (after Phase 3 `T13`) | ✅ Match |
| T15 | T14 | `T14 → T15` | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Frontend KofUI (`theme.kf`) | build + typecheck | build | ✅ OK |
| T2 | Frontend KofUI (`app_state.kf`) | build + typecheck | build | ✅ OK |
| T3 | Frontend KofUI + API (`api_client.kf`) | build + e2e | integration | ✅ OK |
| T4 | Frontend KofUI (`navigation_chrome.kf`) | build + typecheck | build | ✅ OK |
| T5 | Frontend KofUI (`cards.kf`) | build + typecheck | build | ✅ OK |
| T6 | Frontend KofUI (`visual_widgets.kf`) | build + typecheck | build | ✅ OK |
| T7 | Frontend KofUI + Auth API (`auth_screens.kf`) | build + e2e | integration | ✅ OK |
| T8 | Frontend KofUI (`onboarding_steps_screens.kf`) | build + e2e | integration | ✅ OK |
| T9 | Frontend KofUI + Onboarding API (`onboarding_result_screen.kf`) | build + e2e | integration | ✅ OK |
| T10 | Frontend KofUI + Dashboard API (`dashboard_screen.kf`) | build + e2e | integration | ✅ OK |
| T11 | Frontend KofUI + Chat API (`chat_screen.kf`) | build + e2e | integration | ✅ OK |
| T12 | Frontend KofUI + Envelopes API (`envelopes_screen.kf`) | build + e2e | integration | ✅ OK |
| T13 | Frontend KofUI (`frontend/main.kf`) | build + typecheck | build | ✅ OK |
| T14 | Backend KofLith (`backend/coach.kf`) | unit + parity | unit | ✅ OK |
| T15 | Full Stack (`backend/` + `frontend/`) | e2e | e2e | ✅ OK |
