<#
    Codex Account Switcher - uninstaller

    One-line uninstall:
      irm https://raw.githubusercontent.com/karthiknl0/multi-account-connector/main/uninstall.ps1 | iex

    Removes the switch script, the Desktop shortcut, and the codex-switch
    function from your PowerShell profiles. Does NOT uninstall the npm packages
    or touch your saved Codex accounts (~/.codex). Remove those manually if you
    want:  npm rm -g @loongphy/codex-auth @openai/codex
#>

Write-Host "Removing Codex Account Switcher..." -ForegroundColor Cyan

# 1. Switch script + tools dir
$ToolsDir = Join-Path $env:USERPROFILE '.codex-tools'
if (Test-Path $ToolsDir) { Remove-Item -Recurse -Force $ToolsDir; Write-Host " - removed $ToolsDir" }

# 2. Desktop shortcut
$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Codex Switch Account.lnk'
if (Test-Path $lnk) { Remove-Item -Force $lnk; Write-Host " - removed Desktop shortcut" }

# 3. codex-switch function from both profiles
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
        if ($line -match '^\s*#\s*Codex account switcher') { $skip = $true; continue }
        if ($skip -and $line -match '^\s*function\s+codex-switch') { continue }
        if ($skip -and $line -match '^\s*&\s') { continue }
        if ($skip -and $line -match '^\s*\}') { $skip = $false; continue }
        if ($skip -and $line.Trim() -eq '') { continue }
        $out.Add($line)
    }
    Set-Content -Path $pf -Value $out -Encoding UTF8
    Write-Host " - cleaned $pf"
}

Write-Host "Done. Open a new PowerShell window for changes to take effect." -ForegroundColor Green
