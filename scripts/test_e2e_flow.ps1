# scripts/test_e2e_flow.ps1
# Suíte de Homologação E2E — Fluxo Completo do Usuário no Monólito KofLith (Porta 3000)
# Cobre todas as rotas de backend/main.kf com asserts semânticos (valor exato, não "não crashou").
# Pré-requisito: `kof build backend --target jvm` (saída em build/classes, ou passe -ClassesDir).
# Exit code 0 somente se TODOS os testes passarem e o servidor não emitir VerifyError/LinkageError.

param(
    [string]$ClassesDir = "build/classes",
    [string]$JavaExe = "C:\Program Files\Eclipse Adoptium\jdk-25.0.3.9-hotspot\bin\java.exe",
    [string]$BaseUrl = "http://localhost:3000"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   ORGANIZA IA -- HOMOLOGAÇÃO E2E KOFLITH (PORTA 3000)          " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# Chamada HTTP que nunca lança: devolve status + corpo decodificado em UTF-8 (4xx/5xx inclusos).
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
# Executa um teste isolado: exceção ou assert falso contam como FAIL e a suíte continua.
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

# 1. Inicia o servidor KofLith em background (stderr capturado fora do repo)
if (-not (Test-Path (Join-Path $ClassesDir "Default/Main.class"))) {
    Write-Host "`n[ERRO] $ClassesDir/Default/Main.class não encontrado. Rode: kof build backend --target jvm" -ForegroundColor Red
    exit 2
}
$errLog = Join-Path ([System.IO.Path]::GetTempPath()) "organiza-e2e-server-stderr.txt"
$outLog = Join-Path ([System.IO.Path]::GetTempPath()) "organiza-e2e-server-stdout.txt"
Write-Host "`nInicializando Servidor KofLith na JVM ($ClassesDir, porta 3000)..." -ForegroundColor Yellow
$serverProc = Start-Process -FilePath $JavaExe -ArgumentList @("-Xverify:all", "-cp", $ClassesDir, "Default.Main") `
    -PassThru -NoNewWindow -RedirectStandardError $errLog -RedirectStandardOutput $outLog

$up = $false
for ($i = 0; $i -lt 40 -and -not $up; $i++) {
    Start-Sleep -Milliseconds 500
    $up = ((Invoke-Api "GET" "/health").Status -eq 200)
}

try {
    $email = "e2e_$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())@organiza.ai"
    $cred = (@{ email = $email; password = "secretPassword123" } | ConvertTo-Json -Compress)
    $script:token = ""
    $script:userId = ""

    Test-Step "GET /health = OK" {
        $r = Invoke-Api "GET" "/health"
        Expect ($r.Status -eq 200 -and $r.Body -eq "OK") "$($r.Status) $($r.Body)"
    }

    Test-Step "POST /api/auth/register emite JWT (3 partes)" {
        $r = Invoke-Api "POST" "/api/auth/register" "" $cred
        $script:token = $r.Body
        $parts = $r.Body.Split(".")
        if ($parts.Length -eq 3) {
            $p = $parts[1].Replace("-", "+").Replace("_", "/")
            while ($p.Length % 4) { $p += "=" }
            $script:userId = ([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p)) | ConvertFrom-Json).sub
        }
        Expect ($r.Status -eq 200 -and $parts.Length -eq 3 -and $script:userId) "$($r.Status) $($r.Body)"
    }

    Test-Step "POST /api/auth/register duplicado = 409" {
        $r = Invoke-Api "POST" "/api/auth/register" "" $cred
        Expect ($r.Status -eq 409) "$($r.Status) $($r.Body)"
    }

    Test-Step "POST /api/auth/login emite JWT" {
        $r = Invoke-Api "POST" "/api/auth/login" "" $cred
        Expect ($r.Status -eq 200 -and $r.Body.Split(".").Length -eq 3) "$($r.Status) $($r.Body)"
    }

    Test-Step "POST /api/auth/login com senha errada = 401" {
        $bad = (@{ email = $email; password = "senhaErrada" } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/auth/login" "" $bad
        Expect ($r.Status -eq 401) "$($r.Status) $($r.Body)"
    }

    Test-Step "Rota protegida sem token = 401" {
        $r = Invoke-Api "GET" "/api/budgets/daily-pulse"
        Expect ($r.Status -eq 401) "$($r.Status) $($r.Body)"
    }

    Test-Step "Pulso com salário zero = 0.0 e mensagem 'já comprometeu'" {
        $r = Invoke-Api "GET" "/api/budgets/daily-pulse" $script:token
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.salary -eq 0.0 -and $j.pulse -eq 0.0 -and $j.message -like "*comprometeu*") "$($r.Status) $($r.Body)"
    }

    Test-Step "POST /api/users/onboarding (3000, FIXED, sem dívida) sugere SURVIVAL_702010" {
        $body = (@{ salary = 3000.0; incomeType = "FIXED"; hasDebt = $false } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/users/onboarding" $script:token $body
        Expect ($r.Status -eq 200 -and $r.Body.StartsWith("SURVIVAL_702010|")) "$($r.Status) $($r.Body)"
    }

    Test-Step "Pulso após onboarding: salary = 3000.0, pulse = 100.0" {
        $r = Invoke-Api "GET" "/api/budgets/daily-pulse" $script:token
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.salary -eq 3000.0 -and $j.pulse -eq 100.0 -and $null -eq $j.message) "$($r.Status) $($r.Body)"
    }

    Test-Step "POST /api/envelopes cria FOOD com limite 1200" {
        $body = (@{ userId = $script:userId; categoryName = "FOOD"; limitAmount = 1200.0 } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/envelopes" $script:token $body
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.categoryName -eq "FOOD" -and $j.limitAmount -eq 1200.0) "$($r.Status) $($r.Body)"
    }

    Test-Step "GET /api/envelopes lista o envelope do usuário" {
        $r = Invoke-Api "GET" "/api/envelopes?userId=$($script:userId)" $script:token
        $list = @($r.Body | ConvertFrom-Json)
        Expect ($r.Status -eq 200 -and ($list | Where-Object { $_.categoryName -eq "FOOD" }).Count -eq 1) "$($r.Status) $($r.Body)"
    }

    Test-Step "POST /api/transactions (600 em FOOD) vincula ao envelope FOOD (Issue #24)" {
        $body = (@{ description = "Mercado do mês"; amount = 600; category = "FOOD"; currency = "BRL" } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/transactions" $script:token $body
        if ($r.Status -ne 200) { return "obtido: $($r.Status) $($r.Body)" }
        $j = $r.Body | ConvertFrom-Json
        Expect ($j.value -eq 600.0 -and $j.category -eq "FOOD" -and $j.envelopeId) "$($r.Status) $($r.Body)"
    }

    Test-Step "POST /api/transactions com categoria inválida = 400" {
        $body = (@{ description = "x"; amount = 10; category = "NAO_EXISTE"; currency = "BRL" } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/transactions" $script:token $body
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 400 -and $j.error -like "*NAO_EXISTE*") "$($r.Status) $($r.Body)"
    }

    Test-Step "GET /api/transactions lista a transação de 600" {
        $r = Invoke-Api "GET" "/api/transactions" $script:token
        $list = @($r.Body | ConvertFrom-Json)
        Expect ($r.Status -eq 200 -and ($list | Where-Object { $_.value -eq 600.0 -and $_.category -eq "FOOD" }).Count -eq 1) "$($r.Status) $($r.Body)"
    }

    Test-Step "Pulso após gasto: pulse = roundTo((3000-600)/30, 2) = 80.0, totalSpent = 600.0" {
        $r = Invoke-Api "GET" "/api/budgets/daily-pulse" $script:token
        $j = $r.Body | ConvertFrom-Json
        $expected = [Math]::Round((3000 - 600) / 30, 2)
        Expect ($r.Status -eq 200 -and $j.pulse -eq $expected -and $j.totalSpent -eq 600.0 -and $j.salary -eq 3000.0) "$($r.Status) $($r.Body) (esperado pulse=$expected)"
    }

    Test-Step "POST /api/chat/message responde com o pulso atual" {
        $body = (@{ message = "Quanto tenho disponível para gastar hoje?" } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/chat/message" $script:token $body
        Expect ($r.Status -eq 200 -and $r.Body -like "*R$ 80.0*") "$($r.Status) $($r.Body)"
    }

    Test-Step "POST /api/variable-income define destino" {
        $body = (@{ amount = 500.0; source = "freela" } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/variable-income" $script:token $body
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and @("EMERGENCY_FUND", "BUDGET_5030020") -contains $j.destination) "$($r.Status) $($r.Body)"
    }

    Test-Step "GET /api/variable-income lista a renda de 500" {
        $r = Invoke-Api "GET" "/api/variable-income?userId=$($script:userId)" $script:token
        $list = @($r.Body | ConvertFrom-Json)
        Expect ($r.Status -eq 200 -and ($list | Where-Object { $_.amount -eq 500.0 }).Count -eq 1) "$($r.Status) $($r.Body)"
    }

    Test-Step "GET /api/dashboard soma o gasto real (600.0|BRL|...)" {
        $r = Invoke-Api "GET" "/api/dashboard" $script:token
        Expect ($r.Status -eq 200 -and $r.Body.StartsWith("600.0|BRL|")) "$($r.Status) $($r.Body)"
    }

    Test-Step "GET /api/users/tier-status conta as mensagens do chat" {
        $r = Invoke-Api "GET" "/api/users/tier-status" $script:token
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.tier -eq "FREE" -and $j.messagesUsed -ge 1) "$($r.Status) $($r.Body) — bug conhecido: issue #44 (createdAt nulo no chat)"
    }

    Test-Step "Rota inexistente = 404" {
        $r = Invoke-Api "GET" "/api/nao-existe" $script:token
        Expect ($r.Status -eq 404) "$($r.Status) $($r.Body)"
    }

} finally {
    Write-Host "`nFinalizando servidor KofLith..." -ForegroundColor Yellow
    if ($serverProc -and !$serverProc.HasExited) {
        $serverProc.Kill()
        $serverProc.WaitForExit(5000) | Out-Null
    }
}

