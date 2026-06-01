# Codex account switcher
# Picks an account with codex-auth, then restarts the Codex desktop app so it
# reloads ~/.codex/auth.json as the chosen account. Auto-detects the Codex app,
# so it keeps working across Codex updates and on any machine.

function Get-CodexAumid {
    $app = Get-StartApps | Where-Object { $_.Name -match 'codex' -and $_.AppID -match 'OpenAI' } | Select-Object -First 1
    if (-not $app) { $app = Get-StartApps | Where-Object { $_.Name -match 'codex' } | Select-Object -First 1 }
    return $app.AppID
}

if (-not (Get-Command codex-auth -ErrorAction SilentlyContinue)) {
    Write-Host "codex-auth is not installed. Run the installer first." -ForegroundColor Red
    Start-Sleep -Seconds 3
    return
}

Write-Host "=== Codex account switch ===" -ForegroundColor Cyan
codex-auth switch --skip-api

if ($LASTEXITCODE -ne 0) {
    Write-Host "Switch cancelled - Codex app left as-is." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    return
}

$aumid = Get-CodexAumid
Write-Host "Restarting Codex desktop app..." -ForegroundColor Cyan
Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -like "*WindowsApps\OpenAI.Codex*" } |
    Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

if ($aumid) {
    Start-Process "shell:AppsFolder\$aumid"
    Write-Host "Done - Codex is reopening as the selected account." -ForegroundColor Green

    # Wait for Codex to refresh the OAuth token, then re-snapshot it so the
    # next switch has a fresh token (refresh tokens are single-use).
    Write-Host "Waiting for Codex to refresh token..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 8
    $auth = Join-Path $env:USERPROFILE '.codex\auth.json'
    if (Test-Path $auth) {
        codex-auth import $auth | Out-Null
        Write-Host "Token snapshot updated." -ForegroundColor DarkGray
    }
} else {
    Write-Host "Account switched, but the Codex desktop app wasn't found to relaunch." -ForegroundColor Yellow
    Write-Host "Open Codex manually - it will load the account you just selected." -ForegroundColor Yellow
}
Start-Sleep -Seconds 2
