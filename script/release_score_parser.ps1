param(
    [Parameter(Mandatory = $true)]
    [string]$ParserVersion,
    [Parameter(Mandatory = $true)]
    [string]$UserscriptVersion
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$runtimeDir = Join-Path $repoRoot "web\\score-parser-runtime"
$runtimeSourceDir = Join-Path $runtimeDir "src"
$packageJsonPath = Join-Path $runtimeDir "package.json"
$scoreParserRootDir = Join-Path $repoRoot "site\\score-parser"
$versionOutDir = Join-Path $scoreParserRootDir ("v{0}" -f $ParserVersion)
$userscriptMainPath = Join-Path $repoRoot "tampermonkey\\src\\main.js"
$userscriptHeaderPath = Join-Path $repoRoot "tampermonkey\\src\\userscript-header.txt"
$syncCurrentScriptPath = Join-Path $repoRoot "script\\sync_score_parser_current.ps1"

function Assert-VersionString {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Version,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if ($Version -notmatch '^\d+\.\d+\.\d+$') {
        throw "$Name の形式が不正です: $Version"
    }
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

function Update-FileContent {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Transform
    )

    $before = Get-Content -Raw $Path
    $after = & $Transform $before
    if ($after -eq $before) {
        return
    }
    Set-Content -Path $Path -Value $after -Encoding utf8
}

function Replace-FirstRegexMatch {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Content,
        [Parameter(Mandatory = $true)]
        [string]$Pattern,
        [Parameter(Mandatory = $true)]
        [string]$Replacement
    )

    $match = [regex]::Match($Content, $Pattern, [System.Text.RegularExpressions.RegexOptions]::Multiline)
    if (-not $match.Success) {
        return $Content
    }

    return $Content.Substring(0, $match.Index) + $Replacement + $Content.Substring($match.Index + $match.Length)
}

Assert-VersionString -Version $ParserVersion -Name "parserVersion"
Assert-VersionString -Version $UserscriptVersion -Name "userscriptVersion"

if (Test-Path $versionOutDir) {
    throw "既に同じ固定版が存在します: $versionOutDir"
}

Update-FileContent -Path $packageJsonPath -Transform {
    param($content)
    return [regex]::Replace(
        $content,
        '"version"\s*:\s*"[^"]+"',
        ('"version": "{0}"' -f $ParserVersion),
        1
    )
}

New-Item -ItemType Directory -Force $scoreParserRootDir | Out-Null
New-Item -ItemType Directory -Force $versionOutDir | Out-Null

Copy-TreeWithTokenReplacement `
    -SourceDir $runtimeSourceDir `
    -DestinationDir $versionOutDir `
    -TokenReplacements @{ "__PARSER_VERSION__" = $ParserVersion }

[ordered]@{
    version = $ParserVersion
    sourceVersion = $ParserVersion
    moduleUrl = "/score-parser/v$ParserVersion/score_loader.js"
} | ConvertTo-Json | Set-Content (Join-Path $versionOutDir "manifest.json") -Encoding utf8

Update-FileContent -Path $userscriptHeaderPath -Transform {
    param($content)
    return [regex]::Replace(
        $content,
        '(?m)^// @version\s+\S+$',
        ('// @version      {0}' -f $UserscriptVersion),
        1
    )
}

Update-FileContent -Path $userscriptMainPath -Transform {
    param($content)
    $updated = Replace-FirstRegexMatch `
        -Content $content `
        -Pattern '^// \d+\.\d+\.\d+ .*$' `
        -Replacement ('// {0} score-parser v{1} をリリース' -f $UserscriptVersion, $ParserVersion)
    $updated = [regex]::Replace(
        $updated,
        '(?m)^  const SCORE_PARSER_VERSION = "[^"]+";$',
        ('  const SCORE_PARSER_VERSION = "{0}";' -f $ParserVersion),
        1
    )
    $updated = [regex]::Replace(
        $updated,
        '(?m)^  const SCRIPT_VERSION_FALLBACK = "[^"]+";$',
        ('  const SCRIPT_VERSION_FALLBACK = "{0}";' -f $UserscriptVersion),
        1
    )
    return $updated
}

& $syncCurrentScriptPath

Push-Location $repoRoot
try {
    npm run build:userscript
}
finally {
    Pop-Location
}

Write-Host "score-parser 固定版をリリースしました: v$ParserVersion / userscript $UserscriptVersion"
