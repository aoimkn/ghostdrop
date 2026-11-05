import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { z } from "zod";

const creationOptions = z.looseObject({
  rp: z.looseObject({ name: z.string(), id: z.string().optional() }),
  user: z.looseObject({ id: z.string(), name: z.string(), displayName: z.string() }),
  challenge: z.string(),
  pubKeyCredParams: z.array(z.looseObject({ alg: z.number(), type: z.literal("public-key") })),
}) satisfies z.ZodType<PublicKeyCredentialCreationOptionsJSON>;

const requestOptions = z.looseObject({
  challenge: z.string(),
}) satisfies z.ZodType<PublicKeyCredentialRequestOptionsJSON>;

const session = z.object({ accountId: z.string() });

const passkey = z.object({
  id: z.string(),
  aaguid: z.string(),
  createdAt: z.number(),
  lastUsedAt: z.number().nullable(),
});

const apiError = z.object({ error: z.string() });

export type Passkey = z.infer<typeof passkey>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

export async function signUp(): Promise<void> {
  const optionsJSON = creationOptions.parse(await call("POST", "/api/sign-up/options"));
  await call("POST", "/api/sign-up", await startRegistration({ optionsJSON }));
}

export async function signIn(): Promise<void> {
  const optionsJSON = requestOptions.parse(await call("POST", "/api/sign-in/options"));
  await call("POST", "/api/sign-in", await startAuthentication({ optionsJSON }));
}

export async function signOut(): Promise<void> {
  await call("POST", "/api/sign-out");
}

export async function getSession(): Promise<z.infer<typeof session> | null> {
  try {
    return session.parse(await call("GET", "/api/session"));
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function listPasskeys(): Promise<Passkey[]> {
  return z.array(passkey).parse(await call("GET", "/api/passkeys"));
}

export async function addPasskey(): Promise<void> {
  const optionsJSON = creationOptions.parse(await call("POST", "/api/passkeys/options"));
  await call("POST", "/api/passkeys", await startRegistration({ optionsJSON }));
}

export async function removePasskey(id: string): Promise<void> {
  await call("DELETE", `/api/passkeys/${encodeURIComponent(id)}`);
}

async function call(method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const parsed = apiError.safeParse(await response.json().catch(() => null));
    throw new ApiError(response.status, parsed.success ? parsed.data.error : "unknown");
  }
  return response.status === 204 ? undefined : response.json();
}
