import type { z } from "zod";
import type { TokenBundle } from "../types.js";

/** Passed to every action. Injects the account's bearer token internally. */
export interface ActionContext {
  accountId: string;
  /** Fetch against the provider base URL with the account token attached. */
  authedFetch(path: string, init?: RequestInit): Promise<Response>;
}

export interface ProviderAction {
  name: string;
  mode: "read" | "write";
  /** Destructive actions are gated server-side (policy + explicit confirm). */
  destructive: boolean;
  description: string;
  schema: z.ZodType;
  run(ctx: ActionContext, params: unknown): Promise<unknown>;
}

export interface LoginResult {
  tokens: TokenBundle;
  label: string;
  email?: string;
  scopes: string[];
}

export interface Provider {
  id: string;
  label: string;
  /** API base URL used by authedFetch. */
  baseUrl: string;
  /** Interactive OAuth login. CLI only. */
  login(): Promise<LoginResult>;
  /** Return a refreshed bundle, or null if no refresh is possible/needed. */
  refresh(bundle: TokenBundle): Promise<TokenBundle | null>;
  actions: Record<string, ProviderAction>;
}
