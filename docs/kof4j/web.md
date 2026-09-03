# kof.web -- rotas e middleware (`app.use`)

> Fonte: `training/idioms/architecture.md`, `docs/stdlib-web.md` do
> [KofLang/Kof4j](https://github.com/KofLang/Kof4j) (0.2.6-beta, snapshot
> 2026-09-02). Complementa `KOF_WEB_REFERENCE.md` (raiz do projeto), que já
> cobre rotas/`http.*`/headers -- aqui o foco é especificamente `app.use`.

## `app.use` -- semântica exata

```kof
var app = web.app()

app.use {
    if (header("x-auth") == "secret") {
        return null
    }
    return "{\"error\": \"unauthorized\"}"
}

app.get("/hello") { return "Hello from Kof" }
app.listen(8080)
```

- `app.use { ... }` registra um middleware executado **antes do
  roteamento**, para **todas as rotas** -- não existe `app.use` com escopo
  de path/rota específica.
- Retorno `null` -> a requisição segue para o handler da rota.
- Retorno `String` -> essa `String` vira a resposta imediatamente (200,
  ou o status setado via `status(code, body)`); o handler da rota **nunca
  executa** e nada é chamado depois (ex.: um `http.post` para o backend).

Consequência prática: como `app.use` não tem escopo por rota, bypass de
rotas públicas (`/health`, `/api/auth/login`, `/api/auth/register`) precisa
ser feito **dentro** do próprio bloco `app.use`, checando `path()`.

## `app.health(path)` -- roda antes até do `app.use`

```kof
app.health("/health")   // GET /health -> {"status":"UP",...} -- ANTES dos middlewares
```

Se usado, `app.health` responde a healthchecks de load balancer sem passar
por `app.use` (nem por auth). Este projeto usa `app.get("/health") { return
"OK" }` (rota normal) em vez de `app.health`, então `/health` **precisa**
estar na lista de paths públicos checada dentro do `app.use`, senão o
middleware bloqueia o próprio health check.

## Contexto de request

Disponível tanto em rotas quanto dentro do bloco `app.use`:

| Função | Retorna |
|---|---|
| `param("id")` | path parameter |
| `query("name")` | query parameter |
| `header("x-auth")` | header (case-insensitive); `null` se ausente |
| `body()` | corpo cru da request |
| `method()` | verbo HTTP |
| `path()` | path da request |
| `status(code, body)` | define status e retorna o corpo (usar em `return`) |
| `headerSet(name, value)` | adiciona header de resposta |

O contexto é por-request (ThreadLocal em runtime) -- seguro para handlers
concorrentes.
