# scripts/test_integrations_mock.ps1
# Integracoes do MVP 1 contra provedores FALSOS locais (scripts/mock_providers/providers_mock.ps1): nunca
# chama servico real. Cobre o e-mail no formato do Resend (esqueci a senha com token de uso unico; resumo
# diario no horario KOF_DIGEST_AT, sem duplicar apos reinicio) e o desligamento honesto (503) sem
# KOF_EMAIL_API_KEY. O mock e HTTPS com certificado autoassinado gerado na hora; o backend so confia nele
# porque a JVM do teste recebe um truststore de teste (-Djavax.net.ssl.trustStore): o caminho TLS e o real.
# Pre-requisitos: `kof build backend --target jvm` (-ClassesDir); driver JDBC em -ExtraClasspath; kof.jar em
# -KofJar; JDK com keytool (-JavaHome). Banco: H2 em arquivo novo em -DbDir, ou o de -DbUrl/-DbUser/-DbPassword
# (ex.: MySQL local vazio; o driver vai em -ExtraClasspath).
# Exit 0 somente se todos os passos passarem e o servidor nao emitir VerifyError/LinkageError.

param(
    [string]$ClassesDir = "build/classes",
    [string]$ExtraClasspath = "",
    [string]$KofJar = "",
    [string]$DbDir = "",
    [string]$DbUrl = "",
    [string]$DbUser = "",
    [string]$DbPassword = "",
    [string]$JavaHome = "C:\Program Files\Eclipse Adoptium\jdk-25.0.3.9-hotspot",
    [int]$Port = 3160,
    [int]$MockPort = 18453,
    [int]$AdminPort = 18454
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$BaseUrl = "http://localhost:$Port"
$MockUrl = "https://127.0.0.1:$MockPort"
$AdminUrl = "http://127.0.0.1:$AdminPort"
$JavaExe = Join-Path $JavaHome "bin\java.exe"
if (-not $DbDir) { $DbDir = Join-Path ([System.IO.Path]::GetTempPath()) "organiza-integracoes-$([Guid]::NewGuid().ToString('N'))" }
New-Item -ItemType Directory -Force $DbDir | Out-Null

# Certificado de teste (SAN 127.0.0.1, 1 dia) + truststore PKCS12 so com ele, para a JVM do backend.
$work = Join-Path ([System.IO.Path]::GetTempPath()) "organiza-mock-tls-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Force $work | Out-Null
$rsa = [System.Security.Cryptography.RSA]::Create(2048)
$creq = New-Object System.Security.Cryptography.X509Certificates.CertificateRequest("CN=organiza-mock", $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$san = New-Object System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder
$san.AddIpAddress([System.Net.IPAddress]::Parse("127.0.0.1"))
$creq.CertificateExtensions.Add($san.Build())
$cert = $creq.CreateSelfSigned([DateTimeOffset]::Now.AddMinutes(-5), [DateTimeOffset]::Now.AddDays(1))
$pfxPass = [Guid]::NewGuid().ToString('N')
$pfx = Join-Path $work "mock.pfx"; $cer = Join-Path $work "mock.cer"; $ts = Join-Path $work "truststore.p12"
[System.IO.File]::WriteAllBytes($pfx, $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $pfxPass))
[System.IO.File]::WriteAllBytes($cer, $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))
& (Join-Path $JavaHome "bin\keytool.exe") -importcert -noprompt -alias organiza-mock -file $cer -keystore $ts -storetype PKCS12 -storepass trust-test 2>&1 | Out-Null
$trustArgs = "-Djavax.net.ssl.trustStore=`"$ts`" -Djavax.net.ssl.trustStorePassword=trust-test -Djavax.net.ssl.trustStoreType=PKCS12"

function Invoke-Http([string]$Method, [string]$Url, [string]$Token = "", $Body = $null) {
    $req = [System.Net.HttpWebRequest]::Create($Url)
    $req.Method = $Method
    $req.Timeout = 15000
    if ($Token) { $req.Headers.Add("Authorization", "Bearer $Token") }
    if ($null -ne $Body) {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
        $req.ContentType = "application/json"
        $req.ContentLength = $bytes.Length
        $s = $req.GetRequestStream(); $s.Write($bytes, 0, $bytes.Length); $s.Close()
    }
    try { $resp = $req.GetResponse() } catch [System.Net.WebException] {
        $resp = $_.Exception.Response
        if ($null -eq $resp) { return @{ Status = 0; Body = $_.Exception.Message } }
    }
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream(), [System.Text.Encoding]::UTF8)
    $text = $reader.ReadToEnd(); $reader.Close(); $resp.Close()
    return @{ Status = [int]$resp.StatusCode; Body = $text }
}
function Invoke-Api([string]$Method, [string]$Path, [string]$Token = "", $Body = $null) { return Invoke-Http $Method "$BaseUrl$Path" $Token $Body }

$script:results = @()
function Test-Step([string]$Name, [scriptblock]$Check) {
    $n = $script:results.Count + 1
    Write-Host ("{0,2}. {1}..." -f $n, $Name) -NoNewline
    try {
        $detail = & $Check
        if ($detail -is [array]) { $detail = $detail[-1] }
        if ($detail -eq $true) { Write-Host " [PASS]" -ForegroundColor Green; $script:results += $true }
        else { Write-Host " [FAIL] $detail" -ForegroundColor Red; $script:results += $false }
    } catch {
        Write-Host " [FAIL] exceção: $($_.Exception.Message)" -ForegroundColor Red
        $script:results += $false
    }
}
function Expect([bool]$Cond, $Got) { if ($Cond) { return $true } else { return "obtido: $Got" } }
function ConvertFrom-JsonList([string]$Json) {
    $parsed = $Json | ConvertFrom-Json
    if ($null -eq $parsed) { return ,@() }
    return ,@($parsed | ForEach-Object { $_ })
}
function Get-MockEmails { return (ConvertFrom-JsonList (Invoke-Http "GET" "$AdminUrl/_emails").Body) }

# Processo java com variaveis proprias (o ambiente desta sessao nao muda).
function Start-Java([string]$Classpath, [hashtable]$EnvVars, [string]$LogPrefix) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $JavaExe
    $psi.Arguments = "-Xverify:all $trustArgs -cp `"$Classpath`" Default.Main"
    $psi.UseShellExecute = $false
    $psi.RedirectStandardError = $true
    $psi.RedirectStandardOutput = $true
    foreach ($k in @("KOF_EMAIL_API_URL", "KOF_EMAIL_API_KEY", "KOF_EMAIL_FROM", "KOF_DIGEST_AT", "KOF_APP_BASE_URL", "KOF_OUTBOUND_ALLOW_LOCAL_HTTP", "OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL", "KOF_WEB_OUT")) { $psi.EnvironmentVariables.Remove($k) }
    foreach ($k in $EnvVars.Keys) { $psi.EnvironmentVariables[$k] = $EnvVars[$k] }
    $p = [System.Diagnostics.Process]::Start($psi)
    $script:logs += @{ Proc = $p; Err = $p.StandardError.ReadToEndAsync(); Out = $p.StandardOutput.ReadToEndAsync() }
    return $p
}
function Wait-Up([string]$Url) {
    for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Milliseconds 500; if ((Invoke-Http "GET" $Url).Status -eq 200) { return $true } }
    return $false
}
function Stop-All { foreach ($l in $script:logs) { if (-not $l.Proc.HasExited) { $l.Proc.Kill(); $l.Proc.WaitForExit(5000) | Out-Null } } }

