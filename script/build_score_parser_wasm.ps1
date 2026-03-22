Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$crateDir = Join-Path $repoRoot "web\\score-parser-wasm"
$outDir = Join-Path $repoRoot "site\\wasm\\score-parser"
$targetDir = Join-Path $crateDir "target\\wasm32-unknown-unknown\\release"
$wasmName = "score_parser_wasm"
$wasmPath = Join-Path $targetDir "$wasmName.wasm"

Push-Location $crateDir
try {
    cargo build --release --target wasm32-unknown-unknown
    New-Item -ItemType Directory -Force $outDir | Out-Null
    wasm-bindgen `
        --target web `
        --out-dir $outDir `
        --out-name $wasmName `
        $wasmPath
}
finally {
    Pop-Location
}
