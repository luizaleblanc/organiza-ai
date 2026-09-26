# Organiza AI

**O único app de finanças que conversa com você, entende seu salário e te diz quanto você pode gastar para terminar o mês no verde.**

Organiza AI é um organizador de gastos inteligente projetado para separar as finanças de uma pessoa com base no salário que ela ganha — fixo ou variável. Ao contrário de agregadores passivos de mercado, ele atua como um coach financeiro proativo, construído sobre uma **Arquitetura Monolítica Modular (KofLith)** 100% em KOF.

---

## 🔬 Laboratório Científico e Transparência (Work in Progress)

O **Organiza IA** atua oficialmente como caso de estudo e laboratório de validação para a linguagem **KOF** (KofLang). Guiados pela metodologia de pesquisa técnica rigorosa da equipe criadora e pesquisadores (UFPA), tratamos produtividade, performance e DX (*Developer Experience*) como **hipóteses testáveis** e não como fatos de marketing.

**Estado Atual e Limitações (Disclaimer):**
Atualmente, o projeto possui a *arquitetura monolítica modular* e o *produto funcional* operando em KOF (Domínio e UI). No entanto, **a infraestrutura empírica de medição ainda está em construção**. Ainda não possuímos no repositório (mas estamos implementando em Issues ativas):
- Suítes de extração e análise da AST (*Abstract Syntax Tree*).
- ~~CI/CD instrumentado para coletar métricas exatas de compilação~~ -- ✅ pipeline inicial no ar (`.github/workflows/benchmarks.yml`), ver [docs/BENCHMARKS.md](docs/BENCHMARKS.md) para metodologia e limitações conhecidas.
- Benchmarks de alocação de memória e execução (KofJS vs JVM) -- parcial: tempo de compilação e footprint de artefato já medidos; memória de runtime sob carga é best-effort (ver limitações em [docs/BENCHMARKS.md](docs/BENCHMARKS.md)).
- Análises estatísticas quantitativas de *LLM-friendliness*.

> ⚠️ Qualquer afirmação técnica sobre "superioridade" de código ou arquitetura gerada por este projeto, sem estar lastreada por esses futuros *benchmarks*, deve ser interpretada como proposta arquitetural e hipótese de design, e não como resultado experimental comprovado.

---

## Screenshots

Conheça a interface do Organiza IA:

| Tela | Descrição |
|---|---|
| **Onboarding** | Configuração inicial de salário e modelo de orçamento |
| **Chat** | Coach de IA conversacional com pulso diário |
| **Dashboard** | Visão geral dos envelopes e gastos |
| **Envelopes** | Gerenciamento de categorias e limites de gastos |
| **Histórico** | Lista de transações com filtros |
| **Configurações** | Perfil e preferências do usuário |

> **📌 Para adicionar screenshots:**
> 1. Capture imagens das telas em HD (360×640px para mobile)
> 2. Nomeie como: `screenshot-onboarding.png`, `screenshot-chat.png`, etc.
> 3. Coloque em `docs/screenshots/`
> 4. Atualize a tabela acima com links: `![Onboarding](docs/screenshots/screenshot-onboarding.png)`

---

## Diferenciais

**Modelos adaptativos** -- o Organiza não força um modelo único. Com base na sua renda, tipo de trabalho e situação financeira, o sistema sugere o modelo que faz sentido pra você: 50/30/20 (padrão), 70/20/10 (sobrevivência), Anti-Dívida, 80/20 (simplificado), Kakeibo (reflexivo) ou Base Zero (freelancer). Você pode trocar a qualquer momento.

**Renda fixa + variável** -- diferente de concorrentes que só orçam sobre o fixo, o Organiza separa automaticamente renda variável (freela, shows, mentorias) e direciona para reserva de emergência até atingir sua meta.

**Dashboard intuitivo** -- o foco é o dashboard de controle financeiro. Entrada por voz é um atalho opcional, não pré-requisito. O app foi desenhado para ser simples a ponto de não precisar de tutorial.

**Anti-alucinação** -- o coach de IA usa tool calling para consultar seus dados reais (transações, envelopes, pulso diário) antes de responder. A IA nunca inventa números: ela fala sobre o que existe de fato no seu histórico financeiro.

