# PROJECT_STATUS.md -- Organiza IA

> Atualizado em: 17/09/2026
> Fase atual: 3 -- Arquitetura KofLith Concluída (Monólito Modular Unificado compilando para Bytecode JVM nativo e validado na porta 3000)

## Estado do Backend (ATUAL — Transição KofLith Concluída)
- Java: 17 (Ground Truth preservado em `src/main/java` até homologação final e paridade formal)
- Monólito KOF (`backend/*.kf`): **100% dos módulos de domínio unificados, compilados e validados em runtime**:
  - `backend/models.kf`: Entidades, Records e Enums com tipos monetários de 64 bits (`Double`) — `kof check` e JVM bytecode OK.
  - `backend/services.kf`: Repositórios e Serviços Core (User, Transaction, Budget, Envelope, VariableIncome, Tier) — `kof check` e JVM bytecode OK.
  - `backend/coach.kf`: Lógica Cognitiva, Daily Pulse, Balance, SuggestModel e Kakeibo — `kof check` e JVM bytecode OK.
  - `backend/auth.kf`: Middleware e segurança JWT unificados no pacote raiz do domínio — `kof check` e JVM bytecode OK.
  - `backend/main.kf`: Gateway HTTP nativo KOF na porta 3000 sem proxy ou segregação de processos.
- Filosofia Arquitetural: **KofLith (Menos segregação, mais intenção)**. Unificação de rotas, domínio e persistência na plataforma Kof sem proxies HTTP desnecessários.
- Validação Automatizada: `scripts/validate_architecture.ps1` valida check de tipo, compilação de bytecode JVM e smoke test do endpoint `GET /health` na porta 3000.


## Estado do Frontend + BFF (ATUAL)
- BFF em KOF (`kof.web`, `bff/*.kf`): concluído -- health check, rotas públicas, middleware JWT, rotas protegidas e rota de tier-status.
- Frontend em KOF (`kof.ui`, `frontend/*.kf`): **ARQUITETURA E TELAS CRIADAS** -- Estrutura de Monolito Modular implementada com 35 arquivos (`main.kf`, `core/`, `models/`, `components/`, `screens/`).
- Design System: **CONCLUÍDO** -- `DESIGN_SYSTEM.md` com paleta de cores, tipografia, 11 telas especificadas, componentes e mapeamento KOF.
- Frontend legado (`frontend-voice`, Next.js): **REMOVIDO** -- expurgado por vulnerabilidades de segurança (commits `551eec4e`, `af6568eb`).
- Consulte `KOF_REFERENCE.md` e `KOF_WEB_REFERENCE.md` (raiz) antes de escrever qualquer código `.kf`.

## O que está concluído

### Backend
- [x] Auth (login/register com JWT, roles)
- [x] CRUD de transações
- [x] CRUD de envelopes
- [x] Salary (renda fixa) e onboarding com sugestão automática de modelo de orçamento
- [x] Onboarding com campo de valor da dívida (`debtAmount`) para modelagem personalizada
- [x] Renda variável (freela, shows, mentorias) direcionada para reserva de emergência
- [x] Tools de IA: getDailyPulse, getBalance, suggestModelChange
- [x] Prompt anti-alucinação com grounding de data no system prompt
- [x] Chat persistido no banco de dados (continuidade entre sessões)
- [x] Tier enforcement FREE/PREMIUM

### BFF (KOF)
- [x] Health check
- [x] Rotas públicas
- [x] Middleware JWT
- [x] Rotas protegidas
- [x] Rota de tier-status

### Frontend KOF (kof.ui) -- Monolito Modular
- [x] Infraestrutura Core (`core/`: `theme`, `constants`, `router_config`, `http_client`, `service_locator`)
- [x] Models compartilhados (`models/`: `user`, `transaction`, `envelope`, `chat`)
- [x] Componentes de UI reutilizáveis (`components/`: `primary_button`, `secondary_button`, `currency_input`, `pulse_card`, `bucket_bar`, `envelope_card`, `chat_bubble`, `nav_bar`, `choice_card`, `progress_dots`)
- [x] Fluxo de Auth (`screens/auth/`: `login_screen`, `register_screen`)
- [x] Fluxo de Boas-Vindas (`screens/welcome/`: `screen`)
- [x] Fluxo de Onboarding (`screens/onboarding/`: `state`, `salary_screen`, `income_type_screen`, `debt_screen`, `debt_amount_screen`, `result_screen`)
- [x] Dashboard (`screens/dashboard/`: `state`, `screen`)
- [x] Chat Coach (`screens/chat/`: `state`, `screen`)
- [x] Caixinhas / Envelopes (`screens/envelopes/`: `state`, `screen`)
- [x] Entrypoint e Roteador (`main.kf`)

### Design System
- [x] Paleta de cores (base, accent, texto, estado, categoria)
- [x] Tipografia (Manrope, pesos 400/600, 5 estilos)
- [x] Marca (logomark com 3 ondas, variante mono)
- [x] Componentes (botões, inputs, cards, barras de progresso, nav bar, bolhas de chat, choice cards, gráfico de pizza, dots, notificação push)
- [x] Layout (grid 8px, estrutura mobile 360×640)
- [x] Especificação de 11 telas (boas-vindas, login, cadastro, onboarding salário, tipo de renda, dívidas, valor da dívida, resultado, dashboard, chat, caixinhas, notificação)
- [x] Mapeamento de componentes para KOF (`kof.ui`)

