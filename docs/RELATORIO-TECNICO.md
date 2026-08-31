# Relatório Técnico — Organiza IA (Voice-Driven Budgeting API)

> Documento de preparação para entrevistas técnicas. Cobre arquitetura, estrutura de pastas, decisões de design, trade-offs e os bugs reais encontrados e corrigidos durante o desenvolvimento.
>
> ⚠️ **Histórico:** este documento descreve uma versão anterior do projeto -- pacotes `dio.budgeting` (hoje `com.organiza.mod_*`, ver `DECISIONS.md` ADR-012), Spring Boot 3.2.5/Spring AI 1.0.0-M1 (hoje 3.3.13/1.0.8) e o frontend em Next.js (`frontend-voice/`, descontinuado em favor de KOF, ver ADR-015). Os caminhos de arquivo e trechos de código aqui **não refletem o estado atual do repositório**. Mantido como registro histórico das decisões e bugs reais da fase inicial do projeto -- para a arquitetura atual, ver `README.md` e `DECISIONS.md`.

---

## 1. O que o projeto faz (resumo de 30 segundos)

Uma aplicação full-stack onde o usuário registra e consulta gastos pessoais **falando** com um assistente de IA. Fluxo: grava um áudio no navegador → o áudio é transcrito (Whisper) → um modelo de linguagem (GPT-4o-mini) interpreta a intenção e decide qual operação de negócio executar (registrar gasto, consultar total por categoria, listar transações) → a operação é executada de verdade contra o banco de dados → a resposta é sintetizada de volta em áudio (TTS) e tocada pro usuário. Tudo isso por trás de uma tela de login com autenticação JWT e um dashboard financeiro com gráfico por categoria.

**Stack**: backend Java 17 + Spring Boot 3.2.5 + Spring AI 1.0.0-M1 + MySQL; frontend Next.js 16 (App Router) + TypeScript + Tailwind CSS v4.

---

## 2. Por que essa arquitetura (Clean Architecture / DDD leve)

O backend segue uma separação em 3 camadas com **regra de dependência única**: infraestrutura depende de aplicação, aplicação depende de domínio, e domínio não depende de nada externo (sem imports de Spring, JPA ou qualquer framework dentro de `domain/`).

```
src/main/java/dio/budgeting
├── domain/           # regras e modelos puros, sem dependência de framework
├── application/      # casos de uso — orquestram o domínio
└── infrastructure/    # tudo que "toca o mundo externo": HTTP, banco, IA, segurança
```

**Por que isso importa na prática** (não é só "boa prática" abstrata): os casos de uso em `application/` são reaproveitados **literalmente pelos dois canais de entrada** da aplicação — REST tradicional (`TransactionController`) e Tool Calling da IA (o `ChatClient` do Spring AI). O mesmo `PersistTransactionUseCase` que valida e salva uma transação quando chamado via `POST /transactions` é o **mesmo objeto** invocado pelo modelo de IA quando ele decide "o usuário quer registrar um gasto". Isso só é possível porque a lógica de negócio não sabe (nem precisa saber) se quem a chamou foi um humano via REST ou um LLM via function calling — ela só implementa `java.util.function.Function<Input, Output>`, uma interface do próprio Java, não do Spring AI.

Esse é o ponto mais importante da arquitetura pra saber explicar em entrevista: **a IA não é um sistema paralelo com sua própria lógica duplicada — ela reusa exatamente as mesmas regras de negócio e validações que a API REST usa.**

---

## 3. Estrutura de pastas — backend (`05-spring-ai/src/main/java/dio/budgeting`)

### 3.1 `domain/` — o núcleo

