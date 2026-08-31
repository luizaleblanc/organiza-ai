# PROJECT_STATUS.md -- Organiza IA

> Atualizado em: 31/08/2026
> Fase atual: 0 -- Foundation (nao iniciada)

## Estado do Backend (ATUAL)
- Java: 17
- Spring Boot: 3.3.13
- Spring AI: 1.0.8
- Build: Gradle
- Banco: MySQL (Aiven free tier)
- Auth: JWT + Spring Security + jjwt
- Redis: spring-boot-starter-data-redis adicionado (sem uso ainda)
- Docker: compose.yml para MySQL local
- Arquitetura: monolito modular (com.organiza.mod_auth, mod_user, mod_transaction, mod_budget, mod_ai_coach, shared) -- reestruturado a partir da Clean Architecture original (dio.budgeting.application/domain/infrastructure)

## Estado do Frontend + BFF (ATUAL)
- **DESCONTINUADO (2026-08-30): Next.js (`frontend-voice/`) como BFF, e Flutter como app mobile.** Ver DECISIONS.md ADR-015.
- Novo alvo: **KOF** (linguagem propria) -- `kof.ui` para o frontend (`frontend/*.kf`), `kof.web` para o BFF (`bff/*.kf`). Backend Java continua inalterado.
- `frontend-voice/` (Next.js) permanece no repo com deploy ativo no Vercel (dio-voice-assistant.vercel.app), mas SEM trabalho novo -- nao adicionar features nem manter alem do que ja existe. Destino final (arquivar/remover do repo) ainda nao decidido.
- Flutter: NUNCA foi iniciado (nenhum arquivo `.dart` chegou a ser criado) -- item removido do roadmap.
- Consulte `KOF_REFERENCE.md` (raiz) antes de escrever qualquer codigo `.kf`.

## Schema atual (tabelas existentes)
- users: id (String/UUID), email, password, role, salary (novo), tier (novo, default FREE)
- transactions: id (UUID), user_id (String), amount (long), category (enum 12 categorias), description, currency, bucket (novo, nullable), source (novo, default MANUAL)
- budgets (nova): id, user_id, month_year, salary, needs_limit, wants_limit, savings_limit, created_at -- unique (user_id, month_year)
- chat_messages (nova): id, user_id, role (USER/ASSISTANT), content, created_at

> Nota: users.id e transactions.user_id sao String (UUID), nao BIGINT como o SQL de exemplo do spec da Fase 0 sugere. As novas tabelas (budgets, chat_messages) foram adaptadas para usar user_id String, compativeis com o schema real, por decisao consciente (evitar migrar PKs existentes).
> Nota: os campos novos (salary/tier em UserEntity, bucket/source em TransactionEntity) existem apenas na camada de persistencia por enquanto -- ainda nao estao mapeados nas classes de dominio (User, Transaction) nem expostos em endpoints; isso e esperado para a Fase 1 (onboarding com salario, categorizacao).
> Migrations sao aplicadas via Hibernate `ddl-auto=update` (nao ha Flyway/Liquibase no projeto); ainda nao validado contra o MySQL real (Docker Desktop nao estava disponivel na sessao), apenas compileJava + testes com H2.

## Campos/tabelas que FALTAM
- envelopes (nova)
- transactions: envelope_id, status

## O que funciona HOJE
- [x] Auth (login/register com JWT, roles)
- [x] CRUD de transacoes (12 categorias)
- [x] Pipeline de voz: Whisper (STT) -> GPT-4o (tool calling) -> TTS
- [x] Tool calling: registerTransaction, getTotalByCategory
- [x] Dashboard basico (Recharts, grafico de pizza por categoria)
- [x] BFF com httpOnly cookie
- [x] Testes unitarios (JUnit 5 + Mockito)
- [x] Docker Compose para MySQL
- [x] Deploy funcional (Vercel + Aiven)
- [x] Modelos de orçamento adaptativos (BudgetModelType, IncomeType)
- [x] Endpoint de onboarding com sugestão de modelo
- [x] Tool calling atualizado (registerIncome, suggestModelChange)
- [x] System prompt anti-alucinação
- [x] Rotas BFF para onboarding e renda
- [x] Documentação atualizada (README, DATA_MODEL, CONTRIBUTING, CLAUDE.md)

## O que falta (por fase)
- [x] FASE 0 (back-end): Modularizar backend, upgrade Spring Boot/AI, Redis, migrations -- **back-end 100% concluido**
- [ ] FASE 0 (frontend/BFF): scaffold KOF (`frontend/`, `bff/`) -- checklist original pedia Flutter + rota Next.js; reescrever para KOF (ver DECISIONS.md ADR-015)
- [ ] FASE 1: Chat KOF (texto), pulso diario, onboarding com salario, budget 50/30/20
- [ ] FASE 2: Dashboard KOF, envelopes, remanejamento
- [ ] FASE 3: Voz no KOF, leitura de notificacoes bancarias
- [ ] FASE 4: Insights semanais, simulador, push notifications (FCM)
- [ ] FASE 5: Paywall, RevenueCat (ou equivalente), rate limiting (Redis)

> Nota: os specs em `specs/PHASE_X_*.md` ainda descrevem os itens de frontend/BFF em termos de Flutter/Next.js -- tratar como desatualizado para essas partes (ver DECISIONS.md ADR-015); os itens de back-end desses specs continuam valendo como estao escritos.

## Decisoes tomadas
- Frontend + BFF em KOF (kof.ui / kof.web) -- substitui Flutter e Next.js (ADR-015, 2026-08-30)
- Manter monolito modular (nao microsservicos)
- Modelo de negocio: hibrido 50/30/20 + Envelopes
- Posicionamento: "Coach de Bolso" (IA conversacional first)
- Monetizacao: freemium (R$9,90/mes premium)
- Entrada de dados: manual + voz + leitura de notificacoes bancarias
- Sem Open Finance (barreira de entrada zero)

## Blockers atuais
- Upgrade de Spring AI de M1 para versao estavel pode ter breaking changes
- Apple Developer Program ($99/ano) necessario para iOS
