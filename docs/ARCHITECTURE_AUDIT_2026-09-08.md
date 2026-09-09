# Auditoria de Arquitetura -- Organiza IA (2026-09-08)

> Varredura completa da arquitetura monolítica modular (Backend Spring Boot + Frontend/BFF KOF) contra `CLAUDE.md`, `DECISIONS.md` e `DESIGN_SYSTEM.md`. Executada após a remoção da pipeline `kof-check.yml` do GitHub Actions (crash `ArrayIndexOutOfBoundsException` no ASM `COMPUTE_FRAMES` do compilador KOF remoto -- commit `aa5e698`). Testes e builds KOF passam a rodar exclusivamente em ambiente local; esta auditoria foi feita por inspeção estática de código, não por execução do compilador KOF.

## Metodologia

1. Inventário de todos os endpoints REST do backend (`@RequestMapping`/`@GetMapping`/etc. em `src/main/java/com/organiza`).
2. Inventário de todas as chamadas HTTP do frontend (`frontend/core/http_client.kf` e telas) e de todas as rotas do BFF (`bff/main.kf`).
3. Cruzamento frontend -> BFF -> backend, endpoint a endpoint.
4. Checagem das 9 regras invioláveis do `CLAUDE.md` (seção "Regras Inviolaveis") contra o código real.
5. Checagem de cobertura de testes por módulo.
6. Higiene da árvore Git (`.gitignore`, artefatos gerados não commitados).

## Resumo executivo

A arquitetura de alto nível (Backend Java isolado, Frontend+BFF em KOF, monólito modular por domínio) está corretamente implementada e respeitada nos três módulos. Os problemas encontrados são todos de **integração entre camadas** e **dívida documental**, não de violação da decisão arquitetural em si:

- O contrato HTTP entre BFF e Backend tem **3 rotas proxied para endpoints que não existem** no backend (chat, daily-pulse, e um path incorreto no onboarding).
- O frontend usa uma API de roteamento (`Router`/`Component`) **não documentada em `CLAUDE.md`/`KOF_REFERENCE.md`** e que contradiz a regra 7 do `CLAUDE.md` ("Navegação entre telas: simular via show/hide de Views"). Isso é a suspeita mais forte para a causa raiz do crash do compilador KOF remoto.
- Dois módulos de backend (`mod_ai_coach`, `mod_budget/EnvelopeController`) e o módulo `mod_auth` não têm cobertura de teste.
- Documentação desatualizada: `PROJECT_STATUS.md` se contradiz sobre o status do frontend; `specs/PHASE_0_FOUNDATION.md` ainda referencia Flutter/Next.js (débito já previsto no ADR-015, nunca pago).

---

## 1. Backend Spring Boot -- inventário de endpoints

| Módulo | Método | Path | Observação |
|---|---|---|---|
| mod_auth | POST | `/auth/login` | público |
| mod_auth | POST | `/auth/register` | público |
| mod_ai_coach | POST | `/api/coach/ai` | multipart, voz -> áudio |
| mod_ai_coach | POST | `/api/coach/ai-base64` | voz -> JSON |
| mod_budget | POST | `/api/envelopes` | |
| mod_budget | GET | `/api/envelopes` | |
| mod_budget | PUT | `/api/envelopes/{id}` | |
| mod_budget | DELETE | `/api/envelopes/{id}` | |
| mod_transaction | POST | `/transactions` | |
| mod_transaction | GET | `/transactions/{category}` | não existe `GET /transactions` puro |
| mod_transaction | DELETE | `/transactions` | |
| mod_transaction | GET | `/transactions/summary` | |
| mod_transaction | GET | `/transactions/dashboard` | |
| mod_user | GET | `/admin/users` | `@PreAuthorize("hasRole('ADMIN')")`, `@EnableMethodSecurity` confirmado ativo |
| mod_user | POST | `/api/users/me/onboarding` | |
| mod_user | GET | `/api/users/me/tier-status` | |
| mod_variable_income | POST | `/api/variable-income` | |
| mod_variable_income | GET | `/api/variable-income` | |

**Não existem no backend:** `POST /chat/message` e `GET /budgets/daily-pulse`. A lógica de "pulso diário" (`getDailyPulse`) e a persistência de chat (`ChatMessageEntity`) existem, mas são expostas apenas como **Spring AI function-calling tools** (`GetDailyPulseFunction`, `GetBalanceFunction`, `RegisterIncomeFunction`, `SuggestModelChangeFunction` em `mod_ai_coach/service/`), invocadas pelo próprio modelo durante uma conversa via `/api/coach/ai*` -- não como rotas REST diretas chamáveis pelo BFF.