| Arquivo | Responsabilidade |
|---|---|
| `Transaction.java` | Entidade de domínio (classe simples com Lombok `@Getter`/`@AllArgsConstructor`, não é uma entidade JPA — é o modelo de negócio puro). |
| `TransactionId.java` | **Strong typed identifier**: um `record` que embrulha um `UUID`. Em vez de passar `String`/`UUID` cru por todo o código (onde é fácil trocar acidentalmente o ID de uma transação pelo de um usuário, por exemplo), o tipo `TransactionId` obriga o compilador a garantir que você só usa um ID de transação onde um ID de transação é esperado. |
| `Category.java` | Enum com as 12 categorias suportadas (`GROCERIES`, `LEISURE`, `FOOD`, `PHARMA`, `HEALTH`, `AUTO`, `TRANSPORT`, `HOUSING`, `EDUCATION`, `SHOPPING`, `SUBSCRIPTIONS`, `OTHER`). Tem um método `@JsonCreator fromValue(String)` que faz parsing tolerante (case-insensitive, com trim) e cai em `OTHER` em vez de lançar exceção se a IA devolver algo fora da lista — isso é uma decisão deliberada de resiliência (ver seção de bugs). |
| `Role.java` | Enum simples `USER` / `ADMIN`, usado pelo módulo de autorização. |
| `User.java` | Implementa `UserDetails` do Spring Security diretamente na entidade de domínio (decisão pragmática: em um projeto desse tamanho, não vale a pena um adapter separado só pra isso). |
| `TransactionRepository.java` | **Interface** (a "porta" do padrão Ports & Adapters) — define o contrato (`save`, `findAllByCategoryAndUserId`, `sumAmountByCategoryAndUserId`, `deleteAllByUserId`) sem nenhuma menção a JPA/SQL. A implementação concreta mora em `infrastructure/persistence`. |

### 3.2 `application/` — os casos de uso

Cada caso de uso é uma classe `@Service` que implementa `Function<Input, Output>` — essa é a convenção que permite o **mesmo** caso de uso ser registrado como uma "ferramenta" (tool) pro modelo de IA chamar.

| Arquivo | O que faz | Exposto pra IA? |
|---|---|---|
| `PersistTransactionUseCase` | Valida (`amount > 0`) e persiste uma transação, associando ao usuário autenticado via `CurrentUserService`. | ✅ sim |
| `ListTransactionsByCategoryUseCase` | Lista transações de uma categoria do usuário logado. | ✅ sim |
| `GetTotalByCategoryUseCase` | Soma o total gasto numa categoria. | ✅ sim |
| `ClearTransactionsUseCase` | Apaga **todas** as transações do usuário logado. | ❌ **não**, de propósito — ver seção 6. |

Subpastas `input/` e `output/` guardam os `record`s de entrada/saída de cada caso de uso (`PersistTransactionInput`, `GetTotalByCategoryOutput`, `TransactionOutput`, etc.) — isolados dos DTOs HTTP, que moram em `infrastructure/http`.

### 3.3 `infrastructure/` — os adaptadores

```
infrastructure
├── http/                  # entrada REST
│   ├── TransactionController.java   # endpoints de transação + pipeline de voz
│   ├── AuthController.java          # /auth/login, /auth/register
│   ├── AdminController.java         # /admin/users (protegido por role)
│   ├── GlobalExceptionHandler.java  # @RestControllerAdvice p/ erros de validação
│   ├── dto/                         # DTOs de autenticação
│   ├── request/                     # DTOs de entrada (TransactionRequest)
│   └── response/                    # DTOs de saída (TransactionResponse, DashboardSummaryResponse, CategorySummary, UserSummaryResponse)
│
├── persistence/            # adaptador JPA
│   ├── entity/TransactionEntity.java          # entidade JPA (separada da Transaction de domínio)
│   ├── repository/JpaTransactionRepository.java    # implementa a interface TransactionRepository do domínio
│   ├── repository/TransactionEntityRepository.java # interface Spring Data JPA (JpaRepository)
│   └── UserRepository.java
│
├── security/                # autenticação/autorização
│   ├── SecurityConfigurations.java  # SecurityFilterChain, CORS, encoder de senha
│   ├── SecurityFilter.java          # filtro JWT customizado (OncePerRequestFilter)
│   ├── TokenService.java            # geração/validação de JWT (jjwt)
│   ├── AuthorizationService.java    # implementa UserDetailsService
│   └── CurrentUserService.java      # pega o usuário logado do SecurityContext
│
└── config/
    └── RestClientConfig.java        # configura o cliente HTTP usado pelas chamadas à OpenAI
```

