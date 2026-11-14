param(
    [string]$Dir = (Join-Path (Split-Path -Parent $PSScriptRoot) "work\qa"),
    [int]$Port = 8000,
    [switch]$Stop,
    [switch]$Reset,
    [switch]$Rebuild
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$dirFull = [IO.Path]::GetFullPath($Dir)
$buildDir = Join-Path $dirFull "build"
$appDir = Join-Path $buildDir "app"
$webDir = Join-Path $buildDir "web"
$dataDir = Join-Path $dirFull "data"
$logDir = Join-Path $dirFull "logs"
$pidFile = Join-Path $logDir "pid.txt"
$jwtFile = Join-Path $dirFull "jwt-secret.txt"
$jar = Join-Path $appDir "kof-app.jar"
$workRoot = Split-Path -Parent $repo
$kof = Join-Path $workRoot "_kof\0.6.6\kof-0.6.6-windows-x86_64\bin\kof.bat"
if (-not (Test-Path -LiteralPath $kof)) {
    $kof = Join-Path $workRoot "work\_kof\0.6.6\kof-0.6.6-windows-x86_64\bin\kof.bat"
}
$java = Join-Path (Split-Path -Parent (Split-Path -Parent $kof)) "jdk\bin\java.exe"

function Stop-QaProcess {
    if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host "QA já está parado."; return }
    $savedPid = [int]([IO.File]::ReadAllText($pidFile).Trim())
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$savedPid" -ErrorAction SilentlyContinue
    if ($null -eq $process) { Remove-Item -LiteralPath $pidFile -Force; Write-Host "PID antigo removido."; return }
    $expectedJar = [IO.Path]::GetFullPath($jar)
    if (-not $process.CommandLine.Contains($expectedJar)) {
        throw "O PID $savedPid não pertence ao QA desta pasta; nenhum processo foi encerrado."
    }
    Stop-Process -Id $savedPid -Force
    Remove-Item -LiteralPath $pidFile -Force
    [IO.File]::WriteAllText((Join-Path $logDir "stopped.txt"), "Encerrado em $([DateTimeOffset]::Now.ToString('o'))`r`n")
    Write-Host "QA encerrado (PID $savedPid)."
}

New-Item -ItemType Directory -Path $dirFull,$dataDir,$logDir -Force | Out-Null
if ($Stop) { Stop-QaProcess; exit 0 }

if (Test-Path -LiteralPath $pidFile) { Stop-QaProcess }

if ($Rebuild -or -not (Test-Path -LiteralPath $jar) -or -not (Test-Path -LiteralPath (Join-Path $webDir "Default.mjs"))) {
    if (-not (Test-Path -LiteralPath $kof)) { throw "Kof 0.6.6 não encontrado em $kof" }
    if (Test-Path -LiteralPath $buildDir) { Remove-Item -LiteralPath $buildDir -Recurse -Force }
    New-Item -ItemType Directory -Path $appDir,$webDir -Force | Out-Null
    Push-Location $repo
    try {
        & $kof check backend
        if ($LASTEXITCODE -ne 0) { throw "kof check backend falhou" }
        $cp = (& $kof deps resolve . | Select-Object -Last 1).Trim()
        & $kof build backend --target jvm --fat --classpath $cp --output $appDir
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $jar)) { throw "build do backend falhou" }
        & $kof build frontend --target js --output $webDir
        if ($LASTEXITCODE -ne 0) { throw "build do frontend falhou" }
        Copy-Item -LiteralPath (Join-Path $repo "frontend\assets") -Destination (Join-Path $webDir "assets") -Recurse -Force
        & (Join-Path $repo "scripts\prepare_qa_routes.ps1") -WebDir $webDir
        $indexPath = Join-Path $webDir "index.html"
        $index = [IO.File]::ReadAllText($indexPath)
        if (-not $index.Contains("input::-ms-reveal")) {
            $css = "    input::-ms-reveal, input::-ms-clear { display: none; }`r`n    #kof-titlebar, #kof-status { display: none !important; }`r`n    html, body, #kof-root { background: #0A0D18; }`r`n    #kof-root { padding: 0; gap: 0; overflow: hidden; }`r`n    .kof-window { padding: 0; border: 0; border-radius: 0; min-height: 100%; }`r`n    html { font-size: clamp(14px, calc(0.6vw + 8.32px), 24px); }`r`n    @media (max-width: 600px) { html { font-size: 16px; } }`r`n  </style>"
            $index = $index.Replace("  </style>", $css)
            [IO.File]::WriteAllText($indexPath, $index, [Text.UTF8Encoding]::new($false))
        }
    } finally { Pop-Location }
}