# Bytecode inválido aparece só quando a classe é linkada: qualquer VerifyError/LinkageError reprova a suíte.
$serverErr = ""
if (Test-Path $errLog) { $serverErr = (Get-Content $errLog -Raw) }
$verifyClean = -not ($serverErr -match "VerifyError|LinkageError|ClassFormatError|NoClassDefFoundError")
if (-not $verifyClean) {
    Write-Host "`n[FAIL] stderr do servidor contém erro de verificação/linkagem:" -ForegroundColor Red
    Write-Host $serverErr
}

$totalTests = $script:results.Count
$testsPassed = @($script:results | Where-Object { $_ }).Count
$percent = if ($totalTests -gt 0) { [Math]::Round(100.0 * $testsPassed / $totalTests, 1) } else { 0 }
$allGreen = ($totalTests -gt 0 -and $testsPassed -eq $totalTests -and $verifyClean)

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host "   RESULTADO DA HOMOLOGAÇÃO E2E: $testsPassed / $totalTests PASSOS GREEN ($percent%)" -ForegroundColor $(if ($allGreen) { "Green" } else { "Red" })
Write-Host "   stderr do servidor: $(if ($verifyClean) { 'sem VerifyError/LinkageError' } else { 'COM ERRO (ver acima)' })"
Write-Host "=================================================================" -ForegroundColor Cyan

if ($allGreen) {
    exit 0
} else {
    exit 1
}
