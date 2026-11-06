import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { createContext, type MiddlewareFunction } from "react-router";

import { cloudflareContext } from "./context";
import { error } from "./http";

const COOKIE_NAME = "__Host-session";
const LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const COOKIE_VALUE = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;

export type Session = { accountId: string; tokenHash: string };

export const sessionContext = createContext<Session>();

export function account(env: Env, accountId: string) {
  return env.ACCOUNT.get(env.ACCOUNT.idFromName(accountId));
}

export async function startSession(
  env: Env,
  accountId: string,
): Promise<{ cookie: string; tokenHash: string }> {
  const token = isoBase64URL.fromBuffer(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await hash(token);
  await account(env, accountId).createSession(tokenHash, Date.now() + LIFETIME_MS);
  return { cookie: sessionCookie(`${accountId}.${token}`, LIFETIME_MS / 1000), tokenHash };
}

export function clearedSessionCookie(): string {
  return sessionCookie("", 0);
}

// Reading a session also extends it, as any use of the account does.
export async function readSession(
  env: Env,
  request: Request,
): Promise<(Session & { cookie: string }) | null> {
  const cookie = readCookie(request, COOKIE_NAME);
  const [, accountId, token] = COOKIE_VALUE.exec(cookie ?? "") ?? [];
  if (cookie === null || accountId === undefined || token === undefined) return null;
  const tokenHash = await hash(token);
  if (!(await account(env, accountId).extendSession(tokenHash, Date.now() + LIFETIME_MS))) {
    return null;
  }
  return { accountId, tokenHash, cookie };
}

export const requireSession: MiddlewareFunction<Response> = async ({ request, context }, next) => {
  const { env } = context.get(cloudflareContext);
  const session = await readSession(env, request);
  if (session === null) throw error(401, "unauthenticated");
  context.set(sessionContext, { accountId: session.accountId, tokenHash: session.tokenHash });
  const response = await next();
  if (!response.headers.has("Set-Cookie")) {
    response.headers.append("Set-Cookie", sessionCookie(session.cookie, LIFETIME_MS / 1000));
  }
  return response;
};

function sessionCookie(value: string, maxAge: number): string {
  return `${COOKIE_NAME}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function readCookie(request: Request, name: string): string | null {
  for (const part of request.headers.get("Cookie")?.split(";") ?? []) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

async function hash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return isoBase64URL.fromBuffer(new Uint8Array(digest));
}