if (-not (Test-Path -LiteralPath $jwtFile)) {
    $bytes = New-Object byte[] 48
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    [IO.File]::WriteAllText($jwtFile, ([Convert]::ToBase64String($bytes)), [Text.UTF8Encoding]::new($false))
}
$secret = [IO.File]::ReadAllText($jwtFile).Trim()

$psi = New-Object Diagnostics.ProcessStartInfo
$psi.FileName = $java
$psi.Arguments = "-Dkof.root=`"$dirFull`" -jar `"$jar`""
$psi.WorkingDirectory = $dirFull
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
@($psi.EnvironmentVariables.Keys) | Where-Object { $_ -like "KOF_*" -or $_ -like "OPENAI_*" -or $_ -like "RESEND_*" } | ForEach-Object { $psi.EnvironmentVariables.Remove($_) }
$psi.EnvironmentVariables["PORT"] = "$Port"
$psi.EnvironmentVariables["KOF_QA"] = "true"
$psi.EnvironmentVariables["KOF_ENV"] = "qa"
$psi.EnvironmentVariables["KOF_JWT_SECRET"] = $secret
$psi.EnvironmentVariables["KOF_WEB_OUT"] = $webDir
$psi.EnvironmentVariables["KOF_DB_URL"] = "jdbc:h2:file:$($dataDir.Replace('\','/'))/organiza;WRITE_DELAY=0"
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$process = [Diagnostics.Process]::Start($psi)
[IO.File]::WriteAllText($pidFile, "$($process.Id)`r`n")
$process.add_OutputDataReceived({ param($s,$e) if($e.Data){ Add-Content -LiteralPath (Join-Path $logDir 'out.log') -Value $e.Data } })
$process.add_ErrorDataReceived({ param($s,$e) if($e.Data){ Add-Content -LiteralPath (Join-Path $logDir 'err.log') -Value $e.Data } })
$process.BeginOutputReadLine()
$process.BeginErrorReadLine()

$base = "http://localhost:$Port"
$ready = $false
for ($i=0; $i -lt 60 -and -not $ready; $i++) {
    Start-Sleep -Milliseconds 500
    try { $ready = ((Invoke-WebRequest -UseBasicParsing "$base/health" -TimeoutSec 2).StatusCode -eq 200) } catch {}
}
if (-not $ready) { Stop-QaProcess; throw "Servidor não respondeu em $base/health" }

$endpoint = if ($Reset) { "/api/qa/reset" } else { "/api/qa/seed" }
Invoke-WebRequest -UseBasicParsing -Method Post "$base$endpoint" -TimeoutSec 15 | Out-Null
if ($Reset) { Invoke-WebRequest -UseBasicParsing -Method Post "$base/api/qa/seed" -TimeoutSec 15 | Out-Null }

Write-Host "QA local: $base/qa"
Write-Host "Dashboard: $base/qa/dashboard"
Write-Host "Mobile: $base/qa/mobile/dashboard"
Write-Host "Conta pronta: qa@organiza.local / Qa@Organiza1"
Write-Host "Conta sem onboarding: qa-novo@organiza.local / Qa@Organiza1"
Write-Host "Dados persistentes: $dataDir"
Write-Host "PID: $($process.Id) (pare com scripts\qa.ps1 -Dir `"$dirFull`" -Stop)"
