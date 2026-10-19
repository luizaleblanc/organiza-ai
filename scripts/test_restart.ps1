# scripts/test_restart.ps1
# G-RESTART: os dados gravados pela API sobrevivem ao reinício do processo (PERS-01..03).
# Sobe o servidor com KOF_DB_URL = H2 em arquivo dentro de -DbDir (apagado no início), ou -DbUrl, cria conta + onboarding 3000
# + envelope FOOD 1200 + transação de 600 em FOOD,
# encerra o processo e sobe outro com o mesmo banco. Dois encerramentos:
#   (1) normal: Ctrl+C no console do servidor (a JVM roda os shutdown hooks);
#   (2) à força: Kill() logo depois da última gravação (sem shutdown).
# Depois de cada reinício: login com as mesmas credenciais = 200, daily-pulse salary = 3000.0 e pulse = 80.0,
# exatamente 1 envelope FOOD (limite 1200.0, gasto 600.0) e exatamente 1 transação com value = 600.0.
# Pré-requisitos: `kof build backend --target jvm` e o jar do driver H2 em -ExtraClasspath (`kof deps resolve`).
# Exit code 0 somente se todos os asserts passarem e nenhum stderr tiver VerifyError/LinkageError.

param(
    [string]$ClassesDir = "build/classes",
    [string]$ExtraClasspath = "",
    [string]$JavaExe = "C:\Program Files\Eclipse Adoptium\jdk-25.0.3.9-hotspot\bin\java.exe",
    [int]$Port = 3001,
    [string]$DbDir = (Join-Path ([System.IO.Path]::GetTempPath()) "organiza-restart-db"),
    # Banco externo (ex.: mysql://host:3306/organiza_kof?sslMode=trust): usa esta URL em vez do H2;
    # usuario/senha vem de KOF_DB_USER/KOF_DB_PASSWORD do ambiente. -DbDir fica so para os logs.
    [string]$DbUrl = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$BaseUrl = "http://localhost:$Port"
$RunClasspath = if ($ExtraClasspath) { "$ClassesDir;$ExtraClasspath" } else { $ClassesDir }

if (-not (Test-Path (Join-Path $ClassesDir "Default/Main.class"))) {
    Write-Host "[ERRO] $ClassesDir/Default/Main.class não encontrado. Rode: kof build backend --target jvm" -ForegroundColor Red
    exit 2
}

# Banco novo a cada execução, fora do repositório
if (Test-Path $DbDir) { Remove-Item -Recurse -Force $DbDir }
New-Item -ItemType Directory -Force $DbDir | Out-Null
$env:KOF_DB_URL = if ($DbUrl) { $DbUrl } else { "jdbc:h2:file:" + (Join-Path $DbDir "restart") + ";WRITE_DELAY=0" }
$dbLabel = if ($DbUrl) { "banco externo " + ($DbUrl -replace '//[^/]+', '//<host>') } else { "H2 em $DbDir" }
$env:PORT = "$Port"
if (-not $env:KOF_JWT_SECRET) {
    $rnd = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rnd)
    $env:KOF_JWT_SECRET = -join ($rnd | ForEach-Object { $_.ToString("x2") })
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   ORGANIZA IA -- G-RESTART ($BaseUrl, $dbLabel)" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# Chamada HTTP que nunca lança: devolve status + corpo (4xx/5xx inclusos).
function Invoke-Api([string]$Method, [string]$Path, [string]$Token = "", $Body = $null) {
    $req = [System.Net.HttpWebRequest]::Create("$BaseUrl$Path")
    $req.Method = $Method
    $req.Timeout = 5000
    if ($Token) { $req.Headers.Add("Authorization", "Bearer $Token") }
    if ($null -ne $Body) {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
        $req.ContentType = "application/json"
        $req.ContentLength = $bytes.Length
        $s = $req.GetRequestStream(); $s.Write($bytes, 0, $bytes.Length); $s.Close()
    }
    try {
        $resp = $req.GetResponse()
    } catch [System.Net.WebException] {
        $resp = $_.Exception.Response
        if ($null -eq $resp) { return @{ Status = 0; Body = $_.Exception.Message } }
    }
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream(), [System.Text.Encoding]::UTF8)
    $text = $reader.ReadToEnd(); $reader.Close(); $resp.Close()
    return @{ Status = [int]$resp.StatusCode; Body = $text }
}

$script:results = @()
function Test-Step([string]$Name, [scriptblock]$Check) {
    $n = $script:results.Count + 1
    Write-Host ("{0,2}. {1}..." -f $n, $Name) -NoNewline
    try {
        $detail = & $Check
        if ($detail -is [array]) { $detail = $detail[-1] }
        if ($detail -eq $true) {
            Write-Host " [PASS]" -ForegroundColor Green
            $script:results += $true
        } else {
            Write-Host " [FAIL] $detail" -ForegroundColor Red
            $script:results += $false
        }
    } catch {
        Write-Host " [FAIL] exceção: $($_.Exception.Message)" -ForegroundColor Red
        $script:results += $false
    }
}

