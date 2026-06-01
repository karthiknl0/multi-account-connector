import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { TokenBundle } from "./types.js";

/** POST application/x-www-form-urlencoded and parse JSON. */
async function postForm(
  url: string,
  body: Record<string, string>,
  extraHeaders: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      ...extraHeaders,
    },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Some endpoints return urlencoded bodies on error.
    return Object.fromEntries(new URLSearchParams(text));
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export interface DeviceFlowConfig {
  deviceCodeUrl: string;
  tokenUrl: string;
  clientId: string;
  scope: string;
}

/**
 * RFC 8628 device authorization flow. Prints the verification URL + user code
 * to stderr and polls until the user approves. Interactive — CLI only.
 */
export async function deviceFlowLogin(cfg: DeviceFlowConfig): Promise<TokenBundle> {
  const start = await postForm(cfg.deviceCodeUrl, {
    client_id: cfg.clientId,
    scope: cfg.scope,
  });

  const deviceCode = String(start["device_code"] ?? "");
  const userCode = String(start["user_code"] ?? "");
  const verificationUri = String(
    start["verification_uri"] ?? start["verification_url"] ?? "",
  );
  let interval = Number(start["interval"] ?? 5);
  if (!deviceCode || !userCode || !verificationUri) {
    throw new Error(
      `Device flow init failed: ${JSON.stringify(start)}`,
    );
  }

  console.error("\n=== Authorize this account ===");
  console.error(`1. Open: ${verificationUri}`);
  console.error(`2. Enter code: ${userCode}\n`);
  console.error("Waiting for approval...");

  const deadline = Date.now() + Number(start["expires_in"] ?? 900) * 1000;
  for (;;) {
    if (Date.now() > deadline) throw new Error("Device flow timed out.");
    await sleep(interval * 1000);
    const poll = await postForm(cfg.tokenUrl, {
      client_id: cfg.clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    const error = poll["error"] ? String(poll["error"]) : undefined;
    if (!error && poll["access_token"]) return toBundle(poll);
    if (error === "authorization_pending") continue;
    if (error === "slow_down") {
      interval += 5;
      continue;
    }
    throw new Error(`Authorization failed: ${error ?? "unknown error"}`);
  }
}

export interface PkceLoopbackConfig {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scope: string;
  /** Loopback port to listen on for the redirect. */
  port: number;
}

/**
 * OAuth 2.0 authorization-code + PKCE flow for installed apps, using a
 * loopback redirect (RFC 8252). Opens nothing automatically — prints the URL
 * for the human to open. CLI only.
 */
export async function pkceLoopbackLogin(
  cfg: PkceLoopbackConfig,
): Promise<TokenBundle> {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("hex");
  const redirectUri = `http://127.0.0.1:${cfg.port}/callback`;

  const authParams = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: cfg.scope,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    access_type: "offline",
    prompt: "consent",
  });

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "", redirectUri);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const returnedState = url.searchParams.get("state");
      const returnedCode = url.searchParams.get("code");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body>You can close this tab and return to the terminal.</body></html>");
      server.close();
      if (returnedState !== state) {
        reject(new Error("State mismatch — possible CSRF, aborting."));
        return;
      }
      if (!returnedCode) {
        reject(new Error("No authorization code returned."));
        return;
      }
      resolve(returnedCode);
    });
    server.on("error", reject);
    server.listen(cfg.port, "127.0.0.1", () => {
      console.error("\n=== Authorize this account ===");
      console.error(`Open this URL in your browser:\n${cfg.authUrl}?${authParams.toString()}\n`);
      console.error("Waiting for redirect...");
    });
  });

  const tokenBody: Record<string, string> = {
    client_id: cfg.clientId,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  };
  if (cfg.clientSecret) tokenBody["client_secret"] = cfg.clientSecret;

  const tok = await postForm(cfg.tokenUrl, tokenBody);
  if (!tok["access_token"]) {
    throw new Error(`Token exchange failed: ${JSON.stringify(tok)}`);
  }
  return toBundle(tok);
}

/** Exchange a refresh token for a fresh access token. */
export async function refreshGrant(
  tokenUrl: string,
  clientId: string,
  refreshToken: string,
  clientSecret?: string,
): Promise<TokenBundle> {
  const body: Record<string, string> = {
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  };
  if (clientSecret) body["client_secret"] = clientSecret;
  const tok = await postForm(tokenUrl, body);
  if (!tok["access_token"]) {
    throw new Error(`Token refresh failed: ${JSON.stringify(tok)}`);
  }
  const bundle = toBundle(tok);
  // Refresh responses often omit the refresh token; keep the old one.
  if (!bundle.refresh_token) bundle.refresh_token = refreshToken;
  return bundle;
}

function toBundle(tok: Record<string, unknown>): TokenBundle {
  const expiresIn = tok["expires_in"] ? Number(tok["expires_in"]) : undefined;
  return {
    access_token: String(tok["access_token"]),
    refresh_token: tok["refresh_token"] ? String(tok["refresh_token"]) : undefined,
    token_type: tok["token_type"] ? String(tok["token_type"]) : "Bearer",
    expires_at: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
  };
}
