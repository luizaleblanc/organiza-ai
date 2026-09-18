# Project Memory & Decisions Log

## Architecture Decisions

### AD-001: KofLith Monolith Unification (Menos Segregação, Mais Intenção)
- **Status:** Approved
- **Context:** O projeto Organiza IA possuía o frontend em `kof.ui` e o BFF em `kof.web`, mas o backend de negócios e dados ainda residia em Java/Spring Boot (conversando via proxy HTTP local `http://localhost:8080`). Separar front e back em dois mundos desacoplados com proxies HTTP locais contraria a filosofia central da linguagem Kof (`training/idioms/architecture.md`), que preconiza zero cerimônia e unificação de intenção.
- **Decision:** Transpilar progressivamente toda a camada de domínio Java (`mod_user`, `mod_transaction`, `mod_budget`, `mod_variable_income`, `mod_ai_coach`) para Kof idiomático (`backend/*.kf`), unificando o monólito no padrão KofLith.
- **Safety Protocol:** O código Java permanece intacto no repositório como fonte da verdade (*ground truth*) e especificação executável até que 100% dos módulos Kof compilem via `kof check` com paridade comportamental confirmada. Apenas após a validação completa o código Java será descontinuado.

## Handoff Snapshot
- **Current Feature:** `koflith-transpilation`
- **Branch:** `main`
- **Phase:** Execute (Task 1: Core Services commitado; Task 2: Coach module transpilado)
- **Gate:** `kof check backend` (0 errors)

