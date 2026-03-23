Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$runtimeDir = Join-Path $repoRoot "web\\score-parser-runtime"
$runtimeSourceDir = Join-Path $runtimeDir "src"
$outRootDir = Join-Path $repoRoot "site\\score-parser"
$currentOutDir = Join-Path $outRootDir "current"
$packageJsonPath = Join-Path $runtimeDir "package.json"

function Get-ParserVersion {
    $packageJson = Get-Content -Raw $packageJsonPath | ConvertFrom-Json
    if ($null -eq $packageJson.version -or [string]::IsNullOrWhiteSpace([string]$packageJson.version)) {
        throw "score-parser-runtime のバージョン取得に失敗しました: $packageJsonPath"
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
$tokenReplacements = @{
    "__PARSER_VERSION__" = "current"
}
$manifestPath = Join-Path $currentOutDir "manifest.json"

New-Item -ItemType Directory -Force $outRootDir | Out-Null
if (Test-Path $currentOutDir) {
    Remove-Item -Recurse -Force $currentOutDir
}
New-Item -ItemType Directory -Force $currentOutDir | Out-Null

Copy-TreeWithTokenReplacement -SourceDir $runtimeSourceDir -DestinationDir $currentOutDir -TokenReplacements $tokenReplacements

[ordered]@{
    version = "current"
    sourceVersion = $parserVersion
    moduleUrl = "/score-parser/current/score_loader.js"
} | ConvertTo-Json | Set-Content $manifestPath -Encoding utf8

Write-Host "score-parser current を同期しました: $currentOutDir (source version: $parserVersion)"
