# scripts/benchmark_kof.ps1
# Pipeline de benchmarks empiricos do Organiza AI (Issue #39; hipotese H4/H2 da #42).
#
# Mede, de forma reproduzivel (N repeticoes -> mediana, desvio padrao, min, max):
#   1. Typecheck do dominio:       kof check backend
#   2. Typecheck da UI:            kof check frontend
#   3. Transpilacao Web:           kof build frontend --target js  (+ bytes do bundle .mjs)
#   4. Build JVM do gateway bff/   kof build bff --target jvm       (se bff/ existir)
#   5. LOC e modulos .kf:          backend/ x frontend/ x bff/ x legado Java arquivado
#   6. (Best-effort) Working Set do bff/ compilado em repouso e sob carga em /health
# Registra o ambiente (kof version, JDK, SO, commit) para reproducibilidade.
#
# Notas metodologicas (ver docs/BENCHMARKS.md):
#   - `kof check frontend` DENTRO do repo falha com PKG006 por causa do kof.toml na
#     raiz (a raiz de modulos do check vira a raiz do kof.toml). Para medir o
#     typecheck de verdade, o frontend e copiado para um diretorio temporario SEM
#     kof.toml. A copia nao entra na medida de tempo.
#   - `kof check backend` falha hoje com COMP002 (bug ASM COMPUTE_FRAMES, Issue #41).
#     A falha e REPORTADA (success=false + codigo de erro), nunca omitida.
#   - Resultados brutos ficam em benchmarks/results/ (ignorado pelo git); so a tabela
#     resumo vai para docs/BENCHMARKS.md.
#
# Uso local:
#   powershell -File scripts/benchmark_kof.ps1 -KofJar C:\caminho\kof-cli-0.5.0-beta.jar
#   powershell -File scripts/benchmark_kof.ps1 -KofExe kof        # kof no PATH (CI)
# Variaveis de ambiente aceitas: KOF_JAR, JAVA_HOME.

param(
    [string]$KofExe = "",
    [string]$KofJar = $env:KOF_JAR,
    [string]$JavaExe = "",
    [int]$Iterations = 3,
    [int]$LoadRequests = 100,
    [string]$OutDir = "benchmarks/results"
)

