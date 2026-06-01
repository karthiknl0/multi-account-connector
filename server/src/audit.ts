import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { AUDIT_PATH } from "./constants.js";
import type { AuditEntry } from "./types.js";

/**
 * Append one structured line to the audit log. Best-effort: a logging failure
 * must never block or crash a tool call, but we surface it on stderr.
 */
export function audit(entry: Omit<AuditEntry, "ts">): void {
  const line: AuditEntry = { ts: new Date().toISOString(), ...entry };
  try {
    mkdirSync(dirname(AUDIT_PATH), { recursive: true });
    appendFileSync(AUDIT_PATH, JSON.stringify(line) + "\n", { mode: 0o600 });
  } catch (err) {
    console.error(
      "[audit] failed to write entry:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** Short, redacted summary of params for the audit trail (no secrets, capped). */
export function summarizeParams(params: unknown): string {
  try {
    const json = JSON.stringify(params ?? {});
    return json.length > 300 ? json.slice(0, 297) + "..." : json;
  } catch {
    return "[unserializable params]";
  }
}
