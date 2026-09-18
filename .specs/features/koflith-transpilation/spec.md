# Specification: KofLith Monolithic Transpilation

## 1. Context & Business Value
O Organiza IA tem como missão: *"Sua grana organizada e sem estresse"*. A arquitetura inicial mantinha uma barreira artificial entre o frontend/BFF em Kof e o backend em Spring Boot. Segundo a especificação e filosofia do ecossistema Kof (`training/idioms/architecture.md`), separar front e back em Kof através de camadas desnecessárias de cerimônia vai contra a linguagem. 

O objetivo desta especificação é formalizar a migração progressiva e com garantia de zero perda de código do backend Java para o monólito unificado KOF (KofLith).

## 2. User Stories & Priorities

### P1: Transpilação dos Repositórios e Serviços Core
- **Story:** Como mantenedora do Organiza IA, quero que as entidades, repositórios e serviços de usuário, orçamento, transações e renda variável estejam implementados em KOF, para que a lógica de negócios rode de forma nativa e sem overhead de chamadas HTTP locais.
- **Priority:** P1 (Core Foundation)

### P1: Transpilação do Módulo de IA Coach e Kakeibo
- **Story:** Como usuária do Organiza IA, quero que os cálculos de pulso diário, balanço de buckets, categorização e reflexão semanal do Kakeibo rodem no domínio KOF, para que o assistente cognitivo oriente meus gastos em tempo real.
- **Priority:** P1 (MVP Engine)

### P1: Unificação de Rotas KofLith no BFF
- **Story:** Como mantenedora, quero que o entrypoint web (`bff/main.kf`) invoque os serviços Kof diretamente na mesma JVM, eliminando o proxy HTTP com o Spring Boot.
- **Priority:** P1 (Monolith Unification)

### P2: Decomissionamento Seguro do Código Java
- **Story:** Como equipe de engenharia, quero que o código Java legado só seja removido após 100% das rotas e regras de negócio estarem comprovadamente ativas e validadas no compilador Kof.
- **Priority:** P2 (Cleanup & Parity)

## 3. Acceptance Criteria (EARS Notation)

- **AC-01 (Ubiquitous):** The Kof compiler SHALL validate all translated code via `kof check backend` with zero syntax or type-checking errors.
- **AC-02 (Event-driven):** WHEN a user requests their daily pulse, THEN the system SHALL calculate `(salary - totalSpent) / daysRemaining` using the user's active budget model.
- **AC-03 (State-driven):** WHILE a user is on the Kakeibo budget model, the system SHALL enforce the 4 weekly reflective questions and record answers without data loss.
- **AC-04 (Event-driven):** WHEN a variable income is registered, THEN the system SHALL direct the value to the emergency fund until the goal is reached, and to the active budget model thereafter.
- **AC-05 (Unwanted-behavior):** IF a free-tier user exceeds 30 chat messages in a month, THEN the system SHALL block message sending with the message: `"Você atingiu o limite de 30 mensagens gratuitas este mês."`.
- **AC-06 (Ubiquitous):** The Java legacy source code SHALL remain intact in `src/main/java` until parity verification passes for all migrated endpoints.

## 4. Assumptions & Boundaries
- **A-01:** O compilador Kof utilizado é a versão 0.4.x-beta disponível em `kof/Kof4j` com suporte a `Translate.java`.
- **A-02:** Persistência em memória estruturada (`BackendDb`) é utilizada nesta fase de transição, com hooks prontos para migração para `kof.db`/`kof.orm` quando o driver JDBC nativo for conectado.
- **Out of Scope:** Exclusão prematura de classes Java ou desativação do Gradle antes da homologação final.

