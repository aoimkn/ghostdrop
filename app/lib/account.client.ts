import {
  base64URLStringToBuffer,
  bufferToBase64URLString,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { z } from "zod";

import { ApiError, call } from "./api.client";
import { clearKey, loadKey, saveKey } from "./keystore.client";
import { isValidDeviceName } from "./device-name";
import { deriveKey, isLongEnough, newParams, proof } from "./passphrase";

const creationOptions = z.looseObject({
  rp: z.looseObject({ name: z.string(), id: z.string().optional() }),
  user: z.looseObject({ id: z.string(), name: z.string(), displayName: z.string() }),
  challenge: z.string(),
  pubKeyCredParams: z.array(z.looseObject({ alg: z.number(), type: z.literal("public-key") })),
}) satisfies z.ZodType<PublicKeyCredentialCreationOptionsJSON>;

const requestOptions = z.looseObject({
  challenge: z.string(),
}) satisfies z.ZodType<PublicKeyCredentialRequestOptionsJSON>;

const session = z.object({
  accountId: z.string(),
  device: z.object({ id: z.string(), name: z.string(), locked: z.boolean() }).nullable(),
});

const device = z.object({
  id: z.string(),
  name: z.string(),
  locked: z.boolean(),
  current: z.boolean(),
  createdAt: z.number(),
});

const passphraseParams = z.object({ params: z.string() });

const passkey = z.object({
  id: z.string(),
  aaguid: z.string(),
  createdAt: z.number(),
  lastUsedAt: z.number().nullable(),
});

export type Passkey = z.infer<typeof passkey>;

export type Device = z.infer<typeof device>;

export type Session = z.infer<typeof session> & { unlocked: boolean };

class PassphraseTooShortError extends Error {}

class InvalidDeviceNameError extends Error {}

export async function signUp(passphrase: string, deviceName: string): Promise<void> {
  requireValidName(deviceName);
  const { params, key } = await newPassphrase(passphrase);
  const optionsJSON = creationOptions.parse(await call("POST", "/api/sign-up/options"));
  await call("POST", "/api/sign-up", {
    credential: await startRegistration({ optionsJSON }),
    passphrase: { params: encode(params), proof: encode(await proof(key)) },
    device: { name: deviceName },
  });
  await saveKey(key);
}

export async function signIn(): Promise<void> {
  const optionsJSON = requestOptions.parse(await call("POST", "/api/sign-in/options"));
  await call("POST", "/api/sign-in", await startAuthentication({ optionsJSON }));
}

export async function signOut(): Promise<void> {
  await call("POST", "/api/sign-out");
  await clearKey();
}

export async function deleteAccount(): Promise<void> {
  await call("DELETE", "/api/account");
  await clearKey();
}

export async function getSession(): Promise<Session | null> {
  let current: z.infer<typeof session>;
  try {
    current = session.parse(await call("GET", "/api/session"));
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await clearKey();
      return null;
    }
    throw error;
  }
  const unlocked = current.device !== null && !current.device.locked && (await loadKey()) !== null;
  return { ...current, unlocked };
}

export async function addDevice(passphrase: string, name: string): Promise<void> {
  requireValidName(name);
  const key = await existingPassphrase(passphrase);
  await call("POST", "/api/devices", { name, proof: encode(await proof(key)) });
  await saveKey(key);
}

export async function unlockDevice(passphrase: string): Promise<void> {
  const key = await existingPassphrase(passphrase);
  await call("POST", "/api/device/unlock", { proof: encode(await proof(key)) });
  await saveKey(key);
}

export async function replacePassphrase(passphrase: string): Promise<void> {
  const { params, key } = await newPassphrase(passphrase);
  await call("PUT", "/api/passphrase", { params: encode(params), proof: encode(await proof(key)) });
  await saveKey(key);
}

export async function listDevices(): Promise<Device[]> {
  return z.array(device).parse(await call("GET", "/api/devices"));
}

export async function renameDevice(id: string, name: string): Promise<void> {
  requireValidName(name);
  await call("PATCH", `/api/devices/${encodeURIComponent(id)}`, { name });
}

export async function removeDevice(id: string): Promise<void> {
  await call("DELETE", `/api/devices/${encodeURIComponent(id)}`);
}

export async function listPasskeys(): Promise<Passkey[]> {
  return z.array(passkey).parse(await call("GET", "/api/passkeys"));
}

export async function addPasskey(): Promise<void> {
  const options = z
    .object({ confirm: requestOptions, create: creationOptions })
    .parse(await call("POST", "/api/passkeys/options"));
  const confirmation = await startAuthentication({ optionsJSON: options.confirm });
  const credential = await startRegistration({ optionsJSON: options.create });
  await call("POST", "/api/passkeys", { confirmation, credential });
}

export async function removePasskey(id: string): Promise<void> {
  await call("DELETE", `/api/passkeys/${encodeURIComponent(id)}`);
}

function requireValidName(name: string): void {
  if (!isValidDeviceName(name)) throw new InvalidDeviceNameError();
}

async function newPassphrase(passphrase: string) {
  if (!isLongEnough(passphrase)) throw new PassphraseTooShortError();
  const params = newParams();
  return { params, key: await deriveKey(passphrase, params) };
}

async function existingPassphrase(passphrase: string): Promise<CryptoKey> {
  const { params } = passphraseParams.parse(await call("GET", "/api/passphrase"));
  return deriveKey(passphrase, new Uint8Array(base64URLStringToBuffer(params)));
}

function encode(bytes: Uint8Array<ArrayBuffer>): string {
  return bufferToBase64URLString(bytes.slice().buffer);
}
