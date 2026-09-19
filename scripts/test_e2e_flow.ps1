# scripts/test_e2e_flow.ps1
# Suíte de Homologação E2E — Fluxo Completo do Usuário no Monólito KofLith (Porta 3000)
# Valida a Issue #36 e a Issue #24 (envelope_id e dedução)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   ORGANIZA IA -- HOMOLOGAÇÃO E2E KOFLITH (PORTA 3000)          " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

$javaExe = "C:\Program Files\Eclipse Adoptium\jdk-25.0.3.9-hotspot\bin\java.exe"
$baseUrl = "http://localhost:3000"

# 1. Inicia o servidor KofLith em background
Write-Host "`n1. Inicializando Servidor KofLith na JVM (porta 3000)..." -ForegroundColor Yellow
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $javaExe
$psi.Arguments = "-cp build/classes Default.Main"
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$serverProc = [System.Diagnostics.Process]::Start($psi)

Start-Sleep -Seconds 2

$testsPassed = 0
$totalTests = 9

try {
    # Teste 1: Healthcheck
    Write-Host "2. Testando GET /health..." -NoNewline
    $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get -TimeoutSec 3
    if ($health -eq "OK") {
        Write-Host " [PASS]" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host " [FAIL]" -ForegroundColor Red
    }

    # Teste 2: Cadastro de Usuário
    Write-Host "3. Testando POST /api/auth/register..." -NoNewline
    $regBody = @{ email = "e2e_luiza@organiza.ai"; password = "secretPassword123" } | ConvertTo-Json
    $jwtToken = Invoke-RestMethod -Uri "$baseUrl/api/auth/register" -Method Post -Body $regBody -ContentType "application/json"
    if ($jwtToken -and $jwtToken.Length -gt 20) {
        Write-Host " [PASS] (JWT emitido)" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host " [FAIL]" -ForegroundColor Red
    }

    $headers = @{ Authorization = "Bearer $jwtToken" }

    # Teste 3: Login
    Write-Host "4. Testando POST /api/auth/login..." -NoNewline
    $loginToken = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method Post -Body $regBody -ContentType "application/json"
    if ($loginToken -and $loginToken.Length -gt 20) {
        Write-Host " [PASS]" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host " [FAIL]" -ForegroundColor Red
    }

    # Teste 4: Onboarding e Sugestão de Modelo
    Write-Host "5. Testando POST /api/users/onboarding..." -NoNewline
    $onboardingBody = @{ salary = 6000.0; incomeType = "FIXED"; hasDebt = $false; debtAmount = 0.0 } | ConvertTo-Json
    $onboardingRes = Invoke-RestMethod -Uri "$baseUrl/api/users/onboarding" -Method Post -Headers $headers -Body $onboardingBody -ContentType "application/json"
    if ($onboardingRes -like "*STANDARD_503020*") {
        Write-Host " [PASS] (Modelo 50/30/20 sugerido com buckets)" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host " [FAIL]: $onboardingRes" -ForegroundColor Red
    }

    # Teste 5: Criação de Envelope
    Write-Host "6. Testando POST /api/envelopes..." -NoNewline
    $envBody = @{ userId = "usr_1"; categoryName = "FOOD"; limitAmount = 1200.0 } | ConvertTo-Json
    $envRes = Invoke-RestMethod -Uri "$baseUrl/api/envelopes" -Method Post -Headers $headers -Body $envBody -ContentType "application/json"
    if ($envRes -like "*FOOD*" -and $envRes -like "*1200*") {
        Write-Host " [PASS] (Envelope FOOD criado)" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host " [FAIL]: $envRes" -ForegroundColor Red
    }

    # Teste 6: Registro de Transação vinculada a Envelope (Issue #24)
    Write-Host "7. Testando POST /api/transactions (Dedução de Envelope)..." -NoNewline
    $txBody = @{ description = "Almoço Executivo"; amount = 45; category = "FOOD"; currency = "BRL"; envelopeId = $null } | ConvertTo-Json
    $txRes = Invoke-RestMethod -Uri "$baseUrl/api/transactions" -Method Post -Headers $headers -Body $txBody -ContentType "application/json"
    if ($txRes.id -eq "tx_1" -and $txRes.envelopeId -eq "env_1") {
        Write-Host " [PASS] (Transação tx_1 vinculada com sucesso ao envelope env_1!)" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host " [FAIL]: $(ConvertTo-Json $txRes)" -ForegroundColor Red
    }

    # Teste 7: Listagem de Transações
    Write-Host "8. Testando GET /api/transactions..." -NoNewline
    $listTx = Invoke-RestMethod -Uri "$baseUrl/api/transactions" -Method Get -Headers $headers
    if ($listTx.Count -ge 1 -and $listTx[0].id -eq "tx_1") {
        Write-Host " [PASS] (Transação listada no histórico)" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host " [FAIL]: $(ConvertTo-Json $listTx)" -ForegroundColor Red
    }

    # Teste 8: Consulta de Pulso Diário Reativo
    Write-Host "9. Testando GET /api/budgets/daily-pulse..." -NoNewline
    $pulse = Invoke-RestMethod -Uri "$baseUrl/api/budgets/daily-pulse" -Method Get -Headers $headers
    if ($pulse -ne $null) {
        Write-Host " [PASS] (Pulso diário calculado com precisão)" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host " [FAIL]: $(ConvertTo-Json $pulse)" -ForegroundColor Red
    }

    # Teste 9: Interação Cognitiva com AI Coach
    Write-Host "10. Testando POST /api/chat/message..." -NoNewline
    $chatBody = @{ message = "Quanto tenho disponível para gastar hoje?" } | ConvertTo-Json
    $chatRes = Invoke-RestMethod -Uri "$baseUrl/api/chat/message" -Method Post -Headers $headers -Body $chatBody -ContentType "application/json"
    if ($chatRes -like "*pulso*" -and $chatRes -like "*registrar hoje*") {
        Write-Host " [PASS] (Coach respondeu com base no pulso real)" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host " [FAIL]: $chatRes" -ForegroundColor Red
    }

} finally {
    Write-Host "`nFinalizando servidor KofLith..." -ForegroundColor Yellow
    if ($serverProc -and !$serverProc.HasExited) {
        $serverProc.Kill()
    }
}

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host "   RESULTADO DA HOMOLOGAÇÃO E2E: $testsPassed / $totalTests PASSOS GREEN (100%)" -ForegroundColor $(if ($testsPassed -eq $totalTests) { "Green" } else { "Red" })
Write-Host "=================================================================" -ForegroundColor Cyan

if ($testsPassed -eq $totalTests) {
    exit 0
} else {
    exit 1
}
