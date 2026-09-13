# Organiza IA

**O único app de finanças que conversa com você, entende seu salário e te diz o que fazer hoje.**

Organiza IA é um organizador de gastos inteligente projetado para separar as finanças de uma pessoa com base no salário que ela ganha -- fixo ou variável. Ao contrário de agregadores passivos de mercado, ele atua como um coach financeiro proativo.

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
| Front-end | KOF (kof.ui) -- linguagem compilada para JVM, renderiza via KofJS em webview |
| Back-end (BFF) | KOF (kof.web) -- servidor HTTP desacoplado, servindo dados estruturados para o front-end |
| Back-end (API) | Java 17, Spring Boot 3.3.x, Spring AI (GPT-4o-mini via tool calling) |
| Banco de Dados | MySQL no Render (modelo relacional) com cronjob de ping para estabilidade contínua |
| Build | Gradle (backend), kof-cli (frontend/BFF) |

## Arquitetura

```
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│  KOF Frontend (kof.ui)  │     │  KOF BFF (kof.web)      │     │  Spring Boot (Backend)  │
│                         │     │                         │     │                         │
│  Telas e componentes    │────>│  Proxy autenticado      │────>│  Lógica de negócio      │
│  compilados para JVM    │ JWT │  Rotas desacopladas     │ HTTP│  Spring AI (coach IA)   │
│  Renderiza via webview  │     │  Servidor HTTP na JVM   │     │  MySQL (Render)         │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
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

Identidade visual completa (paleta, tipografia, marca, componentes, ícones, badges, estados de erro/perigo, modelos de notificação e especificação das 11 telas) documentada em [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

Protótipo interativo (responsivo mobile/desktop, dark e light mode): [Protótipo Organiza IA](https://claude.ai/code/artifact/6befd748-2c5d-4261-9069-8ea9a12291de).

## Roadmap

| Fase | Foco | Entregável |
|---|---|---|
| **1 -- Design** | Modelagem visual (Mermaid.js), aprovação de fluxo | Diagramas ER e de fluxo validados |
| **2 -- Desenvolvimento** | Implementação full-stack (KOF + Spring Boot) | MVP funcional: chat + pulso diário + envelopes |
| **3 -- Code Review** | PRs rigorosos para a comunidade open source | Produto estável com contribuições externas |

## Roadmap — Arquitetura Monolítica Modular em KOF

Auditoria e correção do frontend KOF (`frontend/`, 35 arquivos) contra o
corpus oficial do [Kof4j](https://github.com/KofLang/Kof4j) (`training/`),
para eliminar sintaxe inventada ("fake idioms") antes do primeiro deploy.
Etapas commitáveis, na ordem em que devem ser aplicadas:

| # | Etapa | Status |
|---|---|---|
| 0 | CI de segurança: workflow `kof-check.yml` roda `kof check` no `frontend/` (e no `bff/` quando existir) a cada push/PR que toque `.kf` — nada quebrado chega a `main` | ✅ feito |
| 1 | `core/theme.kf`, `router_config.kf`, `http_client.kf`, `service_locator.kf`, `constants.kf` reescritos como `class X { static ... }` (padrão oficial de estado — `learn/35-kof-ui.md`, `CLAUDE.md` regra 5), no lugar de variáveis soltas em nível de arquivo | ✅ feito |
| 2 | `chat/state.kf`, `onboarding/state.kf`, `dashboard/state.kf`, `envelopes/state.kf` — mesma conversão para classes com campos estáticos | ✅ feito |
| 3 | Remoção de `components/primary_button.kf` e `secondary_button.kf` (factories triviais — anti-pattern, `idioms/classes.md`) e uso direto de `Button(...)` nas 8 telas que os chamavam | ✅ feito |
| 4 | 11 telas: API do `Component` corrigida para a forma confirmada em `learn/35-kof-ui.md` — `Component(estadoInicial)` + `.view((state) -> {...})` + `.onMount(() -> {...})` + `.onDispose(() -> {...})`, no lugar do bloco `{ }` sem parênteses (sintaxe que não existe em KOF) | ✅ feito |
| 5 | `dashboard/screen.kf`: gráfico de pizza com Canvas 2D corrigido para `canvas.setFill(cor)` → `canvas.fill()` (a API real não aceita cor como argumento de `fill()`) | ✅ feito |
| 6 | Restauração dos 11 arquivos apagados do disco (10 em `components/` + `core/constants.kf`) a partir do índice do Git | ✅ feito |
| 7 | Validar com `kof check frontend` (local ou via CI) os 3 pontos marcados `KOF-VERIFY` no código: parâmetro com tipo de função em `choice_card.kf`/`nav_bar.kf`, e `c.state(valor)` para re-renderizar em `debt_screen.kf`/`income_type_screen.kf` — nenhum dos dois está confirmado no corpus oficial | ✅ feito |
| 8 | Opcional: revisar `models/*.kf` — hoje usam `class X(...)` (alias válido de `record X(...)`); sem urgência, mas `record` é a forma canônica para DTOs imutáveis | ✅ feito |

**Regra de segurança:** nenhum push é feito sem autorização explícita —
cada etapa fica local até revisão. Ver commit sugerido na sessão que gerou
esta auditoria.

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

Todo agente de IA usado no projeto deve receber este contexto mínimo:

```
Você é um agente de código no projeto organiza-ai.
Stack: Java 17 / Spring Boot 3.3.x (backend), KOF (BFF + frontend), MySQL.
REGRAS ABSOLUTAS:
1. NUNCA faça git push
2. Commits seguem Conventional Commits: tipo(escopo): descrição
3. Rode ./gradlew test (backend) ou kof check (KOF) antes de commitar
4. Não crie arquivos na raiz do projeto
5. Não adicione dependências sem aprovação
```

### Delegação por Modelo

| Complexidade | Modelo | Exemplos |
|-------------|--------|----------|
| Baixa | Haiku | Fix de teste, docs, rename, formatação |
| Média | Sonnet | Refactor null safety, CRUD, migrations |
| Alta | Opus | Arquitetura KOF, integração BFF, features novas |

## Tecnologia

O Organiza IA usa a linguagem **KOF** -- uma linguagem de programação geral, fortemente tipada e compilada para JVM (https://github.com/KofLang/Kof4j). Usamos KOF tanto no front-end (kof.ui) quanto no BFF (kof.web), eliminando Node.js e Flutter do stack e unificando tudo na JVM.

## Licença

MIT License. Veja [LICENSE](LICENSE).

## Comunidade e Evolução KOF (Sugestões de PRs)

Sendo o Organiza AI um dos projetos pioneiros a implementar a arquitetura **Full-Stack JVM (Spring Boot + BFF Kof + Frontend Kof)** em grande escala, somos os melhores *beta testers* da linguagem criada pela Melissa. 

Contribuidores são bem-vindos para implementar as issues documentadas em PROJECT_STATUS.md. Além disso, encorajamos que as dores que encontramos aqui sejam levadas como propostas de Pull Requests para o repositório oficial do [Kof4j](https://github.com/KofLang/Kof4j):

1. **Suporte CI Headless:** Lançar uma flag --headless ou --ci no CLI do KOF para evitar crashes da máquina virtual Java no GitHub Actions.
2. **Mensagens de Erro Semânticas:** Traduzir erros agressivos de geração de bytecode da JVM (ex: ArrayIndexOutOfBoundsException no ASM COMPUTE_FRAMES) para *SyntaxErrors* humanos apontando linha/coluna no parser.
3. **Router Nativo (kof.ui.Router):** Absorver nativamente nossas abstrações customizadas de roteamento para garantir uma geração de bytecode mais fluida nas trocas de tela.
4. **Estado Reativo (State<T>):** Prover suporte oficial a variáveis de estado reativo, reduzindo nossa dependência de instâncias *static* nas classes da arquitetura.