**Ponto chave sobre `persistence/`**: existem DUAS classes de "Transaction" no projeto — `domain.Transaction` (modelo de negócio) e `infrastructure.persistence.entity.TransactionEntity` (mapeada com `@Entity`/`@Enumerated`/etc). O `JpaTransactionRepository` faz a ponte entre elas (`TransactionEntity.from(transaction)` / `entity.toDomain()`). Isso evita que anotações de JPA "vazem" pro domínio.

---

## 4. Estrutura de pastas — frontend (`frontend-voice/src`)

```
src
├── app/
│   ├── page.tsx                  # splash screen (pública)
│   ├── login/page.tsx            # login + cadastro (toggle no mesmo componente)
│   ├── dashboard/page.tsx        # tela de gravação de voz (autenticada)
│   ├── dashboard/finance/page.tsx  # resumo financeiro: gráfico + lista (autenticada)
│   ├── api/
│   │   ├── ai/route.ts           # BFF: recebe áudio do navegador, repassa pro backend Java com o JWT
│   │   ├── dashboard/route.ts    # BFF: GET dos dados do dashboard
│   │   └── transactions/route.ts # BFF: DELETE (limpar transações)
│   └── actions/auth.ts           # Server Actions: loginBFF, registerBFF, logoutBFF
│
├── components/    # componentes de UI reutilizáveis (ver seção 5.3)
├── lib/categories.ts  # única fonte de verdade pra rótulo/cor de categoria no frontend
└── proxy.ts        # equivalente ao middleware.ts (renomeado nessa versão do Next.js) — protege rotas
```

### 4.1 Padrão BFF (Backend-for-Frontend)

O navegador **nunca** fala diretamente com a API Java (`localhost:8080`). Toda chamada passa por uma rota `app/api/*/route.ts` ou por uma Server Action, que roda no **servidor** do Next.js, pega o JWT de um cookie `httpOnly` (`organiza_token`, inacessível a JavaScript do navegador — proteção contra XSS) e só então repassa a chamada pro backend com o header `Authorization: Bearer`.

Por que isso importa: o token nunca fica exposto a JavaScript client-side, e o frontend tem um único ponto (`proxy.ts` + as rotas BFF) para tratar sessão expirada de forma consistente, em vez de espalhar essa lógica em cada componente que faz fetch.

### 4.2 `proxy.ts` — proteção de rotas

Nessa versão do Next.js (16), o arquivo `middleware.ts` foi renomeado para `proxy.ts` (mudança de convenção da própria framework). Ele roda antes da renderização e decide:
- `/dashboard/*` sem cookie válido → redireciona pra `/login`.
- `/login` ou `/` (splash) **com** cookie válido → redireciona direto pra `/dashboard` (usuário já logado não precisa ver login/splash de novo).

### 4.3 Componentes (`src/components/`)

| Componente | Função |
|---|---|
| `SlideButton.tsx` | Botão "deslizar para confirmar" construído do zero com Pointer Events (mouse, touch e caneta funcionam igual) — sem biblioteca externa. |
| `WaveLines.tsx` / `BrandKnot.tsx` | Animações decorativas em `<canvas>`, desenhadas via `requestAnimationFrame` com trigonometria pura (senoides sobrepostas). Escolha deliberada de não trazer uma lib de animação só pra isso (ver seção 6). |
| `BrandBlob.tsx` | Blob de fundo com `border-radius` animado via CSS (efeito "orgânico"). |
| `Waveform.tsx` | Barras de equalizador (usadas no estado "gravando" do microfone). |
| `CategoryIcon.tsx` | Um ícone SVG por categoria financeira (switch por string). |
| `PasswordInput.tsx` | Campo de senha com botão de mostrar/ocultar (ícone customizado; o ícone nativo do Edge é escondido via CSS `::-ms-reveal`). |
| `ConfirmModal.tsx` | Modal de confirmação genérico (usado para "apagar todas as transações"). |

