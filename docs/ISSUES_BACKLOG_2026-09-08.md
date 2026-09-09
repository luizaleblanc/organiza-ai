# Backlog de Issues -- Auditoria de Arquitetura 2026-09-08

> Issues atômicas geradas a partir de `docs/ARCHITECTURE_AUDIT_2026-09-08.md`. Formato pronto para copiar para o GitHub Issues (título + corpo). Uma feature/fix por issue -- não agrupar.

---

### Issue A -- `fix(frontend): investigar crash ASM COMPUTE_FRAMES e documentar/corrigir uso de Router/Component`
**Prioridade:** Crítica
**Labels:** `bug`, `frontend`, `arquitetura`

`frontend/main.kf` e todas as telas usam `Router.route`, `Router.go`, `Component(...)`, `.view()`, `.onMount()`, `.onDispose()` -- API não listada em `CLAUDE.md` nem em `KOF_REFERENCE.md`, que descrevem navegação como "simular via show/hide de Views" (ainda sem suporte nativo). É a suspeita mais forte de causa raiz do `ArrayIndexOutOfBoundsException` no ASM `COMPUTE_FRAMES` que derrubou a pipeline `kof-check.yml`.

**Passo a passo:**
1. Rodar `kof run --target=js frontend/main.kf` localmente e confirmar se compila.
2. Se compilar local mas falhava remoto: documentar `Router`/`Component` em `KOF_REFERENCE.md` e atualizar a regra 7 do `CLAUDE.md`.
3. Se falhar também local: reescrever a navegação para o padrão show/hide de `View` documentado, telas por telas.

**Critério de aceite:** `kof run --target=js frontend/main.kf` compila localmente sem erro, e `CLAUDE.md`/`KOF_REFERENCE.md` refletem a API de navegação realmente usada.

---

### Issue B -- `fix(bff): corrigir path da rota de onboarding (/api/users/onboarding -> /api/users/me/onboarding)`
**Prioridade:** Alta
**Labels:** `bug`, `bff`

O BFF (`bff/main.kf`) faz proxy de `POST /api/users/onboarding` para o backend, mas o endpoint real é `POST /api/users/me/onboarding` (`OnboardingController`). Toda submissão de onboarding hoje falha ou retorna 404.

**Critério de aceite:** requisição autenticada de onboarding via BFF chega ao `OnboardingController` e retorna 200 com o corpo esperado.

---

### Issue C -- `feat(backend): expor GET /budgets/daily-pulse como rota REST`
**Prioridade:** Alta
**Labels:** `feat`, `backend`, `mod_budget`

O "pulso diário" hoje só existe como Spring AI function-calling tool (`GetDailyPulseFunction`, invocado pelo modelo durante o chat), sem rota REST direta. O BFF e o frontend já fazem proxy/fetch para `GET /api/budgets/daily-pulse` esperando uma resposta HTTP simples -- endpoint inexistente hoje.

**Passo a passo:**
1. Criar controller (`mod_budget` ou `mod_ai_coach`, avaliar melhor encaixe de domínio) expondo `GET /budgets/daily-pulse`.
2. Reaproveitar a lógica de `GetDailyPulseFunction`/`GetDailyPulseOutput` como serviço compartilhado entre a tool de IA e a rota REST (não duplicar regra de negócio).

**Critério de aceite:** `GET /budgets/daily-pulse` autenticado retorna o mesmo cálculo que a tool de IA usa internamente.

---

### Issue D -- `feat(backend): expor POST /chat/message como rota REST de texto`
**Prioridade:** Alta
**Labels:** `feat`, `backend`, `mod_ai_coach`

