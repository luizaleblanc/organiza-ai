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

## Execution Plan (4-Phase SDLC + 3 Sub-Agent Batches on Gemini Flash 3.6 High Effort)

Phases are ordered and run sequentially. Following `tlc-spec-driven` Sub-Agent Delegation (`~7 tasks per worker, whole phases`), the 15 atomic tasks across 4 phases pack into **3 Sequential Batch Workers** running on **Gemini Flash 3.6 (Effort Alto)** trained on `Kof4j/training/`, followed by **1 Independent Verifier Sub-Agent**:

- **Batch Worker 1 (Phase 1 — Foundation, Theme Tokens, State & HTTP Client):** `T1 → T2 → T3 → T4` (4 tasks)
- **Batch Worker 2 (Phase 2 — Design System Components, Auth & Onboarding Screens 1–7):** `T5 → T6 → T7 → T8 → T9` (5 tasks)
- **Batch Worker 3 (Phase 3 & Phase 4 — Dashboard, Canvas PieChart, AI Coach Chat, Envelopes, Desk/Mobile Layout & E2E Verification):** `T10 → T11 → T12 → T13 → T14 → T15` (6 tasks)

### Phase 1: Core Infrastructure, Design System Tokens & KofLith Client
```
T1 → T2 → T3 → T4
```

### Phase 2: Reusable Design System Widgets, Auth & Adaptive Onboarding (Screens 1–7)
```
T5 → T6 → T7 → T8 → T9
```

### Phase 3: Main App Screens (Dashboard, Chat Coach, Envelopes & Notifications — Screens 8–11)
```
T10 → T11 → T12 → T13
```

### Phase 4: Dual Viewport (Mobile 360×640 + Desktop 1280×800) & Full E2E Homologation
```
T14 → T15
```

---

## Task Breakdown

### T1: Normalize `frontend/core/` & Implement Official Design System Tokens (`theme.kf`)
- **What**: Remove/archive unused UTF-16LE `frontend/core/database.kf` and rewrite `frontend/core/theme.kf` with top-level `Color` and `Style` functions matching `https://claude.ai/artifact/JVjueTmHeJsnHLsow3LDVb` (`#0A0D18` background, `#12162A` card, `#1A1F3A` card2, `#00D4FF` cyan accent, `#0066FF` blue accent, `#06121C` contrast, `#F0F0F0` textPrimary, `#7B8EAD` textSecondary, `#4A5578` textMuted, `#00E5A0` success, `#FFB800` warning, `#FF4A6E` danger, and 6 category colors).
- **Where**: `frontend/core/theme.kf`
- **Depends on**: None
- **Reuses**: `DESIGN_SYSTEM.md`
- **Requirement**: REQ-MVP1-01
- **Done when**:
  - [ ] All color tokens exposed via top-level functions (bypassing KofJS `static Color` constructor bug)
  - [ ] Gate check passes: `kof check frontend/main.kf`
- **Tests**: build
- **Gate**: quick
- **Suggested Manual Commit**: `feat(frontend): atualizar tokens de cor e estilo do design system mvp 1 em theme.kf`

---

### T2: Create Centralized Reactive State Classes (`app_state.kf`)
- **What**: Create `frontend/core/app_state.kf` defining `AppState` (`currentScreen`, `isDesktop`, `activeNotificationModel`), `SessionState` (`token`, `userId`, `userName`, `userEmail`, `tier`), `OnboardingState` (`salaryStr`, `incomeType`, `hasDebt`, `debtAmountStr`, `suggestedModel`, `modelDescription`), `DashboardState` (`dailyPulseStr`, `daysRemaining`, `tipText`, `needsPct`, `wantsPct`, `savingsPct`), and `ChatState` (`messages`).
- **Where**: `frontend/core/app_state.kf`
- **Depends on**: T1
- **Reuses**: `KOF_REFERENCE.md` section 4
- **Requirement**: REQ-MVP1-02
- **Done when**:
  - [ ] All mutable state fields are `static` inside PascalCase classes with explicit non-null default values (zero `SEM048`)
  - [ ] Gate check passes: `kof check frontend/main.kf`
- **Tests**: build
- **Gate**: quick
- **Suggested Manual Commit**: `feat(frontend): criar classes de estado estatico global em app_state.kf`

---