---

## 5. O pipeline de IA em detalhe

### 5.1 Como o Tool Calling funciona aqui

Em `TransactionController`, o `ChatClient` é montado assim (simplificado):

```java
this.chatClient = chatClientBuilder
    .defaultSystem(systemPrompt.getContentAsString(...))   // carrega prompts/system-message.st
    .defaultFunctions("persistTransactionUseCase", "listTransactionsByCategoryUseCase", "getTotalByCategoryUseCase")
    .build();
```

`defaultFunctions` recebe os **nomes dos beans Spring** dos casos de uso. O Spring AI usa reflection sobre o tipo `Function<Input, Output>` de cada bean pra gerar automaticamente o JSON Schema que descreve a "ferramenta" pro GPT-4o-mini — os nomes dos campos do `record` de input (`description`, `amount`, `category`, `currency`) viram o schema que o modelo usa pra saber quais argumentos preencher, e o enum `Category` vira uma restrição de valores válidos no schema.

Quando o usuário fala algo como "gastei 45 reais no mercado", o modelo:
1. Decide que precisa chamar `persistTransactionUseCase`.
2. Preenche os argumentos (`description="mercado"`, `amount=45.0`, `category="GROCERIES"`).
3. O Spring AI desserializa isso em um `PersistTransactionInput` de verdade e invoca `.apply()` no bean real.
4. O resultado volta pro modelo, que gera a frase final de confirmação.

**Suporte a múltiplas transações numa fala só** (ex: "gastei 100 em alimentação e 20 no petshop"): o protocolo de function calling da OpenAI já suporta o modelo retornar **múltiplas chamadas de ferramenta numa única resposta**. O Spring AI (`AbstractFunctionCallSupport`) já iterava por todas elas — o que faltava era o **prompt autorizar e instruir esse comportamento** explicitamente (estava escrito no singular). Depois de ajustado, testei de ponta a ponta gerando um áudio sintético via TTS da própria OpenAI e mandando pro pipeline real — resultado: duas transações separadas no banco, de uma única gravação.

### 5.2 As três etapas

1. **Transcrição** — `OpenAiAudioTranscriptionModel` (Whisper), configurado com `.withLanguage("pt")`.
2. **Orquestração** — `ChatClient` + GPT-4o-mini + Tool Calling (acima).
3. **Síntese de voz** — `OpenAiAudioSpeechModel` (TTS), voz `NOVA`, formato MP3.

O endpoint principal (`POST /transactions/ai-base64`) recebe áudio em base64 (usado pelo frontend via BFF), transcreve, manda pro `ChatClient`, sintetiza a resposta e devolve o áudio também em base64. Existe uma variante `POST /transactions/ai` que aceita `multipart/form-data` diretamente.

### 5.3 `system-message.st` — engenharia de prompt

Fica em `src/main/resources/prompts/system-message.st`, carregado como um `Resource` do Spring (`@Value("classpath:prompts/system-message.st")`). Não é hardcoded no Java — trocar o comportamento do assistente é editar um arquivo de texto, sem recompilar lógica.

Conteúdo estruturado em: identificação de campos, lista exaustiva de categorias com **palavras-chave de exemplo** por categoria (crucial pra guiar a classificação — sem isso o modelo tende a "chutar" a primeira categoria da lista pra qualquer coisa ambígua), instrução de suporte a múltiplas transações, e regras de formato de resposta (nunca JSON, nunca em inglês, sempre soar como fala natural porque vira áudio).

