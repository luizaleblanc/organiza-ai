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

A corrida de cadastro está protegida: com 8 POSTs simultâneos para o mesmo e-mail, 1 deu 200 e 7 deram 409, e ficou 1 linha no banco, porque a coluna tem `UNIQUE KEY email`. Ainda assim, o perdedor da corrida pode receber 500 em vez de 409, porque a violação escapa de `catch (String)` (`store.kf:267`).

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
| 5 | Editar envelope | `EnvelopeController.java:51` `PUT /{id}` | `services.kf:193` (sem rota) | — | — | ❌ | Lógica pronta e segura por dono; falta `app.put` |
| 6 | Excluir envelope | `EnvelopeController.java:59` | `services.kf:205` → `store.kf:396` (sem rota) | — | — | ❌ | Falta a rota |
| 7 | Criar transação | `L/mod_transaction/controller/TransactionController.java:41` | `main.kf:186` → `services.kf:318` | TransactionRow + EnvelopeRow | E2E 20–21, 31–32; RST 5/11 | ⚠️ | Atômica e com valores em centavos. `createdAt` fixo `2026-09-18T12:00:00Z` (`services.kf:333`, #44) |
| 8 | Listar por categoria | `TransactionController.java:48` `GET /{category}` | `services.kf:360` (sem rota); existe `GET /api/transactions` (todas) em `main.kf:177` | — | E2E 22 (lista total) | ❌ | — |
| 9 | Limpar transações | `TransactionController.java:53` `DELETE` | `services.kf:372` (sem rota) | — | — | ❌ | — |
| 10 | Resumo por categoria | `TransactionController.java:59` `GET /summary` | — | — | — | ❌ | — |
| 11 | Dashboard | `TransactionController.java:75` `GET /dashboard` (JSON com categorias, % e transações) | `main.kf:203` `GET /api/dashboard` | — | E2E 28 | ⚠️ | Só o total é real. Categorias e transações são **texto fixo** (`main.kf:207`), num formato `a|b|c` e não JSON |
| 12 | Admin: listar usuários | `L/mod_user/controller/AdminController.java:35` | — | — | — | ❌ | Não há checagem de `Role.ADMIN` |
| 13 | Admin: migrar modelo | `AdminController.java:41` | `services.kf:228` (sem rota) | — | — | ❌ | Lógica portada (ver #32) |
| 14 | Onboarding | `L/mod_user/controller/OnboardingController.java:36` `/api/users/me/onboarding` | `main.kf:85` `/api/users/onboarding` | UserRow | E2E 16–17; RST 3/13 | ⚠️ | `debtAmount` não é lido nem gravado (`debtCents` fica 0). Aceita salário negativo (P7). Resposta em texto `a|b|c`, não JSON |
| 15 | Atualizar salário | `L/mod_user/controller/SalaryController.java:26` `PATCH /me/salary` | — | — | 404 (P5) | ❌ | Necessário para "Rever meu salário" (Configurações) |
| 16 | Status do plano | `L/mod_user/controller/TierStatusController.java:19` | `main.kf:210` | ChatMessageRow (contagem) | E2E 29 **FAIL** | ⚠️ | `messagesUsed` sempre 0 (#44) |
| 17 | Registrar renda variável | `L/mod_variable_income/controller/VariableIncomeController.java:29` | `main.kf:121` → `coach.kf:171` | VariableIncomeRow | E2E 26 | ✅ | Passa pelo `RegisterIncomeFunction`: texto com "salário"/"fixo" não grava, igual à tool do legado |
| 18 | Listar renda variável | `VariableIncomeController.java:36` | `main.kf:127` | VariableIncomeRow | E2E 27, 35 | ✅ | — |
| 19 | Chat de texto (coach) | `L/mod_ai_coach/controller/VoiceCommandController.java:121` `POST /api/coach/chat` | `main.kf:141` `POST /api/chat/message` | ChatMessageRow | E2E 25 | ⚠️ | **Sem LLM**: resposta fixa com o pulso. Sem tools, sem memória, sem `enforceCanSendMessage`. `createdAt` nulo |
| 20 | Voz (multipart → MP3) | `VoiceCommandController.java:89` `/api/coach/ai` | — | — | — | ❌ | Whisper (`language=pt`) + GPT + TTS `tts-1`/`nova` |
| 21 | Voz (base64) | `VoiceCommandController.java:97` `/api/coach/ai-base64` | — | — | — | ❌ | Devolvia 402 quando o limite do plano estourava |

### 2.2 Tools de IA (Spring AI `defaultToolNames`, `VoiceCommandController.java:35-37`)

| # | Item | Legado | Kof | Persistido | Testado | Status | Observação |
|---|---|---|---|---|---|---|---|
| 22 | GetBalance | `L/mod_ai_coach/service/GetBalanceFunction.java` | `coach.kf:97` | (leitura) | — | ⚠️ | Sem rota e sem teste. No caminho não-freelancer devolve `totalSpent=0.0, notAllocated=0.0` fixos (`coach.kf:162`) |
| 23 | GetDailyPulse | `GetDailyPulseFunction.java` | `coach.kf:75` + `main.kf:136` | (leitura) | E2E 15, 17, 24, 37; RST 9 | ⚠️ | Regra correta: `(salário − gasto)/dias`. Mas `daysRemaining=30` e início do mês fixos (`main.kf:137`) |
| 24 | RegisterIncome | `RegisterIncomeFunction.java` | `coach.kf:171` | VariableIncomeRow | E2E 26 | ✅ | — |
| 25 | SuggestModelChange | `SuggestModelChangeFunction.java` | `coach.kf:198` | — | — | ⚠️ | Sem rota nem tool |
| 26 | AnswerKakeiboReflection | `AnswerKakeiboReflectionFunction.java` | `coach.kf:225` | KakeiboReflectionRow | — | ⚠️ | Sem rota nem tool. Grava só a reflexão da semana; o cálculo de `weekStart` fica com quem chama |
| 27 | persistTransactionUseCase | `L/mod_transaction/service/PersistTransactionUseCase.java` | `services.kf:318` | TransactionRow | E2E 20 | ✅ | — |
| 28 | listTransactionsByCategoryUseCase | `ListTransactionsByCategoryUseCase.java` | `services.kf:360` | (leitura) | — | ⚠️ | Sem rota nem tool |
| 29 | getTotalByCategoryUseCase | `GetTotalByCategoryUseCase.java` | `services.kf:348` | (leitura) | — | ⚠️ | Sem rota nem tool |

### 2.3 Regras de domínio, agendamento e segurança

| # | Item | Legado | Kof | Persistido | Testado | Status | Observação |
|---|---|---|---|---|---|---|---|
| 30 | Sugestão de modelo (limiares de 3242 e 5000) | `L/mod_budget/service/BudgetModelSuggestionService.java` | `services.kf:122` | UserRow.budgetModel | E2E 16 (SURVIVAL) | ✅ | Condições idênticas, linha a linha |
| 31 | Planos 50/30/20, 70/20/10, 70/10/20, 80/20, Kakeibo e Base Zero | `BudgetModelPlanService.java` | `services.kf:142`, `:158` | — | E2E 16 | ✅ | Só o SURVIVAL é exercitado no E2E |
| 32 | Migração de modelo | `BudgetModelMigrationService.java` | `services.kf:228` | — | — | ⚠️ | Regras transcritas; nenhum chamador e nenhum teste |
| 33 | Média móvel do envelope | `EnvelopeService.java` (`calculateMovingAverage` devolve `ZERO`) | `services.kf:216` (devolve `0.0`) | — | — | ⚠️ | Paridade de um **stub**: a funcionalidade não existe em nenhum dos dois |
| 34 | Desconto do envelope | `EnvelopeService.updateSpent` | `store.kf:386` | EnvelopeRow | E2E 23; RST 10 | ✅ | Feito em centavos e na mesma transação do gasto |
| 35 | Destino da renda variável | `L/mod_variable_income/service/VariableIncomeService.java` | `services.kf:267` | VariableIncomeRow | E2E 26 | ⚠️ | Equivalente ao legado (meta ≤ 0 → orçamento), mas **não há rota para definir a meta de reserva**, então o destino é sempre o orçamento |
| 36 | Limites do plano (30 mensagens/mês; voz só no Premium) | `L/shared/service/TierEnforcementService.java` | `services.kf:386-413` | — | E2E 29 FAIL | ⚠️ | `enforce*` nunca é chamado (#44) |
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
| 47 | Usuário | `UserEntity` (+ `debtAmount`, `emergencyFundGoal`) | `UserRow` `:18` (`debtCents`, `emergencyGoalCents`) | ⚠️ | As colunas existem, mas nenhuma rota as preenche. Falta `name` (pedido pelo design; o Java também não tinha) |
| 48 | Transação | `TransactionEntity` (createdAt `Instant`) | `TransactionRow` `:35` | ⚠️ | `createdAt` fixo |
| 49 | Mensagem do chat | `ChatMessageEntity` | `ChatMessageRow` `:59` | ⚠️ | `createdAt` nulo |
| 50 | Reflexão Kakeibo | `KakeiboReflectionEntity` (answers `List`) | `KakeiboReflectionRow` `:76` (`answersJson`) | ⚠️ | Persistência sem rota e sem teste |
| 51 | Renda variável | `VariableIncomeEntity` (date) | `VariableIncomeRow` `:67` | ⚠️ | `date` nulo |
| 52 | Orçamento mensal | `L/mod_budget/model/BudgetEntity.java` | — | ❌ | No legado só existe o repositório, sem uso; avaliar se vale portar ou descartar |

**Contagem:** ✅ 12 · ⚠️ 24 · ❌ 16 (total 52).

## 3. Escopo do MVP 1 (design Desktop, com Mobile como espelho)

Fonte: os artefatos [Desktop](https://claude.ai/artifact/64FYjX5UiveVxTtRGYurQP) e [Mobile](https://claude.ai/artifact/8b3jFV4BrGj4YkDQAwDvDF), lidos nesta inspeção. O Desktop tem 13 telas. O Mobile acrescenta o campo "Valor total das dívidas" (Tela 6.1), o botão "+" no dashboard e o link "Ver histórico" por caixinha.

No frontend Kof existem só `frontend/main.kf`, `core/` (api_client, app_state, navigation, theme) e `components/` (brand_header, nav_bar). **Nenhuma tela foi implementada.**

| # | Tela / funcionalidade | Backend necessário | Status backend | Frontend | Status |
|---|---|---|---|---|---|
| 1 | Boas-vindas | servir os arquivos estáticos na mesma origem (F4) | ❌ | Tela 1 (#33) | ❌ |
| 2 | Login (+ "Esqueci a senha") | `POST /api/auth/login` ✅; recuperar senha | ⚠️ (recuperação de senha ausente; definir se é MVP 2) | #33 | ❌ |
| 3 | Cadastro (nome, sobrenome, e-mail, senha, confirmação) | register com `name` e validações (F1, F2) | ⚠️ | #33 | ❌ |
| 4–6.1 | Onboarding: salário, tipo de renda, dívida e valor da dívida | onboarding com `debtAmount`, validação e JSON (F2, F3) | ⚠️ | #33 | ❌ |
| 7 | Onboarding: gastos fixos e variáveis ("a IA cria as caixinhas") | **nova** criação de envelopes em lote a partir dos chips | ❌ | #33 | ❌ |
| 8 | Onboarding: resultado (modelo + buckets) | resposta JSON com modelo, descrição e buckets | ⚠️ (texto `a|b|c`) | #33 | ❌ |
| 9 | Dashboard (pulso, gastos do mês, reserva acumulada, pizza do modelo, últimas transações, Semana/Mês/Ano) | pulso com datas reais (#44); `GetBalance` exposto; reserva = soma de EMERGENCY_FUND; transações reais em JSON; filtro por período | ⚠️ (só total e pulso; datas fixas) | #32 | ❌ |
| 10 | Organiza AI (chat de texto, voz, upload de fatura PDF) | coach com LLM + tools + memória + limite freemium; voz (Whisper/TTS); leitura de PDF/imagem com confirmação; limite de 1 PDF/mês no Gratuito | ❌ (texto fixo) | #34 | ❌ |
| 11 | Caixinhas por bucket (status Em dia/Alerta/Estourada, nova caixinha, histórico) | envelopes com bucket; PUT/DELETE; histórico por envelope; limiares de 80% e 100% | ⚠️ (só criar e listar) | #11 | ❌ |
| 12 | Notificações (estouro, alerta, pulso, meta batida, lembrete; marcar como lidas) | **nova** entidade de notificação + geração por regra + rota para listar e marcar como lida | ❌ | #11 | ❌ |
| 13 | Configurações: tema | — (local) | n/a | — | ❌ |
| 13 | Configurações: e-mail/push diário às 20h | **novo**: preferências + job agendado + envio de e-mail | ❌ | — | ❌ |
| 13 | Configurações: rever salário (refaz o onboarding e migra o modelo) | `PATCH salary`/re-onboarding + `migrateBudgetModelIfNeeded` | ❌ | — | ❌ |
| 13 | Configurações: Open Finance "Demo · MVP 1" | demo/mock com 5 bancos (decisão de escopo) | ❌ | — | ❌ |
| 13 | Configurações: conta (e-mail, senha, 2FA) | marcado **MVP 2** no design | fora | — | fora |
| — | Sessão: `/api/users/me` (nome, e-mail, `onboardingCompleted`, tier) | F3 | ❌ | #33 | ❌ |

## 4. Roadmap

Ordem: primeiro o que derruba a produção, depois o que bloqueia o frontend, depois as funcionalidades. Estimativa relativa: P (≤1 dia), M (2–4 dias), G (>1 semana). Todo item de backend só fecha com **G-BUILD + G-BYTECODE + G-E2E + G-RESTART verdes em H2 e em MySQL 8.4 local**.

### Fase 0: Estabilidade de produção (bloqueia tudo)

| Item | Aceite verificável | Est. | Nível |
|---|---|---|---|
| ✅ 0.1 Reconexão ao banco (pool ou reabrir a conexão quando cair) | Probe P10: com o servidor no ar, `docker restart` do MySQL → próximo login = 200 sem reiniciar o app; G-RESTART 25/25 | M | avancado |
| 0.2 Transações isoladas por requisição | Teste com 20 POSTs `/api/transactions` em paralelo + 1 falha forçada: soma do envelope = soma das transações gravadas; nenhuma gravação órfã | M | avancado |
| 0.3 `sslMode=verify-full` com o CA da Aiven | Boot em produção recusa `trust`; teste local com certificado inválido falha no boot | P | intermediario |
| 0.4 Erros de entrada → 400 (inclui F2 §6) | `curl` com `{"email":`, `{bad`, `"salary":"abc"` → 400 `{"error":"Dados inválidos."}`; violação de unique no cadastro → 409, nunca 500 | P | intermediario |

**0.1 feito** (`fix(backend): reconexao ao banco e timeouts`). Antes de cada requisição, o middleware faz `SELECT 1` na conexão principal (`ensureDb`, `backend/store.kf`). Se o ping falhar, o backend abre uma conexão nova com as mesmas credenciais e fecha a antiga. A troca acontece com a única ficha de um `Channel<Int>` (`DbConn.lock`), para que duas requisições não reabram ao mesmo tempo. Com o banco fora, a rota responde **503** em vez de 500. Na URL do MySQL, o backend acrescenta `connectTimeout=5000&socketTimeout=10000`, que são parâmetros do MariaDB Connector/J 3.5. Os padrões do driver são 30000 ms e 0 (sem limite). No boot, uma falha sai com a mensagem "nao foi possivel conectar ao banco (esquema mysql)", sem URL, usuário ou senha. Evidência (MySQL 8.4 local, kof 0.6.3):

```
G-DB-BOUNCE  dddde36: login/envelopes = 500 por 60 s depois do `docker restart` (VERMELHO)
G-DB-BOUNCE  0.1:     503 em t=2,0 s → login 200 e envelopes 200 em t=6,1 s, mesmo processo
G-BOOT-DOWN  dddde36: IP sem resposta → exit=1 em 22,3 s, stack com "Socket fail to connect to 10.255.255.1"
G-BOOT-DOWN  0.1:     MySQL parado → exit=1 em 1,2 s; IP sem resposta → exit=1 em 6,1 s; senha no log: 0
G-E2E 37/38 (H2 e MySQL, só a #44) · G-RESTART 25/25 (H2 e MySQL) · VerifyAll 70 classes, 0 erros · LinkAll 102/102
```

### Fase 1: Retomada do batch 2 backend (F1 a F4)

O clone `%TEMP%\oa-f1` tem um commit local **não publicado** e não presente no repo (`2e34ffb feat(backend): nome no cadastro com migracao condicional da coluna`) e mais um diff não commitado (`backend/main.kf` +64/−10, `backend/models.kf` +52/−1). Decidir se ele será revisado e aproveitado ou refeito. Há também um container `oa-f1-mysql` daquela sessão ainda criado.

| Item | Aceite | Est. | Nível |
|---|---|---|---|
| F1 Coluna `name` + migração condicional + `hasSalary=false` | Cenários do design §2.6: banco novo, banco antigo e 2ª execução sem `ALTER` | M | intermediario |
| F2 Validações (spec §P1, itens 1–7) | 1 caso de E2E por linha da tabela, com status e corpo exatos | P | good first issue |
| F3 `debtAmount → debtCents` + `GET /api/users/me` + resposta do onboarding em JSON | `/me` antes e depois do onboarding; `debtcents` gravado no MySQL | P | intermediario |
| F4 Mesma origem (`serveDir`) + Dockerfile | G-AUTH-STATIC; `docker run` local com H2 servindo `/index.html` | M | intermediario |

### Fase 2: Datas reais e freemium (#44)

| Item | Aceite | Est. | Nível |
|---|---|---|---|
| `createdAt` real em todas as entidades; início do mês e `daysRemaining` vindos de `time.todayIso`/`time.daysInMonth` | E2E 29 verde; pulso muda conforme a data simulada; no MySQL as datas estão preenchidas | M | intermediario |
| `enforceCanSendMessage` no chat → 402 | 31ª mensagem do mês = 402 com a mensagem do legado | P | good first issue |

### Fase 3: Rotas que faltam (lógica já portada)

| Item | Aceite | Est. | Nível |
|---|---|---|---|
| PUT/DELETE envelope, listagem por categoria, total por categoria, limpar, dashboard em JSON real | E2E por rota, com IDOR (outro dono = 404) | M | good first issue |
| `PATCH /api/users/me/salary` + re-onboarding com `migrateBudgetModelIfNeeded` | Teste de cada regra de migração (6 transições) | M | intermediario |
| Meta de reserva de emergência (rota) + "reserva acumulada" no dashboard | Renda variável vai para EMERGENCY_FUND até bater a meta e depois para o orçamento (E2E) | P | intermediario |
| Admin (listar e migrar) com papel ADMIN | Usuário comum = 403 | P | intermediario |
| `GetBalance` exposto + correção de `totalSpent`/`notAllocated` | Valores por bucket batem com a soma das transações do mês | P | intermediario |

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
| 3 (#32) | 9 Dashboard | Fases 2 e 3 | M | intermediario |
| 4 (#34) | 10 Chat | Fase 4 (texto) e 5 (voz) | G | avancado |
| 4 (#11) | 11 Caixinhas, 12 Notificações | Fase 3 + entidade de notificação | G | intermediario |
| — | 13 Configurações (salário, preferências de e-mail, Open Finance demo) | Fase 3; job de e-mail; decisão de escopo do Open Finance | G | intermediario |
| 5 (#39, #40) | E2E full-stack, benchmarks, screenshots | todas | M | good first issue (#40) |

### Gates permanentes

G-BUILD, G-BYTECODE (VerifyAll/LinkAll), G-E2E e G-RESTART em H2 **e** MySQL 8.4 com `ANSI_QUOTES`, mais o probe de reconexão (P10) a partir da Fase 0. O CI está vermelho segundo a auditoria de 07/10; voltar a deixá-lo verde é pré-requisito para o merge de cada fase.

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
| Upload de fatura PDF | **MVP 1**: depende da Fase 4 (coach com LLM) e de medir leitura de PDF no Kof |
| Open Finance (demo) | **MVP 1**: tela demonstrativa, sem integração bancária real |
| Voz (Whisper + TTS) | **MVP 2** (Fase 5 sai do MVP 1) |
| Provedor de IA do coach | **OpenAI gpt-4o-mini**, como no legado; chave como variável secreta no Render |
| Chips da Tela 7 → caixinhas | **Regra fixa** de categoria para caixinha, sem IA |
| Commit `2e34ffb` do clone F1 | **Revisar e aproveitar**, passando pelos gates da Fase 1 |

Novos itens no roadmap: e-mail transacional (Fase 3, depois da estabilidade) e leitura de PDF (Fase 4).
