param(
    [string]$WebDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "build\web")
)

$ErrorActionPreference = "Stop"

$indexPath = Join-Path $WebDir "index.html"
$modulePath = Join-Path $WebDir "Default.mjs"
if (-not (Test-Path -LiteralPath $indexPath) -or -not (Test-Path -LiteralPath $modulePath)) {
    throw "Frontend compilado não encontrado em '$WebDir'. Rode 'kof build frontend --target js' primeiro."
}

# O compilador copia assets declarados por widgets KOF, mas não módulos JS
# auxiliares. A ponte Web Speech é estática e precisa seguir com o bundle.
$voiceBridgeSource = Join-Path (Split-Path -Parent $PSScriptRoot) "frontend\assets\voice_bridge.js"
$voiceBridgeTarget = Join-Path $WebDir "assets\voice_bridge.js"
if (-not (Test-Path -LiteralPath $voiceBridgeSource)) {
    throw "Ponte de voz ausente: '$voiceBridgeSource'."
}
New-Item -ItemType Directory -Path (Split-Path -Parent $voiceBridgeTarget) -Force | Out-Null
Copy-Item -LiteralPath $voiceBridgeSource -Destination $voiceBridgeTarget -Force

$index = [IO.File]::ReadAllText($indexPath)
$module = [IO.File]::ReadAllText($modulePath)
$version = [IO.File]::GetLastWriteTimeUtc($modulePath).Ticks
$index = $index.Replace('src="Default.mjs"', "src=`"Default.mjs?v=$version`"")
$voiceBridge = '<script src="assets/voice_bridge.js"></script>'
if (-not $index.Contains($voiceBridge)) {
    $index = $index.Replace('</body>', "  $voiceBridge`r`n</body>")
}
[IO.File]::WriteAllText($indexPath, $index, [Text.UTF8Encoding]::new($false))
$startup = '(core_AppState.currentScreen = "welcome");' + "`n" + '    applyViewport(window);'
if (-not $module.Contains($startup)) {
    throw "Bundle sem o ponto de entrada esperado; não gerei as rotas de QA."
}

$utf8NoBom = [Text.UTF8Encoding]::new($false)
$routes = @(
    @{ Path = "login"; Screen = "login" },
    @{ Path = "cadastro"; Screen = "signup" },
    @{ Path = "onboarding"; Screen = "onb_salary" }
)

foreach ($route in $routes) {
    $bundleName = "Default-qa-$($route.Path).mjs"
    $replacement = '(core_AppState.currentScreen = "' + $route.Screen + '");' + "`n" + '    applyViewport(window);'
    $routeModule = $module.Replace($startup, $replacement)
    [IO.File]::WriteAllText((Join-Path $WebDir $bundleName), $routeModule, $utf8NoBom)

    $routeDir = Join-Path $WebDir $route.Path
    New-Item -ItemType Directory -Path $routeDir -Force | Out-Null
    $routeIndex = $index.Replace("<head>", "<head>`r`n  <base href=`"/`">")
    $routeIndex = $routeIndex.Replace("src=`"Default.mjs?v=$version`"", "src=`"/$bundleName?v=$version`"")
    [IO.File]::WriteAllText((Join-Path $routeDir "index.html"), $routeIndex, $utf8NoBom)
}

Write-Output "Rotas de QA prontas: /login, /cadastro e /onboarding (salário)."
