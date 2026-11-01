# scripts/test_e2e_flow.ps1
# Suíte de Homologação E2E — Fluxo Completo do Usuário no Monólito KofLith
# Porta: -Port N (define PORT para o servidor); sem ele, usa $env:PORT ou 3000 (o padrão do backend).
# Cobre todas as rotas de backend/main.kf com asserts semânticos (valor exato, não "não crashou").
# Pré-requisito: `kof build backend --target jvm` (saída em build/classes, ou passe -ClassesDir).
# Banco: o `kof build` não copia o driver JDBC; passe o jar em -ExtraClasspath (ex.: o H2 de `kof deps resolve`).
# Sem KOF_DB_URL o servidor usa H2 em ./data/organiza (relativo à pasta atual).
# Exit code 0 somente se TODOS os testes passarem e o servidor não emitir VerifyError/LinkageError.

param(
    [string]$ClassesDir = "build/classes",
    [string]$ExtraClasspath = "",
    [string]$JavaExe = "C:\Program Files\Eclipse Adoptium\jdk-25.0.3.9-hotspot\bin\java.exe",
    [int]$Port = 0,
    [string]$BaseUrl = "",
    # Pasta de `kof build frontend --target js` (G-AUTH-STATIC): o servidor sobe com KOF_WEB_OUT e a suíte
    # confere que o frontend abre sem token no mesmo domínio. Sem ela, KOF_WEB_OUT fica fora do servidor.
    [string]$WebOut = ""
)

if ($Port -gt 0) { $env:PORT = "$Port" }
if ($WebOut) { $env:KOF_WEB_OUT = $WebOut } else { Remove-Item Env:KOF_WEB_OUT -ErrorAction SilentlyContinue }
$RunClasspath = if ($ExtraClasspath) { "$ClassesDir;$ExtraClasspath" } else { $ClassesDir }
if (-not $BaseUrl) {
    $porta = if ($env:PORT) { $env:PORT } else { "3000" }
    $BaseUrl = "http://localhost:$porta"
}

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   ORGANIZA IA -- HOMOLOGAÇÃO E2E KOFLITH ($BaseUrl)" -ForegroundColor Cyan
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

# Issue #44: o servidor roda nesta maquina, entao o "hoje" local e o mesmo dos dois lados.
# Dias restantes no mes contando hoje (legado: lengthOfMonth - dayOfMonth + 1) e pulso esperado.
function Get-DaysRemaining { $d = Get-Date; return [DateTime]::DaysInMonth($d.Year, $d.Month) - $d.Day + 1 }
function Get-ExpectedPulse([double]$Remaining) { return [Math]::Round($Remaining / (Get-DaysRemaining), 2, [MidpointRounding]::AwayFromZero) }

# Lista JSON -> array PowerShell de verdade (no PS 5.1, ConvertFrom-Json de "[]" vira 1 objeto, não 0 itens).
function ConvertFrom-JsonList([string]$Json) {
    $parsed = $Json | ConvertFrom-Json
    if ($null -eq $parsed) { return ,@() }
    return ,@($parsed | ForEach-Object { $_ })
}

