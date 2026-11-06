import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { expect } from "vitest";

import { SoftwareAuthenticator } from "./authenticator";
import { Client, newPassphrase, ORIGIN, signUpBody } from "./client";

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
