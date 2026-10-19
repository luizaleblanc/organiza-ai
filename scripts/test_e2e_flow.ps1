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

    Test-Step "Pulso após onboarding: salary = 3000.0, pulse = 100.0" {
        $r = Invoke-Api "GET" "/api/budgets/daily-pulse" $script:token
        $j = $r.Body | ConvertFrom-Json
        Expect ($r.Status -eq 200 -and $j.salary -eq 3000.0 -and $j.pulse -eq 100.0 -and $null -eq $j.message) "$($r.Status) $($r.Body)"
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
        $r = Invoke-Api "GET" "/api/variable-income" $script:token
        $list = (ConvertFrom-JsonList $r.Body)
        Expect ($r.Status -eq 200 -and @($list | Where-Object { $_.amount -eq 500.0 }).Count -eq 1) "$($r.Status) $($r.Body)"
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
        Expect ($r.Status -eq 200 -and $j.pulse -eq 80.0 -and $j.totalSpent -eq 600.0) "$($r.Status) $($r.Body)"
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
