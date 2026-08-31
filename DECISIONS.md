# DECISIONS.md — Organiza IA

> Log de decisões arquiteturais e de negócio (ADR - Architecture/business Decision Records).
> Cada entrada documenta uma decisão que afeta o ciclo de vida do software: por que foi tomada, quais alternativas existiam, e quais as consequências (o que fica mais fácil, o que fica mais difícil, o que fica pendente).
>
> **Regra de manutenção:** este arquivo é atualizado a cada commit relevante e ao final de cada fase (`specs/PHASE_X_*.md`). Toda decisão nova ganha uma entrada; decisões supersedidas são marcadas como tal, nunca apagadas — preserva-se o histórico do porquê.

Formato de cada entrada:

```
## ADR-NNN: Título da decisão
- Data: AAAA-MM-DD
- Status: Aceita | Supersedida por ADR-XXX | Em revisão
- Contexto: por que essa decisão precisou ser tomada
- Decisão: o que foi decidido
- Alternativas consideradas: o que mais foi avaliado e por que foi descartado
- Consequências: o que essa decisão facilita, o que dificulta, o que fica em aberto
```

---

## ADR-001: Modelo de negócio híbrido 50/30/20 + Envelopes
- Data: 2026 (decisão de produto, anterior ao início do rastreamento formal deste log)
- Status: Aceita
- Contexto: o app precisa de um método de orçamento que seja simples o suficiente para onboarding rápido, mas flexível para diferentes perfis financeiros.
- Decisão: adotar o modelo híbrido regra 50/30/20 (necessidades/desejos/poupança) combinado com Envelopes personalizáveis dentro de cada categoria.
- Alternativas consideradas: orçamento 100% livre (sem estrutura, mais difícil de dar orientação proativa); só 50/30/20 rígido (menos flexível para usuários com categorias atípicas).
- Consequências: exige que toda transação seja capaz de ser associada a um `bucket` (NEEDS/WANTS/SAVINGS) e opcionalmente a um envelope. Ver ADR-006 (schema de budgets/transactions).

## ADR-002: Mobile-first com Flutter; Next.js mantido como BFF
- Data: 2026 (decisão de produto)
- Status: **Supersedida por ADR-015** (2026-08-30) — frontend e BFF passam a ser KOF, não Flutter/Next.js.
- Contexto: o produto original nasceu como app de voz com frontend Next.js. A visão de produto evoluiu para "coach de bolso" mobile-first.
- Decisão: Flutter é a plataforma principal (app mobile). O Next.js existente não é descontinuado — passa a atuar como BFF (Backend-for-Frontend), incluindo autenticação mobile via `/api/auth/mobile` (JWT bearer, sem cookie).
- Alternativas consideradas: reescrever tudo em Flutter incluindo o papel do BFF (descartado — o Next.js já resolve auth web e não há necessidade de duplicar); manter só a versão web (descartado — a visão de produto é conversacional e proativa, que pede notificações push e presença constante, natural em mobile).
- Consequências: dois clientes (Flutter mobile + Next.js web) consumindo a mesma API Java. A API precisa suportar dois modos de autenticação (cookie httpOnly para web, bearer token para mobile). **Nenhum código Flutter chegou a ser criado** — a troca para KOF aconteceu ainda durante a Fase 0, antes do scaffold do app mobile.

## ADR-003: Monolito modular (não microsserviços)
- Data: 2026 (decisão de produto/arquitetura)
- Status: Aceita
- Contexto: o backend precisa crescer (auth, user, transaction, budget, coach de IA, notification, bankreader) sem a complexidade operacional de orquestrar múltiplos serviços para um produto ainda em validação de mercado.
- Decisão: manter um monolito modular. Pacotes por domínio (`mod_auth`, `mod_user`, `mod_transaction`, `mod_budget`, `mod_ai_coach`), cada um com suas próprias camadas (`controller/service/repository/dto/model`), mas um único deploy.
- Alternativas consideradas: microsserviços (descartado — overhead de infra desnecessário nesta fase, sem necessidade de escalar módulos de forma independente ainda).
- Consequências: reestruturação de pacotes é necessária (Fase 0) migrando de `dio.budgeting` (Clean Architecture por camada técnica: `application/domain/infrastructure`) para `com.organiza.mod_*` (por domínio). Essa migração ainda está pendente — ver seção "Pendências" no PROJECT_STATUS.md.

