# Guia de Contribuição

Para mantermos o projeto organizado e escalável, todos os contribuidores devem seguir nosso Ciclo de Vida de Software (SDLC) e entender nossa arquitetura base.

---

## Arquitetura Monolítica Modular (KofLith) e Stack Tecnológica

O **Organiza AI** adota especificamente uma **Arquitetura Monolítica Modular** batizada de **KofLith** (*Menos segregação, mais intenção*), 100% escrita e compilada na linguagem **KOF** (`Kof4j`). O antigo backend em Java/Spring Boot foi descontinuado do runtime e arquivado em `archive/legacy-backend-java/` (tag histórica `legacy/java-spring-boot`, Issue #37) apenas como referência científica (*Ground Truth*).

| Camada | Tecnologia | Descrição |
|---|---|---|
| **Arquitetura Base** | **Monólito Modular (KofLith)** | Implantação unificada sem microsserviços ou proxies intermediários, estruturada em módulos de domínio coesos (`backend/`) e módulos de interface (`frontend/`). |
| **Monólito Modular Backend** | KOF (`kof.web`, `backend/*.kf`) | Gateway HTTP nativo na porta `3000` (`main.kf`), autenticação JWT HS256 (`auth.kf`), entidades e contratos (`models.kf`), regras de negócio (`services.kf` — renda fixa/variável, envelopes, transações, tiers) e motor cognitivo do AI Coach + Pulso Diário + 6 modelos de orçamento adaptativos (`coach.kf`). |
| **Monólito Modular Frontend** | KOF (`kof.ui`, `frontend/*.kf`) | Interface reativa Dual Viewport (Mobile `360×640` e Desktop `1280×800`) compilada para KofJS/JVM, organizada nos módulos `core/`, `components/` e `screens/`. |
| **Banco de Dados** | MySQL no Render | Modelo relacional integrado (`docs/DATA_MODEL.md`), com suporte a execução in-memory/repositório KOF para desenvolvimento e testes E2E rápidos. |
| **Código Legado (Arquivado)** | Java 17 / Spring Boot (Inativo) | Arquivado em `archive/legacy-backend-java/`. **Não compila nem faz parte do runtime.** Mantido apenas como histórico de paridade. |

```text
organiza-ai/
  backend/                 # Monólito Modular KofLith -- Domínio e Gateway HTTP (.kf)
    main.kf                # Servidor HTTP nativo na porta 3000 (kof.web)
    models.kf              # Entidades (record) e Enums de domínio
    auth.kf                # Middleware e segurança JWT HS256
    services.kf            # Serviços Core (User, Envelope, Transaction, VariableIncome, Tier)
    coach.kf               # Motor do AI Coach, Daily Pulse, Kakeibo e recomendação de orçamento

  frontend/                # Monólito Modular KofUI -- Interface Mobile & Desktop (.kf)
    main.kf                # Entrypoint Window e dispatcher de telas
    core/                  # theme.kf (tokens/cores), app_state.kf (static) e api_client.kf
    components/            # Widgets reutilizáveis e gráficos Canvas 2D (pie_chart, pulse_card...)
    screens/               # 11 Telas do MVP 1 (Auth, Onboarding, Dashboard, Chat, Caixinhas)

  tests/                   # Testes de paridade diferencial (parity_test.kf)
  scripts/                 # Automação E2E (test_e2e_flow.ps1) e Benchmarks (benchmark_kof.ps1)
  .specs/                  # Especificações SDD 4-Fases (STATE.md, features/mvp1-koflith-attack/)
  docs/                    # Documentação técnica, Design System, Benchmarks e corpus Kof4j
  archive/
    legacy-backend-java/   # Backend Java/Spring Boot arquivado (somente referência histórica)
```

---

## Ciclo de Vida do Software (Spec-Driven SDLC)

O desenvolvimento segue o fluxo **Spec-Driven Development (`tlc-spec-driven`)** em 4 fases rígidas:

### Fase 1 -- Design & Especificação (`.specs/`)

Modelagem visual de dados em Mermaid.js, fidelidade à tríade do Design System (`DESIGN_SYSTEM.md`) e aprovação das especificações (`spec.md`, `design.md`, `tasks.md`) antes de escrever código:

- Diagramas ER em `docs/DATA_MODEL.md`
- Especificações da feature em `.specs/features/<feature>/` e plano executivo em `docs/MVP1_EXECUTION_PLAN.md`
- Aprovação da maintainer obrigatória antes de prosseguir

### Fase 2 -- Desenvolvimento (Monólito Modular KOF)

Implementação modular em KOF respeitando estritamente o corpus oficial (`docs/kof4j/` e `KOF_REFERENCE.md`).

**Backend Monolítico Modular (`backend/*.kf` — `kof.web`):**
```text
record/enum (models.kf) -> funções de domínio/serviço (services.kf / coach.kf) -> rota HTTP (main.kf) -> kof check backend + scripts/test_e2e_flow.ps1
```

**Frontend Monolítico Modular (`frontend/*.kf` — `kof.ui`):**
```text
tokens/state class (core/) -> widgets/Canvas (components/) -> screen builder (screens/) -> window.bind (main.kf) -> kof check frontend
```

### Fase 3 -- Code Review

Regras rigorosas de Pull Requests para garantir a qualidade do código recebido pela comunidade open source:

- Cada PR tem escopo de **um módulo ou lote (`Batch`)** bem delimitado
- Typecheck limpo obrigatório (`kof check backend` e `kof check frontend` com `0` erros)
- Suíte E2E passando (`scripts/test_e2e_flow.ps1` — `9/9 GREEN`)
- Aprovação da maintainer

### Fase 4 -- Deploy, CI/CD e Benchmarks
- **CI de Verificação KOF (`.github/workflows/kof-check.yml`):** roda `kof check` a cada push/PR que toque arquivos `.kf`.
- **CI de Benchmarks Empíricos (`.github/workflows/benchmarks.yml`):** coleta métricas de compilação, footprint de artefatos e paridade (`docs/BENCHMARKS.md`).
- **Monólito KofLith:** executado via `kof serve backend/main.kf --port 3000`.
- Merge na `main` somente via PR aprovado e validado.

---

## Pré-requisitos

| Ferramenta | Versão | Necessário para |
|---|---|---|
| **JDK** | 25 (Temurin) | Compilador e runtime do KOF (`Kof4j`) |
| **KOF CLI (`kof`)** | 0.4.0-alpha+ | Compilação, typecheck (`kof check`), servidor (`kof serve`) e UI (`--target=js`) |
| **Docker Desktop** | Qualquer (Opcional) | MySQL local (`compose.yml`) |
| **Git** | 2.40+ | Versionamento |

## Setup do Ambiente

### 1. Clone o repositório

```bash
git clone https://github.com/luizaleblanc/organiza-ai.git
cd organiza-ai
cp .env.example .env
# Preencha .env com API_SECURITY_TOKEN_SECRET (mínimo 32 caracteres)
```

### 2. Instalar o KOF (`Kof4j`)

**Build do código-fonte oficial (recomendado para ter a versão mais recente do compilador):**
```bash
git clone https://github.com/KofLang/Kof4j.git
cd Kof4j
mvn clean package -DskipTests
# Adicione o binário kof / kof.bat gerado ao seu PATH
kof version
```

**Ou via release pré-compilada (Windows):**
```powershell
# Baixar de https://github.com/KofLang/Kof4j/releases
Expand-Archive -Path "$HOME\Downloads\kof-windows-*.zip" -DestinationPath "C:\kof"
setx PATH "$env:PATH;C:\kof\bin"
kof version
```

### 3. Validar e rodar o Monólito Modular Backend (`backend/`)

O monólito KofLith unifica o gateway HTTP, a autenticação JWT e os módulos de domínio na porta `3000`:

```powershell
# 1. Validar tipos e semântica de todos os módulos do backend
kof check backend

# 2. Subir o servidor KofLith na porta 3000
$env:API_SECURITY_TOKEN_SECRET="organiza-ai-local-dev-secret-key-2026-koflith-32b"
kof serve backend/main.kf --port 3000
# Disponível em http://localhost:3000 (ex: GET http://localhost:3000/health)
```

### 4. Rodar a suíte de testes E2E do Monólito

Com o `backend/main.kf` rodando (ou deixando o próprio script gerenciar), valide os 9 fluxos críticos do sistema:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test_e2e_flow.ps1
```

### 5. Validar e rodar o Monólito Modular Frontend (`frontend/`)

```powershell
# 1. Validar tipos e semântica de todos os módulos da interface
kof check frontend

# 2. Compilar e abrir a interface em modo Web/KofJS
kof run --target=js frontend/main.kf
```

---

## Padrões de Código (100% KOF)

### Backend Monolítico Modular (`backend/*.kf`)

- **Entidades e Contratos (`models.kf`):** usar `record` nativo do KOF (imutável por padrão) e `enum`. Nunca criar getters/setters estilo Java.
- **Valores monetários:** usar `Double` (ponto flutuante de 64 bits no KOF).
- **Regras de Negócio (`services.kf`, `coach.kf`):** funções top-level diretas e classes de serviço coesas (`training/idioms/architecture.md`).
- **Segurança (`auth.kf`):** usar `kof.security` (`passwords.hash`, `passwords.verify`, `security.constantTimeEquals`) e JWT HS256.
- **Exceções e Null Safety:** KOF usa `throw "Mensagem"` / `catch (String e)` e tipos anuláveis explícitos `String? s = null` com *smart cast* (`if (s != null)`).

### Frontend Monolítico Modular (`frontend/*.kf`)

- **Arquivos:** `snake_case.kf` organizados em `core/`, `components/` e `screens/`
- **Classes e Records:** `PascalCase`
- **Funções:** `camelCase` (sem palavra-chave `fun`/`fn`/`func`)
- **Estado mutável e Navegação (`core/app_state.kf`):** campos `static` em classes de estado (`AppState`, `SessionState`, `DashboardState`, `ChatState`) + re-renderização via `window.bind(view)`. Nunca usar APIs inexistentes como `Router.*`, `Component.*` ou `Spacer.*`.
- **Cores e Estilos (`core/theme.kf`):** expor cores via funções top-level (`Color colorBgPrimary() = Color(10, 13, 24)`) para contornar o bug de inicialização estática no `Default.mjs`.
- **Composição:** `Window` > `View(Style)` > `Column` / `Row` > widgets (`Label`, `Button`, `Input`, `Canvas`)
- **Target:** sempre validar com `kof check frontend` e rodar com `--target=js`

### Tom de voz

Textos voltados ao usuário seguem o tom de voz da marca: linguagem simples, acolhedora, sem jargão financeiro e sem julgamento. Consulte `DESIGN_SYSTEM.md`.

---

## Fluxo de Pull Request

O projeto usa três branches de integração permanentes -- `main`, `qa` e `dev` -- além das branches de feature. Uma mudança só chega em `main` depois de passar pelos dois ambientes intermediários.

### 1. Branch

Toda branch de feature nasce a partir do commit mais recente (HEAD) de `main` -- nunca a partir de `dev` ou `qa`, que podem estar à frente ou atrás de `main` em experimentos ainda não promovidos.

```bash
git checkout main
git pull origin main
git checkout -b feature/<número-da-issue>-descrição-curta
# Exemplos (branches já criadas para as issues abertas):
# feature/1-jwt-middleware
# feature/2-chat-proxy
# feature/3-transactions-proxy
# feature/4-daily-pulse-proxy
# feature/5-user-salary
# feature/6-envelope-crud
```

### 2. Commits

```bash
git commit -m "feat(budget): add daily pulse calculation"
git commit -m "feat(frontend): implement onboarding screen"
git commit -m "feat(bff): add auth middleware"
git commit -m "fix(coach): fix null amount in tool calling"
git commit -m "test(transaction): add category tests"
```

Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

### 3. MR para `dev` -- primeira validação

Abra o merge request da sua branch de feature para `dev`, referenciando a issue (`Closes #N`).

```markdown
- [ ] Segue o contrato de API e a especificação em `.specs/features/` e `DESIGN_SYSTEM.md`
- [ ] `kof check backend` e `kof check frontend` passam com `0` erros
- [ ] Suíte E2E (`scripts/test_e2e_flow.ps1`) passa (`9/9 GREEN`)
- [ ] Respeita as fronteiras da Arquitetura Monolítica Modular (`backend/*.kf` e `frontend/core/`, `components/`, `screens/`)
- [ ] Sem arquivos pesados ou pastas residuais de IA (`.claude/`, `.antigravity/`, `build/`, `.class`)
```

O dev responsável pelo módulo revisa e testa localmente antes de aprovar o merge em `dev`.

### 4. MR para `qa` -- validação de qualidade

Depois que a mudança está em `dev`, abra o MR de `dev` para `qa`. QA testa o comportamento end-to-end (fluxo completo no monólito KofLith na porta 3000 e UI KofJS) antes de aprovar.

### 5. Aviso para o maintainer

Com o MR aprovado em `qa`, avise a maintainer para validação antes da promoção final.

### 6. Promoção para `main`

Somente a maintainer promove `qa` -> `main`. Esse é o único caminho para `main`.

```text
feature/* --MR--> dev --MR--> qa --(maintainer testa)--> main
```

### Review

- Aprovação de pelo menos **1 maintainer** obrigatória antes da promoção para `main`
- Feedback construtivo, com sugestões, em cada etapa (`dev` e `qa`)

---

## Guia de implementação e Especificações (SDD)

Antes de começar uma issue ou lote de execução:
1. Consulte o plano executivo em [docs/MVP1_EXECUTION_PLAN.md](docs/MVP1_EXECUTION_PLAN.md) e as especificações SDD em [.specs/features/mvp1-koflith-attack/](.specs/features/mvp1-koflith-attack/).
2. Consulte [docs/ISSUES_GUIDE.md](docs/ISSUES_GUIDE.md) e o log de decisões arquiteturais em [.specs/STATE.md](.specs/STATE.md) e [DECISIONS.md](DECISIONS.md).

## Referência técnica do KOF

Consulte os seguintes documentos no repositório antes de tocar em qualquer arquivo `.kf`:
- [KOF_REFERENCE.md](KOF_REFERENCE.md) — referência geral da linguagem e `kof.ui`
- [KOF_WEB_REFERENCE.md](KOF_WEB_REFERENCE.md) — referência de `kof.web` e HTTP client
- [docs/LLM_KOF_UI_GUIDELINES.md](docs/LLM_KOF_UI_GUIDELINES.md) — firewall anti-alucinação para `kof.ui` (`--target=js`)
- `docs/kof4j/` — espelho local do `README.md` e da pasta `training/` do compilador oficial `Kof4j`

## Como configurar sua IA para codar em KOF

### Por que isso é necessário?
KOF é uma linguagem compilada para JVM e KofJS lançada em 2026. Nenhuma LLM foi treinada com volume significativo de código KOF em seu pré-treinamento base. Sem contexto explícito, a IA inventa sintaxe que não compila (*fake idioms*).
**Regra de ouro:** se a IA gerou código KOF, valide com `kof check` antes de confiar.

### 1. Alimentar com o corpus de training (`KofLang/Kof4j`)

O repositório do compilador KOF possui a pasta `training/` (também disponível localmente em `docs/kof4j/training/`):

```bash
git clone https://github.com/KofLang/Kof4j.git
```

Os arquivos essenciais que todo agente ou subagente (**Gemini Flash Effort Alto**, Claude Code, etc.) deve ler obrigatoriamente antes de sugerir código:

| Arquivo | O que ensina |
|---|---|
| `training/language/syntax.md` | Sintaxe completa da linguagem |
| `training/language/types.md` | Sistema de tipos e null safety (`String?`) |
| `training/language/io.md` | HTTP, JSON, filesystem |
| `training/language/ui.md` | Componentes reais de interface (`kof.ui`) |
| `training/examples/web.kf` | Exemplo real de servidor HTTP (`kof.web`) |
| `training/idioms/architecture.md` | Arquitetura Monolítica Modular KofLith (*Menos segregação, mais intenção*) |
| `training/anti-patterns/fake-idioms.md` | O que a IA **NÃO** deve inventar |
| `training/migration/java-to-kof.md` | Como transpilamos o legado Java para KOF idiomático |

### 2. Incluir na primeira mensagem

Antes de pedir qualquer código KOF para a IA, instrua o agente a ler `docs/kof4j/README.md`, `docs/kof4j/training/`, `KOF_REFERENCE.md` e `docs/LLM_KOF_UI_GUIDELINES.md`.

### 3. Validar SEMPRE antes de commitar

Regra de ouro: **nenhum código `.kf` é commitado sem passar no typechecker do compilador:**

```powershell
kof check backend
kof check frontend
```

Se não compilar, a IA inventou sintaxe. Corrija confrontando o erro com `training/anti-patterns/fake-idioms.md` e `docs/LLM_KOF_UI_GUIDELINES.md`.

### 4. Regras rápidas para a IA (Firewall Anti-Alucinação)

- **Proibido inventar palavras-chave:** KOF não usa `fun`, `fn`, `func` (funções são declaradas com `Tipo nome(Params) { ... }` ou `nome(Params): Tipo { ... }`).
- **Acesso a listas:** usar `lista.get(i)` em vez de `lista[i]` (`SEM054`).
- **Loops:** sempre usar `for (var x in xs) { ... }` (com `var`).
- **Primitivas `kof.ui`:** usar apenas `Window`, `View`, `Column`, `Row`, `Label`, `Button`, `Input`, `Canvas`, `Style`, `Color`, `Theme`. Não existem `Router`, `Component` ou `Spacer`.
- **HTTP Client (`kof.http`):** `http.get/post/put/delete/patch` retornam `String` diretamente (não objeto `Response`); headers são passados como `String` `"Authorization: Bearer ..."`.

## Links Oficiais

- [KOF Compiler GitHub (`KofLang/Kof4j`)](https://github.com/KofLang/Kof4j)
- [Design System & Tríade de Artefatos MVP 1 (`DESIGN_SYSTEM.md`)](DESIGN_SYSTEM.md)
- [Plano de Execução MVP 1 (`docs/MVP1_EXECUTION_PLAN.md`)](docs/MVP1_EXECUTION_PLAN.md)
- [Metodologia de Benchmarks (`docs/BENCHMARKS.md`)](docs/BENCHMARKS.md)
