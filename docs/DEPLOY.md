# Guia de Deploy — Organiza IA (backend Kof)

Este guia cobre o deploy do **backend Kof** (`backend/*.kf`, monólito KofLith) no **Render** via Docker.
O backend Spring Boot foi arquivado em `archive/` e não é mais publicado; o guia antigo dele está no histórico do Git.

> **Estado atual (12/10/2026):** todos os dados ficam no banco (`backend/store.kf`, `kof.orm`). Em produção o banco é
> **MySQL 8.4 na Aiven** (database `organiza_kof`). A imagem foi construída e testada localmente contra a Aiven: E2E
> 37/38 (só a #44 falha) e os dados sobrevivem a `docker restart` e a `docker kill`.

---

## Variáveis de ambiente

| Variável | Obrigatória | Padrão | Uso |
|---|---|---|---|
| `KOF_JWT_SECRET` | **sim** | — | Chave HS256 dos tokens, **mínimo 32 caracteres**. Sem ela, ou curta, o servidor **não sobe**, e a mensagem cita só o nome da variável. É a mesma variável que o runtime do Kof usa no pipeline `auth.*` do `kof.web`. Gere com `openssl rand -hex 32`. |
| `KOF_JWT_ISSUER` | não | `organiza-ai` | `iss` gravado e exigido nos tokens. Trocar invalida os tokens já emitidos. |
| `KOF_JWT_AUDIENCE` | não | `organiza-ai-api` | `aud` gravado e exigido nos tokens. |
| `KOF_DB_URL` | **sim em produção** | H2 em `./data/organiza;WRITE_DELAY=0` (fora de produção) | URL do banco **sem** usuário/senha, ex.: `mysql://<host>:<porta>/organiza_kof?sslMode=trust`. Uma URL com `@` ou `password=` derruba o boot, porque o runtime do Kof imprime a URL em alguns erros. No MySQL em produção, a URL **precisa** de `sslMode=` (`trust`, `verify-ca` ou `verify-full`), ou o boot falha: o `ssl-mode=REQUIRED` do painel da Aiven é ignorado pelo driver MariaDB, e a sessão subiria sem TLS (medido). O backend acrescenta sozinho o `ANSI_QUOTES` que a Query DSL do `kof.orm` exige. Persistência: [spec](../.specs/features/persistence-kof-orm/spec.md). |
| `KOF_DB_USER` / `KOF_DB_PASSWORD` | conforme o banco | vazio | Credenciais do banco, passadas separadas da URL. |

Timeouts do banco: em URLs `mysql://` e `mariadb://`, o backend acrescenta `connectTimeout=5000&socketTimeout=8000`, que são parâmetros do MariaDB Connector/J 3.5. Os padrões do driver são 30000 ms e 0 (sem limite). Um valor que já esteja na `KOF_DB_URL` vence. Não é preciso cadastrar variável nova.
| `KOF_ENV` | não | — | `production` torna `KOF_DB_URL` obrigatória. A imagem Docker já define `KOF_ENV=production`. |
| `PORT` | não | `3000` | Porta HTTP. O Render injeta a variável sozinho. A imagem Docker define `PORT=8080`. Um valor não numérico derruba o boot. |

Os nomes `KOF_JWT_*` vêm do `kof.config`: a chave `jwt.secret` é lida da variável `KOF_JWT_SECRET`.
Nenhum segredo entra na imagem nem no repositório (`.env` está no `.gitignore` e no `.dockerignore`).

---

## Rodar e testar localmente (sem Docker)

```powershell
# kof da versão em KOF_VERSION (hoje 0.6.5); veja docs/handoff/ANTIGRAVITY_HANDOFF.md, seção 2.1
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
- O `kof build` não copia o driver JDBC: o build stage roda `kof deps resolve` (H2 e MariaDB Connector/J fixados em `kofdeps`) e gera um fat jar com `--fat --classpath`.
- O `--fat` do Kof (medido no 0.6.3 e no 0.6.5) mantém só o primeiro `META-INF/services/java.sql.Driver` (o do H2), e aí `mysql://` falha com "driver ausente". O build stage refaz esse arquivo com os drivers de todos os jars e falha se faltar `org.mariadb.jdbc.Driver` ou `org.h2.Driver`.
- **Run stage** (`eclipse-temurin:25-jre`): usuário sem privilégios, `java -Dkof.root=/app -jar /app/kof-app.jar`, com `KOF_ENV=production` (sem `KOF_DB_URL` o container não sobe). `/app/data` pertence ao usuário `kof`, para o H2 funcionar quando `KOF_ENV` vier vazio (teste local).

**Validado em 12/10/2026** (Docker 29.3.1, Kof 0.6.3 linux): `docker build` ok. Com `KOF_ENV` vazio (H2) e com
`KOF_ENV=production` contra a Aiven (`sslMode=trust`), o E2E deu 37/38 contra o container (só a #44 falha). Uma conta
criada no container passou intacta por `docker restart` e por `docker kill` + `docker start` (login, salário,
pulso, envelope com gasto e transação), sem a senha nos logs.

**Revalidado em 16/10/2026** com Kof 0.6.5 linux: `docker build` ok (log `Kof release: kof-0.6.5-linux-x86_64`, `java.sql.Driver no jar: org.h2.Driver org.mariadb.jdbc.Driver`) e `docker run` com H2 respondendo `/health` 200.

Teste local com H2, sem banco externo: `docker run --rm -p 8080:8080 -e KOF_ENV= -e KOF_JWT_SECRET=<64 hex> organiza-ai-backend`.

---

## Render

1. No Web Service, use **Runtime: Docker** (o Render builda o `Dockerfile` da raiz; não há Build/Start Command).
2. Em **Environment**, cadastre:

   | Variável | Valor |
   |---|---|
   | `KOF_DB_URL` | `mysql://<host da Aiven>:<porta>/organiza_kof?sslMode=trust` (sem usuário e sem senha; **não** use `ssl-mode=REQUIRED`) |
   | `KOF_DB_USER` | usuário do serviço MySQL da Aiven |
   | `KOF_DB_PASSWORD` | senha desse usuário (marque como secreta) |
   | `KOF_JWT_SECRET` | valor novo, gerado na hora (`openssl rand -hex 32`), com 32 caracteres ou mais |
   | `KOF_JWT_ISSUER` | `organiza-ai` (opcional; trocar invalida tokens) |
   | `KOF_JWT_AUDIENCE` | `organiza-ai-api` (opcional) |
   | `KOF_ENV` | `production` (a imagem já define; cadastrar deixa explícito) |

   **Não** cadastre `PORT`: o Render injeta sozinho e o backend lê.
3. **Health Check Path:** `/health`, sem autenticação. A rota faz `SELECT 1` no banco e, se a conexão tiver caído, tenta reabri-la. Responde `OK` com 200 quando o banco responde e **503** (`{"error":"Banco de dados indisponível."}`) quando não responde. Com o banco fora, o 503 sai na hora se a porta recusa a conexão, e em até ~21 s se o banco fica mudo (medido com `docker pause`). **Consequência:** se o banco ficar fora, o Render vê o health check falhar e **reinicia o serviço**. Nesse caso, o boot sai com código 1 em menos de 10 s, com a mensagem `nao foi possivel conectar ao banco (esquema mysql)`, até o banco voltar. Quando o banco volta, o processo que está no ar reabre a conexão sozinho, sem precisar de reinício. O keep-alive (`.github/workflows/keep-alive.yml`, `curl -f`) também passa a ficar vermelho quando o banco cai.
4. Na Aiven, se o serviço tiver lista de IPs permitidos, ela precisa aceitar a saída do Render.
5. Depois do deploy: `curl -fsS https://<serviço>.onrender.com/health` → `OK`. O log de boot mostra `banco aberto: esquema mysql`.
6. As variáveis do Spring (`SPRING_DATASOURCE_*`, `OPENAI_API_KEY`, `API_SECURITY_TOKEN_SECRET`) não são lidas pelo
   backend Kof. Remover do serviço é decisão da usuária.

> **TLS:** `sslMode=trust` cifra a conexão (TLSv1.3, medido) mas não confere o certificado da Aiven. Para conferir,
> use `sslMode=verify-full&serverSslCert=<CA da Aiven>` (não medido aqui).

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
- [x] `docker build` e `docker run` locais + E2E contra o container (12/10/2026, H2 e Aiven).
- [ ] `KOF_DB_URL` com `sslMode=trust` (ou `verify-full`), e `KOF_DB_USER`/`KOF_DB_PASSWORD` cadastrados no Render.
- [ ] Health check do Render em `/health`.
- [ ] Keep-alive apontando para a URL nova (decisão da usuária).
