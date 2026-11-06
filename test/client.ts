import { exports } from "cloudflare:workers";

export const ORIGIN = "https://ghostdrop.test";

export class Client {
  cookie: string | null = null;

  async request(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = await exports.default.fetch(`${ORIGIN}${path}`, {
      method,
      headers: {
        ...(method === "GET" ? {} : { Origin: ORIGIN }),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(this.cookie === null ? {} : { Cookie: this.cookie }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get("Set-Cookie");
    if (setCookie !== null) {
      const [pair = ""] = setCookie.split(";");
      this.cookie = pair.endsWith("=") ? null : pair;
    }
    return response;
  }

  async upload(path: string, body: Uint8Array<ArrayBuffer>) {
    return exports.default.fetch(`${ORIGIN}${path}`, {
      method: "PUT",
      headers: {
        Origin: ORIGIN,
        "Content-Length": String(body.length),
        ...(this.cookie === null ? {} : { Cookie: this.cookie }),
      },
      body,
    });
  }

  async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.request(method, path, body);
    if (!response.ok)
      throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    return response.json<T>();
  }
}