## Stack

| Camada | Tecnologia |
|---|---|
| **Arquitetura** | **Monólito Modular (KofLith)** — Unidade de execução coesa com separação estrita por módulos de domínio e de interface |
| **Monólito Modular Backend** | KOF (`backend/*.kf`) -- Módulos de Domínio (`models.kf`, `auth.kf`, `services.kf`, `coach.kf`, `main.kf`) |
| **Monólito Modular Frontend** | KOF (`kof.ui`, `frontend/*.kf`) -- Módulos de Core (`core/`), Componentes (`components/`) e Telas (`screens/`) |
| **Back-end Legado (arquivado)** | Java 17, Spring Boot 3.3.x, Spring AI -- arquivado em `archive/legacy-backend-java/` (tag histórica `legacy/java-spring-boot`), mantido apenas como referência histórica |
| **Banco de Dados** | MySQL no Render com modelo relacional integrado |
| **Build & Tooling** | `kof-cli` / Kof Compiler (Java 25 JDK) |

## Arquitetura Monolítica Modular (KofLith)

O projeto trata-se especificamente de uma **Arquitetura Monolítica Modular** batizada de **KofLith** (*Menos segregação, mais intenção*). Em vez de fragmentar o sistema em microsserviços distribuídos com overhead de rede, ou manter um monólito espaguete sem fronteiras, o Organiza IA combina **implantação unificada** com **alto desacoplamento modular interno**:

- **Modularidade de Domínio (`backend/`):** Cada contexto delimitado reside em seu próprio módulo `.kf` com responsabilidades estritas — `models.kf` (Contratos, Records e Enums), `auth.kf` (Segurança e JWT HS256), `services.kf` (Regras de Negócio: `mod_user`, `mod_transaction`, `mod_budget`, `mod_variable_income`, `TierEnforcement`), `coach.kf` (Motor Cognitivo, Pulso Diário e Kakeibo) e `main.kf` (Gateway HTTP na porta 3000).
- **Modularidade de Interface (`frontend/`):** A UI em `kof.ui` é estruturada como um monólito modular dividido em `core/` (Design Tokens, Estado Reativo Estático e Cliente HTTP), `components/` (Widgets reutilizáveis de UI e Canvas 2D) e `screens/` (11 telas do MVP 1 em Dual Viewport Mobile/Desktop).

```
┌────────────────────────────────────────────────────────────────────────┐
│            ORGANIZA IA — ARQUITETURA MONOLÍTICA MODULAR (KOFLITH)      │
│                                                                        │
│   ┌───────────────────────────┐      ┌──────────────────────────────┐  │
│   │  Módulos Frontend (kof.ui)│      │  Módulos de Domínio (kof.web)│  │
│   │                           │      │                              │  │
│   │  • core/ (Theme, State)   │─────>│  • main.kf (Gateway :3000)   │  │
│   │  • components/ (Canvas)   │      │  • auth.kf (Segurança JWT)   │  │
│   │  • screens/ (Auth, Onb,   │      │  • services.kf (Core Rules)  │  │
│   │    Dashboard, Chat, Boxes)│      │  • coach.kf (AI & Pulso)     │  │
│   └───────────────────────────┘      └──────────────────────────────┘  │
│                                                                        │
│             Bytecode JVM Nativo com Execução em Virtual Threads        │
└────────────────────────────────────────────────────────────────────────┘
```

## Modelo de Negócio

| Tier | Preço | Inclui |
|---|---|---|
| Free | R$0 | Chat com IA (30 msgs/mês), pulso diário, 3 envelopes |
| Premium | R$9,90/mês | Chat ilimitado, voz, insights semanais, simulador, envelopes ilimitados |

## Modelagem de Dados

O modelo relacional completo está disponível em: [docs/DATA_MODEL.md](docs/DATA_MODEL.md)

