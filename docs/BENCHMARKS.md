# Benchmarks empíricos KOF (Issue #39)

Este documento descreve a metodologia do pipeline de benchmarks do Organiza AI,
criado para embasar empiricamente as hipóteses de performance/DX citadas em
`README.md` ("Laboratório Científico e Transparência"), em vez de tratá-las
como fato de marketing. Alimenta as hipóteses **H2** (concisão) e **H4**
(build/runtime) do protocolo de validação científica ([Issue #42](https://github.com/luizaleblanc/organiza-ai/issues/42)).

## O que é medido

Script: [`scripts/benchmark_kof.ps1`](../scripts/benchmark_kof.ps1)
Workflow de CI: [`.github/workflows/benchmarks.yml`](../.github/workflows/benchmarks.yml)

Cada passo roda `N` vezes (`-Iterations`, padrão 3) e reporta **mediana, desvio
padrão amostral (n−1), mínimo e máximo**:

| Passo | Comando | Observação |
|---|---|---|
| `check-backend` | `kof check backend` | Typecheck do domínio. Falha hoje (Issue #41) |
| `check-frontend-js` | `kof check frontend --target js` | Typecheck da UI no **target real** (KofJS) |
| `check-frontend-default` | `kof check frontend` | Typecheck padrão (target JVM) — ~4× mais lento |
| `build-frontend-js` | `kof build frontend --target js` | Transpilação Web + tamanho dos `.mjs` (bytes) |
| `build-bff-jvm` | `kof build bff --target jvm` | Build JVM a frio do gateway + bytes de `build/classes` |
| LOC/módulos | contagem de `.kf`/`.java` | Sem linhas em branco nem comentários `//` |
| Memória (best-effort) | Working Set do `bff/` compilado | Repouso e sob carga em `/health` |

O relatório registra o **ambiente** (versão do `kof`, JDK, SO, CPU e commit) para
reprodutibilidade.

## Como rodar

Localmente (Windows), com o compilador Kof (jar, ou `kof` no PATH):

```powershell
$env:JAVA_HOME = "C:\caminho\para\jdk-25"
powershell -File scripts/benchmark_kof.ps1 -KofJar C:\caminho\kof-cli-0.5.0-beta.jar
# ou, com `kof` no PATH:
powershell -File scripts/benchmark_kof.ps1 -KofExe kof
```

Parâmetros opcionais: `-Iterations`, `-LoadRequests`, `-JavaExe`, `-OutDir`.
O jar do compilador também é publicado nos
[releases do Kof4j](https://github.com/KofLang/Kof4j/releases) (`kof-cli-<versão>.jar`).

Via GitHub Actions: workflow `KOF benchmarks`, disparo manual
(`workflow_dispatch`, com `iterations`/`load_requests` configuráveis) ou
agendado toda segunda-feira. Os resultados (`benchmarks/results/latest.json`
e `latest.md`) são publicados como artifact do run — **não são commitados** no
repositório (mudam a cada execução; ver `.gitignore`). Só a tabela resumo abaixo
é versionada.

## Resultados de referência

Kof `0.5.0-beta` · OpenJDK 25.0.3 · Windows 11 · Intel Core Ultra 5 115U · 3 repetições
· commit `b32306f` (28/09/2026).

| Passo | OK | Mediana (ms) | Desvio (ms) | Min–Max (ms) | Bytes |
|---|---|---|---|---|---|
| `check-backend` | 0/3 | — | — | — | — (`COMP002`, Issue #41) |
| `check-frontend-js` | 3/3 | 895 | 37 | 867–941 | — |
| `check-frontend-default` | 3/3 | 3398 | 78 | 3380–3524 | — |
| `build-frontend-js` | 3/3 | 776 | 47 | 746–838 | 57 620 (`.mjs`) |
| `build-bff-jvm` | 3/3 | 3685 | 200 | 3591–3975 | 295 576 |

| Base | Arquivos | LOC |
|---|---|---|
| `backend/` (`.kf`) | 5 | 1 034 |
| `frontend/` (`.kf`) | 7 | 297 |
| `bff/` (`.kf`) | 3 | 254 |
| Legado Java arquivado (`archive/legacy-backend-java/`) | 99 | 2 580 |

> Os valores absolutos valem **só para esta máquina**. Com n=3 o desvio é
> indicativo, não inferência estatística: para conclusões, use ≥5 repetições e a
> série histórica do CI. LOC é proxy de concisão, não de qualidade
> (ameaças à validade em #42). Os 1 331 LOC de `.kf` (backend+frontend) contra
> 2 580 LOC de Java cobrem escopos ainda não idênticos — o legado inclui
> camadas que o monólito KOF não reimplementou, então **não** é uma razão de
> redução comprovada.

## Limitações conhecidas

- **`kof check backend` / `kof build backend` falham (Issue #41).** Bug do Kof4j na
  geração de bytecode (`ASM COMPUTE_FRAMES`, `ArrayIndexOutOfBoundsException`,
  diagnóstico `COMP002`) ao construir um `record` com `Double` antes de `String?`
  nulo (`backend/coach.kf::calculateDailyPulse`). O benchmark reporta a falha
  em vez de omiti-la; ela vira `PASS` quando o compilador for corrigido. O aviso
  `MEM014` (`web.app()` nunca fechado) que aparece antes é só um *warning* e o
  script o ignora ao classificar o erro.
- **`kof.toml` na raiz quebra o `kof check frontend`.** Dentro do repo, `check`
  (e `kof serve`) usam a raiz do `kof.toml` como raiz de módulos e falham com
  `PKG006`; `kof build`/`run` usam a pasta do `main.kf` e funcionam. Por isso o
  script mede o typecheck do frontend numa **cópia temporária sem `kof.toml`**
  (a cópia fica fora do tempo medido).
- **Memória sob carga indisponível hoje**, por dois bloqueios distintos do Kof4j:
  (1) `java -cp build/classes Default.Main` do `bff/` exige runtime JavaFX
  ausente; (2) `kof serve bff/main.kf` numa cópia sem `kof.toml` falha com
  `NoClassDefFoundError: AuthClaims` (o `import middleware.*` não é carregado).
  O script detecta, reporta o motivo em `latest.md` e segue.
- **Sem comparação de memória para KofJS** (rodar o `.mjs` fora de webview não foi
  validado).

## Interpretando os resultados

Não compare valores absolutos entre máquinas diferentes. O valor está na **série
histórica** (rodar semanalmente/sob demanda e observar tendências) e na
**honestidade metodológica**: nenhuma alegação de "KOF é mais rápido/leve" deve
ser feita sem esses dados, e as limitações acima precisam ser corrigidas antes de
qualquer afirmação comparativa forte entre JVM e KofJS.
