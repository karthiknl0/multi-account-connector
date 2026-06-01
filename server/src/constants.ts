import { homedir } from "node:os";
import { join } from "node:path";

/** Root data dir for the vault + audit log. Override with MAC_HOME. */
export const MAC_HOME: string =
  process.env.MAC_HOME && process.env.MAC_HOME.trim().length > 0
    ? process.env.MAC_HOME
    : join(homedir(), ".multi-account-connector");

export const VAULT_PATH: string = join(MAC_HOME, "vault.json");
export const AUDIT_PATH: string = join(MAC_HOME, "audit.log");

/** Max characters returned to the model before truncation kicks in. */
export const CHARACTER_LIMIT = 25000;

/**
 * Global kill-switch for destructive actions. Even an explicit confirm:true
 * call is refused unless this is set to "true". Defense in depth: the model
 * cannot turn this on.
 */
export const ALLOW_DESTRUCTIVE: boolean =
  (process.env.MAC_ALLOW_DESTRUCTIVE ?? "false").toLowerCase() === "true";
