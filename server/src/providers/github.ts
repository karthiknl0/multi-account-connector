import { z } from "zod";
import { deviceFlowLogin, refreshGrant } from "../oauth.js";
import type { TokenBundle } from "../types.js";
import type {
  ActionContext,
  LoginResult,
  Provider,
  ProviderAction,
} from "./types.js";

const BASE_URL = "https://api.github.com";
const DEVICE_CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const DEFAULT_SCOPE = "read:user repo";

async function asJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

const listReposSchema = z
  .object({
    visibility: z.enum(["all", "public", "private"]).default("all"),
    per_page: z.number().int().min(1).max(100).default(30),
    page: z.number().int().min(1).default(1),
  })
  .strict();

const repoRefSchema = z
  .object({
    owner: z.string().min(1).describe("Repository owner/org login"),
    repo: z.string().min(1).describe("Repository name"),
  })
  .strict();

const createIssueSchema = repoRefSchema
  .extend({
    title: z.string().min(1).describe("Issue title"),
    body: z.string().optional().describe("Issue body (markdown)"),
  })
  .strict();

const actions: Record<string, ProviderAction> = {
  whoami: {
    name: "whoami",
    mode: "read",
    destructive: false,
    description: "Get the authenticated user's GitHub profile (login, name, id).",
    schema: z.object({}).strict(),
    async run(ctx: ActionContext): Promise<unknown> {
      const user = (await asJson(await ctx.authedFetch("/user"))) as Record<
        string,
        unknown
      >;
      return {
        login: user["login"],
        id: user["id"],
        name: user["name"],
        public_repos: user["public_repos"],
      };
    },
  },
  list_repos: {
    name: "list_repos",
    mode: "read",
    destructive: false,
    description:
      "List repositories the account can access. Params: visibility (all|public|private), per_page (1-100), page.",
    schema: listReposSchema,
    async run(ctx: ActionContext, params: unknown): Promise<unknown> {
      const p = listReposSchema.parse(params);
      const qs = new URLSearchParams({
        visibility: p.visibility,
        per_page: String(p.per_page),
        page: String(p.page),
        sort: "updated",
      });
      const repos = (await asJson(
        await ctx.authedFetch(`/user/repos?${qs.toString()}`),
      )) as Array<Record<string, unknown>>;
      return repos.map((r) => ({
        full_name: r["full_name"],
        private: r["private"],
        description: r["description"],
        updated_at: r["updated_at"],
      }));
    },
  },
  list_issues: {
    name: "list_issues",
    mode: "read",
    destructive: false,
    description: "List open issues for a repo. Params: owner, repo.",
    schema: repoRefSchema,
    async run(ctx: ActionContext, params: unknown): Promise<unknown> {
      const p = repoRefSchema.parse(params);
      const issues = (await asJson(
        await ctx.authedFetch(`/repos/${p.owner}/${p.repo}/issues?state=open`),
      )) as Array<Record<string, unknown>>;
      return issues.map((i) => ({
        number: i["number"],
        title: i["title"],
        state: i["state"],
      }));
    },
  },
  create_issue: {
    name: "create_issue",
    mode: "write",
    destructive: false,
    description: "Create an issue. Params: owner, repo, title, body (optional).",
    schema: createIssueSchema,
    async run(ctx: ActionContext, params: unknown): Promise<unknown> {
      const p = createIssueSchema.parse(params);
      const created = (await asJson(
        await ctx.authedFetch(`/repos/${p.owner}/${p.repo}/issues`, {
          method: "POST",
          body: JSON.stringify({ title: p.title, body: p.body }),
        }),
      )) as Record<string, unknown>;
      return { number: created["number"], url: created["html_url"] };
    },
  },
  delete_repo: {
    name: "delete_repo",
    mode: "write",
    destructive: true,
    description:
      "PERMANENTLY delete a repository. Params: owner, repo. Requires confirm:true and the destructive policy enabled.",
    schema: repoRefSchema,
    async run(ctx: ActionContext, params: unknown): Promise<unknown> {
      const p = repoRefSchema.parse(params);
      const res = await ctx.authedFetch(`/repos/${p.owner}/${p.repo}`, {
        method: "DELETE",
      });
      if (res.status !== 204) {
        throw new Error(`Delete failed: GitHub API ${res.status}`);
      }
      return { deleted: `${p.owner}/${p.repo}` };
    },
  },
};

export const githubProvider: Provider = {
  id: "github",
  label: "GitHub",
  baseUrl: BASE_URL,
  actions,

  async login(): Promise<LoginResult> {
    const clientId = process.env.GITHUB_CLIENT_ID?.trim();
    if (!clientId) {
      throw new Error(
        "GITHUB_CLIENT_ID is not set. Create an OAuth App (enable Device Flow) and export its Client ID.",
      );
    }
    const scope = process.env.GITHUB_SCOPE?.trim() || DEFAULT_SCOPE;
    const tokens = await deviceFlowLogin({
      deviceCodeUrl: DEVICE_CODE_URL,
      tokenUrl: TOKEN_URL,
      clientId,
      scope,
    });

    // Fetch identity + granted scopes (scopes come back in a response header).
    const res = await fetch(`${BASE_URL}/user`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "multi-account-connector",
      },
    });
    const user = (await asJson(res)) as Record<string, unknown>;
    const scopeHeader = res.headers.get("x-oauth-scopes") ?? "";
    const scopes = scopeHeader
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      tokens,
      label: `github:${String(user["login"])}`,
      email: user["email"] ? String(user["email"]) : undefined,
      scopes: scopes.length ? scopes : scope.split(" "),
    };
  },

  async refresh(bundle: TokenBundle): Promise<TokenBundle | null> {
    // OAuth App device-flow tokens don't expire. Only GitHub App user tokens do.
    if (!bundle.refresh_token) return null;
    const clientId = process.env.GITHUB_CLIENT_ID?.trim();
    const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
    if (!clientId) return null;
    return refreshGrant(TOKEN_URL, clientId, bundle.refresh_token, clientSecret);
  },
};
