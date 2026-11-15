# scripts/test_gate5_finance_import.ps1
# GATE 5: Validacao completa fim a fim do Protocolo Anti-Alucinacao 100% em KOF.
# Testa: PDF textual, PDF /ToUnicode CMap, PDF escaneado, DOCX com tabelas, PNG OCR, JPEG OCR,
# magic bytes mismatch, extensoes proibidas, path traversal, PDF corrompido, duplicata, IDOR (403),
# idempotencia de confirmacao dupla, trilha de auditoria (evidence), reconciliacao,
# todas as 5 intencoes (/api/intents/dispatch) e consulta de linguagem natural no chat.

param(
    [string]$BaseUrl = "http://localhost:8000",
    # Opcional: servidor com OPENAI_API_KEY configurada apontando para um provedor inalcancavel.
    # Prova que a resposta sobre fatura nao passa pelo ramo LLM (o LLM daria 503 nesse servidor).
    [string]$LlmBaseUrl = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$script:passed = 0
$script:failed = 0

function Assert-Check([string]$Name, [scriptblock]$Block) {
    Write-Host ("Checking {0}... " -f $Name) -NoNewline
    try {
        $res = & $Block
        if ($res -is [array]) { $res = $res[-1] }
        if ($res -eq $true) {
            Write-Host "[PASS]" -ForegroundColor Green
            $script:passed++
        } else {
            Write-Host "[FAIL] $res" -ForegroundColor Red
            $script:failed++
        }
    } catch {
        Write-Host "[FAIL] Exception: $($_.Exception.Message)" -ForegroundColor Red
        $script:failed++
    }
}

function Invoke-Http([string]$Method, [string]$Path, [string]$Token = "", $Body = $null) {
    $req = [System.Net.HttpWebRequest]::Create("$BaseUrl$Path")
    $req.Method = $Method
    $req.Timeout = 25000
    if ($Token) { $req.Headers.Add("Authorization", "Bearer $Token") }
    if ($null -ne $Body) {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
        $req.ContentType = "application/json; charset=utf-8"
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

function Compress-Zlib([byte[]]$Data) {
    $ms = New-Object System.IO.MemoryStream
    # Cabecalho zlib padrao: 0x78 0x9C
    $ms.WriteByte(0x78)
    $ms.WriteByte(0x9C)
    $ds = New-Object System.IO.Compression.DeflateStream($ms, [System.IO.Compression.CompressionLevel]::Optimal, $true)
    $ds.Write($Data, 0, $Data.Length)
    $ds.Close()
    # Adler-32 big endian
    $a = 1L; $b = 0L
    foreach ($x in $Data) {
        $a = ($a + $x) % 65521L
        $b = ($b + $a) % 65521L
    }
    $adler = (($b -shl 16) -bor $a)
    $ms.WriteByte([byte](($adler -shr 24) -band 0xFF))
    $ms.WriteByte([byte](($adler -shr 16) -band 0xFF))
    $ms.WriteByte([byte](($adler -shr 8) -band 0xFF))
    $ms.WriteByte([byte]($adler -band 0xFF))
    return $ms.ToArray()
}

function New-SyntheticPdfBase64([string[]]$Lines, [string]$ExtraObj = "") {
    $pdfText = "%PDF-1.4`n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj`n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj`n3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj`n"
    $streamContent = "BT`n/F1 12 Tf`n"
    foreach ($l in $Lines) {
        $escaped = $l.Replace("\", "\\").Replace("(", "\(").Replace(")", "\)")
        $streamContent += "($escaped) Tj T*`n"
    }
    $streamContent += "ET"
    $len = [System.Text.Encoding]::GetEncoding("ISO-8859-1").GetByteCount($streamContent)
    $pdfText += "4 0 obj << /Length $len >>`nstream`n$streamContent`nendstream`nendobj`n"
    if ($ExtraObj) {
        $pdfText += "$ExtraObj`n"
    }
    $pdfText += "%%EOF"
    return [Convert]::ToBase64String([System.Text.Encoding]::GetEncoding("ISO-8859-1").GetBytes($pdfText))
}

function New-ToUnicodePdfBase64() {
    # CMap mapeando <0001>..<0006> + stream com BT hex strings (<0001...>)
    $cmap = "beginbfchar`n<0001> <0031>`n<0002> <0030>`n<0003> <002F>`n<0004> <0031>`n<0005> <002C>`n<0006> <0055>`n<0007> <0062>`n<0008> <0065>`n<0009> <0072>`n<000A> <0020>`n<000B> <0035>`nendbfchar"
    $cmapBytes = [System.Text.Encoding]::ASCII.GetBytes($cmap)
    $zCmap = Compress-Zlib $cmapBytes

    # Hex line: 10/11 Uber 15,00 -> 0001 0002 0003 0001 0001 000A 0006 0007 0008 0009 000A 0001 000B 0005 0002 0002
    $btText = "BT`n<00010002000300010001000A0006000700080009000A0001000B000500020002> Tj T*`nET"
    $ms = New-Object System.IO.MemoryStream
    $enc = [System.Text.Encoding]::GetEncoding("ISO-8859-1")
    $p1 = $enc.GetBytes("%PDF-1.4`n1 0 obj << /Type /ToUnicode /Filter /FlateDecode /Length $($zCmap.Length) >>`nstream`n")
    $ms.Write($p1, 0, $p1.Length)
    $ms.Write($zCmap, 0, $zCmap.Length)
    $p2 = $enc.GetBytes("`nendstream`nendobj`n2 0 obj << /Length $($btText.Length) >>`nstream`n$btText`nendstream`nendobj`n%%EOF")
    $ms.Write($p2, 0, $p2.Length)
    return [Convert]::ToBase64String($ms.ToArray())
}

function New-SyntheticDocxBase64([string[][]]$Rows, [string[]]$Paragraphs) {
    $ms = New-Object System.IO.MemoryStream
    $zip = New-Object System.IO.Compression.ZipArchive($ms, [System.IO.Compression.ZipArchiveMode]::Create, $true)
    $ct = $zip.CreateEntry("[Content_Types].xml")
    $swCt = New-Object System.IO.StreamWriter($ct.Open(), [System.Text.Encoding]::UTF8)
    $swCt.Write('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>')
    $swCt.Close()

    $docXml = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    foreach ($p in $Paragraphs) {
        $esc = [System.Security.SecurityElement]::Escape($p)
        $docXml += "<w:p><w:r><w:t>$esc</w:t></w:r></w:p>"
    }
    $docXml += "<w:tbl>"
    foreach ($r in $Rows) {
        $docXml += "<w:tr>"
        foreach ($cell in $r) {
            $escC = [System.Security.SecurityElement]::Escape($cell)
            $docXml += "<w:tc><w:p><w:r><w:t>$escC</w:t></w:r></w:p></w:tc>"
        }
        $docXml += "</w:tr>"
    }
    $docXml += "</w:tbl></w:body></w:document>"

    $docEntry = $zip.CreateEntry("word/document.xml")
    $swDoc = New-Object System.IO.StreamWriter($docEntry.Open(), [System.Text.Encoding]::UTF8)
    $swDoc.Write($docXml)
    $swDoc.Close()
    $zip.Dispose()
    return [Convert]::ToBase64String($ms.ToArray())
}

function New-SyntheticImageBase64([string[]]$Lines, [string]$Format) {
    $bmp = New-Object System.Drawing.Bitmap(1300, 420)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $font = New-Object System.Drawing.Font("Arial", 28, [System.Drawing.FontStyle]::Regular)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)
    $y = 40
    foreach ($l in $Lines) {
        $g.DrawString($l, $font, $brush, 40, $y)
        $y += 80
    }
    $g.Dispose(); $font.Dispose(); $brush.Dispose()
    $ms = New-Object System.IO.MemoryStream
    if ($Format -eq "JPEG") {
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    } else {
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    $bmp.Dispose()
    return [Convert]::ToBase64String($ms.ToArray())
}

Write-Host "=== GATE 5 VERIFICATION SUITE ($BaseUrl) ===" -ForegroundColor Cyan

# 0. Verificar regra 100% KOF (sem chamada Python no invoice.kf)
Assert-Check "Zero Python dependency in backend/invoice.kf" {
    $src = [IO.File]::ReadAllText((Join-Path $PSScriptRoot "..\backend\invoice.kf"))
    return (-not $src.Contains("parse_pdf.py")) -and (-not $src.Contains("parsePdfViaAgent"))
}

# 1. Autenticacao de dois usuarios isolados (A e B)
$suffix = [Guid]::NewGuid().ToString("N").Substring(0, 8)
$regA = Invoke-Http "POST" "/api/auth/register" "" (@{ firstName = "Luiza"; lastName = "GateA"; age = 27; email = "gate5a-$suffix@test.local"; password = "Str0ng#Password" } | ConvertTo-Json)
$tokenA = $regA.Body.Trim()
Invoke-Http "POST" "/api/users/onboarding" $tokenA (@{ salary = 2740.0; incomeType = "FIXED"; hasDebt = $false } | ConvertTo-Json) | Out-Null

$regB = Invoke-Http "POST" "/api/auth/register" "" (@{ firstName = "Carlos"; lastName = "GateB"; age = 31; email = "gate5b-$suffix@test.local"; password = "Str0ng#Password" } | ConvertTo-Json)
$tokenB = $regB.Body.Trim()
Invoke-Http "POST" "/api/users/onboarding" $tokenB (@{ salary = 4000.0; incomeType = "FIXED"; hasDebt = $false } | ConvertTo-Json) | Out-Null

Assert-Check "Auth required (401 without token on new routes)" {
    $r1 = Invoke-Http "POST" "/api/documents/upload" "" '{"fileBase64":"Zm9v"}'
    $r2 = Invoke-Http "POST" "/api/intents/dispatch" "" '{"intent":"CONSULTAR_GASTOS"}'
    return ($r1.Status -eq 401) -and ($r2.Status -eq 401)
}

# 2. Fixture PDF textual completo + reconciliacao + parcelas + PAYMENT + PIX PF + evidencias
$pdfLines = @(
    "Extrato de movimentacoes 01/11 a 14/11",
    "05/11 Uber *Trip 10,92",
    "06/11 G4 Bebidas 55,00",
    "07/11 Padaria Central 2/10 209,60",
    "08/11 Pagamento de fatura 841,70",
    "09/11 Pix enviado para Joao Silva 1.214,16",
    "10/11 Mercado Livre 247,72",
    "11/11 Viracrédito resgate 500,00",
    "Total da fatura 2.579,10"
)
$pdfB64 = New-SyntheticPdfBase64 $pdfLines
$uploadPdf = Invoke-Http "POST" "/api/documents/upload" $tokenA (@{ fileBase64 = $pdfB64; filename = "fatura-novembro.pdf"; rejectDuplicate = $true } | ConvertTo-Json)
$docA = $null

Assert-Check "Upload PDF textual (magic bytes, SHA-256, reconciliado, sem Viracredito, com evidencias)" {
    if ($uploadPdf.Status -ne 200) { return "status=$($uploadPdf.Status) body=$($uploadPdf.Body)" }
    $j = $uploadPdf.Body | ConvertFrom-Json
    $script:docA = $j.documentId
    $rev = $j.review
    if ($j.sourceType -ne "PDF_TEXT") { return "sourceType=$($j.sourceType)" }
    if ($j.status -ne "EM_REVISAO") { return "status=$($j.status)" }
    if ($rev.reconciled -ne $true) { return "reconciled=$($rev.reconciled) warnings=$($rev.warnings -join ',')" }
    if ($rev.extractedCount -ne 6) { return "extractedCount=$($rev.extractedCount)" }
    $padaria = $rev.transactions | Where-Object { $_.descriptionRaw -like "*Padaria*" }
    $pagto = $rev.transactions | Where-Object { $_.descriptionRaw -like "*Pagamento de fatura*" }
    $pixPf = $rev.transactions | Where-Object { $_.descriptionRaw -like "*Pix enviado*" }
    $missingEv = $rev.transactions | Where-Object { $null -eq $_.evidence.page -or $null -eq $_.evidence.row -or [string]::IsNullOrWhiteSpace($_.evidence.snippet) }
    return ($j.sha256.Length -eq 64) -and ($j.documentId.StartsWith("doc_")) -and ($padaria.installment -eq "2/10") -and ($pagto.kind -eq "PAYMENT") -and ($pagto.category -ne "HOUSING") -and ($pagto.reviewStatus -eq "NEEDS_REVIEW") -and ($pixPf.reviewStatus -eq "NEEDS_REVIEW") -and ($missingEv.Count -eq 0)
}

# 3. Duplicata detectada (409 DUPLICATE_DOCUMENT)
Assert-Check "Duplicate upload blocked with 409 DUPLICATE_DOCUMENT" {
    $dup = Invoke-Http "POST" "/api/documents/upload" $tokenA (@{ fileBase64 = $pdfB64; filename = "fatura-novembro.pdf"; rejectDuplicate = $true } | ConvertTo-Json)
    return ($dup.Status -eq 409) -and ($dup.Body.Contains("DUPLICATE_DOCUMENT"))
}

# 4. PDF /ToUnicode CMap
Assert-Check "PDF /ToUnicode CMap beginbfchar native decoding in KOF" {
    $cmapB64 = New-ToUnicodePdfBase64
    $res = Invoke-Http "POST" "/api/documents/upload" $tokenA (@{ fileBase64 = $cmapB64; filename = "tounicode.pdf" } | ConvertTo-Json)
    if ($res.Status -ne 200) { return "status=$($res.Status) body=$($res.Body)" }
    $j = $res.Body | ConvertFrom-Json
    $tx = $j.review.transactions[0]
    return ($j.review.extractedCount -eq 1) -and ($tx.descriptionRaw -eq "Uber") -and ($tx.amountMinor -eq 1500) -and ($tx.category -eq "TRANSPORT")
}

# 5. PDF escaneado sem texto -> nao alucina lancamentos
Assert-Check "Scanned PDF returns PDF_SCANNED without hallucinated transactions" {
    $scanB64 = New-SyntheticPdfBase64 @()
    $res = Invoke-Http "POST" "/api/documents/upload" $tokenA (@{ fileBase64 = $scanB64; filename = "scan.pdf" } | ConvertTo-Json)
    if ($res.Status -ne 200) { return "status=$($res.Status)" }
    $j = $res.Body | ConvertFrom-Json
    return ($j.sourceType -eq "PDF_SCANNED") -and ($j.review.extractedCount -eq 0) -and ($j.review.transactions.Count -eq 0)
}

# 6. Falha de reconciliacao detectada
Assert-Check "Reconciliation mismatch sets reconciled=false and RECONCILIATION_FAILED warning" {
    $badTotB64 = New-SyntheticPdfBase64 @("10/11 Uber Viagem 50,00", "11/11 Padaria 50,00", "Total da fatura 999,99")
    $res = Invoke-Http "POST" "/api/documents/upload" $tokenA (@{ fileBase64 = $badTotB64; filename = "diverge.pdf" } | ConvertTo-Json)
    $j = $res.Body | ConvertFrom-Json
    return ($res.Status -eq 200) -and ($j.review.reconciled -eq $false) -and (($j.review.warnings -join "|").Contains("RECONCILIATION_FAILED"))
}

# 7. DOCX real com tabela e paragrafos (ZipInputStream 100% KOF)
Assert-Check "DOCX with XML tables and paragraphs extracted 100% in KOF" {
    $docxB64 = New-SyntheticDocxBase64 @(
        @("04/11", "Supermercado Sendas", "89,50"),
        @("05/11", "Farmacia Drogasil", "34,20")
    ) @("Extrato DOCX Novembro", "Total da fatura 123,70")
    $res = Invoke-Http "POST" "/api/documents/upload" $tokenA (@{ fileBase64 = $docxB64; filename = "fatura.docx" } | ConvertTo-Json)
    if ($res.Status -ne 200) { return "status=$($res.Status) body=$($res.Body)" }
    $j = $res.Body | ConvertFrom-Json
    return ($j.sourceType -eq "DOCX") -and ($j.review.extractedCount -eq 2) -and ($j.review.reconciled -eq $true)
}

# 8. PNG real via OCR nativo acionado pelo KOF
Assert-Check "PNG real extracted via Windows OCR invoked from KOF" {
    $pngB64 = New-SyntheticImageBase64 @("10/11 Uber Viagem 25,50", "11/11 Drogaria Raia 42,00", "Total da fatura 67,50") "PNG"
    $res = Invoke-Http "POST" "/api/documents/upload" $tokenA (@{ fileBase64 = $pngB64; filename = "recibo.png" } | ConvertTo-Json)
    if ($res.Status -ne 200) { return "status=$($res.Status) body=$($res.Body)" }
    $j = $res.Body | ConvertFrom-Json
    return ($j.sourceType -eq "IMAGE_PNG") -and ($j.review.extractedCount -ge 1)
}

# 9. JPEG real via OCR nativo acionado pelo KOF
Assert-Check "JPEG real extracted via Windows OCR invoked from KOF" {
    $jpgB64 = New-SyntheticImageBase64 @("12/11 Supermercado Sendas 120,00") "JPEG"
    $res = Invoke-Http "POST" "/api/documents/upload" $tokenA (@{ fileBase64 = $jpgB64; filename = "nota.jpg" } | ConvertTo-Json)
    if ($res.Status -ne 200) { return "status=$($res.Status) body=$($res.Body)" }
    $j = $res.Body | ConvertFrom-Json
    return ($j.sourceType -eq "IMAGE_JPEG") -and ($j.review.extractedCount -ge 1)
}

# 10. Testes de Seguranca (Magic Bytes Mismatch, Extensao Proibida, Path Traversal, PDF Corrompido, IDOR)
Assert-Check "Fake .pdf (plain text bytes) rejected with 400 INVALID_FILE" {
    $fakeB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("Not a real PDF at all"))
    $res = Invoke-Http "POST" "/api/documents/upload" $tokenA (@{ fileBase64 = $fakeB64; filename = "falso.pdf" } | ConvertTo-Json)
    return ($res.Status -eq 400) -and ($res.Body.Contains("INVALID_FILE"))
}

Assert-Check "PNG bytes renamed as .pdf rejected with 400 INVALID_FILE" {
    $pngB64 = New-SyntheticImageBase64 @("Teste") "PNG"
    $res = Invoke-Http "POST" "/api/documents/upload" $tokenA (@{ fileBase64 = $pngB64; filename = "camuflado.pdf" } | ConvertTo-Json)
    return ($res.Status -eq 400) -and ($res.Body.Contains("INVALID_FILE"))
}

Assert-Check "Unsupported extension .exe rejected with 400 UNSUPPORTED_FORMAT" {
    $res = Invoke-Http "POST" "/api/documents/upload" $tokenA (@{ fileBase64 = "TVqQAA=="; filename = "payload.exe" } | ConvertTo-Json)
    return ($res.Status -eq 400) -and ($res.Body.Contains("UNSUPPORTED_FORMAT"))
}

Assert-Check "Path traversal filename rejected with 400 INVALID_FILE" {
    $res = Invoke-Http "POST" "/api/documents/upload" $tokenA (@{ fileBase64 = $pdfB64; filename = "../../etc/passwd.pdf" } | ConvertTo-Json)
    return ($res.Status -eq 400) -and ($res.Body.Contains("INVALID_FILE"))
}

Assert-Check "Corrupt /FlateDecode PDF rejected with 400 INVALID_FILE" {
    $badPdf = "%PDF-1.4`n1 0 obj << /Filter /FlateDecode >>`nstream`nCORRUPT_ZLIB_BYTES`nendstream`nendobj`n%%EOF"
    $badB64 = [Convert]::ToBase64String([System.Text.Encoding]::GetEncoding("ISO-8859-1").GetBytes($badPdf))
    $res = Invoke-Http "POST" "/api/documents/upload" $tokenA (@{ fileBase64 = $badB64; filename = "quebrado.pdf" } | ConvertTo-Json)
    return ($res.Status -eq 400) -and ($res.Body.Contains("INVALID_FILE"))
}

Assert-Check "Anti-IDOR: User B blocked (403 UNAUTHORIZED) from reading/confirming User A doc or spoofing userId" {
    $g1 = Invoke-Http "GET" "/api/documents/$($script:docA)/review" $tokenB
    $d1 = Invoke-Http "POST" "/api/intents/dispatch" $tokenB (@{ intent = "CONFIRMAR_IMPORTACAO"; parameters = @{ documentId = $script:docA } } | ConvertTo-Json)
    $d2 = Invoke-Http "POST" "/api/intents/dispatch" $tokenB (@{ intent = "CONSULTAR_GASTOS"; userId = "1"; parameters = @{ period = "2026-11" } } | ConvertTo-Json)
    return ($g1.Status -eq 403) -and ($d1.Status -eq 403) -and ($d2.Status -eq 403)
}

# 11. Testes das 5 Intencoes (/api/intents/dispatch) + Idempotencia de Confirmacao Dupla
Assert-Check "Intent 1 (IMPORTAR_DOCUMENTO_FINANCEIRO) returns preview with requiresConfirmation=true" {
    $r = Invoke-Http "POST" "/api/intents/dispatch" $tokenA (@{ intent = "IMPORTAR_DOCUMENTO_FINANCEIRO"; attachmentIds = @($script:docA) } | ConvertTo-Json)
    $j = $r.Body | ConvertFrom-Json
    return ($r.Status -eq 200) -and ($j.requiresConfirmation -eq $true) -and ($j.status -eq "EM_REVISAO")
}

Assert-Check "Intent 2 (ANALISAR_FATURA) separates confirmed merchants, payments (84170) and Pix PF (121416)" {
    $r = Invoke-Http "POST" "/api/intents/dispatch" $tokenA (@{ intent = "ANALISAR_FATURA"; parameters = @{ documentId = $script:docA } } | ConvertTo-Json)
    $j = $r.Body | ConvertFrom-Json
    $a = $j.dataJson | ConvertFrom-Json
    return ($r.Status -eq 200) -and ($a.totalMinor -eq 257910) -and ($a.paymentMinor -eq 84170) -and ($a.pixPfMinor -eq 121416) -and ($a.reconciled -eq $true)
}

Assert-Check "Intent 3 (CONFIRMAR_IMPORTACAO) is atomic and 100% idempotent when called twice" {
    $c1 = Invoke-Http "POST" "/api/intents/dispatch" $tokenA (@{ intent = "CONFIRMAR_IMPORTACAO"; parameters = @{ documentId = $script:docA } } | ConvertTo-Json)
    $c2 = Invoke-Http "POST" "/api/intents/dispatch" $tokenA (@{ intent = "CONFIRMAR_IMPORTACAO"; parameters = @{ documentId = $script:docA } } | ConvertTo-Json)
    $txs = (Invoke-Http "GET" "/api/transactions" $tokenA).Body | ConvertFrom-Json
    $withProv = @($txs | Where-Object { $_.documentId -eq $script:docA -and $null -ne $_.sourcePage -and $null -ne $_.sourceLine -and -not [string]::IsNullOrWhiteSpace($_.externalRef) }).Count
    return ($c1.Status -eq 200) -and ($c2.Status -eq 200) -and ($txs.Count -eq 4) -and ($withProv -eq 4)
}

Assert-Check "Intent 4 (CONSULTAR_GASTOS) returns exact minor cents (20960) for FOOD in 2026-11" {
    $r = Invoke-Http "POST" "/api/intents/dispatch" $tokenA (@{ intent = "CONSULTAR_GASTOS"; parameters = @{ period = "2026-11"; category = "FOOD" } } | ConvertTo-Json)
    $j = $r.Body | ConvertFrom-Json
    $q = $j.dataJson | ConvertFrom-Json
    return ($r.Status -eq 200) -and ($q.count -eq 1) -and ($q.totalMinor -eq 20960)
}

Assert-Check "Intent 5 (SIMULAR_ECONOMIA) computes deterministic budget buckets and daily pulse" {
    $r = Invoke-Http "POST" "/api/intents/dispatch" $tokenA (@{ intent = "SIMULAR_ECONOMIA" } | ConvertTo-Json)
    $j = $r.Body | ConvertFrom-Json
    $s = $j.dataJson | ConvertFrom-Json
    return ($r.Status -eq 200) -and ($s.salary -eq 2740.0) -and ($s.buckets.Count -ge 3)
}

# 12. GATE 4: Consulta por linguagem natural / voz no Chat (zero alucinacao, sem emojis)
Assert-Check "GATE 4 Natural language query in Chat answers with confirmed DB total (R$ 209,60)" {
    $chat = Invoke-Http "POST" "/api/chat/message" $tokenA (@{ message = "Quanto gastei em delivery em novembro?" } | ConvertTo-Json)
    $j = $chat.Body | ConvertFrom-Json
    return ($chat.Status -eq 200) -and ($j.reply.Contains("209,60")) -and (-not $j.reply.Contains("📄")) -and (-not $j.reply.Contains("JSON"))
}

# 13. Natureza de fluxo sem dupla contagem: receita PJ, despesa, Viracredito ida e volta, Pix via cartao,
#     pagamento de fatura e linha ambigua (fixture sintetica). Totais em centavos vindos do backend.
$flowLines = @(
    "Extrato sintetico 01/11 a 14/11",
    "02/11 Pix recebido Acme Tecnologia Ltda 3.000,00",
    "03/11 Supermercado Sendas 150,00",
    "04/11 Viracredito aplicacao 200,00",
    "05/11 Viracredito resgate 200,00",
    "06/11 Credito para Pix via cartao de credito 80,00",
    "06/11 Pix credito Maria Souza 80,00",
    "07/11 Pagamento de fatura 500,00",
    "08/11 Fulano Beltrano 45,00"
)
$flowB64 = New-SyntheticPdfBase64 $flowLines
$flowRes = Invoke-Http "POST" "/api/invoices/parse" $tokenB (@{ fileBase64 = $flowB64; filename = "fluxo-sintetico.pdf" } | ConvertTo-Json)
$script:flowDoc = ""

Assert-Check "Flow summary: count, separated totals (cents), no double count, ambiguous line pending" {
    if ($flowRes.Status -ne 200) { return "status=$($flowRes.Status) body=$($flowRes.Body)" }
    $j = $flowRes.Body | ConvertFrom-Json
    $script:flowDoc = $j.documentId
    $s = $j.summary
    if ($null -eq $s) { return "summary ausente" }
    $amb = $s.lines | Where-Object { $_.snippet -like "*Fulano*" }
    $noEv = $s.lines | Where-Object { $null -eq $_.page -or $null -eq $_.row -or [string]::IsNullOrWhiteSpace($_.snippet) }
    $ok = ($s.extractedCount -eq 5) -and ($s.incomeMinor -eq 300000) -and ($s.incomeCount -eq 1) -and
        ($s.expenseMinor -eq 15000) -and ($s.expenseCount -eq 1) -and
        ($s.creditOperationMinor -eq 8000) -and ($s.creditOperationCount -eq 1) -and
        ($s.billPaymentMinor -eq 50000) -and ($s.billPaymentCount -eq 1) -and
        ($s.pendingMinor -eq 4500) -and ($s.pendingCount -eq 1) -and
        ($s.internalTransferCount -eq 3) -and ($s.internalTransferMinor -eq 48000) -and
        ($amb.flowClass -eq "PENDENTE_REVISAO") -and ($noEv.Count -eq 0)
    if (-not $ok) { return ($s | ConvertTo-Json -Depth 4 -Compress) }
    return $true
}

Assert-Check "Chat with documentId answers via ANALISAR_FATURA, cites the document and never asks to retype" {
    $c = Invoke-Http "POST" "/api/chat/message" $tokenB (@{ message = "Fatura fluxo-sintetico.pdf enviada: 5 registros extraidos. Analise o documento."; documentId = $script:flowDoc } | ConvertTo-Json)
    if ($c.Status -ne 200) { return "status=$($c.Status) body=$($c.Body)" }
    $r = ($c.Body | ConvertFrom-Json).reply
    $ok = $r.Contains($script:flowDoc) -and $r.Contains("R$ 3.000,00") -and $r.Contains("R$ 150,00") -and $r.Contains("Pendentes de revisao") -and
        (-not $r.ToLower().Contains("digite")) -and (-not $r.ToLower().Contains("informe os gastos"))
    if (-not $ok) { return $r }
    return $true
}

Assert-Check "Chat about 'fatura' without documentId uses the latest EM_REVISAO document" {
    $c = Invoke-Http "POST" "/api/chat/message" $tokenB (@{ message = "O que tem na minha fatura?" } | ConvertTo-Json)
    if ($c.Status -ne 200) { return "status=$($c.Status)" }
    return (($c.Body | ConvertFrom-Json).reply).Contains($script:flowDoc)
}

Assert-Check "Anti-IDOR in chat: documentId of another user is refused" {
    $c = Invoke-Http "POST" "/api/chat/message" $tokenA (@{ message = "Analise"; documentId = $script:flowDoc } | ConvertTo-Json)
    $r = ($c.Body | ConvertFrom-Json).reply
    return ($c.Status -eq 200) -and $r.Contains("Acesso negado") -and (-not $r.Contains("3.000,00"))
}

if ($LlmBaseUrl -ne "") {
    $mainBase = $BaseUrl
    $BaseUrl = $LlmBaseUrl
    $regL = Invoke-Http "POST" "/api/auth/register" "" (@{ firstName = "Lia"; lastName = "GateL"; age = 30; email = "gate5l-$suffix@test.local"; password = "Str0ng#Password" } | ConvertTo-Json)
    $tokenL = $regL.Body.Trim()
    Invoke-Http "POST" "/api/users/onboarding" $tokenL (@{ salary = 3000.0; incomeType = "FIXED"; hasDebt = $false } | ConvertTo-Json) | Out-Null
    Assert-Check "LLM server: a generic chat goes to the (unreachable) LLM and fails with 503" {
        $c = Invoke-Http "POST" "/api/chat/message" $tokenL (@{ message = "Oi, tudo bem?" } | ConvertTo-Json)
        return ($c.Status -eq 503)
    }
    Assert-Check "LLM server: invoice chat with documentId is answered deterministically (200, LLM branch not used)" {
        $p = Invoke-Http "POST" "/api/invoices/parse" $tokenL (@{ fileBase64 = $flowB64; filename = "fluxo-sintetico.pdf" } | ConvertTo-Json)
        $doc = ($p.Body | ConvertFrom-Json).documentId
        $c = Invoke-Http "POST" "/api/chat/message" $tokenL (@{ message = "Fatura enviada"; documentId = $doc } | ConvertTo-Json)
        if ($c.Status -ne 200) { return "status=$($c.Status) body=$($c.Body)" }
        $r = ($c.Body | ConvertFrom-Json).reply
        return $r.Contains($doc) -and $r.Contains("R$ 3.000,00")
    }
    $BaseUrl = $mainBase
}

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host ("GATE 5 RESULT: {0} passed, {1} failed" -f $script:passed, $script:failed) -ForegroundColor $(if ($script:failed -eq 0) { "Green" } else { "Red" })
if ($script:failed -gt 0) { exit 1 } else { exit 0 }
