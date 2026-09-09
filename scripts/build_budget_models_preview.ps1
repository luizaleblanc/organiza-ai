$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$sourceDir = Join-Path $projectRoot 'build/budget-models-source'
$outputDir = Join-Path $projectRoot 'build/budget-models-preview'
New-Item -ItemType Directory -Force -Path "$sourceDir/screens/budget_models" | Out-Null
Copy-Item -LiteralPath "$projectRoot/previews/budget_models/main.kf" -Destination "$sourceDir/main.kf"
Copy-Item -LiteralPath "$projectRoot/frontend/screens/budget_models/screen.kf" -Destination "$sourceDir/screens/budget_models/screen.kf"
& kof version
& kof build $sourceDir --target js --output $outputDir
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar a previa KofJS.' }
Copy-Item -LiteralPath "$projectRoot/frontend/screens/budget_models/style.css" -Destination "$outputDir/budget-models.css"
Copy-Item -LiteralPath "$projectRoot/frontend/screens/budget_models/waves.svg" -Destination "$outputDir/waves.svg"
$htmlPath = Join-Path $outputDir 'index.html'
$html = Get-Content -LiteralPath $htmlPath -Raw -Encoding UTF8
$html = $html.Replace('</head>', '<link rel="stylesheet" href="budget-models.css"></head>')
$html = $html.Replace('<html lang="en">', '<html lang="pt-BR">')
$html = $html -replace '<title>[^<]*</title>', '<title>Organiza IA - Modelos de or&#231;amento</title>'
$html = $html.Replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">')
[System.IO.File]::WriteAllText($htmlPath, $html, [System.Text.UTF8Encoding]::new($false))
Write-Output "Previa compilada em $outputDir"
