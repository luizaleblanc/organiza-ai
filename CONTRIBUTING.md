# Guia de Contribuição

Para mantermos o projeto organizado e escalável, todos os contribuidores devem seguir nosso Ciclo de Vida de Software (SDLC) e entender nossa arquitetura base.

---

## Arquitetura e Stack Tecnológica

| Camada | Tecnologia | Descrição |
|---|---|---|
| **Front-end** | KOF (kof.ui) | Interface compilada utilizando o compilador/linguagem KOF para a JVM. Renderiza via KofJS em webview |
| **Back-end (BFF)** | KOF (kof.web) | Arquitetura Backend-For-Frontend desacoplada, servindo dados estruturados para o front-end |
| **Back-end (API)** | Java 17, Spring Boot 3.3.x, Spring AI | Lógica de negócio, IA conversacional, autenticação. O backend suporta dois modelos de renda: fixa (salário mensal com divisão 50/30/20) e variável (entradas extras direcionadas por regra para reserva de emergência ou orçamento). Ver docs/DATA_MODEL.md para o modelo completo. |
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

---

## Fluxo de Pull Request

O projeto usa três branches de integração permanentes -- `main`, `qa` e `dev` -- além das branches de feature. Uma mudança só chega em `main` depois de passar pelos dois ambientes intermediários.

### 1. Branch

Toda branch de feature nasce a partir do commit mais recente (HEAD) de `main` -- nunca a partir de `dev` ou `qa`, que podem estar à frente ou atrás de `main` em experimentos ainda não promovidos.

```bash
git checkout main
git pull origin main
git checkout -b feature/<numero-da-issue>-descricao-curta
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

## Links

- [KOF GitHub](https://github.com/KofLang/Kof4j)
- [Spring Boot Docs](https://docs.spring.io/spring-boot/docs/current/reference/html/)
- [Spring AI Docs](https://docs.spring.io/spring-ai/reference/)
