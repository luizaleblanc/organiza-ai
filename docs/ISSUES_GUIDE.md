# Guia de Implementação por Issue -- Organiza IA

> Este documento traduz cada issue aberta em orientação concreta de implementação, alinhada à missão do produto, às decisões arquiteturais já tomadas (`DECISIONS.md`) e ao ciclo de vida de software descrito em `CONTRIBUTING.md`. Não substitui a issue nem o spec da fase -- é o elo entre "o que fazer" e "como fazer do jeito que este projeto faz".
>
> **Regra de manutenção:** atualize este documento sempre que uma issue nova for aberta, fechada ou tiver seu escopo alterado, para que a lista abaixo nunca fique dessincronizada do GitHub Issues.

## Como usar este guia

Para cada issue: abra a branch já criada (`feature/<numero>-<slug>`) a partir do HEAD de `main`, siga o padrão de camadas indicado, e revise a seção "Alinhamento com a missão" antes de tomar decisões de design não cobertas aqui -- ela existe para resolver ambiguidades a favor do produto, não da conveniência técnica. Depois, siga o fluxo de PR em `CONTRIBUTING.md` (`feature/* → dev → qa → main`).

---

## Issue #1 -- `feat(bff): middleware JWT para rotas protegidas`

**Branch:** `feature/1-jwt-middleware`

**Alinhamento com a missão:** o Organiza IA promete "zero barreira de entrada" ([README](../README.md), Diferenciais) -- isso vale para o usuário, não para a segurança dos dados dele. Todo dado financeiro que passa pelo BFF precisa estar atrelado a um usuário autenticado antes de chegar ao backend.

**Decisões arquiteturais relevantes:**
- O backend já emite JWT via `mod_auth` (`TokenService`, ver `DECISIONS.md` ADR-012) -- o middleware do BFF **valida** esse token, não emite um novo.
- ADR-015: o BFF é KOF (`kof.web`), não Next.js -- o middleware deve ser escrito em `.kf`, seguindo `bff/middleware/` (estrutura já prevista em `CONTRIBUTING.md`).

**Padrão a seguir (BFF/KOF):** `rotas -> middleware -> proxy para backend` (`CONTRIBUTING.md`, Fase 2).

