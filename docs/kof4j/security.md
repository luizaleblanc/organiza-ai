# kof.security

> Fonte: `training/language/security.md` + `docs/security.md` do
> [KofLang/Kof4j](https://github.com/KofLang/Kof4j) (versão 0.2.6-beta,
> snapshot 2026-09-02). Nada abaixo foi inventado -- cada item tem uma
> linha de evidência no repositório original.

`kof.security` é a camada de segurança da Standard Library: senhas, crypto,
JWT, segredos e autenticação web -- secure by default, com gaps de target
reportados em compile-time (códigos `SECN00x`).

## API

```kof
passwords.hash(password)                  // secure by default (PBKDF2-HMAC-SHA256, 600k iterações)
passwords.verify(password, storedHash)    // constant-time
passwords.needsRehash(hash)               // false com os parâmetros atuais

jwt.create(claimsJson, secret)            // HS256 + iat/exp automáticos
jwt.create(claimsJson, secret, ttl)       // idem, com TTL customizado
jwt.verify(token, secret)                 // valida assinatura HS256 + exp
jwt.verify(token, secret, iss, aud)       // idem + valida issuer e audience
jwt.secret()                              // le KOF_JWT_SECRET do ambiente (ou gera)

secrets.get("API_KEY")                    // env, nunca logado
secrets.get("API_KEY", "default-value")   // com fallback
secrets.redact(value)                     // "sk-a********mnop" -- para logs

security.constantTimeEquals(a, b)         // comparação segura contra timing attack
crypto.sha256(data) / crypto.hmacSha256(key, data)
crypto.sha512(data)
crypto.encryptAesGcm(text, keyHex) / crypto.decryptAesGcm(ct, keyHex)
crypto.randomHex(n) / crypto.randomInt(bound)
```

`jwt.verify` **lança exceção** (exceções em Kof são `String`, ver
[`modules-and-errors.md`](modules-and-errors.md)) em token ausente,
malformado, expirado, com assinatura inválida, ou issuer/audience
divergente quando esses parâmetros são passados. O retorno em caso de
sucesso é a `String` JSON das claims validadas (decodificável com
`json.decode<T>`).

O algoritmo é **sempre HS256** -- o Kof nunca confia no campo `alg` do
token recebido (mitiga o ataque clássico "alg confusion").

## Web -- contexto de autenticação (`auth.*`, JVM apenas)

```kof
auth.secret("s3cret")
app.use {
    if (!auth.authenticated()) { return "{\"error\":\"unauthorized\"}" }
    if (!auth.hasRole("admin")) { return "{\"error\":\"forbidden\"}" }
    return null
}
```

`auth.*` (`secret`, `token`, `authenticated`, `claims`, `user`, `hasRole`,
`hasPermission`) é um contexto de request (Bearer JWT + ThreadLocal) mantido
pelo runtime -- existe e é suportado no JVM, mas a documentação pública do
Kof4j não traz um exemplo executável completo com as assinaturas exatas de
`auth.claims()`/`auth.user()` (quantos args, tipo de retorno). Por isso,
**este projeto usa a API de baixo nível `jwt.verify` + `json.decode`**
(totalmente confirmada por `training/examples/security.kf`) em vez de
`auth.*`, para não arriscar sintaxe não verificada -- ver
`bff/middleware/auth.kf`. Se `auth.*` ganhar um exemplo executável
documentado no futuro, vale reavaliar a migração (ele é mais idiomático e
evita reimplementar extração de Bearer token).

## Anti-padrões (kof.security)

- `sha256(password)` para armazenar senha -- use `passwords.hash`.
- `==` para comparar tokens/hashes -- use `security.constantTimeEquals`.
- Imprimir segredos em logs -- use `secrets.redact`.
- Confiar no `alg` do token -- o Kof fixa HS256, não precisa (nem deve) ser
  configurado.

## Suporte por target (0.2.6-beta)

| Função | JVM | Native | JS |
|--------|-----|--------|----|
| `passwords.*` | ✅ | ✅ | ✅ |
| `crypto.sha256`/`hmacSha256` | ✅ | ✅ | ✅ |
| `crypto.sha512` | ✅ | ✅ | ✅ |
| `crypto.encryptAesGcm`/`decryptAesGcm` | ✅ | ✅ | ✅ |
| `jwt.create`/`jwt.verify` (HS256) | ✅ | ✅ | ✅ |
| `secrets.*` | ✅ | ✅ | ✅ |
| `security.constantTimeEquals` | ✅ | ✅ | ✅ |
| `auth.*` (contexto web) | ✅ | ❌ | ❌ |

O BFF deste projeto roda em JVM (`kof serve`/`kof run` sem `--target`), então
todas as funções acima usadas em `bff/` estão no caminho suportado.
