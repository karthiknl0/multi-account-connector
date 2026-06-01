#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CHARACTER_LIMIT } from "./constants.js";
import { listAccounts } from "./vault.js";
import { dispatch, getProvider, listProviders } from "./providers/registry.js";
import type { DispatchResult } from "./providers/registry.js";

const server = new McpServer({
  name: "multi-account-mcp-server",
  version: "0.1.0",
});

/** Cap large payloads so a single tool result can't blow the context window. */
function capText(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return (
    text.slice(0, CHARACTER_LIMIT) +
    `\n\n[truncated — response exceeded ${CHARACTER_LIMIT} chars; narrow your request]`
  );
}

function resultToToolResponse(result: DispatchResult): {
  content: { type: "text"; text: string }[];
  structuredContent: Record<string, unknown>;
  isError?: boolean;
} {
  if (result.status === "success") {
    const json = JSON.stringify(result.data, null, 2);
    return {
      content: [{ type: "text", text: capText(json) }],
      structuredContent: { status: "success", data: result.data },
    };
  }
  // preview / refused / error all return guidance text the model should read.
  return {
    content: [{ type: "text", text: `[${result.status}] ${result.message}` }],
    structuredContent: { status: result.status, message: result.message },
    isError: result.status === "error",
  };
}

// ---- Tool: list_accounts -------------------------------------------------
server.registerTool(
  "list_accounts",
  {
    title: "List Connected Accounts",
    description: `List all OAuth accounts connected to this server. Read-only.

Returns one entry per account with: id, provider, label, email (if known), scopes,
and timestamps. Tokens are NEVER returned. Use the returned 'id' as 'account_id'
when calling read_from_account or run_action_as_account.

Returns JSON: { "accounts": [ { "id": string, "provider": string, "label": string,
"email"?: string, "scopes": string[], "created_at": number, "updated_at": number } ] }

If empty, no accounts are connected yet — an operator must run the login CLI
(see the multi-account skill) outside of this conversation.`,
    inputSchema: z.object({}).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    const accounts = listAccounts();
    return {
      content: [{ type: "text", text: JSON.stringify({ accounts }, null, 2) }],
      structuredContent: { accounts },
    };
  },
);

// ---- Tool: list_actions --------------------------------------------------
const listActionsSchema = z
  .object({
    provider: z
      .string()
      .optional()
      .describe("Provider id (e.g. 'github'). Omit to list all providers."),
  })
  .strict();

server.registerTool(
  "list_actions",
  {
    title: "List Available Actions",
    description: `List the actions each provider supports, with their safety class. Read-only.

Use this to discover what 'action' values are valid for read_from_account and
run_action_as_account. Params: provider (optional provider id to filter).

Returns JSON: { "providers": [ { "id": string, "label": string, "actions":
[ { "name": string, "mode": "read"|"write", "destructive": boolean,
"description": string } ] } ] }

'read' actions go through read_from_account. 'write' actions go through
run_action_as_account. 'destructive' actions additionally require confirm:true.`,
    inputSchema: listActionsSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params) => {
    const p = listActionsSchema.parse(params);
    const providers = (p.provider ? [getProvider(p.provider)] : listProviders())
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .map((prov) => ({
        id: prov.id,
        label: prov.label,
        actions: Object.values(prov.actions).map((a) => ({
          name: a.name,
          mode: a.mode,
          destructive: a.destructive,
          description: a.description,
        })),
      }));
    return {
      content: [{ type: "text", text: JSON.stringify({ providers }, null, 2) }],
      structuredContent: { providers },
    };
  },
);

// ---- Tool: read_from_account --------------------------------------------
const readSchema = z
  .object({
    account_id: z.string().min(1).describe("Account id from list_accounts"),
    action: z.string().min(1).describe("A read-mode action (see list_actions)"),
    params: z
      .record(z.unknown())
      .default({})
      .describe("Action parameters as an object"),
  })
  .strict();

server.registerTool(
  "read_from_account",
  {
    title: "Read From Account",
    description: `Run a READ-ONLY action as a specific connected account.

Params:
  - account_id (string): which account to act as (from list_accounts)
  - action (string): a read-mode action name (from list_actions)
  - params (object): parameters for that action

Write or destructive actions are rejected here — use run_action_as_account.
Returns the action's JSON result on success, or a [refused]/[error] message.`,
    inputSchema: readSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async (params) => {
    const p = readSchema.parse(params);
    const result = await dispatch(p.account_id, p.action, p.params, {
      allowWrite: false,
      confirm: false,
    });
    return resultToToolResponse(result);
  },
);

// ---- Tool: run_action_as_account ----------------------------------------
const runSchema = z
  .object({
    account_id: z.string().min(1).describe("Account id from list_accounts"),
    action: z.string().min(1).describe("A read or write action (see list_actions)"),
    params: z
      .record(z.unknown())
      .default({})
      .describe("Action parameters as an object"),
    confirm: z
      .boolean()
      .default(false)
      .describe("Must be true to actually execute a destructive action"),
  })
  .strict();

server.registerTool(
  "run_action_as_account",
  {
    title: "Run Action As Account",
    description: `Run a read OR write action as a specific connected account.

Params:
  - account_id (string): which account to act as (from list_accounts)
  - action (string): action name (from list_actions)
  - params (object): parameters for that action
  - confirm (boolean): required true for destructive actions (default false)

Safety: destructive actions are gated server-side. Without confirm:true a
destructive call returns a [preview] and makes NO changes. Destructive actions
are also blocked entirely unless an operator enabled them via policy. Always run
list_actions first to see which actions are marked destructive.`,
    inputSchema: runSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (params) => {
    const p = runSchema.parse(params);
    const result = await dispatch(p.account_id, p.action, p.params, {
      allowWrite: true,
      confirm: p.confirm,
    });
    return resultToToolResponse(result);
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("multi-account-mcp-server running via stdio");
}

main().catch((error: unknown) => {
  console.error("Server error:", error);
  process.exit(1);
});