**Passo a passo sugerido:**
1. Criar `bff/middleware/auth.kf` com uma função que lê o header `Authorization`, extrai o `Bearer <token>` e valida contra o backend (ou decodifica localmente, se o KOF suportar verificação de assinatura JWT -- confirmar em `KOF_REFERENCE.md`; se não suportar, repassar a validação para uma chamada ao backend).
2. Extrair o `userId`/`email` do token validado e disponibilizar para as rotas que dele dependerem (issues #2, #3, #4).
3. Rotas públicas (`/api/auth/login`, `/api/auth/register`, `/health`) **não** passam pelo middleware -- confirmar que ele só é aplicado às rotas que exigem sessão.

**Critérios de aceite:**
- Requisição sem header `Authorization` (ou com token inválido/expirado) em uma rota protegida retorna erro (401) sem chegar a chamar o backend.
- Requisição com token válido chega ao backend com o `userId` correto disponível para o proxy.

---

## Issue #2 -- `feat(bff): rota proxy de chat (POST /api/chat/message)`

**Branch:** `feature/2-chat-proxy`

**Alinhamento com a missão:** esta é a rota que sustenta o "Coach Financeiro com IA" ([README](../README.md), Diferenciais) -- o canal pelo qual o usuário conversa naturalmente sobre seus gastos. Latência e confiabilidade aqui têm prioridade alta: é a interação mais frequente do produto.

**Decisões arquiteturais relevantes:** depende da issue #1 (middleware JWT) -- esta rota exige sessão. O proxy deve seguir o mesmo padrão já usado em `bff/main.kf` para as rotas públicas de auth (repassar `body()` cru via `http.post`, devolver `response.body`), mas passando pelo middleware antes.

**Padrão a seguir:** mesmo padrão de proxy das rotas de auth já implementadas -- não reinventar o formato da chamada.

**Passo a passo sugerido:**
1. Adicionar `app.post("/api/chat/message")` em `bff/main.kf`, protegida pelo middleware da issue #1.
2. Repassar para `POST http://localhost:8080/chat/message` (endpoint no backend ainda não existe -- verificar se já foi criado por outra issue de backend antes de assumir o contrato exato do body/response).
3. Usar os records `ChatMessageRequest`/`ChatMessageResponse` já definidos em `bff/models.kf` como referência de contrato, ajustando se o backend definir algo diferente.

**Critérios de aceite:**
- Requisição autenticada com `{ "message": "..." }` retorna a resposta do backend sem alteração de conteúdo.
- Requisição sem autenticação é rejeitada pelo middleware antes de chegar ao backend.

---

## Issue #3 -- `feat(bff): rotas proxy de transactions (GET/POST /api/transactions)`

**Branch:** `feature/3-transactions-proxy`

**Alinhamento com a missão:** transações são o dado bruto de tudo -- pulso diário, buckets 50/30/20 e envelopes dependem delas. Erros aqui se propagam para todo o resto do produto.

**Decisões arquiteturais relevantes:** o backend já tem `mod_transaction` com `bucket`/`source` mapeados na entidade (ADR-007) -- confirmar se esses campos já estão expostos nos DTOs do backend antes de desenhar o contrato do proxy no BFF.

**Padrão a seguir:** mesmo padrão de proxy; `GET` aceita query param `?month=2026-09` e deve repassá-lo como query string para o backend.

**Passo a passo sugerido:**
1. Adicionar `app.get("/api/transactions")` e `app.post("/api/transactions")` em `bff/main.kf`, ambas protegidas pelo middleware da issue #1.
2. No `GET`, ler o query param via `query("month")` (ver `KOF_REFERENCE.md`) e repassar para o backend.
3. Usar o record `Transaction` de `bff/models.kf` como referência de contrato.

**Critérios de aceite:**
- `GET /api/transactions?month=2026-09` retorna só as transações do mês pedido.
- `POST /api/transactions` cria a transação e retorna o registro criado.
- Ambas exigem autenticação válida.

---

## Issue #4 -- `feat(bff): rota proxy de budget e pulso diario (GET /api/budgets/daily-pulse)`

**Branch:** `feature/4-daily-pulse-proxy`

**Alinhamento com a missão:** o "pulso diário" é o diferencial central do produto -- é o que transforma o app de um extrato passivo em orientação proativa ("diz o que fazer com o dinheiro que você tem hoje", README). Essa rota precisa ser rápida e sempre disponível; é provavelmente a tela mais visitada do app.

**Decisões arquiteturais relevantes:** o cálculo do pulso diário é lógica de negócio do backend (`pulso = (salary - total_gasto) / dias_restantes`, ver `docs/DATA_MODEL.md`) -- o BFF **não** deve recalcular nada, só expor o resultado já pronto pelo backend (ver `CONTRIBUTING.md`: "Padrões de Código" > Frontend não faz lógica de negócio, mesma regra vale para o BFF como camada de apresentação de dados).

**Padrão a seguir:** proxy simples, protegido pelo middleware da issue #1.

**Passo a passo sugerido:**
1. Adicionar `app.get("/api/budgets/daily-pulse")` em `bff/main.kf`.
2. Repassar para o endpoint correspondente no backend (confirmar path exato com quem implementar a lógica de pulso diário no backend, se ainda não existir).

**Critérios de aceite:**
- Requisição autenticada retorna o valor do pulso diário calculado pelo backend, sem transformação no BFF.
- Requisição sem autenticação é rejeitada.

---

## Issue #5 -- `feat(backend): adicionar campo salary no User e migration`

**Branch:** `feature/5-user-salary`

**Alinhamento com a missão:** o salário é a base de cálculo de tudo no Organiza IA -- sem ele, não existe pulso diário nem buckets 50/30/20 (ver `docs/DATA_MODEL.md`, "USER é o centro").

**Decisões arquiteturais relevantes:**
- **Importante:** o campo `salary` **já existe** em `UserEntity` desde a Fase 0 (ADR-007), como `BigDecimal`, mas só na camada de persistência -- ainda não está mapeado na classe de domínio `User` (`com.organiza.mod_user.model.User`) nem exposto em endpoints. Esta issue é sobre completar esse mapeamento, não recriar a coluna.
- Valores monetários no backend são sempre `BigDecimal` (`CONTRIBUTING.md`, Padrões de Código) -- já é o tipo usado em `UserEntity.salary`, manter.
- Seguir o padrão de camadas do backend: `entity -> repository -> service -> dto -> controller -> teste` (`CONTRIBUTING.md`, Fase 2).

**Passo a passo sugerido:**
1. Adicionar `salary` (`BigDecimal`, opcional) ao construtor/getters de `com.organiza.mod_user.model.User` e atualizar `UserEntity.toDomain()`/`from()` para mapear o campo (hoje eles ignoram `salary`/`tier`).
2. Criar um DTO de request para o endpoint (ex.: `UpdateSalaryRequest(BigDecimal salary)`) em `mod_user/dto/`.
3. Criar `PATCH /users/salary` em `AdminController` ou um novo `UserController` em `mod_user/controller/` -- o usuário autenticado atualiza o próprio salário (usar `CurrentUserService`, em `shared/security`, para identificar quem faz a requisição -- nunca aceitar um `userId` arbitrário no body).
4. Escrever testes JUnit 5 + Mockito para o novo endpoint/serviço (obrigatório, `CONTRIBUTING.md`).
5. Migration: como o projeto usa Hibernate `ddl-auto=update` (ADR-008, sem Flyway/Liquibase), não é necessário script de migração manual -- a coluna já existe desde a Fase 0.

**Critérios de aceite:**
- `PATCH /users/salary` autenticado atualiza o salário do usuário logado (nunca de outro usuário).
- Teste cobrindo o caso de sucesso e o caso de tentativa de atualizar sem autenticação.

---

## Issue #6 -- `feat(backend): CRUD de envelopes`

**Branch:** `feature/6-envelope-crud`

**Alinhamento com a missão:** envelopes são a "Abordagem Híbrida" do produto na prática -- é onde o usuário personaliza os tetos de gastos dentro de cada bucket 50/30/20 (README, Diferenciais; `docs/DATA_MODEL.md`).

**Decisões arquiteturais relevantes:**
- **Atenção a uma sobreposição conceitual:** o backend já tem uma entidade `BudgetEntity` (`com.organiza.mod_budget.model`, criada na Fase 0 conforme ADR-006) representando limites mensais por bucket (needs/wants/savings). `Envelope`, como descrito na issue e em `docs/DATA_MODEL.md`, é uma entidade **por categoria** (`categoryName`, `limitAmount`, `currentSpent`), um nível mais granular. Confirme com o maintainer se `Envelope` é uma tabela nova dentro de `mod_budget` (recomendado, já que ambas pertencem ao mesmo domínio de negócio) ou se substitui/se relaciona com `BudgetEntity` de alguma forma -- não presuma antes de conversar, para não duplicar conceito.
- Padrão de ID: seguir o mesmo usado no resto do projeto -- `String` (UUID), não `BIGINT` (ADR-006, decisão consciente de manter consistência com `users.id`).
- Seguir o padrão de camadas do backend: `entity -> repository -> service -> dto -> controller -> teste` (`CONTRIBUTING.md`, Fase 2).

**Passo a passo sugerido:**
1. Criar `EnvelopeEntity` (`id` String/UUID, `userId` String, `categoryName`, `limitAmount` `BigDecimal`, `currentSpent` `BigDecimal`) em `mod_budget/model/`, com o mesmo estilo de `BudgetEntity` (Lombok `@Data`/`@AllArgsConstructor`/`@NoArgsConstructor`, construtor customizado gerando o UUID).
2. Repositório Spring Data (`EnvelopeEntityRepository`) em `mod_budget/repository/`.
3. Service com as quatro operações (criar, listar por usuário, atualizar, remover), sempre restritas ao usuário autenticado (via `CurrentUserService`).
4. DTOs de request/response em `mod_budget/dto/`.
5. Controller expondo `POST/GET/PUT/DELETE /api/envelopes` em `mod_budget/controller/`.
6. Testes JUnit 5 + Mockito para o service (obrigatório).

**Critérios de aceite:**
- CRUD completo funcional, sempre escopado ao usuário autenticado (um usuário não pode ler/editar/apagar envelope de outro).
- `currentSpent` inicia em zero na criação (a atualização automática ao registrar uma transação é escopo de uma issue futura, não desta).

---

## Mapeamento issue → branch (referência rápida)

| Issue | Branch | Módulo |
|---|---|---|
| [#1](https://github.com/luizaleblanc/organiza-ai/issues/1) | `feature/1-jwt-middleware` | BFF |
| [#2](https://github.com/luizaleblanc/organiza-ai/issues/2) | `feature/2-chat-proxy` | BFF |
| [#3](https://github.com/luizaleblanc/organiza-ai/issues/3) | `feature/3-transactions-proxy` | BFF |
| [#4](https://github.com/luizaleblanc/organiza-ai/issues/4) | `feature/4-daily-pulse-proxy` | BFF |
| [#5](https://github.com/luizaleblanc/organiza-ai/issues/5) | `feature/5-user-salary` | Backend |
| [#6](https://github.com/luizaleblanc/organiza-ai/issues/6) | `feature/6-envelope-crud` | Backend |
