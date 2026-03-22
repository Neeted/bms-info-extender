Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$crateDir = Join-Path $repoRoot "web\\score-parser-wasm"
$outRootDir = Join-Path $repoRoot "site\\wasm\\score-parser"
$targetDir = Join-Path $crateDir "target\\wasm32-unknown-unknown\\release"
$wasmName = "score_parser_wasm"
$wasmPath = Join-Path $targetDir "$wasmName.wasm"
$crateName = "score-parser-wasm"

function Get-CrateVersion {
    $metadata = cargo metadata --no-deps --format-version 1 | ConvertFrom-Json
    $package = $metadata.packages | Where-Object { $_.name -eq $crateName } | Select-Object -First 1
    if ($null -eq $package) {
        throw "Failed to find crate metadata for $crateName."
    }
    return [string]$package.version
}

Push-Location $crateDir
try {
    $wasmVersion = Get-CrateVersion
    $versionDirName = "v$wasmVersion"
    $versionOutDir = Join-Path $outRootDir $versionDirName
    $versionManifestPath = Join-Path $versionOutDir "manifest.json"
    $moduleUrl = "/wasm/score-parser/$versionDirName/$wasmName.js"

    cargo build --release --target wasm32-unknown-unknown

    New-Item -ItemType Directory -Force $outRootDir | Out-Null
    New-Item -ItemType Directory -Force $versionOutDir | Out-Null

    foreach ($rootGeneratedFile in @(
        "$wasmName.js",
        "$wasmName.d.ts",
        "${wasmName}_bg.wasm",
        "${wasmName}_bg.wasm.d.ts",
        "manifest.json"
    )) {
        $rootGeneratedPath = Join-Path $outRootDir $rootGeneratedFile
        if (Test-Path $rootGeneratedPath) {
            Remove-Item $rootGeneratedPath -Force
        }
    }

    wasm-bindgen `
        --target web `
        --out-dir $versionOutDir `
        --out-name $wasmName `
        $wasmPath

    [ordered]@{
        version = $wasmVersion
        moduleUrl = $moduleUrl
    } | ConvertTo-Json | Set-Content $versionManifestPath -Encoding utf8

    Write-Host "Generated score parser wasm $wasmVersion at $versionOutDir"
}
finally {
    Pop-Location
}
