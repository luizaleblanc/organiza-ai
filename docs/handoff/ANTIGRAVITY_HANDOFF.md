# Handoff para o Antigravity: Organiza AI até o deploy estável no Render

> **Para quem:** o agente executor no Antigravity (modelo padrão: **Gemini Flash 3.8, esforço alto**).
> **Origem:** sessão de moderação de 07/10/2026 (HEAD `251e495` + working tree da Fase 1).
> **Uso:** leia este arquivo inteiro antes de qualquer ação. Cada link é uma fonte para
> recuperar sob demanda (RAG): abra o link quando a tarefa precisar dele, não antes.

---

## 0. Regras invioláveis (resumo; a fonte é o [CLAUDE.md](../../CLAUDE.md), seção "Regras de Sessao")

1. **A IA nunca faz `git add`, `commit` nem `push`.** Entregue os blocos de comando e a usuária digita.
   Os blocos **nunca** levam `Co-Authored-By` nem rodapé "Generated with".
   Formato: `fix(backend): ...` | `feat(frontend): ...` | `test(e2e): ...` | `ci: ...` | `docs: ...`, um commit por mudança.
2. **A fonte de verdade é o [KofLang/Kof4j](https://github.com/KofLang/Kof4j).** A ordem de autoridade é:
   implementação > testes > docs > `training`. Nunca invente sintaxe.
3. **Treine-se antes de escrever qualquer `.kf`** (seção 3).
4. **Não suje a árvore git.** Builds, jars, clones e harnesses ficam **fora do repo**
   (por exemplo em `%TEMP%\organiza-scratch\`). Não apague arquivos existentes: liste-os e pergunte.
5. **Use `kof.security`:** `passwords.hash/verify`, `security.constantTimeEquals`, `secrets.*`.
   Nenhum segredo escrito no código e nenhum segredo em log.
6. **Mantenha a documentação congruente** ([README](../../README.md), [PROJECT_STATUS](../../PROJECT_STATUS.md),
   [CLAUDE.md](../../CLAUDE.md), [.specs/STATE.md](../../.specs/STATE.md)) e atualize o README ao fim da sessão.
7. **Issues:** comentário de progresso, links de referência, demanda explícita e badge
   (`good first issue` / `intermediario` / `avancado`).
8. **"Verde" exige prova semântica:** a saída real do comando, `kof version`, o SHA256 do jar e o HEAD.
   "Não crashou" não é prova ([weak-green-proof](https://github.com/KofLang/Kof4j/blob/main/training/anti-patterns/weak-green-proof.md)).
9. **Publicação externa** (issues/PRs no KofLang/Kof4j, deploy) **só com o ok explícito da usuária.**

---

## 1. Estado atual (fatos verificados em 07/10/2026)

**Antes de agir, rode `git status` e `git log --oneline -10` para saber onde a última sessão parou.**

| Item | Estado |
|---|---|
| Backend (`backend/*.kf`) | Compila no kof 0.5.0-beta **só com o contorno** `orZero` ([models.kf](../../backend/models.kf)). Issue [#41](https://github.com/luizaleblanc/organiza-ai/issues/41). |
| Raiz do #41 | Um `T?` primitivo (`Double?`) estreitado, quando atribuído ou retornado, não recebe unbox: dá `COMP002` ou `VerifyError` ao carregar a classe. O upstream §610 (#770, branch `lab`) corrige só parte. |
| Crash escondido | `kof build` com exit 0 **não prova nada**: o `VerifyError` só aparece quando a classe é carregada. Por isso o gate exige verificação de bytecode (seção 5, gate G-BYTECODE). |
| `json.decode<T>` com campo enum | `argument type mismatch`. Contornado no 1E: `category` como String + `Category.valueOf`, com 400 para valor inválido. |
| E2E ([test_e2e_flow.ps1](../../scripts/test_e2e_flow.ps1)) | **20/21** (Fase 1 fechada). O único FAIL é o "tier-status conta as mensagens do chat", que deve continuar **vermelho** até a issue [#44](https://github.com/luizaleblanc/organiza-ai/issues/44) (datas reais + `enforceCanSendMessage` nunca chamado). |
| Persistência | **Não existe banco.** Os dados ficam em listas estáticas na memória ([services.kf](../../backend/services.kf), `BackendDb`) e somem a cada reinício. |
| Segurança | **Fase 2 (07/10):** senha com `passwords.hash`/`verify` (mesma resposta 401 e mesmo custo para e-mail inexistente); `KOF_JWT_SECRET` obrigatória (≥ 32 caracteres, o boot falha sem ela); `jwt.verify` com iss/aud; autenticação central (`currentClaims`/`currentUserId` em [auth.kf](../../backend/auth.kf)); fim do IDOR e do `"usr_1"`; erros via `json.encode(ApiError)`; rate limit de login (5/min por e-mail → 429). |
| Deploy | [Dockerfile](../../Dockerfile) do monólito Kof (Kof Linux mais recente com SHA256 → **JRE 25**); porta via `PORT` (padrão 3000). **Imagem ainda não construída** (Docker local parado em 07/10). O serviço no Render ainda é o Spring antigo e respondeu `503`/timeout em 07/10. O [keep-alive.yml](../../.github/workflows/keep-alive.yml) agora usa `curl -fsS` (fica vermelho com erro), mas ainda aponta para `/actuator/health`. |
| CI | [kof-check.yml](../../.github/workflows/kof-check.yml) reescrito em 07/10: Kof Linux mais recente com SHA256, `kof check`+`build` do `backend`, `kof build frontend --target js` (o `kof check frontend` dá `PKG006`), sem o `bff/`. **Ainda sem run verde comprovado** (depende do push). |
| kof.ui | **Tem** Router, Component, Store, `AppState(initial)`, Form, Select, Table, Image, Canvas, `Style("css")` e os tokens Spacing/Typography ([KOFUI-AUDIT](https://github.com/KofLang/Kof4j/blob/main/docs/bugs-and-gaps/KOFUI-AUDIT.md)). A regra 7 do CLAUDE.md está desatualizada. |

### Decisões que só a usuária pode tomar
- Publicar os 3 rascunhos de issue upstream (A: unbox em store/return; B: `math.max/min` aceita `Double`; C: `json.decode` com enum).
- Desligar ou trocar o keep-alive e o serviço antigo no Render.
- Apagar `.kof_preview/` (cerca de 58 GB aparentes no OneDrive), `bin/`, `build/` e `.claude/worktrees/`.

---

## 2. Setup do ambiente

### 2.1 Instalar a versão do Kof fixada no projeto (Windows, PowerShell)

A versão do projeto vive em um só lugar: o arquivo [`KOF_VERSION`](../../KOF_VERSION) na raiz (hoje `kof-0.6.3`),
lido pelo [Dockerfile](../../Dockerfile) e pelo [kof-check.yml](../../.github/workflows/kof-check.yml). Os dois recusam tags
marcadas como *prerelease* no GitHub.

```powershell
# 1. Usa a versão fixada (os tags são por plataforma)
$tag = (Get-Content KOF_VERSION -Raw).Trim() + "-windows-x86_64"
$dest = "$env:LOCALAPPDATA\kof\$tag"
New-Item -ItemType Directory -Force $dest | Out-Null

# 2. Baixa o pacote e o SHA256SUMS
gh release download $tag -R KofLang/Kof4j -p "*.zip" -p "SHA256SUMS" -D $dest --clobber

# 3. Confere a integridade
$zip = Get-ChildItem $dest -Filter *.zip | Select-Object -First 1
$esperado = (Select-String -Path "$dest\SHA256SUMS" -Pattern $zip.Name).Line.Split(" ")[0]
if ((Get-FileHash $zip.FullName -Algorithm SHA256).Hash.ToLower() -ne $esperado.ToLower()) { throw "SHA256 nao confere" }

# 4. Extrai e coloca no PATH (só nesta sessão)
Expand-Archive $zip.FullName -DestinationPath $dest -Force
$bin = (Get-ChildItem $dest -Directory -Filter "kof-*" | Select-Object -First 1).FullName + "\bin"
$env:PATH = "$bin;$env:PATH"
kof version; kof info
```

**Política de versão:**
- **Trocar de versão é um commit próprio** (`build: fixar kof X.Y.Z ...`) que só edita `KOF_VERSION`, feito **depois** de rodar todos os gates da seção 5 na versão nova, instalada fora do repo. Nunca use "a mais recente" sem fixar: o Kof publica vários releases por dia.
- Para avaliar uma versão nova: instale-a com o tag explícito e rode **todos** os gates (a linha de base medida é a `0.6.3`; a comparação 0.5.0-beta × 0.6.3 está no relatório de 12/10).
  - Para cada `// WORKAROUND:` (`orZero` e o enum), teste a forma idiomática num repro **fora do repo**.
  - Se o bug sumiu, proponha remover o contorno como um commit separado.
- **Se a versão nova quebrar algo** que passava, volte para o `kof-0.5.0-beta-windows-x86_64` e reporte com o repro.
- **Registre** `kof version` e o SHA256 do zip em todo relatório.
- **Correções que só existem no branch `lab`** do Kof4j não estão em release. Não dependa delas sem o ok da usuária.

### 2.2 Ferramentas e MCPs

Configure no Antigravity os servidores MCP abaixo, seguindo a documentação de MCP do próprio Antigravity:

| Necessidade | MCP / ferramenta | Uso |
|---|---|---|
| Ler issues, PRs, código e releases do Kof4j e do organiza-ai | **GitHub MCP oficial** (`github/github-mcp-server`) ou a CLI `gh` autenticada | RAG nos links deste documento; comentar issues do próprio repo |
| Ler arquivos crus do training | `fetch` / web, nos links `raw.githubusercontent.com` da seção 3 | Treino |
| Terminal local | o terminal integrado (PowerShell 5.1 e Git Bash) | `kof`, `java`, E2E |
| JDK para os harnesses | o JDK que vem no pacote do Kof (`jdk/` dentro da distribuição) | rodar `VerifyAll.java` / `LinkAll.java` |

Não configure MCPs de deploy (Render) com permissão de escrita sem o ok da usuária.

---

## 3. Treino obrigatório no Kof (RAG)

Leia **só os arquivos em inglês**, porque os `.pt_BR.md` duplicam o conteúdo e dobram o custo. Base raw:
`https://raw.githubusercontent.com/KofLang/Kof4j/main/training/`

**Núcleo (leia sempre, no início da sessão):**
- [README](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/README.md) e o [README do repositório](https://raw.githubusercontent.com/KofLang/Kof4j/main/README.md)
- language: [overview](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/language/overview.md), [syntax](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/language/syntax.md), [types](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/language/types.md), [classes](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/language/classes.md), [exceptions](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/language/exceptions.md), [security](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/language/security.md)
- anti-patterns: [fake-idioms](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/anti-patterns/fake-idioms.md), [common-mistakes](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/anti-patterns/common-mistakes.md), [weak-green-proof](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/anti-patterns/weak-green-proof.md), [sentinel-values](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/anti-patterns/sentinel-values.md)

**Por tarefa (abra só quando a fase pedir):**

| Fase | Arquivos |
|---|---|
| Segurança | [idioms/security](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/idioms/security.md), [idioms/web](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/idioms/web.md), [examples/security.kf](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/examples/security.kf) |
| Persistência | [idioms/database](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/idioms/database.md), [idioms/records](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/idioms/records.md), [idioms/collections](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/idioms/collections.md) |
| Datas, config e porta | [idioms/stdlib](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/idioms/stdlib.md) (seções `time`, `config`, `log`) |
| Arquitetura e erros | [idioms/architecture](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/idioms/architecture.md), [idioms/errors](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/idioms/errors.md), [idioms/classes](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/idioms/classes.md) |
| Build e CLI | [reference/targets](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/reference/targets.md), [tooling/cli](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/tooling/cli.md), [distribution/install](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/distribution/install.md) |
| Frontend (fora deste handoff) | [idioms/ui](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/idioms/ui.md), [language/ui](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/language/ui.md) |
| Bugs conhecidos do compilador | [known-bugs](https://github.com/KofLang/Kof4j/blob/main/docs/bugs-and-gaps/known-bugs.md) (busque pelo código de erro; não leia inteiro) |

**Em caso de dúvida sobre se uma API existe,** confirme nos testes do compilador
([kof-compiler/src/test](https://github.com/KofLang/Kof4j/tree/main/kof-compiler/src/test/java/dev/kof/compiler)),
por exemplo `RouterE2ETest`, `KofOrmE2ETest`, `UiStyleCssE2ETest`.

**Fatos que o corpus ensina e que já morderam este projeto:**
- Não existe `fun`.
- `class X(...)` é um record imutável; para estado mutável, use campos + `constructor`.
- Escrever `= null` diretamente dá `SEM048`.
- Exceções são Strings: `throw "msg"` e `catch (String e)`.
- Coleções aceitam um tipo só (`SEM056`).
- Não existem `?.`, `?:`, `!!`, `[1,2]` nem `"${x}"`.
- "JavaFX runtime components not found" na verdade é um `VerifyError`: use `java -Xdiag`.

---

## 4. Orçamento de tokens (base: Gemini Flash 3.8, esforço alto)

> **Premissa a confirmar no Antigravity:** a janela de contexto exata do Gemini Flash 3.8 não foi
> verificada nesta sessão. O orçamento abaixo é conservador e assume uma janela grande
> (da ordem de centenas de milhares de tokens). Use no máximo cerca de 40% dela por tarefa, para sobrar espaço para raciocínio e saídas.

| Bloco | Custo aproximado | Regra |
|---|---|---|
| Este handoff | ~8k | Sempre no início |
| Treino núcleo (seção 3, só EN) | ~25k | Uma vez por sessão |
| Treino por tarefa | 5–15k por fase | Só a linha da fase atual |
| Código do backend (`backend/*.kf`, ~1k LOC) | ~15k | Leia o arquivo inteiro antes de editar |
| Saídas de build, E2E e verificador | 2–10k por execução | Guarde a saída completa em arquivo fora do repo e cole no contexto **só o resumo e os erros** |
| **Teto por fase** | **≤ 120k** | Se passar disso, feche a fase com relatório e recomece com um contexto limpo (este doc + o relatório anterior) |

**Esforço alto** serve para decisões de segurança, persistência e diagnóstico de crash. Para tarefas mecânicas (renomear, mudar uma linha de YAML), prefira esforço médio ou baixo.

---

## 5. Os 6 passos até um deploy que não crasha

Ordem recomendada: **1 → 2 → 4 → 5 → 6 → 3.** Com os passos de 1 a 6 sem o 3, o deploy fica estável, mas sem persistência.
**Cada passo termina com um relatório e uma PAUSA para revisão da usuária.**

### Gates reutilizáveis

- **G-BUILD:** `kof check backend` com exit 0 **e** `kof build backend --target jvm --output <fora-do-repo>` com exit 0.
- **G-BYTECODE (obrigatório; pega o crash escondido):**
  1. **Verificação estática:** rode o verificador do ASM (`Analyzer` + `SimpleVerifier`) em **todos** os `.class`
     gerados, inclusive as classes `LambdaN` das rotas. O ASM já vem dentro do jar do kof-cli; descubra o pacote com `jar tf`.
     Mostre a contagem de classes e métodos verificados, e 0 erros.
  2. **Linkagem forçada:** `Class.forName(nome, true, loader)` em cada classe, sob `java -Xverify:all -Xshare:off`.
     Antes, inspecione os `<clinit>` com `javap -c -p`: nenhum pode subir servidor nem abrir rede.
  3. **Controle positivo:** um repro conhecido (por exemplo `Double f(Double? v){ if (v != null) { return v } return 0.0 }`)
     **tem que** acusar erro. Se não acusar, o harness está quebrado.
  4. Os harnesses (`VerifyAll.java`, `LinkAll.java`) ficam **fora do repo**. Se existirem de uma sessão anterior,
     estão em `%TEMP%\claude\...\scratchpad\tools\`; se não, recrie a partir desta descrição.
- **G-E2E:** [scripts/test_e2e_flow.ps1](../../scripts/test_e2e_flow.ps1) com a saída completa. O stderr do servidor não pode ter `VerifyError`/`LinkageError`.
  **Nunca enfraqueça um assert** para ficar verde.
- **G-DOCS:** README, PROJECT_STATUS, CLAUDE.md e `.specs/STATE.md` atualizados sem contradições.

### Passo 1: Fechar a Fase 1 (destravar o backend). **CONCLUÍDO em 07/10**
> 1A, 1B, 1C, 1E, 1F (#44), 1G e 1H prontos. Falta só a usuária aplicar os 4 commits
> (1A → 1B → 1E → 1C, via `git apply --cached` dos patches da sessão anterior). Confira com `git log`.
> Os rascunhos upstream A/B/C ficaram no scratchpad daquela sessão, **não publicados**.
> **Próximo: Passo 2** (concluído na Fase 2; ver abaixo).
- [ ] Verificar se os commits 1A (`orZero`), 1B (onboarding) e 1C (E2E) já foram feitos pela usuária (`git log`).
- [ ] **1E, contorno do enum:** `PersistTransactionInput.category` vira `String`, convertida com `Category.valueOf(...)`
      (que devolve `Category?`; estreite com `!= null`). Valor inválido devolve `status(400, json.encode(...))`.
      Marque com `// WORKAROUND: json.decode<T> com campo enum = argument type mismatch`.
- [ ] **1F:** abrir uma issue (badge `intermediario`, labels `backend`, `koflith`) para as datas reais e o limite freemium.
  - Conteúdo: `createdAt` fixo/nulo em [services.kf](../../backend/services.kf) (~linha 513) e no chat em [main.kf](../../backend/main.kf); data de corte `"2026-09-01"` fixa em 4 rotas.
  - Critério de aceite: o E2E 19 passa.
- [ ] **1G:** criar só os labels `intermediario` e `avancado`.
- [ ] **1H:** 3 rascunhos de issue upstream (A, B, C) **fora do repo. Não publique.**
- **Gate:** G-BUILD, G-BYTECODE e G-E2E. Esperado: só o teste 19 vermelho.

### Passo 2: Segurança mínima. **CONCLUÍDO em 07/10 (Fase 2: 2A, 2B, 2C)**
> Variável única do segredo: `KOF_JWT_SECRET`. O `config.required("jwt.secret")` lê exatamente ela, e o runtime
> usa a mesma no pipeline `auth.*`, que valida assinatura e exp **sem** iss/aud. Por isso iss/aud são checados no
> ponto central (`currentClaims`). E2E: 36/37 (só a #44), com boot sem segredo, tokens forjados, IDOR e 429.
- [ ] Senha: guardar `passwords.hash`; conferir no login com `passwords.verify`.
- [ ] JWT: remover o segredo literal de fallback ([auth.kf](../../backend/auth.kf)). O segredo vem de `secrets`/`config.required`, e o boot falha com mensagem clara se ele faltar.
      Atenção: o runtime também lê `KOF_JWT_SECRET` no `<clinit>`; documente qual variável vale.
- [ ] `jwt.verify(token, secret, iss, aud)` com 4 argumentos, com `iss`/`aud` vindos de config.
- [ ] Autenticação em um único ponto, que devolve `AuthClaims`. O `userId` vem **só** de `claims.sub`.
      Remover o fallback `"usr_1"`, o `query("userId")` e o `userId` vindo do body.
- [ ] Mensagens de erro montadas com `json.encode` de um record, nunca concatenando JSON.
- **Gate:** G-BUILD, G-BYTECODE e G-E2E, mais estes casos negativos novos:
  - senha errada → 401;
  - token de A acessando dados de B → 403 ou 404;
  - sem segredo configurado → o boot falha.

### Passo 4: Porta vinda do Render. **CONCLUÍDO em 07/10 (2D)**
- [ ] Trocar o `app.listen(3000)` por uma porta lida de `PORT`, com 3000 como padrão.
      Use `config`/`secrets` conforme o [stdlib idioms](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/idioms/stdlib.md).
      Lembre que `app.listen` aceita **só Int** (`SEM025`).
- **Gate:** G-BUILD, G-BYTECODE, servidor subindo com `PORT=8080` e respondendo `/health` = 200.

### Passo 5: Dockerfile do monólito Kof. **PARCIAL em 07/10 (2E)**: Dockerfile, `.dockerignore` e DEPLOY.md prontos; o gate de container ficou PENDENTE (Docker local parado)
- [ ] Reescrever o [Dockerfile](../../Dockerfile):
  - **build stage:** baixa o pacote Linux do Kof **mais recente** (mesma lógica da seção 2.1, com `linux-x86_64` e verificação do SHA256) e roda `kof build backend --target jvm`;
  - **run stage:** **JRE 25** e o comando de execução correto. As classes do projeto são V21 (major 65), mas o runtime do Kof copiado junto (`dev/kof/runtime/*`) é V25 (major 69): num JRE 21, o boot morre com `UnsupportedClassVersionError` (medido em 07/10);
  - leia [reference/targets](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/reference/targets.md) e confirme como rodar as classes geradas.
- [ ] Atualizar o [.dockerignore](../../.dockerignore) para excluir `archive/`, `.kof_preview/`, `bin/`, `build/` e `.claude/`.
- [ ] Atualizar o [docs/DEPLOY.md](../DEPLOY.md), que hoje descreve o Spring.
- **Gate:** `docker build` e `docker run -e PORT=8080 -e <segredo>`. Dentro do container, G-E2E apontando para a porta do container e G-BYTECODE no `.class` gerado pelo build.

### Passo 6: Health check e keep-alive honestos. **PARCIAL em 07/10 (2F)**: `curl -fsS` e `kof-check.yml` novos; faltam o run verde comprovado (push), o health check do Render e a URL do keep-alive (decisão da usuária)
- [ ] Health check do Render apontando para `/health`.
- [ ] [keep-alive.yml](../../.github/workflows/keep-alive.yml): `curl -fsS` em `/health`. A frequência e a existência do keep-alive são **decisão da usuária**.
- [ ] [kof-check.yml](../../.github/workflows/kof-check.yml): instalar a versão mais nova (seção 2.1, versão Linux); checar o `backend`; usar `kof build frontend --target js` no frontend; tirar o `bff/` do gate.
      Propor (não impor) o G-BYTECODE como job de CI.
- **Gate:** o workflow verde **com prova** (link do run), e ele falhando de propósito quando o `/health` não responde.

### Passo 3: Persistência real (o maior; exige spec antes)
- [ ] Começar pela skill [tlc-spec-driven](../../.agent/skills/tlc-spec-driven/SKILL.md), nas fases Specify e Design. **Sem código até a usuária aprovar.**
- [ ] **Medir antes de decidir:** o `kof.db` conecta e consulta (com binds `?`) no MySQL da Aiven do [DEPLOY.md](../DEPLOY.md)?
      O corpus marca o MySQL como WIP. Prove com um repro mínimo **fora do repo**.
      Se não funcionar, apresente as alternativas medidas.
- [ ] Modelar com `entity` + `orm.*` + Query DSL, substituindo `BackendDb`. IDs gerados pelo banco, não por `size+1`.
- [ ] Dinheiro: avaliar `Long` em centavos ([types: Long arithmetic](https://raw.githubusercontent.com/KofLang/Kof4j/main/training/language/types.md)) em uma issue própria.
- **Gate:** G-BUILD, G-BYTECODE, G-E2E e um teste de **reinício**: dados criados → servidor reiniciado → dados continuam lá.

---

## 6. Prompt base (cole no Antigravity no início de cada sessão)

```markdown
Você é o EXECUTOR do projeto Organiza AI. Modelo: Gemini Flash 3.8, esforço alto.

1. Leia por inteiro docs/handoff/ANTIGRAVITY_HANDOFF.md (este repositório). Ele é a sua
   instrução principal; os links nele são as suas fontes (RAG): abra cada um só quando a
   tarefa precisar.
2. Leia CLAUDE.md (seção "Regras de Sessao"); essas regras valem para você também.
   Resumo: você NUNCA faz git add/commit/push; entrega os blocos sem Co-Authored-By.
3. Rode `git status` e `git log --oneline -10` e diga em que passo da seção 5 o projeto está.
4. Instale a versão mais recente do Kof (seção 2.1), confira o SHA256 e reporte
   `kof version`. Se a versão mudou desde 0.5.0-beta, rode todos os gates antes de seguir.
5. Treine-se no Kof: leia o núcleo da seção 3 (só arquivos em inglês) e resuma em
   10 linhas o que vale para o passo atual. Não escreva .kf antes disso.
6. Leia todos os arquivos de código que o passo atual vai tocar, por inteiro.
7. Execute SOMENTE o próximo passo pendente da seção 5, respeitando o orçamento de
   tokens da seção 4. Ao fim, rode os gates do passo (G-BUILD, G-BYTECODE, G-E2E...).
8. Relatório: (1) o que foi feito, com arquivo:linha; (2) prova: comando + saída +
   `kof version` + SHA256 + HEAD; (3) divergências entre docs e Kof4j; (4) riscos;
   (5) blocos de commit manuais; (6) perguntas. Depois PARE e espere a usuária.

Pare e pergunte se: algo exigir publicação externa, apagar arquivos, uma forma de bug
nova sem contorno medido, ou se uma versão nova do Kof quebrar algo que passava.
```

---

## 7. Referências do projeto (RAG local)

- Arquitetura e decisões: [.specs/STATE.md](../../.specs/STATE.md), [DECISIONS.md](../../DECISIONS.md), [docs/ARCHITECTURE_DECISIONS.md](../ARCHITECTURE_DECISIONS.md)
- Spec do MVP 1: [.specs/features/mvp1-koflith-attack/](../../.specs/features/mvp1-koflith-attack/spec.md), [docs/MVP1_EXECUTION_PLAN.md](../MVP1_EXECUTION_PLAN.md)
- Issues: [guia](../ISSUES_GUIDE.md), [#41](https://github.com/luizaleblanc/organiza-ai/issues/41) (com a raiz e os repros do bug)
- Benchmarks: [docs/BENCHMARKS.md](../BENCHMARKS.md), [scripts/benchmark_kof.ps1](../../scripts/benchmark_kof.ps1)
- Código: [backend/main.kf](../../backend/main.kf), [backend/auth.kf](../../backend/auth.kf), [backend/services.kf](../../backend/services.kf), [backend/coach.kf](../../backend/coach.kf), [backend/models.kf](../../backend/models.kf)
- Kof4j: [releases](https://github.com/KofLang/Kof4j/releases), [known-bugs](https://github.com/KofLang/Kof4j/blob/main/docs/bugs-and-gaps/known-bugs.md), [KOFUI-AUDIT](https://github.com/KofLang/Kof4j/blob/main/docs/bugs-and-gaps/KOFUI-AUDIT.md), [learn/](https://github.com/KofLang/Kof4j/tree/main/learn)
