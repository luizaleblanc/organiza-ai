# Guia de Contribuição

Para mantermos o projeto organizado e escalável, todos os contribuidores devem seguir nosso Ciclo de Vida de Software (SDLC) e entender nossa arquitetura base.

---

## Arquitetura e Stack Tecnológica

| Camada | Tecnologia | Descrição |
|---|---|---|
| **Front-end** | KOF (kof.ui) | Interface compilada utilizando o compilador/linguagem KOF para a JVM. Renderiza via KofJS em webview |
| **Back-end (BFF)** | KOF (kof.web) | Arquitetura Backend-For-Frontend desacoplada, servindo dados estruturados para o front-end |
| **Back-end (API)** | Java 17, Spring Boot 3.3.x, Spring AI | Lógica de negócio, IA conversacional, autenticação. O backend suporta dois modelos de renda: fixa (salário mensal com divisão 50/30/20) e variável (entradas extras direcionadas por regra para reserva de emergência ou orçamento). Ver docs/DATA_MODEL.md para o modelo completo. O backend suporta 6 modelos de orçamento adaptativos, selecionados automaticamente no onboarding com base em renda, tipo de renda e situação de dívida. O motor de sugestão está em BudgetModelSuggestionService. Ver docs/DATA_MODEL.md para o diagrama completo dos modelos. |
| **Banco de Dados** | MySQL no Render | Modelo relacional com cronjob de ping para estabilidade contínua, sem dependência de bancos temporários |

```
organiza-ai/
  frontend/              # KOF UI -- telas e componentes (.kf)
    main.kf
    screens/
    components/
    theme/
    api/

  bff/                   # KOF BFF -- servidor HTTP e proxy (.kf)
    main.kf
    middleware/

  src/                   # Backend Spring Boot (Java)
    main/java/com/organiza/
      auth/
      user/
      transaction/
      budget/
      coach/
      shared/

  docs/                  # Documentação técnica e diagramas Mermaid
  DECISIONS.md           # Architecture Decision Records (ADRs)
```

---

## Ciclo de Vida do Software (SDLC)

### Fase 1 -- Design

Modelagem visual de dados atualizada em Mermaid.js e aprovação do fluxo antes de qualquer código.

- Diagramas ER em `docs/DATA_MODEL.md`
- Contratos de API definidos nos specs (`specs/PHASE_X_*.md`)
- Aprovação do maintainer obrigatória antes de prosseguir

### Fase 2 -- Desenvolvimento

Implementação full-stack das rotas do BFF para suportar as telas modeladas em KOF.

**Backend (Java/Spring Boot):**
```
entity -> repository -> service -> dto -> controller -> teste
```

**Frontend (KOF kof.ui):**
```
state class -> screen function -> components -> composição no Window
```

**BFF (KOF kof.web):**
```
rotas -> middleware -> proxy para backend
```

### Fase 3 -- Code Review

Regras rigorosas de PRs (Pull Requests) para garantir a qualidade do código recebido pela comunidade open source.

- Cada PR tem escopo de **um módulo** (não misturar backend + frontend)
- Testes unitários obrigatórios para backend
- Aprovação de pelo menos 1 maintainer
- Checklist de qualidade validado

#### Fase 4 -- Deploy e CI/CD
- Backend: deploy no Render via push na main. Cronjob de ping ativo.
- BFF KOF: deploy manual via kof serve (automação futura com Docker).
- Build deve compilar limpo: ./gradlew build (backend), kof run bff/main.kf (BFF).
- Merge na main somente via PR aprovado.
- Todo PR segue checklist: testes, compilação, acentuação, PROJECT_STATUS atualizado.

---

## Pré-requisitos

| Ferramenta | Versão | Necessário para |
|---|---|---|
| **JDK** | 17+ | Backend (Spring Boot) |
| **KOF** | 0.2.0-beta+ | Frontend (kof.ui) e BFF (kof.web) |
| **Docker Desktop** | Qualquer | MySQL local (compose.yml) |
| **Git** | 2.40+ | Versionamento |

## Setup do Ambiente

### 1. Clone o repositório

```bash
git clone https://github.com/luizaleblanc/organiza-ai.git
cd organiza-ai
cp .env.example .env
# preencha .env com sua chave da OpenAI e um API_SECURITY_TOKEN_SECRET novo
```

### 2. Instalar o KOF

