# scripts/validate_architecture.ps1
# Validação da Arquitetura KofLith do Organiza IA

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   ORGANIZA IA -- VALIDAÇÃO DE ARQUITETURA KOFLITH        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$kofPath = "C:\Users\luiza\OneDrive\Documentos\kof\Kof4j"
$javaExe = "C:\Program Files\Eclipse Adoptium\jdk-25.0.3.9-hotspot\bin\java.exe"

if (!(Test-Path $javaExe)) {
    Write-Host "[ERRO] JDK 25 não encontrado em $javaExe" -ForegroundColor Red
    exit 1
}

$asm = "C:\Users\luiza\.m2\repository\org\ow2\asm\asm\9.10.1\asm-9.10.1.jar;C:\Users\luiza\.m2\repository\org\ow2\asm\asm-tree\9.10.1\asm-tree-9.10.1.jar;C:\Users\luiza\.m2\repository\org\ow2\asm\asm-commons\9.9.1\asm-commons-9.9.1.jar;C:\Users\luiza\.m2\repository\org\ow2\asm\asm-analysis\9.10.1\asm-analysis-9.10.1.jar;C:\Users\luiza\.m2\repository\org\ow2\asm\asm-util\9.10.1\asm-util-9.10.1.jar"
$cp = "$kofPath\kof-cli\target\classes;$kofPath\kof-compiler\target\classes;$kofPath\kof-runtime\target\classes;$asm"

Write-Host "`n1. Verificando Módulos de Domínio (backend/*.kf)..." -ForegroundColor Yellow
$backendCheck = & $javaExe -cp $cp dev.kof.cli.Main check backend
if ($LASTEXITCODE -eq 0) {
    Write-Host "   [OK] backend/*.kf (models, services, coach, main): 0 erros de compilação!" -ForegroundColor Green
} else {
    Write-Host "   [FALHA] backend/*.kf falhou no typecheck" -ForegroundColor Red
    Write-Host $backendCheck
    exit 1
}

Write-Host "`n2. Verificando Gateway Web e Autenticação (bff/*.kf)..." -ForegroundColor Yellow
$bffCheck = & $javaExe -cp $cp dev.kof.cli.Main check bff
if ($LASTEXITCODE -eq 0) {
    Write-Host "   [OK] bff/*.kf (main, auth): 0 erros de compilação!" -ForegroundColor Green
} else {
    Write-Host "   [FALHA] bff/*.kf falhou no typecheck" -ForegroundColor Red
    exit 1
}

Write-Host "`n3. Compilando Bytecode JVM Nativo (kof build backend)..." -ForegroundColor Yellow
& $javaExe -cp $cp dev.kof.cli.Main build backend --target jvm
if ($LASTEXITCODE -eq 0) {
    Write-Host "   [OK] Bytecode JVM gerado com sucesso pelo Kof Compiler!" -ForegroundColor Green
} else {
    Write-Host "   [FALHA] Geração de bytecode JVM falhou" -ForegroundColor Red
    exit 1
}

Write-Host "`n4. Testando Inicialização Nativa e Endpoint /health (porta 3000)..." -ForegroundColor Yellow
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $javaExe
$psi.Arguments = "-cp build/classes Default.Main"
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$serverProc = [System.Diagnostics.Process]::Start($psi)
Start-Sleep -Seconds 2
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get -TimeoutSec 3
    if ($health -eq "OK") {
        Write-Host "   [OK] Servidor KofLith subiu nativamente na JVM e respondeu OK em /health!" -ForegroundColor Green
    } else {
        Write-Host "   [FALHA] Resposta inesperada do servidor: $health" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   [FALHA] Servidor KofLith não respondeu na porta 3000: $_" -ForegroundColor Red
    exit 1
} finally {
    if (!$serverProc.HasExited) {
        $serverProc.Kill()
        $serverProc.WaitForExit()
    }
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "   PARABÉNS! A ARQUITETURA KOFLITH ESTÁ 100% OPERACIONAL! " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

