# Add a Codex account in one step: sign in with the Codex CLI, then snapshot
# the resulting auth.json into codex-auth so it joins the switch picker.

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    Write-Host "Codex CLI not found. Run the installer first." -ForegroundColor Red
    Start-Sleep -Seconds 3
    return
}
if (-not (Get-Command codex-auth -ErrorAction SilentlyContinue)) {
    Write-Host "codex-auth not found. Run the installer first." -ForegroundColor Red
    Start-Sleep -Seconds 3
    return
}

Write-Host "=== Add a Codex account ===" -ForegroundColor Cyan
Write-Host "Tip: sign out of chatgpt.com first (or use an incognito window) so you" -ForegroundColor DarkGray
Write-Host "don't accidentally re-add an account you've already saved." -ForegroundColor DarkGray
Write-Host ""

codex login
if ($LASTEXITCODE -ne 0) {
    Write-Host "codex login failed or was cancelled - nothing added." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    return
}

$auth = Join-Path $env:USERPROFILE '.codex\auth.json'
if (-not (Test-Path $auth)) {
    Write-Host "Couldn't find $auth after login - nothing imported." -ForegroundColor Red
    Start-Sleep -Seconds 2
    return
}

codex-auth import $auth
Write-Host ""
Write-Host "Saved. Your accounts now:" -ForegroundColor Green
codex-auth list
Start-Sleep -Seconds 2
