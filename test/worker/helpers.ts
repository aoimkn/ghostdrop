import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { expect } from "vitest";

import { SoftwareAuthenticator } from "./authenticator";
import { Client, ORIGIN } from "./client";

export type Passkey = { id: string };

export async function signUp(
  client = new Client(),
  authenticator = new SoftwareAuthenticator(ORIGIN),
) {
  const options = await client.json<PublicKeyCredentialCreationOptionsJSON>(
    "POST",
    "/api/sign-up/options",
  );
  const passphrase = newPassphrase();
  const response = await client.request(
    "POST",
    "/api/sign-up",
    signUpBody(await authenticator.create(options), passphrase),
  );
  expect(response.status).toBe(204);
  return { client, authenticator, passphrase, accountId: options.user.id };
}

export async function signIn(authenticator: SoftwareAuthenticator, client = new Client()) {
  const options = await client.json<PublicKeyCredentialRequestOptionsJSON>(
    "POST",
    "/api/sign-in/options",
  );
  return {
    client,
    response: await client.request("POST", "/api/sign-in", await authenticator.get(options)),
  };
}

export type AddPasskeyOptions = {
  confirm: PublicKeyCredentialRequestOptionsJSON;
  create: PublicKeyCredentialCreationOptionsJSON;
};

export async function addPasskey(
  client: Client,
  existing: SoftwareAuthenticator,
  added: SoftwareAuthenticator,
) {
  const options = await client.json<AddPasskeyOptions>("POST", "/api/passkeys/options");
  return client.request("POST", "/api/passkeys", {
    confirmation: await existing.get(options.confirm),
    credential: await added.create(options.create),
  });
}

export type PassphraseMaterial = { params: string; proof: string };

export function newPassphrase(): PassphraseMaterial {
  return { params: randomBase64URL(17), proof: randomBase64URL(32) };
}

export function signUpBody(
  credential: RegistrationResponseJSON,
  passphrase = newPassphrase(),
  name = "first",
) {
  return { credential, passphrase, device: { name } };
}

function randomBase64URL(length: number): string {
  return isoBase64URL.fromBuffer(crypto.getRandomValues(new Uint8Array(length)));
}
