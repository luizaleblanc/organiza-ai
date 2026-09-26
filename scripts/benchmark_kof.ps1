# scripts/benchmark_kof.ps1
# Pipeline de benchmarks empiricos do Organiza IA (Issue #39).
#
# Mede, de forma reproduzivel:
#   1. Tempo de compilacao a frio (kof build) para o target JVM (bff/) e
#      para o target JS/KofJS (frontend/).
#   2. Footprint em disco do artefato gerado por cada target (bytes em
#      build/classes apos o build).
#   3. (Best-effort) Footprint de memoria (Working Set) do processo JVM
#      rodando o monolito compilado, em repouso e sob carga de N
#      requisicoes a /health.
#
# NAO mede ainda (limitacoes conhecidas, documentadas em docs/BENCHMARKS.md):
#   - "backend/" (o monolito de dominio) fica de fora do build/run porque
#     `kof check backend` crasha atualmente por um bug do compilador Kof4j
#     (ASM COMPUTE_FRAMES) -- ver Issue #41. O item 1 (bff/jvm) roda a
#     parte do monolito que HOJE compila e sobe de verdade.
#   - O passo 3 (memoria sob carga) e best-effort: nesta maquina de
#     referencia, `java -cp build/classes Default.Main` para o bff falhou
#     por depender de runtime JavaFX ausente. Quando isso acontece o
#     script reporta o motivo e segue sem quebrar o restante do benchmark.
#
# Uso local (Windows, com Kof4j buildado localmente em $KofPath):
#   powershell -File scripts/benchmark_kof.ps1
#
# Uso em CI (kof ja resolvido no PATH via release oficial -- ver
# .github/workflows/benchmarks.yml):
#   pwsh -File scripts/benchmark_kof.ps1 -KofExe kof -Iterations 3

param(
    [string]$KofExe = "",
    [string]$KofPath = "C:\Users\luiza\OneDrive\Documentos\kof\Kof4j",
    [string]$JavaExe = "C:\Program Files\Eclipse Adoptium\jdk-25.0.3.9-hotspot\bin\java.exe",
    [int]$Iterations = 5,
    [int]$LoadRequests = 100,
    [string]$OutDir = "benchmarks/results"
)

$ErrorActionPreference = "Continue"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
try { $OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

function Invoke-Kof {
    param([string[]]$KofArgs)

    if ($KofExe -ne "") {
        $output = & $KofExe @KofArgs 2>&1 | Out-String -Stream
        Write-Verbose ($output -join "`n")
        return $LASTEXITCODE
    }

    $userHome = $env:USERPROFILE
    $asm = "$userHome\.m2\repository\org\ow2\asm\asm\9.10.1\asm-9.10.1.jar;" +
           "$userHome\.m2\repository\org\ow2\asm\asm-tree\9.10.1\asm-tree-9.10.1.jar;" +
           "$userHome\.m2\repository\org\ow2\asm\asm-commons\9.9.1\asm-commons-9.9.1.jar;" +
           "$userHome\.m2\repository\org\ow2\asm\asm-analysis\9.10.1\asm-analysis-9.10.1.jar;" +
           "$userHome\.m2\repository\org\ow2\asm\asm-util\9.10.1\asm-util-9.10.1.jar"
    $cp = "$KofPath\kof-cli\target\classes;$KofPath\kof-compiler\target\classes;$KofPath\kof-runtime\target\classes;$asm"
    $output = & $JavaExe -cp $cp dev.kof.cli.Main @KofArgs 2>&1 | Out-String -Stream
    Write-Verbose ($output -join "`n")
    return $LASTEXITCODE
}

function Get-DirBytes {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return 0 }
    $files = Get-ChildItem -Recurse -File -Path $Path -ErrorAction SilentlyContinue
    if (-not $files) { return 0 }
    return ($files | Measure-Object -Property Length -Sum).Sum
}

