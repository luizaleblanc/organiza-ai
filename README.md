# Organiza IA

**O Ãºnico app de finanÃ§as que conversa com vocÃª, entende seu salÃ¡rio e te diz o que fazer hoje.**

Organiza IA Ã© um organizador de gastos inteligente projetado para separar as finanÃ§as de uma pessoa com base no salÃ¡rio que ela ganha -- fixo ou variÃ¡vel. Ao contrÃ¡rio de agregadores passivos de mercado, ele atua como um coach financeiro proativo.

---

## Screenshots

ConheÃ§a a interface do Organiza IA:

| Tela | DescriÃ§Ã£o |
|---|---|
| **Onboarding** | ConfiguraÃ§Ã£o inicial de salÃ¡rio e modelo de orÃ§amento |
| **Chat** | Coach de IA conversacional com pulso diÃ¡rio |
| **Dashboard** | VisÃ£o geral dos envelopes e gastos |
| **Envelopes** | Gerenciamento de categorias e limites de gastos |
| **HistÃ³rico** | Lista de transaÃ§Ãµes com filtros |
| **ConfiguraÃ§Ãµes** | Perfil e preferÃªncias do usuÃ¡rio |

> **ðŸ“Œ Para adicionar screenshots:**
> 1. Capture imagens das telas em HD (360Ã—640px para mobile)
> 2. Nomeie como: `screenshot-onboarding.png`, `screenshot-chat.png`, etc.
> 3. Coloque em `docs/screenshots/`
> 4. Atualize a tabela acima com links: `![Onboarding](docs/screenshots/screenshot-onboarding.png)`

---

## Diferenciais

**Modelos adaptativos** -- o Organiza nÃ£o forÃ§a um modelo Ãºnico. Com base na sua renda, tipo de trabalho e situaÃ§Ã£o financeira, o sistema sugere o modelo que faz sentido pra vocÃª: 50/30/20 (padrÃ£o), 70/20/10 (sobrevivÃªncia), Anti-DÃ­vida, 80/20 (simplificado), Kakeibo (reflexivo) ou Base Zero (freelancer). VocÃª pode trocar a qualquer momento.

**Renda fixa + variÃ¡vel** -- diferente de concorrentes que sÃ³ orÃ§am sobre o fixo, o Organiza separa automaticamente renda variÃ¡vel (freela, shows, mentorias) e direciona para reserva de emergÃªncia atÃ© atingir sua meta.

**Dashboard intuitivo** -- o foco Ã© o dashboard de controle financeiro. Entrada por voz Ã© um atalho opcional, nÃ£o prÃ©-requisito. O app foi desenhado para ser simples a ponto de nÃ£o precisar de tutorial.

**Anti-alucinaÃ§Ã£o** -- o coach de IA usa tool calling para consultar seus dados reais (transaÃ§Ãµes, envelopes, pulso diÃ¡rio) antes de responder. A IA nunca inventa nÃºmeros: ela fala sobre o que existe de fato no seu histÃ³rico financeiro.

## Stack

| Camada | Tecnologia |
|---|---|
| Front-end | KOF (kof.ui) -- linguagem compilada para JVM, renderiza via KofJS em webview |
| Back-end (BFF) | KOF (kof.web) -- servidor HTTP desacoplado, servindo dados estruturados para o front-end |
| Back-end (API) | Java 17, Spring Boot 3.3.x, Spring AI (GPT-4o-mini via tool calling) |
| Banco de Dados | MySQL no Render (modelo relacional) com cronjob de ping para estabilidade contÃ­nua |
| Build | Gradle (backend), kof-cli (frontend/BFF) |

## Arquitetura

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  KOF Frontend (kof.ui)  â”‚     â”‚  KOF BFF (kof.web)      â”‚     â”‚  Spring Boot (Backend)  â”‚
â”‚                         â”‚     â”‚                         â”‚     â”‚                         â”‚
â”‚  Telas e componentes    â”‚â”€â”€â”€â”€>â”‚  Proxy autenticado      â”‚â”€â”€â”€â”€>â”‚  LÃ³gica de negÃ³cio      â”‚
â”‚  compilados para JVM    â”‚ JWT â”‚  Rotas desacopladas     â”‚ HTTPâ”‚  Spring AI (coach IA)   â”‚
â”‚  Renderiza via webview  â”‚     â”‚  Servidor HTTP na JVM   â”‚     â”‚  MySQL (Render)         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

## Modelo de NegÃ³cio

