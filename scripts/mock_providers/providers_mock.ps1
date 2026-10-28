# scripts/mock_providers/providers_mock.ps1
# Provedores FALSOS para teste local (nunca chamam servico real). Sem admin: TcpListener + SslStream.
#   HTTPS em 127.0.0.1:$Port com o certificado do PFX (o backend confia nele so pelo truststore de teste):
#     POST /emails  formato do Resend: Bearer obrigatorio = $ApiKey (senao 401); grava {from,to,subject,text}
#   HTTP em 127.0.0.1:$AdminPort (so para o script de teste ler o que chegou):
#     GET /_emails  lista JSON dos e-mails recebidos
#     GET /_openai  lista JSON dos pedidos de chat recebidos (sem cabecalhos)
#   POST /v1/chat/completions (HTTPS) no formato da OpenAI: Bearer obrigatorio = $OpenAiKey (senao 401).
#     Roteiro pela ultima mensagem do usuario: "gastei" -> tool_call persistTransaction; "todas as
#     ferramentas" -> as 8 tools numa resposta; "falha500" -> 500; "lento" -> responde depois de 4 s;
#     "formato quebrado" -> 200 sem "choices". Com mensagem role=tool no pedido -> resposta final que ecoa os
#     resultados. Senao -> "Olá do mock! mensagens=<n>" (n = mensagens recebidas, para conferir a memoria).
# O mock nunca imprime nem devolve o Authorization recebido. Uma conexao por vez.
# Por que nao em Kof: o servidor do kof.web 0.6.6 recusa com 401 qualquer "Authorization: Bearer" que nao
# seja um JWT valido, mesmo sem app.security (JvmRuntimeWebDispatch, passo 6), e o Resend usa Bearer opaco.
param([string]$Pfx, [string]$Password, [string]$ApiKey, [string]$OpenAiKey = "sk-mock-openai", [int]$Port = 18443, [int]$AdminPort = 18444)

$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($Pfx, $Password)
$tls = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
$admin = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $AdminPort)
$tls.Start(); $admin.Start()
$script:emails = New-Object System.Collections.ArrayList
$script:chats = New-Object System.Collections.ArrayList

function Completion($message, [string]$finish) {
    return (@{ id = "chatcmpl-mock"; object = "chat.completion"; model = "gpt-4o-mini"; choices = @(@{ index = 0; message = $message; finish_reason = $finish }) } | ConvertTo-Json -Depth 10 -Compress)
}
function ToolCall([string]$Id, [string]$Name, $ArgsObj) {
    return @{ id = $Id; type = "function"; function = @{ name = $Name; arguments = ($ArgsObj | ConvertTo-Json -Compress) } }
}
function Handle-Chat($req) {
    if ($req.Headers["authorization"] -ne "Bearer $OpenAiKey") {
        return @(401, '{"error":{"message":"Incorrect API key provided","type":"invalid_request_error","code":"invalid_api_key"}}')
    }
    $j = $req.Body | ConvertFrom-Json
    [void]$script:chats.Add($j)
    $msgs = @($j.messages)
    $lastUser = [string](($msgs | Where-Object { $_.role -eq "user" } | Select-Object -Last 1).content)
    $toolMsgs = @($msgs | Where-Object { $_.role -eq "tool" })
    if ($toolMsgs.Count -gt 0) {
        $echo = ($toolMsgs | ForEach-Object { $_.content }) -join " || "
        return @(200, (Completion @{ role = "assistant"; content = "Pronto! Resultado das ferramentas: $echo" } "stop"))
    }
    if ($lastUser -match "falha500") { return @(500, '{"error":{"message":"The server had an error","type":"server_error"}}') }
    if ($lastUser -match "formato quebrado") { return @(200, '{"inesperado":true}') }
    if ($lastUser -match "lento") { Start-Sleep -Seconds 4 }
    if ($lastUser -match "gastei") {
        $call = ToolCall "call_gasto" "persistTransaction" @{ amount = 35.5; category = "FOOD"; description = "almoço no mock" }
        return @(200, (Completion @{ role = "assistant"; content = $null; tool_calls = @($call) } "tool_calls"))
    }
    if ($lastUser -match "todas as ferramentas") {
        $calls = @(
            (ToolCall "call_1" "getDailyPulse" @{}),
            (ToolCall "call_2" "getBalance" @{}),
            (ToolCall "call_3" "suggestModelChange" @{}),
            (ToolCall "call_4" "getTotalByCategory" @{ category = "FOOD" }),
            (ToolCall "call_5" "listTransactionsByCategory" @{ category = "FOOD" }),
            (ToolCall "call_6" "registerIncome" @{ amount = 200.0; source = "freela de teste" }),
            (ToolCall "call_7" "answerKakeiboReflection" @{ answers = "a | b | c | d" }),
            (ToolCall "call_8" "persistTransaction" @{ amount = 10.25; category = "TRANSPORT"; description = "ônibus" })
        )
        return @(200, (Completion @{ role = "assistant"; content = $null; tool_calls = $calls } "tool_calls"))
    }
    return @(200, (Completion @{ role = "assistant"; content = "Olá do mock! mensagens=$($msgs.Count)" } "stop"))
}

