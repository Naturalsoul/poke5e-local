param(
    [string]$SourceUrl = "https://play.pokemonshowdown.com/audio/cries/",
    [string]$Destination,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not $Destination) {
    $ProjectRoot = Split-Path -Parent $PSScriptRoot
    $Destination = Join-Path $ProjectRoot "assets\audio\cries"
}

Write-Host "=== Pokemon Showdown cries -> Poke5e Local ===" -ForegroundColor Cyan
Write-Host "Source:      $SourceUrl"
Write-Host "Destination: $Destination"

New-Item -ItemType Directory -Force -Path $Destination | Out-Null

Write-Host "Reading Pokemon Showdown index..." -ForegroundColor Yellow

$Response = Invoke-WebRequest `
    -Uri $SourceUrl `
    -UseBasicParsing

$Matches = [regex]::Matches(
    $Response.Content,
    'href="([^"]+\.mp3)"',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

$RelativeUrls = @(
    $Matches |
        ForEach-Object { $_.Groups[1].Value } |
        Sort-Object -Unique
)

if ($RelativeUrls.Count -eq 0) {
    throw "No MP3 cries were found at $SourceUrl"
}

$BaseUri = [System.Uri]$SourceUrl

$Downloaded = 0
$Skipped = 0

foreach ($RelativeUrl in $RelativeUrls) {

    $FileName = [System.IO.Path]::GetFileName(
        [System.Uri]::UnescapeDataString(
            $RelativeUrl
        )
    )

    if ([string]::IsNullOrWhiteSpace($FileName)) {
        continue
    }

    $OutputPath = Join-Path $Destination $FileName

    if (
        (Test-Path $OutputPath) -and
        -not $Force
    ) {
        $Skipped += 1

        continue
    }

    $FileUri = [System.Uri]::new(
        $BaseUri,
        $RelativeUrl
    )

    Write-Host "Downloading $FileName"

    Invoke-WebRequest `
        -Uri $FileUri.AbsoluteUri `
        -OutFile $OutputPath `
        -UseBasicParsing

    $Downloaded += 1
}

$Metadata = @"
Pokemon cries local source
Source: $SourceUrl
Downloaded: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz")
Format: MP3
Files found: $($RelativeUrls.Count)
Downloaded now: $Downloaded
Skipped existing: $Skipped

These files originate from Pokemon Showdown's public cry directory.
Review redistribution/licensing requirements before publishing them with the module.
"@

$Metadata |
    Set-Content `
        -Encoding UTF8 `
        (Join-Path $Destination "CRIES_SOURCE.txt")

Write-Host "Done." -ForegroundColor Green
Write-Host "Found:      $($RelativeUrls.Count)"
Write-Host "Downloaded: $Downloaded"
Write-Host "Skipped:    $Skipped"