import { z } from "zod";

const apiError = z.object({ error: z.string() });

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

export async function call(method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await request(
    method,
    path,
    body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  return response.status === 204 ? undefined : response.json();
}

export async function request(method: string, path: string, init: RequestInit = {}) {
  const response = await fetch(path, { ...init, method });
  if (!response.ok) {
    const parsed = apiError.safeParse(await response.json().catch(() => null));
    throw new ApiError(response.status, parsed.success ? parsed.data.error : "unknown");
  }
  return response;
}