## ADR-004: Monetização freemium (R$9,90/mês premium)
- Data: 2026 (decisão de produto)
- Status: Aceita
- Contexto: o produto precisa de um caminho de monetização sustentável sem barreira de entrada alta.
- Decisão: modelo freemium, com tier `FREE`/`PREMIUM` por usuário. Paywall e integração RevenueCat ficam para a Fase 5.
- Alternativas consideradas: modelo pago único (descartado — barreira de entrada alta prejudica adoção); ads (descartado — não combina com posicionamento de "coach financeiro de confiança").
- Consequências: `users.tier` precisa existir desde já no schema (adicionado na Fase 0, ver ADR-006) mesmo sem lógica de paywall ainda implementada, para não exigir uma segunda migração de schema na Fase 5.

## ADR-005: Entrada de dados manual + voz + leitura de notificações bancárias; sem Open Finance
- Data: 2026 (decisão de produto)
- Status: Aceita
- Contexto: Open Finance exige integração regulatória complexa e permissão explícita do usuário junto ao banco, o que aumenta a fricção de onboarding.
- Decisão: três formas de entrada de dados — manual (chat/formulário), voz (Whisper), e leitura de notificações push bancárias (parsing local, Fase 3). Nenhuma integração direta com Open Finance.
- Alternativas consideradas: Open Finance nativo (descartado por ora — fricção de onboarding e tempo de integração incompatíveis com o estágio do produto).
- Consequências: `transactions.source` (MANUAL/VOICE/BANK_NOTIFICATION) existe desde a Fase 0 para já contemplar as três origens quando o parser de notificações (`bankreader/`) for implementado na Fase 3.

## ADR-006: Schema de budgets/chat_messages com `user_id` como String (UUID), não BIGINT
- Data: 2026-08-29
- Status: Aceita
- Contexto: o spec `PHASE_0_FOUNDATION.md` descreve o modelo de dados de `budgets` e `chat_messages` assumindo `users.id BIGINT` (`FOREIGN KEY (user_id) REFERENCES users(id)` com tipo implícito BIGINT). O `UserEntity` real do projeto usa `id` como `String` (UUID gerado em `User(email, password)`), assim como `TransactionEntity.userId`.
- Decisão: adaptar as novas tabelas (`budgets`, `chat_messages`) para usar `user_id` do tipo `VARCHAR`/`String`, compatível com o schema real, em vez de migrar `users.id` para `BIGINT`.
- Alternativas consideradas: migrar `users.id` (e todas as FKs dependentes) para `BIGINT` conforme o spec ao pé da letra — descartada por ser uma mudança de maior risco, capaz de invalidar tokens JWT e dados já persistidos em produção (Aiven), sem ganho funcional correspondente nesta fase.
- Consequências: o spec de fases futuras que citar `user_id BIGINT` deve ser lido como "tipo compatível com `users.id`" (hoje String/UUID). Se um dia a equipe decidir migrar para ID numérico, será uma migração de dados dedicada, não um efeito colateral de uma feature nova.

## ADR-007: Colunas novas de schema (salary/tier, bucket/source) só na camada de persistência por enquanto
- Data: 2026-08-29
- Status: Aceita
- Contexto: a Fase 0 exige que as colunas `salary`, `tier` (em `users`) e `bucket`, `source` (em `transactions`) já existam no banco, mas a lógica de negócio que as usa (onboarding com salário, categorização automática em buckets) é escopo da Fase 1, fora do escopo da Fase 0 ("Fora de Escopo: Chat com IA").
- Decisão: os campos foram adicionados apenas nas entidades JPA (`UserEntity`, `TransactionEntity`), sem alterar as classes de domínio (`User`, `Transaction`) nem expor nos endpoints existentes. `tier` tem default `FREE`, `source` tem default `MANUAL`, `bucket` e `salary` ficam nulos até a Fase 1 preenchê-los.
- Alternativas consideradas: já mapear os campos nas classes de domínio (`User`, `Transaction`) e nos DTOs de resposta — descartada por antecipar lógica de negócio (onboarding, categorização) que pertence à Fase 1, violando a regra "não implemente nada fora do escopo da fase atual".
- Consequências: a Fase 1 precisa lembrar de: (1) mapear `salary`/`tier` no domínio `User` e no fluxo de onboarding; (2) mapear `bucket` no domínio `Transaction` e na lógica de categorização 50/30/20.

