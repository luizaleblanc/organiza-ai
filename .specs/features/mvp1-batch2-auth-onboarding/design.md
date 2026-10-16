# Design: MVP1 Batch 2: Autenticação e Onboarding (Telas 1–7)

**Spec**: [`spec.md`](spec.md) · **Issue**: #33 · **Base**: HEAD `4d49075`, `kof 0.6.3`, SHA256 do `kof.jar` `7AA835B0604EA714113B7BD4B7EE480188F7480839E7DA4CC6607F7A29EC7BD9`

As decisões vêm de repros fora do repo: `kof build <repro> --target js` (ou `--target jvm`), páginas servidas por HTTP e abertas no Edge headless (`--headless=new`, 360×640), backend local com H2. As evidências (repros, saídas de build, screenshots, DOM e logs) ficam no scratchpad da sessão F0 (`f0\repros`, `f0\logs`, `f0\shots`). Nenhum `.kf` do repo foi alterado na F0. As decisões da moderadora e da usuária de 12/10 estão incorporadas (§9).

---

## 1. Medições (resumo)

| # | O que foi medido | Resultado | Consequência |
| --- | --- | --- | --- |
| a | `Router.route/go/back` + `Component` | `Router.go` para rota nova funciona. **Revisitar uma rota (`go` de volta ou `back`) lança `TypeError: Cannot set property length of #<CSSStyleDeclaration>` e a tela fica em branco** | Sem `Router`/`Component` (§2.1) |
| b | `Component.stateSet`, `AppState(0)` builtin | `stateSet` lança o mesmo `TypeError`. A `class AppState` do projeto esconde o builtin (`SEM023`). `Store("x")` funciona | Estado em campos `static` |
| c | `Form`, `onSubmit`, `Input.setType/setPlaceholder/setDisabled` | Clique no botão do form dispara `onSubmit` e lê `Input.text()`; atributos chegam ao DOM. `form.requestSubmit()` não disparou. `type=number` apaga `3.000,50` | `Form` + `onSubmit`; valor em `type=text` com parse próprio |
| d | `Style("css")` vs `Style(4 Ints)`, tokens | `Style("...")` aplica `linear-gradient`, `border`, `height`, `width: 100%`, `font-weight`, `tabular-nums`. `setGradient`/`setBorder` funcionam. Tokens com os valores documentados | Componentes novos com `Style("css")` (§3) |
| d2 | Cor padrão de `Label` | Sem cor explícita herda o verde `#50fa7b` do `index.html` gerado | Todo texto define a cor |
| e | Manrope | `Font("Manrope", 16)` só grava `font-family`; a fonte não é carregada | Aceito no MVP; tarefa futura FUT-1 |
| e2 | `Spacer()` | Compila; no navegador `ReferenceError: Spacer is not defined` | Proibido; usar `gap`/`margin` |
| f1 | CORS | `OPTIONS` responde 404, sem `Access-Control-*` | Same-origin (§2.3) |
| f2 | `http.post` síncrono no navegador | Devolve `[object Promise]` | Sempre `spawn` + `await` |
| f3 | `spawn` + `await` | Funciona. Rede, CORS e 5xx chegam ao `catch (String e)`. 4xx não lança: devolve o corpo, sem status | Classificar pelo corpo (§4.2) |
| f4 | Same-origin | `app.serveDir("/", KOF_WEB_OUT)` + URL relativa funcionou no servidor mínimo e numa cópia do backend real, com o middleware liberando o que fica fora de `/api/` (sem isso, `/index.html` dá 401) | §2.3 |
| f5 | `json.decode<ApiError>` no KofJS | "Usuário" vira "UsuÃ¡rio"; o texto cru vem certo | Mensagens fixas no cliente |
| g | Token entre telas | `static String token` gravado numa tela é lido na seguinte | `SessionState.token` |
| h | Dinheiro | Helper Kof (centavos em `Long`) correto em 8 casos; `String.format` lança no navegador; `math.round` não existe | `brl(Double)` |
| i | `index.html` gerado | Barra de título, status "terminated", fonte mono, moldura; igual com `--release`. Por `file://` não renderiza | Aceito no MVP; validar sempre por HTTP |
| j | `kof check frontend` | `PKG006` nos imports `core.*` | Gate é `kof build frontend --target js` |
| k | `orm.create` com coluna nova em tabela existente (H2) | Devolve `true` e **não** adiciona a coluna; `orm.all` funciona, mas `orm.save` lança `JdbcSQLSyntaxErrorException: Column "name" not found` (exceção Java, escapa do `catch (String)`). Tabela e colunas ficam com aspas e minúsculas (`"userrow"`, `"name"`) | Migração explícita (§2.6) |
| k2 | Migração condicional | Consulta fixa a `INFORMATION_SCHEMA.COLUMNS` + `ALTER TABLE "userrow" ADD COLUMN "name" VARCHAR(255) DEFAULT '' NOT NULL` só se faltar: banco novo, banco antigo (linha antiga fica com `name = ''`) e 2ª execução passam. `orm.migrate` com o mesmo ALTER funciona no banco antigo, mas **falha no banco novo** (`Duplicate column name`), porque `orm.create` já criou a coluna | §2.6 |
| l | `hasSalary` como critério | Conta só cadastrada aparece com `hassalary=true, salarycents=0`: o `register` grava `hasSalary = true` hoje | `onboardingCompleted = hasSalary && salaryCents > 0` (§4.1) |

