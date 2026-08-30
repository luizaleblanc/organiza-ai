# PROJECT_STATUS.md -- Organiza IA

> Atualizado em: 29/08/2026
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
- Arquitetura: Clean Architecture (application/domain/infrastructure)
- Modulos pendentes: reestruturacao para monolito modular

## Estado do Frontend (ATUAL)
- Next.js 16 (App Router), TypeScript, Tailwind CSS v4
- BFF com cookie httpOnly
- Telas: splash, login/cadastro, gravacao de voz, dashboard (grafico pizza Recharts)
- Deploy: Vercel (dio-voice-assistant.vercel.app)

## Estado do Flutter
- NAO INICIADO

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

## O que falta (por fase)
- [ ] FASE 0: Modularizar backend, upgrade Spring Boot/AI, scaffold Flutter, migrations
- [ ] FASE 1: Chat mobile (texto), pulso diario, onboarding com salario, budget 50/30/20
- [ ] FASE 2: Dashboard Flutter, envelopes, remanejamento
- [ ] FASE 3: Voz no mobile, leitura de notificacoes bancarias
- [ ] FASE 4: Insights semanais, simulador, push notifications (FCM)
- [ ] FASE 5: Paywall, RevenueCat, rate limiting (Redis)

## Decisoes tomadas
- Mobile-first com Flutter (Next.js mantido como BFF)
- Manter monolito modular (nao microsservicos)
- Modelo de negocio: hibrido 50/30/20 + Envelopes
- Posicionamento: "Coach de Bolso" (IA conversacional first)
- Monetizacao: freemium (R$9,90/mes premium)
- Entrada de dados: manual + voz + leitura de notificacoes bancarias
- Sem Open Finance (barreira de entrada zero)

## Blockers atuais
- Upgrade de Spring AI de M1 para versao estavel pode ter breaking changes
- Apple Developer Program ($99/ano) necessario para iOS
