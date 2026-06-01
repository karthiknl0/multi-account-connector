<#
    AI Account Switcher (Codex + Claude) - installer

    One-line install (run in PowerShell):
      irm https://raw.githubusercontent.com/karthiknl0/multi-account-connector/main/install.ps1 | iex

    Installs:
      Codex:
        - codex-auth (account manager) + Codex CLI, via npm
        - ~/.codex-tools/codex-switch.ps1, codex-add.ps1
        - `codex-switch` / `codex-add` commands + a Desktop shortcut
      Claude (desktop app):
        - ~/.claude-tools/claude-switch.ps1, claude-add.ps1
        - `claude-switch-account` / `claude-add-account` commands + a Desktop shortcut
#>

$RawBase    = 'https://raw.githubusercontent.com/karthiknl0/multi-account-connector/main'
$ToolsDir   = Join-Path $env:USERPROFILE '.codex-tools'
$ScriptPath = Join-Path $ToolsDir 'codex-switch.ps1'
$AddPath    = Join-Path $ToolsDir 'codex-add.ps1'

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

# 4. Add `codex-switch` and `codex-add` to PowerShell profiles (5.1 + 7)
Write-Host "[3/4] Adding 'codex-switch' and 'codex-add' commands to your PowerShell profiles..." -ForegroundColor Cyan
$docs = [Environment]::GetFolderPath('MyDocuments')   # honours OneDrive redirection
$profiles = @(
    (Join-Path $docs 'WindowsPowerShell\Microsoft.PowerShell_profile.ps1'),
    (Join-Path $docs 'PowerShell\Microsoft.PowerShell_profile.ps1')
)
$func = @"

# Codex account switcher (installed by codex-account-switcher)
function codex-switch {
    & "$ScriptPath"
}
function codex-add {
    & "$AddPath"
}
"@
foreach ($pf in $profiles) {
    $dir = Split-Path $pf
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    if (-not (Test-Path $pf))  { New-Item -ItemType File -Force -Path $pf | Out-Null }
    $c = Get-Content $pf -Raw -ErrorAction SilentlyContinue
    if ([string]::IsNullOrEmpty($c) -or ($c -notlike '*function codex-switch*')) {
        Add-Content -Path $pf -Value $func -Encoding UTF8
    }
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

# ---------------------------------------------------------------------------
# Claude desktop switcher (no npm needed - works on the credentials file)
# ---------------------------------------------------------------------------
Write-Host "[+] Installing Claude desktop switcher..." -ForegroundColor Cyan
$ClaudeTools  = Join-Path $env:USERPROFILE '.claude-tools'
$ClaudeSwitch = Join-Path $ClaudeTools 'claude-switch.ps1'
$ClaudeAdd    = Join-Path $ClaudeTools 'claude-add.ps1'
New-Item -ItemType Directory -Force -Path $ClaudeTools | Out-Null
try {
    Invoke-RestMethod -Uri "$RawBase/src/claude-switch.ps1" -OutFile $ClaudeSwitch
    Invoke-RestMethod -Uri "$RawBase/src/claude-add.ps1"    -OutFile $ClaudeAdd

    $cfunc = @"

# Claude desktop account switcher (installed by ai-account-switcher)
function claude-switch-account {
    & "$ClaudeSwitch"
}
function claude-add-account {
    & "$ClaudeAdd"
}
"@
    foreach ($pf in $profiles) {
        $c = Get-Content $pf -Raw -ErrorAction SilentlyContinue
        if ([string]::IsNullOrEmpty($c) -or ($c -notlike '*function claude-switch-account*')) {
            Add-Content -Path $pf -Value $cfunc -Encoding UTF8
        }
    }

    $clnk = Join-Path $desktop 'Claude Switch Account.lnk'
    $cicon = $null
    $cpkg = Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq 'Claude_pzs8sxrjxfjjc' } | Select-Object -First 1
    if ($cpkg) { $ccand = Join-Path $cpkg.InstallLocation 'app\Claude.exe'; if (Test-Path $ccand) { $cicon = "$ccand,0" } }
    $csc = $ws.CreateShortcut($clnk)
    $csc.TargetPath       = $psExe
    $csc.Arguments        = "-ExecutionPolicy Bypass -NoProfile -File `"$ClaudeSwitch`""
    $csc.WorkingDirectory = $env:USERPROFILE
    if ($cicon) { $csc.IconLocation = $cicon }
    $csc.Description       = 'Switch the active Claude account and restart the Claude desktop app'
    $csc.WindowStyle      = 1
    $csc.Save()
} catch {
    Write-Host "WARN: Claude switcher install skipped: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done! AI Account Switcher (Codex + Claude) is installed." -ForegroundColor Green
Write-Host ""
Write-Host "Open a NEW PowerShell window so the new commands load, then:" -ForegroundColor Cyan
Write-Host ""
Write-Host "CODEX:" -ForegroundColor Cyan
Write-Host "  - Add accounts (per account):  codex-add        (check: codex-auth list)" -ForegroundColor Gray
Write-Host "  - Switch:  'Codex Switch Account' desktop icon, or run  codex-switch" -ForegroundColor Gray
Write-Host ""
Write-Host "CLAUDE (desktop app):" -ForegroundColor Cyan
Write-Host "  - Add accounts: log into the account in Claude, then run  claude-add-account" -ForegroundColor Gray
Write-Host "  - Switch:  'Claude Switch Account' desktop icon, or run  claude-switch-account" -ForegroundColor Gray
Write-Host "    (Run the Claude switch from a STANDALONE terminal - it closes the Claude app.)" -ForegroundColor DarkGray
