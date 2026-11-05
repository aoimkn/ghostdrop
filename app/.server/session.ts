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

export async function startSession(env: Env, accountId: string): Promise<string> {
  const token = isoBase64URL.fromBuffer(crypto.getRandomValues(new Uint8Array(32)));
  await account(env, accountId).createSession(await hash(token), Date.now() + LIFETIME_MS);
  return sessionCookie(`${accountId}.${token}`, LIFETIME_MS / 1000);
}

export function clearedSessionCookie(): string {
  return sessionCookie("", 0);
}

export const requireSession: MiddlewareFunction<Response> = async ({ request, context }, next) => {
  const { env } = context.get(cloudflareContext);
  const value = readCookie(request, COOKIE_NAME);
  const match = value ? COOKIE_VALUE.exec(value) : null;
  if (!match) throw error(401, "unauthenticated");
  const [, accountId, token] = match;
  const tokenHash = await hash(token);
  if (!(await account(env, accountId).extendSession(tokenHash, Date.now() + LIFETIME_MS))) {
    throw error(401, "unauthenticated");
  }
  context.set(sessionContext, { accountId, tokenHash });
  const response = await next();
  if (!response.headers.has("Set-Cookie")) {
    response.headers.append("Set-Cookie", sessionCookie(value!, LIFETIME_MS / 1000));
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