---

## 6. Decisões arquiteturais e trade-offs (a parte boa pra entrevista)

### 6.1 `ClearTransactionsUseCase` não é uma ferramenta de IA — de propósito

Todos os outros casos de uso são registrados em `defaultFunctions(...)`. Este não. Decisão de segurança: um comando de voz mal-transcrito (ex: o Whisper interpreta errado um "apaga isso" qualquer) não pode ter o poder de destruir todos os dados financeiros do usuário sem confirmação explícita de UI. Apagar tudo só é acessível via um botão físico + modal de confirmação no frontend, nunca por voz.

### 6.2 Categorias como enum Java fixo (não uma tabela no banco)

Considerei explicitamente a alternativa: uma tabela `categories` no banco, com CRUD, permitindo o usuário criar categorias próprias e a IA nunca ficar desalinhada. **Optei pelo enum fixo** porque:
- É seguro em tempo de compilação (o compilador avisa se um `switch` não trata uma categoria nova).
- Resolve o problema real de hoje (12 categorias cobrem a esmagadora maioria dos gastos pessoais).
- Uma tabela dinâmica traria complexidade real: migração de schema (o projeto não tem Flyway/Liquibase, só `ddl-auto=update`), normalização de nomes duplicados, e o prompt da IA precisaria ser montado dinamicamente a cada request.

**Trade-off documentado, não escondido**: essa decisão significa que a lista de categorias vive duplicada em 3 lugares (enum Java, prompt `.st`, mapa de labels/cores no frontend em `lib/categories.ts`) que precisam ser mantidos manualmente em sincronia — e foi exatamente essa duplicação que causou um bug real (categoria "Lazer" esquecida no prompt, ver seção 7).

### 6.3 Autenticação: filtro JWT customizado, não Spring OAuth2 Resource Server

Cheguei a considerar migrar pra `spring-boot-starter-oauth2-resource-server` (que trataria 401 vs 403 de forma mais padronizada). Decisão: manter o filtro customizado (`SecurityFilter` + `TokenService` com a lib `jjwt`) porque já funcionava ponta a ponta e não tinha dependências extras — só evoluir em cima dele (adicionar roles, expiração tratada no frontend, validação de senha) em vez de trocar a base.

### 6.4 BFF no Next.js em vez do navegador chamar o Spring direto

Alternativa mais simples seria o React chamar `localhost:8080` diretamente com `fetch` guardando o JWT em `localStorage`. Rejeitei isso porque `localStorage` é acessível por qualquer script (risco de XSS roubar o token). Cookie `httpOnly` + rotas BFF só é acessível no servidor do Next.js, nunca por JavaScript do navegador.

### 6.5 Animações em `<canvas>` puro em vez de biblioteca (Framer Motion, etc.)

Pra atingir o visual "ondas fluidas" pedido, dava pra trazer uma lib de animação pesada. Decisão: canvas + `requestAnimationFrame` + trigonometria manual — zero dependência nova, GPU-composited, e mais performático que manipular centenas de elementos DOM animados via JS.

### 6.6 Paleta de cores do gráfico validada, não escolhida "no olho"

Pra 12 categorias diferenciáveis num gráfico de pizza sem cair em "tons de azul indistinguíveis", rodei um script de validação de acessibilidade (contraste, separação por daltonismo — simulação de deficiência de percepção de cor) antes de fixar as cores definitivas, em vez de escolher hexadecimais arbitrariamente.

### 6.7 Retry configurado especificamente para chamadas à OpenAI

`spring.ai.retry.*` em `application.properties` (5 tentativas, backoff exponencial de 1s a 8s) — mitigação para instabilidade de rede intermitente observada especificamente no upload de áudio pro Whisper (ver bug correlato na seção 7).

---

