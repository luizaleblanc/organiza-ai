# PROJECT_STATUS.md -- Organiza IA

> Atualizado em: 02/09/2026
> Fase atual: 2 -- Desenvolvimento (backend e BFF concluídos, frontend KOF não iniciado)

## Estado do Backend (ATUAL)
- Java: 17
- Spring Boot: 3.3.13
- Spring AI: 1.0.8
- Build: Gradle
- Banco: MySQL (Aiven free tier)
- Auth: JWT + Spring Security + jjwt
- Redis: spring-boot-starter-data-redis adicionado (sem uso ainda)
- Docker: compose.yml para MySQL local
- Arquitetura: monólito modular (auth, user, transaction, budget, coach, notification, bankreader, shared)

## Estado do Frontend + BFF (ATUAL)
- BFF em KOF (`kof.web`, `bff/*.kf`): concluído -- health check, rotas públicas, middleware JWT, rotas protegidas e rota de tier-status.
- Frontend em KOF (`kof.ui`, `frontend/*.kf`): **NÃO INICIADO** -- nenhuma tela foi escrita ainda.
- Consulte `KOF_REFERENCE.md` e `KOF_WEB_REFERENCE.md` (raiz) antes de escrever qualquer código `.kf`.

## O que está concluído

### Backend
- [x] Auth (login/register com JWT, roles)
- [x] CRUD de transações
- [x] CRUD de envelopes
- [x] Salary (renda fixa) e onboarding com sugestão automática de modelo de orçamento
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

### Documentação
- [x] Todos os arquivos `.md` atualizados (README, CLAUDE.md, CONTRIBUTING.md, DATA_MODEL.md, ARCHITECTURE_DECISIONS.md, PROJECT_STATUS.md)

## O que está pendente

### Frontend KOF (kof.ui) -- NÃO INICIADO
- [ ] Onboarding
- [ ] Dashboard
- [ ] Chat
- [ ] Envelopes
- [ ] Configurações

### Melhorias futuras
- [ ] Flyway (substituir Hibernate `ddl-auto=update` por migrations versionadas)
- [ ] Kakeibo reflexivo (modelo de orçamento)
- [ ] Migração automática de modelo de orçamento
- [ ] Target Android (APK)

## Decisões tomadas
- Frontend + BFF em KOF (kof.ui / kof.web)
- Backend permanece Java/Spring Boot
- 6 modelos de orçamento adaptativos, selecionados automaticamente no onboarding
- Monetização: freemium (R$9,90/mês premium)
- Dashboard é a interface principal; entrada por voz é opcional
- Chat persistido no banco de dados, para continuidade do coach entre sessões