## ADR-008: Migrations via Hibernate `ddl-auto=update`, sem Flyway/Liquibase
- Data: 2026-08-29
- Status: Em revisão
- Contexto: o projeto não usa uma ferramenta de migração versionada (Flyway/Liquibase); o schema é gerado automaticamente pelo Hibernate a partir das entidades JPA (`spring.jpa.hibernate.ddl-auto=update`). As "migrations" da Fase 0 (novas colunas/tabelas) foram implementadas como mudanças nas entidades, e o Hibernate aplica o DDL correspondente ao subir a aplicação.
- Alternativas consideradas: introduzir Flyway/Liquibase agora — descartada nesta fase para não expandir escopo além do que o spec pediu; manter o padrão já estabelecido no projeto.
- Consequências: **risco conhecido** — `ddl-auto=update` não é recomendado para produção (não há histórico de migrações, rollback é manual, e alterações destrutivas de coluna não são aplicadas automaticamente). Esta decisão deve ser revisitada antes do primeiro deploy com dados reais de usuários pagantes (Fase 5, monetização). Sugestão: introduzir Flyway com baseline do schema atual quando a Fase 5 se aproximar.
- Validação pendente: as migrations desta sessão foram validadas via `./gradlew compileJava` e `./gradlew test` (H2 em memória); não foram validadas contra o MySQL real (Aiven ou local via Docker) por indisponibilidade do Docker Desktop na sessão de 2026-08-29.

## ADR-009: Upgrade Spring Boot 3.2.5 → 3.3.13 e Spring AI 1.0.0-M1 → 1.0.8
- Data: 2026-08-29
- Status: Aceita
- Contexto: a Fase 0 pede upgrade para Spring Boot 3.3.x e Spring AI estável (1.0.0+). O projeto estava em uma milestone (M1) do Spring AI, com risco de breaking changes documentado desde antes desta sessão (ver "Blockers" no PROJECT_STATUS.md).
- Decisão: Spring Boot 3.3.13 (última patch da série 3.3, hoje EOL open-source — ver nota abaixo) e Spring AI 1.0.8 (última patch estável da série 1.0.x, compatível com Spring Boot 3.3+/3.4+/3.5+).
- Alternativas consideradas: Spring Boot 3.5.x (mais recente e com suporte OSS ativo) — descartada por ora porque o spec da Fase 0 pede explicitamente "3.3.x"; Spring AI 1.1.x (mais recente) — descartada por ora porque o spec pede "1.0.0+", e a série 1.0.x é a linha de manutenção mais conservadora.
- Consequências: **nota de manutenção** — Spring Boot 3.3.x atingiu fim do suporte open-source em 2025-06-19 (última patch: 3.3.13). Rodar em produção nessa série sem suporte comercial da Broadcom é um risco a reavaliar quando a Fase 0 estiver concluída (possível ADR futuro sugerindo pular para 3.5.x). A API de áudio/chat memory do Spring AI mudou entre M1 e 1.0.8 (`InMemoryChatMemory` → `MessageWindowChatMemory` + `InMemoryChatMemoryRepository`; `AudioTranscriptionPrompt` mudou de pacote; builders perderam o prefixo `with`; `defaultFunctions` → `defaultToolNames`) — `VoiceCommandController` foi ajustado para compilar contra a nova API.

