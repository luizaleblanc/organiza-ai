# scripts/test_outbound_tls.ps1
# Gate TLS do HTTP externo (backend/outbound.kf): prova que o caminho por interop JVM RECUSA certificado
# nao confiavel e host errado, ACEITA certificado confiavel, e entrega 4xx/5xx/timeout ao codigo Kof.
# Tudo local: certificado autoassinado gerado na hora (SAN 127.0.0.1), truststore de teste PKCS12 so
# com ele, servidor HTTPS em scripts/outbound_probe/https_mock.ps1. Com -Online, faz tambem um POST SEM
# Authorization para https://www.google.com (certificado publico valido; espera 405 visivel).
# Pre-requisitos: kof no PATH (ou -KofHome), JDK com keytool (-JavaHome).
# Exit 0 somente se todos os passos passarem.

param(
    [string]$KofHome = "",
    [string]$JavaHome = "C:\Program Files\Eclipse Adoptium\jdk-25.0.3.9-hotspot",
    [int]$Port = 18443,
    [switch]$Online
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot
$work = Join-Path ([System.IO.Path]::GetTempPath()) "organiza-tls-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Force (Join-Path $work "src") | Out-Null
$kof = if ($KofHome) { Join-Path $KofHome "bin\kof.bat" } else { "kof" }
$kofJar = if ($KofHome) { Join-Path $KofHome "lib\kof.jar" } else { Join-Path (Split-Path -Parent (Split-Path -Parent (Get-Command kof).Source)) "lib\kof.jar" }
$java = Join-Path $JavaHome "bin\java.exe"
$keytool = Join-Path $JavaHome "bin\keytool.exe"

# 1) probe = backend/outbound.kf + scripts/outbound_probe/main.kf
Copy-Item (Join-Path $root "backend\outbound.kf"), (Join-Path $root "scripts\outbound_probe\main.kf") (Join-Path $work "src")
& $kof build (Join-Path $work "src") --target jvm --output (Join-Path $work "cls") 2>&1 | Where-Object { $_ -notmatch "MEM014" } | Out-Host

# 2) certificado de teste (RSA 2048, SAN IP 127.0.0.1, 1 dia) + truststore PKCS12 so com ele
$rsa = [System.Security.Cryptography.RSA]::Create(2048)
$req = New-Object System.Security.Cryptography.X509Certificates.CertificateRequest("CN=organiza-tls-test", $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$san = New-Object System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder
$san.AddIpAddress([System.Net.IPAddress]::Parse("127.0.0.1"))
$req.CertificateExtensions.Add($san.Build())
$cert = $req.CreateSelfSigned([DateTimeOffset]::Now.AddMinutes(-5), [DateTimeOffset]::Now.AddDays(1))
$pfxPass = [Guid]::NewGuid().ToString('N')
$pfx = Join-Path $work "mock.pfx"; $cer = Join-Path $work "mock.cer"; $ts = Join-Path $work "truststore.p12"
[System.IO.File]::WriteAllBytes($pfx, $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $pfxPass))
[System.IO.File]::WriteAllBytes($cer, $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))
& $keytool -importcert -noprompt -alias organiza-mock -file $cer -keystore $ts -storetype PKCS12 -storepass trust-test 2>&1 | Out-Null

$mock = Start-Process powershell.exe -PassThru -WindowStyle Hidden -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\outbound_probe\https_mock.ps1`" -Pfx `"$pfx`" -Password $pfxPass -Port $Port"
Start-Sleep -Seconds 3

function Probe([string]$Url, [int]$TimeoutMs = 5000, [string]$Auth = "", [switch]$Trust) {
    $args = @()
    if ($Trust) { $args += "-Djavax.net.ssl.trustStore=$ts"; $args += "-Djavax.net.ssl.trustStorePassword=trust-test"; $args += "-Djavax.net.ssl.trustStoreType=PKCS12" }
    $args += @("-cp", "$(Join-Path $work 'cls');$kofJar", "Default.Main", $Url, "$TimeoutMs")
    if ($Auth) { $args += $Auth }
    return ((& $java @args 2>&1) -join " ")
}

$script:results = @()
function Test-Step([string]$Name, [scriptblock]$Check) {
    $n = $script:results.Count + 1
    Write-Host ("{0,2}. {1}..." -f $n, $Name) -NoNewline
    $out = & $Check
    if ($out[0] -eq $true) { Write-Host " [PASS] $($out[1])" -ForegroundColor Green; $script:results += $true }
    else { Write-Host " [FAIL] $($out[1])" -ForegroundColor Red; $script:results += $false }
}

$h = "https://127.0.0.1:$Port"
try {
    Test-Step "Autoassinado com o truststore padrao do JRE: RECUSADO no handshake (PKIX), sem resposta HTTP" {
        $o = Probe "$h/ok" 5000 "auth"; @(($o -match '^falha=SSLHandshakeException' -and $o -match 'PKIX'), $o)
    }
    Test-Step "Mesmo certificado confiado no truststore de teste: ACEITO (200 e corpo)" {
        $o = Probe "$h/ok" 5000 "auth" -Trust; @(($o -match '^status=200 body=\{"mock":"/ok","auth":true\}'), $o)
    }
    Test-Step "Certificado confiado mas host errado (localhost fora do SAN): RECUSADO" {
        $o = Probe "https://localhost:$Port/ok" 5000 "auth" -Trust; @(($o -match '^falha=SSLHandshakeException'), $o)
    }
    Test-Step "401 do provedor chega ao Kof como status=401 com corpo" {
        $o = Probe "$h/401" 5000 "auth" -Trust; @(($o -match '^status=401 body=\{"mock":"/401"'), $o)
    }
    Test-Step "500 do provedor chega ao Kof como status=500 com corpo" {
        $o = Probe "$h/500" 5000 "auth" -Trust; @(($o -match '^status=500 body=\{"mock":"/500"'), $o)
    }
    Test-Step "Timeout de leitura (servidor demora 3 s, limite 1 s): falha nomeada, sem travar" {
        $o = Probe "$h/slow" 1000 "auth" -Trust; @(($o -match '^falha=SocketTimeoutException'), $o)
    }
    Test-Step "http:// recusado sem KOF_OUTBOUND_ALLOW_LOCAL_HTTP (nem tenta conectar)" {
        $o = Probe "http://127.0.0.1:$Port/ok" 5000 "auth"; @(($o -match '^falha=endereco recusado'), $o)
    }
    if ($Online) {
        Test-Step "Online: https://www.google.com (certificado publico, SEM Authorization) aceito e 405 visivel" {
            $o = Probe "https://www.google.com/" 10000; @(($o -match '^status=405'), $o.Substring(0, [Math]::Min(80, $o.Length)))
        }
    }
} finally {
    if ($mock -and -not $mock.HasExited) { Stop-Process -Id $mock.Id -Force }
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}

$total = $script:results.Count
$passed = @($script:results | Where-Object { $_ }).Count
Write-Host "`n   RESULTADO TLS (outbound): $passed / $total PASSOS GREEN"
if ($total -gt 0 -and $passed -eq $total) { exit 0 } else { exit 1 }
