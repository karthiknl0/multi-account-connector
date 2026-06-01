# AI Account Switcher (Codex + Claude)

Switch between multiple **OpenAI Codex** and **Anthropic Claude** accounts on
Windows — pick an account from a quick menu and the desktop app restarts logged
into it. Built for people who own several Plus/Pro accounts and want to move
between them without the logout/login dance.

Neither desktop app has a built-in account dropdown. This wires up a one-step
switch (plus Desktop shortcuts) for both.

---

## Install (one line)

Open **PowerShell** and run:

```powershell
irm https://raw.githubusercontent.com/karthiknl0/multi-account-connector/main/install.ps1 | iex
```

This installs:

**Codex**
- [`codex-auth`](https://github.com/Loongphy/codex-auth) + the Codex CLI (via npm)
- `codex-switch` / `codex-add` commands + a **"Codex Switch Account"** Desktop shortcut

**Claude (desktop app)**
- `claude-switch-account` / `claude-add-account` commands + a **"Claude Switch Account"** Desktop shortcut
- No npm needed — it works directly on Claude's credentials file

> **Requires:** Windows; the desktop app(s) you want to switch
> ([Codex](https://openai.com/codex/) / [Claude](https://claude.ai/download));
> and [Node.js 18+](https://nodejs.org) for the Codex half.
>
> **Open a new PowerShell window after installing** so the commands load.

---

## Codex

### Add accounts (run per account)
```powershell
codex-add          # signs you in + saves the account
codex-auth list    # see saved accounts
```
No limit — add as many as you have. Use a fresh/incognito browser (or sign out
of chatgpt.com) between accounts so you don't save the same one twice.

### Switch
- Double-click **"Codex Switch Account"**, or run `codex-switch`.
- Pick an account → the Codex desktop app restarts on it.

---

## Claude (desktop app)

Claude stores its login token in `~/.claude/.credentials.json`. The switcher
keeps a copy of each account's token and swaps the active one, then restarts the
Claude desktop app. It **only** swaps the `claudeAiOauth` token block (your
`mcpOAuth` is preserved) and **never edits** `~/.claude/.claude.json`, so your
settings, MCP servers and history are left untouched.

### Add accounts
Log into the account in the Claude app (the menu's **Log out**, then sign in as
the account), then save it:
```powershell
claude-add-account
```
Repeat for each account.

### Switch
- Double-click **"Claude Switch Account"**, or run `claude-switch-account`.
- Pick an account → the Claude desktop app restarts on it.

> ⚠️ **Run the Claude switch from a standalone PowerShell window** — it closes
> the Claude desktop app to reload the login. Don't run it from inside a Claude
> session you care about. The displayed email can take a few seconds to refresh
> after a switch; usage always counts against the swapped account.

---

## How it works

Both apps read their login from a file on disk
(`~/.codex/auth.json`, `~/.claude/.credentials.json`) only at startup. Each
switcher swaps the active account's credentials and restarts the app, which then
comes up logged into the chosen account. The restart targets are auto-detected
(Microsoft Store app IDs), so they survive app updates.

There is no live in-app switch in either app — the menu is the "dropdown", and
the app reflects whichever account is active after the restart. OpenAI has an
open request for native multi-account:
[openai/codex#4432](https://github.com/openai/codex/issues/4432).

---

## Uninstall

```powershell
irm https://raw.githubusercontent.com/karthiknl0/multi-account-connector/main/uninstall.ps1 | iex
```

Removes the scripts, shortcuts, and added functions. Leaves the npm packages and
your saved accounts alone; remove those yourself if you want:

```powershell
npm rm -g @loongphy/codex-auth @openai/codex
Remove-Item -Recurse -Force ~/.claude-accounts
```

---

## Notes & caveats

- **Use only accounts you own.** This is for moving between your own accounts,
  not sharing accounts or evading limits. Codex's automatic rotation / usage-API
  features are intentionally **not** enabled (the switch uses `--skip-api`).
- Saved tokens are stored in plaintext locally (same as how both apps already
  store them on disk). Keep your machine secured; don't commit `~/.claude-accounts`
  or `~/.codex` anywhere.
- If you constantly max out limits, a single higher tier (ChatGPT Pro / Claude
  Max) may be simpler than juggling several accounts.

## Credits

- [`codex-auth`](https://github.com/Loongphy/codex-auth) by Loongphy
- [Codex CLI](https://github.com/openai/codex) by OpenAI

## License

MIT — see [LICENSE](LICENSE).
