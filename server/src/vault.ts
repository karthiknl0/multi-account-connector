import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { MAC_HOME, VAULT_PATH } from "./constants.js";
import type {
  AccountMeta,
  EncryptedBlob,
  StoredAccount,
  TokenBundle,
  VaultFile,
} from "./types.js";

const ALGO = "aes-256-gcm";

function emptyVault(): VaultFile {
  return { version: 1, accounts: {} };
}

export function loadVault(): VaultFile {
  if (!existsSync(VAULT_PATH)) return emptyVault();
  const raw = readFileSync(VAULT_PATH, "utf8");
  const parsed = JSON.parse(raw) as VaultFile;
  if (parsed.version !== 1) {
    throw new Error(`Unsupported vault version: ${String(parsed.version)}`);
  }
  return parsed;
}

export function saveVault(vault: VaultFile): void {
  mkdirSync(dirname(VAULT_PATH), { recursive: true });
  // 0600 so only the owner can read the encrypted store.
  writeFileSync(VAULT_PATH, JSON.stringify(vault, null, 2), { mode: 0o600 });
}

/**
 * Resolve the 32-byte encryption key. Prefers MAC_VAULT_KEY (base64, 32 bytes).
 * Falls back to scrypt(MAC_VAULT_PASSPHRASE, salt). The salt is stored in the
 * vault file (a salt is not a secret) and generated on first use.
 */
function resolveKey(vault: VaultFile): { key: Buffer; vault: VaultFile } {
  const rawKey = process.env.MAC_VAULT_KEY?.trim();
  if (rawKey) {
    const key = Buffer.from(rawKey, "base64");
    if (key.length !== 32) {
      throw new Error(
        "MAC_VAULT_KEY must be 32 bytes encoded as base64. " +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
      );
    }
    return { key, vault };
  }

  const passphrase = process.env.MAC_VAULT_PASSPHRASE?.trim();
  if (passphrase) {
    let next = vault;
    if (!next.salt) {
      next = { ...next, salt: randomBytes(16).toString("base64") };
    }
    const salt = Buffer.from(next.salt as string, "base64");
    const key = scryptSync(passphrase, salt, 32);
    return { key, vault: next };
  }

  throw new Error(
    "No vault key configured. Set MAC_VAULT_KEY (32-byte base64) or MAC_VAULT_PASSPHRASE.",
  );
}

function encrypt(plaintext: string, key: Buffer): EncryptedBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: data.toString("base64"),
  };
}

function decrypt(blob: EncryptedBlob, key: Buffer): string {
  const decipher = createDecipheriv(ALGO, key, Buffer.from(blob.iv, "base64"));
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  const out = Buffer.concat([
    decipher.update(Buffer.from(blob.data, "base64")),
    decipher.final(),
  ]);
  return out.toString("utf8");
}

/** List non-secret account metadata. Never includes tokens. */
export function listAccounts(): AccountMeta[] {
  const vault = loadVault();
  return Object.values(vault.accounts).map(stripSecret);
}

export function getAccountMeta(id: string): AccountMeta | undefined {
  const acct = loadVault().accounts[id];
  return acct ? stripSecret(acct) : undefined;
}

function stripSecret(acct: StoredAccount): AccountMeta {
  const { enc: _enc, ...meta } = acct;
  void _enc;
  return meta;
}

/** Internal only. The returned token MUST NOT be surfaced to the model. */
export function getTokenBundle(id: string): TokenBundle {
  const vault = loadVault();
  const acct = vault.accounts[id];
  if (!acct) throw new Error(`No account with id '${id}'.`);
  const { key } = resolveKey(vault);
  return JSON.parse(decrypt(acct.enc, key)) as TokenBundle;
}

export interface UpsertInput {
  id: string;
  provider: string;
  label: string;
  email?: string;
  scopes: string[];
  tokens: TokenBundle;
}

export function upsertAccount(input: UpsertInput): AccountMeta {
  const loaded = loadVault();
  const { key, vault } = resolveKey(loaded);
  const now = Date.now();
  const existing = vault.accounts[input.id];
  const record: StoredAccount = {
    id: input.id,
    provider: input.provider,
    label: input.label,
    email: input.email,
    scopes: input.scopes,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    enc: encrypt(JSON.stringify(input.tokens), key),
  };
  vault.accounts[input.id] = record;
  saveVault(vault);
  return stripSecret(record);
}

/** Replace just the token bundle (e.g. after a refresh). */
export function updateTokens(id: string, tokens: TokenBundle): void {
  const loaded = loadVault();
  const { key, vault } = resolveKey(loaded);
  const acct = vault.accounts[id];
  if (!acct) throw new Error(`No account with id '${id}'.`);
  acct.enc = encrypt(JSON.stringify(tokens), key);
  acct.updated_at = Date.now();
  saveVault(vault);
}

export function deleteAccount(id: string): boolean {
  const vault = loadVault();
  if (!vault.accounts[id]) return false;
  delete vault.accounts[id];
  saveVault(vault);
  return true;
}

export { MAC_HOME };