## ADR-010: Redis adicionado à Fase 0 sem uso funcional ainda
- Data: 2026-08-29
- Status: Aceita
- Contexto: o spec da Fase 0 pede a dependência `spring-boot-starter-data-redis`, mas o uso funcional de Redis (rate limiting) é escopo da Fase 5.
- Decisão: adicionar apenas a dependência Gradle nesta fase. Nenhuma configuração de conexão, cache ou rate limiter foi implementada — o Redis autoconfigura com defaults (`localhost:6379`) e conecta de forma lazy (não bloqueia testes nem o boot da aplicação na ausência de um servidor Redis).
- Alternativas consideradas: adiar a dependência até a Fase 5 — descartada porque contraria o checklist explícito da Fase 0.
- Consequências: a Fase 5 precisa configurar `spring.data.redis.host`/`port` (provavelmente via variável de ambiente, seguindo o padrão já usado para MySQL) antes de implementar rate limiting de fato.

## ADR-011: Historico do git com node_modules/ antigo não será reescrito
- Data: 2026-08-29
- Status: Aceita
- Contexto: uma auditoria da árvore de commits encontrou que `node_modules/` (incluindo `chart.js`, com arquivos de até ~1MB) foi commitado em algum momento do histórico do frontend e depois removido da árvore atual — mas os blobs continuam no histórico do git, já publicado em `github.com:luizaleblanc/organiza-ai`. A árvore atual (working tree) está limpa: `.claude/`, `organiza-ia-skills/`, `node_modules/`, `build/` já constam no `.gitignore` e nada disso está rastreado hoje.
- Decisão: não reescrever o histórico (via `git filter-repo`/BFG) para purgar esses blobs antigos agora. O `.git` está em ~2,1MB, não crítico. A regra de "nunca commitar arquivo pesado/gerado" passa a ser aplicada rigidamente **a partir de agora** (ver Regra Inviolável 10 no CLAUDE.md), não retroativamente.
- Alternativas consideradas: reescrever o histórico com `git filter-repo` e forçar push — descartada por ser destrutiva (reescreve todos os hashes de commit) sem benefício proporcional ao tamanho atual do problema (2,1MB).
- Consequências: se o repositório crescer muito no `.git` no futuro (ex.: novos arquivos binários grandes acumulando), este ADR deve ser revisitado — reescrever o histórico fica mais caro quanto mais tempo passar (mais commits depois dos blobs problemáticos).

## ADR-012: Reestruturação de pacotes para monolito modular (`dio.budgeting` → `com.organiza.mod_*`/`shared`)
- Data: 2026-08-29
- Status: Aceita
- Contexto: o spec da Fase 0 pede a migração do backend de Clean Architecture por camada técnica (`dio.budgeting.{application,domain,infrastructure}`) para um monolito modular por domínio (`com.organiza.mod_auth`, `mod_user`, `mod_transaction`, `mod_budget`, `mod_ai_coach`), cada um com `controller/service/repository/dto/model`. O spec não menciona explicitamente onde ficam componentes cross-cutting (configuração REST, filtro/config de segurança, exception handler global) — só o CLAUDE.md, na árvore-alvo completa do projeto, cita um pacote `shared/` para isso.
- Decisão: criar `com.organiza.shared` para os componentes que não pertencem a nenhum módulo de domínio específico: `RestClientConfig` (config), `GlobalExceptionHandler` (exception), `SecurityConfigurations`/`SecurityFilter`/`AuthenticatedUser`/`CurrentUserService` (security). `TokenService` e `AuthorizationService` foram para `mod_auth/service` por serem lógica específica de autenticação (geração/validação de token, `UserDetailsService`), não infraestrutura genérica. O endpoint de voz (`VoiceCommandController`, hoje em `/transactions/ai*`) foi movido para `mod_ai_coach/controller`, mantendo o path HTTP inalterado (mudança de pacote é interna, não é contrato de API). A classe principal (`BudgetingApplication`) moveu para a raiz `com.organiza` para manter o component-scan cobrindo todos os módulos.
- Alternativas consideradas: colocar `TokenService`/`AuthorizationService`/`SecurityFilter`/etc. todos dentro de `mod_auth` (sem `shared`) — descartada porque `CurrentUserService` e `AuthenticatedUser` são consumidos por múltiplos módulos (`mod_transaction`, futuramente `mod_budget`) para identificar o usuário autenticado, e não fazem sentido como dependência de um módulo de domínio para outro; renomear a classe principal e o `group`/`description` do `build.gradle` (de `dio`/`budgeting` para algo com "organiza") — descartada por não estar no escopo pedido pelo spec (só pacotes Java, não metadados do Gradle).
- Consequências: mudança puramente mecânica de namespace — nenhum comportamento, contrato de API ou schema de banco foi alterado. Validada com `./gradlew compileJava` e `./gradlew test` (todas as 6 classes de teste, mesmas asserções, passando). Feita como commit único (ver Regra Inviolável 11 no CLAUDE.md) por ser uma renomeação atômica onde estados intermediários não compilariam sem pacotes-ponte descartáveis.

