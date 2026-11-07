import { z } from "zod";

const apiError = z.object({ error: z.string() });

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds: number | null = null,
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
    throw apiErrorOf(
      response.status,
      await response.json().catch(() => null),
      response.headers.get("Retry-After"),
    );
  }
  return response;
}

// fetch cannot report how much of a request body has been sent, XMLHttpRequest can.
export function upload(
  path: string,
  body: XMLHttpRequestBodyInit,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (loaded: number) => void } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason);
      return;
    }
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    xhr.upload.addEventListener("progress", (event) => onProgress?.(event.loaded));
    xhr.addEventListener("loadend", () => {
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted === true) {
        reject(signal.reason);
      } else if (xhr.status === 0) {
        reject(new TypeError("upload failed"));
      } else if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          apiErrorOf(xhr.status, parseJson(xhr.responseText), xhr.getResponseHeader("Retry-After")),
        );
      } else {
        resolve();
      }
    });
    xhr.open("PUT", path);
    xhr.send(body);
  });
}

function apiErrorOf(status: number, body: unknown, retryAfterHeader: string | null): ApiError {
  const parsed = apiError.safeParse(body);
  const retryAfter = Number.parseInt(retryAfterHeader ?? "", 10);
  return new ApiError(
    status,
    parsed.success ? parsed.data.error : "unknown",
    Number.isNaN(retryAfter) ? null : retryAfter,
  );
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
