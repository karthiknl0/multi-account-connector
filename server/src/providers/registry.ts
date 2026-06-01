import { ALLOW_DESTRUCTIVE } from "../constants.js";
import { audit, summarizeParams } from "../audit.js";
import { getAccountMeta, getTokenBundle, updateTokens } from "../vault.js";
import { githubProvider } from "./github.js";
import { googleProvider } from "./google.js";
import type { ActionContext, Provider } from "./types.js";

const PROVIDERS: Record<string, Provider> = {
  github: githubProvider,
  google: googleProvider,
};

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS[id];
}

export function listProviders(): Provider[] {
  return Object.values(PROVIDERS);
}

/** Refresh the access token if it is expiring within 60s. Internal only. */
async function freshToken(provider: Provider, accountId: string): Promise<string> {
  let bundle = getTokenBundle(accountId);
  if (bundle.expires_at && bundle.expires_at < Date.now() + 60_000) {
    const refreshed = await provider.refresh(bundle);
    if (refreshed) {
      updateTokens(accountId, refreshed);
      bundle = refreshed;
    }
  }
  return bundle.access_token;
}

/** Build an authenticated fetch bound to one account. The token never escapes. */
function makeAuthedFetch(
  provider: Provider,
  accountId: string,
): ActionContext["authedFetch"] {
  return async (path: string, init: RequestInit = {}): Promise<Response> => {
    const token = await freshToken(provider, accountId);
    const url = path.startsWith("http") ? path : `${provider.baseUrl}${path}`;
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("User-Agent", "multi-account-connector");
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(url, { ...init, headers });
  };
}

export interface DispatchOpts {
  /** Whether write-mode actions are permitted (true only via run_action_as_account). */
  allowWrite: boolean;
  /** Explicit confirmation for destructive actions. */
  confirm: boolean;
}

export type DispatchResult =
  | { status: "success"; data: unknown }
  | { status: "preview"; message: string }
  | { status: "refused"; message: string }
  | { status: "error"; message: string };

/**
 * Single choke point for every account-scoped action. Enforces, server-side:
 *  - account + action existence
 *  - read/write separation (write actions require allowWrite)
 *  - destructive policy (MAC_ALLOW_DESTRUCTIVE) AND explicit confirm
 * Then runs the action with a token-injecting fetch and records an audit entry.
 */
export async function dispatch(
  accountId: string,
  actionName: string,
  params: unknown,
  opts: DispatchOpts,
): Promise<DispatchResult> {
  const meta = getAccountMeta(accountId);
  if (!meta) {
    return {
      status: "error",
      message: `No account with id '${accountId}'. Call list_accounts first.`,
    };
  }
  const provider = getProvider(meta.provider);
  if (!provider) {
    return { status: "error", message: `Unknown provider '${meta.provider}'.` };
  }
  const action = provider.actions[actionName];
  if (!action) {
    const available = Object.keys(provider.actions).join(", ");
    return {
      status: "error",
      message: `Unknown action '${actionName}' for ${provider.label}. Available: ${available}`,
    };
  }

  const auditBase = {
    account_id: accountId,
    provider: meta.provider,
    action: actionName,
    mode: action.mode,
    destructive: action.destructive,
    param_summary: summarizeParams(params),
  } as const;

  // Read/write separation.
  if (action.mode === "write" && !opts.allowWrite) {
    audit({ ...auditBase, status: "refused" });
    return {
      status: "refused",
      message: `'${actionName}' is a write action. Use run_action_as_account, not read_from_account.`,
    };
  }

  // Destructive gating (defense in depth: policy switch + explicit confirm).
  if (action.destructive) {
    if (!ALLOW_DESTRUCTIVE) {
      audit({ ...auditBase, status: "refused" });
      return {
        status: "refused",
        message:
          `'${actionName}' is destructive and is disabled by policy. ` +
          `An operator must set MAC_ALLOW_DESTRUCTIVE=true to enable it.`,
      };
    }
    if (!opts.confirm) {
      audit({ ...auditBase, status: "preview" });
      return {
        status: "preview",
        message:
          `DRY RUN — no changes made. '${actionName}' on account '${meta.label}' is destructive. ` +
          `Re-call with confirm:true to execute.`,
      };
    }
  }

  // Validate params and run.
  try {
    const parsed = action.schema.parse(params ?? {});
    const ctx: ActionContext = {
      accountId,
      authedFetch: makeAuthedFetch(provider, accountId),
    };
    const data = await action.run(ctx, parsed);
    audit({ ...auditBase, status: "success" });
    return { status: "success", data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    audit({ ...auditBase, status: "error", error: message });
    return { status: "error", message };
  }
}
