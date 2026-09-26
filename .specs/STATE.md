# Project Memory & Decisions Log

## Architecture Decisions

### AD-001: Arquitetura Monolítica Modular KofLith (Menos Segregação, Mais Intenção)
- **Status:** Approved
- **Context:** O projeto Organiza IA possuía o frontend em `kof.ui` e o BFF em `kof.web`, mas o backend de negócios e dados ainda residia em Java/Spring Boot (conversando via proxy HTTP local `http://localhost:8080`). Separar front e back em dois mundos desacoplados com proxies HTTP locais contraria a filosofia central da linguagem Kof (`training/idioms/architecture.md`), que preconiza zero cerimônia e unificação de intenção.
- **Decision:** Estruturar todo o sistema oficialmente como uma **Arquitetura Monolítica Modular (KofLith)**: transpilando e organizando a camada de domínio (`mod_user`, `mod_transaction`, `mod_budget`, `mod_variable_income`, `mod_ai_coach`) em módulos `.kf` coesos e bem delimitados (`backend/models.kf`, `backend/auth.kf`, `backend/services.kf`, `backend/coach.kf`, `backend/main.kf`) e a interface em pacotes modulares (`frontend/core/`, `frontend/components/`, `frontend/screens/`).
- **Safety Protocol:** O código Java permanece intacto em `archive/legacy-backend-java/` como fonte da verdade (*ground truth*) e especificação histórica.

### AD-002: MVP 1 Design System Triad (Desk + Mobile) & KofUI Modular Monolith
- **Status:** Approved (2026-09-25)
- **Context:** Com o **Monólito Modular KofLith** 100% unificado e homologado na porta 3000 (`backend/*.kf`) e o legado Java arquivado em `archive/legacy-backend-java/` (Issue #37), o foco do MVP 1 desloca-se para o fechamento ponta a ponta dos módulos da interface `kof.ui` (`frontend/*.kf`) em total fidelidade aos 3 artefatos finais do Design System (`JVjueTmHeJsnHLsow3LDVb` Design System, `64FYjX5UiveVxTtRGYurQP` Desktop, `8b3jFV4BrGj4YkDQAwDvDF` Mobile).
- **Decision:** Reconstruir e integrar as telas e componentes em `frontend/` usando estritamente primitivas reais confirmadas no compilador Kof4j (`Window`, `View`, `Column`, `Row`, `Label`, `Button`, `Input`, `Canvas`, `Style`, `Color`, `Theme`), gerenciando estado e roteamento via campos `static` de classe (`AppState.currentScreen` + `window.bind(view)`), com funções top-level para cores (`Color(r,g,b)`) contornando o bug de inicialização estática no `Default.mjs`, e delegando lotes de tarefas para subagentes **Gemini Flash 3.6 (Effort Alto)** pré-treinados na pasta `training/` do Kof4j.

## Handoff Snapshot
- **Current Feature:** `mvp1-koflith-attack`
- **Branch:** `main`
- **Phase:** Tasks Ready / Ready to Execute Batch 1 (SDD 4-Phase Execution Plan generated in `.specs/features/mvp1-koflith-attack/` and `docs/MVP1_EXECUTION_PLAN.md`)
- **Gate:** `kof check backend` (0 errors) + `kof check frontend` (0 errors) + `scripts/test_e2e_flow.ps1` (9/9 GREEN)


