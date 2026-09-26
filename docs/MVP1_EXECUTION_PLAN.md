# 🚀 Plano de Ataque & Execution Plan — MVP 1 (Organiza IA · KofLith 100% KOF)

> **Status Arquitetural:** Backend KofLith (`backend/*.kf`) 100% unificado e homologado em E2E na porta 3000 (`9/9 GREEN`); código legado Java arquivado em `archive/legacy-backend-java/` (Issue #37 fechada); Design System do MVP 1 fechado na tríade oficial do Claude Design.
> **Metodologia:** Spec-Driven Development (`tlc-spec-driven` v3.3.0) + SDLC Estrito em 4 Fases (`F1 Design` → `F2 Desenvolvimento` → `F3 Code Review` → `F4 Deploy`).
> **Estratégia de Orquestração:** Delegação em 3 Lotes Sequenciais (*Phase-Aligned Batches*) para subagentes **Gemini Flash 3.6 (Effort Alto)** com protocolo obrigatório de treinamento prévio no corpus `KofLang/Kof4j/training`.

---

## 🎨 1. Tríade de Referência Oficial do Design System (MVP 1)

Todo agente e subagente escalado para o MVP 1 deve consultar as 3 fontes visuais canônicas juntamente com [`DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md):

| Artefato | Link Oficial | Escopo no `kof.ui` (`frontend/*.kf`) |
|---|---|---|
| **1. Design System (Core)** | [https://claude.ai/artifact/JVjueTmHeJsnHLsow3LDVb](https://claude.ai/artifact/JVjueTmHeJsnHLsow3LDVb) | Paleta `#0A0D18` / `#12162A` / `#1A1F3A` / `#00D4FF`, tipografia Manrope (pesos 400/500/600, `tabular-nums`), Logomark 3 ondas paralelas (2:1), Cards, Inputs, Barras de Progresso (Normal/Alerta/Perigo) e 5 Modelos de Notificação Push. |
| **2. Protótipo Desktop** | [https://claude.ai/artifact/64FYjX5UiveVxTtRGYurQP](https://claude.ai/artifact/64FYjX5UiveVxTtRGYurQP) | Workspace Web/Desktop (`1280×800`) em 3 colunas (`Row`): Sidebar de navegação à esquerda + Área central (Dashboard, Buckets, Caixinhas) + Painel lateral ao vivo do AI Coach à direita. |
| **3. Protótipo Mobile** | [https://claude.ai/artifact/8b3jFV4BrGj4YkDQAwDvDF](https://claude.ai/artifact/8b3jFV4BrGj4YkDQAwDvDF) | Viewport Mobile canônico (`360×640`) cobrindo a sequência completa das **11 Telas**: (1) Boas-vindas, (2) Login, (3) Cadastro, (4) Salário, (5) Tipo de Renda, (6) Dívidas, (6.1) Valor da Dívida, (7) Resultado do Modelo, (8) Dashboard, (9) Chat Coach, (10) Caixinhas e (11) Toast de Notificação Push. |

---

## 🧠 2. Protocolo de Treinamento KOF para Subagentes (Gemini Flash 3.6 · Effort Alto)

Conforme a **Guideline de Uso de IA** do [`README.md`](../README.md) e [`AGENT_GUIDELINES.md`](../AGENT_GUIDELINES.md), nenhum subagente tem permissão para escrever uma única linha de `.kf` sem antes ingerir a gramática real do compilador `Kof4j` (`training/`).

### 2.1. Pipeline de Ingestão Obrigatória (`KofLang/Kof4j/training`)
Antes de iniciar seu lote (*batch*), cada subagente **Gemini Flash 3.6 (Effort Alto)** deve executar a sincronização e leitura na ordem exata:

1. **Sincronização do Compilador e Corpus Local (`Kof4j`):**
   - Diretório local: `c:\Users\luiza\OneDrive\Documentos\kof\Kof4j\training` (ou espelho validado em `docs/kof4j/`, `KOF_REFERENCE.md`, `KOF_WEB_REFERENCE.md` e `docs/LLM_KOF_UI_GUIDELINES.md`).
   - Ordem de leitura obrigatória:
     1. `training/README.md` & `training/idioms/architecture.md` (*Menos segregação, mais intenção — Padrão KofLith*)
     2. `training/language/syntax.md` & `training/language/types.md`
     3. `training/anti-patterns/fake-idioms.md` & `training/anti-patterns/sentinel-values.md`
     4. `training/learn/35-kof-ui.md` & `docs/LLM_KOF_UI_GUIDELINES.md`
     5. `training/language/security.md` (`docs/kof4j/security.md`) & `docs/kof4j/web.md`

### 2.2. Prompt Base Copy-Paste para Subagentes (Gemini Flash 3.6 · Effort Alto)

Use exatamente este bloco ao despachar qualquer subagente Worker (Lotes 1, 2 ou 3):

```markdown
<subagent_kof_training_context>
Você é um Subagente Especialista em KOF (KofLang 0.4.x-beta) operando em Gemini Flash 3.6 com Effort Alto no projeto Organiza IA (arquitetura KofLith).

### 1. FONTES DA VERDADE OBRIGATÓRIAS (LEIA ANTES DE TOCAR EM QUALQUER ARQUIVO):
1. Corpus Oficial Kof4j (`c:\Users\luiza\OneDrive\Documentos\kof\Kof4j\training` + `KOF_REFERENCE.md` + `KOF_WEB_REFERENCE.md` + `docs/LLM_KOF_UI_GUIDELINES.md` + `docs/kof4j/`).
2. Design System MVP 1 (`DESIGN_SYSTEM.md`):
   - Design System: https://claude.ai/artifact/JVjueTmHeJsnHLsow3LDVb
   - Desktop: https://claude.ai/artifact/64FYjX5UiveVxTtRGYurQP
   - Mobile: https://claude.ai/artifact/8b3jFV4BrGj4YkDQAwDvDF
3. Especificação SDD do Lote: `.specs/features/mvp1-koflith-attack/spec.md`, `design.md` e `tasks.md`.

### 2. REGRAS DE COMPILAÇÃO KOF (FIREWALL ANTI-ALUCINAÇÃO):
- PROIBIDO usar `fun`, `fn`, `func`, ou `foo() -> Tipo {}` para declarar funções nomeadas. Use `Tipo foo(Param p) { ... }` ou `foo(Param p): Tipo { ... }`.
- PROIBIDO usar indexação `lista[i]` (causa erro fatal `[SEM054]`). Use SEMPRE `lista.get(i)`.
- PROIBIDO usar `for (x in xs)` sem `var`. Use SEMPRE `for (var x in xs)`.
- PROIBIDO inicializar variável com `= null` sem tipo anulável explícito (`[SEM048]`). Use `String? x = null` ou `""`.
- PROIBIDO inventar widgets que não existem no runtime KofJS (`Router`, `Component`, `Spacer`, `ListView`, `BottomNavigationBar`, `Image`). Use EXCLUSIVAMENTE: `Window`, `View`, `Column`, `Row`, `Label`, `Button`, `Input`, `Canvas`, `Style`, `Color`, `Theme`.
- WORKAROUND CRÍTICO KOFJS (`Default.mjs`): Campos `static Color` em classes são emitidos dentro do `constructor()` de instância e chegam `undefined` se lidos estaticamente. Exponha cores e estilos SEMPRE via funções top-level (`Color colorBgPrimary() = Color(10, 13, 24)`) ou instancie `Color(r, g, b)` inline.
- ESTADO REATIVO E ROTEAMENTO: Lambdas capturam escopo somente-leitura. Todo estado mutável entre cliques vive em campos `static` de classes (`AppState.currentScreen`, `SessionState.token`, etc.). Para trocar de tela, atualize `AppState.currentScreen` e chame `window.bind(buildActiveScreen(window))`.
- CLIENTE HTTP (`kof.http`): `http.get(url, headers)` e `http.post(url, body, headers)` retornam `String` pura (NÃO existe `.body` ou `.status`). Headers são uma única `String` com linhas separadas por `\n`.
- CANVAS 2D (`kof.ui.Canvas`): Sequência estrita `canvas.setFill(cor)` -> `canvas.beginPath()` -> `canvas.moveTo(x,y)` -> `canvas.arc(x,y,r,start,end)` -> `canvas.closePath()` -> `canvas.fill()` (sem argumentos em `fill()`).

### 3. GOVERNANÇA GIT E SDLC (INVIOLÁVEL):
1. NUNCA execute `git commit` ou `git push`. Apenas a mantenedora (Luiza) executa commits e pushes manualmente.
2. NUNCA inclua `Co-authored-by:` nas sugestões de mensagens de commit.
3. NUNCA crie arquivos soltos na raiz do projeto.
4. Ao concluir cada tarefa do seu lote, rode o gate `kof check frontend/main.kf` (e `kof check backend/main.kf` quando aplicável) e reporte o sumário compacto ao Orquestrador.
</subagent_kof_training_context>
```

---

## 🏗️ 3. Arquitetura das 4 Fases SDLC + 3 Lotes de Execução (`tlc-spec-driven`)

Seguindo a regra de empacotamento do `tlc-spec-driven` (`~5 a 6 tarefas coesas por subagente, respeitando fronteiras de fase`), o plano de ataque do MVP 1 divide-se em **15 tarefas atômicas (`T1` a `T15`)** distribuídas em **3 Batch Workers** + **1 Verifier Sub-Agent**:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ FASE 1 (SDLC: Design & Specs) — CONCLUÍDA NESTA SESSÃO                              │
│ • DESIGN_SYSTEM.md e README.md atualizados com os 3 artifacts (DS, Desk, Mobile)   │
│ • .specs/features/mvp1-koflith-attack/{spec.md, design.md, tasks.md} gerados       │
└─────────────────────────────────────────┬───────────────────────────────────────────┘
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ LOTE 1 (Batch Worker 1 · Gemini Flash 3.6 High) — Core, Tokens, Estado & API       │
│ • T1: frontend/core/theme.kf (Tokens #0A0D18, #00D4FF, Manrope, 6 categorias)      │
│ • T2: frontend/core/app_state.kf (AppState, SessionState, OnboardingState, etc.)   │
│ • T3: frontend/core/api_client.kf (Cliente HTTP KofLith :3000 + parsers)           │
│ • T4: frontend/components/{brand_header.kf, nav_bar.kf} (3 ondas Canvas + NavBar)  │
└─────────────────────────────────────────┬───────────────────────────────────────────┘
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ LOTE 2 (Batch Worker 2 · Gemini Flash 3.6 High) — Componentes, Auth & Onboarding   │
│ • T5: frontend/components/{pulse_card.kf, envelope_card.kf, chat_bubble.kf}        │
│ • T6: frontend/components/{pie_chart.kf, notification_toast.kf} (Canvas 200px + 5) │
│ • T7: frontend/screens/auth_screens.kf (Telas 1 Boas-vindas, 2 Login, 3 Cadastro)  │
│ • T8: frontend/screens/onboarding_screens.kf (Telas 4 Salário, 5 Renda, 6/6.1 Dív) │
│ • T9: frontend/screens/onboarding_screens.kf (Tela 7 Resultado + Seletor #11/#33)  │
└─────────────────────────────────────────┬───────────────────────────────────────────┘
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ LOTE 3 (Batch Worker 3 · Gemini Flash 3.6 High) — App Principal, Desk/Mobile & E2E │
│ • T10: frontend/screens/dashboard_screen.kf (Tela 8 Dashboard + API Buckets #32)   │
│ • T11: frontend/screens/chat_screen.kf (Tela 9 AI Coach + Motor de Ação #34)       │
│ • T12: frontend/screens/envelopes_screen.kf (Telas 10 Caixinhas + 11 Push Toast)   │
│ • T13: frontend/main.kf (Shell Responsivo Mobile 360x640 + Desktop 1280x800)       │
│ • T14: backend/coach.kf (Fix Issue #41 ASM COMPUTE_FRAMES em calculateDailyPulse)  │
│ • T15: Homologação E2E Completa (scripts/test_e2e_flow.ps1 + parity_test.kf)       │
└─────────────────────────────────────────┬───────────────────────────────────────────┘
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ FASE 3 & 4 (SDLC: Verifier Sub-Agent, Code Review & Commits Manuais da Luiza)      │
│ • Verifier Sub-Agent gera .specs/features/mvp1-koflith-attack/validation.md        │
│ • Luiza revisa git diff e executa os commits manuais (Zero Co-authored-by)         │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 4. Mapeamento de Issues Fechadas por Este Execution Plan

| Issue | Título | Tarefa que Resolve |
|---|---|---|
| **#11** | `feat(frontend): tela de seleção/troca de modelo de orçamento` | **T9 & T10** (`onboarding_screens.kf` + seletor de modelo no cabeçalho do `dashboard_screen.kf`) |
| **#32** | `feat(frontend): Integrar Dashboard com API de Envelopes/Buckets` | **T3 & T10** (`api_client.kf` + `dashboard_screen.kf` consumindo `/api/budgets/daily-pulse`, `/api/envelopes` e `/api/transactions`) |
| **#33** | `feat(frontend): Integrar fluxo de Onboarding com SuggestModel` | **T8 & T9** (`onboarding_screens.kf` submetendo a `POST /api/users/onboarding` e renderizando buckets sugeridos) |
| **#34** | `feat(frontend): Integrar Motor de Ação do Chat` | **T11** (`chat_screen.kf` enviando `POST /api/chat/message` e `POST /api/transactions`, atualizando bolhas e pulso diário) |
| **#41** | `bug(kof4j): ASM COMPUTE_FRAMES crasha ao construir record com Double antes de String? nulo` | **T14** (`backend/coach.kf::calculateDailyPulse` substituindo o literal `null` por `""` no 5º argumento de `GetDailyPulseOutput`) |

---

## 🔒 5. Guia de Commits Manuais (Exclusivo para a Usuária — Zero `Co-authored-by:`)

Ao final de cada tarefa/lote revisado e aprovado na Fase 3 (Code Review), execute manualmente no seu terminal PowerShell:

```powershell
# 0. Commit de Documentação & Plano SDD do MVP 1 (Gerado nesta sessão):
git status
git add DESIGN_SYSTEM.md README.md PROJECT_STATUS.md .specs/STATE.md .specs/features/mvp1-koflith-attack/ docs/MVP1_EXECUTION_PLAN.md
git commit -m "docs(sdd): fechar design system mvp 1 (desk/mobile) e criar execution plan koflith"

# Lote 1 (Core, Theme, State & API Client):
git add frontend/core/ frontend/components/brand_header.kf frontend/components/nav_bar.kf
git commit -m "feat(frontend): implementar core theme mvp 1, estado reativo, api client e navegacao"

# Lote 2 (Widgets do Design System, Auth & Onboarding Adaptativo - Telas 1 a 7):
git add frontend/components/ frontend/screens/auth_screens.kf frontend/screens/onboarding_screens.kf
git commit -m "feat(frontend): implementar componentes do design system e fluxo de auth e onboarding (#11, #33)"

# Lote 3 (Dashboard, Chat Coach, Caixinhas, Shell Mobile/Desktop & Fix #41):
git add frontend/screens/ frontend/main.kf backend/coach.kf PROJECT_STATUS.md
git commit -m "feat(mvp1): integrar dashboard, chat coach, caixinhas e layout desk/mobile ao koflith (#32, #34, #41)"
```
