# multi-account-connector

A Claude Code **plugin** that bundles an **MCP server** for managing multiple OAuth
accounts (e.g. two GitHub accounts + a Google account) behind one set of safe,
account-scoped tools.

The key idea: **don't try to log Claude Code into many accounts.** The MCP server
holds the tokens and exposes tools that require you to name an account on every call.
Claude never sees a raw token.

## Architecture

```
multi-account-connector/
├── .claude-plugin/
│   └── plugin.json          # plugin manifest (metadata)
├── .mcp.json                # MCP server definition (kept separate — see note below)
├── skills/
│   └── multi-account/
│       └── SKILL.md         # tells Claude how to use the tools safely
└── server/                  # the MCP server (TypeScript)
    ├── src/
    │   ├── index.ts         # MCP entry (stdio) + 4 tools
    │   ├── cli.ts           # out-of-band login/logout/list
    │   ├── vault.ts         # AES-256-GCM encrypted token store
    │   ├── audit.ts         # append-only action log
    │   ├── oauth.ts         # device-flow + PKCE-loopback + refresh
    │   └── providers/
    │       ├── registry.ts  # central dispatch + ALL security gating
    │       ├── github.ts
    │       └── google.ts
    └── package.json
```

### Tools exposed to Claude

| Tool | Purpose |
| --- | --- |
| `list_accounts` | List connected accounts (no tokens). |
| `list_actions` | Discover each provider's actions + safety class. |
| `read_from_account` | Run a **read-only** action as an account. |
| `run_action_as_account` | Run a **read or write** action; destructive needs `confirm:true`. |

> There is deliberately **no `switch_account`**. State is dangerous — every call
> names its account, so Claude can never "lose track" of who it's acting as.

## Security model

- **Tokens encrypted at rest** (AES-256-GCM) in `~/.multi-account-connector/vault.json`
  (file mode `0600`). The key comes from `MAC_VAULT_KEY` or `MAC_VAULT_PASSPHRASE`.
- **Tokens never reach the model.** Decryption happens only inside the dispatch
  layer, used to build an authenticated `fetch`, and is never returned in any output.
- **Read/write separation** is enforced by the server, not by prompting:
  `read_from_account` refuses write actions.
- **Destructive actions are double-gated:** they require the operator policy
  `MAC_ALLOW_DESTRUCTIVE=true` **and** an explicit `confirm:true`. Without `confirm`,
  the server returns a dry-run preview and changes nothing.
- **Every attempt is audited** to `~/.multi-account-connector/audit.log`
  (account, action, status, redacted params).
- **Auth is out of band.** Accounts are connected via the CLI in your terminal, so
  the OAuth dance never touches a conversation.

## Setup

Requires Node.js 20+.

```bash
cd server
npm install
npm run build
cp .env.example .env   # then fill it in
```

Generate a vault key and put it in `.env` (or export it):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### GitHub OAuth App

1. GitHub → Settings → Developer settings → **OAuth Apps** → New.
2. **Enable Device Flow.**
3. Copy the **Client ID** into `GITHUB_CLIENT_ID`.

### Google OAuth client (optional)

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client →
   **Desktop app**.
2. Set `GOOGLE_CLIENT_ID` (and `GOOGLE_CLIENT_SECRET`).

## Connect accounts (run in your terminal, not in Claude)

```bash
# load your env first (e.g. `set -a; . ./.env; set +a` on macOS/Linux)
node dist/cli.js login github      # repeat to add a second GitHub account
node dist/cli.js login google
node dist/cli.js list
node dist/cli.js logout "github:someuser"
```

Each login runs the provider's OAuth flow, then stores the encrypted token under a
human-readable id like `github:octocat`.

## Install the plugin in Claude Code

The server reads `MAC_VAULT_KEY` and `MAC_ALLOW_DESTRUCTIVE` from the environment
(see `.mcp.json`), so export them in the shell you launch Claude Code from.

Point Claude Code at this folder as a local plugin. The exact `/plugin` commands
move occasionally, so check the current plugins docs:
https://code.claude.com/docs/en/plugins-reference

A minimal local marketplace pointing at this plugin looks like:

```json
{
  "name": "local-dev",
  "plugins": [{ "name": "multi-account-connector", "source": "./multi-account-connector" }]
}
```

Then, in Claude Code: add that marketplace and install `multi-account-connector`.
Confirm the server is live with `/mcp` — you should see `multi-account`.

To allow destructive actions for a session:

```bash
export MAC_ALLOW_DESTRUCTIVE=true
```

> **Note on `.mcp.json` vs inline:** this plugin defines its MCP server in a separate
> `.mcp.json` at the plugin root rather than inline in `plugin.json`. Inline
> `mcpServers` in `plugin.json` has been unreliable in recent Claude Code versions
> (the field could be dropped during manifest parsing). The separate file is the safe
> path; switch to inline only once you've confirmed it works in your version.

## Adding a provider

1. Create `server/src/providers/<name>.ts` implementing the `Provider` interface
   (`id`, `baseUrl`, `login`, `refresh`, `actions`).
2. Mark each action's `mode` (`read`/`write`) and `destructive` flag — the registry
   enforces gating from those flags automatically.
3. Register it in `server/src/providers/registry.ts`.
4. `npm run build`.

No tool code changes are needed; the four generic tools dispatch to any provider.
