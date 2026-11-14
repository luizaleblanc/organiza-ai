param(
    [string]$WebDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "build\web")
)

$ErrorActionPreference = "Stop"

$indexPath = Join-Path $WebDir "index.html"
$modulePath = Join-Path $WebDir "Default.mjs"
if (-not (Test-Path -LiteralPath $indexPath) -or -not (Test-Path -LiteralPath $modulePath)) {
    throw "Frontend compilado não encontrado em '$WebDir'. Rode 'kof build frontend --target js' primeiro."
}

$index = [IO.File]::ReadAllText($indexPath)
$module = [IO.File]::ReadAllText($modulePath)
$version = [IO.File]::GetLastWriteTimeUtc($modulePath).Ticks
$index = $index.Replace('src="Default.mjs"', "src=`"Default.mjs?v=$version`"")
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