Logs: `f0\logs\m_orm_migration.txt`, `f0\logs\m_me_hassalary.txt`, `f0\logs\f_curl_*.txt`.

---

## 2. Arquitetura

### 2.1 Navegação: `mountScreen` (decidido)

No Chromium real, o reaproveitamento de raiz do runtime (`kofUiReuseRoot`, D-UI-DIFF) copia `for (k in el.style)`, inclusive `length`, que é só leitura. Isso quebra `Component.stateSet`, `Router.back()` e `Router.go` para rota já visitada. Os testes do Kof passam porque usam DOM simulado.

Fica o mecanismo do Batch 1: `AppState.currentScreen` + `navigateTo(w, tela)` → `mountScreen(w)`. Migrar para `Router` vira tarefa futura (FUT-2), depois da correção upstream.

### 2.2 Layout das telas de entrada

Telas `welcome`, `login`, `signup`, `onb_salary`, `onb_income`, `onb_debt`, `onb_debt_amount` e `onb_result`: `View` raiz em `#0A0D18`, sem nav bar. No Mobile a coluna ocupa a largura com padding de 16px; no Desktop fica centralizada com `max-width` de 480px. As telas do app (`dashboard`, `chat`, `envelopes`) não mudam. `main.kf` começa em `welcome`.

### 2.3 Same-origin (decidido)

```text
Navegador ──GET /, /index.html, /Default.mjs──▶ backend Kof (JVM): app.serveDir("/", KOF_WEB_OUT)
          ──/api/... (relativo)────────────────▶ mesmo processo, rotas de hoje
```

- `backend/main.kf`: antes do `app.listen`, `var webOut = config.env("KOF_WEB_OUT")`; se não for nulo, `app.serveDir("/", webOut)`.
- `backend/auth.kf`: `isPublicPath(path)` devolve `true` se `path` não começa com `/api/`; dentro de `/api/` continuam públicos só `/api/auth/login` e `/api/auth/register`. `/health` fica público pela primeira regra.
- O frontend usa caminhos relativos, sem host nem configuração por ambiente.
- Dockerfile (§2.7) passa a compilar o frontend e definir `KOF_WEB_OUT`.

### 2.4 Estado (frontend)

| Classe | Campos usados | Mudança |
| --- | --- | --- |
| `AppState` | `currentScreen`, `isDesktop`, + `formError: String = ""`, `busy: Bool = false` | 2 campos |
| `SessionState` | `token`, `userEmail`, `userName`, `tier` | nenhuma |
| `OnboardingState` | `salary`, `incomeType`, `hasDebt`, `debtAmount`, `suggestedModel`, `modelDescription` + `incomeChosen`, `debtChosen`, `buckets` | 3 campos |

### 2.5 Módulos