function Expect([bool]$Cond, $Got) { if ($Cond) { return $true } else { return "obtido: $Got" } }

# Lista JSON -> array (PowerShell 5.1 devolve o array inteiro como um objeto só)
function ConvertFrom-JsonList([string]$Json) {
    $parsed = $Json | ConvertFrom-Json
    if ($null -eq $parsed) { return ,@() }
    return ,@($parsed | ForEach-Object { $_ })
}

# Cada servidor ganha o próprio console (oculto) para receber Ctrl+C sem atingir esta suíte.
$script:errLogs = @()
function Start-Server([string]$Tag) {
    $err = Join-Path $DbDir "server-$Tag-stderr.txt"
    $out = Join-Path $DbDir "server-$Tag-stdout.txt"
    $script:errLogs += $err
    $p = Start-Process -FilePath $JavaExe -ArgumentList @("-Xverify:all", "-cp", "`"$RunClasspath`"", "Default.Main") `
        -PassThru -WindowStyle Hidden -RedirectStandardError $err -RedirectStandardOutput $out
    $up = $false
    for ($i = 0; $i -lt 60 -and -not $up -and -not $p.HasExited; $i++) {
        Start-Sleep -Milliseconds 500
        $up = ((Invoke-Api "GET" "/health").Status -eq 200)
    }
    return @{ Proc = $p; Up = $up }
}

# Encerramento normal: um PowerShell auxiliar se anexa ao console do servidor e envia Ctrl+C
# (GenerateConsoleCtrlEvent); a JVM trata como SIGINT e roda os shutdown hooks.
function Stop-ServerGracefully($Proc) {
    $helper = 'Add-Type -Namespace W -Name K -MemberDefinition ''' +
        '[DllImport("kernel32.dll")] public static extern bool FreeConsole(); ' +
        '[DllImport("kernel32.dll")] public static extern bool AttachConsole(uint p); ' +
        '[DllImport("kernel32.dll")] public static extern bool SetConsoleCtrlHandler(System.IntPtr h, bool a); ' +
        '[DllImport("kernel32.dll")] public static extern bool GenerateConsoleCtrlEvent(uint e, uint g);''' + "`n" +
        '[W.K]::FreeConsole() | Out-Null' + "`n" +
        'if (-not [W.K]::AttachConsole(' + $Proc.Id + ')) { exit 3 }' + "`n" +
        '[W.K]::SetConsoleCtrlHandler([System.IntPtr]::Zero, $true) | Out-Null' + "`n" +
        'if (-not [W.K]::GenerateConsoleCtrlEvent(0, 0)) { exit 4 }' + "`n" +
        'exit 0'
    $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($helper))
    $h = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-NonInteractive", "-EncodedCommand", $encoded) `
        -PassThru -WindowStyle Hidden -Wait
    $exited = $Proc.WaitForExit(15000)
    return @{ HelperExit = $h.ExitCode; Exited = $exited }
}

function Stop-ServerForcefully($Proc) {
    $Proc.Kill()
    $Proc.WaitForExit(5000) | Out-Null
    return $Proc.HasExited
}

function New-Account([string]$Label, [string]$Cred) {
    $script:newToken = ""
    Test-Step "$Label`: cadastro = 200 com JWT" {
        $r = Invoke-Api "POST" "/api/auth/register" "" $Cred
        $script:newToken = $r.Body
        Expect ($r.Status -eq 200 -and $r.Body.Split(".").Length -eq 3) "$($r.Status) $($r.Body)"
    }
    Test-Step "$Label`: onboarding 3000 = 200 e pulso com salary 3000.0" {
        $body = (@{ salary = 3000.0; incomeType = "FIXED"; hasDebt = $false } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/users/onboarding" $script:newToken $body
        $p = Invoke-Api "GET" "/api/budgets/daily-pulse" $script:newToken
        $j = $p.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $p.Status -eq 200 -and $j.salary -eq 3000.0) "onboarding $($r.Status) $($r.Body) | pulso $($p.Status) $($p.Body)"
    }
    Test-Step "$Label`: envelope FOOD 1200 = 200" {
        $body = (@{ categoryName = "FOOD"; limitAmount = 1200.0 } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/envelopes" $script:newToken $body
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.categoryName -eq "FOOD" -and $j.limitAmount -eq 1200.0) "$($r.Status) $($r.Body)"
    }
    Test-Step "$Label`: transação de 600 em FOOD = 200 com value 600.0" {
        $body = (@{ description = "Mercado do mês"; amount = 600; category = "FOOD"; currency = "BRL" } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/transactions" $script:newToken $body
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.value -eq 600.0 -and $j.envelopeId) "$($r.Status) $($r.Body)"
    }
}

