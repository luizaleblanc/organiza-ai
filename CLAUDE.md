# CLAUDE.md -- Organiza IA

## Projeto
Coach financeiro com IA conversacional. Mobile-first (Flutter).
O usuario informa o salario, registra gastos via chat natural, e recebe orientacao financeira proativa.
Modelo: hibrido 50/30/20 + Envelopes personalizaveis. Monetizacao freemium.

## Stack
- Backend: Java 17, Spring Boot 3.3.x, Spring AI, MySQL, Redis
- Mobile: Flutter/Dart, Clean Architecture (presentation/domain/data)
- BFF: Next.js 16 (App Router), TypeScript, Tailwind CSS v4
- IA: GPT-4o-mini via Spring AI tool calling
- Voz: Whisper API (feature secundaria)
- Build: Gradle (./gradlew)

## Comandos
- Rodar backend: `./gradlew bootRun`
- Testes: `./gradlew test`
- Build: `./gradlew build`
- Rodar frontend: `cd frontend-voice && npm run dev`

## Arquitetura Backend (Monolito Modular)

Reestruturado a partir da Clean Architecture original (application/domain/infrastructure):

```
src/main/java/com/organiza/
  shared/              # Config global, security, exceptions
  auth/                # Login, register, JWT
  user/                # Profile, salary, tier
  transaction/         # CRUD transacoes, categorizacao
  budget/              # Budgets mensais, envelopes, pulso diario
  coach/               # Chat com IA, tool calling, system prompts
  notification/        # FCM push notifications (Fase 4)
  bankreader/          # Parser de notificacoes bancarias (Fase 3)
```

Cada modulo contem: `controller/`, `service/`, `entity/`, `repository/`, `dto/`

## Arquitetura Flutter
```
lib/
  core/              # Tema, DI (get_it), interceptors (dio), constantes
  features/
    onboarding/      # Tela de salario
    chat/            # Chat principal + pulso diario
    dashboard/       # Barras de progresso, resumo mensal
    envelopes/       # CRUD envelopes, detalhe
    history/         # Lista de transacoes
    insights/        # Insights semanais, simulador
    settings/        # Configuracoes, perfil, paywall
  shared/            # Widgets reutilizaveis, extensions
```

Cada feature: `presentation/` (pages, widgets, bloc), `domain/` (entities, usecases), `data/` (repositories, datasources, models)

## Convencoes
- Backend: records para DTOs, JPA annotations em entities, constructor injection
- Flutter: BLoC pattern (flutter_bloc), GoRouter, dio para HTTP
- Commits: `feat(modulo): descricao` | `fix(modulo): descricao`
- Testes: JUnit 5 + Mockito (backend), flutter_test + mocktail (mobile)
- Sem Lombok (usar records do Java 17)
- Valores monetarios: BigDecimal no backend, double no Flutter
- Formato display: "R$ X.XXX,XX"

## Fase Atual
Consulte `specs/PHASE_X_*.md` para escopo da fase em andamento.
Consulte `PROJECT_STATUS.md` para estado atual do projeto.
Consulte `DECISIONS.md` para o historico de decisoes arquiteturais e de negocio (o "porque" por tras de cada escolha).

## Regras Inviolaveis
1. NAO implemente nada fora do escopo da fase atual
2. Siga os contratos de API do spec EXATAMENTE como definidos
3. Crie teste para cada criterio de aceite listado no spec
4. Atualize PROJECT_STATUS.md ao concluir cada feature
5. Separe commits por modulo
6. Frontend NAO faz logica de negocio -- dados vem prontos da API
7. IA responde SEMPRE em pt-BR
8. Build tool e GRADLE, nao Maven
9. Atualize DECISIONS.md sempre que uma decisao arquitetural ou de negocio for tomada -- ao concluir cada fase e a cada commit relevante que envolva essas escolhas (nao apenas no fim da fase). Nunca apague uma entrada antiga: decisoes supersedidas ganham nota "Supersedida por ADR-XXX", preservando o historico do porque.
10. Antes de QUALQUER commit, confira que nada de `.claude/`, skills/agents do Claude Code (ex.: `organiza-ia-skills/`), `node_modules/`, `build/`, `.gradle/` ou outro arquivo pesado/gerado esta sendo staged (`git status` apos `git add`, nunca `git add -A`/`git add .` sem checar). Isso e regra rigida, nao preferencia -- o historico do repo ja teve `node_modules/` commitado por engano uma vez (ver DECISIONS.md) e nao pode se repetir.
11. Historias grandes (uma fase inteira, uma feature com varias partes moveis) sempre viram varios commits pequenos e descritivos, um por modulo/assunto coeso -- nunca um commit unico "faz tudo". Ao propor commits para o usuario, já entregue a lista separada por modulo/assunto, na ordem em que devem ser aplicados.
