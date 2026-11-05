import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

export type Passkey = { id: string; aaguid: string; createdAt: number; lastUsedAt: number | null };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

export async function signUp(): Promise<void> {
  const optionsJSON = await api<PublicKeyCredentialCreationOptionsJSON>(
    "POST",
    "/api/sign-up/options",
  );
  await api("POST", "/api/sign-up", await startRegistration({ optionsJSON }));
}

export async function signIn(): Promise<void> {
  const optionsJSON = await api<PublicKeyCredentialRequestOptionsJSON>(
    "POST",
    "/api/sign-in/options",
  );
  await api("POST", "/api/sign-in", await startAuthentication({ optionsJSON }));
}

export async function signOut(): Promise<void> {
  await api("POST", "/api/sign-out");
}

export async function getSession(): Promise<{ accountId: string } | null> {
  try {
    return await api<{ accountId: string }>("GET", "/api/session");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function listPasskeys(): Promise<Passkey[]> {
  return api<Passkey[]>("GET", "/api/passkeys");
}

export async function addPasskey(): Promise<void> {
  const optionsJSON = await api<PublicKeyCredentialCreationOptionsJSON>(
    "POST",
    "/api/passkeys/options",
  );
  await api("POST", "/api/passkeys", await startRegistration({ optionsJSON }));
}

export async function removePasskey(id: string): Promise<void> {
  await api("DELETE", `/api/passkeys/${encodeURIComponent(id)}`);
}

async function api<T = void>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const { error } = (await response.json().catch(() => ({ error: "unknown" }))) as {
      error: string;
    };
    throw new ApiError(response.status, error);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}