### T3: Implement KofLith HTTP Client & String Parsers (`api_client.kf`)
- **What**: Create `frontend/core/api_client.kf` with functions calling `http://localhost:3000` (`apiLogin`, `apiRegister`, `apiSubmitOnboarding`, `apiFetchDailyPulse`, `apiFetchDashboard`, `apiFetchEnvelopes`, `apiCreateEnvelope`, `apiSendChatMessage`) using `http.get` / `http.post` with newline-joined header strings and safe fallback data if offline.
- **Where**: `frontend/core/api_client.kf`
- **Depends on**: T2
- **Reuses**: `KOF_WEB_REFERENCE.md`, `backend/main.kf`
- **Requirement**: REQ-MVP1-03
- **Done when**:
  - [ ] Uses `http.post(url, body, headers)` returning `String` (zero `.body` / `.status` fake properties)
  - [ ] Uses `.get(i)` for all `List` accesses (zero `SEM054`)
  - [ ] Gate check passes: `kof check frontend/main.kf`
- **Tests**: integration
- **Gate**: full
- **Suggested Manual Commit**: `feat(frontend): implementar cliente http integrado ao monolito koflith em api_client.kf`

---

### T4: Build Brand Logomark (3 Waves Canvas) & Navigation Bar (`brand_header.kf` + `nav_bar.kf`)
- **What**: Create `frontend/components/brand_header.kf` (rendering the 3 parallel cyan waves via `Canvas` in 2:1 aspect ratio + Mobile/Desktop viewport toggle button) and `frontend/components/nav_bar.kf` (bottom 3-tab navigation bar for Mobile 360×640 and vertical Sidebar for Desktop 1280×800: `Dashboard`, `Chat`, `Caixinhas`).
- **Where**: `frontend/components/brand_header.kf`, `frontend/components/nav_bar.kf`
- **Depends on**: T1, T2
- **Reuses**: `DESIGN_SYSTEM.md` sections 1.1 & 3.5
- **Requirement**: REQ-MVP1-02, REQ-MVP1-04
- **Done when**:
  - [ ] Logomark draws 3 identical parallel waves with decreasing opacity (1.0 / 0.7 / 0.45) via `Canvas`
  - [ ] Active tab highlights in cyan (`#00D4FF`) and triggers `navigateTo(w, target)`
  - [ ] Gate check passes: `kof check frontend/main.kf`
- **Tests**: build
- **Gate**: quick
- **Suggested Manual Commit**: `feat(frontend): criar componentes brand_header com ondas em canvas e nav_bar responsiva`

---

### T5: Build Core UI Widgets (`pulse_card.kf`, `envelope_card.kf`, `chat_bubble.kf`)
- **What**: Implement the reusable cards from `https://claude.ai/artifact/JVjueTmHeJsnHLsow3LDVb`: Daily Pulse card with economy tip (`pulse_card.kf`), Envelope card with category icon chip and 3-state progress bar (`0–79% #00D4FF`, `80–99% #FFB800`, `≥100% #FF4A6E` in `envelope_card.kf`), and Chat Bubbles (`chat_bubble.kf`).
- **Where**: `frontend/components/pulse_card.kf`, `frontend/components/envelope_card.kf`, `frontend/components/chat_bubble.kf`
- **Depends on**: T4
- **Reuses**: `DESIGN_SYSTEM.md` sections 3.3, 3.4, 3.6
- **Requirement**: REQ-MVP1-06, REQ-MVP1-07, REQ-MVP1-08
- **Done when**:
  - [ ] Progress bars switch color automatically at `80%` (`#FFB800`) and `100%` (`#FF4A6E`)
  - [ ] Gate check passes: `kof check frontend/main.kf`
- **Tests**: build
- **Gate**: quick
- **Suggested Manual Commit**: `feat(frontend): implementar componentes pulse_card, envelope_card e chat_bubble`

---

