Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$runtimeDir = Join-Path $repoRoot "web\\score-parser-runtime"
$runtimeSourceDir = Join-Path $runtimeDir "src"
$outRootDir = Join-Path $repoRoot "site\\wasm\\score-parser"
$packageJsonPath = Join-Path $runtimeDir "package.json"

function Get-ParserVersion {
    $packageJson = Get-Content -Raw $packageJsonPath | ConvertFrom-Json
    if ($null -eq $packageJson.version -or [string]::IsNullOrWhiteSpace([string]$packageJson.version)) {
        throw "Failed to read score parser runtime version from $packageJsonPath."
    }
    return [string]$packageJson.version
}

function Copy-TreeWithTokenReplacement {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourceDir,
        [Parameter(Mandatory = $true)]
        [string]$DestinationDir,
        [Parameter(Mandatory = $true)]
        [hashtable]$TokenReplacements
    )

    Get-ChildItem -Path $SourceDir -Recurse -File | ForEach-Object {
        $relativePath = [System.IO.Path]::GetRelativePath($SourceDir, $_.FullName)
        $destinationPath = Join-Path $DestinationDir $relativePath
        $destinationParent = Split-Path $destinationPath -Parent
        New-Item -ItemType Directory -Force $destinationParent | Out-Null

        $content = Get-Content -Raw $_.FullName
        foreach ($token in $TokenReplacements.Keys) {
            $content = $content.Replace($token, $TokenReplacements[$token])
        }
        Set-Content -Path $destinationPath -Value $content -Encoding utf8
    }
}

$parserVersion = Get-ParserVersion
$versionDirName = "v$parserVersion"
$versionOutDir = Join-Path $outRootDir $versionDirName
$manifestPath = Join-Path $versionOutDir "manifest.json"
$tokenReplacements = @{
    "__PARSER_VERSION__" = $parserVersion
}

New-Item -ItemType Directory -Force $outRootDir | Out-Null
if (Test-Path $versionOutDir) {
    Remove-Item -Recurse -Force $versionOutDir
}
New-Item -ItemType Directory -Force $versionOutDir | Out-Null

foreach ($legacyRootFile in @(
    "score_parser_wasm.js",
    "score_parser_wasm.d.ts",
    "score_parser_wasm_bg.wasm",
    "score_parser_wasm_bg.wasm.d.ts",
    "score_loader.js",
    "score_loader.d.ts",
    "manifest.json"
)) {
    $legacyPath = Join-Path $outRootDir $legacyRootFile
    if (Test-Path $legacyPath) {
        Remove-Item $legacyPath -Force
    }
}

Copy-TreeWithTokenReplacement -SourceDir $runtimeSourceDir -DestinationDir $versionOutDir -TokenReplacements $tokenReplacements

[ordered]@{
    version = $parserVersion
    moduleUrl = "/wasm/score-parser/$versionDirName/score_loader.js"
} | ConvertTo-Json | Set-Content $manifestPath -Encoding utf8

Write-Host "Generated score parser runtime $parserVersion at $versionOutDir"
