# scripts/run_parity_tests.ps1
# Execução da Suíte de Paridade KOF vs Java Legado

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$kofPath = "C:\Users\luiza\OneDrive\Documentos\kof\Kof4j"
$javaExe = "C:\Program Files\Eclipse Adoptium\jdk-25.0.3.9-hotspot\bin\java.exe"

$asm = "C:\Users\luiza\.m2\repository\org\ow2\asm\asm\9.10.1\asm-9.10.1.jar;C:\Users\luiza\.m2\repository\org\ow2\asm\asm-tree\9.10.1\asm-tree-9.10.1.jar;C:\Users\luiza\.m2\repository\org\ow2\asm\asm-commons\9.9.1\asm-commons-9.9.1.jar;C:\Users\luiza\.m2\repository\org\ow2\asm\asm-analysis\9.10.1\asm-analysis-9.10.1.jar;C:\Users\luiza\.m2\repository\org\ow2\asm\asm-util\9.10.1\asm-util-9.10.1.jar"
$cp = "$kofPath\kof-cli\target\classes;$kofPath\kof-compiler\target\classes;$kofPath\kof-runtime\target\classes;$asm"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   ORGANIZA IA -- SUÍTE DE TESTES DE PARIDADE KOF        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "`nExecutando kof test tests/parity_test.kf..." -ForegroundColor Yellow
& $javaExe -cp $cp dev.kof.cli.Main test tests/parity_test.kf

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[SUCESSO] Todos os testes de paridade passaram com 100% de equivalência!" -ForegroundColor Green
} else {
    Write-Host "`n[FALHA] Testes de paridade falharam (Código: $LASTEXITCODE)" -ForegroundColor Red
}
exit $LASTEXITCODE