Resumo das entidades principais: **User** (dados do usuário, salário mensal, indicador de renda variável e meta de reserva de emergência), **Envelope** (tetos de gastos por categoria, com limite fixo ou por média móvel), **Transaction** (movimentações financeiras associadas a um envelope e a um usuário) e **VariableIncome** (entradas extras -- freela, show, mentoria -- direcionadas automaticamente para reserva de emergência ou para o orçamento 50/30/20).

## Design System

Identidade visual completa (paleta `#0A0D18` / `#00D4FF`, tipografia Manrope, marca, componentes, ícones, badges, estados de erro/perigo, modelos de notificação e especificação das 11 telas) documentada em [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

**Artefatos Oficiais do MVP 1 (Claude Artifacts):**
- **Design System (Tokens & Componentes):** [https://claude.ai/artifact/JVjueTmHeJsnHLsow3LDVb](https://claude.ai/artifact/JVjueTmHeJsnHLsow3LDVb)
- **Protótipo Desktop (Web Responsivo):** [https://claude.ai/artifact/64FYjX5UiveVxTtRGYurQP](https://claude.ai/artifact/64FYjX5UiveVxTtRGYurQP)
- **Protótipo Mobile (Viewport 360×640):** [https://claude.ai/artifact/8b3jFV4BrGj4YkDQAwDvDF](https://claude.ai/artifact/8b3jFV4BrGj4YkDQAwDvDF)

## Roadmap & Plano de Ataque MVP 1 (Spec-Driven Development)

O fechamento ponta a ponta do **MVP 1** segue a metodologia **tlc-spec-driven (4 fases)**, com especificações formais em [`.specs/features/mvp1-koflith-attack/`](.specs/features/mvp1-koflith-attack/) ([`spec.md`](.specs/features/mvp1-koflith-attack/spec.md), [`design.md`](.specs/features/mvp1-koflith-attack/design.md), [`tasks.md`](.specs/features/mvp1-koflith-attack/tasks.md)) e plano executivo em [`docs/MVP1_EXECUTION_PLAN.md`](docs/MVP1_EXECUTION_PLAN.md).

### Lotes de Execução (`mvp1-koflith-attack`)

| Lote | Escopo (`frontend/*.kf` + `backend/*.kf`) | Entregáveis & Gate de Verificação | Status |
|---|---|---|---|
| **Batch 0 — Baseline & Spec** | Expurgo de código alucinado (`5d58ca9150`), Tríade Design System, CI de Benchmarks e SDD (`spec.md`, `design.md`, `tasks.md`) | `kof check backend` (0 erros) + `kof check frontend` (0 erros) | ✅ feito |
| **Batch 1 — Fundação Core** | `core/theme.kf` (tokens Manrope + funções top-level `Color(r,g,b)`), `core/app_state.kf` (estado `static` + `window.bind`), `core/api_client.kf` (`kof.http` na porta `:3000`) e `components/brand_header.kf` + `nav_bar.kf` (Dual Viewport `360×640` Mobile / `1280×800` Desktop) | `kof check frontend` (0 erros) | ⏳ próximo |
| **Batch 2 — Auth & Onboarding** | `screens/auth_screens.kf` (Telas 1–3: Boas-vindas, Login, Cadastro) e `screens/onboarding_screens.kf` (Telas 4, 5, 6, 6.1, 7: Salário, Renda, Dívida e Recomendação 50/30/20, 70/20/10 ou Anti-Dívida) | Fluxo `/api/auth/register` → `/api/auth/login` → `/api/onboarding/setup` | ⏳ planejado |
| **Batch 3 — Dashboard & Canvas 2D** | `components/pulse_card.kf`, `components/pie_chart.kf` (gráfico de pizza 200×200 via `Canvas` 2D com estados normal/atenção/perigo) e `screens/dashboard_screen.kf` (Tela 8 Mobile + Visão Expandida Desktop) | Consumo real de `/api/coach/daily-pulse` e `/api/envelopes` | ⏳ planejado |
| **Batch 4 — AI Coach & Caixinhas** | `components/chat_bubble.kf`, `screens/chat_screen.kf` (Tela 9), `components/envelope_card.kf`, `components/notification_toast.kf` e `screens/envelopes_screen.kf` (Telas 10 e 11: Caixinhas por bucket + 5 modelos de notificação) | `kof check frontend` + `kof check backend` (0 erros) | ⏳ planejado |
| **Batch 5 — Homologação E2E & Benchmarks** | Testes ponta a ponta (`scripts/test_e2e_flow.ps1` 9/9 GREEN) e coleta empírica (`scripts/benchmark_kof.ps1` → `docs/BENCHMARKS.md`) | Monólito KofLith + UI Mobile/Desktop 100% homologados | ⏳ planejado |

**Regra de segurança:** nenhum commit ou push é executado por agentes de IA — cada lote é validado com `kof check` e entregue para revisão e commit manual da maintainer.

## Arquitetura KofLith — Monólito 100% Nativo sobre a JVM (Issue #37)

Em alinhamento com a filosofia da linguagem KOF (`training/idioms/architecture.md`), o Organiza IA concluiu a transição do backend Spring Boot para o padrão **KofLith**: o monólito de domínio (`backend/*.kf`) e a interface (`frontend/*.kf`) rodam de forma autônoma e exclusiva em KOF sobre a JVM e KofJS, sem depender do backend Java em runtime.

Na visão KOF, segregar o frontend e o backend em dois mundos artificiais com proxies HTTP intermediários adiciona complexidade acidental desnecessária. O padrão KofLith unifica intenção: entidades viram `record`, comportamento vira `class`, e regras de negócio viram `funções top-level` diretas.

### Estado do Monólito KOF (`backend/` & `frontend/`):
- **Entidades e Enums (`backend/models.kf`):** transpilado e validado via `kof check`.
- **Serviços e Repositórios Core (`backend/services.kf`):** transpilado (`mod_user`, `mod_transaction`, `mod_budget`, `mod_variable_income`, `TierEnforcement`).
- **Módulo de IA Coach (`backend/coach.kf`):** transpilado (`CategoryBucketMapper`, `calculateDailyPulse`, `calculateBalance`, `registerUserIncome`, `suggestModelChange`, `KakeiboReflection`).
- **Gateway HTTP & Auth JWT (`backend/main.kf`, `backend/auth.kf`):** operando na porta `3000` com 9/9 fluxos E2E validados (`scripts/test_e2e_flow.ps1`).
- **Firewall Anti-Alucinação KofUI (`frontend/`):** uso exclusivo de primitivas reais do compilador Kof4j (`Window`, `View`, `Column`, `Row`, `Label`, `Button`, `Input`, `Canvas`, `Style`, `Color`, `Theme`), estado em campos `static` de classe e funções top-level para cores (`Color(r,g,b)`), contornando o bug de inicialização estática no `Default.mjs`.
- **Código Java legado:** arquivado em `archive/legacy-backend-java/` (não compila mais como parte do projeto), preservado como *Ground Truth* histórico via tag `legacy/java-spring-boot`.
- **Pendência conhecida de validação de bytecode:** `scripts/validate_architecture.ps1` está atualmente bloqueado por um bug do compilador Kof4j na geração de bytecode JVM (`ASM COMPUTE_FRAMES`) ao construir `record`s com campos `Double` seguidos de um campo `String?` nulo -- ver Issue #41. O `kof check` (typecheck) passa normalmente; o bloqueio é só na fase de emissão de bytecode.


## Como Contribuir

Veja [CONTRIBUTING.md](CONTRIBUTING.md) para o guia completo de setup, padrões de código e fluxo de PR. Todo participante deve seguir o [Código de Conduta](CODE_OF_CONDUCT.md).

## Guideline de Uso de IA

Este projeto adota regras rígidas para o uso de assistentes de IA (Claude Code, Antigravity IDE, Copilot ou qualquer LLM). O objetivo é garantir autoria humana, árvore de commits limpa e reproducibilidade.

### IDEs e Ferramentas Permitidas

- **Claude Code** (CLI) — modelo principal para tarefas complexas
- **Antigravity IDE** — recomendado para estudantes e contribuidores iniciantes
- Qualquer LLM pode ser usado como consulta, mas o código commitado é de responsabilidade do contribuidor

### Gerenciamento de Skills: tech-leads-club/agent-skills

Este projeto utiliza o registry **tech-leads-club/agent-skills** (https://github.com/tech-leads-club/agent-skills) para padronizar as capacidades dos agentes de IA.

**Instalação:**

```bash
npx @tech-leads-club/agent-skills
```

**Skills obrigatórias para contribuidores:**

| Skill | Função | Obrigatório |
|-------|--------|-------------|
| tlc-spec-driven | SDLC em 4 fases com memória persistente | Sim |
| security-best-practices | Detecção de vulnerabilidades | Sim |

**Instalação direta:**

```bash
agent-skills install -s tlc-spec-driven -a claude-code
agent-skills install -s security-best-practices -a claude-code
```

Para Antigravity IDE:

```bash
agent-skills install -s tlc-spec-driven -a antigravity
```

Mantenha as skills atualizadas:

```bash
agent-skills update
```

### Regras de Sessão (SDLC Estrito - Orquestrador)

Nesta etapa de maturidade do projeto, a IA deve operar sob as seguintes diretrizes absolutas:
1. **A IA atua estritamente como mentor e orquestrador.**
2. **NENHUM COMMIT DEVE SER DADO PELA IA.** Apenas a usuária digita os comandos de commit e push.
3. **Árvore limpa e organizada.** Sem binários, sem lock files pesados, sem scratchpads residuais. Manter a árvore do Git estritamente limpa durante todo o processo.
4. **Treinamento Inegociável para Subagentes:** Todos os subagentes devem cumprir a regra de ler o readme principal e a pasta training do repositório Kof (https://github.com/KofLang/Kof4j) antes de sugerir qualquer código.

### Regras de Commit e Push

1. **Push é sempre manual.** Nenhum agente de IA tem permissão para executar `git push`. Inclua no CLAUDE.md ou prompt do agente: *NUNCA faça git push*
2. **Zero Co-Authored-By de IA em commits de contribuidores externos.** Commits gerados por agentes locais não devem conter linhas `Co-Authored-By` a menos que a ferramenta do contribuidor exija por padrão
3. **Árvore limpa antes de push.** Rode `git status` antes de cada push. Nenhum arquivo untracked indesejado, nenhuma pasta de configuração de IA (`.claude/`, `.antigravity/`, `.cursor/`) deve ir para o remoto
4. **Gitignore atualizado a cada push.** Antes de dar push, confirme que o `.gitignore` contém no mínimo:

```
.claude/
.antigravity/
.cursor/
.copilot/
CLAUDE.md
*.log
.env
node_modules/
build/
.gradle/
```

5. **Nenhuma pasta corrompida ou pesada.** Agentes de IA podem gerar pastas grandes (cache, embeddings, checkpoints). Verifique com `git diff --stat` antes do push. Se um arquivo ultrapassa 1MB sem ser código, ele não entra no repositório

### Metodologia: Spec-Driven SDLC

O desenvolvimento segue um workflow de 4 fases rígidas, com memória persistente entre sessões. IA participa como ferramenta, não como decisor:

| Fase | Responsável | IA pode |
|------|------------|---------|
| F1 Design | Maintainer | Gerar diagramas Mermaid, sugerir specs — maintainer aprova |
| F2 Desenvolvimento | Contribuidor | Gerar código, rodar testes, sugerir refactors — contribuidor revisa e commita |
| F3 Code Review | Maintainer | Analisar diff, apontar problemas — maintainer decide merge |
| F4 Deploy | CI/CD | Build automático — nenhum agente faz deploy manual |

**A IA nunca decide merge, nunca aprova PR, nunca faz push, nunca faz deploy.**

### Treinamento KOF para Agentes de IA

KOF é uma linguagem relativamente nova e pouco representada em corpora de treinamento de LLMs. Antes de pedir código KOF a qualquer agente:

1. Consulte o repositório oficial: [KofLang/Kof4j](https://github.com/KofLang/Kof4j)
2. Alimente o agente com os materiais de treinamento na ordem: `README.md` do repositório, `training/README.md`, arquivos em `training/` (reference, idioms, patterns, migration, examples), `learn/` (capítulos), `docs/stdlib-web.md` e `docs/stdlib-db.md`
3. Valide com `kof check` antes de commitar qualquer arquivo `.kf`
4. Anti-patterns KOF que agentes cometem com frequência:
   - Usar `fun`/`fn`/`func` (funções em KOF não têm keyword)
   - Usar `async`/`await` (KOF usa `spawn`/`await`)
   - Usar `var` em assinatura de função no lugar do tipo real
   - Gerar getters/setters Java-style (KOF acessa campos direto)
   - Usar `.equals()` em vez de `==` para comparação de strings

### Prompt Base para Agentes

Todo agente ou subagente de IA usado no projeto deve receber este contexto mínimo:

```
Você é um agente de código no projeto organiza-ai (Arquitetura Monolítica KofLith).
Stack: KOF 100% Nativo (backend/*.kf em kof.web na porta 3000 + frontend/*.kf em kof.ui), MySQL.
REGRAS ABSOLUTAS:
1. NUNCA faça git commit ou git push (apenas a maintainer executa commits e push)
2. Leia obrigatoriamente docs/kof4j/ (README + training/), KOF_REFERENCE.md e docs/LLM_KOF_UI_GUIDELINES.md antes de tocar em qualquer arquivo .kf
3. Rode kof check backend e kof check frontend antes de entregar qualquer lote
4. Use estritamente primitivas reais do compilador Kof4j (Window, View, Column, Row, Label, Button, Input, Canvas, Style, Color, Theme)
5. Não crie arquivos fora de .specs/, docs/, scripts/, backend/ ou frontend/
```

### Delegação por Modelo e Subagentes

| Complexidade | Modelo Recomendado | Exemplos |
|---|---|---|
| Execução de Lotes KOF (Subagentes) | **Gemini Flash (Effort Alto)** | Implementação paralela dos Batches 1–5 (`frontend/*.kf`), validação `kof check` e testes E2E |
| Baixa | Haiku / Gemini Flash | Fix de teste, docs, rename, formatação |
| Média | Sonnet / Gemini Pro | Refactor null safety, CRUD, scripts de automação e benchmarks |
| Alta (Orquestração & Specs) | Opus / Gemini Pro (Orquestrador) | Arquitetura KofLith, Spec-Driven Design (`.specs/`), revisão de paridade de compilador |

## Tecnologia

O Organiza IA usa a linguagem **KOF** -- uma linguagem de programação geral, fortemente tipada e compilada para JVM e KofJS (https://github.com/KofLang/Kof4j). Usamos KOF tanto no front-end (`kof.ui`) quanto no monólito de domínio (`kof.web`), eliminando Node.js, Flutter e Spring Boot do runtime e unificando tudo no padrão **KofLith**.

## Licença

MIT License. Veja [LICENSE](LICENSE).

## Comunidade e Evolução KOF (Sugestões de PRs)

Sendo o Organiza AI um dos projetos pioneiros a implementar a arquitetura **Full-Stack KofLith (`backend/*.kf` + `frontend/*.kf`)** em escala real, somos os principais *beta testers* empíricos da linguagem criada pela Melissa. 

Contribuidores são bem-vindos para implementar as issues documentadas em PROJECT_STATUS.md. Além disso, encorajamos que as dores que encontramos aqui sejam levadas como propostas de Pull Requests para o repositório oficial do [Kof4j](https://github.com/KofLang/Kof4j):

1. **Suporte CI Headless:** Lançar uma flag --headless ou --ci no CLI do KOF para evitar crashes da máquina virtual Java no GitHub Actions.
2. **Mensagens de Erro Semânticas:** Traduzir erros agressivos de geração de bytecode da JVM (ex: ArrayIndexOutOfBoundsException no ASM COMPUTE_FRAMES) para *SyntaxErrors* humanos apontando linha/coluna no parser.
3. **Router Nativo (kof.ui.Router):** Absorver nativamente nossas abstrações customizadas de roteamento para garantir uma geração de bytecode mais fluida nas trocas de tela.
4. **Estado Reativo (State<T>):** Prover suporte oficial a variáveis de estado reativo, reduzindo nossa dependência de instâncias *static* nas classes da arquitetura.