## 2. Frontend (KOF) + BFF (KOF) -- mapeamento de chamadas

| Chamada do frontend | Rota do BFF | Alvo no backend | Status |
|---|---|---|---|
| `POST /api/auth/login` | pública | `POST /auth/login` | OK |
| `POST /api/auth/register` | pública | `POST /auth/register` | OK |
| `POST /api/users/onboarding` | protegida | `POST /api/users/onboarding` | **Path errado** -- backend real é `/api/users/me/onboarding` |
| `POST /api/chat/message` | protegida | `POST /chat/message` | **Endpoint inexistente no backend** (só existe como AI tool, não REST) |
| `GET /api/transactions` | protegida | `GET /transactions?month=` | **Endpoint inexistente** -- backend não tem `GET /transactions` puro, só `/transactions/{category}`, `/summary`, `/dashboard`; frontend também nunca envia o param `month` |
| `GET /api/budgets/daily-pulse` | protegida | `GET /budgets/daily-pulse` | **Endpoint inexistente no backend** (mesma causa do chat: é AI tool, não REST) |
| `GET /api/envelopes` | protegida | `GET /api/envelopes?userId=` | Path OK, mas frontend nunca envia `userId` e a resposta é descartada (ver achado F-2) |

Rotas do BFF sem consumidor no frontend hoje (não é bug, só feature ainda não implementada na UI): `PUT/DELETE /api/envelopes/:id`, `POST/GET /api/variable-income`, `GET /api/users/tier-status`.

## 3. Conformidade com as Regras Invioláveis do `CLAUDE.md`

