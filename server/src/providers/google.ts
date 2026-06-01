import { z } from "zod";
import { pkceLoopbackLogin, refreshGrant } from "../oauth.js";
import type { TokenBundle } from "../types.js";
import type {
  ActionContext,
  LoginResult,
  Provider,
  ProviderAction,
} from "./types.js";

const BASE_URL = "https://www.googleapis.com";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const DEFAULT_SCOPE =
  "openid email https://www.googleapis.com/auth/drive.metadata.readonly";

async function asJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Google API ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

const listFilesSchema = z
  .object({
    page_size: z.number().int().min(1).max(100).default(20),
    query: z
      .string()
      .optional()
      .describe("Drive query string, e.g. \"name contains 'report'\""),
  })
  .strict();

const actions: Record<string, ProviderAction> = {
  whoami: {
    name: "whoami",
    mode: "read",
    destructive: false,
    description: "Get the authenticated Google user's basic profile (email, name).",
    schema: z.object({}).strict(),
    async run(ctx: ActionContext): Promise<unknown> {
      const info = (await asJson(await ctx.authedFetch(USERINFO_URL))) as Record<
        string,
        unknown
      >;
      return { email: info["email"], name: info["name"], sub: info["sub"] };
    },
  },
  list_drive_files: {
    name: "list_drive_files",
    mode: "read",
    destructive: false,
    description:
      "List Drive files (metadata only). Params: page_size (1-100), query (optional Drive query).",
    schema: listFilesSchema,
    async run(ctx: ActionContext, params: unknown): Promise<unknown> {
      const p = listFilesSchema.parse(params);
      const qs = new URLSearchParams({
        pageSize: String(p.page_size),
        fields: "files(id,name,mimeType,modifiedTime)",
      });
      if (p.query) qs.set("q", p.query);
      const data = (await asJson(
        await ctx.authedFetch(`/drive/v3/files?${qs.toString()}`),
      )) as Record<string, unknown>;
      return data["files"] ?? [];
    },
  },
};

export const googleProvider: Provider = {
  id: "google",
  label: "Google",
  baseUrl: BASE_URL,
  actions,

  async login(): Promise<LoginResult> {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId) {
      throw new Error(
        "GOOGLE_CLIENT_ID is not set. Create an OAuth client (Desktop app) in Google Cloud Console and export GOOGLE_CLIENT_ID (and GOOGLE_CLIENT_SECRET).",
      );
    }
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const scope = process.env.GOOGLE_SCOPE?.trim() || DEFAULT_SCOPE;
    const port = Number(process.env.GOOGLE_OAUTH_PORT ?? 4380);

    const tokens = await pkceLoopbackLogin({
      authUrl: AUTH_URL,
      tokenUrl: TOKEN_URL,
      clientId,
      clientSecret,
      scope,
      port,
    });

    const info = (await asJson(
      await fetch(USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }),
    )) as Record<string, unknown>;

    return {
      tokens,
      label: `google:${String(info["email"] ?? "unknown")}`,
      email: info["email"] ? String(info["email"]) : undefined,
      scopes: scope.split(" "),
    };
  },

  async refresh(bundle: TokenBundle): Promise<TokenBundle | null> {
    if (!bundle.refresh_token) return null;
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId) return null;
    return refreshGrant(TOKEN_URL, clientId, bundle.refresh_token, clientSecret);
  },
};
