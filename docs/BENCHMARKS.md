# Benchmarks empíricos KOF (Issue #39)

Este documento descreve a metodologia do pipeline de benchmarks do Organiza IA,
criado para embasar empiricamente as hipóteses de performance/DX citadas em
`README.md` ("Laboratório Científico e Transparência"), em vez de tratá-las
como fato de marketing.

## O que é medido

Script: [`scripts/benchmark_kof.ps1`](../scripts/benchmark_kof.ps1)
Workflow de CI: [`.github/workflows/benchmarks.yml`](../.github/workflows/benchmarks.yml)

1. **Tempo de compilação a frio** (`kof build`), em milissegundos, para:
   - `bff/` com `--target jvm` (o gateway KOF que hoje compila e roda de
     ponta a ponta).
   - `frontend/` com `--target js` (KofJS).
   - `backend/` com `--target jvm` (o monólito de domínio) — **ver
     limitação conhecida** abaixo.
   - Cada alvo roda `N` vezes (`-Iterations`, padrão 5) com `build/` limpo
     entre execuções, reportando mínimo, média e máximo.
2. **Footprint de artefato em disco**: soma de bytes de todos os arquivos
   gerados em `build/classes` após cada build (proxy simples e
   determinístico de "tamanho do bytecode/bundle gerado").
3. **Memória de runtime sob carga (best-effort)**: sobe o `bff/` compilado
   (`java -cp build/classes Default.Main`), mede o *Working Set* do
   processo em repouso, dispara `N` requisições a `/health`
   (`-LoadRequests`, padrão 100) e mede o *Working Set* novamente.

## Como rodar

Localmente (Windows, com o Kof4j já compilado em
`C:\Users\luiza\OneDrive\Documentos\kof\Kof4j`, mesmo padrão de
`scripts/validate_architecture.ps1` e `scripts/run_parity_tests.ps1`):

```powershell
powershell -File scripts/benchmark_kof.ps1
```

Parâmetros opcionais: `-Iterations`, `-LoadRequests`, `-KofPath`,
`-JavaExe`, `-OutDir`.

Via GitHub Actions: workflow `KOF benchmarks`, disparo manual
(`workflow_dispatch`, com `iterations`/`load_requests` configuráveis) ou
agendado toda segunda-feira. Os resultados (`benchmarks/results/latest.json`
e `latest.md`) são publicados como artifact do run — não são commitados no
repositório (mudam a cada execução; ver `.gitignore`).

## Limitações conhecidas

- **`backend/` (monólito de domínio) não builda hoje.** `kof check backend`
  e `kof build backend --target jvm` crasham por um bug do compilador
  Kof4j na geração de bytecode JVM (`ASM COMPUTE_FRAMES`,
  `ArrayIndexOutOfBoundsException`) ao construir um `record` com campo
  `Double` antes de um campo `String?` nulo — reproduzido isoladamente em
  `backend/coach.kf::calculateDailyPulse`. Rastreado na **Issue #41**. O
  benchmark inclui esse alvo mesmo assim (`backend-jvm`), reportando a
  falha explicitamente em vez de omitir o dado — ele deve virar um `PASS`
  assim que o compilador for corrigido.
- **Medição de memória sob carga é best-effort.** Na máquina de referência
  usada para validar este pipeline, `java -cp build/classes Default.Main`
  para o `bff/` falhou com `Erro: os componentes de runtime do JavaFX não
  foram encontrados`, mesmo o `bff/` não usando `kof.ui`. O script detecta
  essa falha, reporta o motivo em `benchmarks/results/latest.md` e **não
  interrompe** o restante do benchmark. Investigar essa dependência
  transitiva de JavaFX no runtime do Kof4j é trabalho futuro (possivelmente
  relacionado à Issue #41 ou a outro bug do compilador/runtime).
- **Sem comparação de memória de runtime para KofJS ainda.** Rodar o bundle
  `.mjs` gerado por `--target js` fora de um webview (ex.: via Node/GraalJS
  headless) não foi validado nesta sessão; por ora o pipeline só compara
  tempo de compilação e footprint de artefato entre os dois targets.

## Interpretando os resultados

Os números em `benchmarks/results/latest.md` são específicos da máquina/CI
onde rodaram — não comparar valores absolutos entre execuções em hardware
diferente. O valor está na **série histórica** (rodar semanalmente/sob
demanda e observar tendências) e na **honestidade metodológica**: nenhuma
alegação de "KOF é mais rápido/leve" deve ser feita sem esses dados, e as
limitações acima devem ser corrigidas antes de qualquer afirmação
comparativa forte entre JVM e KofJS.
