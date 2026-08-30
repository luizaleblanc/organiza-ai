# Guia de Contribuicao

Para mantermos o projeto organizado e escalavel, todos os contribuidores devem seguir nosso Ciclo de Vida de Software (SDLC) e entender nossa arquitetura base.

---

## Arquitetura e Stack Tecnologica

| Camada | Tecnologia | Descricao |
|---|---|---|
| **Front-end** | KOF (kof.ui) | Interface compilada utilizando o compilador/linguagem KOF para a JVM. Renderiza via KofJS em webview |
| **Back-end (BFF)** | KOF (kof.web) | Arquitetura Backend-For-Frontend desacoplada, servindo dados estruturados para o front-end |
| **Back-end (API)** | Java 17, Spring Boot 3.3.x, Spring AI | Logica de negocio, IA conversacional, autenticacao |
| **Banco de Dados** | MySQL no Render | Modelo relacional com cronjob de ping para estabilidade continua, sem dependencia de bancos temporarios |

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

  docs/                  # Documentacao tecnica e diagramas Mermaid
  DECISIONS.md           # Architecture Decision Records (ADRs)
```

---

## Ciclo de Vida do Software (SDLC)

### Fase 1 -- Design

Modelagem visual de dados atualizada em Mermaid.js e aprovacao do fluxo antes de qualquer codigo.

- Diagramas ER em `docs/DATA_MODEL.md`
- Contratos de API definidos nos specs (`specs/PHASE_X_*.md`)
- Aprovacao do maintainer obrigatoria antes de prosseguir

### Fase 2 -- Desenvolvimento

Implementacao full-stack das rotas do BFF para suportar as telas modeladas em KOF.

**Backend (Java/Spring Boot):**
```
entity -> repository -> service -> dto -> controller -> teste
```

**Frontend (KOF kof.ui):**
```
state class -> screen function -> components -> composicao no Window
```

**BFF (KOF kof.web):**
```
rotas -> middleware -> proxy para backend
```

### Fase 3 -- Code Review

Regras rigorosas de PRs (Pull Requests) para garantir a qualidade do codigo recebido pela comunidade open source.

- Cada PR tem escopo de **um modulo** (nao misturar backend + frontend)
- Testes unitarios obrigatorios para backend
- Aprovacao de pelo menos 1 maintainer
- Checklist de qualidade validado

---

## Pre-requisitos

| Ferramenta | Versao | Necessario para |
|---|---|---|
| **JDK** | 17+ | Backend (Spring Boot) |
| **KOF** | 0.2.0-beta+ | Frontend (kof.ui) e BFF (kof.web) |
| **Docker Desktop** | Qualquer | MySQL local (compose.yml) |
| **Git** | 2.40+ | Versionamento |

## Setup do Ambiente

### 1. Clone o repositorio

```bash
git clone https://github.com/luizaleblanc/organiza-ai.git
cd organiza-ai
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

**Build do codigo-fonte (alternativa):**
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

## Padroes de Codigo

### Backend (Java)

- DTOs: Java `record` (nunca classes com getters/setters)
- Injecao: constructor injection (sem `@Autowired` em campo)
- Valores monetarios: `BigDecimal`
- Testes: JUnit 5 + Mockito
- Controllers: sem logica de negocio

### Frontend (KOF)

- Arquivos: snake_case.kf
- Classes: PascalCase
- Funcoes: camelCase
- Estado mutavel: campos `static` em classe de estado
- Composicao: Window > View(Style) > Column/Row > widgets
- Target: sempre `--target=js` para UI

---

## Fluxo de Pull Request

### Branch

```bash
git checkout -b feat/modulo-descricao
# Exemplos:
# feat/budget-daily-pulse
# feat/frontend-chat-screen
# fix/auth-jwt-expiry
```

### Commits

```bash
git commit -m "feat(budget): add daily pulse calculation"
git commit -m "feat(frontend): implement onboarding screen"
git commit -m "feat(bff): add auth middleware"
git commit -m "fix(coach): fix null amount in tool calling"
git commit -m "test(transaction): add category tests"
```

Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

### Checklist do PR

```markdown
- [ ] Segue o contrato de API do spec
- [ ] Testes unitarios incluidos (backend)
- [ ] Sem logica de negocio no controller/frontend
- [ ] Compila sem warnings
- [ ] Sem arquivos pesados (node_modules, build/, .class)
```

### Review

- Aprovacao de pelo menos **1 maintainer** obrigatoria
- Feedback construtivo, com sugestoes

---

## Referencia tecnica do KOF

Consulte [docs/KOF_REFERENCE.md](docs/KOF_REFERENCE.md) para a referencia completa da linguagem, kof.ui e kof.web.

## Links

- [KOF Language](https://koflang.github.io/)
- [KOF GitHub](https://github.com/KofLang/Kof4j)
- [Spring Boot Docs](https://docs.spring.io/spring-boot/docs/current/reference/html/)
- [Spring AI Docs](https://docs.spring.io/spring-ai/reference/)
