#!/usr/bin/env node
import { deleteAccount, listAccounts, upsertAccount } from "./vault.js";
import { getProvider, listProviders } from "./providers/registry.js";

function usage(): void {
  console.log(`multi-account-connector CLI

Usage:
  mac login <provider>      Authorize a new account (interactive OAuth)
  mac list                  List connected accounts (no secrets)
  mac logout <account_id>   Remove a connected account
  mac providers             List providers and their actions

Providers: ${listProviders().map((p) => p.id).join(", ")}

Before 'login', set your vault key and the provider's OAuth client env vars.
See README.md.`);
}

async function cmdLogin(providerId: string | undefined): Promise<void> {
  if (!providerId) {
    console.error("Missing provider. Try: mac login github");
    process.exit(1);
  }
  const provider = getProvider(providerId);
  if (!provider) {
    console.error(
      `Unknown provider '${providerId}'. Known: ${listProviders().map((p) => p.id).join(", ")}`,
    );
    process.exit(1);
  }
  const result = await provider.login();
  const id = result.label; // human-readable + stable; re-login overwrites
  const meta = upsertAccount({
    id,
    provider: provider.id,
    label: result.label,
    email: result.email,
    scopes: result.scopes,
    tokens: result.tokens,
  });
  console.error(`\nConnected: ${meta.label} (id: ${meta.id})`);
  console.error(`Scopes: ${meta.scopes.join(", ") || "(none reported)"}`);
}

function cmdList(): void {
  const accounts = listAccounts();
  if (!accounts.length) {
    console.log("No accounts connected. Run: mac login <provider>");
    return;
  }
  for (const a of accounts) {
    console.log(`- ${a.id}  [${a.provider}]  ${a.email ?? ""}`);
    console.log(`    scopes: ${a.scopes.join(", ") || "(none)"}`);
  }
}

function cmdLogout(id: string | undefined): void {
  if (!id) {
    console.error("Missing account id. Try: mac logout 'github:octocat'");
    process.exit(1);
  }
  console.log(deleteAccount(id) ? `Removed ${id}.` : `No account '${id}'.`);
}

function cmdProviders(): void {
  for (const p of listProviders()) {
    console.log(`\n${p.label} (${p.id})`);
    for (const a of Object.values(p.actions)) {
      const flags = [a.mode, a.destructive ? "DESTRUCTIVE" : ""].filter(Boolean).join(", ");
      console.log(`  ${a.name}  [${flags}]`);
    }
  }
}

async function main(): Promise<void> {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case "login":
      await cmdLogin(arg);
      break;
    case "list":
      cmdList();
      break;
    case "logout":
      cmdLogout(arg);
      break;
    case "providers":
      cmdProviders();
      break;
    default:
      usage();
  }
}

main().catch((error: unknown) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
