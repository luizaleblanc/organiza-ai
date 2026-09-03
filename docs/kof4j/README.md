# Documentação Kof4j (linguagem KOF)

Cópia local de trechos da documentação oficial do compilador
[KofLang/Kof4j](https://github.com/KofLang/Kof4j) (open source), reunidos
aqui para consulta rápida ao escrever `.kf` neste projeto -- sem depender de
clonar o repositório inteiro toda vez.

**Fonte da verdade:** o repositório [KofLang/Kof4j](https://github.com/KofLang/Kof4j)
em si (pasta `training/` para corpus de IA, `docs/` para documentação
arquitetural). Estes arquivos são um snapshot (2026-09-02, branch `main` do
Kof4j) -- se a linguagem evoluir, releia o repositório original antes de
confiar cegamente nestas cópias.

## Como este projeto já documenta KOF

Este diretório complementa, não substitui:

- [`KOF_REFERENCE.md`](../../KOF_REFERENCE.md) (raiz do projeto) -- referência
  geral da linguagem, `kof.ui`, `kof.web`.
- [`KOF_WEB_REFERENCE.md`](../../KOF_WEB_REFERENCE.md) (raiz do projeto) --
  referência específica de `kof.web`/`kof.http`.
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md), seção "Como configurar sua IA
  para codar em KOF" -- processo de alimentar uma IA com o corpus de
  training antes de pedir código `.kf`.

Use os arquivos abaixo quando `KOF_REFERENCE.md`/`KOF_WEB_REFERENCE.md` não
cobrirem o que você precisa (ex.: `kof.security`, módulos/`import`,
tratamento de erros) -- não invente sintaxe que não apareça em nenhum dos
dois conjuntos de documentos.

## Arquivos

| Arquivo | Conteúdo | Fonte no Kof4j |
|---|---|---|
| [`security.md`](security.md) | `kof.security`: passwords, crypto, JWT (`jwt.create`/`jwt.verify`), secrets, `auth.*` (contexto web) | `training/language/security.md` + `docs/security.md` |
| [`modules-and-errors.md`](modules-and-errors.md) | `package`/`import` (multi-arquivo), exceptions (`throw`/`try`/`catch`, exceções são `String`) | `training/language/syntax.md`, `training/idioms/errors.md`, `training/language/exceptions.md` |
| [`web.md`](web.md) | `web.app()`, rotas, `app.use` (middleware), contexto de request, `kof.http` client | `training/idioms/architecture.md`, `docs/stdlib-web.md` |

## Regra de ouro (vale para qualquer código gerado a partir destes docs)

> Código KOF gerado por IA deve ser compilado (`kof run`/`kof serve`) antes
> de ser commitado. Se não compilar, a IA inventou sintaxe -- corrija
> alimentando o erro de volta com o trecho relevante destes arquivos.

Consulte também `training/anti-patterns/fake-idioms.md` no repositório
Kof4j para a lista mantida de erros comuns de IA ao gerar KOF.
