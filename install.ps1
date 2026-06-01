<#
    Codex Account Switcher - installer

    One-line install (run in PowerShell):
      irm https://raw.githubusercontent.com/karthiknl0/codex-account-switcher/main/install.ps1 | iex

    Installs:
      - codex-auth (account manager) + Codex CLI, via npm
      - ~/.codex-tools/codex-switch.ps1  (the switch + app-restart script)
      - a `codex-switch` command in your PowerShell profiles (5.1 and 7)
      - a "Codex Switch Account" shortcut on your Desktop
#>

$RawBase     = 'https://raw.githubusercontent.com/karthiknl0/codex-account-switcher/main'
$ToolsDir    = Join-Path $env:USERPROFILE '.codex-tools'
$ScriptPath  = Join-Path $ToolsDir 'codex-switch.ps1'
$AddPath     = Join-Path $ToolsDir 'codex-add.ps1'
$VersionPath = Join-Path $ToolsDir '.version'

Write-Host ""
Write-Host "=== Codex Account Switcher - installer ===" -ForegroundColor Cyan

# 1. Prerequisite: Node / npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js / npm not found." -ForegroundColor Red
    Write-Host "Install Node 18+ from https://nodejs.org , then re-run this installer." -ForegroundColor Red
    return
}

# 2. Install codex-auth + Codex CLI
Write-Host "[1/4] Installing codex-auth and Codex CLI via npm (this may take a moment)..." -ForegroundColor Cyan
npm install -g @loongphy/codex-auth @openai/codex
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npm install failed. Fix the npm error above and re-run." -ForegroundColor Red
    return
}

# 3. Fetch the scripts
Write-Host "[2/4] Installing scripts to $ToolsDir ..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null
try {
    Invoke-RestMethod -Uri "$RawBase/src/codex-switch.ps1" -OutFile $ScriptPath
    Invoke-RestMethod -Uri "$RawBase/src/codex-add.ps1"    -OutFile $AddPath
} catch {
    Write-Host "ERROR: could not download scripts from GitHub." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    return
}

# Record the installed version (used by the daily update check).
try {
    $ver = (Invoke-RestMethod -Uri "$RawBase/VERSION" -TimeoutSec 8).ToString().Trim()
    Set-Content -Path $VersionPath -Value $ver -Encoding ASCII
    Write-Host "      Installed version $ver" -ForegroundColor DarkGray
} catch {}

# 4. Add `codex-switch` / `codex-add` / `codex-update` to PowerShell profiles (5.1 + 7)
Write-Host "[3/4] Adding 'codex-switch' / 'codex-add' / 'codex-update' commands to your PowerShell profiles..." -ForegroundColor Cyan
$docs = [Environment]::GetFolderPath('MyDocuments')   # honours OneDrive redirection
$profiles = @(
    (Join-Path $docs 'WindowsPowerShell\Microsoft.PowerShell_profile.ps1'),
    (Join-Path $docs 'PowerShell\Microsoft.PowerShell_profile.ps1')
)
# Marker-delimited block so re-running the installer cleanly REPLACES the old
# definitions (lets us add/rename commands on update without leaving dupes).
$beginMark = '# >>> codex-account-switcher >>>'
$endMark   = '# <<< codex-account-switcher <<<'
$func = @"
$beginMark
# Codex account switcher (managed by codex-account-switcher installer)
function codex-switch { & "$ScriptPath" }
function codex-add    { & "$AddPath" }
function codex-update {
    Write-Host "Updating Codex Account Switcher..." -ForegroundColor Cyan
    irm $RawBase/install.ps1 | iex
    Write-Host "Done. Open a new PowerShell window to load the updated commands." -ForegroundColor Green
}
$endMark
"@
foreach ($pf in $profiles) {
    $dir = Split-Path $pf
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    if (-not (Test-Path $pf))  { New-Item -ItemType File -Force -Path $pf | Out-Null }
    $c = Get-Content $pf -Raw -ErrorAction SilentlyContinue
    if ($null -eq $c) { $c = '' }
    # Remove any previous managed block, then append fresh.
    $pattern = [Regex]::Escape($beginMark) + '.*?' + [Regex]::Escape($endMark)
    $c = [Regex]::Replace($c, $pattern, '', 'Singleline')
    # Legacy cleanup: drop the old un-delimited block from earlier versions.
    $c = $c -replace '(?s)\r?\n#\s*Codex account switcher[^\r\n]*.*?function\s+codex-add\s*\{[^}]*\}', ''
    $c = $c.TrimEnd() + "`r`n`r`n" + $func + "`r`n"
    Set-Content -Path $pf -Value $c -Encoding UTF8
}

# 5. Desktop shortcut
Write-Host "[4/4] Creating Desktop shortcut..." -ForegroundColor Cyan
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk     = Join-Path $desktop 'Codex Switch Account.lnk'
$psExe   = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

$icon = $null
$pkg  = Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pkg) {
    $cand = Join-Path $pkg.InstallLocation 'app\Codex.exe'
    if (Test-Path $cand) { $icon = "$cand,0" }
}

$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnk)
$sc.TargetPath       = $psExe
$sc.Arguments        = "-ExecutionPolicy Bypass -NoProfile -File `"$ScriptPath`""
$sc.WorkingDirectory = $env:USERPROFILE
if ($icon) { $sc.IconLocation = $icon }
$sc.Description       = 'Switch the active Codex account and restart the Codex desktop app'
$sc.WindowStyle      = 1
$sc.Save()

Write-Host ""
Write-Host "Done! Codex Account Switcher is installed." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Add your accounts (run once per account, in a NEW terminal):" -ForegroundColor Gray
Write-Host "       codex-add          # signs you in + saves the account (repeat for each)" -ForegroundColor Gray
Write-Host "     Check anytime with:  codex-auth list" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. To switch accounts any time:" -ForegroundColor Gray
Write-Host "       - double-click 'Codex Switch Account' on your Desktop, OR" -ForegroundColor Gray
Write-Host "       - run 'codex-switch' in a new PowerShell window" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. To update later: run  codex-update  (or re-run the install line)." -ForegroundColor Gray
Write-Host ""
Write-Host "  (Open a NEW PowerShell window so the commands load.)" -ForegroundColor DarkGray
