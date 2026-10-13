# MVP1 Batch 2: Autenticação e Onboarding (Telas 1–7) Specification

Issue: #33. Fase F0 (treino, medição e spec), feita em 12/10/2026 sobre o HEAD `4d49075`, com `kof 0.6.3` (SHA256 do `kof.jar`: `7AA835B0604EA714113B7BD4B7EE480188F7480839E7DA4CC6607F7A29EC7BD9`). Decisões da moderadora e da usuária incorporadas em 12/10. Arquitetura, medições e plano de tarefas: [`design.md`](design.md).

## Problem Statement

O frontend em `kof.ui` (Batch 1) só tem a casca: tema, estado, navegação e cabeçalho. A pessoa não consegue criar conta, entrar nem informar o salário, então nada do produto (pulso diário, caixinhas, coach) funciona para um usuário real. Além disso, o navegador não consegue chamar o backend: não há CORS, e o `kof.http` síncrono devolve uma Promise. O Batch 2 entrega as Telas 1 a 7 e o mínimo de backend para elas: o frontend servido pelo próprio backend, nome e dívida gravados, a rota `/api/users/me` e validação de entrada.

## Goals

- [ ] Uma pessoa nova vai da Tela 1 à Tela 7 no navegador e termina com conta criada (com nome), token em memória e perfil gravado no backend (salário, tipo de renda, dívida e modelo).
- [ ] O frontend é servido pelo backend no mesmo domínio: `GET /index.html` sem token responde 200 e `GET /api/*` sem token continua 401.
- [ ] Entrada inválida na API responde 400 com `{"error": "..."}`, nunca 500.
- [ ] Cada tela, renderizada em 360×640 no Edge headless, passa no checklist visual da sua tarefa no `design.md`.
- [ ] Todo erro de rede ou de API (400, 401, 409, 429, 5xx, rede fora) mostra uma mensagem em português na tela, sem tela em branco e sem texto técnico.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Tela 8 (Dashboard) e seguintes | Batch 3 (#32). Tela 7 e login navegam para a rota `dashboard`, que continua placeholder. |
| "Esqueci a senha" | Não há rota no backend. |
| Etapa "gastos fixos e variáveis" do artefato Mobile | Decisão: vale o fluxo do DESIGN_SYSTEM.md. |
| Sobrenome no cadastro | Decisão: só "Nome". |
| Tema claro | MVP 1 é dark. |
| `index.html` próprio com `@font-face` (Manrope) e sem o chrome de dev | Aceito no MVP; vira tarefa futura (`design.md` §7, FUT-1). |
| `Router`/`Component` | Bug medido no Chromium; volta quando o Kof corrigir (`design.md` §2.1). |
| Token persistente entre recargas | `kof.ui` não expõe storage do navegador. Recarregar volta à Tela 1. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Navegação | `mountScreen` + campos `static` | Decisão da moderadora; `Router`/`Component` quebram no Chromium (medido) | y |
| Estilo | Componentes novos com `Style("css")` | Decisão; único jeito medido de ter gradiente, borda e altura | y |
| HTTP | Sempre `spawn` + `await`, caminho relativo `/api/...` | Decisão; síncrono devolve Promise no navegador (medido) | y |
| Same-origin | Backend serve o frontend com `app.serveDir("/", KOF_WEB_OUT)`; middleware trata como pública toda rota fora de `/api/` | Decisão; o backend não tem CORS (medido) | y |
| Fluxo de onboarding | DESIGN_SYSTEM.md: Telas 4, 5, 6, 6.1 (só com dívida) e 7, 4 dots | Decisão | y |
| Nome | Só "Nome"; gravado na coluna nova `name` de `UserRow` | Decisão | y |
| Coluna nova em tabela existente | `ensureSchema` checa `INFORMATION_SCHEMA.COLUMNS` com SQL fixo e roda `ALTER TABLE "userrow" ADD COLUMN "name" VARCHAR(255) DEFAULT '' NOT NULL` só se faltar | Medido no H2: `orm.create` devolve `true` e não adiciona a coluna; o `save` seguinte lança exceção Java. Com a checagem, banco novo, banco antigo e 2ª execução passam | y |
| `debtAmount` | Entra no `OnboardingRequest` (reais, `Double`) e é gravado em `debtCents` | Decisão; a coluna já existe | y |
| Pós-login | `GET /api/users/me` → `{name, email, onboardingCompleted, tier}`; Tela 4 se `false`, rota `dashboard` se `true` | Decisão | y |
| Critério de `onboardingCompleted` | `hasSalary && salaryCents > 0`; o cadastro passa a gravar `hasSalary = false` | Medido: o cadastro grava `hasSalary = true` hoje, então uma conta sem onboarding já aparece com `hassalary=true, salarycents=0`. `salaryCents > 0` separa as contas antigas sem mudar dados | y |
| Validações de backend | E-mail, senha ou nome vazios → 400; salário ou dívida negativos → 400; salário em texto → 400 | Decisão; hoje vazio é aceito e texto dá 500 (medido) | y |
| Salário ou dívida igual a 0 | Salário 0 → 400; dívida 0 com `hasDebt=true` → 400; dívida ignorada (gravada 0) com `hasDebt=false` | Salário 0 deixaria `onboardingCompleted` falso depois de concluir; dívida em atraso de R$ 0 contradiz `hasDebt` | n |
| Senha mínima | 8 caracteres, no cliente e no backend | Valor usual; a decisão citou só "vazia" | n |
| Manrope e chrome de dev do `index.html` | Aceitos no MVP | Decisão | y |
| Mensagens de erro na tela | Textos fixos no cliente, escolhidos pela rota e por um trecho ASCII do corpo | `kof.http` no navegador não expõe o status de um 4xx, e `json.decode` corrompe acentos (medido) | y |
| Formato de dinheiro | Helper Kof `brl(Double)` | `String.format` lança no navegador (medido) | y |
| Gate de build | `kof build frontend --target js` com exit 0 | `kof check frontend` dá PKG006 (medido) | y |

**Open questions:** none. As duas linhas com `n` são padrões escolhidos com justificativa; ver `design.md` §9.

---

## User Stories

### P1: Backend serve o frontend (same-origin) ⭐ MVP

**User Story**: Como pessoa usando o app no navegador, quero que a página e a API venham do mesmo endereço, para as chamadas funcionarem sem CORS.

**Why P1**: Sem isso nenhuma tela chama a API.

**Acceptance Criteria**:

1. WHERE a variável `KOF_WEB_OUT` está definida the backend SHALL servir os arquivos dessa pasta em `/` com `app.serveDir`
2. WHEN chega `GET /index.html` ou `GET /Default.mjs` sem `Authorization` THEN the backend SHALL responder 200
3. WHEN chega qualquer `GET` ou `POST` em `/api/*` sem token, exceto `/api/auth/login` e `/api/auth/register`, THEN the backend SHALL responder 401 `{"error":"Token ausente, inválido ou expirado"}`
4. WHERE `KOF_WEB_OUT` não está definida the backend SHALL manter as rotas `/api/*` e `/health` como hoje
5. The imagem Docker SHALL compilar `frontend` com `--target js`, copiar a saída para a imagem e definir `KOF_WEB_OUT`

**Independent Test**: `curl` sem token: `/index.html` dá 200 e `/api/dashboard` dá 401; o E2E existente continua com só a #44 falhando.

---

### P1: Validação de entrada no backend ⭐ MVP

**User Story**: Como mantenedora, quero que a API recuse entrada inválida com 400 e mensagem clara, para não gravar dados ruins nem vazar texto de exceção.

**Why P1**: Hoje o cadastro aceita e-mail vazio e o onboarding aceita salário negativo (medido).

**Acceptance Criteria**:

1. IF `POST /api/auth/register` recebe `email`, `password` ou `name` vazio (após `trim`) THEN the backend SHALL responder 400 `{"error":"Preencha nome, e-mail e senha."}` sem gravar nada
2. IF `POST /api/auth/register` recebe senha com menos de 8 caracteres THEN the backend SHALL responder 400 `{"error":"A senha precisa ter pelo menos 8 caracteres."}`
3. IF `POST /api/auth/login` recebe `email` ou `password` vazio THEN the backend SHALL responder 400 `{"error":"Preencha e-mail e senha."}`
4. IF `POST /api/users/onboarding` recebe `salary` menor ou igual a 0 THEN the backend SHALL responder 400 `{"error":"O salário deve ser maior que zero."}`
5. IF `POST /api/users/onboarding` recebe `debtAmount` negativo, ou `hasDebt=true` com `debtAmount` menor ou igual a 0, THEN the backend SHALL responder 400 `{"error":"O valor da dívida deve ser maior que zero."}`
6. IF o corpo de qualquer rota `/api/*` não pode ser decodificado (por exemplo `"salary":"abc"`) THEN the backend SHALL responder 400 `{"error":"Dados inválidos."}`, nunca 500 e nunca com texto da exceção
7. IF `incomeType` não é `FIXED` nem `VARIABLE` THEN the backend SHALL responder 400 `{"error":"Tipo de renda inválido."}`

**Independent Test**: `curl` com cada entrada inválida acima e conferência do status e do corpo exatos.

---

### P1: Nome, dívida e `/api/users/me` no backend ⭐ MVP

**User Story**: Como pessoa nova, quero que meu nome e minha dívida fiquem gravados e que o app saiba se já terminei o onboarding.

**Why P1**: O pós-login depende de `onboardingCompleted`; a Tela 6.1 depende de gravar a dívida.

**Acceptance Criteria**:

1. WHEN `POST /api/auth/register` recebe `{"name","email","password"}` válidos THEN the backend SHALL gravar `name` na coluna `name` de `userrow`, gravar `hasSalary = false` e devolver o JWT
2. WHEN `POST /api/users/onboarding` recebe `{"salary","incomeType","hasDebt","debtAmount"}` válidos THEN the backend SHALL gravar `debtCents` = `debtAmount` em centavos se `hasDebt` for verdadeiro, e 0 se for falso
3. WHEN chega `GET /api/users/me` com token válido THEN the backend SHALL responder 200 `{"name":"...","email":"...","onboardingCompleted":<Bool>,"tier":"FREE|PREMIUM"}`
4. The campo `onboardingCompleted` SHALL ser `hasSalary && salaryCents > 0`
5. WHEN o backend sobe numa base em que `userrow` já existe sem a coluna `name` THEN the backend SHALL adicionar a coluna com `DEFAULT ''` antes de aceitar requisições, sem apagar linhas
6. WHEN o backend sobe numa base em que `userrow` já tem a coluna `name` THEN the backend SHALL subir sem executar `ALTER TABLE`
7. The DDL de migração SHALL ser um texto fixo no código, sem dados de usuário e sem binds

**Independent Test**: H2 com tabela antiga → sobe, `/me` de uma conta antiga dá `name: ""`; cadastro novo + onboarding → `/me` com `onboardingCompleted: true`; reinício (G-RESTART) preserva tudo.

---

### P1: Boas-vindas (Tela 1) ⭐ MVP

**User Story**: Como visitante, quero ver a marca e escolher entre criar conta e entrar.

**Why P1**: Porta de entrada do fluxo.

**Acceptance Criteria**:

1. WHEN o app abre sem token THEN the frontend SHALL mostrar a Tela 1 com a logomarca de 3 ondas, o slogan "SUA GRANA ORGANIZADA E SEM ESTRESSE." e os botões "Criar conta" e "Já tenho conta"
2. WHEN a pessoa toca "Criar conta" THEN the frontend SHALL mostrar a Tela 3
3. WHEN a pessoa toca "Já tenho conta" THEN the frontend SHALL mostrar a Tela 2
4. The Tela 1 SHALL mostrar o botão primário com gradiente de 90° de `#00D4FF` a `#0066FF`, 48px de altura e texto `#06121C`, e o secundário com fundo transparente e borda de 1,5px `#00D4FF`

**Independent Test**: screenshot 360×640 + probe clicando os dois botões.

---

### P1: Login (Tela 2) ⭐ MVP

**User Story**: Como pessoa com conta, quero entrar com e-mail e senha.

**Why P1**: Quem já tem conta precisa voltar ao app.

**Acceptance Criteria**:

1. WHEN a pessoa envia o formulário com e-mail e senha preenchidos THEN the frontend SHALL chamar `POST /api/auth/login` com `{"email":"<e-mail sem espaços nas pontas>","password":"<senha>"}`
2. WHEN o backend responde um token (corpo que não começa com `{"error"`) THEN the frontend SHALL gravar o token em `SessionState.token` e chamar `GET /api/users/me`
3. WHEN `/api/users/me` devolve `onboardingCompleted: false` THEN the frontend SHALL mostrar a Tela 4
4. WHEN `/api/users/me` devolve `onboardingCompleted: true` THEN the frontend SHALL navegar para a rota `dashboard`
5. WHEN `/api/users/me` responde THEN the frontend SHALL gravar `SessionState.userName`, `SessionState.userEmail` e `SessionState.tier`
6. IF o backend responde `Credenciais inválidas` THEN the frontend SHALL mostrar "E-mail ou senha incorretos." sem dizer qual dos dois está errado
7. IF o backend responde o erro de excesso de tentativas THEN the frontend SHALL mostrar "Muitas tentativas. Espere 1 minuto e tente de novo."
8. IF o e-mail ou a senha estão vazios THEN the frontend SHALL mostrar "Preencha e-mail e senha." sem chamar o backend
9. WHILE a chamada de login está em andamento the frontend SHALL manter o botão "Entrar" desabilitado
10. WHEN a pessoa toca "Cadastre-se" THEN the frontend SHALL mostrar a Tela 3
11. The campo de senha SHALL usar `Input.setType("password")` e o de e-mail `Input.setType("email")`

**Independent Test**: contra o backend local: senha errada mostra o item 6; conta nova vai à Tela 4; conta com onboarding vai a `dashboard`.

---

### P1: Cadastro (Tela 3) ⭐ MVP

**User Story**: Como visitante, quero criar uma conta com nome, e-mail e senha.

**Why P1**: Caminho de toda pessoa nova.

**Acceptance Criteria**:

1. WHEN a pessoa envia nome, e-mail, senha e confirmação válidos THEN the frontend SHALL chamar `POST /api/auth/register` com `{"name":"<nome>","email":"<e-mail>","password":"<senha>"}`
2. WHEN o backend responde um token THEN the frontend SHALL gravar `SessionState.token`, `SessionState.userEmail` e `SessionState.userName` e mostrar a Tela 4
3. IF o backend responde `Usuário já cadastrado` THEN the frontend SHALL mostrar "Já existe uma conta com esse e-mail. Quer entrar?"
4. IF a senha tem menos de 8 caracteres THEN the frontend SHALL mostrar "A senha precisa ter pelo menos 8 caracteres." sem chamar o backend
5. IF a senha e a confirmação são diferentes THEN the frontend SHALL mostrar "As senhas não conferem." sem chamar o backend
6. IF o e-mail não tem `@` com texto antes e depois THEN the frontend SHALL mostrar "Digite um e-mail válido." sem chamar o backend
7. IF o nome está vazio THEN the frontend SHALL mostrar "Digite seu nome." sem chamar o backend
8. WHILE a chamada de cadastro está em andamento the frontend SHALL manter o botão "Criar conta" desabilitado
9. WHEN a pessoa toca "Entrar" no rodapé THEN the frontend SHALL mostrar a Tela 2

**Independent Test**: cadastrar o mesmo e-mail duas vezes; a segunda mostra o item 3.

---

### P1: Salário (Tela 4) ⭐ MVP

**User Story**: Como pessoa nova, quero informar quanto ganho por mês.

**Why P1**: O salário é a entrada principal do modelo.

**Acceptance Criteria**:

1. WHEN a Tela 4 abre THEN the frontend SHALL mostrar os dots com o 1º ativo, o título "Quanto você ganha por mês?", o subtítulo "Vamos adaptar tudo ao seu salário", o prefixo "R$" e o campo de valor em `#00D4FF`
2. WHEN a pessoa toca "Próximo" com um valor válido THEN the frontend SHALL gravar o texto em `OnboardingState.salary` e mostrar a Tela 5
3. IF o valor está vazio, não é numérico, é menor ou igual a 0 ou maior que 1.000.000,00 THEN the frontend SHALL mostrar "Digite um valor entre R$ 1 e R$ 1.000.000." e continuar na Tela 4
4. The campo de salário SHALL aceitar `3000`, `3000,50`, `3.000,50` e `3000.50`, com no máximo 2 casas decimais

**Independent Test**: probe com `3.000,50` (vai à Tela 5) e `abc` (mensagem do item 3).

---

### P1: Tipo de renda (Tela 5) ⭐ MVP

**User Story**: Como pessoa nova, quero dizer se minha renda é fixa ou variável.

**Why P1**: `VARIABLE` leva ao modelo Base Zero.

**Acceptance Criteria**:

1. WHEN a Tela 5 abre THEN the frontend SHALL mostrar os cards "Fixa (CLT, salário todo mês)" e "Variável (freela, PJ, bicos)", nenhum selecionado, e o botão "Próximo" desabilitado
2. WHEN a pessoa toca um card THEN the frontend SHALL marcar só esse card (borda `#00D4FF`, fundo `rgba(0,212,255,.08)`) e habilitar "Próximo"
3. WHEN a pessoa toca "Próximo" THEN the frontend SHALL gravar `OnboardingState.incomeType` como `FIXED` ou `VARIABLE` e mostrar a Tela 6

**Independent Test**: probe confere `disabled=true` antes do toque e `false` depois.

---

### P1: Dívidas (Tela 6) e valor da dívida (Tela 6.1) ⭐ MVP

**User Story**: Como pessoa nova, quero dizer se tenho dívidas em atraso e quanto devo.

**Why P1**: `hasDebt` leva ao modelo Anti-Dívida e o valor fica gravado.

**Acceptance Criteria**:

1. WHEN a Tela 6 abre THEN the frontend SHALL mostrar os cards "Sim, tenho dívidas" e "Não, estou em dia", nenhum selecionado, e "Próximo" desabilitado
2. WHEN a pessoa escolhe "Sim, tenho dívidas" e toca "Próximo" THEN the frontend SHALL gravar `OnboardingState.hasDebt = true` e mostrar a Tela 6.1
3. WHEN a pessoa escolhe "Não, estou em dia" e toca "Próximo" THEN the frontend SHALL enviar o onboarding com `hasDebt=false` e `debtAmount=0.0`, sem passar pela Tela 6.1
4. WHEN a pessoa toca "Próximo" na Tela 6.1 com um valor válido THEN the frontend SHALL enviar o onboarding com `hasDebt=true` e o `debtAmount` em reais
5. IF o valor da dívida é inválido pelas regras do salário THEN the frontend SHALL mostrar "Digite um valor entre R$ 1 e R$ 1.000.000." e continuar na Tela 6.1

**Independent Test**: os dois caminhos no probe; só o "Sim" passa pela Tela 6.1, e `/me` + banco mostram `debtcents` certo.

---

### P1: Resultado (Tela 7) ⭐ MVP

**User Story**: Como pessoa nova, quero ver o modelo escolhido e quanto vai para cada parte do orçamento.

**Why P1**: Fecha o onboarding.

**Acceptance Criteria**:

1. WHEN o onboarding é enviado THEN the frontend SHALL chamar `POST /api/users/onboarding` com `Authorization: Bearer <token>` e `{"salary":<Double>,"incomeType":"FIXED|VARIABLE","hasDebt":<Bool>,"debtAmount":<Double>}`
2. WHEN o backend responde `MODELO|descrição|nome:pct:valor,...` THEN the frontend SHALL mostrar a Tela 7 com o nome amigável do modelo, a descrição e uma barra por bucket com nome, porcentagem e valor em `R$ 1.234,56`
3. WHEN o modelo é `FREELANCER_BASE_ZERO` (lista vazia) THEN the frontend SHALL mostrar a descrição sem barras
4. WHEN a pessoa toca "Começar a organizar" THEN the frontend SHALL navegar para a rota `dashboard`
5. IF o backend responde `Token ausente` THEN the frontend SHALL limpar a sessão, mostrar a Tela 2 e a mensagem "Sua sessão expirou. Entre de novo."
6. The largura preenchida de cada barra SHALL ser proporcional à porcentagem do bucket, limitada a 100%

**Independent Test**: salário 3000, FIXED, com dívida 5000 → "Anti-Dívida", barras 70% · R$ 2.100,00, 10% · R$ 300,00 e 20% · R$ 600,00.

---

### P2: Erros de rede e servidor

**User Story**: Como pessoa usando o app, quero entender quando algo falhou por causa da internet ou do servidor.

**Why P2**: O fluxo feliz funciona sem isso, mas uma falha deixaria a tela parada.

**Acceptance Criteria**:

1. IF uma chamada à API lança exceção (rede fora, timeout ou status 5xx) THEN the frontend SHALL mostrar "Não consegui falar com o servidor. Confira sua internet e tente de novo." na tela atual
2. IF a resposta é `{"error"` com um texto que o cliente não mapeia THEN the frontend SHALL mostrar "Confira os dados e tente de novo."
3. WHEN uma chamada falha THEN the frontend SHALL reabilitar o botão de envio da tela
4. The frontend SHALL fazer toda chamada HTTP com `spawn` + `await`

**Independent Test**: backend desligado → mensagem do item 1 e botão habilitado.

---

### P3: Harness de build, screenshot e probe em `scripts/`

**User Story**: Como mantenedora, quero repetir a validação visual e de fluxo com um comando, sem depender do scratchpad de uma sessão.

**Why P3**: Os gates de cada tarefa já rodam com o harness do scratchpad; versionar é o passo seguinte.

**Acceptance Criteria**:

1. WHEN alguém roda o script de screenshot com uma pasta de build THEN the harness SHALL servir a pasta por HTTP, abrir o Edge ou Chrome headless com perfil novo e salvar PNG e DOM fora do repo
2. WHEN alguém roda o script de probe com um arquivo de ações THEN the harness SHALL registrar `console`, `error` e `unhandledrejection` e sair com código diferente de 0 se houver `UNCAUGHT` ou `REJECT`
3. The harness SHALL ter só texto (PowerShell e JS), sem binários e sem `.kf`

**Independent Test**: rodar os dois scripts no bundle da Tela 1.

---

## Edge Cases

- IF o e-mail tem espaços nas pontas THEN the frontend SHALL enviá-lo sem esses espaços
- IF a pessoa toca o botão de envio duas vezes seguidas THEN the frontend SHALL fazer uma única chamada
- WHEN a resposta de erro contém acentos THEN the frontend SHALL mostrar o texto fixo do cliente, nunca o texto decodificado por `json.decode`
- IF o corpo do onboarding não tem 3 partes separadas por `|` THEN the frontend SHALL mostrar a mensagem de servidor do P2 e continuar na tela atual
- WHEN a pessoa volta da Tela 6.1 para a Tela 6 e escolhe "Não" THEN the frontend SHALL enviar `hasDebt=false` e `debtAmount=0.0`
- WHEN uma conta criada antes deste batch faz login THEN the backend SHALL devolver `name: ""` em `/me` e o frontend SHALL seguir o fluxo normalmente

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| B2-01 | P1: Boas-vindas (Tela 1) | Design | Pending |
| B2-02 | P1: Login (Tela 2) | Design | Pending |
| B2-03 | P1: Cadastro (Tela 3) | Design | Pending |
| B2-04 | P1: Salário (Tela 4) | Design | Pending |
| B2-05 | P1: Tipo de renda (Tela 5) | Design | Pending |
| B2-06 | P1: Dívidas e valor da dívida (Telas 6 e 6.1) | Design | Pending |
| B2-07 | P1: Resultado (Tela 7) | Design | Pending |
| B2-08 | P2: Erros de rede e servidor | Design | Pending |
| B2-09 | P1: Backend serve o frontend (same-origin) | Design | Pending |
| B2-10 | P1: Validação de entrada no backend | Design | Pending |
| B2-11 | P1: Nome, dívida e `/api/users/me` | Design | Pending |
| B2-12 | P3: Harness em `scripts/` | Design | Pending |

**Coverage:** 12 total, 12 mapeados para tarefas em `design.md` §7, 0 sem tarefa.

---

## Success Criteria

- [ ] `kof build frontend --target js` e `kof build backend --target jvm` saem com exit 0 em cada tarefa.
- [ ] E2E do backend (`scripts/test_e2e_flow.ps1`) com só a #44 falhando, mais os casos novos de 400, `/me` e same-origin.
- [ ] Fluxos 1→3→4→5→6→6.1→7 e 1→2→4 completos no Edge headless contra o backend local, sem `UNCAUGHT` nem `REJECT`.
- [ ] As 8 telas com screenshot 360×640 conferido contra o checklist da tarefa.
