<#
    AI Account Switcher (Codex + Claude) - uninstaller

    One-line uninstall:
      irm https://raw.githubusercontent.com/karthiknl0/multi-account-connector/main/uninstall.ps1 | iex

    Removes the switch scripts, Desktop shortcuts, and the added functions from
    your PowerShell profiles. Does NOT uninstall the npm packages, your saved
    Codex accounts (~/.codex), or your saved Claude accounts (~/.claude-accounts).
    Remove those manually if you want:
      npm rm -g @loongphy/codex-auth @openai/codex
      Remove-Item -Recurse -Force ~/.claude-accounts
#>

Write-Host "Removing AI Account Switcher (Codex + Claude)..." -ForegroundColor Cyan

# 1. Tools dirs
foreach ($d in @((Join-Path $env:USERPROFILE '.codex-tools'), (Join-Path $env:USERPROFILE '.claude-tools'))) {
    if (Test-Path $d) { Remove-Item -Recurse -Force $d; Write-Host " - removed $d" }
}

# 2. Desktop shortcuts
$desktop = [Environment]::GetFolderPath('Desktop')
foreach ($s in @('Codex Switch Account.lnk', 'Claude Switch Account.lnk')) {
    $p = Join-Path $desktop $s
    if (Test-Path $p) { Remove-Item -Force $p; Write-Host " - removed $s" }
}

# 3. Added functions from both profiles
$docs = [Environment]::GetFolderPath('MyDocuments')
$profiles = @(
    (Join-Path $docs 'WindowsPowerShell\Microsoft.PowerShell_profile.ps1'),
    (Join-Path $docs 'PowerShell\Microsoft.PowerShell_profile.ps1')
)
foreach ($pf in $profiles) {
    if (-not (Test-Path $pf)) { continue }
    $lines = Get-Content $pf
    $out = New-Object System.Collections.Generic.List[string]
    $skip = $false
    foreach ($line in $lines) {
        if ($line -match '^\s*#\s*(Codex account switcher|Claude desktop account switcher)') { $skip = $true; continue }
        if ($skip -and $line -match '^\s*function\s+(codex-(switch|add)|claude-(switch|add)-account)') { continue }
        if ($skip -and $line -match '^\s*&\s') { continue }
        if ($skip -and $line -match '^\s*\}') { continue }
        if ($skip -and $line.Trim() -eq '') { $skip = $false; continue }
        $out.Add($line)
    }
    Set-Content -Path $pf -Value $out -Encoding UTF8
    Write-Host " - cleaned $pf"
}

Write-Host "Done. Open a new PowerShell window for changes to take effect." -ForegroundColor Green