Hoje só existem `/api/coach/ai` (voz, multipart) e `/api/coach/ai-base64`. O frontend/BFF esperam uma rota de chat em texto puro (`POST /chat/message`), documentada como planejada desde `docs/ISSUES_GUIDE.md` (issue #2, 2026-08-29) mas nunca implementada.

**Critério de aceite:** `POST /chat/message` autenticado, com `{ "message": "..." }`, retorna a resposta do coach persistida em `ChatMessageEntity`, equivalente ao fluxo de voz.

---

### Issue E -- `fix(backend): adicionar GET /transactions (listagem geral) ou corrigir contrato do BFF`
**Prioridade:** Alta
**Labels:** `bug`, `backend`, `mod_transaction`

O BFF/frontend chamam `GET /transactions?month=`, mas o backend só expõe `/transactions/{category}`, `/transactions/summary` e `/transactions/dashboard` -- não existe uma listagem geral por mês. Decidir: (a) criar `GET /transactions?month=` no backend, ou (b) corrigir o frontend/BFF para usar `/transactions/dashboard` ou `/transactions/summary`, que já existem.

**Critério de aceite:** a tela de histórico de transações do frontend recebe dados reais do backend sem 404/dataset errado.

---

### Issue F -- `fix(frontend): conectar dados reais de GET /api/envelopes e /api/transactions às telas (remover mocks)`
**Prioridade:** Alta
**Labels:** `bug`, `frontend`

`envelopes/screen.kf` e `dashboard/screen.kf` fazem fetch em `onMount()` mas renderizam valores hardcoded (`"R$ 1.200"`, `"R$ 92,00"` etc.) -- a resposta da API é descartada. Depende das issues B/C/E estarem resolvidas para ter contrato estável para consumir.

**Critério de aceite:** valores exibidos nas telas de dashboard e envelopes refletem a resposta real da API, não constantes no código.

---

### Issue G -- `fix(frontend): enviar query params obrigatórios (month, userId) nas chamadas de transactions/envelopes`
**Prioridade:** Média
**Labels:** `bug`, `frontend`

`frontend/core/http_client.kf` chama `GET /api/transactions` e `GET /api/envelopes` sem os params `month`/`userId` que o BFF espera repassar ao backend. Depende da Issue F.

**Critério de aceite:** as chamadas incluem os params corretos derivados do estado da sessão (usuário logado, mês selecionado).

---

### Issue H -- `refactor(frontend): usar OnboardingState.salary/debtAmount como String formatada (regra 8 do CLAUDE.md)`
**Prioridade:** Média
**Labels:** `refactor`, `frontend`, `arquitetura`

`OnboardingState.salary`/`debtAmount` (`frontend/screens/onboarding/state.kf`) e `OnboardingData.salary` (`frontend/models/user.kf`) são tipados `Float`. `CLAUDE.md` regra 8 exige `String` formatada para valores monetários (KOF não tem `BigDecimal`).

**Critério de aceite:** os campos monetários do onboarding são `String` formatada ponta a ponta, sem operação aritmética em `Float` sobre valor monetário no frontend.

---

### Issue I -- `refactor(bff): usar os records tipados de bff/models.kf em vez de repasse de string crua`
**Prioridade:** Baixa
**Labels:** `refactor`, `bff`, `debt`

`bff/models.kf` define 10 records (`User`, `Envelope`, `Transaction`, etc.) nunca usados em `bff/main.kf`, que hoje faz repasse de `body()` cru sem `json.decode<T>`/`json.encode<T>`. Decidir: terminar de tipar as rotas ou remover os records mortos.

**Critério de aceite:** ou todas as rotas do BFF usam os records de `bff/models.kf` para validar entrada/saída, ou os records não usados são removidos.

---

### Issue J -- `fix(bff): remover PII (e-mail) do log de requisições autenticadas`
**Prioridade:** Baixa
**Labels:** `bug`, `bff`, `segurança`

`bff/middleware/auth.kf:74` faz `println` do `claims.sub()` (e-mail do usuário) em toda requisição autenticada -- log verboso com dado pessoal sem redação.

**Critério de aceite:** o log de autenticação não expõe e-mail (ou dado pessoal equivalente) em texto plano; usar um identificador não reversível ou nível de log condicionado a debug.

---

### Issue K -- `test(backend): cobertura de testes para mod_auth, mod_ai_coach e EnvelopeController`
**Prioridade:** Média
**Labels:** `test`, `backend`

`mod_auth` (login/register), `mod_ai_coach` (exceto `SuggestModelChangeFunctionTest`) e `mod_budget/EnvelopeController` (CRUD de envelopes) não têm nenhum teste automatizado hoje.

**Critério de aceite:** cada endpoint desses controllers tem ao menos um teste de sucesso e um de erro (`./gradlew test` verde).

---

### Issue L -- `docs: corrigir contradição no PROJECT_STATUS.md sobre status do frontend KOF`
**Prioridade:** Baixa
**Labels:** `docs`

Cabeçalho do `PROJECT_STATUS.md` (linha 4) diz "frontend KOF não iniciado"; a seção "O que está concluído" (linhas 45-56) lista as 11 telas como `[x]`. Atualizar para refletir o estado real (que a Issue A vai determinar -- telas escritas mas potencialmente não compiláveis).

**Critério de aceite:** `PROJECT_STATUS.md` não se contradiz sobre o status do frontend.

---

### Issue M -- `docs: remover referências a Flutter/Next.js de specs/PHASE_0_FOUNDATION.md`
**Prioridade:** Baixa
**Labels:** `docs`

Débito já identificado no ADR-015 e nunca pago: `specs/PHASE_0_FOUNDATION.md` ainda descreve scaffold Flutter e frontend Next.js como stack do projeto.

**Critério de aceite:** o spec da Fase 0 reflete a stack real (KOF para frontend/BFF), com nota histórica se necessário preservar contexto da decisão original.
