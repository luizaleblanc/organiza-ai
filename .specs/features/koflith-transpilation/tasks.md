# Tasks: KofLith Monolithic Transpilation

## Phase 1: Foundation & Core Repositories
- [x] **Task 1.1: Validação do `backend/services.kf`**
  - **Tests:** `kof check backend` (0 errors)
  - **Gate:** Passa no typechecker oficial do Kof.
  - **Commit:** `feat(backend): transpolar servicos e repositorios core para KOF (services.kf)`

## Phase 2: AI Coach & Cognitive Logic Transpilation
- [ ] **Task 2.1: Implementar `backend/coach.kf`**
  - Transpolar `CategoryBucketMapper`, `GetDailyPulseFunction`, `GetBalanceFunction`, `RegisterIncomeFunction`, `SuggestModelChangeFunction` e `KakeiboReflectionService`.
  - Atualizar `backend/models.kf` com `KakeiboReflectionEntity`.
  - **Tests:** `kof check backend`
  - **Gate:** 0 erros no typechecker de todo o diretório `backend/`.
  - **Commit:** `feat(coach): transpolar modulo de IA e logica cognitiva para KOF (backend/coach.kf)`

## Phase 3: Monolith Unification (KofLith)
- [ ] **Task 3.1: Conectar rotas do `bff/main.kf` diretamente aos serviços Kof**
  - Eliminar proxy `http.post("http://localhost:8080/...")` em favor de chamadas diretas às funções Kof do `backend/`.
  - **Tests:** `kof check bff`
  - **Gate:** Rotas resolvendo tipos sem proxy externo.
  - **Commit:** `feat(bff): unificar rotas e servicos no padrao KofLith monolitico (bff/main.kf)`

## Phase 4: Documentation, Parity Verification & LinkedIn Post
- [ ] **Task 4.1: Atualizar `README.md` e `PROJECT_STATUS.md`**
  - Explicar a unificação KofLith em português claro e gramaticalmente perfeito.
  - **Commit:** `docs: atualizar README e status do projeto com a migracao KofLith`
- [ ] **Task 4.2: Elaborar Post Técnico para LinkedIn**
  - Apresentar o salto arquitetural, a redução de cerimônia e a comprovação prática da filosofia KOF.