```text
backend/
  models.kf     MUDA  LoginRequest separado de RegisterRequest(name, email, password);
                      OnboardingRequest + debtAmount; MeResponse(name, email, onboardingCompleted, tier);
                      UserEntity + name
  store.kf      MUDA  UserRow + name; ensureSchema com migração condicional (§2.6); mapeamento name
  auth.kf       MUDA  isPublicPath (§2.3)
  main.kf       MUDA  serveDir; GET /api/users/me; validações (§4.3); register grava name e hasSalary=false;
                      onboarding grava debtCents
frontend/
  core/format.kf          NOVO  brl, parseMoney, isEmailLike
  core/api_client.kf      MUDA  spawn+await, caminhos relativos, classificação (§4.2)
  core/auth_api.kf        NOVO  register, login, me, submitOnboarding
  core/theme.kf           MUDA  estilos Style("css") (§3)
  core/app_state.kf       MUDA  campos do §2.4
  core/navigation.kf      MUDA  dispatcher das telas de entrada
  components/brand_mark.kf    NOVO  logomarca em Canvas, proporção 2:1
  components/form_widgets.kf  NOVO  primaryButton, secondaryButton, textField, moneyField, choiceCard,
                                    progressDots, bucketBar, errorBanner
  screens/auth_screens.kf        NOVO  Telas 1–3
  screens/onboarding_screens.kf  NOVO  Telas 4, 5, 6, 6.1, 7
  main.kf                 MUDA  tela inicial "welcome"
scripts/ui/                NOVO  harness de build, screenshot e probe (§6)
Dockerfile, .dockerignore  MUDA  §2.7
```

### 2.6 Coluna `name` em produção (Aiven, MySQL 8.4)

`ensureSchema` fica assim, nesta ordem:

1. `orm.create<UserRow>(db)` (cria a tabela inteira, já com `name`, num banco novo; não mexe numa tabela existente);
2. consulta fixa: `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE LOWER(TABLE_NAME) = 'userrow' AND LOWER(COLUMN_NAME) = 'name'` (+ `AND TABLE_SCHEMA = DATABASE()` fora do H2, ver risco);
3. se `n = 0`: `db.execute(db, "ALTER TABLE \"userrow\" ADD COLUMN \"name\" VARCHAR(255) DEFAULT '' NOT NULL")`.

Texto fixo, sem binds e sem dados de usuário. Medido no H2 nos 3 cenários (§1 k2).

Riscos na Aiven (não medidos contra MySQL nesta fase; a produção não foi tocada):

- `ADD COLUMN IF NOT EXISTS` não existe no MySQL 8.4, por isso a checagem é por `INFORMATION_SCHEMA` e não por `IF NOT EXISTS`.
- Sem filtro de schema, uma tabela `userrow` noutro database do mesmo servidor contaria como "coluna existe". Usar `TABLE_SCHEMA = DATABASE()`; medir na F1 se o H2 aceita `DATABASE()` e, se não, montar a consulta por dialeto.
- As aspas duplas dependem do `ANSI_QUOTES` que o backend já liga na sessão MySQL.
- No MySQL 8, adicionar coluna no fim com `DEFAULT` é operação `INSTANT` (sem cópia da tabela); com poucas linhas o risco de lock é baixo.
- Se o ALTER falhar no boot, o backend não sobe (como hoje com erro de banco): melhor que subir e falhar em todo `save`.
- Gate antes do deploy: medir os 3 cenários num MySQL/MariaDB local em container, nunca na Aiven.

### 2.7 Dockerfile

- Build stage: `COPY frontend ./frontend`, depois `kof build frontend --target js --output /out/web` e `test -f /out/web/index.html && test -f /out/web/Default.mjs`.
- Run stage: `COPY --from=build --chown=kof:kof /out/web /app/web` e `ENV KOF_WEB_OUT=/app/web`.
- `.dockerignore`: tirar `frontend` da lista de exclusão (hoje o frontend nem entra no contexto).

---

## 3. Estilo

Componentes novos usam `Style("<css>")` + `setStyle`; o `Style(4 Ints)` do Batch 1 continua válido. O argumento precisa ser literal, então cada estilo vive numa função de `theme.kf`, com comentário apontando o token.

