# scripts/outbound_probe/https_mock.ps1
# Servidor HTTPS LOCAL de teste (127.0.0.1) para o gate TLS do backend/outbound.kf. Sem admin: TcpListener +
# SslStream com o certificado do PFX recebido. Uma conexao por vez. Rotas: /ok -> 200, /401 -> 401,
# /500 -> 500, /slow -> 200 depois de 3 s (teste de timeout). Responde sempre JSON curto.
# Nunca guarda nem imprime o Authorization recebido (so registra se veio ou nao).
param([string]$Pfx, [string]$Password, [int]$Port = 18443)

$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($Pfx, $Password)
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
        $ssl = New-Object System.Net.Security.SslStream($client.GetStream(), $false)
        $ssl.AuthenticateAsServer($cert, $false, [System.Security.Authentication.SslProtocols]::Tls12, $false)
        $reader = New-Object System.IO.StreamReader($ssl)
        $first = $reader.ReadLine()
        $len = 0; $auth = $false
        while ($true) {
            $line = $reader.ReadLine()
            if ([string]::IsNullOrEmpty($line)) { break }
            if ($line -match '^Content-Length:\s*(\d+)') { $len = [int]$Matches[1] }
            if ($line -match '^Authorization:') { $auth = $true }
        }
        if ($len -gt 0) { $buf = New-Object char[] $len; $reader.Read($buf, 0, $len) | Out-Null }
        $path = ($first -split ' ')[1]
        $code = 200; $reason = "OK"
        if ($path -eq "/401") { $code = 401; $reason = "Unauthorized" }
        if ($path -eq "/500") { $code = 500; $reason = "Internal Server Error" }
        if ($path -eq "/slow") { Start-Sleep -Seconds 3 }
        $body = '{"mock":"' + $path + '","auth":' + $(if ($auth) { 'true' } else { 'false' }) + '}'
        $bytes = [System.Text.Encoding]::UTF8.GetBytes("HTTP/1.1 $code $reason`r`nContent-Type: application/json`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n$body")
        $ssl.Write($bytes, 0, $bytes.Length); $ssl.Flush()
    } catch {
        # handshake recusado pelo cliente (o caso esperado do certificado nao confiavel)
    } finally {
        $client.Close()
    }
}
