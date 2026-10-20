# Homologação Java → Kof e Roadmap do MVP 1

> Inspeção de 16/10/2026 sobre `HEAD = dddde36`, com `kof 0.6.3` (kof.jar sha256 `7aa835b0…7bd9`) e JDK 25.0.3.
> Os gates rodaram num clone limpo (`%TEMP%\oa-insp`, 0 arquivos alterados). Nada foi escrito na Aiven nem no Render.
> Legado: `archive/legacy-backend-java/src/main/java/com/organiza/` (abaixo, `L/`). Kof: `backend/*.kf`.

## 1. Resumo executivo

**O que está homologado.** O núcleo do fluxo "cadastro → onboarding → envelope → gasto → pulso" funciona e persiste no banco. Isso foi medido no **MySQL 8.4 local** (sessão com `ANSI_QUOTES`, URL `mysql://…?sslMode=trust`, igual à produção) e no **H2**:

- G-BUILD: `kof check` e `kof build` sem erros. VerifyAll: 70 classes e 0 erros. LinkAll: 102/102.
- G-E2E: **37/38** nos dois bancos. A única falha é o teste 29 (tier-status), já registrada na issue #44.
- G-RESTART: **25/25** nos dois bancos, tanto no encerramento normal quanto no `kill` forçado.

Também estão cobertos: autenticação JWT (iss, aud, exp e adulteração), o rate limit do login e o isolamento de dados por dono (testes de IDOR 33 a 37). A gravação da transação e o desconto do envelope acontecem numa única transação do banco.

**O que falta.** De 52 itens do legado, **12 estão ✅, 24 estão ⚠️ e 16 estão ❌**. As lacunas principais:

- **Coach sem LLM.** `/api/chat/message` devolve um texto fixo com o pulso. Faltam as tools, a memória da conversa e o limite freemium.
- **Voz ausente.** Whisper e TTS não foram portados.
- **Rotas sem porta HTTP:** PUT e DELETE de envelope, listagem por categoria, resumo, limpeza, admin e `PATCH salary`.
- **Datas fixas** (#44): o mês começa sempre em `2026-09-01`, `createdAt` fica nulo ou fixo e `daysRemaining` é sempre 30.
- O scheduler do Kakeibo não existe, e as 4 perguntas do Kakeibo também não.
- **Validação de entrada inexistente.** JSON malformado devolve 500 e o salário negativo é aceito.
- `/api/users/me` não existe, nem o campo `name`.

**Riscos de produção (medidos):**

1. **Sem reconexão ao banco.** Reiniciei o MySQL com o servidor no ar. Daí em diante, todo login e toda listagem deram **500** até reiniciar o app (probe P10). O backend usa uma conexão única em `DbConn.handle` (`backend/store.kf:85-87`, `:171-198`). Uma manutenção na Aiven ou um *idle timeout* derrubam a produção sem recuperação.
2. **Uma transação de banco divide a mesma conexão com todas as requisições.** O bloco `transaction {}` em `services.kf:331` roda na conexão única, então requisições simultâneas podem cair dentro do commit ou do rollback de outra. Isso não foi reproduzido com carga. Está deduzido do código e precisa de um teste de concorrência.
3. **JSON malformado ou campo faltando devolve 500** (P1, P2 e P8). Nenhum caso devolve 400.
4. **Freemium sem efeito** (#44). `enforceCanSendMessage` nunca é chamado e `messagesUsed` fica sempre em 0.
5. **`sslMode=trust`.** O TLS está ativo, mas o certificado não é verificado (`store.kf:131-143`). Um ataque *man-in-the-middle* entre o Render e a Aiven não é detectado. O correto é `verify-full` com o CA da Aiven.

A corrida de cadastro está protegida: com 8 POSTs simultâneos para o mesmo e-mail, 1 deu 200 e 7 deram 409, e ficou 1 linha no banco, porque a coluna tem `UNIQUE KEY email`. Ainda assim, o perdedor da corrida pode receber 500 em vez de 409, porque a violação escapa de `catch (String)` (`store.kf:267`). *(Fases 0.1, 0.2 e 0.4 resolvidas depois desta inspeção; ver a seção 4.)*

## 2. Matriz Java → Kof

Legenda: ✅ homologado (rota + lógica equivalente + persistido + teste real) · ⚠️ parcial · ❌ ausente.
Os números de teste se referem a `scripts/test_e2e_flow.ps1` (E2E) e `scripts/test_restart.ps1` (RST).

> O legado **não tem `src/test`** no `archive/`. Por isso a especificação de comportamento veio do código Java, e não de testes. O `tests/parity_test.kf` também não executa: `kof test` compila cada arquivo isoladamente, como diz o cabeçalho do próprio arquivo.

### 2.1 Endpoints

| # | Item | Legado | Kof | Persistido | Testado | Status | Observação |
|---|---|---|---|---|---|---|---|
| 1 | Login | `L/mod_auth/controller/AuthController.java:36` `POST /auth/login` | `main.kf:54` `POST /api/auth/login` | UserRow | E2E 6–8, 38; RST 8/18/22 | ✅ | Rate limit de 5/min; mesma mensagem para e-mail inexistente e senha errada |
| 2 | Cadastro | `AuthController.java:48` | `main.kf:68` | UserRow | E2E 4–5 | ⚠️ | Sem validação (aceita e-mail `naoemail`, senha de 1 caractere: P3). JSON malformado ou sem senha dá 500 (P1/P2). Grava `hasSalary=true`, mas a spec do batch 2 pede `false`. Sem `name` |
| 3 | Criar envelope | `L/mod_budget/controller/EnvelopeController.java:33` | `main.kf:165` | EnvelopeRow | E2E 18, 36 | ⚠️ | Ignora `limitType`/`movingAverageMonths`; devolve 200, e não 201 |
| 4 | Listar envelopes | `EnvelopeController.java:46` (`?userId=`, IDOR no legado) | `main.kf:160` | EnvelopeRow | E2E 19, 23; RST 10/20/24 | ✅ | Dono vem das claims (melhor que o legado) |
| 5 | Editar envelope | `EnvelopeController.java:51` `PUT /{id}` | `main.kf` `PUT /api/envelopes/:id` → `services.kf` `updateEnvelope` | EnvelopeRow | E2E "PUT /api/envelopes", "IDOR" | ✅ | Padrões do legado (`FIXED`, 3 meses); outro dono ou id inexistente = 404 |
| 6 | Excluir envelope | `EnvelopeController.java:59` | `main.kf` `DELETE /api/envelopes/:id` | EnvelopeRow | E2E "DELETE", "IDOR" | ✅ | 204; outro dono ou já apagado = 404. As transações ficam com o id antigo, como no legado |
| 7 | Criar transação | `L/mod_transaction/controller/TransactionController.java:41` | `main.kf:186` → `services.kf:318` | TransactionRow + EnvelopeRow | E2E 20–21, 31–32, "createdAt real"; RST 5/11 | ✅ | Atômica e com valores em centavos. `createdAt` = instante UTC real (`nowIso`, Fase 2) |
| 8 | Listar por categoria | `TransactionController.java:48` `GET /{category}` | `main.kf` `GET /api/transactions/:category` | (leitura) | E2E "/{category}" | ✅ | Categoria inválida = 400 |
| 9 | Limpar transações | `TransactionController.java:53` `DELETE` | `services.kf:372` (sem rota) | — | — | ❌ | — |
| 10 | Resumo por categoria | `TransactionController.java:59` `GET /summary` | `main.kf` `GET /api/transactions/summary` | (leitura) | E2E "/summary" | ✅ | Mapa categoria → total, como no legado |
| 11 | Dashboard | `TransactionController.java:75` `GET /dashboard` (JSON com categorias, % e transações) | `main.kf:203` `GET /api/dashboard` | — | E2E 28 | ⚠️ | Só o total é real. Categorias e transações são **texto fixo** (`main.kf:207`), num formato `a|b|c` e não JSON |
| 12 | Admin: listar usuários | `L/mod_user/controller/AdminController.java:35` | — | — | — | ❌ | Não há checagem de `Role.ADMIN` |
| 13 | Admin: migrar modelo | `AdminController.java:41` | `services.kf:228` (sem rota) | — | — | ❌ | Lógica portada (ver #32) |
| 14 | Onboarding | `L/mod_user/controller/OnboardingController.java:36` `/api/users/me/onboarding` | `main.kf:85` `/api/users/onboarding` | UserRow | E2E 16–17; RST 3/13 | ⚠️ | `debtAmount` não é lido nem gravado (`debtCents` fica 0). Aceita salário negativo (P7). Resposta em texto `a|b|c`, não JSON |
| 15 | Atualizar salário | `L/mod_user/controller/SalaryController.java:26` `PATCH /me/salary` | `main.kf` `PATCH /api/users/me/salary` | UserRow | E2E "PATCH salary" | ✅ | Também migra o modelo (`migrateBudgetModelIfNeeded`) e devolve os buckets novos |
| 16 | Status do plano | `L/mod_user/controller/TierStatusController.java:19` | `main.kf` `GET /api/users/tier-status` | ChatMessageRow (contagem) | E2E "tier-status", "Freemium" | ✅ | Conta as mensagens do usuário desde a meia-noite local do dia 1 (Fase 2) |
| 17 | Registrar renda variável | `L/mod_variable_income/controller/VariableIncomeController.java:29` | `main.kf:121` → `coach.kf:171` | VariableIncomeRow | E2E 26 | ✅ | Passa pelo `RegisterIncomeFunction`: texto com "salário"/"fixo" não grava, igual à tool do legado |
| 18 | Listar renda variável | `VariableIncomeController.java:36` | `main.kf:127` | VariableIncomeRow | E2E 27, 35 | ✅ | — |
| 19 | Chat de texto (coach) | `L/mod_ai_coach/controller/VoiceCommandController.java:121` `POST /api/coach/chat` | `main.kf:141` `POST /api/chat/message` | ChatMessageRow | E2E 25, "Freemium" | ⚠️ | **Sem LLM**: resposta fixa com o pulso. Sem tools e sem memória. Limite do plano aplicado (402) e `createdAt` real desde a Fase 2 |
| 20 | Voz (multipart → MP3) | `VoiceCommandController.java:89` `/api/coach/ai` | — | — | — | ❌ | Whisper (`language=pt`) + GPT + TTS `tts-1`/`nova` |
| 21 | Voz (base64) | `VoiceCommandController.java:97` `/api/coach/ai-base64` | — | — | — | ❌ | Devolvia 402 quando o limite do plano estourava |

### 2.2 Tools de IA (Spring AI `defaultToolNames`, `VoiceCommandController.java:35-37`)

| # | Item | Legado | Kof | Persistido | Testado | Status | Observação |
|---|---|---|---|---|---|---|---|
| 22 | GetBalance | `L/mod_ai_coach/service/GetBalanceFunction.java` | `coach.kf` + `GET /api/budgets/balance` | (leitura) | E2E "balance" (SURVIVAL e KAKEIBO) | ✅ | Fora do Base Zero, `totalSpent` e `notAllocated` passam a ser o gasto do mês e o que sobra do salário (o legado devolvia `null`) |
| 23 | GetDailyPulse | `GetDailyPulseFunction.java` | `coach.kf:75` + `main.kf:136` | (leitura) | E2E 15, 17, 24, 37; RST 9 | ✅ | `(salário − gasto do mês)/dias restantes`, com o mês e os dias calculados com `kof.time` (Fase 2) |
| 24 | RegisterIncome | `RegisterIncomeFunction.java` | `coach.kf:171` | VariableIncomeRow | E2E 26 | ✅ | — |
| 25 | SuggestModelChange | `SuggestModelChangeFunction.java` | `coach.kf:198` | — | — | ⚠️ | Sem rota nem tool |
| 26 | AnswerKakeiboReflection | `AnswerKakeiboReflectionFunction.java` | `coach.kf:225` | KakeiboReflectionRow | — | ⚠️ | Sem rota nem tool. Grava só a reflexão da semana; o cálculo de `weekStart` fica com quem chama |
| 27 | persistTransactionUseCase | `L/mod_transaction/service/PersistTransactionUseCase.java` | `services.kf:318` | TransactionRow | E2E 20 | ✅ | — |
| 28 | listTransactionsByCategoryUseCase | `ListTransactionsByCategoryUseCase.java` | `services.kf:360` | (leitura) | E2E "/{category}" | ✅ | Rota da Fase 3; como tool do coach, fica para a Fase 4 |
| 29 | getTotalByCategoryUseCase | `GetTotalByCategoryUseCase.java` | `services.kf:348` | (leitura) | — | ⚠️ | Sem rota nem tool |

### 2.3 Regras de domínio, agendamento e segurança

| # | Item | Legado | Kof | Persistido | Testado | Status | Observação |
|---|---|---|---|---|---|---|---|
| 30 | Sugestão de modelo (limiares de 3242 e 5000) | `L/mod_budget/service/BudgetModelSuggestionService.java` | `services.kf:122` | UserRow.budgetModel | E2E 16 (SURVIVAL) | ✅ | Condições idênticas, linha a linha |
| 31 | Planos 50/30/20, 70/20/10, 70/10/20, 80/20, Kakeibo e Base Zero | `BudgetModelPlanService.java` | `services.kf:142`, `:158` | — | E2E 16 | ✅ | Só o SURVIVAL é exercitado no E2E |
| 32 | Migração de modelo | `BudgetModelMigrationService.java` | `services.kf:228` | UserRow.budgetModel | E2E "PATCH salary" (SURVIVAL → STANDARD) | ⚠️ | Chamada pelo `PATCH salary`. Só 1 das 6 transições tem teste |
| 33 | Média móvel do envelope | `EnvelopeService.java` (`calculateMovingAverage` devolve `ZERO`) | `services.kf:216` (devolve `0.0`) | — | — | ⚠️ | Paridade de um **stub**: a funcionalidade não existe em nenhum dos dois |
| 34 | Desconto do envelope | `EnvelopeService.updateSpent` | `store.kf:386` | EnvelopeRow | E2E 23; RST 10 | ✅ | Feito em centavos e na mesma transação do gasto |
| 35 | Destino da renda variável | `L/mod_variable_income/service/VariableIncomeService.java` | `services.kf:267` + `PUT /api/users/me/emergency-goal` | VariableIncomeRow + UserRow | E2E 26, "Meta da reserva" | ✅ | Reserva até bater a meta, depois orçamento (testado nos dois sentidos) |
| 36 | Limites do plano (30 mensagens/mês; voz só no Premium) | `L/shared/service/TierEnforcementService.java` | `services.kf` (`enforceCanSendMessage` chamado no chat) | — | E2E "Freemium" | ✅ | 31ª mensagem do mês = 402 com a mensagem do legado. `enforceVoiceAllowed` fica para a voz (MVP 2) |
| 37 | Scheduler do Kakeibo (seg 18h) | `L/mod_ai_coach/service/KakeiboReflectionScheduler.java:28` | — | — | — | ❌ | Kof tem `time.interval` (corpus de treinamento); não implementado |
| 38 | Serviço do Kakeibo (perguntas, `getWeekStart`, `shouldAsk`) | `KakeiboReflectionService.java:18` | `coach.kf:214` | KakeiboReflectionRow | — | ⚠️ | As 4 `QUESTIONS` e o cálculo de `weekStart` não foram portados |
| 39 | Mapa categoria → bucket | `CategoryBucketMapper.java` | `coach.kf:25-62` | — | parity_test não executável | ⚠️ | Leitura bate com o Java; falta teste que rode |
| 40 | JWT (filtro e emissão) | `L/shared/security/SecurityFilter.java`, `L/mod_auth/service/TokenService.java` | `auth.kf`, `main.kf:36` | — | E2E 1–2, 9–14 | ✅ | Mais estrito que o legado (iss e aud) |
| 41 | Hash de senha | `AuthorizationService` (BCrypt) | `passwords.hash` (`main.kf:76`) | UserRow | E2E 6–7 | ✅ | — |
| 42 | Papel ADMIN (`@PreAuthorize`) | `AdminController.java` | — | UserRow.role | — | ❌ | — |
| 43 | Tratamento global de erro (400/402) | `L/shared/exception/GlobalExceptionHandler.java` | — | — | P1, P2, P8 = 500 | ❌ | Erros de entrada devolvem 500 com corpo vazio |
| 44 | Memória do chat (últimas 20 do banco) | `VoiceCommandController.java` (`syncChatMemoryFromDatabase`) | — | ChatMessageRow | — | ❌ | Depende de `createdAt` real (#44) |
| 45 | Cliente OpenAI (Spring AI) | `L/shared/config/RestClientConfig.java` + `application.*` | — | — | probe com mock (§5.6) | ❌ | Viável com `http.post` (medido) |

### 2.4 Entidades e colunas

| # | Entidade | Legado | Kof (`store.kf`) | Status | Observação |
|---|---|---|---|---|---|
| 46 | Envelope | `EnvelopeEntity` (id, userId, categoryName, limitAmount, currentSpent, limitType, movingAverageMonths, createdAt) | `EnvelopeRow` `:48` | ✅ | Valores em centavos |
| 47 | Usuário | `UserEntity` (+ `debtAmount`, `emergencyFundGoal`) | `UserRow` `:18` (`debtCents`, `emergencyGoalCents`, `name`) | ✅ | Dívida pelo onboarding (F3), meta pela rota da Fase 3, `name` pelo cadastro (F1) |
| 48 | Transação | `TransactionEntity` (createdAt `Instant`) | `TransactionRow` `:35` | ✅ | `createdAt` = instante UTC ISO-8601 |
| 49 | Mensagem do chat | `ChatMessageEntity` | `ChatMessageRow` `:59` | ✅ | `createdAt` = instante UTC ISO-8601 |
| 50 | Reflexão Kakeibo | `KakeiboReflectionEntity` (answers `List`) | `KakeiboReflectionRow` `:76` (`answersJson`) | ⚠️ | Persistência sem rota e sem teste |
| 51 | Renda variável | `VariableIncomeEntity` (date) | `VariableIncomeRow` `:67` | ✅ | `date` = instante UTC ISO-8601 |
| 52 | Orçamento mensal | `L/mod_budget/model/BudgetEntity.java` | — | ❌ | No legado só existe o repositório, sem uso; avaliar se vale portar ou descartar |

**Contagem:** ✅ 28 · ⚠️ 13 · ❌ 11 (total 52), depois da Fase 3. Depois da Fase 2 eram ✅ 19 · ⚠️ 17 · ❌ 16; na inspeção de 16/10, ✅ 12 · ⚠️ 24 · ❌ 16.

## 3. Escopo do MVP 1 (design Desktop, com Mobile como espelho)

Fonte: os artefatos [Desktop](https://claude.ai/artifact/64FYjX5UiveVxTtRGYurQP) e [Mobile](https://claude.ai/artifact/8b3jFV4BrGj4YkDQAwDvDF), lidos nesta inspeção. O Desktop tem 13 telas. O Mobile acrescenta o campo "Valor total das dívidas" (Tela 6.1), o botão "+" no dashboard e o link "Ver histórico" por caixinha.

No frontend Kof existem só `frontend/main.kf`, `core/` (api_client, app_state, navigation, theme) e `components/` (brand_header, nav_bar). **Nenhuma tela foi implementada.**

| # | Tela / funcionalidade | Backend necessário | Status backend | Frontend | Status |
|---|---|---|---|---|---|
| 1 | Boas-vindas | servir os arquivos estáticos na mesma origem (F4) | ❌ | Tela 1 (#33) | ❌ |
| 2 | Login (+ "Esqueci a senha") | `POST /api/auth/login` ✅; recuperar senha | ⚠️ (recuperação de senha ausente; definir se é MVP 2) | #33 | ❌ |
| 3 | Cadastro (nome, sobrenome, e-mail, senha, confirmação) | register com `name` e validações (F1, F2) | ⚠️ | #33 | ❌ |
| 4–6.1 | Onboarding: salário, tipo de renda, dívida e valor da dívida | onboarding com `debtAmount`, validação e JSON (F2, F3) | ⚠️ | #33 | ❌ |
| 7 | Onboarding: gastos fixos e variáveis ("a IA cria as caixinhas") | `POST /api/envelopes/from-chips` (regra fixa chip → categoria) | ✅ (Fase 3) | #33 | ❌ |
| 8 | Onboarding: resultado (modelo + buckets) | resposta JSON com modelo, descrição e buckets | ⚠️ (texto `a|b|c`) | #33 | ❌ |
| 9 | Dashboard (pulso, gastos do mês, reserva acumulada, pizza do modelo, últimas transações, Semana/Mês/Ano) | `GET /api/dashboard?period=week|month|year` em JSON real + `GET /api/budgets/balance` | ✅ (Fases 2 e 3) | #32 | ❌ |
| 10 | Organiza AI (chat de texto, voz, upload de fatura PDF) | coach com LLM + tools + memória + limite freemium; voz (Whisper/TTS); leitura de PDF/imagem com confirmação; limite de 1 PDF/mês no Gratuito | ❌ (texto fixo) | #34 | ❌ |
| 11 | Caixinhas por bucket (status Em dia/Alerta/Estourada, nova caixinha, histórico) | `GET /api/envelopes/overview`, `PUT`/`DELETE /api/envelopes/:id`; histórico por caixinha só no Mobile | ✅ (Fase 3) | #11 | ❌ |
| 12 | Notificações (estouro, alerta, pulso, meta batida, lembrete; marcar como lidas) | `NotificationRow` + regras + `GET /api/notifications` e `POST /api/notifications/read-all` | ✅ (Fase 3) | #11 | ❌ |
| 13 | Configurações: tema | — (local) | n/a | — | ❌ |
| 13 | Configurações: e-mail/push diário às 20h | preferências (`GET`/`PUT /api/users/me/preferences`, Fase 3) + job agendado + envio de e-mail | ⚠️ (preferências feitas; envio na Fase 3.1) | — | ❌ |
| 13 | Configurações: rever salário (refaz o onboarding e migra o modelo) | `PATCH /api/users/me/salary` (migra o modelo) ou um novo `POST /api/users/onboarding`; troca manual `PUT /api/users/me/budget-model` (#11) | ✅ (Fase 3) | — | ❌ |
| 13 | Configurações: Open Finance "Demo · MVP 1" | `GET /api/open-finance/banks` e `POST /api/open-finance/connect`, marcados `demo: true`, sem conexão nem dado bancário | ✅ (Fase 3) | — | ❌ |
| 13 | Configurações: conta (e-mail, senha, 2FA) | marcado **MVP 2** no design | fora | — | fora |
| — | Sessão: `/api/users/me` (nome, e-mail, `onboardingCompleted`, tier) | F3 | ❌ | #33 | ❌ |

## 4. Roadmap

Ordem: primeiro o que derruba a produção, depois o que bloqueia o frontend, depois as funcionalidades. Estimativa relativa: P (≤1 dia), M (2–4 dias), G (>1 semana). Todo item de backend só fecha com **G-BUILD + G-BYTECODE + G-E2E + G-RESTART verdes em H2 e em MySQL 8.4 local**.

### Fase 0: Estabilidade de produção (bloqueia tudo)

| Item | Aceite verificável | Est. | Nível |
|---|---|---|---|
| ✅ 0.1 Reconexão ao banco (pool ou reabrir a conexão quando cair) | Probe P10: com o servidor no ar, `docker restart` do MySQL → próximo login = 200 sem reiniciar o app; G-RESTART 25/25 | M | avancado |
| ✅ 0.2 Transações isoladas por requisição | Teste com 20 POSTs `/api/transactions` em paralelo + 1 falha forçada: soma do envelope = soma das transações gravadas; nenhuma gravação órfã | M | avancado |
| 0.3 `sslMode=verify-full` com o CA da Aiven | Boot em produção recusa `trust`; teste local com certificado inválido falha no boot | P | intermediario |
| ✅ 0.4 Erros de entrada → 400 (inclui F2 §6) | `curl` com `{"email":`, `{bad`, `"salary":"abc"` → 400 `{"error":"Dados inválidos."}`; violação de unique no cadastro → 409, nunca 500 | P | intermediario |

**0.1 feito** (`fix(backend): reconexao ao banco e timeouts`). Antes de cada requisição, o middleware faz `SELECT 1` na conexão principal (`ensureDb`, `backend/store.kf`). Se o ping falhar, o backend abre uma conexão nova com as mesmas credenciais e fecha a antiga. A troca acontece com a única ficha de um `Channel<Int>` (`DbConn.lock`), para que duas requisições não reabram ao mesmo tempo. Com o banco fora, a rota responde **503** em vez de 500. Na URL do MySQL, o backend acrescenta `connectTimeout=5000&socketTimeout=10000`, que são parâmetros do MariaDB Connector/J 3.5. Os padrões do driver são 30000 ms e 0 (sem limite). No boot, uma falha sai com a mensagem "nao foi possivel conectar ao banco (esquema mysql)", sem URL, usuário ou senha. Evidência (MySQL 8.4 local, kof 0.6.3):

```
G-DB-BOUNCE  dddde36: login/envelopes = 500 por 60 s depois do `docker restart` (VERMELHO)
G-DB-BOUNCE  0.1:     503 em t=2,0 s → login 200 e envelopes 200 em t=6,1 s, mesmo processo
G-BOOT-DOWN  dddde36: IP sem resposta → exit=1 em 22,3 s, stack com "Socket fail to connect to 10.255.255.1"
G-BOOT-DOWN  0.1:     MySQL parado → exit=1 em 1,2 s; IP sem resposta → exit=1 em 6,1 s; senha no log: 0
G-E2E 37/38 (H2 e MySQL, só a #44) · G-RESTART 25/25 (H2 e MySQL) · VerifyAll 70 classes, 0 erros · LinkAll 102/102
```

**0.2 feito** (`fix(backend): transacao isolada por requisicao`). O risco 2 da seção 1 foi reproduzido com carga. O `transaction {}` do `kof.db` roda na última conexão aberta (`kof_db_transaction` usa `KOF_DB_DEFAULT`). Por isso a gravação da transação agora acontece numa conexão dedicada (`txConnection`, `backend/store.kf`), e uma transação por vez segura a ficha do `DbConn.lock`. O desconto do envelope é lido e gravado nessa mesma conexão. Se der erro, a conexão dedicada é descartada e a resposta não traz o detalhe do banco. No kof 0.6.3, um `transaction {}` dentro de `try` não compila (`Internal compiler error: null [COMP002]`, repro de 10 linhas). Por isso o bloco ficou numa função própria (`insertTransactionAndSpend`). G-CONC (`tools/conc.sh`): por rodada, 20 transações válidas, 3 que falham no banco (descrição de 300 caracteres) e 20 cadastros, todos em paralelo, em 3 rodadas:

```
antes (0.1)   MySQL: as 120 respostas esperadas deram 200, mas 51/60 transações gravadas, envelope 230,00 ≠ soma 510,00, 56/60 cadastros   VERMELHO
antes (0.1)   H2:    60/60 transações, envelope 560,00 ≠ soma 600,00, 58/60 cadastros                                  VERMELHO
depois (0.2)  MySQL: 60/60 transações, soma 600,00 = envelope 600,00, 60/60 cadastros, as 9 falhas sem linha órfã         VERDE
depois (0.2)  H2:    60/60 transações, soma 600,00 = envelope 600,00, 60/60 cadastros                                    VERDE
G-E2E 37/38 (H2 e MySQL, só a #44) · G-RESTART 25/25 (H2 e MySQL) · VerifyAll 70 classes, 0 erros · LinkAll 102/102
G-DB-BOUNCE: transação 200 antes e depois do `docker restart` do MySQL, sem reiniciar o app
```

**Health com banco** (`feat(backend): health verifica o banco`, parte do aceite da Fase 0). O `/health` usa o mesmo `ensureDb` (`SELECT 1` e reabertura da conexão). Responde `OK` com 200 quando o banco responde e 503 sem detalhe quando não responde, e o Render passa a reiniciar o serviço quando o banco cai (`docs/DEPLOY.md`). Para caber no orçamento de 15 s, o `socketTimeout` padrão caiu de 10000 para 8000 ms. Uma requisição que espera a ficha não pinga de novo quando outra requisição já trocou a conexão. Evidência (MySQL 8.4 local):

```
G-DB-DOWN   dddde36: MySQL parado → /health 200 "OK" (mentia), login 500
G-DB-DOWN   health:  MySQL parado → /health 503 em 0,0 s; login 503; `docker start` → /health 200 em 4,1 s
G-DB-PAUSE  health:  MySQL congelado com a conexão viva (TCP sem resposta) → /health 503 em 21,0 s; volta a 200 após `docker unpause`
G-DB-BOUNCE health:  login e envelopes 200 em 5,0 s após `docker restart`; transação 200 antes e depois
G-BOOT-DOWN: MySQL parado → exit=1 em 1,1 s; IP sem resposta → exit=1 em 5,8 s; senha no log: 0
G-E2E 37/38 (H2 e MySQL, só a #44) · G-RESTART 25/25 (H2 e MySQL) · VerifyAll 70 classes, 0 erros · LinkAll 102/102
```

**0.4 feito** (`fix(backend): entrada invalida responde 400 e 409`). Esta etapa trata só os erros. As regras de negócio do F2 (senha com 8 ou mais caracteres, formato do e-mail, salário positivo) continuam na Fase 1. Toda rota com corpo lê o JSON por um `decode…` que devolve `null` quando o corpo é inválido, e a rota responde 400 `{"error":"Dados inválidos."}` (`backend/models.kf`, `backend/services.kf`). Medido no kof 0.6.3: JSON malformado, corpo vazio, `null`, array, texto sobrando no fim, número em texto e campo primitivo ausente (JSN004) lançam String. Um campo String ausente chega como `null`. No cadastro, a corrida pelo mesmo e-mail é resolvida em `insertUserIfNew` (`backend/store.kf`): a violação da UNIQUE é uma exceção Java, pega com `catch (Exception e)`. Se o e-mail já existe depois da falha, a resposta é 409. Evidência (`tools/neg.sh`):

```
antes (0.3) MySQL: 5/26 casos certos; `{"email":` → 500 {"error": "handler error: unexpected end of JSON"};
                   corrida 16×5: 21 respostas 500 (ex.: 1×200, 10×409, 5×500)
depois      MySQL e H2: 26/26 casos (21 de 400 com {"error":"Dados inválidos."}, sem token = 401, duplicado = 409, válidos = 200)
                   corrida 16×5: 1×200 + 15×409 em cada rodada, 0 respostas 500, 1 linha por e-mail no MySQL
G-E2E 37/38 (H2 e MySQL, só a #44) · G-RESTART 25/25 (H2 e MySQL) · G-CONC verde (H2 e MySQL) · G-DB-BOUNCE 5,2 s
VerifyAll 70 classes, 0 erros · LinkAll 102/102
```

### Fase 1: Retomada do batch 2 backend (F1 a F4)

O commit local `2e34ffb` (clone `%TEMP%\oa-f1`, base anterior à Fase 0) foi revisado e portado para cima da Fase 0 (decisão da seção 6). A migração, o `RegisterRequest` e o `hasSalary=false` foram aproveitados. A leitura da contagem passou a aceitar o rótulo `N` do H2, e o cadastro usa um `decodeRegisterRequest` no padrão da 0.4. O diff não commitado daquele clone (validações com `try/catch` em cada rota) não foi usado, porque a Fase 0.4 já resolve o 400 com os `decode…`.

| Item | Aceite | Est. | Nível |
|---|---|---|---|
| ✅ F1 Coluna `name` + migração condicional + `hasSalary=false` | Cenários do design §2.6: banco novo, banco antigo e 2ª execução sem `ALTER` | M | intermediario |
| ✅ F2 Validações (spec §P1, itens 1–7) | 1 caso de E2E por linha da tabela, com status e corpo exatos | P | good first issue |
| ✅ F3 `debtAmount → debtCents` + `GET /api/users/me` + resposta do onboarding em JSON | `/me` antes e depois do onboarding; `debtcents` gravado no MySQL | P | intermediario |
| ✅ F4 Mesma origem (`serveDir`) + Dockerfile | G-AUTH-STATIC; `docker run` local com H2 servindo `/index.html` | M | intermediario |

**F1 feito** (`feat(backend): nome no cadastro com migracao condicional da coluna`). `UserRow` ganhou a coluna `name` (a última, para banco novo e banco migrado terem a mesma ordem). `ensureSchema` chama `migrateUserNameColumn` logo depois do `orm.create<UserRow>`: uma consulta fixa a `INFORMATION_SCHEMA.COLUMNS` com `TABLE_SCHEMA = SCHEMA()` e, só se a contagem for 0, `ALTER TABLE "userrow" ADD COLUMN "name" VARCHAR(255) DEFAULT '' NOT NULL`. A DDL é texto fixo, sem bind e sem dado de usuário. Ela roda no boot, na conexão do `openDb` (com os timeouts da 0.1), e qualquer falha aborta o boot com "nao foi possivel criar as tabelas". O cadastro grava `name` (sem espaços nas pontas; ausente = `""`) e `hasSalary = false`. Matriz de migração (`f1b/tools/mig.sh`; o banco antigo é criado pelo build de `5d51896` com 2 contas, onboarding, envelope, transação, chat e renda variável):

```
                      H2 2.5.250                               MySQL 8.4.11 (ANSI_QUOTES; database "decoy" com userrow.name)
banco novo            boot ok, ALTER 0, cadastro grava "Ana Nova"   boot ok, ALTER 0, cadastro grava "Ana Nova"
banco antigo          boot ok, ALTER 1, name VARCHAR NOT NULL ''    boot ok, ALTER 1, name varchar(255) NOT NULL ''
                      dump das 5 tabelas idêntico (22 linhas)       dump das 5 tabelas idêntico (17 linhas)
                      login antigo 200; contas antigas name = ''    login antigo 200; contas antigas name = ''
2ª execução           ALTER 0, dump igual ao da 1ª                  ALTER 0, dump igual ao da 1ª
usuário sem ALTER     —                                             boot exit=1 "nao foi possivel criar as tabelas", 0 linhas alteradas
```

O database `decoy` (outra tabela `userrow` com coluna `name` no mesmo servidor) não enganou a checagem: o filtro por schema funciona. O nome com acento chega íntegro (`João Ávila` gravado como `4A6FC3A36F20C38176696C61` em `utf8mb4`). Gates (kof 0.6.5):

```
G-BUILD check exit=0 :: checked 6 file(s) — no errors | build exit=0
controle positivo (sintético) VerifyAll exit=1 e LinkAll exit=1 (acusam) | controle limpo exit=0
VerifyAll exit=0 :: geradas: 71 classes, 474 métodos, 0 erros | LinkAll exit=0 :: OK=103 FAIL=0
G-E2E H2 37/38 · MySQL 37/38 (só o 29, #44) · G-RESTART 25/25 (H2 e MySQL)
neg 26/26 (H2 e MySQL), corrida 16×5: 1×200 + 15×409, 0 respostas 500 · G-CONC verde (H2 e MySQL)
G-DB-BOUNCE verde em 5,2 s · G-DB-DOWN 503 → 200 em 2,1 s · G-BOOT-DOWN exit=1 em 0,7 s e 2,7 s, senha no log: 0
```

**F2 feito** (`fix(backend): regras de validacao do cadastro e onboarding`). As regras rodam depois do `decode…` da 0.4, em `registerError`, `loginError` e `onboardingError` (`backend/models.kf`). Cada uma devolve a mensagem do 400 ou `null`, e a rota responde antes de gravar. O login valida antes do `security.rateLimit`, então campo vazio não gasta tentativa. Cadastro e login usam o e-mail sem espaços nas pontas. Nome ou e-mail com mais de 255 caracteres dão `Dados inválidos.`: antes eles estouravam o `VARCHAR(255)` e davam 500. O `OnboardingRequest` ganhou `Double? debtAmount`. Medido no 0.6.5 (repro fora do repo): ausente ou `null` chega como `null`, e `"abc"` lança String, que vira 400. Ausente conta como 0, então o corpo antigo sem dívida continua 200. Evidência (kof 0.6.5):

```
G-E2E H2 55/56 · MySQL 55/56 (só o tier-status, #44); 18 casos novos com status e corpo exatos
controle: o mesmo E2E contra o build do F1 dá 38/56 (os 17 casos de 400 e o "não gravou" falham)
neg 41/41 (H2 e MySQL; 15 casos novos, incluindo nome e e-mail de 300 caracteres = 400) · corrida 16×5 sem 500
G-RESTART 25/25 (H2 e MySQL) · G-CONC verde (H2 e MySQL) · G-DB-BOUNCE 5,0 s · G-BOOT-DOWN exit=1, senha no log: 0
VerifyAll 71 classes, 482 métodos, 0 erros · LinkAll 103/103 · controle sintético acusa nos dois
```

**F3 feito** (`feat(backend): debtAmount no onboarding e rota /api/users/me`). `GET /api/users/me` lê o usuário do token e devolve `MeResponse(name, email, onboardingCompleted, tier)`, com `onboardingCompleted = hasSalary && salaryCents > 0`. O onboarding grava `debtCents = toCents(debtAmount)` quando `hasDebt` e 0 quando não, e responde `OnboardingResponse(suggestedModel, description, buckets)` em JSON (`Content-Type: application/json; charset=utf-8`). O formato texto antigo não tinha cliente (as telas ainda são placeholder), e o novo está no `design.md` §4.1 e no `spec.md`. Evidência (kof 0.6.5):

```
G-E2E H2 60/61 · MySQL 60/61 (só o tier-status, #44): /me antes (false) e depois (true), nome "Ana Júlia E2E" íntegro,
      /me sem token 401, SURVIVAL 2100/600/300, ANTI_DEBT com "Quitação de Dívida" 600.0, VARIABLE sem buckets
debtCents gravado (H2 e MySQL): 5000.5 → 500050; hasDebt=false com 999 → 0; 1234.565 → 123457
banco antigo migrado: /me de conta com onboarding = true; conta só cadastrada (hasSalary=true, salário 0) = false; name ""
G-RESTART 28/28 (H2 e MySQL, inclui /me com nome após reinício) · neg 41/41 · G-CONC verde · G-DB-BOUNCE 5,1 s
VerifyAll 74 classes, 501 métodos, 0 erros · LinkAll 106/106 · controle sintético acusa
```

**F4 feito** (`feat(backend): servir o frontend no mesmo dominio`). Com `KOF_WEB_OUT`, `main.kf` chama `app.serveDir("/", webOut)` antes do `app.listen` (API documentada no Kof4j, `docs/stdlib/stdlib-web.md`: arquivos servidos depois das rotas dinâmicas, com proteção contra `..`). `isPublicPath` (`backend/auth.kf`) trata como público tudo fora de `/api/` e, dentro de `/api/`, só login e cadastro. O middleware só faz o `ensureDb` em `/api/*`: o `/health` mantém o próprio ping e os arquivos do frontend abrem com o banco fora. O `Dockerfile` compila `frontend` com `--target js` em `/out/web`, confere `index.html` e `Default.mjs`, copia para `/app/web` e define `KOF_WEB_OUT=/app/web`. O `.dockerignore` deixou de excluir `frontend/`. O E2E ganhou `-WebOut` (G-AUTH-STATIC). Evidência (kof 0.6.5):

```
G-E2E H2 65/66 · MySQL 65/66 (só o tier-status, #44), sem KOF_WEB_OUT: /index.html 404; GET /api/dashboard, GET /api/users/me,
      POST /api/users/onboarding e GET /api/rota-que-nao-existe sem token = 401 {"error":"Token ausente, inválido ou expirado"}
G-E2E H2 com -WebOut 67/68: /index.html e /Default.mjs 200 sem token, iguais ao disco; /%2e%2e/backend/main.kf ≠ 200
controle: o mesmo E2E com -WebOut contra o build do F3 → /index.html e /Default.mjs = 401 (65/68)
MySQL parado: /index.html 200, /health 503, /api/auth/login 503
docker build: kof-0.6.5-linux-x86_64, java.sql.Driver no jar: org.h2.Driver org.mariadb.jdbc.Driver, frontend em /app/web
docker run (H2, KOF_ENV vazio): /health, /, /index.html, /Default.mjs = 200; /api/dashboard, /api/users/me, POST /api/users/onboarding = 401
Edge headless --headless=new, perfil novo, 360×640, http://localhost:3190/: Tela 1 renderizada, um botão "Começar" no DOM
G-RESTART 28/28 (H2 e MySQL) · neg 41/41 · G-CONC verde · G-DB-BOUNCE 5,2 s · G-BOOT-DOWN exit=1, senha no log: 0
VerifyAll 74 classes, 501 métodos, 0 erros · LinkAll 106/106 · controle sintético acusa
```

**Deploy da Fase 1 no Render:** a migração do F1 roda no primeiro boot contra a Aiven. Antes do deploy, fazer um backup da tabela `userrow` (ou um snapshot da Aiven). O usuário do banco precisa de `ALTER` em `organiza_kof`: sem ele, o boot aborta sem alterar nada (medido) e o Render mantém a versão anterior no ar. A coluna nova é compatível com a versão anterior, que só lê as colunas que conhece, então voltar o deploy não exige desfazer a migração. `KOF_WEB_OUT` vem do `Dockerfile` e não precisa de variável nova no Render.

### Fase 2: Datas reais e freemium (#44)

| Item | Aceite | Est. | Nível |
|---|---|---|---|
| ✅ `createdAt` real em todas as entidades; início do mês e `daysRemaining` calculados com `kof.time` | E2E do tier-status verde; pulso calculado com os dias restantes reais; no MySQL as datas estão preenchidas | M | intermediario |
| ✅ `enforceCanSendMessage` no chat → 402 | 31ª mensagem do mês = 402 com a mensagem do legado | P | good first issue |

**Fase 2 feita** (`fix(backend): datas reais e limite freemium do chat (#44)`). As funções do relógio ficam em `backend/services.kf`:

- `nowIso()` grava o instante em UTC com `time.formatInstantIso(time.now())` (formato `2026-10-19T13:54:19.402Z`). Transação, mensagem do chat, envelope, renda variável e reflexão Kakeibo passam a gravar a data real.
- `localTodayIso()`, `monthStartIso()` e `daysRemainingInMonth()` usam o fuso do servidor (`time.tzOffsetSeconds()`), como o `LocalDate.now()`/`ZoneId.systemDefault()` do legado. O `time.todayIso()` do Kof é sempre UTC (código da tag `kof-0.6.6`, `JvmTimeCalendar.java:198`), e por isso não é usado para "hoje". O início do mês é a meia-noite local do dia 1, convertida para UTC. Os dias restantes seguem o legado (`lengthOfMonth − dayOfMonth + 1`).
- As consultas do mês filtram `createdAt >= início do mês` no banco, pela Query DSL. Como o texto ISO-8601 em UTC ordena como o tempo, a comparação de texto funciona. Linhas sem data (`""`, de antes desta fase) ficam fora de qualquer mês.
- O chat chama `enforceCanSendMessage` antes de gravar. A 31ª mensagem do mês de um usuário Gratuito recebe `402 {"error":"Você atingiu o limite de 30 mensagens gratuitas este mês."}` (mesmo status e texto do `GlobalExceptionHandler` do legado) e não é gravada.
- `GET /api/transactions` passou a trazer `createdAt` em cada item (campo a mais que o legado), para os filtros Semana/Mês/Ano do dashboard.

Em produção, o fuso vem da variável `TZ` (por exemplo, `America/Sao_Paulo`): sem ela, o Render roda em UTC e o "hoje" muda às 21h de Brasília. Repro fora do repo (`p23/repro/time`, kof 0.6.6): `todayLocal=2026-10-19`, `monthStartUtc=2026-10-01T03:00:00.000Z`, `daysRemaining=13`, 29/02/2028 → 1, 01/01/2026 → 31. Evidência (kof 0.6.6):

```
G-BUILD check/build exit=0 · frontend --target js exit=0
VerifyAll 75 classes, 510 métodos, 0 erros · LinkAll 107/107 · controle sintético acusa (VerifyAll e LinkAll exit=1)
G-E2E H2 68/68 · MySQL 68/68 · com -WebOut 70/70 (H2 e MySQL): pulso = round(3000/dias) e round(2400/dias); tier-status
      messagesUsed=1; createdAt da transação a menos de 10 min de agora; 30 mensagens = 200 e a 31ª = 402, sem gravar
controle: o mesmo E2E contra o build do 059d962 → 61/68 (falham os 7 casos novos ou alterados)
G-RESTART 28/28 (H2 e MySQL) · neg 41/41 (H2 e MySQL) · G-CONC verde (H2 e MySQL) · G-AUTH-STATIC 14/14
G-DB-BOUNCE verde em 8,3 s · G-DB-DOWN 503 → 200 em 4,1 s · G-BOOT-DOWN exit=1, senha no log: 0 · migração name: dump idêntico
MySQL: transactionrow.createdAt = 2026-10-19T13:54:19.402Z, chatmessagerow.createdAt preenchido
```

### Fase 2.1: Refatoração idiomática medida (kof 0.6.6)

**`app.security`/`app.policy` não foram adotados**, porque não são equivalentes ao middleware atual (`main.kf`, `app.use`). O código da tag `kof-0.6.6` e um repro fora do repo (`p23/repro/sec`, `app.policy("/api", auth:true, csrf:false, responses)` + `app.policy("/api/auth", auth:false)`) mostram:

| Contrato atual | `app.security`/`app.policy` no 0.6.6 | Medido |
|---|---|---|
| Token com `iss` ou `aud` errados = 401 (E2E 11–12) | O passo `auth` valida só a assinatura e o `exp` (`kof_sec_jwt_verify(token, secret)`, `JvmStringSecurityRuntime.java:330-353`) | token de outro emissor e outra audiência = **200** |
| Login e cadastro públicos, mesmo com um `Authorization` velho no navegador | Com `Authorization` presente, um token inválido nunca passa, nem em rota pública (`JvmRuntimeWebDispatch.java:145-160`) | `POST /api/auth/login` com `Bearer lixo` = **401** |
| `publicPaths` | Só vale no modo `sessionHeader` (passo 4), não no passo `auth` (passo 6) | — |
| Rate limit do login: 5 por minuto **por e-mail**, depois da validação (400 não gasta tentativa) | Rate limit por IP + rota, antes do handler | — |
| 503 do banco antes da autenticação | `app.use` roda antes da pipeline, então o 503 continuaria igual | — |
| Sem CSRF (API com Bearer) e sem cabeçalhos extras | CSRF ligado por padrão no escopo global; CSP e `X-Frame-Options: DENY` em todas as respostas | CSP presente em `/api/me` |

Adotar a política exigiria aceitar tokens de outra audiência ou recusar login com cabeçalho velho. Por isso o middleware continua. Se o Kof passar a validar `iss`/`aud` no passo `auth` e a aplicar `publicPaths` nele, a troca volta a ser avaliada. **Adotado:** coleções idiomáticas onde reduzem código sem mudar o resultado (`refactor(backend): colecoes idiomaticas do kof 0.6.6`):

- `needsCategories()` com `setOf(...)` + `contains` no lugar de duas cadeias de `||` (`coach.kf`, anti-padrão `chained-or-membership` do training).
- `listOf(...).any(...)` nas palavras de renda fixa do `registerUserIncome`.
- `map`/`filter`/`reduce` nas somas (`sumAmountCents`, reserva de emergência, gasto do Base Zero e do Kakeibo) e na lista de `GET /api/transactions`.

As somas continuam da esquerda para a direita, então o resultado é o mesmo. O repro `p23/repro/eqb` compara a versão antiga com a nova em todas as 12 categorias, em `null`, em 7 textos de renda e em somas `Long` e `Double` (`0.1+0.2+0.3+1234.56`): nenhuma diferença. O backend caiu de 1.665 para 1.648 linhas de código (`p23/loc.sh`). Evidência (kof 0.6.6):

```
G-BUILD check/build exit=0 · frontend --target js exit=0
VerifyAll 95 classes, 535 métodos, 0 erros (cada lambda vira uma classe) · LinkAll 127/127 · controle sintético acusa
G-E2E H2 68/68 · MySQL 68/68 · com -WebOut 70/70 (H2 e MySQL) · G-RESTART 28/28 (H2 e MySQL)
neg 41/41 (H2 e MySQL) · G-CONC verde (H2 e MySQL) · G-AUTH-STATIC 14/14 · G-DB-BOUNCE 5,3 s · G-DB-DOWN 503 → 200 em 4,1 s
G-BOOT-DOWN exit=1, senha no log: 0 · migração name: dump idêntico (H2 e MySQL)
```

### Fase 3: Rotas que faltam (lógica já portada)

| Item | Aceite | Est. | Nível |
|---|---|---|---|
| PUT/DELETE envelope, listagem por categoria, total por categoria, limpar, dashboard em JSON real | E2E por rota, com IDOR (outro dono = 404) | M | good first issue |
| `PATCH /api/users/me/salary` + re-onboarding com `migrateBudgetModelIfNeeded` | Teste de cada regra de migração (6 transições) | M | intermediario |
| Meta de reserva de emergência (rota) + "reserva acumulada" no dashboard | Renda variável vai para EMERGENCY_FUND até bater a meta e depois para o orçamento (E2E) | P | intermediario |
| Admin (listar e migrar) com papel ADMIN | Usuário comum = 403 | P | intermediario |
| `GetBalance` exposto + correção de `totalSpent`/`notAllocated` | Valores por bucket batem com a soma das transações do mês | P | intermediario |

**Fase 3 feita** (`feat(backend): rotas do desktop do MVP 1 (fase 3)`). Contratos novos (todos exigem token; corpo inválido = 400 `{"error":"Dados inválidos."}`; recurso de outro usuário ou inexistente = 404):

| Rota | Tela | Corpo / resposta |
|---|---|---|
| `GET /api/dashboard?period=week\|month\|year` | 9 | `{period, from, totalSpent, currency, salary, pulse, daysRemaining, budgetModel, buckets[{name, percentage, plannedAmount, spentAmount, remainingAmount}], reserve{accumulated, goal, hasGoal, percent}, categories[{category, total, count, percentage}], recentTransactions[5]}`. Pulso e buckets são sempre do mês; o resto é do período. Período inválido = 400. Substitui o texto `a|b|c` com valores fixos |
| `GET /api/budgets/balance` | 9 | `GetBalanceOutput` do legado, com `totalSpent` e `notAllocated` preenchidos |
| `GET /api/envelopes/overview` | 11 | `[{id, categoryName, bucket, limitAmount, spentThisMonth, percent, status}]`. `status`: `ESTOURADA` se o gasto do mês passa do limite, `ALERTA` acima de 80%, senão `EM_DIA` (no design, 80% = Em dia, 90% = Alerta, 120% = Estourada) |
| `PUT /api/envelopes/:id` · `DELETE /api/envelopes/:id` | 11 | `{categoryName, limitAmount, limitType?, movingAverageMonths?}` → envelope; `DELETE` = 204 |
| `POST /api/envelopes/from-chips` | 7 | `{fixed[], variable[]}` → caixinhas criadas. Chip → categoria fixa (Aluguel/Contas → HOUSING, Faculdade/Escola → EDUCATION, Transporte → TRANSPORT, Assinaturas → SUBSCRIPTIONS, Alimentação → GROCERIES, Delivery → FOOD, Lazer/Viagem → LEISURE, Roupas → SHOPPING, Farmácia → PHARMA, Pet → OTHER). O limite é o valor do bucket do plano dividido igualmente entre as categorias escolhidas que caem nele (Base Zero = 0). Sem onboarding = 409; chip desconhecido = 400; categoria que já tem caixinha não é duplicada |
| `GET /api/transactions/:category` · `GET /api/transactions/summary` | — | Rotas do legado |
| `PATCH /api/users/me/salary` | 13 | `{salary}` → `{salary, previousModel, budgetModel, migrated, description, buckets}` |
| `PUT /api/users/me/budget-model` | 13 (#11) | `{model}` → `{suggestedModel, description, buckets}` |
| `PUT /api/users/me/emergency-goal` | 9 | `{goal}` (0 desliga) → `{goal, hasGoal, accumulated}` |
| `GET /api/notifications` · `POST /api/notifications/read-all` | 12 | `[{id, kind, title, message, createdAt, read}]`; `kind`: `ENVELOPE_ALERT`, `ENVELOPE_EXCEEDED` (quando a caixinha passa para o status, uma vez por mês), `GOAL_REACHED` (uma vez por valor de meta), `DAILY_PULSE` e `REMINDER` (sem gasto hoje), um por dia, criados na primeira leitura do dia |
| `GET`/`PUT /api/users/me/preferences` | 13 | `{emailEnabled, frequency: DAILY\|WEEKLY\|NEVER, pushEnabled}`; sem registro = padrão do design (e-mail diário ligado, push desligado) |
| `GET /api/open-finance/banks` · `POST /api/open-finance/connect` | 13 | `{demo: true, notice, banks[5]}` e `{demo: true, bank, status: "DEMO_NAO_CONECTADO", notice}`. Nenhuma conexão, nenhum dado bancário e nenhuma transação criada |

Fora do escopo desta fase, por não estarem no design Desktop: limpar transações (`DELETE /transactions` do legado), admin, histórico paginado por caixinha (só no Mobile) e a média móvel (stub também no legado). Duas tabelas novas são criadas no boot por `orm.create` (`notificationrow`, `preferencerow`); nenhuma tabela existente muda.

**Dois bugs novos do compilador no 0.6.6**, com contorno no código e repro mínimo fora do repo:

| Repro | Sintoma | Quem pegou | Contorno |
|---|---|---|---|
| `p23/repro/find`: `var b = lista.find(...)`, depois `if (b != null) { return b.campo }` com `b` de tipo record | `VerifyError: Bad type on operand stack` ao carregar a classe ("Method owner: expected LBucketSummaryDTO;, but found Ljava/lang/Object;") | G-BYTECODE (VerifyAll e LinkAll, 1 erro) e `kof run` do repro | `filter` + `isEmpty` + `get(0)` (`overview.kf`, `chipLimit`) |
| `p23/repro/foreachput`: `lista.forEach((n: Int) -> mapa.put(k, f(n)))` com `Map<String, Double>` | `NoSuchMethodError: Double.valueOf(Double)` em runtime | E2E (`/api/transactions/summary` = 500). O VerifyAll e o LinkAll não pegam, porque a chamada só é resolvida ao executar | laço `for` (`main.kf`, rota `/summary`) |

Evidência (kof 0.6.6):

```
G-BUILD check/build exit=0 (7 arquivos) · frontend --target js exit=0
VerifyAll 161 classes, 797 métodos, 0 erros · LinkAll 193/193 · controle sintético acusa
      (antes do contorno do List.find: VerifyAll 1 erro e LinkAll FAIL=1 em chipLimit; o E2E caía no boot, 0/64)
G-E2E H2 86/86 · MySQL 86/86 · com -WebOut 88/88 (H2 e MySQL). 18 casos novos: dashboard (mês, semana, ano, período
      inválido), balance (SURVIVAL e KAKEIBO), chips (409 sem onboarding, 400, 4 caixinhas com 700/700/700/600, 2ª chamada
      sem duplicar), Alerta 83% → Estourada 117% com 1 aviso de cada, pulso do dia sem repetir, read-all 204, lembrete só
      para quem não gastou, PUT (200, 400 ×3, 404 ×2), IDOR de PUT e DELETE (404 e envelope intacto), DELETE 204 → 404,
      /{category} e /summary, PATCH salary (SURVIVAL → STANDARD), budget-model, meta da reserva (reserva até a meta, depois
      orçamento, aviso de meta batida), preferências, Open Finance demo, 17 rotas novas sem token = 401
G-RESTART 28/28 (H2 e MySQL; a 1ª rodada logo depois do G-DB-* deu timeout de 5 s no login e passou nas duas seguintes)
neg 41/41 (H2 e MySQL) · G-CONC verde (H2 e MySQL) · G-AUTH-STATIC 14/14 · G-DB-BOUNCE 14,7 s · G-DB-DOWN 503 → 200 em 8,5 s
G-BOOT-DOWN exit=1, senha no log: 0 · banco do 5d51896 → build da Fase 3: boot ok, dump das tabelas antigas idêntico (H2 e MySQL)
```

### Fase 4: Coach com LLM

**Viabilidade medida:** um programa Kof (`kof run`, 0.6.3) chamou `http.post(url, json.encode(req), "Content-Type: application/json\nAuthorization: Bearer <key>")` contra um mock local no formato da API da OpenAI. Os dois cabeçalhos chegaram, o corpo UTF-8 chegou íntegro e `json.decode<ChatResp>` extraiu `choices[0].message.content` com acentos corretos. A API real não foi chamada.

| Item | Aceite | Est. | Nível |
|---|---|---|---|
| Cliente OpenAI (`gpt-4o-mini`) com `OPENAI_API_KEY` via `config.env`, timeout/retry/circuit | Teste contra o mock: corpo e cabeçalhos exatos; chave ausente → boot ou rota com erro claro; a chave nunca aparece em log | M | avancado |
| Laço de *tool calling* manual (`tool_calls` → funções Kof → 2ª chamada) com as 8 tools do legado | Mock que devolve `tool_calls` de persistTransaction → transação gravada e resposta final | G | avancado |
| Memória (últimas 20 mensagens, ordenadas por `createdAt`) + prompt de sistema com data | Depende da Fase 2; teste com mock verificando as `messages` enviadas | M | intermediario |
| Kakeibo: 4 perguntas + `weekStart` + gatilho no prompt; scheduler com `time.interval` ou cron externo | Usuário KAKEIBO sem reflexão na semana recebe as perguntas no prompt | M | intermediario |
| Leitura de fatura PDF/imagem com confirmação (Tela 10) + limite de 1 PDF/mês no Gratuito | Decidir o provedor (visão do LLM) e medir upload multipart no `kof.web` | G | avancado |

### Fase 5: Voz (está no design da Tela 10: microfone)

| Item | Aceite | Est. | Nível |
|---|---|---|---|
| Medir se `kof.web` recebe multipart ou base64 e se `kof.http` envia multipart (Whisper) e recebe bytes (TTS) | Probe com mock; se o `kof.http` não fizer multipart, abrir issue upstream ou usar `ai-base64` + transcrição no navegador | M | avancado |
| `POST /api/coach/voice` restrito ao Premium (`enforceVoiceAllowed`) | FREE = 402; PREMIUM com mock = áudio | M | avancado |

### Fase 6: Telas (frontend Kof)

| Batch | Telas | Depende de | Est. | Nível |
|---|---|---|---|---|
| 2 (#33) | 1–8 (auth + onboarding, incluindo chips de gastos → caixinhas) | Fase 1 (+ rota de criação em lote) | G | intermediario |
| 2 (#33), pré-requisito | Navegação volta a usar `mountScreen` (o PR #43 deixava duas telas no DOM após o primeiro clique); `dashboard` e `onboarding` voltam a placeholder | — | P | **feito** (16/10/2026) |
| 3 (#32) | 9 Dashboard | Fases 2 e 3 | M | intermediario |
| 4 (#34) | 10 Chat | Fase 4 (texto) e 5 (voz) | G | avancado |
| 4 (#11) | 11 Caixinhas, 12 Notificações | Fase 3 + entidade de notificação | G | intermediario |
| — | 13 Configurações (salário, preferências de e-mail, Open Finance demo) | Fase 3; job de e-mail; decisão de escopo do Open Finance | G | intermediario |
| 5 (#39, #40) | E2E full-stack, benchmarks, screenshots | todas | M | good first issue (#40) |

### Gates permanentes

G-BUILD, G-BYTECODE (VerifyAll/LinkAll, com o controle positivo sintético da seção 7.2), G-E2E e G-RESTART em H2 **e** MySQL 8.4 com `ANSI_QUOTES`, mais o probe de reconexão (P10) a partir da Fase 0. O CI está vermelho segundo a auditoria de 07/10; voltar a deixá-lo verde é pré-requisito para o merge de cada fase.

## 5. Evidências

Ambiente: clone `C:\Users\luiza\AppData\Local\Temp\oa-insp` em `dddde36` (`git status` limpo). Os scripts e as saídas ficaram em `…\scratchpad\insp\` (`tools/`, `out/h2/`, `out/mysql/`, `llm/`).

### 5.1 G-BUILD e G-BYTECODE (`tools/gate.sh h2`)
```
kof version: kof 0.6.3
kof.jar sha256: 7aa835b0604ea714113b7bd4b7ee480188f7480839e7da4cc6607f7a29ec7bd9
repo real HEAD=dddde36 | clone HEAD=dddde36 | clone diff: 0 arquivos
G-BUILD check exit=0 :: checked 6 file(s) — no errors
G-BUILD build exit=0
controle positivo: 1 GERADA (o verificador detecta erro injetado)
VerifyAll exit=0 :: RESUMO geradas: 70 classes, 442 metodos, 0 erros | runtime: 32 classes, 1090 metodos, 0 erros
LinkAll exit=0 :: RESUMO linkadas OK=102 FAIL=0 SKIP=0 total=102 | java=25.0.3
```

### 5.2 H2
```
G-E2E exit=1 :: RESULTADO DA HOMOLOGAÇÃO E2E: 37 / 38 PASSOS GREEN (97.4%)
29. GET /api/users/tier-status conta as mensagens do chat... [FAIL] obtido: 200 {"tier":"FREE","messagesUsed":0,...} — issue #44
G-RESTART (PowerShell) exit=0 :: RESULTADO G-RESTART: 25 / 25 PASSOS GREEN :: sem VerifyError/LinkageError
```

### 5.3 MySQL 8.4.11 local (Docker `mysql:8.4`, driver `mariadb-java-client-3.5.10`, `KOF_DB_URL=mysql://localhost:33084/organiza?sslMode=trust`)
```
E2E exit=1 :: RESULTADO DA HOMOLOGAÇÃO E2E: 37 / 38 PASSOS GREEN (97.4%)   (mesma falha 29)
G-RESTART (PowerShell) exit=0 :: RESULTADO G-RESTART: 25 / 25 PASSOS GREEN
```
Observação: com `jdbc:mysql://…` o boot aborta com "driver JDBC ausente ou URL invalida", porque o MariaDB Connector/J só aceita o esquema `mysql://` usado pelo Kof. Isso não afeta a produção, que usa `mysql://`.

### 5.4 Probes (`tools/probe.ps1`, MySQL local)
```
P1 JSON malformado register: 500
P2 register sem senha: 500
P3 register email invalido/senha 1 char: 200 <JWT>
P4 GET /api/users/me: 404
P5 PATCH salary (rota legado): 404
P6 PUT envelope: 404
P7 onboarding salary negativo: 200 SURVIVAL_702010|...|Necessidades:70:-3.5,...
P8 transacao JSON malformado: 500
P9 corrida cadastro (8 paralelos mesmo email) status: 200,409,409,409,409,409,409,409
   userrow: race@a.com = 1 linha; UNIQUE KEY `email`
P10 apos restart do MySQL, login: 500
P10b segunda tentativa: 500
```

### 5.5 Produção (somente leitura)
```
2026-10-16T06:15:12-03:00  GET https://organiza-ai-5qzv.onrender.com/health -> status=200 time=0.49s, corpo "OK"
```

### 5.6 Viabilidade do LLM (`llm/src/main.kf` + mock Python local, sem chamar a OpenAI)
```
RAW={"choices": [{"message": {"role": "assistant", "content": "Ol\u00e1! Seu pulso \u00e9 R$ 80,00 \u00e7\u00e3o"}}]}
CONTENT=Olá! Seu pulso é R$ 80,00 ção
mock recebeu: Authorization: Bearer sk-test-falsa | Content-Type: application/json
corpo: {"model":"gpt-4o-mini","messages":[{"role":"system","content":"Você é o coach"},{"role":"user","content":"gastei R$ 35 no almoço"}]}
```
Ainda não foi medido: status HTTP ≠ 200 no `http.post`, `tool_calls` com campos opcionais em `json.decode`, multipart e corpo binário.

### 5.7 Limpeza
O container `oa-insp-mysql` foi removido (`docker rm -f`). O container `oa-f1-mysql`, da sessão anterior, não foi tocado.

## 6. Decisões de escopo (16/10/2026, usuária)

| Item | Decisão |
|---|---|
| Esqueci a senha | **MVP 1**: exige provedor de e-mail (a escolher) e credencial no Render |
| E-mail diário às 20h | **MVP 1**: mesmo provedor de e-mail + agendamento (`kof.scheduler`; `scheduler.at` é stub `CRON001`, usar o contorno documentado no training) |
| Upload de fatura PDF | **MVP 1**: a leitura no Kof já está medida e pronta (`POST /api/invoices/parse`, `backend/invoice.kf`, JSON com base64 e no máximo 2 MB). Faltam a integração com o coach (Fase 4) e o limite de 1 PDF por mês no plano Gratuito |
| Open Finance (demo) | **MVP 1**: tela demonstrativa, sem integração bancária real |
| Voz (Whisper + TTS) | **MVP 2** (Fase 5 sai do MVP 1) |
| Provedor de IA do coach | **OpenAI gpt-4o-mini**, como no legado; chave como variável secreta no Render |
| Chips da Tela 7 → caixinhas | **Regra fixa** de categoria para caixinha, sem IA |
| Commit `2e34ffb` do clone F1 | **Revisar e aproveitar**, passando pelos gates da Fase 1 |

Novos itens no roadmap: e-mail transacional (Fase 3, depois da estabilidade) e leitura de PDF (Fase 4).

## 7. Troca para o Kof 0.6.5 (16/10/2026)

`KOF_VERSION` passou de `kof-0.6.3` para `kof-0.6.5`, a estável mais recente nesta data (conferido com `gh api repos/KofLang/Kof4j/releases`, sem prerelease). Pacote Windows: SHA256 do zip `10059328…1935`; `lib/kof.jar` sha256 `920071c1…e67f`. O `Dockerfile` e o CI leem o mesmo arquivo. O bloco de instalação do CI, extraído e executado localmente, baixou `kof-0.6.5-linux-x86_64`, conferiu o SHA256 (`OK`) e recusou um tag prerelease e um tag inexistente.

### 7.1 Bugs e contornos: 0.6.3 × 0.6.5 (medido)

Repros mínimos fora do repo, compilados com `kof build --target jvm` (ou `--target js` e Edge headless no caso do frontend) nas duas versões.

| Repro | Sintoma no 0.6.3 | 0.6.5 | Contorno no projeto |
|---|---|---|---|
| z1 (`Double?` estreitado e retornado) | `VerifyError` ao carregar a classe | **corrigido** | Nenhum (o `orZero` já tinha saído em `7471f78`). O z1 deixou de servir de controle positivo (7.2) |
| z6, z7, z8c, m3 (outras faces do #41) | `VerifyError` | **corrigido** | Nenhum |
| m1, m2 (`T?` atribuído a local) | não compila | **corrigido** | Nenhum |
| `Spacer` no KofJS | `ReferenceError: Spacer is not defined` | **corrigido** | Nenhum hoje; liberado para as telas do Batch 2 |
| Enum em `json.decode<T>` (jenum, j2b) | falha em runtime | continua | `// WORKAROUND:` do enum como `String` |
| `math.max(Double, Double)` | não compila | continua | Comparação explícita |
| `transaction {}` dentro de `try/finally` | não compila (`COMP002`) | continua | Estrutura atual do `store.kf` |
| `--fat` com vários drivers JDBC | só o `java.sql.Driver` do H2 entra no jar | continua | Dockerfile refaz `META-INF/services/java.sql.Driver` |
| `kof.orm` sem aspas ANSI no MySQL | erro 1064 sem `ANSI_QUOTES` | continua | Sessão com `ANSI_QUOTES` |
| `Router`/`Store` no Chromium (`kofUiReuseRoot`) | `TypeError: Cannot set property length of CSSStyleDeclaration` | continua | `mountScreen` + campos `static` (spec do Batch 2, §2.1) |
| `String.format` no navegador | `kof_platform.stringFormat: not available` | continua | Formatação manual |

### 7.2 G-BYTECODE: novo controle positivo

No 0.6.5 nenhum repro conhecido do #41 gera mais bytecode inválido (tabela 7.1), então o controle passou a ser **sintético**: um programa Kof mínimo (`Int sete() { return 7 }` + `main`) é compilado e, numa cópia, o único `bipush 7; ireturn` (`10 07 AC`) de `Default/Main.class` vira `bipush 7; areturn` (`10 07 B0`). O `.class` continua bem formado, mas devolve um `Int` como referência. A cada rodada do gate:

```
controle negativo (limpo) VerifyAll exit=0 :: RESUMO geradas: 2 classes, 9 metodos, 0 erros
controle positivo (sintetico) VerifyAll exit=1 :: 1 GERADA :: GERADA Default/Main :: sete()I @insn#3 :: Error at instruction 3: Expected an object reference, but found I
controle positivo (sintetico) LinkAll exit=1 :: FAIL Default.Main :: java.lang.VerifyError: Bad type on operand stack ... Default/Main.sete()I @2: areturn
```

Ou seja, os dois verificadores continuam acusando bytecode inválido, e o "0 erros" do backend não vem de um verificador cego. Se uma versão futura voltar a gerar bytecode inválido num repro real, ele pode substituir o sintético.

### 7.3 Gates no 0.6.5 (HEAD `56804d0` + `KOF_VERSION`)

```
kof version: kof 0.6.5 | kof.jar sha256: 920071c1283f1e355ff45022c7ad7c3ee47da0e490602a4c5795565a9338e67f | JDK 25.0.3
G-BUILD check exit=0 :: checked 6 file(s) — no errors | build exit=0
VerifyAll exit=0 :: RESUMO geradas: 70 classes, 462 metodos, 0 erros | runtime: 32 classes, 1101 metodos, 0 erros
LinkAll exit=0 :: RESUMO linkadas OK=102 FAIL=0 SKIP=0 total=102
G-E2E H2:    37 / 38 (só o 29, issue #44)
G-E2E MySQL: 37 / 38 (só o 29, issue #44)   (MySQL 8.4 local em Docker, ANSI_QUOTES)
G-RESTART (PowerShell) H2 e MySQL: 25 / 25, sem VerifyError/LinkageError
G-DB-BOUNCE: VERDE em 4,9 s sem reiniciar o app | G-DB-DOWN: 503 com o banco parado, 200 em 2,1 s após o start
G-BOOT-DOWN: exit=1 em 0,8 s (parado) e 2,7 s (IP sem rota), sem senha no log
kof build frontend --target js: exit=0
docker build: "Kof release: kof-0.6.5-linux-x86_64", java.sql.Driver no jar: org.h2.Driver org.mariadb.jdbc.Driver
docker run (KOF_ENV vazio, H2): /health 200 em 2 s; cadastro devolve token
```

## 8. Troca 0.6.5 → 0.6.6 (19/10/2026)

Validação feita antes do merge da Fase 1 (regra: toda mudança é validada no release estável mais recente). Kof 0.6.6 (zip `fe57694f…55c2`, conferido no `SHA256SUMS`; `kof.jar` `2dc26ca1…`), sobre `5d51896` + F1–F4.

| Gate | 0.6.5 | 0.6.6 |
|---|---|---|
| G-BUILD backend + frontend `--target js` | exit 0 | exit 0 |
| G-BYTECODE (VerifyAll / LinkAll) | 74 classes, 501 métodos, 0 erros / 106 OK | idêntico |
| Controle sintético | acusa | acusa |
| E2E com `-WebOut` (H2 e MySQL) | 67/68 (só #44) | 67/68 (só #44) |
| G-RESTART (H2 e MySQL) | 28/28 | 28/28 |
| Negativos / corrida de cadastro | 41/41 / 1×200 + 15×409, 0×500 | idêntico |
| Concorrência, DB-BOUNCE, DB-DOWN, DB-PAUSE, BOOT-DOWN | verdes | verdes |
| Migração `name` (3 cenários × H2/MySQL) | dump idêntico, zero perda | idêntico |
| G-AUTH-STATIC (14 checagens) | 14/14 | 14/14 |
| Imagem Docker | — | `kof 0.6.6`, `/index.html` 200, `/api/users/me` 401 |

Bugs conhecidos: **nenhum corrigido e nenhuma regressão** na 0.6.6. Continuam os contornos de enum no `json.decode`, `math.max` com `Double`, `transaction {}` dentro de `try` (COMP002), `--fat` com só o primeiro registro de driver, aspas da Query DSL no MySQL (`ANSI_QUOTES`), `Router.back`/`Component.stateSet` no navegador e `String.format` no navegador.

Changelog 0.6.5 → 0.6.6 relevante: #883 (chamada `db.*` não resolvida vira diagnóstico, antes era descartada em silêncio); `size` de coleção/array tipado como `Int`. O resto é AVIF, Gzip/Zip e casos golden.

## 9. HTTP externo com verificação de certificado (d0, 19/10/2026)

**Problema medido:** o `kof.http` 0.6.6 não valida o certificado TLS. Um servidor local com certificado autoassinado, emitido para outro host, completou o handshake e recebeu o `Authorization: Bearer` do teste (`p23/repro/tls`). Mandar a chave da OpenAI ou do provedor de e-mail por esse caminho expõe a chave a um *man-in-the-middle*.

**Contorno (`backend/outbound.kf`, `// WORKAROUND`):** as chamadas a provedores externos usam o `HttpURLConnection` da JVM por interop (`import java.net.URI` + `import java.net.HttpURLConnection`, caminho de `idioms/interop.md`). Ele valida a cadeia e o nome do host com o truststore do JRE (a imagem usa `eclipse-temurin:25-jre`, que traz os certificados públicos). `outboundPost(url, corpo, headers, timeoutMs)` devolve `OutboundResponse(status, body, failure)`:

- status 4xx/5xx chega ao código Kof com o corpo;
- rede, TLS ou timeout chegam com `status = 0` e o motivo em `failure` (nome da exceção e mensagem, nunca os cabeçalhos);
- só `https://`; `http://localhost` e `http://127.0.0.1` só com `KOF_OUTBOUND_ALLOW_LOCAL_HTTP=true` (modo de teste com mock local).

O `java.net.http.HttpClient` não serve no 0.6.6: classe aninhada (`HttpResponse.BodyHandlers`) não resolve por `import` (SEM025, e SEM011 com `$`). Quando o `kof.http` validar o certificado, `outbound.kf` volta a ser `http.post`. Texto da issue upstream preparado, não publicado.

**Gate TLS (`scripts/test_outbound_tls.ps1`, tudo local):** gera um certificado autoassinado na hora (SAN `127.0.0.1`), um truststore PKCS12 de teste só com ele e um servidor HTTPS em PowerShell (`scripts/outbound_probe/https_mock.ps1`). O programa de prova compila `backend/outbound.kf` junto com `scripts/outbound_probe/main.kf`.

```
 1. Autoassinado com o truststore padrão do JRE: RECUSADO  falha=SSLHandshakeException: ... PKIX path building failed
 2. Mesmo certificado no truststore de teste: ACEITO       status=200 body={"mock":"/ok","auth":true}
 3. Confiado, mas host errado (localhost fora do SAN)      falha=SSLHandshakeException: No name matching localhost found
 4. 401 do provedor                                         status=401 body={"mock":"/401",...}
 5. 500 do provedor                                         status=500 body={"mock":"/500",...}
 6. Timeout de leitura (3 s no servidor, limite 1 s)        falha=SocketTimeoutException: Read timed out
 7. http:// sem KOF_OUTBOUND_ALLOW_LOCAL_HTTP               falha=endereco recusado: use https://
 8. -Online: POST sem Authorization em https://www.google.com (certificado público)  status=405 visível
RESULTADO TLS (outbound): 8 / 8
```

Gates do d0 (kof 0.6.6, a estável mais recente em 19/10, conferido com `gh api releases`):

```
G-BUILD check/build exit=0 (8 arquivos) · frontend --target js exit=0
VerifyAll 162 classes, 810 métodos, 0 erros · LinkAll 194/194 · controle sintético acusa (VerifyAll e LinkAll)
G-E2E H2 86/86 · MySQL 86/86 · com -WebOut 88/88 (H2 e MySQL)
G-RESTART 28/28 (H2 e MySQL) · neg 41/41 (H2 e MySQL) · G-CONC verde (H2 e MySQL) · G-AUTH-STATIC 14/14
G-DB-BOUNCE 4,9 s · G-DB-DOWN 503 → 200 em 4,1 s · G-BOOT-DOWN exit=1, senha no log: 0
Migração 5d51896 → d0: dump idêntico (H2 23 linhas, MySQL 18 linhas)
```