function ConvertTo-B64Url([byte[]]$Bytes) { [Convert]::ToBase64String($Bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_") }

# Monta um JWT HS256 com o segredo da suíte (para forjar iss/aud/exp errados com assinatura válida).
function New-TestJwt([string]$PayloadJson, [string]$Secret) {
    $h = ConvertTo-B64Url ([System.Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT"}'))
    $p = ConvertTo-B64Url ([System.Text.Encoding]::UTF8.GetBytes($PayloadJson))
    $hmac = New-Object System.Security.Cryptography.HMACSHA256 (, [System.Text.Encoding]::UTF8.GetBytes($Secret))
    $s = ConvertTo-B64Url ($hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes("$h.$p")))
    return "$h.$p.$s"
}

# Sobe o servidor com um valor de KOF_JWT_SECRET (ou sem ela) e espera ele MORRER no boot.
function Start-BootProbe([string]$SecretValue) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $JavaExe
    $psi.Arguments = "-cp `"$RunClasspath`" Default.Main"
    $psi.UseShellExecute = $false
    $psi.RedirectStandardError = $true
    $psi.RedirectStandardOutput = $true
    $psi.EnvironmentVariables.Remove("KOF_JWT_SECRET")
    if ($SecretValue) { $psi.EnvironmentVariables["KOF_JWT_SECRET"] = $SecretValue }
    $p = [System.Diagnostics.Process]::Start($psi)
    $errTask = $p.StandardError.ReadToEndAsync()
    $outTask = $p.StandardOutput.ReadToEndAsync()
    $exited = $p.WaitForExit(20000)
    if (-not $exited) { $p.Kill(); $p.WaitForExit(5000) | Out-Null }
    return @{ Exited = $exited; ExitCode = $p.ExitCode; Output = ($errTask.Result + $outTask.Result) }
}

# 1. Inicia o servidor KofLith em background (stderr capturado fora do repo)
if (-not (Test-Path (Join-Path $ClassesDir "Default/Main.class"))) {
    Write-Host "`n[ERRO] $ClassesDir/Default/Main.class não encontrado. Rode: kof build backend --target jvm" -ForegroundColor Red
    exit 2
}

# Segredo do JWT: usa o do ambiente ou gera um aleatório só para esta execução (nunca é impresso).
if (-not $env:KOF_JWT_SECRET) {
    $rnd = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rnd)
    $env:KOF_JWT_SECRET = -join ($rnd | ForEach-Object { $_.ToString("x2") })
}
$jwtSecret = $env:KOF_JWT_SECRET
$jwtIssuer = if ($env:KOF_JWT_ISSUER) { $env:KOF_JWT_ISSUER } else { "organiza-ai" }
$jwtAudience = if ($env:KOF_JWT_AUDIENCE) { $env:KOF_JWT_AUDIENCE } else { "organiza-ai-api" }

Test-Step "Boot sem KOF_JWT_SECRET falha com mensagem clara" {
    $b = Start-BootProbe ""
    Expect ($b.Exited -and $b.ExitCode -ne 0 -and $b.Output -match "KOF_JWT_SECRET") "exited=$($b.Exited) code=$($b.ExitCode) saida: $($b.Output.Substring(0, [Math]::Min(300, $b.Output.Length)))"
}

Test-Step "Boot com segredo curto falha sem vazar o valor" {
    $curto = "curto-demais-" + [Guid]::NewGuid().ToString("N").Substring(0, 8)
    $b = Start-BootProbe $curto
    Expect ($b.Exited -and $b.ExitCode -ne 0 -and $b.Output -match "32 caracteres" -and -not $b.Output.Contains($curto)) "exited=$($b.Exited) code=$($b.ExitCode) vazou=$($b.Output.Contains($curto))"
}
$errLog = Join-Path ([System.IO.Path]::GetTempPath()) "organiza-e2e-server-stderr.txt"
$outLog = Join-Path ([System.IO.Path]::GetTempPath()) "organiza-e2e-server-stdout.txt"
Write-Host "`nInicializando Servidor KofLith na JVM ($ClassesDir, $BaseUrl)..." -ForegroundColor Yellow
$serverProc = Start-Process -FilePath $JavaExe -ArgumentList @("-Xverify:all", "-cp", "`"$RunClasspath`"", "Default.Main") `
    -PassThru -NoNewWindow -RedirectStandardError $errLog -RedirectStandardOutput $outLog

$up = $false
for ($i = 0; $i -lt 40 -and -not $up; $i++) {
    Start-Sleep -Milliseconds 500
    $up = ((Invoke-Api "GET" "/health").Status -eq 200)
}

try {
    $email = "e2e_$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())@organiza.ai"
    $cred = (@{ name = "Ana Júlia E2E"; email = $email; password = "secretPassword123" } | ConvertTo-Json -Compress)
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

    $script:wrongPasswordBody = ""
    Test-Step "POST /api/auth/login com senha errada = 401" {
        $bad = (@{ email = $email; password = "senhaErrada" } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/auth/login" "" $bad
        $script:wrongPasswordBody = $r.Body
        Expect ($r.Status -eq 401) "$($r.Status) $($r.Body)"
    }

    Test-Step "POST /api/auth/login com e-mail inexistente = 401 com a mesma mensagem" {
        $ghost = (@{ email = "ninguem_$([Guid]::NewGuid().ToString('N'))@organiza.ai"; password = "senhaErrada" } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/auth/login" "" $ghost
        Expect ($r.Status -eq 401 -and $r.Body -eq $script:wrongPasswordBody) "$($r.Status) $($r.Body) (senha errada deu: $($script:wrongPasswordBody))"
    }

    # ---- G-AUTH-STATIC: só /api/* exige token (exceto login e cadastro) ----
    foreach ($probe in @(@("GET", "/api/dashboard"), @("GET", "/api/users/me"), @("POST", "/api/users/onboarding"), @("GET", "/api/rota-que-nao-existe"))) {
        Test-Step "$($probe[0]) $($probe[1]) sem token = 401" {
            $b = if ($probe[0] -eq "POST") { '{"salary":3000.0,"incomeType":"FIXED","hasDebt":false}' } else { $null }
            $r = Invoke-Api $probe[0] $probe[1] "" $b
            Expect ($r.Status -eq 401 -and $r.Body -ceq '{"error":"Token ausente, inválido ou expirado"}') "$($r.Status) $($r.Body)"
        }
    }
    if ($WebOut) {
        foreach ($asset in @("/index.html", "/Default.mjs")) {
            Test-Step "GET $asset sem token = 200 (frontend no mesmo domínio)" {
                $r = Invoke-Api "GET" $asset
                $disk = [System.IO.File]::ReadAllText((Join-Path $WebOut $asset.TrimStart("/")), [System.Text.Encoding]::UTF8)
                Expect ($r.Status -eq 200 -and $r.Body -eq $disk) "$($r.Status) ($($r.Body.Length) chars; disco $($disk.Length))"
            }
        }
        Test-Step "GET /../backend/main.kf não sai da pasta do frontend" {
            $r = Invoke-Api "GET" "/%2e%2e/backend/main.kf"
            Expect ($r.Status -ne 200 -and $r.Body -notmatch "app.listen") "$($r.Status) $($r.Body.Substring(0, [Math]::Min(80, $r.Body.Length)))"
        }
    } else {
        Test-Step "Sem KOF_WEB_OUT: /index.html = 404 (público, mas sem frontend)" {
            $r = Invoke-Api "GET" "/index.html"
            Expect ($r.Status -eq 404) "$($r.Status) $($r.Body)"
        }
    }

    Test-Step "Rota protegida sem token = 401" {
        $r = Invoke-Api "GET" "/api/budgets/daily-pulse"
        Expect ($r.Status -eq 401) "$($r.Status) $($r.Body)"
    }

    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    Test-Step "Token com iss errado (assinatura válida) = 401" {
        $t = New-TestJwt "{`"sub`":`"$($script:userId)`",`"iss`":`"outro-emissor`",`"aud`":`"$jwtAudience`",`"exp`":$($now + 600)}" $jwtSecret
        $r = Invoke-Api "GET" "/api/budgets/daily-pulse" $t
        Expect ($r.Status -eq 401) "$($r.Status) $($r.Body)"
    }

    Test-Step "Token com aud errado (assinatura válida) = 401" {
        $t = New-TestJwt "{`"sub`":`"$($script:userId)`",`"iss`":`"$jwtIssuer`",`"aud`":`"outra-api`",`"exp`":$($now + 600)}" $jwtSecret
        $r = Invoke-Api "GET" "/api/budgets/daily-pulse" $t
        Expect ($r.Status -eq 401) "$($r.Status) $($r.Body)"
    }

    Test-Step "Token expirado = 401" {
        $t = New-TestJwt "{`"sub`":`"$($script:userId)`",`"iss`":`"$jwtIssuer`",`"aud`":`"$jwtAudience`",`"exp`":$($now - 60)}" $jwtSecret
        $r = Invoke-Api "GET" "/api/budgets/daily-pulse" $t
        Expect ($r.Status -eq 401) "$($r.Status) $($r.Body)"
    }

    Test-Step "Token adulterado (payload trocado sem reassinar) = 401" {
        $parts = $script:token.Split(".")
        $forged = ConvertTo-B64Url ([System.Text.Encoding]::UTF8.GetBytes("{`"sub`":`"usr_999`",`"iss`":`"$jwtIssuer`",`"aud`":`"$jwtAudience`",`"exp`":$($now + 600)}"))
        $r = Invoke-Api "GET" "/api/budgets/daily-pulse" "$($parts[0]).$forged.$($parts[2])"
        Expect ($r.Status -eq 401) "$($r.Status) $($r.Body)"
    }

    Test-Step "Token válido forjado pela suíte (controle: iss/aud certos) = 200" {
        $t = New-TestJwt "{`"sub`":`"$($script:userId)`",`"iss`":`"$jwtIssuer`",`"aud`":`"$jwtAudience`",`"exp`":$($now + 600)}" $jwtSecret
        $r = Invoke-Api "GET" "/api/budgets/daily-pulse" $t
        Expect ($r.Status -eq 200) "$($r.Status) $($r.Body)"
    }

    Test-Step "Pulso com salário zero = 0.0 e mensagem 'já comprometeu'" {
        $r = Invoke-Api "GET" "/api/budgets/daily-pulse" $script:token
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.salary -eq 0.0 -and $j.pulse -eq 0.0 -and $j.message -like "*comprometeu*") "$($r.Status) $($r.Body)"
    }

    # ---- Regras de entrada (batch 2, design §4.3): status e corpo exatos, nada gravado ----
    function Test-Invalid([string]$Name, [string]$Path, [string]$Token, [string]$Body, [string]$Message) {
        Test-Step $Name {
            $r = Invoke-Api "POST" $Path $Token $Body
            $expected = '{"error":"' + $Message + '"}'
            Expect ($r.Status -eq 400 -and $r.Body -ceq $expected) "$($r.Status) $($r.Body) (esperado 400 $expected)"
        }
    }
    $fresh = "f2_$([Guid]::NewGuid().ToString('N'))@organiza.ai"
    Test-Invalid "Cadastro sem nome = 400" "/api/auth/register" "" (@{ name = "  "; email = $fresh; password = "senhaValida123" } | ConvertTo-Json -Compress) "Preencha nome, e-mail e senha."
    Test-Invalid "Cadastro sem campo name = 400" "/api/auth/register" "" (@{ email = $fresh; password = "senhaValida123" } | ConvertTo-Json -Compress) "Preencha nome, e-mail e senha."
    Test-Invalid "Cadastro com e-mail vazio = 400" "/api/auth/register" "" (@{ name = "Ana"; email = " "; password = "senhaValida123" } | ConvertTo-Json -Compress) "Preencha nome, e-mail e senha."
    Test-Invalid "Cadastro com senha vazia = 400" "/api/auth/register" "" (@{ name = "Ana"; email = $fresh; password = "" } | ConvertTo-Json -Compress) "Preencha nome, e-mail e senha."
    Test-Invalid "Cadastro com e-mail sem @ = 400" "/api/auth/register" "" (@{ name = "Ana"; email = "ana.organiza.ai"; password = "senhaValida123" } | ConvertTo-Json -Compress) "Digite um e-mail válido."
    Test-Invalid "Cadastro com e-mail sem domínio = 400" "/api/auth/register" "" (@{ name = "Ana"; email = "ana@"; password = "senhaValida123" } | ConvertTo-Json -Compress) "Digite um e-mail válido."
    Test-Invalid "Cadastro com senha de 7 caracteres = 400" "/api/auth/register" "" (@{ name = "Ana"; email = $fresh; password = "1234567" } | ConvertTo-Json -Compress) "A senha precisa ter pelo menos 8 caracteres."
    Test-Step "Cadastro recusado não gravou: o mesmo e-mail com senha de 8 caracteres = 200" {
        $r = Invoke-Api "POST" "/api/auth/register" "" (@{ name = "Ana F2"; email = $fresh; password = "12345678" } | ConvertTo-Json -Compress)
        Expect ($r.Status -eq 200 -and $r.Body.Split(".").Length -eq 3) "$($r.Status) $($r.Body)"
    }
    Test-Invalid "Login com e-mail vazio = 400" "/api/auth/login" "" (@{ email = ""; password = "senhaValida123" } | ConvertTo-Json -Compress) "Preencha e-mail e senha."
    Test-Invalid "Login com senha vazia = 400" "/api/auth/login" "" (@{ email = $email; password = "" } | ConvertTo-Json -Compress) "Preencha e-mail e senha."
    Test-Invalid "Onboarding com salário 0 = 400" "/api/users/onboarding" $script:token (@{ salary = 0.0; incomeType = "FIXED"; hasDebt = $false } | ConvertTo-Json -Compress) "O salário deve ser maior que zero."
    Test-Invalid "Onboarding com salário negativo = 400" "/api/users/onboarding" $script:token (@{ salary = -100.0; incomeType = "FIXED"; hasDebt = $false } | ConvertTo-Json -Compress) "O salário deve ser maior que zero."
    Test-Invalid "Onboarding com dívida e debtAmount 0 = 400" "/api/users/onboarding" $script:token (@{ salary = 3000.0; incomeType = "FIXED"; hasDebt = $true; debtAmount = 0.0 } | ConvertTo-Json -Compress) "O valor da dívida deve ser maior que zero."
    Test-Invalid "Onboarding com dívida sem debtAmount = 400" "/api/users/onboarding" $script:token (@{ salary = 3000.0; incomeType = "FIXED"; hasDebt = $true } | ConvertTo-Json -Compress) "O valor da dívida deve ser maior que zero."
    Test-Invalid "Onboarding com debtAmount negativo = 400" "/api/users/onboarding" $script:token (@{ salary = 3000.0; incomeType = "FIXED"; hasDebt = $false; debtAmount = -5.0 } | ConvertTo-Json -Compress) "O valor da dívida deve ser maior que zero."
    Test-Invalid "Onboarding com incomeType fora da lista = 400" "/api/users/onboarding" $script:token (@{ salary = 3000.0; incomeType = "MENSAL"; hasDebt = $false } | ConvertTo-Json -Compress) "Tipo de renda inválido."
    Test-Invalid "Onboarding com salary em texto = 400" "/api/users/onboarding" $script:token '{"salary":"abc","incomeType":"FIXED","hasDebt":false}' "Dados inválidos."
    Test-Step "Onboarding recusado não gravou: pulso continua com salary 0.0" {
        $r = Invoke-Api "GET" "/api/budgets/daily-pulse" $script:token
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.salary -eq 0.0) "$($r.Status) $($r.Body)"
    }

    Test-Step "GET /api/users/me antes do onboarding: nome, e-mail, FREE, onboardingCompleted=false" {
        $r = Invoke-Api "GET" "/api/users/me" $script:token
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.name -ceq "Ana Júlia E2E" -and $j.email -eq $email -and $j.tier -eq "FREE" -and $j.onboardingCompleted -eq $false) "$($r.Status) $($r.Body)"
    }

    Test-Step "GET /api/users/me sem token = 401" {
        $r = Invoke-Api "GET" "/api/users/me"
        Expect ($r.Status -eq 401) "$($r.Status) $($r.Body)"
    }

    Test-Step "POST /api/users/onboarding (3000, FIXED, sem dívida) responde JSON SURVIVAL_702010 70/20/10" {
        $body = (@{ salary = 3000.0; incomeType = "FIXED"; hasDebt = $false } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/users/onboarding" $script:token $body
        $j = $r.Body | ConvertFrom-Json
        $b = @($j.buckets)
        Expect ($r.Status -eq 200 -and $j.suggestedModel -eq "SURVIVAL_702010" -and $j.description -and $b.Count -eq 3 -and $b[0].percentage -eq 70 -and $b[0].amount -eq 2100.0 -and $b[1].amount -eq 600.0 -and $b[2].amount -eq 300.0) "$($r.Status) $($r.Body)"
    }

    Test-Step "GET /api/users/me depois do onboarding: onboardingCompleted=true" {
        $r = Invoke-Api "GET" "/api/users/me" $script:token
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.onboardingCompleted -eq $true -and $j.name -ceq "Ana Júlia E2E") "$($r.Status) $($r.Body)"
    }

    Test-Step "Onboarding com dívida (5000,50) sugere ANTI_DEBT_701020 com Quitação de Dívida 20%" {
        $tc = (Invoke-Api "POST" "/api/auth/register" "" (@{ name = "Caio Dívida"; email = "debt_$([Guid]::NewGuid().ToString('N'))@organiza.ai"; password = "senhaDoC123" } | ConvertTo-Json -Compress)).Body
        $body = (@{ salary = 3000.0; incomeType = "FIXED"; hasDebt = $true; debtAmount = 5000.5 } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/users/onboarding" $tc $body
        $j = $r.Body | ConvertFrom-Json
        $b = @($j.buckets)
        $me = (Invoke-Api "GET" "/api/users/me" $tc).Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.suggestedModel -eq "ANTI_DEBT_701020" -and $b.Count -eq 3 -and $b[2].name -ceq "Quitação de Dívida" -and $b[2].amount -eq 600.0 -and $me.onboardingCompleted -eq $true -and $me.name -ceq "Caio Dívida") "$($r.Status) $($r.Body) | me: $($me | ConvertTo-Json -Compress)"
    }

    Test-Step "Onboarding VARIABLE sugere FREELANCER_BASE_ZERO sem buckets" {
        $tv = (Invoke-Api "POST" "/api/auth/register" "" (@{ name = "Vera"; email = "var_$([Guid]::NewGuid().ToString('N'))@organiza.ai"; password = "senhaDaV123" } | ConvertTo-Json -Compress)).Body
        $r = Invoke-Api "POST" "/api/users/onboarding" $tv (@{ salary = 4000.0; incomeType = "VARIABLE"; hasDebt = $false } | ConvertTo-Json -Compress)
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.suggestedModel -eq "FREELANCER_BASE_ZERO" -and @($j.buckets).Count -eq 0) "$($r.Status) $($r.Body)"
    }

    Test-Step "Pulso após onboarding: daysRemaining = dias que faltam no mês (#44), pulse = 3000/daysRemaining" {
        $r = Invoke-Api "GET" "/api/budgets/daily-pulse" $script:token
        $j = $r.Body | ConvertFrom-Json
        $dias = Get-DaysRemaining; $esperado = Get-ExpectedPulse 3000
        Expect ($r.Status -eq 200 -and $j.salary -eq 3000.0 -and $j.daysRemaining -eq $dias -and $j.pulse -eq $esperado -and $null -eq $j.message) "$($r.Status) $($r.Body) (esperado daysRemaining=$dias pulse=$esperado)"
    }

    Test-Step "POST /api/envelopes cria FOOD com limite 1200" {
        $body = (@{ categoryName = "FOOD"; limitAmount = 1200.0 } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/envelopes" $script:token $body
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.categoryName -eq "FOOD" -and $j.limitAmount -eq 1200.0) "$($r.Status) $($r.Body)"
    }

    Test-Step "GET /api/envelopes lista o envelope do usuário" {
        $r = Invoke-Api "GET" "/api/envelopes" $script:token
        $list = (ConvertFrom-JsonList $r.Body)
        Expect ($r.Status -eq 200 -and @($list | Where-Object { $_.categoryName -eq "FOOD" }).Count -eq 1) "$($r.Status) $($r.Body)"
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
        $list = (ConvertFrom-JsonList $r.Body)
        Expect ($r.Status -eq 200 -and @($list | Where-Object { $_.value -eq 600.0 -and $_.category -eq "FOOD" }).Count -eq 1) "$($r.Status) $($r.Body)"
    }

    Test-Step "Envelope FOOD descontado na mesma transação: currentSpent = 600.0" {
        $r = Invoke-Api "GET" "/api/envelopes" $script:token
        $food = @((ConvertFrom-JsonList $r.Body) | Where-Object { $_.categoryName -eq "FOOD" })
        Expect ($r.Status -eq 200 -and $food.Count -eq 1 -and $food[0].currentSpent -eq 600.0) "$($r.Status) $($r.Body)"
    }

    Test-Step "Pulso após gasto: pulse = roundTo((3000-600)/daysRemaining, 2), totalSpent = 600.0" {
        $r = Invoke-Api "GET" "/api/budgets/daily-pulse" $script:token
        $j = $r.Body | ConvertFrom-Json
        $expected = Get-ExpectedPulse 2400
        Expect ($r.Status -eq 200 -and $j.pulse -eq $expected -and $j.totalSpent -eq 600.0 -and $j.salary -eq 3000.0) "$($r.Status) $($r.Body) (esperado pulse=$expected)"
    }

    Test-Step "POST /api/chat/message responde com o pulso atual" {
        $body = (@{ message = "Quanto tenho disponível para gastar hoje?" } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/chat/message" $script:token $body
        $p = [string](Get-ExpectedPulse 2400).ToString([Globalization.CultureInfo]::InvariantCulture)
        if (-not $p.Contains(".")) { $p = "$p.0" }
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.reply -like "*R$ $p.*" -and $j.messagesUsed -eq 1 -and $j.messagesLimit -eq 30) "$($r.Status) $($r.Body) (esperado reply com R$ $p, messagesUsed 1, messagesLimit 30)"
    }

    Test-Step "GET /api/chat/messages: histórico do usuário em JSON, cronológico (USER e depois ASSISTANT)" {
        $r = Invoke-Api "GET" "/api/chat/messages" $script:token
        $j = $r.Body | ConvertFrom-Json
        $it = @($j.items)
        Expect ($r.Status -eq 200 -and $it.Count -eq 2 -and $it[0].role -ceq "USER" -and $it[0].content -ceq "Quanto tenho disponível para gastar hoje?" -and $it[1].role -ceq "ASSISTANT" -and $it[1].content -like "Olá! Seu pulso*" -and $it[0].createdAt -match '^\d{4}-\d{2}-\d{2}T' -and $j.page -eq 1 -and $j.limit -eq 50 -and $j.offset -eq 0 -and $j.hasNext -eq $false) "$($r.Status) $($r.Body)"
    }

    Test-Step "GET /api/chat/messages sem token = 401; parâmetro inválido = 400" {
        $a = Invoke-Api "GET" "/api/chat/messages"
        $b = Invoke-Api "GET" "/api/chat/messages?limit=-1" $script:token
        Expect ($a.Status -eq 401 -and $b.Status -eq 400) "sem token=$($a.Status) $($a.Body) | limit=-1: $($b.Status) $($b.Body)"
    }

    Test-Step "POST /api/variable-income define destino" {
        $body = (@{ amount = 500.0; source = "freela" } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/variable-income" $script:token $body
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and @("EMERGENCY_FUND", "BUDGET_5030020") -contains $j.destination) "$($r.Status) $($r.Body)"
    }

    Test-Step "GET /api/variable-income lista a renda de 500" {
        $r = Invoke-Api "GET" "/api/variable-income" $script:token
        $list = (ConvertFrom-JsonList $r.Body)
        Expect ($r.Status -eq 200 -and @($list | Where-Object { $_.amount -eq 500.0 }).Count -eq 1) "$($r.Status) $($r.Body)"
    }

    Test-Step "GET /api/dashboard em JSON real: total, pulso, buckets, categorias e últimas transações (Tela 9)" {
        $r = Invoke-Api "GET" "/api/dashboard" $script:token
        $j = $r.Body | ConvertFrom-Json
        $b = @($j.buckets); $c = @($j.categories); $t = @($j.recentTransactions)
        Expect ($r.Status -eq 200 -and $j.period -eq "month" -and $j.totalSpent -eq 600.0 -and $j.currency -eq "BRL" -and $j.salary -eq 3000.0 -and $j.daysRemaining -eq (Get-DaysRemaining) -and $j.pulse -eq (Get-ExpectedPulse 2400) -and $j.budgetModel -eq "SURVIVAL_702010" -and $b.Count -eq 3 -and $b[1].name -ceq "Folga" -and $b[1].spentAmount -eq 600.0 -and $c.Count -eq 1 -and $c[0].category -eq "FOOD" -and $c[0].percentage -eq 100.0 -and $t.Count -eq 1 -and $t[0].value -eq 600.0 -and $j.reserve.accumulated -eq 0.0) "$($r.Status) $($r.Body)"
    }

    Test-Step "GET /api/dashboard?period=week|year somam o gasto de hoje; period inválido = 400" {
        $w = (Invoke-Api "GET" "/api/dashboard?period=week" $script:token).Body | ConvertFrom-Json
        $y = (Invoke-Api "GET" "/api/dashboard?period=year" $script:token).Body | ConvertFrom-Json
        $bad = Invoke-Api "GET" "/api/dashboard?period=dia" $script:token
        Expect ($w.period -eq "week" -and $w.totalSpent -eq 600.0 -and $y.totalSpent -eq 600.0 -and $bad.Status -eq 400) "week=$($w.totalSpent) year=$($y.totalSpent) inválido=$($bad.Status) $($bad.Body)"
    }

    Test-Step "GET /api/budgets/balance (GetBalance): Folga com 600 gastos, totalSpent 600, notAllocated 2400" {
        $r = Invoke-Api "GET" "/api/budgets/balance" $script:token
        $j = $r.Body | ConvertFrom-Json
        $b = @($j.buckets)
        Expect ($r.Status -eq 200 -and $j.model -eq "SURVIVAL_702010" -and $b[0].spentAmount -eq 0.0 -and $b[1].spentAmount -eq 600.0 -and $b[1].remainingAmount -eq 0.0 -and $j.totalSpent -eq 600.0 -and $j.notAllocated -eq 2400.0) "$($r.Status) $($r.Body)"
    }

    Test-Step "GET /api/users/tier-status conta as mensagens do chat" {
        $r = Invoke-Api "GET" "/api/users/tier-status" $script:token
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.tier -eq "FREE" -and $j.messagesUsed -eq 1 -and $j.messagesLimit -eq 30 -and $j.canSendMessage -eq $true) "$($r.Status) $($r.Body)"
    }

    Test-Step "Transação gravada com createdAt real (instante UTC de agora, issue #44)" {
        $r = Invoke-Api "GET" "/api/transactions" $script:token
        $t = @((ConvertFrom-JsonList $r.Body) | Where-Object { $_.value -eq 600.0 })
        if ($t.Count -ne 1) { return "obtido: $($r.Status) $($r.Body)" }
        $when = [DateTime]::Parse($t[0].createdAt, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal)
        $diff = [Math]::Abs(([DateTime]::UtcNow - $when).TotalMinutes)
        Expect ($t[0].createdAt -match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' -and $diff -lt 10) "createdAt=$($t[0].createdAt) diferença=$diff min"
    }

    Test-Step "Freemium: 30 mensagens no mês = 200; a 31ª = 402 com a mensagem do legado e não é gravada" {
        $tf = (Invoke-Api "POST" "/api/auth/register" "" (@{ name = "Fê Freemium"; email = "free_$([Guid]::NewGuid().ToString('N'))@organiza.ai"; password = "senhaDaF123" } | ConvertTo-Json -Compress)).Body
        $msg = (@{ message = "oi" } | ConvertTo-Json -Compress)
        $script:tfToken = $tf
        $codes = @(); for ($k = 1; $k -le 30; $k++) { $codes += (Invoke-Api "POST" "/api/chat/message" $tf $msg).Status }
        $r31 = Invoke-Api "POST" "/api/chat/message" $tf $msg
        $e = $r31.Body | ConvertFrom-Json
        $st = (Invoke-Api "GET" "/api/users/tier-status" $tf).Body | ConvertFrom-Json
        Expect (@($codes | Where-Object { $_ -eq 200 }).Count -eq 30 -and $r31.Status -eq 402 -and $e.error -ceq "Você atingiu o limite de 30 mensagens gratuitas este mês." -and $st.messagesUsed -eq 30 -and $st.canSendMessage -eq $false) "200s=$(@($codes | Where-Object { $_ -eq 200 }).Count) 31ª=$($r31.Status) $($r31.Body) | tier=$($st | ConvertTo-Json -Compress)"
    }

    Test-Step "GET /api/chat/messages: paginação (page 1 = mais recentes, cronológica) e isolamento entre usuários" {
        $p1 = (Invoke-Api "GET" "/api/chat/messages?limit=4" $script:tfToken).Body | ConvertFrom-Json
        $p2 = (Invoke-Api "GET" "/api/chat/messages?limit=4&page=2" $script:tfToken).Body | ConvertFrom-Json
        $last = (Invoke-Api "GET" "/api/chat/messages?limit=4&page=15" $script:tfToken).Body | ConvertFrom-Json
        $over = (Invoke-Api "GET" "/api/chat/messages?limit=500" $script:tfToken).Body | ConvertFrom-Json
        $mine = (Invoke-Api "GET" "/api/chat/messages?limit=100" $script:token).Body | ConvertFrom-Json
        $vazmine = @($mine.items | Where-Object { $_.content -ceq "oi" }).Count
        $vaztf = @($over.items | Where-Object { $_.content -like "Quanto tenho*" }).Count
        $i1 = @($p1.items); $i2 = @($p2.items)
        Expect (@($i1).Count -eq 4 -and $i1[0].role -ceq "USER" -and $i1[3].role -ceq "ASSISTANT" -and $p1.hasNext -eq $true -and $p2.offset -eq 4 -and @($i2).Count -eq 4 -and @($last.items).Count -eq 4 -and $last.hasNext -eq $false -and $over.limit -eq 100 -and @($over.items).Count -eq 60 -and $vazmine -eq 0 -and $vaztf -eq 0 -and @($mine.items).Count -eq 2) "p1=$($p1 | ConvertTo-Json -Compress -Depth 4) | p15=$(@($last.items).Count)/$($last.hasNext) | over=$($over.limit)/$(@($over.items).Count) | vazamento=$vazmine/$vaztf"
    }

    Test-Step "Rota inexistente = 404" {
        $r = Invoke-Api "GET" "/api/nao-existe" $script:token
        Expect ($r.Status -eq 404) "$($r.Status) $($r.Body)"
    }

    Test-Step "POST /api/transactions com valor 0 = 400" {
        $body = (@{ description = "zero"; amount = 0; category = "FOOD"; currency = "BRL" } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/transactions" $script:token $body
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 400 -and $j.error -like "*maior que zero*") "$($r.Status) $($r.Body)"
    }

    Test-Step "POST /api/transactions com valor negativo = 400" {
        $body = (@{ description = "neg"; amount = -50; category = "FOOD"; currency = "BRL" } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/transactions" $script:token $body
        Expect ($r.Status -eq 400) "$($r.Status) $($r.Body)"
    }

    # ---- Isolamento entre usuários (IDOR): B nunca vê nem grava dados de A ----
    $credB = (@{ name = "Bia E2E"; email = "b_$([Guid]::NewGuid().ToString('N'))@organiza.ai"; password = "senhaDoB123" } | ConvertTo-Json -Compress)
    $script:tokenB = (Invoke-Api "POST" "/api/auth/register" "" $credB).Body

    Test-Step "IDOR: B não vê os envelopes de A (nem com ?userId=A)" {
        $r1 = Invoke-Api "GET" "/api/envelopes" $script:tokenB
        $r2 = Invoke-Api "GET" "/api/envelopes?userId=$($script:userId)" $script:tokenB
        $l1 = (ConvertFrom-JsonList $r1.Body); $l2 = (ConvertFrom-JsonList $r2.Body)
        Expect ($r1.Status -eq 200 -and $r2.Status -eq 200 -and $l1.Count -eq 0 -and $l2.Count -eq 0) "$($r1.Status) $($r1.Body) | ?userId=A: $($r2.Status) $($r2.Body)"
    }

    Test-Step "IDOR: B não vê as transações de A" {
        $r = Invoke-Api "GET" "/api/transactions" $script:tokenB
        $list = (ConvertFrom-JsonList $r.Body)
        Expect ($r.Status -eq 200 -and $list.Count -eq 0) "$($r.Status) $($r.Body)"
    }

    Test-Step "IDOR: B não vê a renda variável de A (nem com ?userId=A)" {
        $r = Invoke-Api "GET" "/api/variable-income?userId=$($script:userId)" $script:tokenB
        $list = (ConvertFrom-JsonList $r.Body)
        Expect ($r.Status -eq 200 -and $list.Count -eq 0) "$($r.Status) $($r.Body)"
    }

    Test-Step "IDOR: userId de A no corpo de B é ignorado (envelope fica com B)" {
        $body = (@{ userId = $script:userId; categoryName = "LEISURE"; limitAmount = 99.0 } | ConvertTo-Json -Compress)
        $r = Invoke-Api "POST" "/api/envelopes" $script:tokenB $body
        $created = $r.Body | ConvertFrom-Json
        $listA = (ConvertFrom-JsonList (Invoke-Api "GET" "/api/envelopes" $script:token).Body)
        Expect ($r.Status -eq 200 -and $created.userId -ne $script:userId -and @($listA | Where-Object { $_.categoryName -eq "LEISURE" }).Count -eq 0) "$($r.Status) $($r.Body) | envelopes de A: $($listA.Count)"
    }

    Test-Step "Pulso de A não muda com dados de B" {
        $r = Invoke-Api "GET" "/api/budgets/daily-pulse" $script:token
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.pulse -eq (Get-ExpectedPulse 2400) -and $j.totalSpent -eq 600.0) "$($r.Status) $($r.Body)"
    }

    # ---- Fase 3: rotas do Desktop (usuário D isolado, para não mexer nos totais de A) ----
    $script:tokenD = (Invoke-Api "POST" "/api/auth/register" "" (@{ name = "Duda Desktop"; email = "d_$([Guid]::NewGuid().ToString('N'))@organiza.ai"; password = "senhaDaD123" } | ConvertTo-Json -Compress)).Body
    $script:tokenE = (Invoke-Api "POST" "/api/auth/register" "" (@{ name = "Edu Sem Onboarding"; email = "e_$([Guid]::NewGuid().ToString('N'))@organiza.ai"; password = "senhaDoE123" } | ConvertTo-Json -Compress)).Body
    $chips = (@{ fixed = @("Aluguel", "Contas", "Transporte"); variable = @("Alimentação", "Delivery") } | ConvertTo-Json -Compress)

    Test-Step "Chips antes do onboarding = 409; chip desconhecido e lista vazia = 400" {
        $r1 = Invoke-Api "POST" "/api/envelopes/from-chips" $script:tokenE $chips
        $r2 = Invoke-Api "POST" "/api/envelopes/from-chips" $script:tokenE (@{ fixed = @("Iate"); variable = @() } | ConvertTo-Json -Compress)
        $r3 = Invoke-Api "POST" "/api/envelopes/from-chips" $script:tokenE '{"fixed":[],"variable":[]}'
        $r4 = Invoke-Api "POST" "/api/envelopes/from-chips" $script:tokenE '{"fixed":["Aluguel"]}'
        Expect ($r1.Status -eq 409 -and $r2.Status -eq 400 -and ($r2.Body | ConvertFrom-Json).error -ceq "Gasto desconhecido: Iate" -and $r3.Status -eq 400 -and $r4.Status -eq 400) "$($r1.Status) | $($r2.Status) $($r2.Body) | $($r3.Status) | $($r4.Status)"
    }

    Test-Step "Tela 7: chips viram 4 caixinhas por regra fixa (SURVIVAL: 2100/3 = 700 por necessidade, Folga 600 no FOOD)" {
        Invoke-Api "POST" "/api/users/onboarding" $script:tokenD (@{ salary = 3000.0; incomeType = "FIXED"; hasDebt = $false } | ConvertTo-Json -Compress) | Out-Null
        $r = Invoke-Api "POST" "/api/envelopes/from-chips" $script:tokenD $chips
        $l = (ConvertFrom-JsonList $r.Body)
        $lim = @{}; foreach ($e in $l) { $lim[$e.categoryName] = $e.limitAmount }
        $again = (ConvertFrom-JsonList (Invoke-Api "POST" "/api/envelopes/from-chips" $script:tokenD $chips).Body)
        Expect ($r.Status -eq 200 -and $l.Count -eq 4 -and $lim["HOUSING"] -eq 700.0 -and $lim["TRANSPORT"] -eq 700.0 -and $lim["GROCERIES"] -eq 700.0 -and $lim["FOOD"] -eq 600.0 -and $again.Count -eq 0) "$($r.Status) $($r.Body) | 2ª chamada: $($again.Count)"
    }

    Test-Step "Gastos no FOOD: 500 = Alerta (83%) e +200 = Estourada; notificações geradas uma vez cada" {
        Invoke-Api "POST" "/api/transactions" $script:tokenD (@{ description = "iFood"; amount = 500; category = "FOOD"; currency = "BRL" } | ConvertTo-Json -Compress) | Out-Null
        $o1 = @((ConvertFrom-JsonList (Invoke-Api "GET" "/api/envelopes/overview" $script:tokenD).Body) | Where-Object { $_.categoryName -eq "FOOD" })[0]
        Invoke-Api "POST" "/api/transactions" $script:tokenD (@{ description = "Delivery"; amount = 200; category = "FOOD"; currency = "BRL" } | ConvertTo-Json -Compress) | Out-Null
        $ov = (ConvertFrom-JsonList (Invoke-Api "GET" "/api/envelopes/overview" $script:tokenD).Body)
        $o2 = @($ov | Where-Object { $_.categoryName -eq "FOOD" })[0]
        $h = @($ov | Where-Object { $_.categoryName -eq "HOUSING" })[0]
        $n = (ConvertFrom-JsonList (Invoke-Api "GET" "/api/notifications" $script:tokenD).Body)
        $alert = @($n | Where-Object { $_.kind -eq "ENVELOPE_ALERT" }); $over = @($n | Where-Object { $_.kind -eq "ENVELOPE_EXCEEDED" })
        Expect ($o1.status -eq "ALERTA" -and $o1.percent -eq 83 -and $o2.status -eq "ESTOURADA" -and $o2.spentThisMonth -eq 700.0 -and $o2.percent -eq 117 -and $o2.bucket -ceq "Folga" -and $h.status -eq "EM_DIA" -and $h.bucket -ceq "Necessidades" -and $alert.Count -eq 1 -and $over.Count -eq 1 -and $over[0].title -ceq "Você estourou a caixinha FOOD" -and $over[0].message -like "*R$ 700,00 de R$ 600,00*(117%)*") "o1=$($o1 | ConvertTo-Json -Compress) o2=$($o2 | ConvertTo-Json -Compress) notif=$($n | ConvertTo-Json -Compress)"
    }

    Test-Step "Notificações: pulso do dia uma vez, sem lembrete (houve gasto hoje); marcar todas como lidas = 204" {
        $n1 = (ConvertFrom-JsonList (Invoke-Api "GET" "/api/notifications" $script:tokenD).Body)
        $rr = Invoke-Api "POST" "/api/notifications/read-all" $script:tokenD
        $n2 = (ConvertFrom-JsonList (Invoke-Api "GET" "/api/notifications" $script:tokenD).Body)
        Expect (@($n1 | Where-Object { $_.kind -eq "DAILY_PULSE" }).Count -eq 1 -and @($n1 | Where-Object { $_.kind -eq "REMINDER" }).Count -eq 0 -and @($n1 | Where-Object { $_.read -eq $false }).Count -ge 3 -and $rr.Status -eq 204 -and $n2.Count -eq $n1.Count -and @($n2 | Where-Object { $_.read -eq $false }).Count -eq 0) "antes=$($n1 | ConvertTo-Json -Compress) read-all=$($rr.Status) depois=$($n2 | ConvertTo-Json -Compress)"
    }

    Test-Step "Notificações sem salário e sem gasto: só o lembrete; as de D não aparecem para E (IDOR)" {
        $n = (ConvertFrom-JsonList (Invoke-Api "GET" "/api/notifications" $script:tokenE).Body)
        Expect ($n.Count -eq 1 -and $n[0].kind -eq "REMINDER") "$($n | ConvertTo-Json -Compress)"
    }

    Test-Step "PUT /api/envelopes/{id}: altera limite e tipo (padrão FIXED/3 meses) e mantém o gasto" {
        $food = @((ConvertFrom-JsonList (Invoke-Api "GET" "/api/envelopes" $script:tokenD).Body) | Where-Object { $_.categoryName -eq "FOOD" })[0]
        $script:foodD = $food.id
        $r = Invoke-Api "PUT" "/api/envelopes/$($food.id)" $script:tokenD (@{ categoryName = "FOOD"; limitAmount = 800.0 } | ConvertTo-Json -Compress)
        $j = $r.Body | ConvertFrom-Json
        $ov = @((ConvertFrom-JsonList (Invoke-Api "GET" "/api/envelopes/overview" $script:tokenD).Body) | Where-Object { $_.categoryName -eq "FOOD" })[0]
        Expect ($r.Status -eq 200 -and $j.id -eq $food.id -and $j.limitAmount -eq 800.0 -and $j.currentSpent -eq 700.0 -and $j.movingAverageMonths -eq 3 -and $ov.status -eq "ALERTA") "$($r.Status) $($r.Body) | overview=$($ov | ConvertTo-Json -Compress)"
    }

    Test-Step "PUT envelope: corpo inválido, limite negativo e tipo inválido = 400; id inexistente = 404" {
        $id = $script:foodD
        $a = Invoke-Api "PUT" "/api/envelopes/$id" $script:tokenD "{nao json"
        $b = Invoke-Api "PUT" "/api/envelopes/$id" $script:tokenD (@{ categoryName = "FOOD"; limitAmount = -1.0 } | ConvertTo-Json -Compress)
        $c = Invoke-Api "PUT" "/api/envelopes/$id" $script:tokenD (@{ categoryName = "FOOD"; limitAmount = 10.0; limitType = "SEMANAL" } | ConvertTo-Json -Compress)
        $d = Invoke-Api "PUT" "/api/envelopes/999999999" $script:tokenD (@{ categoryName = "FOOD"; limitAmount = 10.0 } | ConvertTo-Json -Compress)
        $e = Invoke-Api "PUT" "/api/envelopes/abc" $script:tokenD (@{ categoryName = "FOOD"; limitAmount = 10.0 } | ConvertTo-Json -Compress)
        Expect ($a.Status -eq 400 -and $b.Status -eq 400 -and $c.Status -eq 400 -and $d.Status -eq 404 -and $e.Status -eq 404) "$($a.Status) $($b.Status) $($c.Status) $($d.Status) $($e.Status)"
    }

    Test-Step "IDOR: B não altera nem apaga a caixinha de D (404) e ela continua igual" {
        $id = $script:foodD
        $p = Invoke-Api "PUT" "/api/envelopes/$id" $script:tokenB (@{ categoryName = "HACK"; limitAmount = 1.0 } | ConvertTo-Json -Compress)
        $d = Invoke-Api "DELETE" "/api/envelopes/$id" $script:tokenB
        $food = @((ConvertFrom-JsonList (Invoke-Api "GET" "/api/envelopes" $script:tokenD).Body) | Where-Object { $_.id -eq $id })
        Expect ($p.Status -eq 404 -and $d.Status -eq 404 -and $food.Count -eq 1 -and $food[0].categoryName -eq "FOOD" -and $food[0].limitAmount -eq 800.0) "PUT=$($p.Status) DELETE=$($d.Status) envelope=$($food | ConvertTo-Json -Compress)"
    }

    Test-Step "DELETE /api/envelopes/{id} = 204, some da lista; 2º DELETE = 404" {
        $h = @((ConvertFrom-JsonList (Invoke-Api "GET" "/api/envelopes" $script:tokenD).Body) | Where-Object { $_.categoryName -eq "HOUSING" })[0]
        $r1 = Invoke-Api "DELETE" "/api/envelopes/$($h.id)" $script:tokenD
        $r2 = Invoke-Api "DELETE" "/api/envelopes/$($h.id)" $script:tokenD
        $left = (ConvertFrom-JsonList (Invoke-Api "GET" "/api/envelopes" $script:tokenD).Body)
        Expect ($r1.Status -eq 204 -and $r2.Status -eq 404 -and $left.Count -eq 3 -and @($left | Where-Object { $_.categoryName -eq "HOUSING" }).Count -eq 0) "$($r1.Status) $($r2.Status) restantes=$($left.Count)"
    }

    Test-Step "GET /api/transactions/{category} e /summary (legado); categoria inválida = 400; B não vê as de D" {
        $f = (ConvertFrom-JsonList (Invoke-Api "GET" "/api/transactions/FOOD" $script:tokenD).Body)
        $x = Invoke-Api "GET" "/api/transactions/XYZ" $script:tokenD
        $s = (Invoke-Api "GET" "/api/transactions/summary" $script:tokenD).Body | ConvertFrom-Json
        $fb = (ConvertFrom-JsonList (Invoke-Api "GET" "/api/transactions/FOOD" $script:tokenB).Body)
        Expect ($f.Count -eq 2 -and $x.Status -eq 400 -and $s.FOOD -eq 700.0 -and $fb.Count -eq 0) "FOOD=$($f.Count) XYZ=$($x.Status) summary=$($s | ConvertTo-Json -Compress) B=$($fb.Count)"
    }

    Test-Step "PATCH /api/users/me/salary 6000 migra SURVIVAL → STANDARD (BudgetModelMigrationService); 0 e corpo inválido = 400" {
        $r = Invoke-Api "PATCH" "/api/users/me/salary" $script:tokenD (@{ salary = 6000.0 } | ConvertTo-Json -Compress)
        $j = $r.Body | ConvertFrom-Json
        $z = Invoke-Api "PATCH" "/api/users/me/salary" $script:tokenD (@{ salary = 0 } | ConvertTo-Json -Compress)
        $bad = Invoke-Api "PATCH" "/api/users/me/salary" $script:tokenD '{"salary":"muito"}'
        $p = (Invoke-Api "GET" "/api/budgets/daily-pulse" $script:tokenD).Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.salary -eq 6000.0 -and $j.previousModel -eq "SURVIVAL_702010" -and $j.budgetModel -eq "STANDARD_503020" -and $j.migrated -eq $true -and @($j.buckets)[0].amount -eq 3000.0 -and $z.Status -eq 400 -and $bad.Status -eq 400 -and $p.salary -eq 6000.0) "$($r.Status) $($r.Body) | 0=$($z.Status) inválido=$($bad.Status)"
    }

    Test-Step "PUT /api/users/me/budget-model (#11): KAKEIBO com 4 buckets; modelo inválido = 400" {
        $r = Invoke-Api "PUT" "/api/users/me/budget-model" $script:tokenD (@{ model = "KAKEIBO" } | ConvertTo-Json -Compress)
        $j = $r.Body | ConvertFrom-Json
        $bad = Invoke-Api "PUT" "/api/users/me/budget-model" $script:tokenD (@{ model = "TUDO_NO_LAZER" } | ConvertTo-Json -Compress)
        $bal = (Invoke-Api "GET" "/api/budgets/balance" $script:tokenD).Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.suggestedModel -eq "KAKEIBO" -and @($j.buckets).Count -eq 4 -and $bad.Status -eq 400 -and $bal.model -eq "KAKEIBO" -and @($bal.buckets)[2].spentAmount -eq 700.0) "$($r.Status) $($r.Body) | inválido=$($bad.Status) | balance=$($bal | ConvertTo-Json -Compress -Depth 4)"
    }

    Test-Step "Meta da reserva: renda variável vai para a reserva até a meta; dashboard mostra a reserva; aviso de meta batida" {
        $g = Invoke-Api "PUT" "/api/users/me/emergency-goal" $script:tokenD (@{ goal = 100.0 } | ConvertTo-Json -Compress)
        $neg = Invoke-Api "PUT" "/api/users/me/emergency-goal" $script:tokenD (@{ goal = -1.0 } | ConvertTo-Json -Compress)
        $v1 = (Invoke-Api "POST" "/api/variable-income" $script:tokenD (@{ amount = 150.0; source = "freela" } | ConvertTo-Json -Compress)).Body | ConvertFrom-Json
        $v2 = (Invoke-Api "POST" "/api/variable-income" $script:tokenD (@{ amount = 50.0; source = "bico" } | ConvertTo-Json -Compress)).Body | ConvertFrom-Json
        $dash = (Invoke-Api "GET" "/api/dashboard" $script:tokenD).Body | ConvertFrom-Json
        $n = (ConvertFrom-JsonList (Invoke-Api "GET" "/api/notifications" $script:tokenD).Body)
        Expect ($g.Status -eq 200 -and ($g.Body | ConvertFrom-Json).hasGoal -eq $true -and $neg.Status -eq 400 -and $v1.destination -eq "EMERGENCY_FUND" -and $v2.destination -eq "BUDGET_5030020" -and $dash.reserve.accumulated -eq 150.0 -and $dash.reserve.goal -eq 100.0 -and $dash.reserve.percent -eq 150 -and @($n | Where-Object { $_.kind -eq "GOAL_REACHED" }).Count -eq 1) "meta=$($g.Status) neg=$($neg.Status) v1=$($v1.destination) v2=$($v2.destination) reserva=$($dash.reserve | ConvertTo-Json -Compress)"
    }

    Test-Step "Preferências (Tela 13): padrão DAILY/e-mail ligado; PUT grava; frequência inválida = 400; não vaza para E" {
        $d0 = (Invoke-Api "GET" "/api/users/me/preferences" $script:tokenD).Body | ConvertFrom-Json
        $p = Invoke-Api "PUT" "/api/users/me/preferences" $script:tokenD (@{ emailEnabled = $false; frequency = "WEEKLY"; pushEnabled = $true } | ConvertTo-Json -Compress)
        $d1 = (Invoke-Api "GET" "/api/users/me/preferences" $script:tokenD).Body | ConvertFrom-Json
        $bad = Invoke-Api "PUT" "/api/users/me/preferences" $script:tokenD (@{ emailEnabled = $true; frequency = "HORA"; pushEnabled = $false } | ConvertTo-Json -Compress)
        $e = (Invoke-Api "GET" "/api/users/me/preferences" $script:tokenE).Body | ConvertFrom-Json
        Expect ($d0.emailEnabled -eq $true -and $d0.frequency -eq "DAILY" -and $d0.pushEnabled -eq $false -and $p.Status -eq 200 -and $d1.emailEnabled -eq $false -and $d1.frequency -eq "WEEKLY" -and $d1.pushEnabled -eq $true -and $bad.Status -eq 400 -and $e.frequency -eq "DAILY") "padrão=$($d0 | ConvertTo-Json -Compress) depois=$($d1 | ConvertTo-Json -Compress) inválido=$($bad.Status) E=$($e | ConvertTo-Json -Compress)"
    }

    Test-Step "Open Finance DEMO: 5 bancos marcados como demonstração; conectar não conecta nada; banco fora = 400" {
        $b = (Invoke-Api "GET" "/api/open-finance/banks" $script:tokenD).Body | ConvertFrom-Json
        $c = (Invoke-Api "POST" "/api/open-finance/connect" $script:tokenD (@{ bank = "Nubank" } | ConvertTo-Json -Compress)).Body | ConvertFrom-Json
        $x = Invoke-Api "POST" "/api/open-finance/connect" $script:tokenD (@{ bank = "Banco Imaginário" } | ConvertTo-Json -Compress)
        $tx = (ConvertFrom-JsonList (Invoke-Api "GET" "/api/transactions" $script:tokenD).Body)
        Expect ($b.demo -eq $true -and @($b.banks).Count -eq 5 -and $b.notice -like "Demonstração*" -and $c.demo -eq $true -and $c.status -eq "DEMO_NAO_CONECTADO" -and $x.Status -eq 400 -and $tx.Count -eq 2) "banks=$($b | ConvertTo-Json -Compress) connect=$($c | ConvertTo-Json -Compress) fora=$($x.Status) transações=$($tx.Count)"
    }

    Test-Step "Rotas novas sem token = 401" {
        $codes = @(
            (Invoke-Api "GET" "/api/dashboard?period=week").Status, (Invoke-Api "GET" "/api/budgets/balance").Status,
            (Invoke-Api "GET" "/api/envelopes/overview").Status, (Invoke-Api "POST" "/api/envelopes/from-chips" "" $chips).Status,
            (Invoke-Api "PUT" "/api/envelopes/1" "" '{"categoryName":"X","limitAmount":1}').Status, (Invoke-Api "DELETE" "/api/envelopes/1").Status,
            (Invoke-Api "GET" "/api/transactions/FOOD").Status, (Invoke-Api "GET" "/api/transactions/summary").Status,
            (Invoke-Api "PATCH" "/api/users/me/salary" "" '{"salary":1}').Status, (Invoke-Api "PUT" "/api/users/me/budget-model" "" '{"model":"KAKEIBO"}').Status,
            (Invoke-Api "PUT" "/api/users/me/emergency-goal" "" '{"goal":1}').Status, (Invoke-Api "GET" "/api/notifications").Status,
            (Invoke-Api "POST" "/api/notifications/read-all").Status, (Invoke-Api "GET" "/api/users/me/preferences").Status,
            (Invoke-Api "PUT" "/api/users/me/preferences" "" '{"emailEnabled":true,"frequency":"DAILY","pushEnabled":false}').Status,
            (Invoke-Api "GET" "/api/open-finance/banks").Status, (Invoke-Api "POST" "/api/open-finance/connect" "" '{"bank":"Nubank"}').Status)
        Expect (@($codes | Where-Object { $_ -eq 401 }).Count -eq $codes.Count) "códigos: $($codes -join ',')"
    }

    Test-Step "Login: 6ª tentativa no mesmo e-mail em 1 minuto = 429" {
        $alvo = (@{ email = "rl_$([Guid]::NewGuid().ToString('N'))@organiza.ai"; password = "x" } | ConvertTo-Json -Compress)
        $codes = @()
        for ($k = 1; $k -le 6; $k++) { $codes += (Invoke-Api "POST" "/api/auth/login" "" $alvo).Status }
        Expect (@($codes[0..4] | Where-Object { $_ -eq 401 }).Count -eq 5 -and $codes[5] -eq 429) "códigos: $($codes -join ',')"
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
