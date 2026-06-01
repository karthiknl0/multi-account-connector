/** Decrypted secret material for one account. NEVER returned to the model. */
export interface TokenBundle {
  access_token: string;
  refresh_token?: string;
  /** Epoch ms when the access token expires (if known). */
  expires_at?: number;
  token_type?: string;
}

/** Non-secret metadata about a stored account. Safe to show the model. */
export interface AccountMeta {
  id: string;
  provider: string;
  /** Human label, e.g. "github:octocat". */
  label: string;
  email?: string;
  scopes: string[];
  created_at: number;
  updated_at: number;
}

/** One account record as persisted on disk (metadata + encrypted secret). */
export interface StoredAccount extends AccountMeta {
  enc: EncryptedBlob;
}

/** AES-256-GCM ciphertext envelope. All fields base64. */
export interface EncryptedBlob {
  iv: string;
  tag: string;
  data: string;
}

/** Top-level vault file. `salt` is only present when key is passphrase-derived. */
export interface VaultFile {
  version: 1;
  salt?: string;
  accounts: Record<string, StoredAccount>;
}

export type ActionMode = "read" | "write";

export interface AuditEntry {
  ts: string;
  account_id: string;
  provider: string;
  action: string;
  mode: ActionMode;
  destructive: boolean;
  status: "success" | "error" | "refused" | "preview";
  param_summary?: string;
  error?: string;
}