| Tier | PreÃ§o | Inclui |
|---|---|---|
| Free | R$0 | Chat com IA (30 msgs/mÃªs), pulso diÃ¡rio, 3 envelopes |
| Premium | R$9,90/mÃªs | Chat ilimitado, voz, insights semanais, simulador, envelopes ilimitados |

## Modelagem de Dados

O modelo relacional completo estÃ¡ disponÃ­vel em: [docs/DATA_MODEL.md](docs/DATA_MODEL.md)

Resumo das entidades principais: **User** (dados do usuÃ¡rio, salÃ¡rio mensal, indicador de renda variÃ¡vel e meta de reserva de emergÃªncia), **Envelope** (tetos de gastos por categoria, com limite fixo ou por mÃ©dia mÃ³vel), **Transaction** (movimentaÃ§Ãµes financeiras associadas a um envelope e a um usuÃ¡rio) e **VariableIncome** (entradas extras -- freela, show, mentoria -- direcionadas automaticamente para reserva de emergÃªncia ou para o orÃ§amento 50/30/20).

## Design System

Identidade visual completa (paleta, tipografia, marca, componentes, Ã­cones, badges, estados de erro/perigo, modelos de notificaÃ§Ã£o e especificaÃ§Ã£o das 11 telas) documentada em [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

ProtÃ³tipo interativo (responsivo mobile/desktop, dark e light mode): [ProtÃ³tipo Organiza IA](https://claude.ai/code/artifact/6befd748-2c5d-4261-9069-8ea9a12291de).

## Roadmap

| Fase | Foco | EntregÃ¡vel |
|---|---|---|
| **1 -- Design** | Modelagem visual (Mermaid.js), aprovaÃ§Ã£o de fluxo | Diagramas ER e de fluxo validados |
| **2 -- Desenvolvimento** | ImplementaÃ§Ã£o full-stack (KOF + Spring Boot) | MVP funcional: chat + pulso diÃ¡rio + envelopes |
| **3 -- Code Review** | PRs rigorosos para a comunidade open source | Produto estÃ¡vel com contribuiÃ§Ãµes externas |

## Roadmap â€” Arquitetura MonolÃ­tica Modular em KOF

Auditoria e correÃ§Ã£o do frontend KOF (`frontend/`, 35 arquivos) contra o
corpus oficial do [Kof4j](https://github.com/KofLang/Kof4j) (`training/`),
para eliminar sintaxe inventada ("fake idioms") antes do primeiro deploy.
Etapas commitÃ¡veis, na ordem em que devem ser aplicadas:

| # | Etapa | Status |
|---|---|---|
| 0 | CI de seguranÃ§a: workflow `kof-check.yml` roda `kof check` no `frontend/` (e no `bff/` quando existir) a cada push/PR que toque `.kf` â€” nada quebrado chega a `main` | âœ… feito |
| 1 | `core/theme.kf`, `router_config.kf`, `http_client.kf`, `service_locator.kf`, `constants.kf` reescritos como `class X { static ... }` (padrÃ£o oficial de estado â€” `learn/35-kof-ui.md`, `CLAUDE.md` regra 5), no lugar de variÃ¡veis soltas em nÃ­vel de arquivo | âœ… feito |
| 2 | `chat/state.kf`, `onboarding/state.kf`, `dashboard/state.kf`, `envelopes/state.kf` â€” mesma conversÃ£o para classes com campos estÃ¡ticos | âœ… feito |
| 3 | RemoÃ§Ã£o de `components/primary_button.kf` e `secondary_button.kf` (factories triviais â€” anti-pattern, `idioms/classes.md`) e uso direto de `Button(...)` nas 8 telas que os chamavam | âœ… feito |
| 4 | 11 telas: API do `Component` corrigida para a forma confirmada em `learn/35-kof-ui.md` â€” `Component(estadoInicial)` + `.view((state) -> {...})` + `.onMount(() -> {...})` + `.onDispose(() -> {...})`, no lugar do bloco `{ }` sem parÃªnteses (sintaxe que nÃ£o existe em KOF) | âœ… feito |
| 5 | `dashboard/screen.kf`: grÃ¡fico de pizza com Canvas 2D corrigido para `canvas.setFill(cor)` â†’ `canvas.fill()` (a API real nÃ£o aceita cor como argumento de `fill()`) | âœ… feito |
| 6 | RestauraÃ§Ã£o dos 11 arquivos apagados do disco (10 em `components/` + `core/constants.kf`) a partir do Ã­ndice do Git | âœ… feito |
| 7 | Validar com `kof check frontend` (local ou via CI) os 3 pontos marcados `KOF-VERIFY` no codigo... | ✅ feito |
| 8 | Opcional: revisar `models/*.kf` — hoje usam `class X(...)` ... | ✅ feito |

**Regra de seguranÃ§a:** nenhum push Ã© feito sem autorizaÃ§Ã£o explÃ­cita â€”
cada etapa fica local atÃ© revisÃ£o. Ver commit sugerido na sessÃ£o que gerou
esta auditoria.

## Como Contribuir

Veja [CONTRIBUTING.md](CONTRIBUTING.md) para o guia completo de setup, padrÃµes de cÃ³digo e fluxo de PR. Todo participante deve seguir o [CÃ³digo de Conduta](CODE_OF_CONDUCT.md).

## Guideline de Uso de IA

Este projeto adota regras rÃ­gidas para o uso de assistentes de IA (Claude Code, Antigravity IDE, Copilot ou qualquer LLM). O objetivo Ã© garantir autoria humana, Ã¡rvore de commits limpa e reproducibilidade.

### IDEs e Ferramentas Permitidas

- **Claude Code** (CLI) â€” modelo principal para tarefas complexas
- **Antigravity IDE** â€” recomendado para estudantes e contribuidores iniciantes
- Qualquer LLM pode ser usado como consulta, mas o cÃ³digo commitado Ã© de responsabilidade do contribuidor

### Gerenciamento de Skills: tech-leads-club/agent-skills

Este projeto utiliza o registry **tech-leads-club/agent-skills** (https://github.com/tech-leads-club/agent-skills) para padronizar as capacidades dos agentes de IA.

**InstalaÃ§Ã£o:**

```bash
npx @tech-leads-club/agent-skills
```

**Skills obrigatÃ³rias para contribuidores:**

| Skill | FunÃ§Ã£o | ObrigatÃ³rio |
|-------|--------|-------------|
| tlc-spec-driven | SDLC em 4 fases com memÃ³ria persistente | Sim |
| security-best-practices | DetecÃ§Ã£o de vulnerabilidades | Sim |

**InstalaÃ§Ã£o direta:**

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
2. **NENHUM COMMIT DEVE SER DADO PELA IA.** Apenas a usuaria digita os comandos de commit e push.
3. **Árvore limpa e organizada.** Sem binários, sem lock files pesados, sem scratchpads residuais. Manter a arvore do Git estritamente limpa durante todo o processo.
4. **Treinamento Inegociável para Subagentes:** Todos os subagentes devem cumprir a regra de ler o readme principal e a pasta training do repositório Kof (https://github.com/KofLang/Kof4j) antes de sugerir qualquer código.

### Regras de Commit e Push

1. **Push Ã© sempre manual.** Nenhum agente de IA tem permissÃ£o para executar `git push`. Inclua no CLAUDE.md ou prompt do agente: *NUNCA faÃ§a git push*
2. **Zero Co-Authored-By de IA em commits de contribuidores externos.** Commits gerados por agentes locais nÃ£o devem conter linhas `Co-Authored-By` a menos que a ferramenta do contribuidor exija por padrÃ£o
3. **Ãrvore limpa antes de push.** Rode `git status` antes de cada push. Nenhum arquivo untracked indesejado, nenhuma pasta de configuraÃ§Ã£o de IA (`.claude/`, `.antigravity/`, `.cursor/`) deve ir para o remoto
4. **Gitignore atualizado a cada push.** Antes de dar push, confirme que o `.gitignore` contÃ©m no mÃ­nimo:

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

5. **Nenhuma pasta corrompida ou pesada.** Agentes de IA podem gerar pastas grandes (cache, embeddings, checkpoints). Verifique com `git diff --stat` antes do push. Se um arquivo ultrapassa 1MB sem ser cÃ³digo, ele nÃ£o entra no repositÃ³rio

### Metodologia: Spec-Driven SDLC

O desenvolvimento segue um workflow de 4 fases rÃ­gidas, com memÃ³ria persistente entre sessÃµes. IA participa como ferramenta, nÃ£o como decisor:

| Fase | ResponsÃ¡vel | IA pode |
|------|------------|---------|
| F1 Design | Maintainer | Gerar diagramas Mermaid, sugerir specs â€” maintainer aprova |
| F2 Desenvolvimento | Contribuidor | Gerar cÃ³digo, rodar testes, sugerir refactors â€” contribuidor revisa e commita |
| F3 Code Review | Maintainer | Analisar diff, apontar problemas â€” maintainer decide merge |
| F4 Deploy | CI/CD | Build automÃ¡tico â€” nenhum agente faz deploy manual |

**A IA nunca decide merge, nunca aprova PR, nunca faz push, nunca faz deploy.**

### Treinamento KOF para Agentes de IA

KOF Ã© uma linguagem relativamente nova e pouco representada em corpora de treinamento de LLMs. Antes de pedir cÃ³digo KOF a qualquer agente:

1. Consulte o repositÃ³rio oficial: [KofLang/Kof4j](https://github.com/KofLang/Kof4j)
2. Alimente o agente com os materiais de treinamento na ordem: `README.md` do repositÃ³rio, `training/README.md`, arquivos em `training/` (reference, idioms, patterns, migration, examples), `learn/` (capÃ­tulos), `docs/stdlib-web.md` e `docs/stdlib-db.md`
3. Valide com `kof check` antes de commitar qualquer arquivo `.kf`
4. Anti-patterns KOF que agentes cometem com frequÃªncia:
   - Usar `fun`/`fn`/`func` (funÃ§Ãµes em KOF nÃ£o tÃªm keyword)
   - Usar `async`/`await` (KOF usa `spawn`/`await`)
   - Usar `var` em assinatura de funÃ§Ã£o no lugar do tipo real
   - Gerar getters/setters Java-style (KOF acessa campos direto)
   - Usar `.equals()` em vez de `==` para comparaÃ§Ã£o de strings

### Prompt Base para Agentes

Todo agente de IA usado no projeto deve receber este contexto mÃ­nimo:

```
VocÃª Ã© um agente de cÃ³digo no projeto organiza-ai.
Stack: Java 17 / Spring Boot 3.3.x (backend), KOF (BFF + frontend), MySQL.
REGRAS ABSOLUTAS:
1. NUNCA faÃ§a git push
2. Commits seguem Conventional Commits: tipo(escopo): descriÃ§Ã£o
3. Rode ./gradlew test (backend) ou kof check (KOF) antes de commitar
4. NÃ£o crie arquivos na raiz do projeto
5. NÃ£o adicione dependÃªncias sem aprovaÃ§Ã£o
```

### DelegaÃ§Ã£o por Modelo

| Complexidade | Modelo | Exemplos |
|-------------|--------|----------|
| Baixa | Haiku | Fix de teste, docs, rename, formataÃ§Ã£o |
| MÃ©dia | Sonnet | Refactor null safety, CRUD, migrations |
| Alta | Opus | Arquitetura KOF, integraÃ§Ã£o BFF, features novas |

## Tecnologia

O Organiza IA usa a linguagem **KOF** -- uma linguagem de programaÃ§Ã£o geral, fortemente tipada e compilada para JVM (https://github.com/KofLang/Kof4j). Usamos KOF tanto no front-end (kof.ui) quanto no BFF (kof.web), eliminando Node.js e Flutter do stack e unificando tudo na JVM.

## LicenÃ§a

MIT License. Veja [LICENSE](LICENSE).

## Comunidade e EvoluÃ§Ã£o KOF (SugestÃµes de PRs)

Sendo o Organiza AI um dos projetos pioneiros a implementar a arquitetura **Full-Stack JVM (Spring Boot + BFF Kof + Frontend Kof)** em grande escala, somos os melhores *beta testers* da linguagem criada pela Melissa. 

Contribuidores sÃ£o bem-vindos para implementar as issues documentadas em PROJECT_STATUS.md. AlÃ©m disso, encorajamos que as dores que encontramos aqui sejam levadas como propostas de Pull Requests para o repositÃ³rio oficial do [Kof4j](https://github.com/KofLang/Kof4j):

1. **Suporte CI Headless:** LanÃ§ar uma flag --headless ou --ci no CLI do KOF para evitar crashes da mÃ¡quina virtual Java no GitHub Actions.
2. **Mensagens de Erro SemÃ¢nticas:** Traduzir erros agressivos de geraÃ§Ã£o de bytecode da JVM (ex: ArrayIndexOutOfBoundsException no ASM COMPUTE_FRAMES) para *SyntaxErrors* humanos apontando linha/coluna no parser.
3. **Router Nativo (kof.ui.Router):** Absorver nativamente nossas abstraÃ§Ãµes customizadas de roteamento para garantir uma geraÃ§Ã£o de bytecode mais fluida nas trocas de tela.
4. **Estado Reativo (State<T>):** Prover suporte oficial a variÃ¡veis de estado reativo, reduzindo nossa dependÃªncia de instÃ¢ncias *static* nas classes da arquitetura.