## ADR-013: Back-end sempre finalizado antes do front-end/BFF, fase a fase
- Data: 2026-08-29
- Status: Aceita
- Contexto: os specs de fase intercalam itens de back-end (Java) e front-end (Flutter)/BFF (Next.js) na mesma fase (ex.: Fase 0 tem tanto reestruturação de packages quanto scaffold Flutter e rota `/api/auth/mobile`). Sem uma regra explícita de ordem, haveria risco de começar trabalho de front-end com contratos de API do back-end ainda instáveis.
- Decisão: dentro de cada fase, todo item de back-end do checklist é concluído antes de iniciar qualquer item de front-end (Flutter) ou do BFF (Next.js) daquela mesma fase.
- Alternativas consideradas: trabalhar back-end e front-end em paralelo dentro da mesma fase — descartada pelo risco de retrabalho no front-end caso o contrato de API mude durante o desenvolvimento do back-end.
- Consequências: a rota `/api/auth/mobile` do BFF só foi implementada depois que todos os itens de back-end da Fase 0 (packages, Spring Boot/AI, Redis, migrations) estavam concluídos e validados. O scaffold Flutter é o último item da Fase 0, por ser puramente front-end.

## ADR-014: Rota `/api/auth/mobile` valida por build+lint, não end-to-end
- Data: 2026-08-29
- Status: **Supersedida por ADR-015** (2026-08-30) — a rota foi revertida (nunca commitada) porque o BFF passou a ser KOF (`kof.web`), não Next.js.
- Contexto: a rota `/api/auth/mobile` (Next.js) delega para `POST {API_BASE_URL}/auth/login` no backend Java e devolve `{ token }` no corpo da resposta, sem setar cookie — espelhando o padrão já usado em `loginBFF` (`frontend-voice/src/app/actions/auth.ts`), que seta cookie httpOnly. Testar de ponta a ponta exigiria backend Java + MySQL rodando (via Docker), indisponível nesta sessão.
- Decisão: validar a rota apenas com `npm run lint` e `npm run build` (que inclui checagem de tipos TypeScript e confirma a rota registrada em `Route (app)`), sem chamada real contra o backend.
- Alternativas consideradas: subir Docker Desktop + `./gradlew bootRun` + `npm run dev` para um teste manual real — descartada por indisponibilidade de Docker nesta sessão; o padrão de código é idêntico ao de uma rota já testada em produção (`loginBFF`), reduzindo o risco.
- Consequências: a rota chegou a ser implementada e validada por build+lint, mas nunca foi commitada — foi removida do working tree assim que o ADR-015 definiu o BFF como KOF. O equivalente em `kof.web` (rota de login mobile) fica como item pendente da Fase 0.

