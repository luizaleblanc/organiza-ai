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
| 12 | Notificações (estouro, alerta, pulso, meta batida, lembrete; marcar como lidas) | `NotificationRow` + regras + `GET /api/notifications` e `POST /api/notifications/read-all` | ✅ (Fase 3) | #11 | ⚠️ (Batch 3 F4: lista com os 5 tipos, badge/tom/tempo e vazio; textos do backend até a DECISÃO-11; sem lida/não lida nem "Marcar todas como lidas", DECISÃO-10) |
| 13 | Configurações: tema | — (local) | n/a | inerte com "Em breve" (Batch 3 F5; MVP 1 só escuro, decisão pendente) | ⚠️ |
| 13 | Configurações: e-mail/push diário às 20h | preferências (`GET`/`PUT /api/users/me/preferences`, Fase 3) + job agendado + envio de e-mail | ⚠️ (preferências feitas; envio na Fase 3.1) | `settings_screen.kf` + `core/settings_api.kf`: toggles e select salvam via PUT e desfazem em erro (Batch 3 F5) | ⚠️ (envio na Fase 3.1) |
| 13 | Configurações: rever salário (refaz o onboarding e migra o modelo) | `PATCH /api/users/me/salary` (migra o modelo) ou um novo `POST /api/users/onboarding`; troca manual `PUT /api/users/me/budget-model` (#11) | ✅ (Fase 3) | modal abre e fecha; "Refazer configuração" inerte com "Em breve" (DECISÃO-12); `PATCH /api/users/me/salary` sem `apiPatch` no cliente (lacuna) | ⚠️ |
| 13 | Configurações: Open Finance "Demo · MVP 1" | `GET /api/open-finance/banks` e `POST /api/open-finance/connect`, marcados `demo: true`, sem conexão nem dado bancário | ✅ (Fase 3) | textos e badge renderizados; "Conectar banco" inerte com "Em breve" (DECISÃO-13) | ⚠️ |
| 13 | Configurações: conta (e-mail, senha, 2FA) | marcado **MVP 2** no design | fora | inerte, opacidade .6, badge "MVP 2" (Batch 3 F5) | fora |
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
| `GET /api/envelopes/overview` | 11 | `[{id, categoryName, bucket, limitAmount, spentThisMonth, percent, status}]`. `status`: `ESTOURADA` se o gasto do mês passa do limite, `ALERTA` acima de 80%, senão `EM_DIA` (no design, 80% = Em dia, 90% = Alerta, 120% = Estourada). `bucket` é o gravado na caixinha (B4) ou, se ausente, o derivado da categoria |
| `POST /api/envelopes` (B4) | 10/11 | `{categoryName, limitAmount, bucket?}`. `bucket` opcional; se vier, tem de ser um nome de bucket do modelo atual do usuário (ex.: `Necessidades`, `Desejos`, `Futuro` no 50/30/20). Fora do modelo ou `""` = 400 `Bucket inválido para o seu modelo: X`; Base Zero não tem buckets. Resposta inclui `bucket` (null se ausente). Banco antigo ganha `enveloperow.bucket` no boot (`migrateEnvelopeBucketColumn`) |
| `POST /api/invoices/confirm` (B3) | fatura | ver README, seção Leitura de fatura PDF |
| `PUT /api/envelopes/:id` · `DELETE /api/envelopes/:id` | 11 | `{categoryName, limitAmount, limitType?, movingAverageMonths?}` → envelope (`limitType` como texto, ex. `"FIXED"`); `DELETE` = 204 |
| `POST /api/envelopes/from-chips` | 7 | `{fixed[], variable[]}` → caixinhas criadas. Chip → categoria fixa (Aluguel/Contas → HOUSING, Faculdade/Escola → EDUCATION, Transporte → TRANSPORT, Assinaturas → SUBSCRIPTIONS, Alimentação → GROCERIES, Delivery → FOOD, Lazer/Viagem → LEISURE, Roupas → SHOPPING, Farmácia → PHARMA, Pet → OTHER). O limite é o valor do bucket do plano dividido igualmente entre as categorias escolhidas que caem nele (Base Zero = 0). Sem onboarding = 409; chip desconhecido = 400; categoria que já tem caixinha não é duplicada |
| `GET /api/transactions/:category` · `GET /api/transactions/summary` | — | Rotas do legado |
| `PATCH /api/users/me/salary` | 13 | `{salary}` → `{salary, previousModel, budgetModel, migrated, description, buckets}` |
| `PUT /api/users/me/budget-model` | 13 (#11) | `{model}` → `{suggestedModel, description, buckets}` |
| `PUT /api/users/me/emergency-goal` | 9 | `{goal}` (0 desliga) → `{goal, hasGoal, accumulated}` |
| `GET /api/notifications` · `POST /api/notifications/read-all` | 12 | `[{id, kind, title, message, createdAt, read}]`; `kind`: `ENVELOPE_ALERT`, `ENVELOPE_EXCEEDED` (quando a caixinha passa para o status, uma vez por mês), `GOAL_REACHED` (uma vez por valor de meta), `DAILY_PULSE` e `REMINDER` (sem gasto hoje), um por dia, criados na primeira leitura do dia. Títulos e textos seguem a tela Notificações do artefato (estouro: "… Dá uma olhada antes que aperte o resto do mês."; alerta: "… Ainda dá pra segurar."; meta: "Meta batida! Reserva do mês" / "Você reservou R$ X este mês. Continue assim."; lembrete: "… ele diz seu pulso pra você terminar o mês de boooooa."), com valores em BRL de `formatBrl` (`R$ 360,00`, o artefato mostra `R$ 360`). O e-mail diário não usa esses textos |
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

## 10. E-mail: esqueci a senha e resumo diário (d1, 19/10/2026)

Provedor: **Resend** (`POST https://api.resend.com/emails`, `Authorization: Bearer`, corpo `{from, to, subject, text}`), chamado por `backend/outbound.kf` (seção 9). Código em `backend/email.kf`.

| Variável | Uso |
|---|---|
| `KOF_EMAIL_API_KEY` | Chave do Resend (segredo). Lida com `secrets.secret` e só revelada no cabeçalho; nunca vai para log. Sem ela, o recurso fica **desligado**: as duas rotas respondem 503 com texto honesto e o boot registra o motivo |
| `KOF_EMAIL_FROM` | Remetente verificado no Resend, ex.: `Organiza AI <nao-responda@seu-dominio>` |
| `KOF_EMAIL_API_URL` | Opcional (padrão `https://api.resend.com/emails`); só o teste aponta para o mock |
| `KOF_APP_BASE_URL` | Endereço público do app, para o link de redefinição |
| `KOF_DIGEST_AT` | Opcional, `HH:MM` local (padrão `20:00`), no fuso da variável `TZ` |

**Rotas novas (públicas, sem token):**

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /api/auth/forgot-password` | `{email}` | **202** `{"message":"Se o e-mail estiver cadastrado, enviamos um link..."}` para e-mail cadastrado **ou não** (sem enumeração; o envio roda num `spawn`, então o tempo de resposta também não revela a conta). 400 e-mail inválido; 429 com mais de 3 pedidos por e-mail ou 10 por IP em 1 hora; 503 com o e-mail desligado |
| `POST /api/auth/reset-password` | `{token, password}` | 200 `{"message":"Senha alterada..."}`; 400 senha com menos de 8 caracteres ou link inválido/expirado/já usado; 429 com mais de 20 tentativas por IP em 1 hora; 503 com o e-mail desligado |

**Token:** 32 bytes aleatórios (`crypto.randomHex`), vai só no link (`<KOF_APP_BASE_URL>/#/redefinir-senha?token=...`). O banco guarda apenas o SHA-256 (`passwordresetrow.tokenHash`), com validade de 30 minutos. Ao usar um token, ele e todos os outros pendentes do mesmo usuário ficam marcados como usados. A senha nova passa por `passwords.hash`. O IP do limite é o **último** item do `X-Forwarded-For` (o que o proxy do Render acrescenta); sem o cabeçalho (local), todos contam como `local`.

**Resumo diário (Tela 13):** `scheduler.at` é stub (`CRON001`), então segue o contorno do training (`idioms/concurrency.md`): um `spawn` calcula os milissegundos até o próximo `KOF_DIGEST_AT` no fuso `TZ`, dorme e rearma. Vai para quem concluiu o onboarding e tem e-mail ligado com frequência `DAILY` (ou `WEEKLY`, só na segunda). O texto traz o pulso do dia, o gasto do mês contra o salário e as caixinhas em Alerta ou Estourada. Cada envio é registrado em `emaillogrow` (usuário, tipo, dia local) antes do próximo, e o registro é conferido antes de enviar. No boot, se o horário de hoje já passou, o backend tenta o envio do dia, e o registro impede a duplicata depois de um reinício.

Tabelas novas criadas no boot por `orm.create`: `passwordresetrow` e `emaillogrow`. Nenhuma tabela existente muda.

**Mock e teste (`scripts/test_integrations_mock.ps1`):** o mock (`scripts/mock_providers/providers_mock.ps1`) é um servidor HTTPS local com certificado autoassinado gerado na hora. O backend só confia nele porque a JVM do teste recebe um truststore de teste, então o teste passa pelo mesmo caminho TLS da produção. O mock não é em Kof porque o servidor do `kof.web` 0.6.6 recusa com 401 qualquer `Authorization: Bearer` que não seja um JWT válido, mesmo sem `app.security` (`JvmRuntimeWebDispatch`, passo 6 da pipeline), e o Resend usa Bearer opaco.

```
 1. Mock HTTPS local e backend sobem (e-mail ligado, mock confiado só pelo truststore de teste)
 2. Esqueci a senha: 202 e 1 e-mail no provedor com link de token de 64 hex
 3. E-mail inexistente: mesma resposta 202 e nenhum e-mail enviado
 4. Redefinir: senha curta e token desconhecido = 400; token certo = 200; nova senha entra e a antiga não
 5. Token de uso único: 2º uso = 400
 6. Limite: 4º pedido no mesmo e-mail em 1 hora = 429
 7. Resumo diário no horário KOF_DIGEST_AT: 1 e-mail para quem tem onboarding e DAILY; nenhum para NEVER e sem onboarding
 8. Reinício depois do resumo: o boot confere emaillogrow e não reenvia (1 resumo continua 1)
 9. Sem KOF_EMAIL_API_KEY: esqueci a senha e redefinir = 503 honesto, log explica e não vaza chave
RESULTADO INTEGRACOES (mock): 9 / 9
```

**Achado do teste (H2 local):** com `WRITE_DELAY=0` na URL do H2 (o padrão local do `store.kf` e dos scripts de gate), o H2 2.5 perde linhas já confirmadas quando o processo é morto com kill: a linha do `emaillogrow` aparecia com o servidor vivo e sumia depois do kill, e o resumo saía de novo. Com o padrão do H2 (sem `WRITE_DELAY=0`) a linha fica. O teste de integração usa o padrão do H2; em MySQL o passo 8 passa com o mesmo código. Trocar o padrão local do `store.kf` fica como decisão à parte (não afeta produção).

Não testado de ponta a ponta: a expiração de 30 minutos (a consulta exige `expiresAt > agora`; o teste não espera 30 minutos) e o envio real pelo Resend (proibido nos testes).

Gates do d1 (kof 0.6.6): GATES_D1

## 11. Coach com OpenAI e ferramentas (d2, 27/10/2026)

Código em `backend/coach_llm.kf`, chamado por `POST /api/chat/message`. Porta o `VoiceCommandController` do legado:

- **Modelo:** `gpt-4o-mini` (Chat Completions), por `backend/outbound.kf` (certificado validado, seção 9).
- **Prompt de sistema:** o `prompts/system-message.st` do legado, com a data local e o dia da semana, o modelo de orçamento do usuário e os nomes das tools daqui. Para usuário KAKEIBO sem a reflexão da semana, as 4 perguntas do `KakeiboReflectionService.QUESTIONS` vão no prompt.
- **Memória:** as últimas 20 mensagens do usuário no banco, em ordem cronológica (legado: `findTop20ByUserIdOrderByCreatedAtDesc`), lidas antes de gravar a mensagem nova.
- **Tool calling manual** (o Spring AI fazia o laço): resposta com `tool_calls` → cada tool roda no usuário do token → os resultados voltam como mensagens `role: tool` → nova chamada, até 5 rodadas. As 8 tools do legado: `persistTransaction` (valor em reais com centavos, mesmo caminho transacional do `POST /api/transactions`), `listTransactionsByCategory`, `getTotalByCategory`, `registerIncome`, `getDailyPulse`, `getBalance`, `suggestModelChange` e `answerKakeiboReflection`. Argumento inválido ou erro de regra volta para o modelo como `{"error": ...}`, sem derrubar a conversa. Diferença do legado: `answerKakeiboReflection` recebe as 4 respostas num texto separado por ` | ` (o schema é montado com records de um só tipo de propriedade).
- **Freemium:** o limite do plano (30 mensagens/mês no Gratuito) é conferido antes de chamar o provedor; a 31ª dá 402 sem chamada.
- **Falha do provedor** (rede, timeout, 4xx/5xx, resposta fora do formato): 503 `{"error":"O coach está indisponível no momento..."}`. Nada é gravado, então a mensagem não conta no limite. O log registra só o status ou o nome da falha, nunca a chave nem o corpo.
- **Sem `OPENAI_API_KEY`:** a resposta fixa com o pulso de antes (decisão de 19/10).

| Variável | Uso |
|---|---|
| `OPENAI_API_KEY` | Chave da OpenAI (segredo, `secrets.secret`; só vai para o cabeçalho) |
| `OPENAI_BASE_URL` | Opcional, padrão `https://api.openai.com/v1` (o teste aponta para o mock) |
| `OPENAI_MODEL` | Opcional, padrão `gpt-4o-mini` |
| `OPENAI_TIMEOUT_MS` | Opcional, padrão `30000` por chamada |

**Coluna do histórico:** o `kof.orm` cria todo campo `String` como `VARCHAR(255)` e não tem anotação de tamanho (`JvmOrmRuntime.kof_orm_sql_type`, conferido no 0.6.6 e no 0.6.7). Uma resposta do coach acima de 255 caracteres derrubava a gravação com 500 (medido no teste). No boot, se `chatmessagerow.content` ainda tiver 255, ela vira `TEXT` no MySQL e `VARCHAR(16000)` no H2 (DDL fixa, mesmo padrão da coluna `name`, seção da F1). O texto gravado tem teto de 8000 caracteres.

**Teste (`scripts/test_integrations_mock.ps1`, passos 10 a 17):** o mock HTTPS ganhou `POST /v1/chat/completions` no formato da OpenAI, com roteiro pela mensagem do usuário.

```
10. Sem OPENAI_API_KEY: resposta fixa com o pulso e nenhuma chamada ao provedor
11. Resposta simples; pedido com gpt-4o-mini, as 8 tools e o prompt com a data de hoje
12. tool_call persistTransaction -> gasto de R$ 35,50 FOOD gravado -> resposta final com o resultado
13. As 8 tools numa rodada: os 8 resultados chegam ao modelo (o Kakeibo volta como erro de regra: usuário fora do KAKEIBO)
14. Memória: pedido com sistema + 20 mensagens do banco + a nova (22), na ordem
15. 500, timeout de 2 s e resposta fora do formato = 503; nada gravado; chave fora da resposta
16. Freemium: 31ª mensagem = 402 sem chamar o provedor
17. Chave recusada (401) = 503; o log tem o status e nenhuma das chaves
RESULTADO INTEGRACOES (mock): 17 / 17  (kof 0.6.6 e 0.6.7, H2 e MySQL 8.4)
```

Não testado: a API real da OpenAI (proibido nos testes) e a qualidade das respostas do modelo.

Gates do d2 (sobre d0 + d1), no kof 0.6.6 (`KOF_VERSION`) e no 0.6.7 (estável mais recente em 27/10, zip conferido no `SHA256SUMS`), com resultado idêntico nas duas:

```
G-BUILD check/build exit=0 (10 arquivos, 224 classes) · frontend --target js exit=0
G-BYTECODE: todas as 224 classes carregadas e linkadas com -Xverify:all, 0 falhas; controle sintético
      (ireturn trocado por areturn) acusa VerifyError
G-E2E com -WebOut: H2 88/88 · MySQL 88/88
G-RESTART (encerramento normal e kill): H2 28/28 · MySQL 28/28
Integrações (mock HTTPS): 17/17 em H2 e MySQL · gate TLS do d0: 8/8 (também no 0.6.7)
```

No 0.6.7 o `kof.http` continua aceitando qualquer certificado (`JvmWebHttpRuntime`, `KOF_HTTP_CLIENT_INSECURE`, conferido no HEAD do Kof4j em 27/10), então o contorno da seção 9 continua necessário. Os gates de negativos, concorrência, DB-BOUNCE/DOWN e AUTH-STATIC rodaram no d0 e no d1 (0.6.6); no d2 não foram repetidos, porque as ferramentas locais desses gates foram apagadas do ambiente de teste.

## 12. Chat em JSON e histórico paginado (Batch 3, B1/B2, 01/11/2026)

Fecha as lacunas L3 e L4 do Batch 3. Quebra o contrato de `POST /api/chat/message`: o frontend (F2) passa a ler `reply` do JSON.

**`POST /api/chat/message`** (com token), corpo `{"message": "..."}`:

| Status | Corpo |
|---|---|
| 200 | `{"reply": "...", "messagesUsed": 1, "messagesLimit": 30}` (`messagesUsed` já conta a mensagem recém-gravada; `messagesLimit` = -1 no Premium, como no `tier-status`) |
| 400 | `{"error": ...}` corpo inválido |
| 402 | `{"error": "Você atingiu o limite de 30 mensagens gratuitas este mês."}` (nada gravado) |
| 503 | `{"error": "O coach está indisponível no momento. Tente de novo em instantes."}` (falha do provedor, nada gravado) |
| 401 | sem token |

Sem `OPENAI_API_KEY`, `reply` é a resposta fixa com o pulso, como antes.

**`GET /api/chat/messages?page=1&limit=50`** (com token; também aceita `?offset=`): `pageRequest(50, 100)` do `kof.web` (`page` 1-based, `limit` limitado a 100).

```json
{"items": [{"role": "USER", "content": "...", "createdAt": "2026-11-01T12:00:00.000Z"},
           {"role": "ASSISTANT", "content": "...", "createdAt": "..."}],
 "page": 1, "limit": 50, "offset": 0, "hasNext": false}
```

- Só as mensagens do usuário do token (`WHERE "userId" = ?`); não há parâmetro de usuário.
- A página 1 traz as mensagens mais recentes; dentro da página, ordem cronológica (antiga → nova). `hasNext = true` quando há mensagens mais antigas (página seguinte).
- Parâmetro inválido (ex.: `limit=-1`) = 400 `{"error": "PAGINATION: ..."}`; sem token = 401.
- `createdAt` vazio nas mensagens antigas gravadas antes da issue #44.

**Por que SQL e não `orm.window`:** `orm.window<T>(db, limit, offset)` pagina a tabela inteira, sem filtro por dono, e a Query DSL não aceita `offset` (PARSE090 no 0.6.6 e no 0.6.7). A consulta é `db.query<ChatMessageRow>` com binds e `LIMIT ? OFFSET ?`, busca `limit + 1` linhas para calcular `hasNext` e usa identificadores entre aspas (o MySQL roda com `ANSI_QUOTES`; o H2 cria as tabelas em minúsculas).

Gates (kof 0.6.6 e 0.6.7, resultado idêntico):

```
G-BUILD backend --target jvm exit=0 · G-BYTECODE 233 classes carregadas com -Xverify:all, 0 falhas
E2E H2 89/89 (0.6.6 e 0.6.7) · E2E MySQL 8.4 (ANSI_QUOTES) 89/89 (0.6.7)
G-RESTART H2 28/28 e MySQL 28/28 (0.6.7) · integrações com mock 17/17 (H2, 0.6.7)
Passos novos do E2E: 54 histórico cronológico · 55 sem token = 401 e limit=-1 = 400 · 64 paginação + isolamento entre usuários
```

## 13. Tela 11 Caixinhas no frontend (Batch 3, F3, 01/11/2026)

`frontend/screens/envelopes_screen.kf` consome `GET /api/envelopes/overview` (agrupado por `bucket`), `POST /api/envelopes {categoryName, limitAmount, bucket}` e `DELETE /api/envelopes/:id`. O formulário "Nova caixinha" é definitivo (DECISÃO-9): modal no Desktop, sheet no Mobile; categoria em `Select` com rótulos em PT e índice restaurado por `setSelected`; limite por `parseMoney`; grupo em cards de escolha com os buckets de `GET /api/budgets/balance` (sem resposta, cai nos grupos do overview). Validação local: limite inválido ("Informe um limite válido...") e grupo não escolhido ("Escolha o grupo da caixinha."). Bucket fora do modelo (400 `Bucket inválido...`) vira mensagem fixa em PT dentro do modal, mantendo categoria, limite e grupo. Salvar fecha o modal e recarrega a lista. "Excluir" abre confirmação no card (sem diálogo nativo). G-UI em Desktop 1280 e Mobile 360 (0.6.6 e 0.6.7): criar nos 3 grupos, cancelar, validação, erro real do backend (modelo trocado com o modal aberto), escolha mantida, excluir com confirmação, sem UNCAUGHT. Ainda sem UI: edição (`PUT`) e histórico por caixinha.

## 14. Integração final do Batch 3 (Z, 01/11/2026)

Commits pequenos sobre as entregas B1–B4, T0 e F0–F5:

| Item | Mudança |
|---|---|
| Layout | `shellRowCss` com `flex-wrap: nowrap`: no Desktop, textos longos não jogam mais a tela para baixo da sidebar. Saiu o contorno `width: 0; min-width: 100%` de `settings_screen.kf`. |
| `apiPatch` | `frontend/core/api_client.kf`, mesmo padrão de `apiPut`. Fonte da verdade: `http.patch` está na tabela de `KofHttp.staticCall` (`KOF_WEB_REFERENCE.md`) e `JsRuntimeOps` traz `kofHttpPatch`/`kofHttpPatchHeaders` no 0.6.6 e no 0.6.7. O bundle gerado tem `kofHttpPatchHeaders(url, body, headers) { return kofHttpRequest(url, "PATCH", headers, body); }`. No probe (Edge headless contra H2), o `fetch` sai com `PATCH` e o backend responde. |
| Rever meu salário | O modal ganhou o campo "Novo salário (R$)" e o botão `Salvar`. `parseMoney` valida antes: um valor inválido mostra "Digite um valor entre R$ 1 e R$ 1.000.000." e não faz requisição. Um valor válido faz `PATCH /api/users/me/salary`: no sucesso aparece "Salário atualizado."; no erro, a mensagem do backend. "Refazer configuração" continua inativo (DECISÃO-12). |
| Chat | Só o texto do 402 (`enforceCanSendMessage`: "…limite de 30 mensagens…") bloqueia o envio. Os outros `{"error"}` mostram a mensagem do backend e mantêm o rascunho com o envio liberado. |
| Backend | A resposta fixa do coach sem `OPENAI_API_KEY` usa `formatBrl(toCents(pulse))` e sai como `R$ 80,00` (antes saía `R$ 80.0`). O teste 55 de `test_e2e_flow.ps1` agora espera o valor em pt-BR. |
| Chat Mobile 360 | A barra de entrada usa `flex-wrap: wrap` e o campo tem `flex: 1 1 240px`. No Mobile, o campo ocupa a linha inteira e os botões ficam embaixo, à direita; no Desktop, tudo segue em uma linha. O placeholder precisa de 171 px e tem 260 px disponíveis (antes eram 68 px). |

### 14.1 Gates (série `db4fe7b..HEAD`, Kof 0.6.6 e 0.6.7)

| Gate | 0.6.6 | 0.6.7 |
|---|---|---|
| G-BUILD backend jvm / jvm `--fat` / frontend js | exit 0 (251 classes) | exit 0 (251 classes) |
| G-BYTECODE (LinkAll `-Xverify:all`; o controle sintético acusa `VerifyError`) | 251 OK, 0 FAIL | 251 OK, 0 FAIL |
| `test_e2e_flow.ps1` H2 | 91/91 | 91/91 |
| `test_e2e_flow.ps1` MySQL 8.4 (`ANSI_QUOTES`, Docker local) | 91/91 | 91/91 |
| `test_restart.ps1` (H2) | 28/28 | 28/28 |
| G-UI Desktop 1280 e Mobile 360: boas-vindas → cadastro → onboarding → dashboard → chat → caixinhas → notificações → configurações → sair | sem UNCAUGHT, sem rolagem horizontal | sem UNCAUGHT, sem rolagem horizontal |

Nenhum gate chamou a OpenAI ou o Resend reais. O servidor rodou sem `OPENAI_API_KEY` e sem chave de e-mail. O `test_restart.ps1` precisa de um console Windows para o Ctrl+C: rodado a partir do Git Bash, ele dá 26/28 (passos 6 e 17) nas duas versões, por limitação do ambiente; pelo PowerShell, dá 28/28.

## 15. Fundações de design fiéis aos artefatos (A1, 12/11/2026)

Refaz, sobre `ed7e691`, o trabalho de 02 e 03/11 perdido na limpeza do Windows. Referência: `docs/DESIGN_SYSTEM.md` (paleta, tipografia, raios, alturas, ícones, ondas e a tabela de inconsistências entre os três artefatos com o valor adotado) e `docs/FORM_WIDGETS.md`.

- **Marca e fundo oficiais em SVG.** A usuária entregou `organiza-simbolo.svg` e `organiza-fundo-ondas.svg`; ficam em `frontend/assets/brand/` e entram por `Image(...)` (`brand_mark.kf`, `background_waves.kf`). O desenho em Canvas (pixelado) foi abandonado. As ondas aparecem só nas telas de entrada que os artefatos mostram (`screenHasWaves`, em `core/navigation.kf`): Desktop = boas-vindas, salário, resultado, login e cadastro; Mobile = boas-vindas e todo o onboarding.
- **Ícones do design system** como `.svg` estáticos (`scripts/gen-icons.sh` → `frontend/assets/icons/<nome>-<tom>.svg`, 11 nomes × 8 tons) e `components/icons.kf` (`icon`, `iconView`). Usados na nav (`nav_bar.kf`) e nas notificações. O `kof build` não copia assets: o `Dockerfile` copia `frontend/assets` para `/out/web/assets` e confere três arquivos.
- **theme.kf:** pilha `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` em todo Style de texto, botão e input (o `.kof-button` não herda a fonte); raio de botão 10; tokens `colorCanvas`, `colorChartDes`, `borderSoft`; nenhum hex fora da paleta (as cores de categoria passaram a apontar para a paleta).
- **topbar:** 56 px, borda border-soft, título 16/600, subtítulo 11 em #7B8EAD, ponto verde de 6 px em "Assistente online", slot `action` à direita (`#topbar-action`); assinatura mantida.
- **form_widgets:** `formField` (38), `labeled`, `passwordField`/`passwordBox` (olho em Canvas + `setType`), `radioChoiceCard` (radio 18), `bigMoneyField`/`bigMoneyAmount` (52/700, máscara de milhar via `on("input")`), `moneyHint`, `chip`/`chipGroup`.

### 15.1 Gates (Kof 0.6.6, Windows; backend H2 local em `PORT=3077`, `KOF_WEB_OUT=out/web`)

- **G-BUILD js:** `kof build frontend --target js` sem diagnósticos (só a nota do alvo alpha); backend jvm com o MEM014 já conhecido.
- **G-UI headless** (Edge `--headless=new` + CDP puro, `out/gate.mjs`; Mobile via `Emulation.setDeviceMetricsOverride`), Desktop 1280×800 e Mobile 360×640, dsf 1 e 2, cadastro + onboarding + 5 rotas logadas:
  - 0 imagens quebradas em todas as telas (`naturalWidth` > 0; logo 926, fundo 1200).
  - Ondas presentes exatamente nas telas listadas acima e ausentes nas demais (medido tela a tela).
  - Topbar de 56 px nas 5 telas logadas, nos dois layouts e nos dois dsf; ponto verde só no chat.
  - Fonte computada `system-ui` em texto e em botão.
  - Nitidez da logo: amostrada em zoom 1 e 4, a razão pixels-de-borda/pixels-acesos cai ~4× (0.096 → 0.024 na boas-vindas; 0.18 → 0.057 na sidebar) nos dois dpr, isto é, as bordas continuam de 1 px ao ampliar: vetor, sem pixelado.
  - 0 `UNCAUGHT` e 0 `console.error`.
- **Pendente:** repetir o G-BUILD da A1 no Kof 0.7.2 (release estável mais recente); o download pela OneDrive não terminou dentro daquela sessão.

## 16. Cadastro com nome, sobrenome, idade e política de senha (A2, backend, 12/11/2026)

### 16.1 Contrato

- `POST /api/auth/register` com `{"firstName","lastName","age":Int,"email","password"}` responde 200 com o JWT em texto, como antes. Grava `firstName`, `lastName` e `age` (sem espaços nas pontas) e `name = firstName + " " + lastName`.
- **Legado:** `{"name","email","password"}` continua aceito quando o corpo não traz nenhum dos campos novos (`isLegacyRegister` em `backend/models.kf`). `firstName` e `lastName` saem do `name` (até o primeiro espaço / o resto) e `age = 0`. A política de senha vale também para ele. A regra de caracteres do nome e a idade não valem no legado. A remoção futura está descrita no comentário de `isLegacyRegister`.
- `GET /api/users/me` acrescenta `firstName`, `lastName` e `age` (0 → `null`). Para contas antigas (`firstName` vazio), os nomes são derivados do `name` só na leitura; nada é regravado.
- **Colunas:** `userrow` ganha `firstName VARCHAR(255) DEFAULT '' NOT NULL`, `lastName VARCHAR(255) DEFAULT '' NOT NULL` e `age INT DEFAULT 0 NOT NULL` no fim da tabela (`migrateUserProfileColumns` em `backend/store.kf`, chamada pelo `ensureSchema` logo depois de `migrateUserNameColumn`). Cada `ALTER` é fixo e só roda se `INFORMATION_SCHEMA.COLUMNS` não tiver a coluna; falha = boot abortado. As colunas do orm não são nullable, por isso o padrão `''`/`0`.
- **Login** não passa pela política (uma senha antiga fraca continua entrando).

### 16.2 Erros (400 `{"error":"..."}`, a primeira regra violada vence)

| # | Regra | Mensagem |
|---|---|---|
| 1 | JSON inválido, `email` ou `password` ausentes, `age` que não é inteiro (ex.: `"18"`) | `Dados inválidos.` |
| 2 | campo vazio (nome, sobrenome, `age` ausente, e-mail, senha) | `Preencha nome, sobrenome, idade, e-mail e senha.` |
| 3 | nome: 1 a 60 caracteres depois do trim | `O nome precisa ter de 1 a 60 caracteres.` |
| 3 | nome: só letras (com acento), espaço, hífen e apóstrofo (`'` ou `’`) | `O nome só pode ter letras, espaço, hífen e apóstrofo.` |
| 4 | sobrenome: as mesmas regras | `O sobrenome precisa ter de 1 a 60 caracteres.` / `O sobrenome só pode ter letras, espaço, hífen e apóstrofo.` |
| 5 | idade < `MIN_AGE()` = 18 | `Você precisa ter pelo menos 18 anos para criar uma conta.` |
| 5 | idade > 120 | `Digite uma idade válida.` |
| 6 | e-mail (um `@`, texto dos dois lados, sem espaço, até 255) | `Digite um e-mail válido.` |
| P1 | senha com menos de 8 caracteres | `A senha precisa ter pelo menos 8 caracteres.` |
| P2 | senha com mais de 128 | `A senha pode ter no máximo 128 caracteres.` |
| P3 | sem `\p{Lu}` | `A senha precisa ter pelo menos uma letra maiúscula.` |
| P4 | sem `\p{Ll}` | `A senha precisa ter pelo menos uma letra minúscula.` |
| P5 | sem `\p{Nd}` | `A senha precisa ter pelo menos um número.` |
| P6 | sem caractere fora de `[\p{L}\p{Nd}]` | `A senha precisa ter pelo menos um caractere especial.` |
| P7 | contém o e-mail inteiro, ou a parte antes do @ quando ela tem 3+ caracteres (sem diferenciar maiúsculas) | `A senha não pode conter o seu e-mail.` |
| P8 | contém o primeiro nome quando ele tem 3+ caracteres (sem diferenciar maiúsculas) | `A senha não pode conter o seu nome.` |

No legado, o nome entra como antes (vazio → regra 2, mais de 255 → `Dados inválidos.`).

**Reset** (`POST /api/auth/reset-password`, `backend/main.kf`): P1–P6 rodam antes de gastar o token (uma senha fraca não queima o link); P7–P8 dependem da conta e rodam depois do `consumePasswordResetToken`, então a recusa por e-mail/nome gasta o link e o usuário pede outro.

### 16.3 Medidor de força (para o frontend)

- `criterios` = quantos destes a senha cumpre: `\p{Lu}`, `\p{Ll}`, `\p{Nd}`, caractere não alfanumérico (`[^\p{L}\p{Nd}]`). Vai de 0 a 4.
- `score` = 0 se a senha estiver vazia; `min(criterios, 1)` se tiver menos de 8 caracteres; senão `criterios`.
- Rótulos por score: 1 Fraca, 2 Razoável, 3 Boa, 4 Forte (0 = sem rótulo).
- No JS, as regex usam a flag `u` (`/\p{Lu}/u`, `/\p{Ll}/u`, `/\p{Nd}/u`, `/[^\p{L}\p{Nd}]/u`).
- O medidor é só indicação: quem decide é o backend (P1–P8). Um score 4 ainda pode ser recusado por P2, P7 ou P8.

### 16.4 Scripts

As senhas de teste de `scripts/test_e2e_flow.ps1`, `test_integrations_mock.ps1` e `test_restart.ps1` passaram a cumprir a política (ex.: `secretPassword123!`). Casos novos: cada regra acima (inclusive a precedência entre regras), idade 17/18/120/121/texto, nomes com número e símbolo, nomes com acento, hífen e os dois apóstrofos, legado (aceito, senha fraca recusada, `/me` separando no primeiro espaço e `age: null`), login com senha fraca (401, não 400) e, no mock de integrações, reset com senha sem especial (400 sem gastar o token), com o e-mail (400 e link gasto) e com o primeiro nome.

### 16.5 Gates (clone `work\a2`, base `ed7e691`, Kof 0.6.6 e 0.7.2 instalados em `work\_kof` com SHA256SUMS conferido)

| Gate | 0.6.6 | 0.7.2 |
|---|---|---|
| G-BUILD backend jvm (11 arquivos) / frontend js | exit 0 (251 classes) | exit 0 (251 classes) |
| G-BYTECODE (LinkAll `-Xverify:all`; controle sintético `bipush 7; areturn` acusa FAIL=1) | 251 OK, 0 FAIL | 251 OK, 0 FAIL |
| `test_e2e_flow.ps1` H2 com `-WebOut` (casos novos da seção 16.4 inclusos) | 121/121 | 121/121 |
| `test_e2e_flow.ps1` MySQL 8.4 (`ANSI_QUOTES`, container `mysql:8.4` próprio, porta 33086) | 121/121 | 121/121 |
| `test_integrations_mock.ps1` (H2, mock HTTPS local) | 18/18 | 18/18 |
| Migração: H2 criado pelo build de `origin/main`, conta legado `{"name":"Lia Antiga Legado"}` com senha `12345678`; o build do A2 sobe no mesmo banco | 3 `ALTER` no log (`firstName`, `lastName`, `age`), login 200 com a senha fraca antiga, `/me` = `firstName "Lia", lastName "Antiga Legado", age null`, cadastro novo 200 | 3 `ALTER` no log (`firstName`, `lastName`, `age`), login 200 com a senha fraca antiga, `/me` = `firstName "Lia", lastName "Antiga Legado", age null`, cadastro novo 200 |

Medido no 0.6.6: `json.decode<Int?>` aceita `"18"` (texto) e converte para 18; por isso `decodeRegisterRequest` olha o JSON bruto (`"age"\s*:\s*"`) e responde `Dados inválidos.`. Nenhum gate chamou OpenAI ou Resend reais. O `kof build` do frontend não copia `frontend/assets` (ver briefing), e a suíte E2E só precisa do `index.html`.

## 17. App em Desktop, tela cheia e shell preso à janela (A3, 12/11/2026)

Rebased sobre `cc8e042` (preservando `backgroundWaves()` / `overWaves()`, os ícones SVG da `nav_bar.kf` e a pilha de fonte `system-ui` do A1; `screens/chat_screen.kf` não foi alterado nesta entrega).

| Item | Mudança |
|---|---|
| Viewport inicial | `AppState.isDesktop = true`: o app abre em Desktop. `applyViewport` não chama mais `w.size(360, 640)` nem `w.size(1280, 800)`. O `kof.ui` não expõe a largura da janela nem evento de `resize`, então o layout continua escolhido à mão. |
| Controle | O selo "Mobile 360x640" (`#dev-viewport`) virou o botão "Ver como Mobile" / "Ver como Desktop": fundo transparente, texto `muted` `#4A5578`, borda `border-soft`, `font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` (o `.kof-button` não herda a fonte). |
| Shell e entrada | O root (`#shell`) usa `position: fixed; top: 61; bottom: 53; left: 33; right: 33`, a área interna do `.kof-window` do `index.html` do Kof (titlebar + padding + borda). Vale para o Desktop, o Mobile e as telas de entrada (mantendo as camadas `backgroundWaves()` / `overWaves()` do A1): em Mobile o app ocupa a largura e a altura toda da área útil, sem coluna de 360 nem `min-height` de 640. `#shell-main` tem `align-self: stretch`, `min-height: 0` e é o único que rola. |
| Sidebar e barra inferior | Na sidebar (`nav_bar.kf`), a lista do meio rola (`flex: 1 1 0; min-height: 0; overflow-y: auto`) e o rodapé (Configurações, avatar e nome) tem `flex-shrink: 0; margin-top: auto`, ficando sempre visível. A barra inferior do Mobile tem `flex-shrink: 0` e fica presa no fim do `#shell`. |

Limites medidos: `Style("css")` aceita `position: fixed`, mas recusa `calc()` (SEM078) e `@media`, e `100%` não tem altura útil no `#kof-root` sem o template do `index.html` (rascunhos de issue upstream: `issue-window-size-resize.md` e `issue-index-html-template.md`).

### 17.1 Gates (Kof 0.6.6 e 0.7.2, backend local H2, Edge headless via CDP)

- **G-BUILD:** `kof check backend` (`exit=0`, 11 arquivos; 1 warning `MEM014` no 0.6.6 e 0 no 0.7.2), `kof build backend --target jvm --fat` (`exit=0`) e `kof build frontend --target js` (`exit=0`, com cópia de `frontend/assets`) nas duas versões.
- **G-UI (`build/gui-gate.mjs`, portas locais `3083` e `3084`, H2, `PORT` + `KOF_WEB_OUT`):** abre em Desktop (`"Ver como Mobile"`), ondas A1 carregadas, `#dev-viewport` alterna nos dois sentidos (entrada e shell), login → dashboard, topbar de 56 px, 5 ícones SVG da nav sem imagem quebrada, avatar `#user-initial` visível (`bottom < innerHeight`), barra inferior presa ao fim do shell (`tab.bottom == shell.bottom`), navegação pelas 5 rotas sem rolagem horizontal/vertical da página (`scrollWidth <= innerWidth`, `scrollHeight <= innerHeight`) e sem `UNCAUGHT` / erro de console.

| Cenário | 0.6.6 | 0.7.2 |
|---|---|---|
| Desktop 1920×1080 | 27/27 | 27/27 |
| Desktop 1280×800 | 27/27 | 27/27 |
| Mobile 360×640 (CDP) | 27/27 | 27/27 |
| Mobile 412×915 (CDP) | 27/27 | 27/27 |
| Mobile pelo controle em 1280×800 (entrada e shell em tela cheia) | 9/9 | 9/9 |
| **Total G-UI** | **117/117** | **117/117** |

## 18. Onboarding completo em 5 etapas e chips de gastos (B5, 12/11/2026)

Empilhado sobre o commit da A3 (`e8fc33c`), mantendo os widgets de `components/form_widgets.kf`, os tokens de `core/theme.kf` e o shell/viewport da A3 sem alterar `auth_api.kf`.

| Item | Mudança |
|---|---|
| Indicador de 5 etapas | `onbProgressDots` e `dotsBlock` (`screens/onb_result_screen.kf`) renderizam 5 pontos (`0` Salário, `1` Tipo de renda, `2` Dívida e Valor da dívida, `3` Chips de gastos, `4` Resultado) com `progressDot`. |
| Salário e dívida | `screens/onb_salary_screen.kf` e `screens/onb_debt_amount_screen.kf` usam `bigMoneyField` + `bigMoneyAmount` (52/700 com `"R$"` e máscara de milhar) e `moneyHint`, preservando a validação por `parseMoney`. |
| Tipo de renda e dívidas | `screens/onb_income_screen.kf` e `screens/onb_debt_screen.kf` usam `radioChoiceCard` (radio de 18 px, ponto de 9 px), com botão `"Próximo"` desabilitado até a escolha. |
| Chips e API própria | `screens/onb_chips_screen.kf` usa `chip` / `chipGroup` em grade de 2 colunas no Desktop (`max-width: 560`) e empilhada no Mobile (`Aluguel,Contas,Transporte` e `Alimentação,Delivery` pré-selecionados em `OnboardingState`), valida seleção mínima (`"Escolha pelo menos um gasto."`, conforme `backend/overview.kf`) e `core/onb_api.kf` (`submitChips`) chama `POST /api/envelopes/from-chips` somente após `POST /api/users/onboarding` concluir. |
| Resultado | `screens/onb_result_screen.kf` exibe título centralizado, percentual junto ao nome e valor à direita, barras coloridas (`accent`, `chart-des`, `success`) e o card informativo `"Organiza AI"`. Todo `Style` de texto/botão local declara `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. |

### 18.1 Gates (Kof 0.6.6 e 0.7.2, backend local H2, Edge headless via CDP)

- **G-BUILD:** `kof build frontend --target js` (`exit=0`, com cópia de `frontend/assets`) e `kof build backend --target jvm --fat` (`exit=0`) nas duas versões.
- **G-UI (`build/onb-gui-gate.mjs`, portas locais `3089` e `3090`, H2, `PORT` + `KOF_WEB_OUT`):**
  - Desktop 1280×800 (`FIXED`, sem dívida, salário `5.000` → `50/30/20`, 5 chips selecionados → `["EDUCATION","GROCERIES","HOUSING","LEISURE","PHARMA"]` confirmadas via `GET /api/envelopes`) e Mobile 360×640 (`VARIABLE`, com dívida `5.000` → `Base Zero`, 4 chips selecionados → `["FOOD","HOUSING","OTHER","TRANSPORT"]` confirmadas via `GET /api/envelopes`).
  - Conferidos em todas as etapas: 5 pontos de progresso corretos, `bigMoney` 52/700, radio 18 px, erro de 0 chips, fonte `system-ui` nos botões e chips, 0 imagens quebradas, `scrollWidth <= innerWidth` (sem rolagem horizontal) e 0 `UNCAUGHT`.

| Cenário | 0.6.6 | 0.7.2 |
|---|---|---|
| Desktop 1280×800 (Fixa, sem dívida, 5 chips) | 42/42 | 42/42 |
| Mobile 360×640 (Variável, com dívida, 4 chips) | 42/42 | 42/42 |
| **Total G-UI** | **84/84** | **84/84** |

## 19. Fidelidade de Boas-vindas e Dashboard (B2, 12/11/2026)

### 19.1 Tela 1 — Boas-vindas (`frontend/screens/welcome_screen.kf`)

Alinhada aos artefatos `WelcomeWin` (Desktop) e `WelcomeScreen` (Mobile), mantendo o fundo oficial de ondas vindo de `core/navigation.kf`:

- **Desktop:** `brandMark` 200 px, slogan `"Sua grana organizada e sem estresse."` em caixa alta (`16 px`, `max-width: 320`, `margin-top: 8`), botões `"Criar conta grátis"` e `"Já tenho conta"` lado a lado (`200 × 48 px`, `border-radius: 10`, `gap: 16`, `font-size: 15`).
- **Mobile:** `brandMark` 180 px, slogan em `18 px`, botões empilhados em largura total (`height: 50 px`, `border-radius: 14`, `gap: 12`, `font-weight: 700`).
- Todos os `Style` de botão declaram `font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- Validado em `kof 0.6.6` e `kof 0.7.2-a3` (`kof build frontend --target js` e Edge headless 1280×800 e 360×640, 0 `UNCAUGHT`).

### 19.2 Dashboard (`frontend/screens/dashboard_screen.kf` e `frontend/core/dashboard_api.kf`)

- **Abas na topbar:** `Semana` / `Mês` / `Ano` montadas no slot `action` de `topbar("Dashboard", dashSubtitle(d), periodTabs(w))`, com estilos de botão declarando `font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` (ativa em `#00D4FF` sobre `#06121C`, container raio 9 e botão raio 7).
- **Tiles e cards fiéis aos artefatos:**
  - Desktop (`1280×800`): 3 `pulse-card` (`linear-gradient(135deg, #12162A, #1A1F3A)`, borda `rgba(0,212,255,.15)`, raio 14) em `g3` + `g2` (`align-items: stretch`) com `Distribuição <modelo>` e `Últimas transações` (divisores `border` entre linhas e pontos 4× em `Canvas`).
  - Mobile (`360×640`): hero card centralizado `Pode gastar hoje` (`36 px`, raio 16) + 2 cards em `g2` (`20 px`) + cards de distribuição e transações empilhados sem rolagem horizontal.
- **Gráfico Donut Interativo 4×:**
  - Conferido no fonte do `kof4j` (`0.7.2`, `KofUi.java:113-120`, `548-571` e `JsRuntimeUiEvents.java:29-30`): `Canvas` continua fora de `isDomWidget` (sem `.on()`, `setId()` ou `setStyle()`), e `Event.x()/y()` expõem apenas `clientX`/`clientY` sem retângulo do elemento. Rascunho de issue salvo localmente em `issue-canvas-events.md` (não publicado).
  - Contorno fiel: `Canvas(576, 576)` com `zoom: 0.25` (144 px visuais), desenhado apenas com `setFill` + `fill` (`dotCanvas` também em 4× `32×32`), seleção em `DashState.selectedSlice` via itens clicáveis da legenda (`#legend-0..N`) e clique cíclico em `#dash-donut`. A fatia selecionada desloca radialmente para fora (`pop = 24`) com raio ampliado (`252`), as demais esmaecem (`dimSliceColor` 30% sobre `#12162A`) e `#donut-center` exibe `%`, nome e valor (`R$`); sem seleção, exibe modelo e salário.

### 19.3 Gates da B2 (`kof 0.6.6` e `kof 0.7.2-a3`, Windows; H2 na porta `3086`)

| Gate | `kof 0.6.6` | `kof 0.7.2-a3` |
|---|---|---|
| `kof build frontend --target js` | exit 0 | exit 0 |
| G-UI headless (`out/gate_b2.mjs`, Edge CDP, Desktop `1280×800` e Mobile `360×640`, H2 semeado em reais via `/api/*`) | 45/45 checks, 0 `UNCAUGHT`, 0 `console.error` | 45/45 checks, 0 `UNCAUGHT`, 0 `console.error` |

Cobertura do G-UI: textos, alturas/raios e `system-ui` na Boas-vindas; abas no `#topbar-action` sem overflow; valores dos 3 tiles batendo com `/api/dashboard?period=month|week|year`; pixels do donut 4× nas cores `#00D4FF`/`#0066FF`/`#00E5A0` e `#12162A`; clique em `#legend-0`/`1`/`2` e `#dash-donut` atualizando `#donut-center` e esmaecendo os itens não selecionados.

## 20. Fidelidade da Tela 10 Organiza AI (B1, 12/11/2026)

Alinha `frontend/screens/chat_screen.kf` e `frontend/core/chat_api.kf` aos artefatos Desktop e Mobile e às decisões da usuária (`docs/DESIGN_SYSTEM.md`):

- **Topbar e saudação:** `topbar("Organiza AI", "Assistente online", null)` com o ponto verde `#00E5A0` de 6 px (`#topbar-online-dot`). Quando não há mensagens, exibe `"Oi, <PrimeiroNome>! Me fala seus gastos aí que eu organizo tudo pra você."` sem prometer voz nem leitura de fatura PDF.
- **Bolhas de conversa:** largura máxima `75%`, fonte `13px`, `line-height: 1.45em`, `padding: 10px 14px`. IA à esquerda em `#1A1F3A`, texto `#F0F0F0`, sem borda e raio `12px 12px 12px 3px`; usuária à direita em `#00D4FF`, texto `#06121C`, peso `600` e raio `12px 12px 3px 12px`; indicador `"Organiza AI está digitando…"` em `#1A1F3A` com texto `#7B8EAD` em itálico.
- **Escape seguro no histórico local:** `chatEncode`/`chatDecode` escapam `\n` ↔ `¶` e `|` ↔ `¦`, evitando que uma mensagem com `|` quebre o formato `ROLE|texto` de `ChatState.messages`.
- **Lista flexível e composer preso embaixo:** removidos `max-height: 60vh` e `min-height: 240`. A lista usa `flex: 1 1 0; min-height: 0; overflow-y: auto; flex-direction: column-reverse` dentro de `#screen-chat` (`height: 690` no Desktop `1280×800`, `flex: 1 1 0` no Mobile `360×640`), mantendo o composer colado ao rodapé (`formBottom <= 790` no Desktop `1280×800` mesmo com o contador visível).
- **Composer em caixa única (1 linha nos dois viewports):** `Form` com `flex-wrap: nowrap`, fundo `rgba(255,255,255,.04)`, borda `1px solid rgba(255,255,255,.1)`, raio `14px` e `padding: 6px 8px 6px 10px`:
  - Anexo (`#chat-attach`): `30×30`, borda circular `border-soft`, ícone `plus` (`secondary`, 16 px), `disabled` com `opacity: 0.5`.
  - Campo (`#chat-input`): transparente, sem borda, `flex: 1 1 0; min-width: 0`, placeholder `"Pergunte qualquer coisa"`.
  - Voz (`#chat-mic`): `26×26`, transparente, ícone `mic` (`muted`, 16 px), `disabled` com `opacity: 0.5`.
  - Enviar (`#chat-send`): `30×30`, circular (`border-radius: 15`), gradiente `linear-gradient(135deg, #00D4FF, #0066FF)` com `icon("send", 14, "onaccent")` quando ativo, ou `#1A1F3A` com `icon("send", 14, "muted")` e `opacity: 0.5` quando bloqueado/enviando.
  - Removida a legenda `#chat-soon` (`"+ e Voz: em breve"`).
- **Contador discreto e preservação de rascunho:** `#chat-counter` (`"N de 30 mensagens neste mês"`) só aparece quando `limit - used <= 5` (a partir de `25 de 30`) ou quando bloqueado (`30 de 30`). Ao enviar, o campo limpa na hora; se ocorrer erro `503`/rede ou `402` (limite atingido), o texto digitado volta para `ChatUi.draft` / `#chat-input`.

### 20.1 Gates (Kof 0.6.6 e Kof 0.7.2, Windows; backend H2 local)

- **G-BUILD js:** `kof build frontend --target js` com `0` erros em `0.6.6` e `0.7.2` (+ cópia de `frontend/assets`).
- **G-UI headless (`out/gate_chat.mjs`, Edge `--headless=new` + CDP puro):** Desktop `1280×800` e Mobile `360×640` em `0.6.6` e `0.7.2`:
  - Topbar 56 px com `"Assistente online"` e ponto verde; saudação fiel sem voz/PDF.
  - Estilos computados das bolhas da IA e da usuária, raio `14px` do composer, ícones `plus-secondary.svg`, `mic-muted.svg` e `send-onaccent.svg` carregados (`naturalWidth > 0`), composer em linha única nos dois viewports, sem `#chat-soon` e sem overflow horizontal.
  - Envio por clique em `#chat-send` e por submit do formulário (`Enter`), bolhas separadas por mensagem e preservadas após recarregar a página e fazer login novamente.
  - Erro `503` simulado via CDP `Fetch.fulfillRequest` preserva o rascunho (`"jantar R$ 80"`) com o campo habilitado.
  - Contador oculto em `0/30`, `1/30` e `24/30`, visível em `25/30` (`"25 de 30 mensagens neste mês"`) com a lista rolando e `formBottom = 790 <= 800` no Desktop e `formBottom = 562 <= 640` no Mobile; na 31ª mensagem (`402`), mostra o erro de limite, atualiza para `"30 de 30 mensagens neste mês"`, preserva o rascunho (`"café R$ 12"`) e desabilita o envio.
  - **Resultado:** `36/36` asserções verdes em `0.6.6` e `36/36` em `0.7.2`, `0 FAILURES`, `0 UNCAUGHT`, `0 console.error`.

## 21. Login e Cadastro fiéis aos artefatos + Esqueci a Senha e Medidor de Senha (B3, 12/11/2026)

Entrega de frontend sobre `cc8e042` (`frontend/screens/login_screen.kf`, `frontend/screens/signup_screen.kf`, `frontend/core/auth_api.kf`), alinhada aos artefatos Desktop (`64FYjX5UiveVxTtRGYurQP`) e Mobile (`8b3jFV4BrGj4YkDQAwDvDF`) e ao contrato da tarefa A2:

- **Layout dual (Desktop + Mobile):**
  - Desktop (`AppState.isDesktop = true`): duas colunas em `LoginWin` e `SignupWin` — painel esquerdo da marca (`340 px`, logo 120, gradiente sutil e chamada) e painel direito centralizado com o formulário (`max-width: 360 px`, botão primário de 40 px).
  - Mobile (`AppState.isDesktop = false`): coluna única em tela cheia com logo centrada, título, campos, ações e rodapé.
  - Todo `Style` local de botão e texto declara `font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` e usa exclusivamente cores da paleta oficial.
- **Widgets e olho da senha:** campos com `labeled`, `formField` e `passwordBox` (`components/form_widgets.kf`). `fullPasswordBox` aplica `display: block` ao wrapper da `passwordBox` para que o `Input` ocupe 100% da largura mantendo o ícone de olho em `position: absolute` à direita sem alterar `form_widgets.kf`.
- **Cadastro + medidor em tempo real (`signup_screen.kf` + `auth_api.kf`):**
  - Campos `Nome` (`firstName`), `Sobrenome` (`lastName`), `Idade` (`age: Int`, `MIN_AGE() = 18`, máximo 120), `E-mail`, `Senha` e `Confirmar senha`, enviando `{"firstName","lastName","age","email","password"}` para `POST /api/auth/register`.
  - Barra medidora de força (4 segmentos + rótulo) atualizada in-place via `on("input")` sem `mountScreen` (preserva o foco durante a digitação), espelhando o contrato A2 (`0` vazio, `1` Fraca, `2` Razoável, `3` Boa, `4` Forte; critérios Unicode de maiúscula, minúscula, dígito e caractere não alfanumérico).
  - Validações locais na mesma ordem e com as mesmas mensagens do backend A2 (campos vazios, nome/sobrenome 1–60 com letras acentuadas/espaço/hífen/apóstrofo, idade 18–120, e-mail, P1–P8 de senha e confirmação); `apiErrorMessage` mapeia todos os erros do backend para mensagens fixas em PT.
- **Login + Esqueci minha senha (`login_screen.kf` + `auth_api.kf`):**
  - Fluxo completo integrado a `POST /api/auth/forgot-password` (modos `"login"` → `"forgot"` → `"reset"` com token e nova senha + medidor de força) e `POST /api/auth/reset-password`, incluindo tratamento explícito de 503 quando o serviço de e-mail está desligado (`KOF_EMAIL_API_KEY` ausente).

### 21.1 Gates (Kof 0.6.6 e Kof 0.7.2, Windows; backend H2 com patch A2 `0008` em clone temporário + mock HTTP local para Resend)

| Gate | Kof 0.6.6 | Kof 0.7.2 |
|---|---|---|
| `kof build frontend --target js` | exit 0 | exit 0 |
| G-UI headless Desktop 1280×800 e Mobile 360×640 (`gate_b3.mjs`, porta 3087): 2 colunas Desktop / 1 coluna Mobile, 0 rolagem horizontal, 0 imagens quebradas, `font-family: system-ui` nos botões, medidor 0→4 + Unicode, olho da senha, todas as validações locais, cadastro → `onb_salary`, login senha errada, esqueci a senha (202 + token do mock) → reset → login com nova senha, 0 `UNCAUGHT`/`console.error` | 77/77 PASS | 77/77 PASS |

## 22. Caixinhas: correção de estado, sessão, decode e fidelidade visual (A4, 12/11/2026)

- **Causa raiz investigada:** `EnvState.loaded` nunca era reiniciado em `navigateTo` nem ao sair/expirar sessão. Com isso, uma falha transitória (`500`/timeout -> `"Não consegui falar com o servidor..."`), uma troca de conta ou um `401` ficavam presos entre navegações; respostas não-JSON quebravam `json.decode` fora do `try/catch` de `loadEnvelopes`; e o modelo `FREELANCER_BASE_ZERO` bloqueava a criação de caixinhas por exigir seleção de grupo mesmo sem buckets.
- **Correções (`core/envelopes_api.kf`, `core/navigation.kf`, `screens/envelopes_screen.kf`):** `resetEnvelopes()` passou a rodar ao navegar para `envelopes`, `welcome` e `login` e a limpar `raw`/`buckets`/`loadError`/`formError`/`confirmDelete`/`loadedFor`; `loadEnvelopes()` valida o JSON antes de marcar `loaded = true` e só consulta `/api/budgets/balance` se houver token e o overview não tiver falhado; `401` redireciona para `login` com `"Sua sessão expirou. Entre de novo."`; Base Zero envia `CreateEnvelopeNoBucketRequest` (sem `bucket`).
- **Fidelidade visual (`screens/envelopes_screen.kf`):** botão da topbar com ícone `plus` (`+ Nova caixinha` em gradiente no Desktop e `+ Nova` em `#00D4FF` no Mobile), grupos com títulos diferenciados por viewport, grade Desktop (`grid-template-columns: 1fr 1fr 1fr`, `gap: 12`) e pilha Mobile (`gap: 10`), cards com os 3 estados (`Em dia` badge `#00E5A0` e valor/barra `#00D4FF`, `Alerta` `#FFB800`, `Estourada` `#FF4A6E`), barra limitada a `100%` mesmo em `120%`, rodapé com legenda `p% · R$ gasto/R$ limite` + botão `Excluir` (confirmação inline `Manter` / `Sim, excluir`) e modal/sheet de criação com `font-family` explícito em todos os `Style`.

### 22.1 Gates G-UI A4 (Kof 0.6.6 e Kof 0.7.2, Edge headless + H2 local)

| Gate / Verificação (`out/gate_a4.mjs`) | Kof 0.6.6 | Kof 0.7.2 |
|---|---|---|
| G-BUILD `kof build frontend --target js` | PASS (exit 0) | PASS (exit 0) |
| 1. Desktop (1280×800): estado vazio após cadastro + onboarding | PASS | PASS |
| 2. Desktop: criar caixinha (`+ Nova caixinha` → modal → salvar) | PASS | PASS |
| 3. Desktop: cancelar exclusão (`Manter`) preserva o card | PASS | PASS |
| 4. Desktop: confirmar exclusão (`Sim, excluir`) remove o card | PASS | PASS |
| 5. Desktop: troca de sessão sem reload + 3 estados (`Em dia`, `Alerta`, `Estourada`) em BRL | PASS | PASS |
| 6. Desktop: 0 imagens quebradas (`naturalWidth > 0`) | PASS | PASS |
| 7. Desktop: `font-family: system-ui` em todos os botões | PASS | PASS |
| 8. Desktop: sem overflow horizontal (`scrollWidth <= clientWidth`) | PASS | PASS |
| 9. Desktop: barra de 120% limitada a 100% do trilho | PASS | PASS |
| 10. Mobile (360×640 via CDP): valores em BRL e sem erro de rede | PASS | PASS |
| 11. Mobile: 0 imagens quebradas (`naturalWidth > 0`) | PASS | PASS |
| 12. Mobile: `font-family: system-ui` em todos os botões | PASS | PASS |
| 13. Mobile: sem overflow horizontal (`scrollWidth <= clientWidth`) | PASS | PASS |
| 14. Mobile: criar caixinha (`+ Nova` → sheet → salvar) | PASS | PASS |
| 15. Mobile: excluir caixinha com confirmação inline | PASS | PASS |
| 16. Zero `UNCAUGHT` exceptions | PASS (0) | PASS (0) |
| 17. Zero `console.error` | PASS (0) | PASS (0) |
| **Total G-UI (`gate_a4.mjs`)** | **17/17 PASS** | **17/17 PASS** |