| Regra | Status | Nota |
|---|---|---|
| 1. Frontend 100% KOF | ✅ | nenhum arquivo Flutter/React encontrado em `frontend/` |
| 2. BFF 100% KOF | ✅ | `bff/main.kf` é puro `kof.web`, sem Next.js |
| 3. Backend permanece Java/Spring Boot | ✅ | |
| 4. UI via KofJS/webview | não verificável estaticamente | depende de `kof run --target=js` local, não testado nesta auditoria |
| 5. Estado mutável em campos estáticos | ✅ | confirmado em `OnboardingState`, `DashboardState`, etc. -- nenhuma mutação de closure encontrada |
| 6. Composição hierárquica Window > View > Column/Row > widgets | ✅ | respeitada nos arquivos de tela inspecionados |
| 7. Limitações conhecidas do kof.ui (sem ListView/Image/Dialog/BottomNav/**Router**) | ❌ **Violada** | ver achado F-1 abaixo -- `Router`/`Component` são usados extensivamente mas não constam no `CLAUDE.md` nem no `KOF_REFERENCE.md` |
| 8. Valores monetários como String formatada | ❌ **Violada** | ver achado F-4 -- `salary`/`debtAmount` tipados como `Float` |
| 9. Padrão de commits `feat(frontend):`/`feat(bff):` | ✅ | confirmado no histórico recente |

---

## 4. Achados detalhados

### F-1 [CRÍTICO] `Router`/`Component` não documentados, usados em todo o frontend
`frontend/main.kf` e todas as telas usam `Router.route`, `Router.go`, `Component("initial")`, `.view()`, `.onMount()`, `.onDispose()`. Essa API não existe na referência oficial de `kof.ui` citada no `CLAUDE.md` (que lista apenas `Window, Label, Button, Input, Column, Row, View, Style, Color, Theme`) nem no `KOF_REFERENCE.md`. O `CLAUDE.md` (regra 7) afirma explicitamente que navegação entre telas ainda não tem suporte nativo e deve ser simulada via show/hide de `View`. Isso é forte candidato a causa raiz do `ArrayIndexOutOfBoundsException` no ASM `COMPUTE_FRAMES` que derrubou a pipeline remota: se `Router`/`Component` geram bytecode com hierarquia de frames que o compilador KOF não sabe computar, todo o frontend está construído sobre uma API instável ou não suportada.
**Ação recomendada:** validar localmente com `kof run --target=js frontend/main.kf`. Se compilar localmente mas falhava remotamente, documentar `Router`/`Component` no `KOF_REFERENCE.md` e atualizar `CLAUDE.md` regra 7. Se não compilar nem localmente, é a causa raiz confirmada do crash e precisa de reescrita para o padrão show/hide de `View`.

### F-2 [ALTO] Telas com fetch real mas renderização 100% mockada
`frontend/screens/envelopes/screen.kf` chama `GET /api/envelopes` em `onMount()`, mas os valores exibidos são hardcoded (`"R$ 1.200"`, `"R$ 320"` etc.). Mesmo padrão suspeito em `dashboard/screen.kf` (valores fixos como `"R$ 92,00"`). O fetch existe, mas o dado nunca chega à tela -- trabalho de data-binding incompleto.

### F-3 [MÉDIO] Contratos JSON tipados do BFF não usados
`bff/models.kf` define 10 records tipados (`User`, `Envelope`, `Transaction`, `LoginRequest`, etc.) que nunca são referenciados em `bff/main.kf` -- o BFF hoje faz repasse de string crua (`body()`) sem `json.decode<T>`/`json.encode<T>`. Código morto ou trabalho de validação de contrato inacabado.

### F-4 [MÉDIO] Valores monetários tipados como `Float`, violando regra 8 do `CLAUDE.md`
`OnboardingState.salary`/`debtAmount` (`frontend/screens/onboarding/state.kf`) e `OnboardingData.salary` (`frontend/models/user.kf`) são `Float`, não `String` formatada. Risco de erro de arredondamento binário em valor monetário antes mesmo de chegar ao backend.

### F-5 [ALTO] Três descasamentos de contrato BFF -> Backend
Ver tabela da seção 2: `/api/users/onboarding` (path errado), `POST /chat/message` e `GET /budgets/daily-pulse` (endpoints inexistentes -- a lógica só existe como AI function-calling tool, não como rota REST). O próprio `docs/ISSUES_GUIDE.md` (issue #2) já sinalizava isso como risco conhecido em 2026-08-29 ("endpoint no backend ainda não existe -- verificar se já foi criado por outra issue de backend antes de assumir o contrato"); o aviso nunca foi resolvido e o frontend/BFF avançaram construindo sobre o contrato assumido.

### F-6 [MÉDIO] Cobertura de teste ausente em 3 módulos
`mod_auth` (login/register), `mod_ai_coach` (voz, chat, exceto `SuggestModelChangeFunctionTest`) e `mod_budget/EnvelopeController` (CRUD de envelopes) não têm nenhum teste. `mod_transaction` e `mod_variable_income` têm boa cobertura.

### F-7 [BAIXO] PII em log
`bff/middleware/auth.kf:74` faz `println` do e-mail do usuário (`claims.sub()`) em toda requisição autenticada -- log verboso com dado pessoal, sem redação.

### F-8 [BAIXO] Query params obrigatórios nunca enviados
BFF repassa `?month=` (transactions) e `?userId=` (envelopes) literalmente vazios porque o frontend nunca os preenche -- risco de erro 400 ou retorno de dataset errado/completo no backend.

### F-9 [DOCUMENTAÇÃO] `PROJECT_STATUS.md` se contradiz
Cabeçalho (linha 4) diz "frontend KOF não iniciado"; a seção "O que está concluído" (linhas 45-56) lista as 11 telas como `[x]` concluídas. Um dos dois está desatualizado.

### F-10 [DOCUMENTAÇÃO] `specs/PHASE_0_FOUNDATION.md` referencia stack legada
Ainda cita Flutter e Next.js como stack do projeto -- débito já identificado no ADR-015 ("`specs/PHASE_X_*.md` ainda referenciam Flutter/Next.js... devem ser tratadas como desatualizadas"), nunca corrigido no arquivo.

### F-11 [HIGIENE DE REPOSITÓRIO] `.agent/` e `.agents/` não estavam no `.gitignore`
Diretórios gerados pelo instalador `npx @tech-leads-club/agent-skills` (skills + lockfile) apareciam como untracked na raiz. Corrigido nesta sessão -- adicionados ao `.gitignore`. `bin/`, `build/`, `.gradle/`, `.env`, `.vscode/` já estavam corretamente ignorados.

---

## 5. O que NÃO é um problema (verificado e descartado)

- Segurança: `SecurityConfigurations` bloqueia tudo por padrão (`anyRequest().authenticated()`), com exceção explícita só para `/auth/login`, `/auth/register`, `OPTIONS /**` e `GET /actuator/health`. `@EnableMethodSecurity` está ativo, então `@PreAuthorize("hasRole('ADMIN')")` no `AdminController` funciona de fato.
- JWT no BFF (`bff/middleware/auth.kf`): validação real de assinatura + expiração, não é stub.
- Estado mutável do frontend: nenhuma violação da regra 5 (campos estáticos) encontrada.
- `router_config.kf` isolado não é o problema -- é só uma classe de constantes de string; o problema é o `Router`/`Component` usado nas telas (achado F-1).