# Le cabecalho e corpo em BYTES (Content-Length conta bytes; o corpo tem acentos em UTF-8).
function Read-Request($stream) {
    $head = New-Object System.Collections.Generic.List[byte]
    while ($true) {
        $b = $stream.ReadByte()
        if ($b -lt 0) { break }
        $head.Add([byte]$b)
        $n = $head.Count
        if ($n -ge 4 -and $head[$n - 4] -eq 13 -and $head[$n - 3] -eq 10 -and $head[$n - 2] -eq 13 -and $head[$n - 1] -eq 10) { break }
    }
    $lines = [System.Text.Encoding]::ASCII.GetString($head.ToArray()) -split "`r`n"
    $headers = @{}
    foreach ($line in $lines[1..($lines.Length - 1)]) {
        $i = $line.IndexOf(":")
        if ($i -gt 0) { $headers[$line.Substring(0, $i).Trim().ToLower()] = $line.Substring($i + 1).Trim() }
    }
    $body = ""
    if ($headers["content-length"]) {
        $len = [int]$headers["content-length"]
        $buf = New-Object byte[] $len
        $read = 0
        while ($read -lt $len) { $n = $stream.Read($buf, $read, $len - $read); if ($n -le 0) { break }; $read += $n }
        $body = [System.Text.Encoding]::UTF8.GetString($buf, 0, $read)
    }
    $parts = $lines[0] -split ' '
    return @{ Method = $parts[0]; Path = $parts[1]; Headers = $headers; Body = $body }
}

function Write-Response($stream, [int]$Code, [string]$Body) {
    $reason = @{ 200 = "OK"; 401 = "Unauthorized"; 404 = "Not Found"; 422 = "Unprocessable Entity"; 500 = "Internal Server Error" }[$Code]
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
    $head = [System.Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $Code $reason`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n")
    $stream.Write($head, 0, $head.Length); $stream.Write($bytes, 0, $bytes.Length); $stream.Flush()
}

function Handle-Provider($req) {
    if ($req.Method -eq "POST" -and $req.Path -eq "/emails") {
        if ($req.Headers["authorization"] -ne "Bearer $ApiKey") {
            return @(401, '{"statusCode":401,"name":"validation_error","message":"API key is invalid"}')
        }
        [void]$script:emails.Add(($req.Body | ConvertFrom-Json))
        return @(200, ('{"id":"mock-email-' + $script:emails.Count + '"}'))
    }
    if ($req.Method -eq "POST" -and $req.Path -eq "/v1/chat/completions") { return Handle-Chat $req }
    return @(404, '{"message":"rota do mock inexistente"}')
}

while ($true) {
    $handled = $false
    if ($tls.Pending()) {
        $handled = $true
        $client = $tls.AcceptTcpClient()
        try {
            $ssl = New-Object System.Net.Security.SslStream($client.GetStream(), $false)
            $ssl.AuthenticateAsServer($cert, $false, [System.Security.Authentication.SslProtocols]::Tls12, $false)
            $req = Read-Request $ssl
            $resp = Handle-Provider $req
            Write-Response $ssl $resp[0] $resp[1]
        } catch {
            # handshake recusado pelo cliente ou conexao encerrada
        } finally { $client.Close() }
    }
    if ($admin.Pending()) {
        $handled = $true
        $client = $admin.AcceptTcpClient()
        try {
            $s = $client.GetStream()
            $req = Read-Request $s
            if ($req.Path -eq "/_emails") { Write-Response $s 200 (ConvertTo-Json -InputObject @($script:emails) -Depth 6 -Compress) }
            elseif ($req.Path -eq "/_openai") { Write-Response $s 200 (ConvertTo-Json -InputObject @($script:chats) -Depth 12 -Compress) }
            else { Write-Response $s 404 '{}' }
        } catch { } finally { $client.Close() }
    }
    if (-not $handled) { Start-Sleep -Milliseconds 20 }
}
