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
- Status: Aceita
- Contexto: o produto original nasceu como app de voz com frontend Next.js. A visão de produto evoluiu para "coach de bolso" mobile-first.
- Decisão: Flutter é a plataforma principal (app mobile). O Next.js existente não é descontinuado — passa a atuar como BFF (Backend-for-Frontend), incluindo autenticação mobile via `/api/auth/mobile` (JWT bearer, sem cookie).
- Alternativas consideradas: reescrever tudo em Flutter incluindo o papel do BFF (descartado — o Next.js já resolve auth web e não há necessidade de duplicar); manter só a versão web (descartado — a visão de produto é conversacional e proativa, que pede notificações push e presença constante, natural em mobile).
- Consequências: dois clientes (Flutter mobile + Next.js web) consumindo a mesma API Java. A API precisa suportar dois modos de autenticação (cookie httpOnly para web, bearer token para mobile).

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
