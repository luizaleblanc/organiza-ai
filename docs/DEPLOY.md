# Guia de Deploy — Organiza IA

Este guia cobre o deploy do backend (Spring Boot) no **Render** e do banco (MySQL) na **Aiven** — ambos com camada gratuita e sem necessidade de cartão de crédito para o uso descrito aqui (verifique os termos atuais no momento do cadastro, já que planos de provedores mudam com o tempo).

Tudo que dependia só de código já foi preparado no projeto:
- `Dockerfile` na raiz (build multi-stage, testado localmente).
- `application.properties` lendo porta e credenciais do banco via variáveis de ambiente (com fallback pro `localhost` de sempre, usado com `docker compose` local).
- `management.health.redis.enabled=false` (ver `DECISIONS.md`, ADR-016) -- o projeto tem a dependência do Redis para uso futuro (Fase 5), mas nenhuma instância real precisa existir em produção hoje.

O que falta é o que só você pode fazer: criar as contas e conectar os serviços.

---

## Parte 1 — Banco de dados na Aiven

1. Acesse [console.aiven.io](https://console.aiven.io) e crie uma conta (não precisa de cartão para o plano Free).
2. **Create service → MySQL**, escolha o plano **Free** (não um trial com crédito -- o plano Free é permanente, sem prazo de expiração; ver `DECISIONS.md` ADR-016/017 sobre o incidente que motivou essa recomendação).
3. Escolha uma região e crie o serviço. Aguarde o status ficar "Running".
4. Na aba **Overview** do serviço, copie: `Host`, `Port`, `User` (geralmente `avnadmin`), `Password` e o nome do banco padrão (`defaultdb`).
5. Monte a URL JDBC no formato:
   ```
   jdbc:mysql://<HOST>:<PORT>/defaultdb?useUnicode=true&characterEncoding=UTF-8&sslMode=REQUIRED
   ```
   (a Aiven exige SSL por padrão -- `sslMode=REQUIRED` é necessário.)
6. **Atenção a inatividade**: serviços no plano Free da Aiven podem ser desligados (`powered off`) automaticamente após um período sem uso. Isso não apaga os dados (só depois de 180 dias desligado), mas a aplicação para de conseguir conectar até você reativar manualmente no console. O workflow `.github/workflows/keep-alive.yml` deste repositório ajuda a mitigar isso gerando tráfego periódico contra o backend (que por sua vez consulta o banco no boot).

---

## Parte 2 — Backend no Render

1. Acesse [render.com](https://render.com) e crie uma conta (login com GitHub facilita).
2. **New → Web Service** → conecte o repositório GitHub.
3. O Render detecta o `Dockerfile` na raiz automaticamente e builda a imagem a partir dele -- não é necessário configurar build/start command manualmente.
4. Escolha o plano **Free**.
5. Em **Environment**, adicione as variáveis:

   | Variável | Valor |
   |---|---|
   | `SPRING_DATASOURCE_URL` | a URL JDBC montada na Parte 1 |
   | `SPRING_DATASOURCE_USERNAME` | usuário da Aiven (Parte 1) |
   | `SPRING_DATASOURCE_PASSWORD` | senha da Aiven (Parte 1) |
   | `OPENAI_API_KEY` | sua chave da OpenAI |
   | `API_SECURITY_TOKEN_SECRET` | **gere uma chave nova e forte** (ex: `openssl rand -hex 32`) -- nunca use um valor de exemplo em produção |

   O Render já injeta `PORT` automaticamente -- não precisa configurar isso (`server.port=${PORT:8080}` em `application.properties` já lida com isso).
6. Clique em **Deploy**. O Render builda a imagem Docker e sobe o serviço (esse processo pode levar alguns minutos na primeira vez).
7. **Teste**: acesse `https://sua-url.onrender.com/actuator/health` -- esperado: `{"status":"UP","groups":["liveness","readiness"]}`.

---

## Checklist final

- [ ] Aiven MySQL no plano **Free** (não trial), status "Running".
- [ ] Backend responde `UP` em `https://.../actuator/health`.
- [ ] `API_SECURITY_TOKEN_SECRET` foi trocado pro valor gerado (não é um valor de exemplo).
- [ ] Workflow `.github/workflows/keep-alive.yml` ativo (aba **Actions** do repositório no GitHub) para reduzir o risco de o serviço dormir por inatividade.

## Observações importantes

- **MySQL da Aiven em plano Free tem 1GB de storage/RAM** e pode hibernar por inatividade (ver Parte 1, passo 6) -- normal em camadas gratuitas, não indica bug na aplicação. Ver `DECISIONS.md` ADR-016/017 para o histórico de um incidente real causado por isso.
- **Render Free** também hiberna o serviço web após um período sem tráfego (cold start no próximo request) -- o mesmo workflow de keep-alive ajuda a mitigar isso.
- **Custos**: confirme o plano atual do Render/Aiven no momento do cadastro -- políticas de camada gratuita mudam com frequência nesses provedores.
- **Frontend e BFF (KOF)**: o frontend (`kof.ui`) e o BFF (`kof.web`) ainda não têm um guia de deploy documentado -- ambos rodam localmente hoje (`kof run` / `kof serve`, ver `CONTRIBUTING.md`). Este guia cobre só o backend Java, que é o único componente em produção no momento.