### T6: Build Interactive 200px Pie Chart & Push Notification Toast (`pie_chart.kf`, `notification_toast.kf`)
- **What**: Implement `frontend/components/pie_chart.kf` using `Canvas(200, 200)` (`setFill -> beginPath -> moveTo -> arc -> closePath -> fill`) with inner donut cutout `#0A0D18` and interactive bucket slice selection (`Necessidades`, `Desejos`, `Futuro`), plus `frontend/components/notification_toast.kf` implementing the 5 push notification models from Tela 11 (`Alerta · caixinha estourada`, `Aviso · quase no limite`, `Marca · dica do dia`, `Sucesso · meta batida`, `Lembrete · registro pendente`).
- **Where**: `frontend/components/pie_chart.kf`, `frontend/components/notification_toast.kf`
- **Depends on**: T5
- **Reuses**: `DESIGN_SYSTEM.md` sections 3.7.1 & 3.9, `docs/LLM_KOF_UI_GUIDELINES.md` section 2
- **Requirement**: REQ-MVP1-06, REQ-MVP1-08
- **Done when**:
  - [ ] `Canvas` uses exact Kof 0.4.x drawing sequence without passing arguments to `fill()`
  - [ ] All 5 notification toast templates selectable and renderable
  - [ ] Gate check passes: `kof check frontend/main.kf`
- **Tests**: build
- **Gate**: quick
- **Suggested Manual Commit**: `feat(frontend): adicionar grafico de pizza em canvas e catalogo de notificacoes push`

---

### T7: Implement Welcome, Login & Register Screens (Telas 1, 2 e 3 — `auth_screens.kf`)
- **What**: Create `frontend/screens/auth_screens.kf` implementing Tela 1 (Boas-vindas com hero de 3 ondas 230px, slogan `"SUA GRANA ORGANIZADA E SEM ESTRESSE."`, botões `"Criar conta"` e `"Já tenho conta"`), Tela 2 (Login conectado a `POST /api/auth/login`), e Tela 3 (Cadastro conectado a `POST /api/auth/register`) com alinhamento vertical idêntico de cabeçalho.
- **Where**: `frontend/screens/auth_screens.kf`
- **Depends on**: T3, T4
- **Reuses**: `DESIGN_SYSTEM.md` sections 5.1, 5.2, 5.3
- **Requirement**: REQ-MVP1-04
- **Done when**:
  - [ ] Submitting Login or Register stores JWT in `SessionState.token` and navigates to Onboarding/Dashboard
  - [ ] Gate check passes: `kof check frontend/main.kf`
- **Tests**: integration
- **Gate**: full
- **Suggested Manual Commit**: `feat(frontend): implementar telas de boas-vindas, login e cadastro integradas ao auth jwt`

---

### T8: Implement Onboarding Screens: Salary, Income Type, Debt & Debt Amount (Telas 4, 5, 6 e 6.1)
- **What**: Create `frontend/screens/onboarding_screens.kf` implementing Tela 4 (Salário com prefixo `R$` em cyan `#00D4FF` e progress dots `1/4`), Tela 5 (Renda Fixa vs Variável com choice cards e botão `"Próximo"` desabilitado até escolha), Tela 6 (Dívidas em atraso: Sim/Não), e Tela 6.1 (Valor aproximado da dívida `debtAmount` quando `hasDebt == true`).
- **Where**: `frontend/screens/onboarding_screens.kf`
- **Depends on**: T7
- **Reuses**: `DESIGN_SYSTEM.md` sections 5.4, 5.5, 5.6, 5.6.1
- **Requirement**: REQ-MVP1-05
- **Done when**:
  - [ ] Choice cards update static state and enable `"Próximo"` button
  - [ ] Selecting `"Sim, tenho dívidas"` routes to Tela 6.1 (`debtAmount`); `"Não, estou em dia"` submits straight to `/api/users/onboarding` and routes to Tela 7
  - [ ] Gate check passes: `kof check frontend/main.kf`
- **Tests**: integration
- **Gate**: full
- **Suggested Manual Commit**: `feat(frontend): implementar fluxo de perguntas do onboarding adaptativo (telas 4 a 6.1)`

---