| Função | `Style(...)` |
| --- | --- |
| `entryScreenCss()` | `background: #0A0D18; padding: 16; min-height: 100%; display: flex; flex-direction: column; gap: 16; font-family: Manrope, ui-sans-serif, system-ui, sans-serif` |
| `primaryButtonCss()` | `background: linear-gradient(90deg, #00D4FF, #0066FF); color: #06121C; height: 48; width: 100%; border: none; border-radius: 12; font-size: 16; font-weight: 600` |
| `secondaryButtonCss()` | `background: transparent; color: #00D4FF; height: 48; width: 100%; border: 1.5px solid #00D4FF; border-radius: 12; font-size: 16; font-weight: 600` |
| `disabledButtonCss()` | `background: #12162A; color: #4A5578; height: 48; width: 100%; border: 1px solid rgba(255,255,255,.06); border-radius: 12; font-size: 16; font-weight: 600` |
| `inputCss()` | `background: #12162A; color: #F0F0F0; height: 48; width: 100%; border: 1px solid rgba(255,255,255,.06); border-radius: 8; padding: 0 16px; font-size: 16` |
| `choiceCss()` / `choiceSelectedCss()` | `height: 72; border-radius: 12; padding: 0 16px; background: #12162A; border: 1px solid rgba(255,255,255,.06)` / com `border: 1px solid #00D4FF; background: rgba(0,212,255,.08)` |
| `titleCss()` | `color: #F0F0F0; font-size: 24; font-weight: 500` |
| `captionCss()` | `color: #7B8EAD; font-size: 14` |
| `moneyCss()` | `color: #00D4FF; font-size: 32; font-weight: 600; font-variant: tabular-nums` |
| `trackCss()` / `fillCss()` | `height: 8; border-radius: 4; background: #12162A` / `#00D4FF`. A largura vem de `setMaxWidth(Int)`/`setFlexBasis(Int)` (existem em `KofUi.java`, **não medidos**) ou de estilos literais de 10% em 10%; medir na F6 |

---

## 4. Contratos

### 4.1 API (medido em 12/10 contra o backend local; ★ = muda neste batch)

| Chamada | Corpo | Sucesso | Erros |
| --- | --- | --- | --- |
| `POST /api/auth/register` ★ | `{"name","email","password"}` | 200, JWT cru (`text/plain`, começa com `eyJ`) | 409 `Usuário já cadastrado` (medido); ★ 400 do §4.3 |
| `POST /api/auth/login` | `{"email","password"}` | 200, JWT cru | 401 `Credenciais inválidas` (igual para e-mail inexistente e senha errada); 429 `Muitas tentativas de login. Tente de novo em 1 minuto.` a partir da 6ª tentativa no minuto (medido); ★ 400 com campo vazio |
| `POST /api/users/onboarding` ★ + Bearer | `{"salary":3000.0,"incomeType":"FIXED","hasDebt":true,"debtAmount":5000.0}` | 200 `text/plain`: `ANTI_DEBT_701020\|<descrição>\|Necessidades:70:2100.0,Pessoal:10:300.0,Quitação de Dívida:20:600.0,` | 401 `Token ausente, inválido ou expirado`; ★ 400 do §4.3 (hoje: texto → 500, negativo → 200) |
| `GET /api/users/me` ★ novo + Bearer | — | 200 `{"name":"Ana","email":"ana@x.dev","onboardingCompleted":false,"tier":"FREE"}` | 401 |

`onboardingCompleted = hasSalary && salaryCents > 0`. Além disso, o `register` passa a gravar `hasSalary = false`. A parte `salaryCents > 0` é o que cobre as contas já existentes (medido: conta só cadastrada tem `hassalary=true, salarycents=0`), sem migração de dados. Com a validação nova, todo onboarding grava `salaryCents > 0`.

`debtCents = toCents(debtAmount)` se `hasDebt`, senão 0. O modelo sugerido continua dependendo só de `hasDebt` (a regra de `suggestBudgetModel` não muda).

Modelos medidos: FIXED + dívida → `ANTI_DEBT_701020`; FIXED 3000 sem dívida → `SURVIVAL_702010`; FIXED 6000 → `STANDARD_503020`; VARIABLE → `FREELANCER_BASE_ZERO` sem buckets. Nomes na Tela 7: "50/30/20", "70/20/10", "Anti-Dívida", "80/20", "Kakeibo", "Base Zero".

### 4.2 Cliente

```kof
// Forma medida em f0/repros/g_real_web (same-origin, Chromium).
String apiPost(String path, String payload) {
    val h = spawn http.post(path, payload, apiHeaders())
    return await h
}
```

