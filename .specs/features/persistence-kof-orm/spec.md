# Persistência com kof.orm — Specification

**Status:** Draft (aguarda aprovação da Luiza) · **Kof medido:** 0.6.3 (`lib/kof.jar` sha256 `7aa835b0…7bd9`) · **HEAD:** `a88347b`

## Problem Statement

O backend Kof guarda tudo em listas estáticas (`BackendDb`, `backend/services.kf:37`): os dados somem a cada
reinício ou hibernação do Render, e os IDs são `size+1` (`backend/main.kf:68,137,159,186`; `coach.kf:198,260`),
que colidem depois de apagar algo e quebram entre processos. Sem persistência, o deploy não serve a usuários reais.

## Goals

- [ ] Dados criados pela API sobrevivem a um reinício do processo (gate novo **G-RESTART**).
- [ ] Todo ID de entidade é gerado pelo banco; nenhum `size+1` resta em `backend/`.
- [ ] A suíte E2E atual continua 36/37 (só o teste da #44 vermelho) com o banco ligado.

## Out of Scope

| Item | Motivo |
| --- | --- |
| Datas reais / limite freemium (`createdAt`, data de corte fixa) | Issue #44; esta feature só garante que a coluna exista e persista |
| Remover `orZero` e o contorno do enum no JSON | Bugs ainda presentes no 0.6.3 (medido); issue #41 e rascunhos upstream A/C |
| Pool de conexões, réplica, backup automatizado | Não há API no `kof.db` (stdlib-database.md §8); decisão de infra |
| Migração de dados existentes | Não existem dados persistidos hoje |
| Histórico/auditoria (`audited entity`) | Face nova do 0.6.x, JVM-only, fora do MVP |
| Frontend | Contrato HTTP não muda |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Banco de produção no Render | **Aberto — decisão da Luiza** (ver design.md §Decisão de banco) | Exige conta/credencial/custo; nenhuma opção de nuvem foi medida | n |
| Banco de dev/teste | H2 arquivo (`jdbc:h2:file:`) em dev; H2 memória no E2E rápido; SQLite arquivo como alternativa | Ambos medidos com CRUD + persistência entre processos no 0.6.3 | n |
| Dinheiro | `Long` em centavos no banco; API continua em reais (`Double`) na borda | `Double?` vira VARCHAR no ORM (medido orm2b); soma Long é exata (types.md, Long arithmetic) | n |
| Formato dos IDs na API | IDs passam de `"usr_1"` para o número gerado como String (`"1"`) no JSON e no `sub` do JWT | O E2E só exige 3 partes e `sub` não vazio; nenhum cliente depende do prefixo | n |
| Enums nas entities | Coluna `String` com `name()`, lida com `Enum.valueOf` (`T?` estreitado) | `entity` com campo enum quebra no `save` (`NotSerializableException`, medido orm2a) | y (medido) |
| Campos opcionais | Evitar `T?` numérico em entity; usar valor + flag ou 0 | `Double?` é gravado como texto (medido orm2b); `String?` funciona | y (medido) |
| Driver JDBC no build | `kof deps resolve` + `kof build --fat --classpath <drivers>` → `java -jar kof-app.jar` | URL vinda de config não auto-provisiona driver (só literal em `db.connect`, DbDriversTest); medido | n |
| Erros de SQL | Rota responde 500 sem corpo; servidor continua de pé | Exceção Java escapa de `catch (String e)` (medido orm2f/orm2e); kof.web converte em 500 (medido web1) | y (medido) |

**Open questions:** só a decisão de banco de produção (linha 1), registrada como aberta e bloqueante para a tarefa de deploy, não para as tarefas locais.

---

## User Stories

### P1: Dados sobrevivem a reinício ⭐ MVP

**User Story**: Como usuária do Organiza, quero que meu cadastro, salário, envelopes e gastos continuem lá depois que o servidor reinicia, para não perder meu controle financeiro.

**Acceptance Criteria**:

1. WHEN uma conta é criada via `POST /api/auth/register` e o processo do servidor é encerrado e iniciado de novo com a mesma `KOF_DB_URL` THEN o sistema SHALL aceitar `POST /api/auth/login` com as mesmas credenciais com status 200.  <!-- PERS-01 -->
2. WHEN o onboarding gravou salário 3000.0 antes do reinício THEN `GET /api/budgets/daily-pulse` após o reinício SHALL devolver `salary` = 3000.0.  <!-- PERS-02 -->
3. WHEN um envelope FOOD (1200.0) e uma transação de 600 foram criados antes do reinício THEN após o reinício `GET /api/envelopes` SHALL listar exatamente 1 envelope FOOD e `GET /api/transactions` SHALL listar exatamente 1 transação com `value` = 600.0.  <!-- PERS-03 -->
4. IF `KOF_DB_URL` estiver ausente AND `KOF_ENV` for diferente de `production` THEN o sistema SHALL usar o padrão de dev documentado (`jdbc:h2:file:./data/organiza;WRITE_DELAY=0`) e registrar em log o esquema (`h2`) sem credenciais.  <!-- PERS-04 -->
6. IF `KOF_ENV` for `production` AND `KOF_DB_URL` estiver ausente THEN o boot SHALL falhar com código diferente de 0 e uma mensagem que cite só o nome da variável, sem credenciais.  <!-- PERS-23 -->
5. IF a conexão com o banco falhar no boot THEN o processo SHALL encerrar com código diferente de 0 e uma mensagem que não contenha usuário nem senha da URL.  <!-- PERS-05 -->

**Independent Test**: G-RESTART — cria usuário + onboarding + envelope + transação, mata o processo, sobe outro e confere os 3 GETs.

---

### P1: IDs gerados pelo banco ⭐ MVP

**User Story**: Como mantenedora, quero IDs gerados pelo banco para não haver colisão depois de apagar registros nem entre processos.

**Acceptance Criteria**:

1. The system SHALL obter o id de toda entidade criada do valor devolvido por `orm.save` (coluna `id: Long generated`).  <!-- PERS-06 -->
2. WHEN duas transações são criadas em sequência pelo mesmo usuário THEN os ids devolvidos SHALL ser diferentes.  <!-- PERS-07 -->
3. The código em `backend/` SHALL não conter a expressão `.size + 1` nem `.size + 2` para formar ids (verificável por grep).  <!-- PERS-08 -->

**Independent Test**: grep + E2E criando duas transações e comparando ids.

---

### P1: Isolamento por usuário ⭐ MVP

**User Story**: Como usuária, quero que ninguém veja nem altere meus dados.

**Acceptance Criteria**:

1. The system SHALL filtrar toda leitura de envelopes, transações, rendas variáveis e mensagens pelo `userId` vindo de `currentUserId()` (claims), nunca de query ou body.  <!-- PERS-09 -->
2. WHEN o usuário B consulta `GET /api/envelopes`, `/api/transactions` e `/api/variable-income` THEN o sistema SHALL devolver listas vazias enquanto só A tem dados (os 4 testes IDOR atuais continuam verdes).  <!-- PERS-10 -->
3. IF uma atualização de envelope referir um id que pertence a outro usuário THEN o sistema SHALL não gravar e SHALL tratar como inexistente.  <!-- PERS-11 -->

**Independent Test**: blocos IDOR do `scripts/test_e2e_flow.ps1`, rodados contra o banco.

---

### P1: Senha só como hash ⭐ MVP

**Acceptance Criteria**:

1. The coluna de senha da tabela de usuários SHALL conter apenas o valor de `passwords.hash` (prefixo `pbkdf2$`).  <!-- PERS-12 -->
2. The system SHALL não gravar a senha em texto em nenhuma coluna nem log.  <!-- PERS-13 -->

**Independent Test**: após o E2E, `select` direto na tabela confere que todos os valores começam com `pbkdf2$`.

---

### P1: Nada de SQL concatenado ⭐ MVP

**Acceptance Criteria**:

1. The system SHALL acessar dados só por `orm.*`, Query DSL ou `db.execute/db.query` com binds `?`.  <!-- PERS-14 -->
2. IF um valor de entrada contiver aspas ou `;` (ex.: descrição `Bob'); drop table x;--`) THEN o sistema SHALL gravá-lo literalmente e a tabela SHALL continuar existindo.  <!-- PERS-15 -->
3. The código em `backend/` SHALL não conter chamada `db.execute`/`db.query` cujo SQL seja montado com `+` de variável (verificável por grep/revisão).  <!-- PERS-16 -->

---

### P2: Dinheiro exato em centavos

**Acceptance Criteria**:

1. The system SHALL armazenar valores monetários (salário, limites, gastos, rendas, transações) como `Long` em centavos.  <!-- PERS-17 -->
2. WHEN a API recebe `amount` 600 (reais) THEN o banco SHALL gravar 60000 e a API SHALL devolver `value` 600.0.  <!-- PERS-18 -->
3. WHEN a API recebe um valor em reais THEN o sistema SHALL convertê-lo para centavos com `math.roundTo(math.roundTo(v * 100.0, 6), 0) as Long` (meio-para-longe-de-zero após remover o ruído binário), produzindo: 10.005→1001, 2.675→268, 0.1+0.2→30, 600→60000, 0→0, -10.005→-1001, -2.675→-268, 1.005→101, 0.285→29.  <!-- PERS-19 -->

   > Prova (kof 0.6.3, `lib/kof.jar` sha256 `7aa835b0…7bd9`, repros `rt1`/`rt2` fora do repo): a forma direta `math.roundTo(v * 100.0, 0)` passa nos casos 10.005/2.675/0.1+0.2/600/0/negativos, mas dá **100 para 1.005** (`1.005 * 100.0 = 100.49999999999999`); `roundTo(roundTo(v, 2) * 100.0, 0)` também dá 100. A forma com o passo de 6 casas dá 101 e passa em todos.

---

## Edge Cases

- IF `POST /api/auth/register` repetir um e-mail THEN o sistema SHALL responder 409 sem tentar gravar (a violação de `unique` não é capturável por `catch (String e)`).  <!-- PERS-20 -->
- IF uma operação de banco lançar erro dentro de uma rota THEN o sistema SHALL responder 500 sem expor a mensagem do banco e o servidor SHALL continuar respondendo `/health` = 200.  <!-- PERS-21 -->
- WHEN o banco está vazio no boot THEN o sistema SHALL criar as tabelas que faltam e não SHALL falhar se elas já existirem.  <!-- PERS-22 -->

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| PERS-01 | P1: Sobrevive a reinício | Design | Pending |
| PERS-02 | P1: Sobrevive a reinício | Design | Pending |
| PERS-03 | P1: Sobrevive a reinício | Design | Pending |
| PERS-04 | P1: Sobrevive a reinício | Design | Pending |
| PERS-05 | P1: Sobrevive a reinício | Design | Pending |
| PERS-06 | P1: IDs do banco | Design | Pending |
| PERS-07 | P1: IDs do banco | Design | Pending |
| PERS-08 | P1: IDs do banco | Design | Pending |
| PERS-09 | P1: Isolamento | Design | Pending |
| PERS-10 | P1: Isolamento | Design | Pending |
| PERS-11 | P1: Isolamento | Design | Pending |
| PERS-12 | P1: Hash de senha | Design | Pending |
| PERS-13 | P1: Hash de senha | Design | Pending |
| PERS-14 | P1: Sem SQL concatenado | Design | Pending |
| PERS-15 | P1: Sem SQL concatenado | Design | Pending |
| PERS-16 | P1: Sem SQL concatenado | Design | Pending |
| PERS-17 | P2: Centavos | Design | Pending |
| PERS-18 | P2: Centavos | Design | Pending |
| PERS-19 | P2: Centavos | Design | Pending |
| PERS-20 | Edge cases | Design | Pending |
| PERS-21 | Edge cases | Design | Pending |
| PERS-22 | Edge cases | Design | Pending |
| PERS-23 | P1: Sobrevive a reinício | Design | Pending |

**Coverage:** 23 total, 0 mapped to tasks (Tasks ainda não criado).

## Success Criteria

- [ ] G-BUILD, G-BYTECODE (0 erros, controle z1 acusando), G-E2E 36/37 e G-RESTART verdes no Kof fixado.
- [ ] Nenhum `BackendDb` nem `size+1` em `backend/`.