$ErrorActionPreference = "Continue"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
try { $OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

if ($JavaExe -eq "") {
    if ($env:JAVA_HOME) {
        $javaName = "java"
        if ($env:OS -eq "Windows_NT") { $javaName = "java.exe" }
        $JavaExe = Join-Path (Join-Path $env:JAVA_HOME "bin") $javaName
    } else { $JavaExe = "java" }
}
if ($KofExe -eq "" -and -not $KofJar) {
    Write-Host "ERRO: informe -KofExe (kof no PATH) ou -KofJar (kof-cli-*.jar / env KOF_JAR)." -ForegroundColor Red
    exit 2
}

$tmpRoot = Join-Path ([System.IO.Path]::GetTempPath()) "organiza-bench"
if (Test-Path $tmpRoot) { Remove-Item -Recurse -Force $tmpRoot -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null

# ---------------------------------------------------------------- helpers ----

function Invoke-Kof {
    # Retorna { exit, output }.
    param([string[]]$KofArgs)
    if ($KofExe -ne "") {
        $out = & $KofExe @KofArgs 2>&1 | Out-String
    } else {
        $out = & $JavaExe -jar $KofJar @KofArgs 2>&1 | Out-String
    }
    return [PSCustomObject]@{ exit = $LASTEXITCODE; output = $out }
}

function Get-FirstErrorCode {
    param([string]$Text)
    # Avisos (ex.: MEM014) aparecem antes do erro real; prioriza linhas "error:",
    # depois falhas internas do compilador (COMP*), e so entao qualquer codigo.
    foreach ($line in ($Text -split "`n")) {
        if ($line -match "error:") {
            $m = [regex]::Match($line, "\[([A-Z]{2,6}\d{3})\]")
            if ($m.Success) { return $m.Groups[1].Value }
        }
    }
    $m = [regex]::Match($Text, "\[(COMP\d{3})\]")
    if ($m.Success) { return $m.Groups[1].Value }
    $m = [regex]::Match($Text, "\[([A-Z]{2,6}\d{3})\]")
    if ($m.Success) { return $m.Groups[1].Value }
    return ""
}

function Get-DirBytes {
    param([string]$Path, [string]$Filter = "*")
    if (-not (Test-Path $Path)) { return 0 }
    $files = Get-ChildItem -Recurse -File -Path $Path -Filter $Filter -ErrorAction SilentlyContinue
    if (-not $files) { return 0 }
    return [long](($files | Measure-Object -Property Length -Sum).Sum)
}

function Get-Median {
    param([double[]]$Values)
    if (-not $Values -or $Values.Count -eq 0) { return 0 }
    $s = @($Values | Sort-Object)
    $n = $s.Count
    if ($n % 2 -eq 1) { return $s[[int](($n - 1) / 2)] }
    return ($s[$n / 2 - 1] + $s[$n / 2]) / 2
}

function Get-StdDev {
    # Desvio padrao amostral (n-1); 0 para n < 2.
    param([double[]]$Values)
    if (-not $Values -or $Values.Count -lt 2) { return 0 }
    $avg = ($Values | Measure-Object -Average).Average
    $sum = 0.0
    foreach ($v in $Values) { $sum += [math]::Pow($v - $avg, 2) }
    return [math]::Sqrt($sum / ($Values.Count - 1))
}

function Get-Stats {
    param([double[]]$Values)
    if (-not $Values -or $Values.Count -eq 0) {
        return [PSCustomObject]@{ n = 0; median = 0; stddev = 0; min = 0; max = 0 }
    }
    return [PSCustomObject]@{
        n      = $Values.Count
        median = [math]::Round((Get-Median $Values), 1)
        stddev = [math]::Round((Get-StdDev $Values), 1)
        min    = [math]::Round(($Values | Measure-Object -Minimum).Minimum, 1)
        max    = [math]::Round(($Values | Measure-Object -Maximum).Maximum, 1)
    }
}

function Measure-Step {
    # Roda o passo N vezes; $Action devolve { exit, output, bytes }.
    param([string]$Label, [scriptblock]$Action)
    $runs = @()
    for ($i = 1; $i -le $Iterations; $i++) {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $r = & $Action
        $sw.Stop()
        $ms = [math]::Round($sw.Elapsed.TotalMilliseconds, 1)
        $ok = ($r.exit -eq 0)
        $code = ""
        if (-not $ok) { $code = Get-FirstErrorCode $r.output }
        Write-Host ("   {0} run {1}/{2} -- {3} ms, bytes={4}, success={5} {6}" -f $Label, $i, $Iterations, $ms, $r.bytes, $ok, $code)
        $runs += [PSCustomObject]@{
            label = $Label; run = $i; success = $ok; elapsedMs = $ms
            artifactBytes = [long]$r.bytes; errorCode = $code
        }
    }
    return $runs
}

function Get-KofLoc {
    # Conta linhas de codigo (sem branco e sem comentario de linha `//`) e arquivos.
    param([string]$Path, [string]$Filter)
    if (-not (Test-Path $Path)) { return [PSCustomObject]@{ files = 0; loc = 0 } }
    $files = @(Get-ChildItem -Recurse -File -Path $Path -Filter $Filter -ErrorAction SilentlyContinue)
    $loc = 0
    foreach ($f in $files) {
        foreach ($line in [System.IO.File]::ReadLines($f.FullName)) {
            $t = $line.Trim()
            if ($t -eq "" -or $t.StartsWith("//") -or $t.StartsWith("/*") -or $t.StartsWith("*")) { continue }
            $loc++
        }
    }
    return [PSCustomObject]@{ files = $files.Count; loc = $loc }
}

# --------------------------------------------------------------- ambiente ----

$kofVersion = ((Invoke-Kof -KofArgs @("version")).output).Trim()
$commit = ""
try { $commit = (git rev-parse --short HEAD 2>$null | Out-String).Trim() } catch {}
$javaVersion = ""
try {
    # `java -version` escreve em stderr: 2>&1 em PS 5.1 gera ErrorRecord, entao coleta via .ToString().
    $javaVersion = (& $JavaExe -version 2>&1 | Select-Object -First 1 | ForEach-Object { $_.ToString() }).Trim()
} catch {}
$os = [System.Environment]::OSVersion.VersionString
$cpu = ""
try { $cpu = (Get-CimInstance Win32_Processor -ErrorAction Stop | Select-Object -First 1).Name } catch { $cpu = $env:PROCESSOR_IDENTIFIER }

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   ORGANIZA AI -- BENCHMARK KOF (Issue #39)               " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ("kof={0} | commit={1} | {2} repeticoes" -f $kofVersion, $commit, $Iterations)

$allRuns = @()

# ------------------------------------------------- 1. typecheck backend ------
Write-Host "`n[1/6] Typecheck do dominio -- kof check backend (Issue #41 pode bloquear)" -ForegroundColor Yellow
$allRuns += Measure-Step -Label "check-backend" -Action {
    $r = Invoke-Kof -KofArgs @("check", "backend")
    [PSCustomObject]@{ exit = $r.exit; output = $r.output; bytes = 0 }
}

# ------------------------------------------------ 2. typecheck frontend ------
Write-Host "`n[2/6] Typecheck da UI -- kof check frontend (copia sem kof.toml)" -ForegroundColor Yellow
$checkWork = Join-Path $tmpRoot "check-frontend"
New-Item -ItemType Directory -Path $checkWork -Force | Out-Null
Copy-Item -Recurse (Join-Path $repoRoot "frontend") (Join-Path $checkWork "frontend")   # fora da medida de tempo
# --target js e o target real da UI (KofJS); o check padrao tipa para JVM e e ~4x mais lento.
$allRuns += Measure-Step -Label "check-frontend-js" -Action {
    Push-Location $checkWork
    try { $r = Invoke-Kof -KofArgs @("check", "frontend", "--target", "js") } finally { Pop-Location }
    [PSCustomObject]@{ exit = $r.exit; output = $r.output; bytes = 0 }
}
$allRuns += Measure-Step -Label "check-frontend-default" -Action {
    Push-Location $checkWork
    try { $r = Invoke-Kof -KofArgs @("check", "frontend") } finally { Pop-Location }
    [PSCustomObject]@{ exit = $r.exit; output = $r.output; bytes = 0 }
}

# ---------------------------------------------- 3. transpilacao KofJS --------
Write-Host "`n[3/6] Transpilacao Web -- kof build frontend --target js (+ bundle .mjs)" -ForegroundColor Yellow
$allRuns += Measure-Step -Label "build-frontend-js" -Action {
    $out = Join-Path $tmpRoot "js-out"
    if (Test-Path $out) { Remove-Item -Recurse -Force $out -ErrorAction SilentlyContinue }
    $r = Invoke-Kof -KofArgs @("build", "frontend", "--target", "js", "--output", $out)
    [PSCustomObject]@{ exit = $r.exit; output = $r.output; bytes = (Get-DirBytes -Path $out -Filter "*.mjs") }
}

# ------------------------------------------------------ 4. build JVM bff -----
if (Test-Path "bff") {
    Write-Host "`n[4/6] Build JVM a frio -- bff/ (gateway)" -ForegroundColor Yellow
    $allRuns += Measure-Step -Label "build-bff-jvm" -Action {
        if (Test-Path "build") { Remove-Item -Recurse -Force "build" -ErrorAction SilentlyContinue }
        $r = Invoke-Kof -KofArgs @("build", "bff", "--target", "jvm")
        [PSCustomObject]@{ exit = $r.exit; output = $r.output; bytes = (Get-DirBytes -Path "build/classes") }
    }
} else {
    Write-Host "`n[4/6] bff/ nao existe -- passo ignorado" -ForegroundColor DarkYellow
}

# ------------------------------------------------------------ 5. LOC ---------
Write-Host "`n[5/6] LOC e modulos" -ForegroundColor Yellow
$loc = [ordered]@{
    "backend (.kf)"          = Get-KofLoc -Path "backend" -Filter "*.kf"
    "frontend (.kf)"         = Get-KofLoc -Path "frontend" -Filter "*.kf"
    "bff (.kf)"              = Get-KofLoc -Path "bff" -Filter "*.kf"
    "legado Java arquivado"  = Get-KofLoc -Path "archive/legacy-backend-java" -Filter "*.java"
}
foreach ($k in $loc.Keys) { Write-Host ("   {0}: {1} arquivos, {2} LOC" -f $k, $loc[$k].files, $loc[$k].loc) }

# ------------------------------------------- 6. memoria em runtime (best) ----
function Measure-RuntimeMemory {
    $result = [PSCustomObject]@{
        available = $false; reason = ""
        restingWorkingSetBytes = 0; loadedWorkingSetBytes = 0; requestsSent = 0
    }
    if (-not (Test-Path "build/classes/Default/Main.class")) {
        $result.reason = "build/classes/Default/Main.class nao encontrado (build do bff ausente ou falhou)"
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
        for ($i = 0; $i -lt 20; $i++) {
            Start-Sleep -Milliseconds 500
            if ($proc.HasExited) { break }
            try {
                Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get -TimeoutSec 1 | Out-Null
                $ready = $true; break
            } catch {}
        }
        if (-not $ready) {
            $stderr = ""
            try { if ($proc.HasExited) { $stderr = $proc.StandardError.ReadToEnd() } } catch {}
            $result.reason = ("servidor nao respondeu em /health a tempo. " + $stderr).Trim()
            return $result
        }
        $proc.Refresh()
        $result.restingWorkingSetBytes = $proc.WorkingSet64
        $sent = 0
        for ($i = 0; $i -lt $LoadRequests; $i++) {
            try { Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get -TimeoutSec 2 | Out-Null; $sent++ } catch {}
        }
        $proc.Refresh()
        $result.available = $true
        $result.loadedWorkingSetBytes = $proc.WorkingSet64
        $result.requestsSent = $sent
    } catch {
        $result.reason = "excecao ao medir runtime: $($_.Exception.Message)"
    } finally {
        if ($proc -and -not $proc.HasExited) { try { $proc.Kill(); $proc.WaitForExit(3000) } catch {} }
    }
    return $result
}

Write-Host "`n[6/6] Memoria em runtime (best-effort) -- bff/ sob $LoadRequests requisicoes" -ForegroundColor Yellow
$memory = Measure-RuntimeMemory
if ($memory.available) {
    Write-Host ("   repouso={0} B, sob carga={1} B, requests={2}" -f $memory.restingWorkingSetBytes, $memory.loadedWorkingSetBytes, $memory.requestsSent) -ForegroundColor Green
} else {
    Write-Host ("   indisponivel: {0}" -f $memory.reason) -ForegroundColor DarkYellow
}

# ------------------------------------------------------------- relatorio -----
$labels = @($allRuns | Select-Object -ExpandProperty label -Unique)
$summary = @()
foreach ($label in $labels) {
    $runs = @($allRuns | Where-Object { $_.label -eq $label })
    $ok = @($runs | Where-Object { $_.success })
    $time = Get-Stats -Values @($ok | ForEach-Object { [double]$_.elapsedMs })
    $bytes = Get-Stats -Values @($ok | ForEach-Object { [double]$_.artifactBytes })
    $codes = @($runs | Where-Object { -not $_.success -and $_.errorCode } | Select-Object -ExpandProperty errorCode -Unique)
    $summary += [PSCustomObject]@{
        label = $label; runs = $runs.Count; successfulRuns = $ok.Count
        time = $time; bytesMedian = $bytes.median; errorCodes = ($codes -join ",")
    }
}

$report = [PSCustomObject]@{
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    environment    = [PSCustomObject]@{ kof = $kofVersion; java = $javaVersion; os = $os; cpu = $cpu; commit = $commit }
    iterations     = $Iterations
    loadRequests   = $LoadRequests
    runs           = $allRuns
    summary        = $summary
    loc            = $loc
    runtimeMemory  = $memory
}

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$jsonPath = Join-Path $OutDir "latest.json"
$report | ConvertTo-Json -Depth 8 | Out-File -FilePath $jsonPath -Encoding utf8

$md = New-Object System.Collections.Generic.List[string]
$md.Add("# Benchmark KOF -- resultado mais recente")
$md.Add("")
$md.Add("Gerado em (UTC): $($report.generatedAtUtc)  ")
$md.Add("Ambiente: kof ``$kofVersion`` | commit ``$commit`` | $javaVersion | $os | $cpu | $Iterations repeticoes")
$md.Add("")
$md.Add("## Tempo (ms) -- mediana, desvio padrao (amostral), min, max")
$md.Add("")
$md.Add("| Passo | OK | Mediana | Desvio | Min | Max | Bundle/artefato (bytes) | Erro |")
$md.Add("|---|---|---|---|---|---|---|---|")
foreach ($s in $summary) {
    $md.Add("| $($s.label) | $($s.successfulRuns)/$($s.runs) | $($s.time.median) | $($s.time.stddev) | $($s.time.min) | $($s.time.max) | $($s.bytesMedian) | $($s.errorCodes) |")
}
$md.Add("")
$md.Add('`check-backend` falha hoje com `COMP002` (bug ASM COMPUTE_FRAMES do Kof4j, Issue #41): sem run bem-sucedido nao ha tempo a reportar. `check-frontend-*` rodam em copia sem `kof.toml` (PKG006 -- ver docs/BENCHMARKS.md); `-js` e o target real da UI, `-default` tipa para JVM.')
$md.Add("")
$md.Add("## LOC e modulos")
$md.Add("")
$md.Add("| Base | Arquivos | LOC (sem brancos/comentarios de linha) |")
$md.Add("|---|---|---|")
foreach ($k in $loc.Keys) { $md.Add("| $k | $($loc[$k].files) | $($loc[$k].loc) |") }
$md.Add("")
$md.Add("## Memoria de runtime sob carga (best-effort)")
$md.Add("")
if ($memory.available) {
    $md.Add("| Repouso (bytes) | Sob carga (bytes) | Requisicoes |")
    $md.Add("|---|---|---|")
    $md.Add("| $($memory.restingWorkingSetBytes) | $($memory.loadedWorkingSetBytes) | $($memory.requestsSent) |")
} else {
    $md.Add("Indisponivel nesta execucao: $($memory.reason)")
}
$mdPath = Join-Path $OutDir "latest.md"
$md | Out-File -FilePath $mdPath -Encoding utf8

Write-Host "`nResultados: $jsonPath | $mdPath" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   BENCHMARK CONCLUIDO                                     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Remove-Item -Recurse -Force $tmpRoot -ErrorAction SilentlyContinue
exit 0
