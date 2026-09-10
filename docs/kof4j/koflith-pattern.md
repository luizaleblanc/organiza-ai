# koflith — padrão arquitetural (referência, não aplicado ao projeto)

Origem: gerado pela Melissa via Opus, baixado em `~/Downloads/koflith-modular.kf`
em 2026-09-09. Cópia corrigida em [`koflith-pattern.kf`](koflith-pattern.kf).

**Status: referência apenas.** Não foi aplicado ao BFF/backend deste projeto.
Adotar esse padrão de verdade mudaria a arquitetura atual (ver seção
"Conflito com este projeto" abaixo) — decisão que ainda não foi tomada.

## O que foi verificado contra o corpus oficial (KofLang/Kof4j, 0.2.6-beta)

Checado em `training/idioms/database.md`, `training/idioms/functions.md`,
`training/idioms/architecture.md`, `training/language/syntax.md`,
`training/anti-patterns/fake-idioms.md`, `examples/orm/Main.kf`,
`docs/stdlib-database.md` e no código-fonte do compilador
(`KofDb.java`, `KofWeb.java`).

| Item | Veredito |
|---|---|
| `entity X { campo: Tipo, campo: Tipo generated/unique }` | ✅ Real — sintaxe exata do corpus oficial |
| `orm.where/save/find/create/all/count/delete/migrate` | ✅ Real (`kof.orm`) |
| `db.connect(url)` | ✅ Real (`kof.db`) |
| `String.valueOf(x)` | ✅ Real (implementado 01/09) |
| `setOf(...)` / `mapOf(...)` | ✅ Real |
| `var db` / `var app` como **tipo de parâmetro** de função | ❌ **Inválido** — nenhum exemplo do corpus usa `var` como tipo de parâmetro (sempre tipo explícito: `Int a`, `String s`). Corrigido para os tipos reais lidos direto do compilador: `Db` (`kof.db.Db`) e `App` (`kof.web.App`) |
| `conflict(...)`/`badRequest(...)`/`notFound(...)` chamadas como statement solto (sem `return`/`throw` explícito) dentro de função com retorno tipado | ⚠️ Não confirmado nem refutado no corpus — só `kof check` real resolve |
| `for (var i = start; i < end; i++)` (C-style) | ⚠️ Não confirmado — corpus só mostra `for (var x in coll)` |

## Correção aplicada

Todas as ~14 assinaturas de função que recebiam `var db` / `var app` foram
trocadas para `Db db` / `App app` (tipo explícito), ex.:

```kof
// antes (não compila — var não é tipo de parâmetro)
User createUser(var db, CreateUserRequest req) { ... }
registerUserRoutes(var app, var db) { ... }

// depois (tipo real, confirmado no compilador)
User createUser(Db db, CreateUserRequest req) { ... }
registerUserRoutes(App app, Db db) { ... }
```

## Conflito com este projeto

O koflith assume o BFF acessando banco diretamente via `kof.orm`/`db.connect`.
Isso contradiz a Regra Inviolável #3 do `CLAUDE.md` deste projeto: "Backend
permanece Java/Spring Boot... KOF não substitui o backend". Hoje o BFF
(`bff/main.kf`) é proxy HTTP autenticado para o Spring Boot, sem acesso a
dado próprio.

Adotar o padrão koflith de verdade (não só como referência de organização de
módulos) seria uma mudança arquitetural — o BFF passaria a ser dono de
schema/dado em vez de só validar JWT e repassar requisições. Não fazer essa
mudança sem decisão explícita e atualização do `CLAUDE.md`.

## Antes de usar como padrão oficial

1. Rodar `kof check` de verdade sobre `koflith-pattern.kf` (precisa do `kof`
   CLI instalado — não disponível neste ambiente na auditoria de 2026-09-09).
2. Resolver os dois itens `⚠️` acima com o resultado do compilador.
3. Decidir explicitamente se o BFF vai ganhar acesso a banco (rule change) ou
   se o padrão serve só de inspiração para a organização de pastas
   (Entity/Module/Routes) mantendo o proxy HTTP atual.