## 7. Bugs reais encontrados e corrigidos (ótimas histórias pra entrevista, formato "situação → causa → correção")

### 7.1 Coluna de categoria travada em ENUM nativo do MySQL

**Situação**: expandi as categorias de 3 para 12 no enum Java. Compilou, testes passaram — e mesmo assim, registrar uma transação numa categoria nova (ex: `SHOPPING`) explodia em erro 500.
**Causa real**: a coluna `category` no MySQL tinha sido criada, lá no início do projeto, como um **ENUM nativo do MySQL** (`enum('AUTO','GROCERIES','PHARMA')`), não um `VARCHAR`. O `spring.jpa.hibernate.ddl-auto=update` do Hibernate **nunca altera o tipo de uma coluna já existente** — ele só cria tabelas/colunas novas. Então o enum Java sabia sobre 12 valores, mas o banco continuava fisicamente aceitando só os 3 originais.
**Correção**: `ALTER TABLE transaction_entity MODIFY category VARCHAR(20)` no banco existente, e `@Column(length = 32)` na entidade JPA pra bancos novos serem criados corretamente desde o início.
**O que isso ensina**: "compilou e os testes passaram" não é garantia de nada quando o problema está no schema físico do banco, não no código — só existe um jeito de saber, que é testar rodando de verdade.

### 7.2 Fix de rede que não fazia nada (mas parecia que sim)

**Situação**: uploads de áudio pro Whisper falhavam intermitentemente com `Connection reset`. Troquei o cliente HTTP padrão do Java pelo Apache HttpClient5 (adicionando a dependência em `build.gradle`), assumindo que a autodetecção do Spring Boot ia trocar o cliente usado internamente. O erro continuou acontecendo.
**Causa real**: existia um `RestClientConfig.java` (`@Configuration` com um bean `RestClientCustomizer`) que **forçava explicitamente** o `JdkClientHttpRequestFactory` em todo `RestClient.Builder` da aplicação — inclusive o do Spring AI. A nova dependência nunca era usada, porque esse bean sobrescrevia a autodetecção incondicionalmente.
**Correção**: alterar o próprio bean pra construir um `HttpComponentsClientHttpRequestFactory` explicitamente, em vez de confiar na autodetecção implícita.
**O que isso ensina**: quando o mesmo erro volta depois de "corrigido", o problema quase nunca está onde você já olhou — vale procurar configuração que possa estar silenciosamente desfazendo sua correção.

### 7.3 `TransactionRequiredException` disfarçada de erro 403

**Situação**: implementei o botão de "apagar todas as transações". Clicar nele deslogava o usuário e voltava pra tela de login, em vez de limpar o dashboard.
**Causa real**: o método usava uma *derived delete query* do Spring Data JPA (`deleteByUserId`), que precisa rodar dentro de uma transação (`@Transactional`) explícita — eu tinha esquecido a anotação no caso de uso. Sem transação ativa, o Hibernate lançava `TransactionRequiredException` ao tentar `remove`. Só que essa aplicação especificamente **converte qualquer exceção não tratada que sobe pela cadeia de filtros do Spring Security em HTTP 403** (em vez do 500 esperado) — e o frontend, ao ver 403, interpretava como "sessão expirada" e deslogava automaticamente. Um bug de transação de banco se disfarçou perfeitamente de bug de autenticação.
**Correção**: `@Transactional` no método `execute()` do `ClearTransactionsUseCase`.
**Como diagnostiquei de verdade**: reproduzi o fluxo completo via `curl` e `node -e "fetch(...)"` direto contra o backend rodando com log visível, e só aí a stack trace real apareceu — o sintoma (403 + logout) escondia completamente a causa (exceção JPA).

### 7.4 Categoria "Lazer" invisível para a IA

