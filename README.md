# Codex Account Switcher

Switch between multiple OpenAI **Codex** accounts (e.g. several ChatGPT Plus
accounts you own) on Windows — pick an account from a quick picker and the
**Codex desktop app** restarts logged into it.

The Codex desktop app has no built-in account dropdown. This wraps
[`codex-auth`](https://github.com/Loongphy/codex-auth) with a one-step switch
that also restarts the app, plus a Desktop shortcut so it's a double-click.

---

## Install (one line)

Open **PowerShell** and run:

```powershell
irm https://raw.githubusercontent.com/karthiknl0/multi-account-connector/main/install.ps1 | iex
```

This installs everything:

- `codex-auth` (account manager) and the **Codex CLI**, via npm
- `~/.codex-tools/codex-switch.ps1` — the switch + app-restart script
- a **`codex-switch`** command in your PowerShell profiles
- a **"Codex Switch Account"** shortcut on your Desktop

> **Requires:** Windows, the [Codex desktop app](https://openai.com/codex/), and
> [Node.js 18+](https://nodejs.org) (for npm). If npm is missing the installer
> tells you and stops.

---

## First-time setup — add your accounts

Run once per account in a **new** PowerShell window:

```powershell
codex login        # sign in as an account (use a fresh / incognito browser per account)
codex-auth import "$env:USERPROFILE\.codex\auth.json"
```

Repeat for each account, then confirm:

```powershell
codex-auth list
```

> **Tip:** the OAuth page reuses whatever account is already signed into your
> browser. Sign out of chatgpt.com (or use an incognito window) between accounts
> so you don't save the same one twice.

---

## Switching accounts

Either:

- **Double-click** the **"Codex Switch Account"** icon on your Desktop, or
- run **`codex-switch`** in a new PowerShell window.

You get an arrow-key account picker. Choose one, and the Codex desktop app
closes and reopens logged into that account.

---

## How it works

Codex stores its login in `~/.codex/auth.json`, and both the CLI and the desktop
app read it. `codex-auth` keeps an encrypted snapshot of each account and swaps
the active `auth.json` on demand. Because the desktop app only reads that file at
startup, the switch script also restarts the app (it auto-detects the Codex
Store app, so it survives Codex updates).

There is no live in-app switch — the picker is the "dropdown", and the app
reflects whichever account is active after the restart. OpenAI has an open
feature request for native multi-account:
[openai/codex#4432](https://github.com/openai/codex/issues/4432).

---

## Uninstall

```powershell
irm https://raw.githubusercontent.com/karthiknl0/multi-account-connector/main/uninstall.ps1 | iex
```

Removes the script, shortcut, and `codex-switch` function. It leaves the npm
packages and your saved accounts alone; remove those yourself if you want:

```powershell
npm rm -g @loongphy/codex-auth @openai/codex
```

---

## Notes & caveats

- **Use only accounts you own.** This is for switching between your own Plus
  accounts, not sharing accounts or evading limits. `codex-auth`'s automatic
  rotation / usage-API features are intentionally **not** enabled here — the
  switch uses `--skip-api` — because constant polling/rotation can risk account
  restrictions. Switch manually.
- If you constantly max out limits, a single **ChatGPT Pro** plan may be simpler
  and cheaper than juggling several Plus accounts.

## Credits

- [`codex-auth`](https://github.com/Loongphy/codex-auth) by Loongphy — the
  underlying account manager.
- [Codex CLI](https://github.com/openai/codex) by OpenAI.

## License

MIT — see [LICENSE](LICENSE).
