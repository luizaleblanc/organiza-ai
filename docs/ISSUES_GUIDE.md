# Guia de Implementação por Issue — Organiza AI (MVP 1 · Arquitetura Monolítica Modular KofLith)

> Este documento traduz cada Issue ativa em [GitHub Issues (`luizaleblanc/organiza-ai/issues`)](https://github.com/luizaleblanc/organiza-ai/issues) em orientação concreta de implementação sobre a **Arquitetura Monolítica Modular (KofLith — 100% KOF)**.
> O antigo backend em Java/Spring Boot foi arquivado em `archive/legacy-backend-java/` (Issue #37 fechada) apenas como *Ground Truth* histórico.

---

## 🧠 Protocolo Obrigatório Antes de Iniciar Qualquer Issue (Treinamento KOF)

Todo contribuidor ou subagente (**Gemini Flash Effort Alto** / Claude Code) deve obrigatoriamente ingerir a documentação do compilador `KofLang/Kof4j` na seguinte ordem antes de tocar em qualquer arquivo `.kf`:

1. [`docs/kof4j/README.md`](kof4j/README.md) & [`KOF_REFERENCE.md`](../KOF_REFERENCE.md)
2. [`docs/kof4j/training/language/syntax.md`](kof4j/training/language/syntax.md) — Funções sem keyword `fun`/`fn`/`func`.
3. [`docs/kof4j/training/language/types.md`](kof4j/training/language/types.md) — Null safety (`String?`), *smart cast* e `Double` de 64 bits.
4. [`docs/kof4j/training/language/ui.md`](kof4j/training/language/ui.md) & [`docs/LLM_KOF_UI_GUIDELINES.md`](LLM_KOF_UI_GUIDELINES.md) — Primitivas reais do `kof.ui` (`Window`, `View`, `Column`, `Row`, `Label`, `Button`, `Input`, `Canvas`, `Style`, `Color`, `Theme`).
5. [`docs/kof4j/training/idioms/architecture.md`](kof4j/training/idioms/architecture.md) — Arquitetura Monolítica Modular KofLith (*Menos segregação, mais intenção*).
6. [`docs/kof4j/training/anti-patterns/fake-idioms.md`](kof4j/training/anti-patterns/fake-idioms.md) — Firewall contra sintaxe inventada (`Router`, `Component`, `Spacer`, `lista[0]`, `for` sem `var`).

---

## Mapa Geral: Issues Ativas × Lotes do MVP 1 × Branches

| Issue | Lote SDD | Branch Alvo | Tag Alvo | Escopo Modular (`frontend/` & `backend/`) |
|---|---|---|---|---|
| **[#38](https://github.com/luizaleblanc/organiza-ai/issues/38)** | **Batch 1 (`T1–T5`)** | `feat/mvp1-batch1-core-foundation` | `v0.4.0-mvp1-batch1-core` | Fundação Core KofUI (`core/theme.kf`, `core/app_state.kf`, `core/api_client.kf`, `components/brand_header.kf`, `components/nav_bar.kf`, `core/navigation.kf`, `main.kf` e Dual Viewport Mobile `360×640` / Desktop `1280×800`) |
| **[#33](https://github.com/luizaleblanc/organiza-ai/issues/33)** | **Batch 2 (`T6–T7`)** | `feat/mvp1-batch2-auth-onboarding` | `v0.5.0-mvp1-batch2-onboarding` | Telas 1 a 3 (`screens/auth_screens.kf`) e Telas 4, 5, 6, 6.1 e 7 (`screens/onboarding_screens.kf` — `SuggestModel` + `debtAmount`) |
| **[#32](https://github.com/luizaleblanc/organiza-ai/issues/32)** | **Batch 3 (`T8–T9`)** | `feat/mvp1-batch3-dashboard-canvas` | `v0.6.0-mvp1-batch3-dashboard` | Tela 8 (`components/pulse_card.kf`, `components/pie_chart.kf` em Canvas 2D `200×200` e `screens/dashboard_screen.kf`) |
| **[#34](https://github.com/luizaleblanc/organiza-ai/issues/34)** | **Batch 4 (`T10`)** | `feat/mvp1-batch4-coach-envelopes` | `v0.7.0-mvp1-batch4-coach-boxes` | Tela 9 (`components/chat_bubble.kf` e `screens/chat_screen.kf` conectado a `POST /api/chat/message` e `POST /api/transactions`) |
| **[#11](https://github.com/luizaleblanc/organiza-ai/issues/11)** | **Batch 4 (`T11–T12`)** | `feat/mvp1-batch4-coach-envelopes` | `v0.7.0-mvp1-batch4-coach-boxes` | Telas 10 e 11 (`components/envelope_card.kf`, `components/notification_toast.kf` com 5 templates e `screens/envelopes_screen.kf` com troca de modelo) |
| **[#39](https://github.com/luizaleblanc/organiza-ai/issues/39)** | **Batch 5 (`T13–T15`)** | `feat/mvp1-batch5-e2e-benchmarks` | `v1.0.0-mvp1` | Homologação E2E Full-Stack (`scripts/test_e2e_flow.ps1`) e Benchmarks Empíricos (`scripts/benchmark_kof.ps1` → `docs/BENCHMARKS.md`) |
| **[#40](https://github.com/luizaleblanc/organiza-ai/issues/40)** | **Batch 5** | `feat/mvp1-batch5-e2e-benchmarks` | `v1.0.0-mvp1` | Capturas de tela HD (Mobile `360×640` e Desktop `1280×800`) das 11 Telas em `docs/screenshots/` |
| **[#41](https://github.com/luizaleblanc/organiza-ai/issues/41)** | **Upstream Kof4j** | `main` | — | Bug `ASM COMPUTE_FRAMES` ao construir `record` com `Double` antes de `String?` nulo |
| **[#42](https://github.com/luizaleblanc/organiza-ai/issues/42)** | **Pesquisa** | `main` | — | Validação científica do KOF/KofLith: hipóteses H1–H4 (paridade, concisão, LLM-friendliness, build/runtime), protocolo reprodutível e ameaças à validade (`docs/VALIDACAO_CIENTIFICA.md`) |

---

## Detalhamento por Issue

### 1. Issue #38 — `[MVP1-Batch1] Fundação Core KofUI & Dual Viewport`
- **Referências Visuais:** `JVjueTmHeJsnHLsow3LDVb` (Design System), `64FYjX5UiveVxTtRGYurQP` (Desktop `1280×800`), `8b3jFV4BrGj4YkDQAwDvDF` (Mobile `360×640`).
- **Passo a passo:**
  1. Implementar `frontend/core/theme.kf` com funções top-level `Color(r,g,b)` e builders de `Style`.
  2. Implementar `frontend/core/app_state.kf` com classes `static` (`AppState`, `SessionState`, `OnboardingState`, `DashboardState`, `ChatState`) e `navigateTo(Window w, String screen)` invocando `w.bind(...)`.
  3. Implementar `frontend/core/api_client.kf` usando `http.get` / `http.post` (`kof.http`) na porta `3000`.
  4. Implementar `frontend/components/brand_header.kf` (logo de 3 ondas via `Canvas`) e `frontend/components/nav_bar.kf` (barra inferior Mobile + Sidebar Desktop).
  5. Validar com `kof check frontend`.

### 2. Issue #33 — `[MVP1-Batch2] Telas 1 a 7 (Auth & Onboarding Adaptativo)`
- **Passo a passo:**
  1. Criar `frontend/screens/auth_screens.kf` (Telas 1 Boas-vindas, 2 Login `POST /api/auth/login` e 3 Cadastro `POST /api/auth/register`).
  2. Criar `frontend/screens/onboarding_screens.kf` cobrindo Tela 4 (Salário), Tela 5 (Tipo de Renda Fixa/Variável), Tela 6 (Dívida Sim/Não), Tela 6.1 condicional (`debtAmount`) e Tela 7 (Resultado `POST /api/onboarding/setup` com o modelo recomendado pelo `backend/coach.kf`).
  3. Validar com `kof check frontend`.

### 3. Issue #32 — `[MVP1-Batch3] Tela 8 (Dashboard, Pulso Diário & Gráfico Pizza Canvas 2D)`
- **Passo a passo:**
  1. Criar `frontend/components/pulse_card.kf` consumindo `GET /api/coach/daily-pulse`.
  2. Criar `frontend/components/pie_chart.kf` usando `Canvas(200, 200)` (`canvas.setFill(cor)` + `canvas.fill()`) com cores semânticas (`#00D4FF`, `#0066FF`, `#1E2847` e transição automática para `#FFB800` em 80–99% ou `#FF4A6E` em ≥100%).
  3. Criar `frontend/screens/dashboard_screen.kf` unificando a visão Mobile (`360×640`) e Desktop (`1280×800`).
  4. Validar com `kof check frontend`.

### 4. Issue #34 & Issue #11 — `[MVP1-Batch4] Telas 9, 10 e 11 (AI Coach, Caixinhas & Notificações)`
- **Passo a passo:**
  1. Criar `frontend/components/chat_bubble.kf` e `frontend/screens/chat_screen.kf` (Tela 9 conectada a `POST /api/chat/message` e `POST /api/transactions`).
  2. Criar `frontend/components/envelope_card.kf` (chips coloridos por categoria + barra de progresso) e `frontend/components/notification_toast.kf` (os 5 modelos da Tela 11).
  3. Criar `frontend/screens/envelopes_screen.kf` (Tela 10 agrupada por bucket + troca de modelo de orçamento).
  4. Validar com `kof check frontend` e `kof check backend`.

### 5. Issue #39 & Issue #40 — `[MVP1-Batch5] Homologação E2E, Benchmarks & Screenshots`
- **Passo a passo:**
  1. Executar `powershell -ExecutionPolicy Bypass -File scripts/test_e2e_flow.ps1` (`9/9 GREEN`).
  2. Executar `powershell -ExecutionPolicy Bypass -File scripts/benchmark_kof.ps1` para atualizar `docs/BENCHMARKS.md`.
  3. Adicionar as capturas de tela em `docs/screenshots/` e atualizar `README.md`.