## ADR-015: Frontend e BFF migram para KOF (kof.ui/kof.web), substituindo Flutter e Next.js
- Data: 2026-08-30
- Status: Aceita
- Contexto: KOF é uma linguagem própria (compilada para JVM, com alvo KofJS para UI via webview) desenvolvida no âmbito do curso/produto Melissa/KofLang. O usuário decidiu adotar o Organiza IA como app de referência dessa linguagem, substituindo tanto o plano de app mobile em Flutter (ADR-002, ainda não iniciado) quanto o BFF em Next.js (`frontend-voice/`, existente e com deploy ativo no Vercel).
- Decisão: todo trabalho novo de UI é em `.kf` usando `kof.ui` (`frontend/`), e todo trabalho novo de BFF é em `.kf` usando `kof.web` (`bff/`). O backend Java/Spring Boot permanece inalterado (KOF não o substitui). `frontend-voice/` (Next.js) é descontinuado — nenhum trabalho novo acontece nele; o rota `/api/auth/mobile` que havia sido implementada ali (ADR-014) foi revertida antes de ser commitada.
- Alternativas consideradas: manter Next.js como BFF e adicionar KOF só para o app mobile (ADR-002 original) — descartada pelo usuário em favor de uma stack única (KOF) para frontend+BFF; manter Flutter para o app mobile — descartada pelo mesmo motivo.
- Consequências: `specs/PHASE_X_*.md` ainda referenciam Flutter/Next.js em alguns pontos — essas referências devem ser tratadas como desatualizadas para front-end/BFF; os itens de back-end desses specs continuam válidos. `KOF_REFERENCE.md` (raiz do projeto) é a referência técnica para escrever código `.kf` corretamente. Falta ainda: (1) decidir o que fazer fisicamente com `frontend-voice/` (arquivar, remover do repo, ou deixar rodando em produção sem manutenção — não decidido nesta sessão); (2) reescrever os itens de front-end/BFF pendentes da Fase 0 (antes "scaffold Flutter" e rota `/api/auth/mobile` em Next.js) como seus equivalentes KOF.

## ADR-016: Health check de Redis desabilitado (`management.health.redis.enabled=false`)
- Data: 2026-08-31
- Status: Aceita
- Contexto: incidente de produção em 2026-08-31 -- o serviço MySQL na Aiven foi automaticamente desligado (`powered off`) por inatividade/expiração do trial, causando `UnknownHostException` no backend no Render (o hostname da Aiven parou de resolver). Depois de reativar a Aiven e o Render reconectar ao banco, `/actuator/health` continuou retornando `503 DOWN`. Causa: a dependência `spring-boot-starter-data-redis` (adicionada na Fase 0, ADR-010, sem uso funcional ainda) traz um health indicator automático que tenta conectar em `localhost:6379` -- inexistente no ambiente do Render -- e derruba o status agregado de saúde mesmo com o banco de dados saudável.
- Decisão: desabilitar explicitamente o health indicator do Redis (`management.health.redis.enabled=false` em `application.properties`) até que a Fase 5 (rate limiting, ADR-010) de fato provisione um Redis funcional em produção.
- Alternativas consideradas: provisionar um Redis real agora só para o health check passar -- descartada por ser trabalho/custo antecipado sem necessidade funcional (Redis não é usado por nenhuma feature ainda); remover a dependência do Redis do `build.gradle` -- descartada porque ela já está prevista para a Fase 5, reintroduzi-la depois seria retrabalho.
- Consequências: `/actuator/health` volta a refletir só o que importa hoje (conectividade com o banco). Quando a Fase 5 configurar um Redis real, esta flag deve ser removida (ou setada para `true`) para o health check voltar a cobri-lo.

## ADR-017: Sem cronjob de ping real -- README descrevia algo que não existia
- Data: 2026-08-31
- Status: Em revisão
- Contexto: o mesmo incidente de 2026-08-31 expôs que o README promete "MySQL no Render (modelo relacional) com cronjob de ping para estabilidade contínua", mas nenhum cronjob de ping existe no repositório ou em configuração externa conhecida -- provavelmente a causa raiz de o serviço Aiven ter sido desligado por inatividade.
- Decisão: criar um workflow do GitHub Actions (gratuito, sem infraestrutura adicional) que faz `GET` periódico em `/actuator/health` da URL de produção no Render, para manter o backend (e por consequência as conexões ativas ao banco) sem ficar ocioso tempo suficiente para provocar desligamento automático.
- Alternativas consideradas: serviço externo de uptime monitoring (UptimeRobot, cron-job.org) -- descartado por ora em favor de manter tudo dentro do próprio repositório GitHub, sem depender de outra conta/serviço externo.
- Consequências: reduz o risco de o Aiven (ou o próprio Render, que também hiberna serviços free por inatividade) desligar de novo por falta de tráfego. Não elimina o risco de expiração de trial/plano -- ver ADR-016 sobre a necessidade de confirmar que a instância Aiven está no plano Free permanente, não em um trial com crédito limitado.