$rnd = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rnd)
$secret = -join ($rnd | ForEach-Object { $_.ToString("x2") })
$cp = "$ClassesDir;$ExtraClasspath;$KofJar"
$script:logs = @()

# Resumo diario no proximo minuto cheio (pelo menos 40 s a frente, para o boot e os passos anteriores).
$digestAt = (Get-Date).AddSeconds(100)
$digestHHMM = $digestAt.ToString("HH:mm")
# H2 SEM WRITE_DELAY=0: o passo 8 mata o processo (kill), e com WRITE_DELAY=0 o H2 2.5 perde linhas ja
# confirmadas nesse caso (medido: a linha do emaillogrow aparece com o servidor vivo e some depois do kill;
# com o padrao do H2 ela fica). Producao e MySQL, onde o passo passa com o mesmo codigo.
$dbMain = "jdbc:h2:file:$DbDir\int"; $dbOther = "jdbc:h2:file:$DbDir\int2"
if ($DbUrl) { $dbMain = $DbUrl; $dbOther = $DbUrl }
$base = @{ KOF_JWT_SECRET = $secret; PORT = "$Port"; KOF_DB_URL = $dbMain;
    KOF_EMAIL_API_URL = "$MockUrl/emails"; KOF_EMAIL_API_KEY = "re-test-mock"; KOF_EMAIL_FROM = "Organiza AI <nao-responda@organiza.test>";
    KOF_APP_BASE_URL = "http://app.organiza.test"; KOF_DIGEST_AT = $digestHHMM }