function Assert-Persisted([string]$Label, [string]$Cred) {
    $script:loginToken = ""
    Test-Step "$Label`: login com as mesmas credenciais = 200 (PERS-01)" {
        $r = Invoke-Api "POST" "/api/auth/login" "" $Cred
        $script:loginToken = $r.Body
        Expect ($r.Status -eq 200 -and $r.Body.Split(".").Length -eq 3) "$($r.Status) $($r.Body)"
    }
    Test-Step "$Label`: /api/users/me com nome e onboardingCompleted=true" {
        $r = Invoke-Api "GET" "/api/users/me" $script:loginToken
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.name -like "* Restart" -and $j.onboardingCompleted -eq $true) "$($r.Status) $($r.Body)"
    }
    Test-Step "$Label`: daily-pulse salary = 3000.0 e pulse = 80.0 (PERS-02/03)" {
        $r = Invoke-Api "GET" "/api/budgets/daily-pulse" $script:loginToken
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.salary -eq 3000.0 -and $j.pulse -eq 80.0 -and $j.totalSpent -eq 600.0) "$($r.Status) $($r.Body)"
    }
    Test-Step "$Label`: exatamente 1 envelope, FOOD com limite 1200.0 e gasto 600.0 (PERS-03)" {
        $r = Invoke-Api "GET" "/api/envelopes" $script:loginToken
        $list = (ConvertFrom-JsonList $r.Body)
        Expect ($r.Status -eq 200 -and $list.Count -eq 1 -and $list[0].categoryName -eq "FOOD" -and $list[0].limitAmount -eq 1200.0 -and $list[0].currentSpent -eq 600.0) "$($r.Status) $($r.Body)"
    }
    Test-Step "$Label`: exatamente 1 transação, value = 600.0 (PERS-03)" {
        $r = Invoke-Api "GET" "/api/transactions" $script:loginToken
        $list = (ConvertFrom-JsonList $r.Body)
        Expect ($r.Status -eq 200 -and $list.Count -eq 1 -and $list[0].value -eq 600.0 -and $list[0].category -eq "FOOD") "$($r.Status) $($r.Body)"
    }
}

$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$credA = (@{ name = "Ana Restart"; email = "restart_a_$stamp@organiza.ai"; password = "senhaRestartA123" } | ConvertTo-Json -Compress)
$credB = (@{ name = "Bia Restart"; email = "restart_b_$stamp@organiza.ai"; password = "senhaRestartB123" } | ConvertTo-Json -Compress)
$servers = @()

try {
    # ---- (1) encerramento normal ----
    $s1 = Start-Server "1"; $servers += $s1.Proc
    Test-Step "Servidor 1 sobe com o banco em arquivo" { Expect $s1.Up "health não respondeu" }
    New-Account "Conta A" $credA
    Test-Step "Servidor 1 encerra normalmente (Ctrl+C)" {
        $st = Stop-ServerGracefully $s1.Proc
        Expect ($st.HelperExit -eq 0 -and $st.Exited) "helper=$($st.HelperExit) encerrou=$($st.Exited)"
    }

    $s2 = Start-Server "2"; $servers += $s2.Proc
    Test-Step "Servidor 2 sobe com o mesmo banco" { Expect $s2.Up "health não respondeu" }
    Assert-Persisted "Após encerramento normal (conta A)" $credA

    # ---- (2) kill à força logo depois de gravar ----
    New-Account "Conta B" $credB
    Test-Step "Servidor 2 morto à força (Kill) logo após gravar" { Expect (Stop-ServerForcefully $s2.Proc) "processo não morreu" }

    $s3 = Start-Server "3"; $servers += $s3.Proc
    Test-Step "Servidor 3 sobe com o mesmo banco" { Expect $s3.Up "health não respondeu" }
    Assert-Persisted "Após kill à força (conta B)" $credB
    Assert-Persisted "Após kill à força (conta A)" $credA
} finally {
    foreach ($p in $servers) {
        if ($p -and -not $p.HasExited) { $p.Kill(); $p.WaitForExit(5000) | Out-Null }
    }
}

# Bytecode inválido aparece só quando a classe é linkada: qualquer VerifyError/LinkageError reprova.
$stderrAll = ""
foreach ($f in $script:errLogs) { if (Test-Path $f) { $stderrAll += (Get-Content $f -Raw) } }
$verifyClean = -not ($stderrAll -match "VerifyError|LinkageError|ClassFormatError|NoClassDefFoundError")
if (-not $verifyClean) {
    Write-Host "`n[FAIL] stderr de algum servidor contém erro de verificação/linkagem:" -ForegroundColor Red
    Write-Host $stderrAll
}

$total = $script:results.Count
$passed = @($script:results | Where-Object { $_ }).Count
$allGreen = ($total -gt 0 -and $passed -eq $total -and $verifyClean)
Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host "   RESULTADO G-RESTART: $passed / $total PASSOS GREEN" -ForegroundColor $(if ($allGreen) { "Green" } else { "Red" })
Write-Host "   stderr dos servidores: $(if ($verifyClean) { 'sem VerifyError/LinkageError' } else { 'COM ERRO (ver acima)' })"
Write-Host "=================================================================" -ForegroundColor Cyan
if ($allGreen) { exit 0 } else { exit 1 }