- `apiPost`/`apiGet` não capturam exceção; quem chama trata `catch (String e)` como rede ou servidor.
- Erro = `body.startsWith("{\"error\"")`. Mensagem fixa por rota e trecho ASCII do corpo: `Muitas tentativas`, `Credenciais`, `cadastrado`, `Token ausente`, `8 caracteres`; outro texto → "Confira os dados e tente de novo." Nunca mostrar o texto do `json.decode` (§1 f5).
- `/api/users/me` é JSON sem acento nos campos de controle; `json.decode<MeResponse>` serve para `onboardingCompleted` e `tier`. O `name` pode ter acento: medir na F3 e, se vier corrompido, mostrar o nome digitado no cadastro (guardado na sessão) e não o devolvido.
- Envio com `json.encode` de records; medir na F3 no JS. Se falhar, concatenação com escape de `"` e `\`.

### 4.3 Validações de backend (novas)

| Rota | Condição | Resposta |
| --- | --- | --- |
| todas `/api/*` com corpo | `json.decode` lança | 400 `{"error":"Dados inválidos."}` |
| register | `name`, `email` ou `password` vazio após `trim` | 400 `{"error":"Preencha nome, e-mail e senha."}` |
| register | senha com menos de 8 caracteres | 400 `{"error":"A senha precisa ter pelo menos 8 caracteres."}` |
| login | `email` ou `password` vazio | 400 `{"error":"Preencha e-mail e senha."}` (antes do rate limit) |
| onboarding | `salary <= 0` | 400 `{"error":"O salário deve ser maior que zero."}` |
| onboarding | `debtAmount < 0`, ou `hasDebt` com `debtAmount <= 0` | 400 `{"error":"O valor da dívida deve ser maior que zero."}` |
| onboarding | `incomeType` fora de `FIXED`/`VARIABLE` | 400 `{"error":"Tipo de renda inválido."}` |

Ponto a medir na F2: a exceção do `json.decode` para `"salary":"abc"` é `NumberFormatException` (Java). A persistência já mostrou que exceção Java escapa de `catch (String e)` em alguns caminhos. Se escapar aqui também, a saída é validar o corpo antes do `decode` ou por um `app.use` que trate a falha. A tarefa só fecha com o `curl` mostrando 400, não 500.

### 4.4 Dinheiro

- Entrada (`parseMoney`): remove espaços e `R$`; com `,`, remove os `.` e troca `,` por `.`; sem `,`, se o último `.` tem exatamente 3 dígitos depois, os `.` são milhar; senão `.` é decimal. Até 2 casas e `0 < v <= 1000000`; fora disso `throw "valor inválido"`.
- Saída: `brl(Double)` com centavos = `math.roundTo(v * 100.0, 0).toLong()`, milhar `.`, centavos `,`, negativo `- R$`.

---

## 5. Comportamento por tela

| Tela | Widgets | Ações |
| --- | --- | --- |
| 1 `welcome` | `brandMark(230)`, slogan (`captionCss`, caixa alta, `letter-spacing: .08em`, `max-width: 240`), "Criar conta", "Já tenho conta" | `signup` / `login` |
| 2 `login` | `brandMark(120)`, `Form(e-mail, senha, Entrar)`, `errorBanner`, "Não tem conta?" + "Cadastre-se" | validação → `login` → `me` → `onb_salary` ou `dashboard` |
| 3 `signup` | `brandMark(92)`, `Form(nome, e-mail, senha, confirmar, Criar conta)`, `errorBanner`, "Já tem conta?" + "Entrar" | validação → `register` → `onb_salary` |
| 4 `onb_salary` | `progressDots(0)`, título, subtítulo, `moneyField`, dica "Pode ser aproximado — dá pra ajustar depois", "Próximo" | `parseMoney` → `onb_income` |
| 5 `onb_income` | `progressDots(1)`, 2 `choiceCard`, "Próximo" desabilitado até escolher | escolha → `mountScreen` |
| 6 `onb_debt` | `progressDots(2)`, 2 `choiceCard`, "Próximo" | "Sim" → `onb_debt_amount`; "Não" → onboarding → `onb_result` |
| 6.1 `onb_debt_amount` | `progressDots(3)`, "Qual o valor aproximado da sua dívida?", subtítulo do DESIGN_SYSTEM.md, `moneyField`, "Próximo" | `parseMoney` → onboarding → `onb_result` |
| 7 `onb_result` | `progressDots(3)`, "Seu modelo: <nome>", descrição, `bucketBar` por bucket, "Começar a organizar" | `dashboard` |

Seleção de card e "busy" re-renderizam a tela com `mountScreen(w)`. Medir na F5 se o re-render de "carregando" aparece antes da resposta do `await`; se não, basta `setDisabled(true)` no botão.

---

## 6. Validação

### 6.1 Harness (vai para `scripts/ui/` na F8)

- **Build**: `kof build frontend --target js --output <tmp>/web`, exit 0.
- **Servir**: backend local com `KOF_WEB_OUT=<tmp>/web`. Nunca `file://` (tela vazia, medido).
- **Screenshot**: Edge/Chrome `--headless=new --disable-gpu --hide-scrollbars --window-size=360,640 --virtual-time-budget=6000`, **perfil novo por execução** (com perfil reaproveitado o Edge serviu `Default.mjs` velho do cache, medido).
- **Probe**: cópia do `index.html` gerado + `<script type="module">` de teste que preenche inputs, clica por `id` (`setId`) e registra `console`, `error` e `unhandledrejection`; depois `--dump-dom`. Botões de envio com clique real (`requestSubmit()` não dispara `onSubmit`).
- **Backend local**: `kof build backend --target jvm` + `java -cp "<classes>;<h2.jar>" Default.Main` com `KOF_DB_URL` em H2 temporário, `KOF_JWT_SECRET` de 64 hex e `PORT`. Nunca a produção.

Até a F8, as tarefas usam o harness do scratchpad da F0 (`f0\tools\shot.ps1`, `probe.ps1`, `build.ps1`).

### 6.2 Critério visual

Checklist da tarefa (hex e alturas lidos com `getComputedStyle`, textos exatos) mais inspeção do PNG ao lado da referência (DESIGN_SYSTEM.md + artefato Mobile). Sem diff de pixels: o artefato é React com moldura de iPhone. O chrome de dev do `index.html` fica fora da comparação (aceito no MVP).

### 6.3 Gates

- **G-BUILD**: `kof build backend --target jvm` e `kof build frontend --target js` com exit 0 (e `kof check backend`, como no Dockerfile).
- **G-BYTECODE**: igual à persistência (VerifyAll + LinkAll, controle positivo sintético acusando; o z1 deixou de acusar no 0.6.5, ver `docs/MVP1_HOMOLOGACAO.md` seção 7).
- **G-E2E**: `scripts/test_e2e_flow.ps1` com só a #44 falhando, mais os casos novos desta feature.
- **G-RESTART**: dados criados (incluindo `name` e `debtCents`) sobrevivem a matar e subir o processo.
- **G-AUTH-STATIC**: sem token, `GET /index.html` → 200 e `GET /api/dashboard`, `GET /api/users/me` e `POST /api/users/onboarding` → 401.
- **G-UI**: screenshot 360×640 conferido + probe do fluxo sem `UNCAUGHT`/`REJECT`.
- **Prova**: saída real, `kof version`, SHA256 do `kof.jar`, HEAD.

---

## 7. Plano de tarefas

Cada tarefa = 1 commit manual da usuária. Ordem: backend → `api_client` async → telas 1–3 → telas 4–7 → harness.

| ID | Tarefa | Requisitos | Gates |
| --- | --- | --- | --- |
| F1 | Backend: coluna `name` (UserRow, UserEntity, mapeamentos) + migração condicional em `ensureSchema` (§2.6); register grava `name` e `hasSalary = false`; `RegisterRequest` | B2-11 | G-BUILD, G-BYTECODE, G-E2E, G-RESTART; os 3 cenários de banco (novo, antigo, 2ª execução) no H2 |
| F2 | Backend: validações do §4.3 | B2-10 | G-BUILD, G-BYTECODE, G-E2E (+ 1 caso por linha da tabela §4.3, status e corpo exatos), G-RESTART |
| F3 | Backend: `debtAmount` → `debtCents`; `GET /api/users/me` com `onboardingCompleted` | B2-11 | G-BUILD, G-BYTECODE, G-E2E (`/me` antes e depois do onboarding; `debtcents` gravado), G-RESTART |
| F4 | Backend same-origin: `serveDir` + `isPublicPath`; Dockerfile e `.dockerignore` (§2.7) | B2-09 | G-BUILD, G-BYTECODE, G-E2E, G-RESTART, **G-AUTH-STATIC**; `docker build` local + `docker run` com H2 servindo `/index.html` (sem tocar a produção) |
| F5 | Frontend: `api_client.kf` async + `auth_api.kf` + `format.kf`; medir `json.encode` e `json.decode<MeResponse>` no JS | B2-02, B2-03, B2-07, B2-08 | G-BUILD; probe chamando register/login/me/onboarding e imprimindo os resultados do §4.1; backend desligado → `catch` |
| F6 | Frontend: estilos `Style("css")` + `form_widgets.kf` + `brand_mark.kf` + dispatcher + Tela 1 | B2-01 | G-BUILD, G-UI (Mobile e Desktop; 2 cliques) |
| F7 | Frontend: Telas 2 e 3 | B2-02, B2-03 | G-BUILD, G-UI: vazio, senha errada, 6 erros (429), 409, validações locais, sucesso → Tela 4, conta concluída → `dashboard`, backend fora |
| F8a | Frontend: Telas 4 e 5 | B2-04, B2-05 | G-BUILD, G-UI: entradas válidas e inválidas; "Próximo" com `disabled=true` antes da escolha |
| F8b | Frontend: Telas 6, 6.1 e 7 | B2-06, B2-07 | G-BUILD, G-UI: dois caminhos; Tela 7 com os buckets da spec; VARIABLE sem barras; token inválido → Tela 2; `/me` depois → `onboardingCompleted: true` |
| F9 | Harness em `scripts/ui/` (PowerShell + JS de probe, sem binários) + docs (README, DEPLOY.md, LLM_KOF_UI_GUIDELINES.md, DESIGN_SYSTEM.md "Observações KOF") | B2-12 | Rodar os scripts na Tela 1 e no fluxo da F7 |

Futuras (fora do batch):

| ID | Tarefa |
| --- | --- |
| FUT-1 | `index.html` próprio com `@font-face` da Manrope e sem o chrome de dev |
| FUT-2 | Migrar para `Router`/`Component` quando o bug de re-render for corrigido no Kof |
| FUT-3 | Gate de build do frontend no CI (screenshot no CI depende de navegador no runner) |

---

## 8. Riscos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| ALTER da coluna `name` no MySQL da Aiven não medido | Boot falha em produção | Checagem por `INFORMATION_SCHEMA` com `TABLE_SCHEMA = DATABASE()`; medir num MySQL local antes do deploy (§2.6) |
| Exceção Java do `json.decode` escapar do `catch (String)` | Salário em texto continua 500 | Medir na F2; validar antes do `decode` se preciso |
| Bug de re-render no Chromium | Sem `Router`/`Component` | `mountScreen`; relato upstream (rascunho no scratchpad) |
| Chrome de dev e Manrope | Visual diferente do design | Aceito no MVP; FUT-1 |
| `json.decode` corrompe acentos no JS | Mensagens e nome errados | Mensagens fixas; nome digitado na sessão |
| Status de 4xx invisível no `kof.http` do navegador | Classificação pelo texto, frágil se a mensagem mudar | E2E fixa os textos do backend; probe da F5 cobre os 5 trechos |
| Batch toca backend, Dockerfile e banco | Escopo maior | Tarefas F1–F4 isoladas, cada uma com G-E2E e G-RESTART |
| Token só em memória | Recarregar desloga | Fora do escopo |

---

## 9. Decisões (12/10) e pontos ainda abertos

Decidido pela moderadora e pela usuária: `mountScreen` + `static`; `Style("css")`; `spawn` + `await`; same-origin com middleware público fora de `/api/`; fluxo do DESIGN_SYSTEM.md com Tela 6.1 condicional; `debtAmount` gravado em `debtCents`; `GET /api/users/me`; só "Nome", gravado no backend; validações no backend; Manrope e chrome de dev aceitos no MVP (FUT-1); harness em `scripts/`.

Padrões escolhidos sem confirmação explícita (a usuária pode trocar):

1. Salário 0 → 400; dívida 0 com `hasDebt=true` → 400.
2. Senha mínima de 8 caracteres também no backend.
3. Pasta do harness: `scripts/ui/`.
