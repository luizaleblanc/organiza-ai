# Guia de Deploy — Organiza IA (backend Kof)

Este guia cobre o deploy do **backend Kof** (`backend/*.kf`, monólito KofLith) no **Render** via Docker.
O backend Spring Boot foi arquivado em `archive/` e não é mais publicado; o guia antigo dele está no histórico do Git.

> **Estado atual (12/10/2026):** o backend abre o banco e cria as tabelas no boot (`backend/store.kf`, T1 da
> [persistência](../.specs/features/persistence-kof-orm/design.md)), mas as rotas ainda gravam em memória (`BackendDb`):
> os dados continuam sumindo a cada reinício até as tarefas T2–T7.

---

## Variáveis de ambiente

| Variável | Obrigatória | Padrão | Uso |
|---|---|---|---|
| `KOF_JWT_SECRET` | **sim** | — | Chave HS256 dos tokens, **mínimo 32 caracteres**. Sem ela, ou curta, o servidor **não sobe**, e a mensagem cita só o nome da variável. É a mesma variável que o runtime do Kof usa no pipeline `auth.*` do `kof.web`. Gere com `openssl rand -hex 32`. |
| `KOF_JWT_ISSUER` | não | `organiza-ai` | `iss` gravado e exigido nos tokens. Trocar invalida os tokens já emitidos. |
| `KOF_JWT_AUDIENCE` | não | `organiza-ai-api` | `aud` gravado e exigido nos tokens. |
| `KOF_DB_URL` | **sim em produção** | H2 em `./data/organiza;WRITE_DELAY=0` (fora de produção) | URL JDBC do banco **sem** usuário/senha (ex.: `jdbc:postgresql://host:5432/organiza`). Uma URL com `@` ou `password=` derruba o boot, porque o runtime do Kof imprime a URL em alguns erros. Persistência: [spec](../.specs/features/persistence-kof-orm/spec.md). |
| `KOF_DB_USER` / `KOF_DB_PASSWORD` | conforme o banco | vazio | Credenciais do banco, passadas separadas da URL. |
| `KOF_ENV` | não | — | `production` torna `KOF_DB_URL` obrigatória. A imagem Docker já define `KOF_ENV=production`. |
| `PORT` | não | `3000` | Porta HTTP. O Render injeta a variável sozinho. A imagem Docker define `PORT=8080`. Um valor não numérico derruba o boot. |

Os nomes `KOF_JWT_*` vêm do `kof.config`: a chave `jwt.secret` é lida da variável `KOF_JWT_SECRET`.
Nenhum segredo entra na imagem nem no repositório (`.env` está no `.gitignore` e no `.dockerignore`).

---

## Rodar e testar localmente (sem Docker)

```powershell
# kof da versão em KOF_VERSION (hoje 0.6.3); veja docs/handoff/ANTIGRAVITY_HANDOFF.md, seção 2.1
kof check backend
kof build backend --target jvm --output <pasta-fora-do-repo>\classes

# mesma execução do `kof run` (kof-cli CmdRun): java -cp <classes> Default.Main
$env:KOF_JWT_SECRET = "<64 caracteres hex>"
$h2 = kof deps resolve . | Select-Object -Last 1            # driver H2 do kofdeps (cache em ~/.kof/deps)
java -cp "<pasta-fora-do-repo>\classes;$h2" Default.Main   # sobe na porta 3000 (ou em $env:PORT); banco H2 em .\data

# suíte E2E: sobe o servidor sozinha; sem KOF_JWT_SECRET, gera uma aleatória para a execução
powershell -ExecutionPolicy Bypass -File scripts\test_e2e_flow.ps1 -ClassesDir <pasta-fora-do-repo>\classes -ExtraClasspath $h2
```

**Java:** é preciso o **JDK/JRE 25 ou mais novo**. As classes do projeto são V21, mas o runtime do Kof que o
`kof build` copia junto (`dev/kof/runtime/*`) é compilado pelo JDK 25 do pacote. Num Java 21, o boot morre com
`UnsupportedClassVersionError ... class file version 69.0`.

---

## Docker

```bash
docker build -t organiza-ai-backend .                                              # Kof fixado em KOF_VERSION
docker build --build-arg KOF_TAG=latest -t organiza-ai-backend .  # estável mais recente (só para avaliar troca)
docker run --rm -p 8080:8080 -e KOF_JWT_SECRET=<64 hex> -e KOF_DB_URL=<url sem credenciais> -e KOF_DB_USER=... -e KOF_DB_PASSWORD=... organiza-ai-backend
curl -fsS http://localhost:8080/health                                             # → OK
```

- **Build stage** (`debian:bookworm-slim`): resolve o release Linux mais recente do Kof (ou o `KOF_TAG` fixo),
  baixa o `.tar.gz`, confere o SHA256 contra o `SHA256SUMS` do próprio release e roda `kof check` + `kof build`.
  O tag usado sai sempre no log (`Kof release: ...`).
- O `kof build` não copia o driver JDBC: o build stage roda `kof deps resolve` (drivers fixados em `kofdeps`) e gera um fat jar com `--fat --classpath`.
- **Run stage** (`eclipse-temurin:25-jre`): usuário sem privilégios, `java -Dkof.root=/app -jar /app/kof-app.jar`, com `KOF_ENV=production` (sem `KOF_DB_URL` o container não sobe).

> **Gate pendente:** a imagem ainda **não foi construída nem executada** (o Docker local estava parado em 07/10).
> A lógica de download e SHA256 do build stage foi validada fora do container. Antes do primeiro deploy, rode o
> `docker build`/`docker run` acima e o E2E apontando para o container.

---

## Render

1. No Web Service, use **Runtime: Docker** (o Render builda o `Dockerfile` da raiz).
2. Em **Environment**, cadastre `KOF_JWT_SECRET` (valor novo e forte). `KOF_JWT_ISSUER` e `KOF_JWT_AUDIENCE` são opcionais.
   O Render injeta `PORT` sozinho.
3. **Health Check Path:** `/health` (responde `OK` com 200, sem autenticação).
4. As variáveis do Spring (`SPRING_DATASOURCE_*`, `OPENAI_API_KEY`, `API_SECURITY_TOKEN_SECRET`) não são lidas pelo
   backend Kof. Remover do serviço é decisão da usuária.

> O serviço que está hoje no Render ainda é o Spring antigo (`/actuator/health`). Trocar para esta imagem é um
> deploy e depende do ok da usuária.

---

## Keep-alive

`.github/workflows/keep-alive.yml` faz `curl -fsS` na URL configurada nele. Com `-f`, uma resposta HTTP de erro
deixa o job **vermelho**; antes, sem `-f`, ele ficava verde até com `HTTP 503`, como no run de 07/10 16:09Z.
Hoje ele ainda aponta para o `/actuator/health` do serviço Spring antigo, então fica vermelho até o serviço ser
trocado. Trocar a URL para `/health`, mudar a frequência ou desativar é decisão da usuária.

---

## Checklist

- [ ] `KOF_JWT_SECRET` gerado na hora (nunca um valor de exemplo), com no mínimo 32 caracteres.
- [ ] `docker build` e `docker run` locais + E2E contra o container (gate pendente).
- [ ] Health check do Render em `/health`.
- [ ] Keep-alive apontando para a URL nova (decisão da usuária).
- [ ] Ciente de que, sem persistência, os dados se perdem a cada reinício.