if ($DbUser) { $base["KOF_DB_USER"] = $DbUser; $base["KOF_DB_PASSWORD"] = $DbPassword }

try {
    $mock = Start-Process powershell.exe -PassThru -WindowStyle Hidden -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\mock_providers\providers_mock.ps1`" -Pfx `"$pfx`" -Password $pfxPass -ApiKey re-test-mock -Port $MockPort -AdminPort $AdminPort"
    $mockUp = Wait-Up "$AdminUrl/_emails"
    $server = Start-Java $cp $base "server"
    $up = Wait-Up "$BaseUrl/health"

    Test-Step "Mock HTTPS local e backend sobem (e-mail ligado, mock confiado só pelo truststore de teste)" { Expect ($mockUp -and $up) "mock=$mockUp backend=$up" }

    $mail = "int_$([Guid]::NewGuid().ToString('N'))@organiza.ai"
    $tk = (Invoke-Api "POST" "/api/auth/register" "" (@{ name = "Ina Integração"; email = $mail; password = "senhaAntiga123" } | ConvertTo-Json -Compress)).Body
    Invoke-Api "POST" "/api/users/onboarding" $tk (@{ salary = 3000.0; incomeType = "FIXED"; hasDebt = $false } | ConvertTo-Json -Compress) | Out-Null
    $tkNever = (Invoke-Api "POST" "/api/auth/register" "" (@{ name = "Nico Nunca"; email = "never_$([Guid]::NewGuid().ToString('N'))@organiza.ai"; password = "senhaDoN123" } | ConvertTo-Json -Compress)).Body
    Invoke-Api "POST" "/api/users/onboarding" $tkNever (@{ salary = 2000.0; incomeType = "FIXED"; hasDebt = $false } | ConvertTo-Json -Compress) | Out-Null
    Invoke-Api "PUT" "/api/users/me/preferences" $tkNever (@{ emailEnabled = $true; frequency = "NEVER"; pushEnabled = $false } | ConvertTo-Json -Compress) | Out-Null
    $mailNoOnb = "noonb_$([Guid]::NewGuid().ToString('N'))@organiza.ai"
    Invoke-Api "POST" "/api/auth/register" "" (@{ name = "Sem Onboarding"; email = $mailNoOnb; password = "senhaDoS123" } | ConvertTo-Json -Compress) | Out-Null

    $script:token = ""
    Test-Step "Esqueci a senha: 202 e 1 e-mail no provedor com link de token de 64 hex" {
        $r = Invoke-Api "POST" "/api/auth/forgot-password" "" (@{ email = $mail } | ConvertTo-Json -Compress)
        Start-Sleep -Seconds 2
        $m = @(Get-MockEmails | Where-Object { $_.to -eq $mail })
        if ($m.Count -eq 1 -and $m[0].text -match 'redefinir-senha\?token=([0-9a-f]{64})') { $script:token = $Matches[1] }
        Expect ($r.Status -eq 202 -and ($r.Body | ConvertFrom-Json).message -like "Se o e-mail estiver cadastrado*" -and $m.Count -eq 1 -and $m[0].from -like "Organiza AI*" -and $m[0].subject -ceq "Organiza AI: redefinir sua senha" -and $script:token.Length -eq 64) "$($r.Status) $($r.Body) | e-mails: $($m | ConvertTo-Json -Compress)"
    }

    Test-Step "E-mail inexistente: mesma resposta 202 e nenhum e-mail enviado" {
        $antes = @(Get-MockEmails).Count
        $r = Invoke-Api "POST" "/api/auth/forgot-password" "" (@{ email = "ninguem_$([Guid]::NewGuid().ToString('N'))@organiza.ai" } | ConvertTo-Json -Compress)
        Start-Sleep -Seconds 2
        Expect ($r.Status -eq 202 -and ($r.Body | ConvertFrom-Json).message -like "Se o e-mail estiver cadastrado*" -and @(Get-MockEmails).Count -eq $antes) "$($r.Status) $($r.Body) e-mails antes=$antes depois=$(@(Get-MockEmails).Count)"
    }

    Test-Step "Redefinir: senha curta e token desconhecido = 400; token certo = 200; nova senha entra e a antiga não" {
        $short = Invoke-Api "POST" "/api/auth/reset-password" "" (@{ token = $script:token; password = "curta" } | ConvertTo-Json -Compress)
        $bogus = Invoke-Api "POST" "/api/auth/reset-password" "" (@{ token = ("ab" * 32); password = "novaSenha123" } | ConvertTo-Json -Compress)
        $ok = Invoke-Api "POST" "/api/auth/reset-password" "" (@{ token = $script:token; password = "novaSenha123" } | ConvertTo-Json -Compress)
        $new = Invoke-Api "POST" "/api/auth/login" "" (@{ email = $mail; password = "novaSenha123" } | ConvertTo-Json -Compress)
        $old = Invoke-Api "POST" "/api/auth/login" "" (@{ email = $mail; password = "senhaAntiga123" } | ConvertTo-Json -Compress)
        Expect ($short.Status -eq 400 -and $bogus.Status -eq 400 -and $ok.Status -eq 200 -and $new.Status -eq 200 -and $old.Status -eq 401) "curta=$($short.Status) desconhecido=$($bogus.Status) $($bogus.Body) ok=$($ok.Status) $($ok.Body) nova=$($new.Status) antiga=$($old.Status)"
    }

    Test-Step "Token de uso único: 2º uso = 400" {
        $r = Invoke-Api "POST" "/api/auth/reset-password" "" (@{ token = $script:token; password = "outraSenha123" } | ConvertTo-Json -Compress)
        Expect ($r.Status -eq 400 -and ($r.Body | ConvertFrom-Json).error -like "Link inválido ou expirado*") "$($r.Status) $($r.Body)"
    }

    Test-Step "Limite: 4º pedido no mesmo e-mail em 1 hora = 429" {
        $codes = @(); for ($k = 1; $k -le 3; $k++) { $codes += (Invoke-Api "POST" "/api/auth/forgot-password" "" (@{ email = $mail } | ConvertTo-Json -Compress)).Status }
        Expect ($codes[0] -eq 202 -and $codes[1] -eq 202 -and $codes[2] -eq 429) "códigos (2º a 4º pedido): $($codes -join ',')"
    }

    Test-Step "Resumo diário às $digestHHMM (KOF_DIGEST_AT): 1 e-mail para quem tem onboarding e frequência DAILY; nenhum para NEVER e sem onboarding" {
        $limite = $digestAt.AddSeconds(75)
        $d = @()
        while ((Get-Date) -lt $limite) {
            Start-Sleep -Seconds 3
            $d = @(Get-MockEmails | Where-Object { $_.subject -ceq "Organiza AI: seu pulso de hoje" })
            if ($d.Count -ge 1 -and (Get-Date) -gt $digestAt.AddSeconds(20)) { break }
        }
        $mine = @($d | Where-Object { $_.to -eq $mail })
        Expect ($mine.Count -eq 1 -and $mine[0].text -like "*Pode gastar por dia até o fim do mês: R$ *" -and $mine[0].text -like "*Gastos do mês: R$ 0,00 de R$ 3.000,00*" -and @($d | Where-Object { $_.to -like "never_*" -or $_.to -eq $mailNoOnb }).Count -eq 0) "resumos: $($d | ConvertTo-Json -Compress)"
    }

    # Reinicio depois do resumo (mesmo banco, horario ja passou): o boot recupera o envio do dia, mas o
    # registro em emaillogrow impede o 2o e-mail.
    $server.Kill(); $server.WaitForExit(5000) | Out-Null
    $firstLog = ($script:logs[0].Err.Result + $script:logs[0].Out.Result) -split "`n" | Where-Object { $_ -match "resumo" }
    $antesRestart = @(Get-MockEmails | Where-Object { $_.subject -ceq "Organiza AI: seu pulso de hoje" -and $_.to -eq $mail }).Count
    Start-Java $cp $base "server-restart" | Out-Null
    $upR = Wait-Up "$BaseUrl/health"
    Test-Step "Reinício depois do resumo: o boot confere emaillogrow e não reenvia (1 resumo continua 1)" {
        Start-Sleep -Seconds 8
        $depois = @(Get-MockEmails | Where-Object { $_.subject -ceq "Organiza AI: seu pulso de hoje" -and $_.to -eq $mail }).Count
        $srv = $script:logs[$script:logs.Count - 1]
        $srv.Proc.Kill(); $srv.Proc.WaitForExit(5000) | Out-Null
        $log = $srv.Err.Result + $srv.Out.Result
        Expect ($upR -and $antesRestart -eq 1 -and $depois -eq 1 -and $log -match "resumo diario: 0 e-mail") "antes=$antesRestart depois=$depois | 1o servidor: $($firstLog -join ' / ') | reinicio: $($log.Substring(0, [Math]::Min(400, $log.Length)))"
    }

    # Sem KOF_EMAIL_API_KEY: recurso desligado com 503 honesto e motivo no log (sem tentar a chamada).
    $nokey = $base.Clone(); $nokey.Remove("KOF_EMAIL_API_KEY"); $nokey["KOF_DB_URL"] = $dbOther
    Start-Java $cp $nokey "server2" | Out-Null
    $up2 = Wait-Up "$BaseUrl/health"
    Test-Step "Sem KOF_EMAIL_API_KEY: esqueci a senha e redefinir = 503 honesto, log explica e não vaza chave" {
        $r = Invoke-Api "POST" "/api/auth/forgot-password" "" (@{ email = $mail } | ConvertTo-Json -Compress)
        $r2 = Invoke-Api "POST" "/api/auth/reset-password" "" (@{ token = ("ab" * 32); password = "novaSenha123" } | ConvertTo-Json -Compress)
        Stop-All
        $log = ($script:logs | ForEach-Object { $_.Err.Result + $_.Out.Result }) -join "`n"
        Expect ($up2 -and $r.Status -eq 503 -and $r2.Status -eq 503 -and ($r.Body | ConvertFrom-Json).error -like "Recuperação de senha indisponível*" -and $log -match "defina KOF_EMAIL_API_KEY" -and $log -notmatch "re-test-mock") "$($r.Status) $($r.Body) / $($r2.Status) | log: $($log.Substring(0, [Math]::Min(400, $log.Length)))"
    }
} finally {
    Stop-All
    if ($mock -and -not $mock.HasExited) { Stop-Process -Id $mock.Id -Force }
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}

$allErr = ($script:logs | ForEach-Object { $_.Err.Result }) -join "`n"
$verifyClean = -not ($allErr -match "VerifyError|LinkageError|ClassFormatError|NoClassDefFoundError")
$total = $script:results.Count
$passed = @($script:results | Where-Object { $_ }).Count
Write-Host "`n   RESULTADO INTEGRACOES (mock): $passed / $total PASSOS GREEN :: stderr: $(if ($verifyClean) { 'sem VerifyError/LinkageError' } else { 'COM ERRO' })"
if ($total -gt 0 -and $passed -eq $total -and $verifyClean) { exit 0 } else { exit 1 }
