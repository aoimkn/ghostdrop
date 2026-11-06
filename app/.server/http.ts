import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { MiddlewareFunction } from "react-router";
import { z } from "zod";

export function error(status: number, code: string, init: ResponseInit = {}): Response {
  return Response.json({ error: code }, { ...init, status });
}

export function tooManyAttempts(retryAt: number): Response {
  const seconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
  return error(429, "too-many-attempts", { headers: { "Retry-After": String(seconds) } });
}

export const base64url = z.string().regex(/^[A-Za-z0-9_-]+$/);

export function base64urlBytes({ maxBytes }: { maxBytes: number }) {
  return base64url
    .max(Math.ceil((maxBytes * 4) / 3))
    .transform((value) => isoBase64URL.toBuffer(value))
    .refine((value) => value.length <= maxBytes);
}

export async function readJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  const body: unknown = await request.json().catch(() => undefined);
  const result = schema.safeParse(body);
  if (!result.success) throw error(400, "invalid-request");
  return result.data;
}

export function isSameOrigin(request: Request): boolean {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

// React Router's built-in action origin check covers UI routes only, not resource routes.
export const requireSameOrigin: MiddlewareFunction<Response> = ({ request }, next) => {
  if (request.method !== "GET" && request.method !== "HEAD" && !isSameOrigin(request)) {
    throw error(403, "cross-origin");
  }
  return next();
};
