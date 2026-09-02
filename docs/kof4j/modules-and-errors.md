# Módulos (package/import) e tratamento de erros

> Fonte: `training/language/syntax.md`, `training/idioms/errors.md`,
> `training/language/exceptions.md`, `training/idioms/records.md` do
> [KofLang/Kof4j](https://github.com/KofLang/Kof4j) (0.2.6-beta, snapshot
> 2026-09-02).

## Módulos -- `package`/`import`

```kof
package a.b          // no topo do arquivo a/b/algumacoisa.kf

import a.b.C          // arquivo a/b/C.kf (fix 27/08: CompilerDriver expandKofImports)
import a.b.*          // todos os arquivos do diretório a/b
import kof.http       // módulo da stdlib
```

Confirmado em `training/idioms/architecture.md` (seção "4. Módulos"):
"projetos grandes com `a/b/C.kf` agora compilam corretamente". Evite
`import java.util.List` -- use `listOf`/`List<T>` da stdlib Kof.

Para programas pequenos, um único arquivo `.kf` com `main()` no topo é
suficiente -- só use módulos quando o arquivo cresce (como o middleware de
auth deste projeto, separado por convenção de `CONTRIBUTING.md`).

**Neste projeto:** `bff/middleware/auth.kf` declara `package middleware`;
`bff/main.kf` importa com `import middleware.auth`.

## Exceptions

Exceções em Kof **são `String`** -- não há hierarquia de tipos de exceção
nem objeto de erro:

```kof
try {
    throw "mensagem de erro"
    println("nunca executa")
} catch (String e) {
    println("capturado: " + e)
} finally {
    println("sempre executa")
}
```

- `throw` aceita `String` (também `Int`, mas o padrão do projeto é `String`).
- `catch (String e)` -- o tipo declarado no catch precisa bater com o que
  foi lançado.
- `finally` roda no caminho normal, no capturado e durante propagação.
- Exceções atravessam frames de função normalmente (propagam para quem
  chamou, se não capturadas).

### Ausência de valor != erro

Para "não encontrado" que **não** é um erro, use `String?`/`T?` (nullable)
com narrowing -- não um valor sentinela (`""`, `-1`) nem exceção:

```kof
String? maybe = find("key")
if (maybe != null) {
    println(maybe)
} else {
    println("not found")
}
```

Regra do projeto (`training/anti-patterns/sentinel-values.md`): sentinela
(`""` significando "não encontrado") espalha a convenção por todos os
consumidores -- prefira nullable para ausência, exceção para erro real.

## Records + JSON (usado no middleware de auth)

```kof
record AuthClaims(String sub, String iss)

var claimsJson = jwt.verify(token, secret)          // String (JSON)
var claims = json.decode<AuthClaims>(claimsJson)    // AuthClaims
println(claims.sub())                                // accessor = nome do campo + ()
```

`json.decode<T>`/`json.encode` funcionam com `record` em JVM e JS
(`training/idioms/records.md`).
