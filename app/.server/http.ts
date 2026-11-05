import type { MiddlewareFunction } from "react-router";
import type { z } from "zod";

export function error(status: number, code: string): Response {
  return Response.json({ error: code }, { status });
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

// React Router's built-in action origin check covers UI routes only, not resource routes.
export const requireSameOrigin: MiddlewareFunction<Response> = ({ request }, next) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    if (request.headers.get("Origin") !== new URL(request.url).origin)
      throw error(403, "cross-origin");
  }
  return next();
};