## 📍 Roadmap — Arquitetura Monolítica Modular em KOF

- [x] **Etapa 0**: Estabelecer base de conhecimento (DESIGN_SYSTEM.md, KOF_REFERENCE.md)
- [x] **Etapa 1**: Estrutura de Pastas (core/, models/, components/, screens/)
- [x] **Etapa 2**: DTOs e Modelos Base
- [x] **Etapa 3**: Design System base em componentes reutilizáveis
- [x] **Etapa 4**: Core (Theme, Router, HTTP Client, Service Locator)
- [x] **Etapa 5**: Telas Core (Welcome, Autenticação)
- [x] **Etapa 6**: Telas Onboarding (Salary, Income, Debt, Debt Amount, Result)
- [x] **Etapa 7**: Telas Principais (Dashboard, Chat, Envelopes)
- [x] **Etapa 8**: Auditoria de Sintaxe KOF e Resolução de Erros de CI
- [x] **Etapa 9**: Transição KofLith — Unificação de Domínio e Gateway HTTP, Geração de Bytecode JVM Nativo e Validação de Runtime na porta 3000
- [x] **Etapa 10**: Validação de Paridade Diferencial KOF vs. Java Legado — Suíte formal de 5 testes de paridade (`tests/parity_test.kf` e `scripts/run_parity_tests.ps1`) com 100% de aprovação comprovando equivalência aritmética e de regras cognitivas.
- [x] **Etapa 11**: Homologação E2E Completa do Monólito KofLith e Dedução de Envelopes (Issues #24 e #36) — Suíte de 9 testes ponta a ponta (`scripts/test_e2e_flow.ps1`) com 100% de aprovação GREEN na porta 3000 cobrindo Auth JWT, Onboarding 50/30/20, Envelopes, Transações vinculadas com dedução automática, Pulso Diário e AI Coach.

## Documentação
- [x] Todos os arquivos `.md` atualizados (README, CLAUDE.md, CONTRIBUTING.md, DATA_MODEL.md, ARCHITECTURE_DECISIONS.md, PROJECT_STATUS.md, DESIGN_SYSTEM.md)

## O que está pendente (Features para Contribuidores)
  
  ### Frontend KOF (Integração API)
  - [x] **Integração de Login/Sessão**: Ligar a tela de Login ao endpoint BFF (`/auth`), armazenar o Token no estado global (`SessionState`) e aplicar em todas as requisições subsequentes.
  - [ ] **Integração do Dashboard**: Conectar os limites dos envelopes (Buckets) resgatados da API de orçamento aos widgets do KOF (atualizando barras de progresso e gráfico de pizza dinamicamente).
  - [ ] **Fluxo Onboarding -> SuggestModel**: Integrar a captura das perguntas (salário, renda variável, dívidas) e submeter ao `/api/users/me/onboarding`, aplicando o modelo de orçamento sugerido pela IA ao state local.
  - [ ] **Motor de Ação do Chat**: Integrar o input de texto/voz do `ChatScreen` com a rota recém-movida `/api/coach` (ou `/transactions`), renderizando o fluxo de bolhas com base na resposta de persistência do backend.
  
  ### Melhorias futuras
  - [ ] Flyway (substituir Hibernate `ddl-auto=update` por migrations versionadas)
  - [ ] Target Android (APK) usando a compilação cruzada do KOF
  - [ ] Screenshots da aplicação no README - Issue #16
  
  ## Issues ativas no GitHub
  - #11: `feat(frontend): tela de seleção/troca de modelo de orçamento`
  - #16: `Sugiro add print(s) da aplicação no README`
  - #24: `feat(backend): Adicionar envelope_id na TransactionEntity e atualizar IA Tool`
  - #25: `docs: Atualizar spec do MVP 1 por estar obsoleto`
  - #26: `pesquisa: CI pipeline para medir tempo de compilação do KOF`
  - #27: `pesquisa: Benchmarks automatizados de alocação de memória KofJS vs JVM`
  - #31: `docs: Iniciar Artigo 1 - Mapeamento Sistemático da Literatura (MSL)`
  - #32: `feat(frontend): Integrar Dashboard com API de Envelopes/Buckets`
  - #33: `feat(frontend): Integrar fluxo de Onboarding com SuggestModel`
  - #34: `feat(frontend): Integrar Motor de Ação do Chat`
  - #35: `chore(kof4j): isolar RawView e submeter PR em conformidade com CONTRIBUTING.md do KofLang`
  - #36: `test(e2e): homologação do fluxo completo do usuário no monólito KofLith (porta 3000)`
  - #37: `refactor(arch): arquivar legado Java (src/main/java) após homologação E2E do KofLith`

## Decisões tomadas
- Frontend + BFF em KOF (kof.ui / kof.web)
- Backend permanece Java/Spring Boot
- 6 modelos de orçamento adaptativos, selecionados automaticamente no onboarding
- Monetização: freemium (R$9,90/mês premium)
- Dashboard é a interface principal; entrada por voz é opcional
- Chat persistido no banco de dados, para continuidade do coach entre sessões
- Tipografia refinada: pesos 500 para títulos/subtítulos/choice cards e 600 para valores monetários (alinhamento visual mais fino)
- Design system fechado com passe de responsividade mobile/desktop, alinhamento entre telas e catálogo de modelos de notificação (ver Changelog em `DESIGN_SYSTEM.md`)