**Windows:**
```powershell
# Baixar de https://github.com/KofLang/Kof4j/releases
Expand-Archive -Path "$HOME\Downloads\kof-windows-*.zip" -DestinationPath "C:\kof"
setx PATH "$env:PATH;C:\kof\bin"
# Fechar e reabrir o terminal
kof version
```

**Linux/macOS:**
```bash
tar -xzf kof-linux-*.tar.gz -C /opt/kof
echo 'export PATH=$PATH:/opt/kof/bin' >> ~/.bashrc
source ~/.bashrc
kof version
```

**Build do código-fonte (alternativa):**
```bash
git clone https://github.com/KofLang/Kof4j.git
cd Kof4j
mvn clean install -DskipTests
```

### 3. Subir o banco local

```bash
docker compose up -d
# MySQL em localhost:3306
```

### 4. Rodar o backend

```bash
./gradlew bootRun
# http://localhost:8080
```

### 5. Rodar o BFF

```bash
cd bff
kof serve main.kf --port 3000
# http://localhost:3000
```

### 6. Rodar o frontend

```bash
cd frontend
kof run --target=js main.kf
# Abre no webview ou browser
```

---

## Padrões de Código

### Backend (Java)

- DTOs: Java `record` (nunca classes com getters/setters)
- Injeção: constructor injection (sem `@Autowired` em campo)
- Valores monetários: `BigDecimal`
- Testes: JUnit 5 + Mockito
- Controllers: sem lógica de negócio

### Frontend (KOF)

- Arquivos: snake_case.kf
- Classes: PascalCase
- Funções: camelCase
- Estado mutável: campos `static` em classe de estado
- Composição: Window > View(Style) > Column/Row > widgets
- Target: sempre `--target=js` para UI

### Tom de voz

Textos voltados ao usuário seguem o tom de voz da marca: linguagem simples, sem jargão financeiro, sem julgamento. Consulte a seção "Tom de voz" no CLAUDE.md.

---

## Fluxo de Pull Request

O projeto usa três branches de integração permanentes -- `main`, `qa` e `dev` -- além das branches de feature. Uma mudança só chega em `main` depois de passar pelos dois ambientes intermediários.

### 1. Branch

Toda branch de feature nasce a partir do commit mais recente (HEAD) de `main` -- nunca a partir de `dev` ou `qa`, que podem estar à frente ou atrás de `main` em experimentos ainda não promovidos.

```bash
git checkout main
git pull origin main
git checkout -b feature/<número-da-issue>-descrição-curta
# Exemplos (branches já criadas para as issues abertas):
# feature/1-jwt-middleware
# feature/2-chat-proxy
# feature/3-transactions-proxy
# feature/4-daily-pulse-proxy
# feature/5-user-salary
# feature/6-envelope-crud
```

### 2. Commits

```bash
git commit -m "feat(budget): add daily pulse calculation"
git commit -m "feat(frontend): implement onboarding screen"
git commit -m "feat(bff): add auth middleware"
git commit -m "fix(coach): fix null amount in tool calling"
git commit -m "test(transaction): add category tests"
```

Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

### 3. MR para `dev` -- primeira validação

Abra o merge request da sua branch de feature para `dev`, referenciando a issue (`Closes #N`).

```markdown
- [ ] Segue o contrato de API do spec / da issue
- [ ] Testes unitários incluídos (backend)
- [ ] Sem lógica de negócio no controller/frontend
- [ ] Compila sem warnings
- [ ] Sem arquivos pesados (node_modules, build/, .class)
```

O dev responsável pela área (backend, BFF ou frontend) revisa e testa localmente antes de aprovar o merge em `dev`.

### 4. MR para `qa` -- validação de qualidade

Depois que a mudança está em `dev`, abra o MR de `dev` para `qa`. QA testa o comportamento end-to-end (fluxo completo, não só a unidade alterada) antes de aprovar.

### 5. Aviso para o maintainer

Com o MR aprovado em `qa`, avise o maintainer (nesta conversa ou no canal combinado) para que ele teste a mudança antes da promoção final.

### 6. Promoção para `main`

Somente o maintainer promove `qa` -> `main`. Esse é o único caminho para `main` -- nenhuma branch de feature ou `dev`/`qa` faz merge direto nela.

```
feature/* --MR--> dev --MR--> qa --(maintainer testa)--> main
```

### Review

- Aprovação de pelo menos **1 maintainer** obrigatória antes da promoção para `main`
- Feedback construtivo, com sugestões, em cada etapa (dev e qa)

