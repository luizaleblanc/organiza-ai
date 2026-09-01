# KOF Web Reference (kof.web + kof.http)

Fonte única de verdade: `training/` do repositório
[KofLang/Kof4j](https://github.com/KofLang/Kof4j), verificado adicionalmente
contra o código-fonte do compilador (`KofWeb.java`, `KofHttp.java` em
`kof-compiler/src/main/java/dev/kof/compiler/`). Versão: 0.2.6-beta.

Nada abaixo foi inventado — cada item tem uma linha de evidência.

## Rotas — `web.app()`

```kof
main() {
    var app = web.app()

    app.get("/users") { return json.encode(users) }
    app.get("/users/:id") { return param("id") }
    app.post("/users") { var u = json.decode<User>(body()); return json.encode(u) }
    app.put("/users/:id") { return "atualizado" }
    app.delete("/users/:id") { return "removido" }
    app.patch("/users/:id") { return "parcial" }
    app.options("/users") { return "" }

    app.use { /* middleware */ }
    app.ws("/chat") { wsSend("echo: " + wsMessage()) }
    app.sse("/events") { sse.send("tick"); sse.event("ev", "dados"); sse.close() }

    app.listen(8080)
    app.listenSecure(8443)   // TLS
}
```

Métodos de rota confirmados em `KofWeb.ROUTE_METHODS`:
`get, post, put, delete, patch, options, ws, sse`.
Todos aceitam `(path: String, handler: () -> String)`, exceto `ws`/`sse` que têm
protocolo próprio (`wsSend`/`wsMessage`, `sse.send/event/close`).

Suportado na JVM (nosso BFF roda em JVM). Native/JS reportam gaps
(`WEB001`/`WEB002`/`WEB003`/`WEB004`).

## Funções de contexto (dentro de um handler de rota)

Confirmadas em `KofWeb.contextCall`:

| Função | Assinatura | Retorno |
|---|---|---|
| `param(name)` | 1 arg String | String |
| `query(name)` | 1 arg String | String |
| `header(name)` | 1 arg String | String |
| `body()` | 0 args | String |
| `method()` | 0 args | String |
| `path()` | 0 args | String |
| `status(code, body)` | 2 args: Int, String | String (define status code e devolve o body) |
| `headerSet(name, value)` / `setHeader(name, value)` | 2 args: String, String | String (define header de resposta) |

Exemplo real (`training/patterns/common-patterns.md`):

```kof
app.post("/users") { var u = json.decode<User>(body()); return json.encode(u) }
return status(201, json.encode(u))     // status code customizado
headerSet("X-Custom", "value")         // header customizado
```

## HTTP client — `kof.http`

Confirmado em `KofHttp.staticCall` (dispatch table do compilador):

| Chamada | Assinatura | Retorno |
|---|---|---|
| `http.get(url)` | 1 arg | **String** (corpo da resposta) |
| `http.get(url, headers)` | 2 args | String |
| `http.delete(url)` / `http.delete(url, headers)` | 1 ou 2 args | String |
| `http.options(url)` / `http.options(url, headers)` | 1 ou 2 args | String |
| `http.post(url, body)` | 2 args | String |
| `http.post(url, body, headers)` | 3 args | String |
| `http.put(url, body)` / `http.put(url, body, headers)` | 2 ou 3 args | String |
| `http.patch(url, body)` / `http.patch(url, body, headers)` | 2 ou 3 args | String |
| `http.status(url)` | 1 arg | **Int** (status HTTP de uma requisição GET) |
| `http.timeout(ms)` | 1 arg Int | Void (global) |
| `http.retry(n)` | 1 arg Int | Void (repete em exceção + HTTP 5xx) |
| `http.circuit(n)` | 1 arg Int | Void (abre circuito após N falhas por 30s; `circuit(0)` recupera) |

**Importante:** `http.get/post/put/delete/patch/options` retornam o corpo da
resposta como `String` puro — **não existe objeto de resposta com `.body`,
`.status` ou `.headers`**. Para saber o status HTTP de uma URL, use
`http.status(url)` (retorna `Int`, é uma chamada GET separada).

## Headers — sintaxe confirmada

Headers são passados como **uma única String**, uma linha `Nome: valor` por
header (javadoc de `KofHttp.java`):

```kof
var page = http.get(url, "Accept: text/html")
var resp = http.post(api, json.encode(body), "Content-Type: application/json")
```

Para múltiplos headers, concatene linhas separadas por `\n`:

```kof
var headers = "Authorization: " + token + "\nContent-Type: application/json"
var resp = http.post(url, body(), headers)
```

Não existe forma de passar headers como mapa/objeto (`headers: {...}`) —
essa sintaxe **não existe** no Kof e não compila.

## Suportado: `kof serve` (handler legado)

```kof
handle(String method, String path, String body, String query, String headers): String {
    // dispatch manual — variantes com 0, 3, 4 ou 5 argumentos
}
```

Ainda suportado, mas `web.app()` é o idiomático em 0.2.6-beta.

## NÃO EXISTE (não usar, não inventar)

- Objeto de resposta HTTP com `.body`/`.status`/`.headers` — `http.*`
  retorna `String` direto.
- Headers como mapa/objeto nomeado (`headers: {"Authorization": token}`).
- `app.get(path, handler, middleware)` com mais de 2 argumentos.
- Named parameters em geral (`foo(bar: 1)`) fora de casos confirmados
  (`status(code, body)`, `headerSet(name, value)` são posicionais, não
  nomeados).
- `Thread`/`Executor` — use `spawn`/`await`.
- `Option<T>` genérico — use `String?`/`Int?`.
- Array literais `[1,2,3]`/`{1,2,3}` — use `new Int[n]` ou `listOf(...)`.
- `for (x in xs)` sem `var` — precisa ser `for (var x in xs)`.
- Declaração de função com `-> Tipo` (`foo() -> String { }`) — isso é
  sintaxe de **lambda**, não de função nomeada. Função nomeada é
  `foo(): String { }` ou `String foo() { }`.
- `async`/`await` estilo JS — o Kof usa `spawn`/`await` com `Handle<T>`.
