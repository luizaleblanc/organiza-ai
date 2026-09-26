# 🚀 Plano de Ataque & Execution Plan — MVP 1 (Organiza IA · KofLith 100% KOF)

> **Status Arquitetural:** Backend KofLith (`backend/*.kf`) 100% unificado e homologado em E2E na porta 3000 (`9/9 GREEN`); código legado Java arquivado em `archive/legacy-backend-java/` (Issue #37 fechada); Design System do MVP 1 fechado na tríade oficial do Claude Design.
> **Metodologia:** Spec-Driven Development (`tlc-spec-driven` v3.3.0 — validado contra `validate_spec.py` e `validate_tasks.py`) + SDLC Estrito em 4 Fases (`F1 Design` → `F2 Desenvolvimento` → `F3 Code Review` → `F4 Deploy`).
> **Estratégia de Orquestração:** Delegação em 3 Lotes Sequenciais (*Phase-Aligned Batches*) para subagentes **Gemini Flash 3.6 (Effort Alto)** com protocolo obrigatório de treinamento prévio nas 7 categorias do corpus `KofLang/Kof4j/training`.

---

## 🎨 1. Tríade de Referência Oficial do Design System (MVP 1)

Todo agente e subagente escalado para o MVP 1 deve consultar as 3 fontes visuais canônicas juntamente com [`DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) e [`specs/PHASE_1_CORE_MVP.md`](../specs/PHASE_1_CORE_MVP.md):

| Artefato | Link Oficial | Escopo no `kof.ui` (`frontend/*.kf`) |
|---|---|---|
| **1. Design System (Core)** | [https://claude.ai/artifact/JVjueTmHeJsnHLsow3LDVb](https://claude.ai/artifact/JVjueTmHeJsnHLsow3LDVb) | Paleta `#0A0D18` / `#12162A` / `#1A1F3A` / `#00D4FF`, tipografia Manrope (pesos 400/500/600, `tabular-nums`), Logomark 3 ondas paralelas (2:1), Cards, Inputs, Barras de Progresso (Normal/Alerta/Perigo) e 5 Modelos de Notificação Push. |
| **2. Protótipo Desktop** | [https://claude.ai/artifact/64FYjX5UiveVxTtRGYurQP](https://claude.ai/artifact/64FYjX5UiveVxTtRGYurQP) | Workspace Web/Desktop (`1280×800`) em 3 colunas (`Row`): Sidebar de navegação à esquerda + Área central (Dashboard, Buckets, Caixinhas) + Painel lateral ao vivo do AI Coach à direita. |
| **3. Protótipo Mobile** | [https://claude.ai/artifact/8b3jFV4BrGj4YkDQAwDvDF](https://claude.ai/artifact/8b3jFV4BrGj4YkDQAwDvDF) | Viewport Mobile canônico (`360×640`) cobrindo a sequência completa das **11 Telas**: (1) Boas-vindas, (2) Login, (3) Cadastro, (4) Salário, (5) Tipo de Renda, (6) Dívidas, (6.1) Valor da Dívida, (7) Resultado do Modelo, (8) Dashboard, (9) Chat Coach, (10) Caixinhas e (11) Toast de Notificação Push. |

---

## 🧠 2. Protocolo Completo de Treinamento KOF (`KofLang/Kof4j/training`) para Subagentes Gemini Flash 3.6 (Effort Alto)

Conforme a **Guideline de Uso de IA** do [`README.md`](../README.md), [`CONTRIBUTING.md`](../CONTRIBUTING.md) e [`AGENT_GUIDELINES.md`](../AGENT_GUIDELINES.md), nenhum subagente tem permissão para escrever uma única linha de `.kf` sem antes ingerir as **7 categorias oficiais** da pasta `training/` do repositório [KofLang/Kof4j](https://github.com/KofLang/Kof4j/tree/main/training) (disponível localmente em `c:\Users\luiza\OneDrive\Documentos\kof\Kof4j\training` e espelhada em [`docs/kof4j/`](kof4j/README.md), [`KOF_REFERENCE.md`](../KOF_REFERENCE.md), [`KOF_WEB_REFERENCE.md`](../KOF_WEB_REFERENCE.md) e [`docs/LLM_KOF_UI_GUIDELINES.md`](LLM_KOF_UI_GUIDELINES.md)).

### 2.1. Síntese Canônica das 7 Subpastas de `KofLang/Kof4j/training`

| Subpasta `training/` | Arquivos-Chave | Diretrizes Obrigatórias Extraídas para o MVP 1 |
|---|---|---|
| **1. `training/README.md`** | `training/README.md` | Ordem oficial de aprendizado: ler gramática e sistema de tipos primeiro, depois `idioms/`, `patterns/` e `anti-patterns/fake-idioms.md`. Regra de ouro: *se a IA gerou `.kf`, rode `kof check` antes de confiar*. |
| **2. `training/language/`** | `syntax.md`, `types.md`, `io.md`, `ui.md`, `security.md`, `exceptions.md` | • **Funções nomeadas**: `Tipo foo(Param p) { ... }` ou `foo(Param p): Tipo { ... }` (sem `fun`/`fn`/`func` e nunca `foo() -> Tipo {}`, pois `->` é exclusivo de lambdas).<br>• **Loops**: `for (var x in lista) { ... }` (`var` é obrigatório).<br>• **Listas**: `listOf(...)`, acesso via `lista.get(i)` (nunca `lista[i]`, que causa erro `[SEM054]`).<br>• **Null Safety**: `String? x = null` com narrowing `if (x != null)` (nunca `String x = null`, erro `[SEM048]`).<br>• **Exceções**: São `String` (`throw "msg"` / `catch (String e)`).<br>• **Segurança (`kof.security`)**: `passwords.hash(pwd)`, `passwords.verify(pwd, hash)`, `jwt.create(payload, secret, ttl)`, `jwt.verify(tok, secret)` (sempre HS256), `security.constantTimeEquals(a, b)`. |
| **3. `training/idioms/`** | `architecture.md`, `functions.md`, `classes.md`, `records.md`, `errors.md`, `database.md` | • **KofLith (`architecture.md`)**: *Menos segregação, mais intenção*. Entidades de banco são `entity`, dados imutáveis/DTOs são `record`, estado compartilhado vive em `class` com campos `static`, regras de negócio são funções top-level diretas.<br>• **Zero Factory Trivial (`classes.md`)**: Não criar wrappers triviais em volta de `Button(...)`; instanciar `Button(label, () -> { ... })` diretamente ou compor em funções que agregam layout real (`View` + `Style`).<br>• **Records + JSON (`records.md`)**: `json.encode(rec)` e `json.decode<MeuRecord>(jsonStr)`. |
| **4. `training/patterns/`** | `common-patterns.md` | • **Servidor `kof.web`**: `var app = web.app()`, rotas `app.get/post/put/delete/patch/options`, contexto por ThreadLocal (`body()`, `param("id")`, `query("k")`, `header("Authorization")` que retorna `null` se ausente, `status(code, body)`).<br>• **Estado Reativo UI**: `class AppState { static String currentScreen = "welcome" }` mutado dentro de lambdas `() -> { AppState.currentScreen = "login"; window.bind(buildActiveScreen(window)) }`. |
| **5. `training/anti-patterns/`** | `fake-idioms.md`, `sentinel-values.md` | • **Fake Idioms Proibidos**: `async`/`await` (use `spawn`/`await`), `var` como tipo de parâmetro (`foo(var x)` é inválido — use tipo explícito `foo(String x)`), `.equals()` (use `==`), array literal `[1, 2, 3]` (use `listOf(1, 2, 3)`), `Option<T>` (use `T?`), `resp.body`/`resp.status` em chamadas `http.*`.<br>• **Sentinel Values (`sentinel-values.md`)**: Não espalhar `"-1"` ou `"NOT_FOUND"` como sentinelas de domínio; usar `T?` para ausência esperada e `throw "erro"` para falha real. |
| **6. `training/reference/`** | `stdlib-web.md`, `stdlib-database.md`, `kof-ui.md`, `kof-http.md` | • **HTTP Client (`kof.http`)**: `http.get(url, headers)` e `http.post(url, body, headers)` retornam `String` pura. Headers são uma única `String` com linhas separadas por `\n` (`"Authorization: Bearer " + tok + "\nContent-Type: application/json"`).<br>• **Widgets `kof.ui` 100% Portáveis**: `Window`, `View`, `Column`, `Row`, `Label`, `Button`, `Input`, `Style`, `Color`, `Theme`, `Palette` (+ `Canvas` em `0.4.0-beta+`). |
| **7. `training/migration/`** | `java-to-kof.md` | • **Erradicação de Boilerplate Java**: Substituir `@Service`/`@Controller`/getters/setters/Lombok por funções top-level e `record`s; substituir `BigDecimal` por `Double` com `math.roundTo(val, 2)` e formatação monetária limpa no frontend (`"R$ 1.640,00"`). |

---

### 2.2. Prompt Base Copy-Paste para Subagentes (Gemini Flash 3.6 · Effort Alto)

Ao despachar qualquer um dos 3 subagentes Workers (`Batch Worker 1`, `Batch Worker 2` ou `Batch Worker 3`), forneça exatamente este prompt de sistema/contexto:

```markdown
<subagent_kof_training_context>
Você é um Subagente Especialista em KOF (KofLang 0.4.x-beta) operando em Gemini Flash 3.6 com Effort Alto no projeto Organiza IA (arquitetura KofLith).

### 1. FONTES DA VERDADE OBRIGATÓRIAS (LEIA ANTES DE TOCAR EM QUALQUER ARQUIVO):
1. Corpus Oficial Kof4j (`c:\Users\luiza\OneDrive\Documentos\kof\Kof4j\training` — `README.md`, `language/`, `idioms/`, `patterns/`, `anti-patterns/`, `reference/`, `migration/` — e espelhos locais em `KOF_REFERENCE.md`, `KOF_WEB_REFERENCE.md`, `docs/LLM_KOF_UI_GUIDELINES.md` e `docs/kof4j/`).
2. Tríade do Design System MVP 1 (`DESIGN_SYSTEM.md`):
   - Design System (Tokens & Catálogo): https://claude.ai/artifact/JVjueTmHeJsnHLsow3LDVb
   - Protótipo Desktop (1280x800): https://claude.ai/artifact/64FYjX5UiveVxTtRGYurQP
   - Protótipo Mobile (360x640): https://claude.ai/artifact/8b3jFV4BrGj4YkDQAwDvDF
3. Especificação SDD do Lote: `.specs/features/mvp1-koflith-attack/spec.md`, `design.md` e `tasks.md`.

### 2. REGRAS DE COMPILAÇÃO KOF (FIREWALL ANTI-ALUCINAÇÃO `training/anti-patterns/fake-idioms.md`):
- PROIBIDO usar `fun`, `fn`, `func`, ou `foo() -> Tipo {}` para declarar funções nomeadas. Use `Tipo foo(Param p) { ... }` ou `foo(Param p): Tipo { ... }`.
- PROIBIDO usar `var` como tipo de parâmetro (`foo(var w)` não compila). Sempre explicite o tipo (`foo(Window w)`).
- PROIBIDO usar indexação `lista[i]` (causa erro fatal `[SEM054]`). Use SEMPRE `lista.get(i)`.
- PROIBIDO usar `for (x in xs)` sem `var`. Use SEMPRE `for (var x in xs)`.
- PROIBIDO inicializar variável com `= null` sem tipo anulável explícito (`[SEM048]`). Use `String? x = null` ou `""`.
- PROIBIDO inventar widgets inexistentes (`Router`, `Component`, `Spacer`, `ListView`, `BottomNavigationBar`, `Image`, `Dropdown`). Use os widgets `kof.ui` confirmados: `Window`, `View`, `Column`, `Row`, `Label`, `Button`, `Input`, `Style`, `Color`, `Theme` (e `Canvas` apenas se `kof check` for 0.4.0-beta+; mantenha sempre o fallback em `Row`/`View(Style)` para garantir 0 erros tanto em Kof 0.3.1-beta quanto em 0.4.1-beta).
- WORKAROUND CRÍTICO KOFJS (`Default.mjs`): Campos `static Color` em classes são emitidos dentro do `constructor()` de instância e chegam `undefined` (`rgba(0,0,0,0)`) se lidos estaticamente. Exponha cores e estilos SEMPRE via funções top-level (`Color colorBgPrimary() = Color(10, 13, 24)`) ou instancie `Color(r, g, b)` inline.
- ESTADO REATIVO E ROTEAMENTO: Lambdas capturam escopo somente-leitura. Todo estado mutável entre cliques vive em campos `static` de classes (`AppState.currentScreen`, `SessionState.token`, etc.). Para trocar de tela, atualize `AppState.currentScreen` e chame `window.bind(buildActiveScreen(window))`.
- CLIENTE HTTP (`kof.http`): `http.get(url, headers)` e `http.post(url, body, headers)` retornam `String` pura (NÃO existe `.body` ou `.status`). Headers são uma única `String` com linhas separadas por `\n`.
- PREVENÇÃO DE `COMP002` / `ASM COMPUTE_FRAMES`: Mantenha funções de UI enxutas (< 35 linhas por helper) e nunca passe literal `null` após campos `Double` em construtores de `record`.

### 3. GOVERNANÇA GIT E SDLC (INVIOLÁVEL):
1. NUNCA execute `git commit` ou `git push`. Apenas a mantenedora (Luiza) executa commits e pushes manualmente.
2. NUNCA inclua `Co-authored-by:` nas sugestões de mensagens de commit.
3. NUNCA crie arquivos soltos na raiz do projeto. Respeite a regra `1 tarefa = 1 arquivo modificado/criado` de `tasks.md`.
4. Ao concluir cada tarefa do seu lote, rode o gate `kof check frontend/main.kf` (e `kof check backend/main.kf` quando aplicável) e reporte o sumário compacto ao Orquestrador.
</subagent_kof_training_context>
```

---

## 🏗️ 3. Arquitetura das 4 Fases SDLC + 3 Lotes de Execução (`tlc-spec-driven`)

Seguindo a regra de empacotamento do `tlc-spec-driven` (`~5 a 6 tarefas atômicas por subagente, 1 arquivo por tarefa, respeitando fronteiras de fase`), o plano de ataque do MVP 1 divide-se em **15 tarefas atômicas (`T1` a `T15`)** distribuídas em **3 Batch Workers** + **1 Verifier Sub-Agent**:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ FASE 1 (SDLC: Design & Specs) — CONCLUÍDA E VALIDADA NESTA SESSÃO                   │
│ • DESIGN_SYSTEM.md, README.md, PROJECT_STATUS.md e specs/PHASE_1_CORE_MVP.md        │
│ • .specs/features/mvp1-koflith-attack/{spec.md, design.md, tasks.md} (0 erros/warns)│
└─────────────────────────────────────────┬───────────────────────────────────────────┘
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ LOTE 1 (Batch Worker 1 · Gemini Flash 3.6 High) — Fase 1: Core, Tokens, State & API │
│ • T1: frontend/core/theme.kf (Tokens #0A0D18, #00D4FF, Manrope, 6 categorias)       │
│ • T2: frontend/core/app_state.kf (AppState, SessionState, OnboardingState, etc.)    │
│ • T3: frontend/core/api_client.kf (Cliente HTTP KofLith :3000 + parsers + fallback) │
│ • T4: frontend/components/navigation_chrome.kf (Logomark 3 ondas + NavBar/Sidebar)  │
└─────────────────────────────────────────┬───────────────────────────────────────────┘
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ LOTE 2 (Batch Worker 2 · Gemini Flash 3.6 High) — Fase 2: Widgets, Auth & Onboard   │
│ • T5: frontend/components/cards.kf (PulseCard, EnvelopeCard, TxCard, ChatBubble)    │
│ • T6: frontend/components/visual_widgets.kf (Bucket Chart + 5 Notification Toasts)  │
│ • T7: frontend/screens/auth_screens.kf (Telas 1 Boas-vindas, 2 Login, 3 Cadastro)   │
│ • T8: frontend/screens/onboarding_steps_screens.kf (Telas 4, 5, 6 e 6.1 Dívida)     │
│ • T9: frontend/screens/onboarding_result_screen.kf (Tela 7 + Seletor #11 e #33)     │
└─────────────────────────────────────────┬───────────────────────────────────────────┘
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ LOTE 3 (Batch Worker 3 · Gemini Flash 3.6 High) — Fases 3 & 4: App, Shell & E2E     │
│ • T10: frontend/screens/dashboard_screen.kf (Tela 8 Dashboard + API Buckets #32)    │
│ • T11: frontend/screens/chat_screen.kf (Tela 9 AI Coach + Motor de Ação #34)        │
│ • T12: frontend/screens/envelopes_screen.kf (Telas 10 Caixinhas + 11 Push Toast)    │
│ • T13: frontend/main.kf (Shell Responsivo Mobile 360x640 + Desktop 1280x800)        │
│ • T14: backend/coach.kf (Fix Issue #41 ASM COMPUTE_FRAMES em calculateDailyPulse)   │
│ • T15: .specs/features/mvp1-koflith-attack/validation.md (Homologação E2E 9/9)      │
└─────────────────────────────────────────┬───────────────────────────────────────────┘
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ FASE 3 & 4 (SDLC: Verifier Sub-Agent, Code Review & Commits Manuais da Luiza)       │
│ • Verifier Sub-Agent audita evidências file:line em validation.md (PASS)            │
│ • Luiza revisa git diff e executa os commits manuais (Zero Co-authored-by)          │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 4. Mapeamento de Issues Fechadas por Este Execution Plan

| Issue | Título | Tarefa que Resolve |
|---|---|---|
| **#11** | `feat(frontend): tela de seleção/troca de modelo de orçamento` | **T9 & T10** (`onboarding_result_screen.kf` + seletor de modelo no cabeçalho do `dashboard_screen.kf`) |
| **#25** | `docs: Atualizar spec do MVP 1 por estar obsoleto` | **Fase 1 (Concluída)** (`specs/PHASE_1_CORE_MVP.md` + `.specs/features/mvp1-koflith-attack/spec.md`) |
| **#32** | `feat(frontend): Integrar Dashboard com API de Envelopes/Buckets` | **T3 & T10** (`api_client.kf` + `dashboard_screen.kf` consumindo `/api/budgets/daily-pulse`, `/api/envelopes` e `/api/transactions`) |
| **#33** | `feat(frontend): Integrar fluxo de Onboarding com SuggestModel` | **T8 & T9** (`onboarding_steps_screens.kf` + `onboarding_result_screen.kf` submetendo a `POST /api/users/onboarding` e renderizando buckets sugeridos) |
| **#34** | `feat(frontend): Integrar Motor de Ação do Chat` | **T11** (`chat_screen.kf` enviando `POST /api/chat/message` e `POST /api/transactions`, atualizando bolhas e pulso diário) |
| **#41** | `bug(kof4j): ASM COMPUTE_FRAMES crasha ao construir record com Double antes de String? nulo` | **T14** (`backend/coach.kf::calculateDailyPulse` substituindo o literal `null` por `""` no 5º argumento de `GetDailyPulseOutput`) |

---

## 🔒 5. Guia de Commits Manuais (Exclusivo para a Usuária — Zero `Co-authored-by:`)

Ao final de cada fase/lote revisado e aprovado na Fase 3 (Code Review), execute manualmente no seu terminal PowerShell:

```powershell
# 0. Commit de Documentação & Plano SDD do MVP 1 (Gerado nesta sessão):
git status
git add DESIGN_SYSTEM.md README.md PROJECT_STATUS.md specs/PHASE_1_CORE_MVP.md .specs/STATE.md .specs/features/mvp1-koflith-attack/ docs/MVP1_EXECUTION_PLAN.md
git commit -m "docs(sdd): fechar design system mvp 1 (desk/mobile) e criar execution plan koflith"

# Lote 1 (Core, Theme, State, API Client & Navigation Chrome - T1 a T4):
git add frontend/core/ frontend/components/navigation_chrome.kf
git commit -m "feat(frontend): implementar core theme mvp 1, estado reativo, api client e navegacao"

# Lote 2 (Widgets do Design System, Auth & Onboarding Adaptativo - Telas 1 a 7 - T5 a T9):
git add frontend/components/cards.kf frontend/components/visual_widgets.kf frontend/screens/auth_screens.kf frontend/screens/onboarding_steps_screens.kf frontend/screens/onboarding_result_screen.kf
git commit -m "feat(frontend): implementar componentes do design system e fluxo de auth e onboarding (#11, #33)"

# Lote 3 (Dashboard, Chat Coach, Caixinhas, Shell Mobile/Desktop & Fix #41 - T10 a T15):
git add frontend/screens/dashboard_screen.kf frontend/screens/chat_screen.kf frontend/screens/envelopes_screen.kf frontend/main.kf backend/coach.kf PROJECT_STATUS.md .specs/features/mvp1-koflith-attack/validation.md
git commit -m "feat(mvp1): integrar dashboard, chat coach, caixinhas e layout desk/mobile ao koflith (#32, #34, #41)"
```