**Situação**: a categoria `LEISURE` ("Lazer") tinha ícone, cor e rótulo completos no frontend, mas a IA nunca a escolhia.
**Causa real**: o prompt (`system-message.st`) listava explicitamente as categorias válidas pro modelo — e "Lazer" tinha sido esquecida nessa lista manual (a mesma duplicação de dado mencionada na seção 6.2).
**Correção**: adicionar a entrada faltante com palavras-chave de exemplo.

### 7.5 Acentos corrompidos no banco

**Causa**: a URL JDBC não especificava charset, e a conexão negociava `latin1` em vez de `utf8mb4` (a tabela em si já estava correta). **Correção**: `?useUnicode=true&characterEncoding=UTF-8` na `spring.datasource.url`.

---

## 8. Segurança

- **Senhas**: hash com BCrypt (`BCryptPasswordEncoder`), nunca texto plano.
- **Tokens**: JWT assinado (HS384, biblioteca `jjwt`), stateless (`SessionCreationPolicy.STATELESS` — o servidor não guarda sessão, cada request se autentica sozinho via o header `Authorization`).
- **Autorização por papel**: `Role` (`USER`/`ADMIN`) + `@EnableMethodSecurity` + `@PreAuthorize("hasRole('ADMIN')")` no endpoint `GET /admin/users`. Todo usuário novo nasce `USER`; o campo de role nunca é aceito vindo do cliente no cadastro (evita escalonamento de privilégio).
- **CORS**: configurado explicitamente (métodos, headers e origens permitidas) via `CorsConfigurationSource`.
- **Validação de entrada**: Bean Validation (`@NotBlank`, `@Email`, `@Size(min=8)`) no cadastro, com um `GlobalExceptionHandler` centralizando a tradução de erros de validação em respostas HTTP 400 legíveis.
- **Fallback de categoria**: como mencionado, a IA nunca consegue quebrar a persistência mandando uma categoria inválida — vira `OTHER` automaticamente via `@JsonCreator`.

---

## 9. Testes

`JUnit 5` + `Mockito`, focados nos casos de uso críticos (ex: `PersistTransactionUseCaseTest` cobre a regra de guarda "valor deve ser maior que zero" e o fluxo de persistência, mockando `TransactionRepository` e `CurrentUserService`). Banco em memória `H2` disponível pro contexto de testes.

---

## 10. Como rodar

Ver `README.md` na raiz do projeto — resumo: `docker compose` sobe o MySQL automaticamente junto com `./gradlew bootRun`; frontend roda separado com `npm run dev` dentro de `frontend-voice/`.

---

## 11. Perguntas prováveis de entrevista e pontos de resposta

- **"Como a IA sabe o que fazer?"** → Tool Calling: o modelo não executa código livremente, ele só pode escolher entre funções pré-registradas com schema tipado; a lógica de negócio real roda em Java, fora do controle do modelo.
- **"Como você garante que a IA não faz algo perigoso?"** → Nem toda operação é exposta como ferramenta (ex: apagar tudo é só via UI); o schema tipado (enum de categoria) já restringe o que o modelo pode enviar; há fallback seguro (`OTHER`) para entradas inesperadas em vez de falha dura.
- **"Qual foi o bug mais difícil de achar?"** → O 403 causado por `TransactionRequiredException` sem `@Transactional` (seção 7.3) — o sintoma observável (logout automático) não tinha relação óbvia com a causa real (transação de banco ausente); só achei lendo a stack trace completa do servidor.
- **"Por que Clean Architecture aqui, e não só um CRUD simples?"** → Porque o mesmo caso de uso precisa ser chamado por dois canais completamente diferentes (REST humano e Tool Calling de IA) com as mesmas garantias — sem essa separação, a lógica de validação teria que ser duplicada ou a IA teria acesso direto ao banco.
- **"O que você faria diferente com mais tempo?"** → Categorias dinâmicas via banco (trade-off documentado na seção 6.2); Flyway/Liquibase pra migrações de schema em vez de `ddl-auto=update` (que foi literalmente a causa do bug 7.1).