---

## Guia de implementação por issue

Antes de começar uma issue aberta, consulte [docs/ISSUES_GUIDE.md](docs/ISSUES_GUIDE.md) -- ele traduz cada issue em orientação concreta, alinhada à missão do produto e às decisões já registradas em `DECISIONS.md`.

## Referência técnica do KOF

Consulte [KOF_REFERENCE.md](KOF_REFERENCE.md) (raiz do projeto) para a referência completa da linguagem, kof.ui e kof.web.

## Como configurar sua IA para codar em KOF

### Por que isso é necessário?
KOF é uma linguagem compilada para JVM lançada em 2026. Nenhuma LLM
foi treinada com volume significativo de código KOF. Sem contexto,
a IA inventa sintaxe que não compila. Este projeto já sofreu com isso.
Regra de ouro: se a IA gerou código KOF, compile antes de confiar.

O KOF é uma linguagem nova e a maioria das LLMs (ChatGPT, Claude, Gemini, Copilot) não a conhece nativamente. Sem contexto, a IA vai inventar sintaxe que não existe e gerar código que não compila. Para evitar isso, siga estes passos antes de pedir para a IA escrever código KOF:

### 1. Alimentar com o corpus de training

O repositório do compilador KOF tem uma pasta `training/` com documentação estruturada especificamente para LLMs:

```bash
git clone https://github.com/KofLang/Kof4j.git
```

Os arquivos essenciais para alimentar a IA:

| Arquivo | O que ensina |
|---|---|
| `training/language/syntax.md` | Sintaxe completa da linguagem |
| `training/language/types.md` | Sistema de tipos |
| `training/language/io.md` | HTTP, JSON, filesystem |
| `training/language/ui.md` | Componentes de interface (kof.ui) |
| `training/examples/web.kf` | Exemplo real de servidor HTTP |
| `training/idioms/architecture.md` | Como estruturar projetos |
| `training/anti-patterns/fake-idioms.md` | O que a IA NÃO deve inventar |
| `training/migration/java-to-kof.md` | Como migrar de Java para KOF |

### 2. Incluir na primeira mensagem

Antes de pedir qualquer código KOF para a IA, cole o conteúdo dos arquivos relevantes como contexto. Exemplo de prompt:

```
Aqui está a documentação oficial da linguagem KOF (versão 0.2.6-beta),
extraída da pasta training/ do compilador. Use APENAS a sintaxe confirmada
nestes arquivos -- nunca invente métodos, tipos ou palavras-chave de outras
linguagens (Java, Kotlin, JavaScript etc.) só porque parecem fazer sentido.

[cole aqui training/language/syntax.md]
[cole aqui training/anti-patterns/fake-idioms.md]
[cole aqui os demais arquivos relevantes para a tarefa]

Tarefa: [descreva a rota, a tela ou a função que você precisa implementar]
```

### 3. Usar os arquivos de referência do projeto

Este repositório tem dois arquivos de referência que a IA deve ler:

- `KOF_REFERENCE.md` -- referência geral da linguagem
- `KOF_WEB_REFERENCE.md` -- referência específica de kof.web e HTTP client

Se estiver usando o Claude Code, esses arquivos são lidos automaticamente
via `CLAUDE.md`.

### 4. Validar SEMPRE antes de confiar

Regra de ouro: **código KOF gerado por IA deve ser compilado antes de ser commitado.**

```bash
kof run arquivo.kf
```

Se não compilar, a IA inventou sintaxe. Corrija alimentando o erro de volta
com o trecho relevante do `training/anti-patterns/fake-idioms.md`.

### 5. Regras rápidas para a IA

Se a IA insistir em gerar código errado, cole estas regras:

- KOF não tem: array literals `[1, 2, 3]`, Option/Optional, lambda com `->` em função nomeada, `for x in xs` sem `var`
- `http.get/post/put/delete/patch` existem e retornam String (não objeto Response)
- Headers são passados como String `"Nome: valor"`, não como Map
- Status codes usam `status(code, body)` dentro da rota
- `header("Nome")` retorna `null` do Java quando o header não existe, não String vazia

## Links

- [KOF GitHub](https://github.com/KofLang/Kof4j)
- [Spring Boot Docs](https://docs.spring.io/spring-boot/docs/current/reference/html/)
- [Spring AI Docs](https://docs.spring.io/spring-ai/reference/)