### T9: Implement Onboarding Result Screen & Model Selector (Tela 7 — Issues #11 e #33)
- **What**: Complete `frontend/screens/onboarding_screens.kf` with Tela 7 (Resultado do Onboarding) connected to `POST /api/users/onboarding`, displaying the suggested model (`Anti-Dívida 70/10/20`, `Padrão 50/30/20`, `Sobrevivência 70/20/10`, `Simplificado 80/20`, `Kakeibo`, ou `Base Zero`), the 3 calculated buckets in `R$`, and a model-switcher selector (Issue #11) before `"Começar a organizar"` navigates to Dashboard (Tela 8).
- **Where**: `frontend/screens/onboarding_screens.kf`
- **Depends on**: T8
- **Reuses**: `backend/services.kf::suggestBudgetModel`
- **Requirement**: REQ-MVP1-05
- **Done when**:
  - [ ] Parses `suggestedModel|description|buckets` from `/api/users/onboarding`
  - [ ] Allows switching between the 6 adaptive budget models (closes Issue #11 & Issue #33)
  - [ ] Gate check passes: `kof check frontend/main.kf`
- **Tests**: integration
- **Gate**: full
- **Suggested Manual Commit**: `feat(frontend): integrar tela de resultado do onboarding com suggestmodel e troca de modelo (#11, #33)`

---

### T10: Implement Dashboard Screen with Live Buckets, Canvas Chart & Transactions (Tela 8 — Issue #32)
- **What**: Create `frontend/screens/dashboard_screen.kf` implementing Tela 8 (`"Olá, Luiza"`, botão de engrenagem/troca de modelo, `PulseCard` alimentado por `GET /api/budgets/daily-pulse`, seção `"Seus buckets"` com `PieChart` 200px e barras de progresso, e lista `"Últimas transações"` alimentada por `GET /api/transactions` + botão rápido de lançamento).
- **Where**: `frontend/screens/dashboard_screen.kf`
- **Depends on**: T6, T9
- **Reuses**: `DESIGN_SYSTEM.md` section 5.8
- **Requirement**: REQ-MVP1-06
- **Done when**:
  - [ ] Connects live `/api/budgets/daily-pulse`, `/api/envelopes`, and `/api/transactions` responses to `DashboardState` (closes Issue #32)
  - [ ] Gate check passes: `kof check frontend/main.kf`
- **Tests**: integration
- **Gate**: full
- **Suggested Manual Commit**: `feat(frontend): implementar tela de dashboard integrada a pulso diario, buckets e transacoes (#32)`

---

### T11: Implement Conversational AI Coach Screen (Tela 9 — Issue #34)
- **What**: Create `frontend/screens/chat_screen.kf` implementing Tela 9 (cabeçalho com marca 46px isolada, histórico de bolhas de mensagens `IA` e `Usuário`, campo `"Digite seu gasto..."`, atalho de voz simulado e botão de enviar cyan conectado a `POST /api/chat/message` e registro automático de despesa em `POST /api/transactions` quando o usuário digita `"gastei R$ ..."`).
- **Where**: `frontend/screens/chat_screen.kf`
- **Depends on**: T10
- **Reuses**: `DESIGN_SYSTEM.md` section 5.9, `backend/main.kf`
- **Requirement**: REQ-MVP1-07
- **Done when**:
  - [ ] Sending a chat message persists via `/api/chat/message`, updates `ChatState.messages`, and refreshes `DashboardState.dailyPulseStr` (closes Issue #34)
  - [ ] Gate check passes: `kof check frontend/main.kf`
- **Tests**: integration
- **Gate**: full
- **Suggested Manual Commit**: `feat(frontend): implementar tela de chat e integrar motor de acao do coach financeiro (#34)`

---

### T12: Implement Envelopes Screen & Notification Toast Trigger (Telas 10 e 11)
- **What**: Create `frontend/screens/envelopes_screen.kf` implementing Tela 10 (`"Suas caixinhas"` + botão `"+"` para criar envelope via `POST /api/envelopes`), agrupando caixinhas por bucket macro (`Necessidades`: Moradia, Mercado, Transporte; `Desejos`: Delivery, Assinaturas 120% perigo, Lazer; `Futuro`: Reserva) e exibindo o banner de perigo isolado + botão para disparar/inspecionar o pop-up da Tela 11 (Notificação Push com os 5 modelos do Design System).
- **Where**: `frontend/screens/envelopes_screen.kf`
- **Depends on**: T11
- **Reuses**: `DESIGN_SYSTEM.md` sections 5.10 & 5.11
- **Requirement**: REQ-MVP1-08
- **Done when**:
  - [ ] Renders macro bucket groups with category-specific chip colors and danger state (`120%` on Assinaturas)
  - [ ] Triggers Tela 11 notification pop-up overlay with the 5 official notification models
  - [ ] Gate check passes: `kof check frontend/main.kf`
- **Tests**: integration
- **Gate**: full
- **Suggested Manual Commit**: `feat(frontend): implementar tela de caixinhas por bucket e overlay de notificacoes push (telas 10 e 11)`

---

### T13: Wire Dual Viewport Dispatcher (Mobile `8b3jFV4BrGj4YkDQAwDvDF` + Desktop `64FYjX5UiveVxTtRGYurQP`) in `frontend/main.kf`
- **What**: Update `frontend/main.kf` to import `core.*`, `components.*`, and `screens.*`, wiring `navigateTo(Window w, String screen)` and the responsive shell that renders either the canonical **Mobile 360×640 frame** (`https://claude.ai/artifact/8b3jFV4BrGj4YkDQAwDvDF`) or the multi-panel **Desktop 1280×800 workspace** (`https://claude.ai/artifact/64FYjX5UiveVxTtRGYurQP` — Sidebar + Dashboard/Envelopes + Live AI Coach side-panel).
- **Where**: `frontend/main.kf`
- **Depends on**: T12
- **Reuses**: All `frontend/screens/*.kf` and `frontend/components/*.kf`
- **Requirement**: REQ-MVP1-02, REQ-MVP1-04, REQ-MVP1-06, REQ-MVP1-07, REQ-MVP1-08
- **Done when**:
  - [ ] `kof check frontend/main.kf` passes with 0 errors
  - [ ] Switching Mobile/Desktop mode resizes `Window` (`360×640` vs `1280×800`) and re-binds the layout cleanly
- **Tests**: build
- **Gate**: build
- **Suggested Manual Commit**: `feat(frontend): conectar todas as 11 telas e layout dual mobile/desktop em main.kf`

---

### T14: Fix/Isolate Nullable String Record Construction in `backend/coach.kf` (Issue #41) & Verify Parity
- **What**: In `backend/coach.kf::calculateDailyPulse`, replace the literal `null` 5th argument in `GetDailyPulseOutput(pulse, daysRemaining, totalSpent, salary, null)` with an empty string `""` (or a typed `String? okMsg = ""` variable) so `ASM COMPUTE_FRAMES` in Kof4j does not push `ACONST_NULL` after `Double` slot pairs (resolving Issue #41), and verify `scripts/validate_architecture.ps1` + `scripts/run_parity_tests.ps1`.
- **Where**: `backend/coach.kf`
- **Depends on**: T13
- **Reuses**: `tests/parity_test.kf`
- **Requirement**: REQ-MVP1-06
- **Done when**:
  - [ ] `calculateDailyPulse` no longer triggers `ASM COMPUTE_FRAMES` `ArrayIndexOutOfBoundsException`
  - [ ] `scripts/run_parity_tests.ps1` passes 5/5 (100%)
- **Tests**: unit
- **Gate**: build
- **Suggested Manual Commit**: `fix(backend): contornar crash asm compute_frames em calculateDailyPulse substituindo literal null (#41)`

---

### T15: Run Full-Stack E2E Homologation (`scripts/test_e2e_flow.ps1`) & Final Verifier Audit
- **What**: Execute full build gate (`kof check backend/main.kf`, `kof check frontend/main.kf`, `scripts/run_parity_tests.ps1`, `scripts/test_e2e_flow.ps1`), update `PROJECT_STATUS.md` checkboxes for MVP 1 completion (Issues #11, #32, #33, #34, #41), and generate `.specs/features/mvp1-koflith-attack/validation.md`.
- **Where**: `PROJECT_STATUS.md`, `.specs/features/mvp1-koflith-attack/validation.md`
- **Depends on**: T14
- **Reuses**: `scripts/test_e2e_flow.ps1`
- **Requirement**: REQ-MVP1-01 through REQ-MVP1-08
- **Done when**:
  - [ ] `kof check backend/main.kf` & `kof check frontend/main.kf` pass with 0 errors
  - [ ] `scripts/test_e2e_flow.ps1` passes 9/9 (100% GREEN)
  - [ ] `git status` shows clean working tree with zero untracked junk or AI artifacts
- **Tests**: e2e
- **Gate**: build
- **Suggested Manual Commit**: `docs(status): homologar fechamento do mvp 1 full-stack koflith e atualizar project_status`

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: `frontend/core/theme.kf` | 1 module (Design System tokens) | ✅ Granular |
| T2: `frontend/core/app_state.kf` | 1 module (Static state classes) | ✅ Granular |
| T3: `frontend/core/api_client.kf` | 1 module (HTTP client to :3000) | ✅ Granular |
| T4: `brand_header.kf` + `nav_bar.kf` | 2 cohesive layout chrome widgets | ✅ Granular |
| T5: `pulse_card.kf` + `envelope_card.kf` + `chat_bubble.kf` | 3 cohesive card widgets | ✅ Granular |
| T6: `pie_chart.kf` + `notification_toast.kf` | 2 Canvas/Overlay widgets | ✅ Granular |
| T7: `auth_screens.kf` (Screens 1–3) | 1 file (Auth flow) | ✅ Granular |
| T8: `onboarding_screens.kf` (Screens 4–6.1) | 1 file (Onboarding input steps) | ✅ Granular |
| T9: `onboarding_screens.kf` (Screen 7 + Model Switcher) | 1 file (Onboarding result & API) | ✅ Granular |
| T10: `dashboard_screen.kf` (Screen 8) | 1 file (Dashboard screen) | ✅ Granular |
| T11: `chat_screen.kf` (Screen 9) | 1 file (AI Coach chat screen) | ✅ Granular |
| T12: `envelopes_screen.kf` (Screens 10–11) | 1 file (Envelopes & notification overlay) | ✅ Granular |
| T13: `frontend/main.kf` (Mobile + Desktop shell) | 1 file (Entrypoint & router) | ✅ Granular |
| T14: `backend/coach.kf` (Issue #41 fix) | 1 function fix | ✅ Granular |
| T15: E2E Verification & `validation.md` | 1 verification report | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | Start of Phase 1 | ✅ Match |
| T2 | T1 | `T1 → T2` | ✅ Match |
| T3 | T2 | `T2 → T3` | ✅ Match |
| T4 | T1, T2 | `T3 → T4` (sequential within Phase 1) | ✅ Match |
| T5 | T4 | Start of Phase 2 (`T4 → T5`) | ✅ Match |
| T6 | T5 | `T5 → T6` | ✅ Match |
| T7 | T3, T4 | `T6 → T7` | ✅ Match |
| T8 | T7 | `T7 → T8` | ✅ Match |
| T9 | T8 | `T8 → T9` | ✅ Match |
| T10 | T6, T9 | Start of Phase 3 (`T9 → T10`) | ✅ Match |
| T11 | T10 | `T10 → T11` | ✅ Match |
| T12 | T11 | `T11 → T12` | ✅ Match |
| T13 | T12 | `T12 → T13` | ✅ Match |
| T14 | T13 | Start of Phase 4 (`T13 → T14`) | ✅ Match |
| T15 | T14 | `T14 → T15` | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Frontend KofUI (`theme.kf`) | build + typecheck | build | ✅ OK |
| T2 | Frontend KofUI (`app_state.kf`) | build + typecheck | build | ✅ OK |
| T3 | Frontend KofUI + API (`api_client.kf`) | build + e2e | integration | ✅ OK |
| T4 | Frontend KofUI (`brand_header`, `nav_bar`) | build + typecheck | build | ✅ OK |
| T5 | Frontend KofUI (`pulse_card`, `envelope_card`, `chat_bubble`) | build + typecheck | build | ✅ OK |
| T6 | Frontend KofUI (`pie_chart`, `notification_toast`) | build + typecheck | build | ✅ OK |
| T7 | Frontend KofUI + Auth API (`auth_screens.kf`) | build + e2e | integration | ✅ OK |
| T8 | Frontend KofUI (`onboarding_screens.kf`) | build + e2e | integration | ✅ OK |
| T9 | Frontend KofUI + Onboarding API (`onboarding_screens.kf`) | build + e2e | integration | ✅ OK |
| T10 | Frontend KofUI + Dashboard API (`dashboard_screen.kf`) | build + e2e | integration | ✅ OK |
| T11 | Frontend KofUI + Chat API (`chat_screen.kf`) | build + e2e | integration | ✅ OK |
| T12 | Frontend KofUI + Envelopes API (`envelopes_screen.kf`) | build + e2e | integration | ✅ OK |
| T13 | Frontend KofUI (`frontend/main.kf`) | build + typecheck | build | ✅ OK |
| T14 | Backend KofLith (`backend/coach.kf`) | unit + parity | unit | ✅ OK |
| T15 | Full Stack (`backend/` + `frontend/`) | e2e | e2e | ✅ OK |