function Measure-ColdBuild {
    param([string]$Module, [string]$Target, [string]$Label)

    if (Test-Path "build") { Remove-Item -Recurse -Force "build" -ErrorAction SilentlyContinue }

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $exitCode = Invoke-Kof -KofArgs @("build", $Module, "--target", $Target)
    $sw.Stop()

    $bytes = Get-DirBytes -Path "build/classes"

    return [PSCustomObject]@{
        label         = $Label
        module        = $Module
        target        = $Target
        success       = ($exitCode -eq 0)
        elapsedMs     = [math]::Round($sw.Elapsed.TotalMilliseconds, 1)
        artifactBytes = $bytes
    }
}

function Measure-RuntimeMemory {
    param([string]$Label)

    $result = [PSCustomObject]@{
        label            = $Label
        available        = $false
        reason           = ""
        restingWorkingSetBytes = 0
        loadedWorkingSetBytes  = 0
        requestsSent     = 0
    }

    if (-not (Test-Path "build/classes/Default/Main.class")) {
        $result.reason = "build/classes/Default/Main.class nao encontrado apos o build"
        return $result
    }

    $proc = $null
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $JavaExe
        $psi.Arguments = "-cp build/classes Default.Main"
        $psi.UseShellExecute = $false
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.CreateNoWindow = $true
        $proc = [System.Diagnostics.Process]::Start($psi)

        $ready = $false
        for ($i = 0; $i -lt 10; $i++) {
            Start-Sleep -Milliseconds 500
            if ($proc.HasExited) { break }
            try {
                Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get -TimeoutSec 1 | Out-Null
                $ready = $true
                break
            } catch {}
        }

        if (-not $ready) {
            $stderr = ""
            try { $stderr = $proc.StandardError.ReadToEnd() } catch {}
            $result.reason = "servidor nao respondeu em /health a tempo. $stderr".Trim()
            return $result
        }

        $proc.Refresh()
        $result.restingWorkingSetBytes = $proc.WorkingSet64

        $sent = 0
        for ($i = 0; $i -lt $LoadRequests; $i++) {
            try {
                Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get -TimeoutSec 2 | Out-Null
                $sent++
            } catch {}
        }
        $proc.Refresh()

        $result.available = $true
        $result.loadedWorkingSetBytes = $proc.WorkingSet64
        $result.requestsSent = $sent
    } catch {
        $result.reason = "excecao ao medir runtime: $($_.Exception.Message)"
    } finally {
        if ($proc -and -not $proc.HasExited) {
            try { $proc.Kill(); $proc.WaitForExit(3000) } catch {}
        }
    }

    return $result
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   ORGANIZA IA -- BENCHMARK JVM vs KofJS (Issue #39)      " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$buildRuns = @()

Write-Host "`n[1/3] Compilacao a frio -- bff/ (target jvm) x $Iterations" -ForegroundColor Yellow
for ($i = 1; $i -le $Iterations; $i++) {
    $r = Measure-ColdBuild -Module "bff" -Target "jvm" -Label "bff-jvm"
    Write-Host ("   run $i/$Iterations -- {0}ms, {1} bytes, success={2}" -f $r.elapsedMs, $r.artifactBytes, $r.success)
    $buildRuns += $r
}

Write-Host "`n[2/3] Compilacao a frio -- frontend/ (target js / KofJS) x $Iterations" -ForegroundColor Yellow
for ($i = 1; $i -le $Iterations; $i++) {
    $r = Measure-ColdBuild -Module "frontend" -Target "js" -Label "frontend-js"
    Write-Host ("   run $i/$Iterations -- {0}ms, {1} bytes, success={2}" -f $r.elapsedMs, $r.artifactBytes, $r.success)
    $buildRuns += $r
}

Write-Host "`n[2b/3] Compilacao a frio -- backend/ (target jvm, bloqueado pela Issue #41)" -ForegroundColor Yellow
$backendRun = Measure-ColdBuild -Module "backend" -Target "jvm" -Label "backend-jvm"
Write-Host ("   {0}ms, {1} bytes, success={2} (falha esperada -- ver Issue #41)" -f $backendRun.elapsedMs, $backendRun.artifactBytes, $backendRun.success)
$buildRuns += $backendRun

Write-Host "`n[3/3] Memoria em runtime (best-effort) -- bff/ sob carga de $LoadRequests requisicoes" -ForegroundColor Yellow
Measure-ColdBuild -Module "bff" -Target "jvm" -Label "bff-jvm" | Out-Null
$memory = Measure-RuntimeMemory -Label "bff-jvm"
if ($memory.available) {
    Write-Host ("   repouso={0} bytes, sob carga={1} bytes, requests={2}" -f $memory.restingWorkingSetBytes, $memory.loadedWorkingSetBytes, $memory.requestsSent) -ForegroundColor Green
} else {
    Write-Host ("   indisponivel nesta execucao: {0}" -f $memory.reason) -ForegroundColor DarkYellow
}

function Get-Stats {
    param([array]$Values)
    if (-not $Values -or $Values.Count -eq 0) {
        return [PSCustomObject]@{ min = 0; max = 0; avg = 0 }
    }
    return [PSCustomObject]@{
        min = [math]::Round(($Values | Measure-Object -Minimum).Minimum, 1)
        max = [math]::Round(($Values | Measure-Object -Maximum).Maximum, 1)
        avg = [math]::Round(($Values | Measure-Object -Average).Average, 1)
    }
}

$labels = @($buildRuns | Select-Object -ExpandProperty label -Unique)
$summary = @()
foreach ($label in $labels) {
    $runs = @($buildRuns | Where-Object { $_.label -eq $label })
    $successfulRuns = @($runs | Where-Object { $_.success })
    $timeStats = Get-Stats -Values ($successfulRuns | Select-Object -ExpandProperty elapsedMs)
    $sizeStats = Get-Stats -Values ($successfulRuns | Select-Object -ExpandProperty artifactBytes)
    $summary += [PSCustomObject]@{
        label          = $label
        runs           = $runs.Count
        successfulRuns = $successfulRuns.Count
        elapsedMsMin   = $timeStats.min
        elapsedMsAvg   = $timeStats.avg
        elapsedMsMax   = $timeStats.max
        artifactBytesAvg = $sizeStats.avg
    }
}

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

$report = [PSCustomObject]@{
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    iterations     = $Iterations
    loadRequests   = $LoadRequests
    runs           = $buildRuns
    summary        = $summary
    runtimeMemory  = $memory
}

$jsonPath = Join-Path $OutDir "latest.json"
$report | ConvertTo-Json -Depth 6 | Out-File -FilePath $jsonPath -Encoding utf8
Write-Host "`nResultados (JSON): $jsonPath" -ForegroundColor Cyan

$mdPath = Join-Path $OutDir "latest.md"
$md = New-Object System.Collections.Generic.List[string]
$md.Add("# Benchmark KOF -- resultado mais recente")
$md.Add("")
$md.Add("Gerado em (UTC): $($report.generatedAtUtc)")
$md.Add("")
$md.Add("## Tempo de compilacao a frio e footprint de artefato")
$md.Add("")
$md.Add("| Alvo | Runs OK | Tempo min (ms) | Tempo medio (ms) | Tempo max (ms) | Artefato medio (bytes) |")
$md.Add("|---|---|---|---|---|---|")
foreach ($s in $summary) {
    $md.Add("| $($s.label) | $($s.successfulRuns)/$($s.runs) | $($s.elapsedMsMin) | $($s.elapsedMsAvg) | $($s.elapsedMsMax) | $($s.artifactBytesAvg) |")
}
$md.Add("")
$md.Add('`backend-jvm` reflete o build do monolito de dominio (`backend/`), hoje bloqueado por um bug do compilador Kof4j (ASM COMPUTE_FRAMES) -- ver Issue #41. Falha esperada ate a correcao upstream.')
$md.Add("")
$md.Add("## Memoria de runtime sob carga (best-effort)")
$md.Add("")
if ($memory.available) {
    $md.Add("| Alvo | Repouso (bytes) | Sob carga (bytes) | Requisicoes |")
    $md.Add("|---|---|---|---|")
    $md.Add("| $($memory.label) | $($memory.restingWorkingSetBytes) | $($memory.loadedWorkingSetBytes) | $($memory.requestsSent) |")
} else {
    $md.Add("Indisponivel nesta execucao: $($memory.reason)")
}
$md | Out-File -FilePath $mdPath -Encoding utf8
Write-Host "Resultados (Markdown): $mdPath" -ForegroundColor Cyan

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "   BENCHMARK CONCLUIDO                                     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

exit 0
