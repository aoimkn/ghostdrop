import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { assert, describe, expect, it } from "vitest";

import { SoftwareAuthenticator } from "./authenticator";
import { Client, ORIGIN } from "./client";
import {
  addPasskey,
  type AddPasskeyOptions,
  type Passkey,
  signIn,
  signUp,
  signUpBody,
} from "./helpers";

describe("sign-up", () => {
  it("creates an account and signs in as its first device", async () => {
    const { client, accountId } = await signUp();
    expect(await client.json("GET", "/api/session")).toEqual({
      accountId,
      device: { id: expect.any(String), name: "first", locked: false },
    });
  });

  it("asks for a discoverable, user-verified passkey", async () => {
    const options = await new Client().json<PublicKeyCredentialCreationOptionsJSON>(
      "POST",
      "/api/sign-up/options",
    );
    expect(options.rp).toEqual({ id: "ghostdrop.test", name: "ghostdrop" });
    expect(options.user.name).toBe("ghostdrop");
    expect(options.authenticatorSelection).toMatchObject({
      residentKey: "required",
      userVerification: "required",
    });
  });

  it("rejects a challenge used twice", async () => {
    const client = new Client();
    const authenticator = new SoftwareAuthenticator(ORIGIN);
    const options = await client.json<PublicKeyCredentialCreationOptionsJSON>(
      "POST",
      "/api/sign-up/options",
    );
    const body = signUpBody(await authenticator.create(options));
    expect((await client.request("POST", "/api/sign-up", body)).status).toBe(204);
    expect((await new Client().request("POST", "/api/sign-up", body)).status).toBe(400);
  });

  it("rejects a response for another origin", async () => {
    const client = new Client();
    const options = await client.json<PublicKeyCredentialCreationOptionsJSON>(
      "POST",
      "/api/sign-up/options",
    );
    const credential = await new SoftwareAuthenticator(ORIGIN).create(options, {
      origin: "https://evil.test",
    });
    expect((await client.request("POST", "/api/sign-up", signUpBody(credential))).status).toBe(400);
  });

  it("rejects a passkey without user verification", async () => {
    const client = new Client();
    const options = await client.json<PublicKeyCredentialCreationOptionsJSON>(
      "POST",
      "/api/sign-up/options",
    );
    const credential = await new SoftwareAuthenticator(ORIGIN).create(options, {
      userVerified: false,
    });
    expect((await client.request("POST", "/api/sign-up", signUpBody(credential))).status).toBe(400);
  });

  it("rejects a sign-in challenge", async () => {
    const client = new Client();
    const signUpOptions = await client.json<PublicKeyCredentialCreationOptionsJSON>(
      "POST",
      "/api/sign-up/options",
    );
    const signInOptions = await client.json<PublicKeyCredentialRequestOptionsJSON>(
      "POST",
      "/api/sign-in/options",
    );
    const credential = await new SoftwareAuthenticator(ORIGIN).create({
      ...signUpOptions,
      challenge: signInOptions.challenge,
    });
    expect((await client.request("POST", "/api/sign-up", signUpBody(credential))).status).toBe(400);
  });

  it("rejects an invalid body", async () => {
    expect((await new Client().request("POST", "/api/sign-up", { id: "x" })).status).toBe(400);
  });
});

describe("sign-in", () => {
  it("signs in with a discoverable passkey", async () => {
    const { authenticator, accountId } = await signUp();
    const { client, response } = await signIn(authenticator);
    expect(response.status).toBe(204);
    expect(await client.json("GET", "/api/session")).toEqual({ accountId, device: null });
  });

  it("asks for user verification without listing credentials", async () => {
    const options = await new Client().json<PublicKeyCredentialRequestOptionsJSON>(
      "POST",
      "/api/sign-in/options",
    );
    expect(options.userVerification).toBe("required");
    expect(options.allowCredentials ?? []).toEqual([]);
  });

  it("rejects an unknown passkey", async () => {
    const authenticator = new SoftwareAuthenticator(ORIGIN);
    const client = new Client();
    await authenticator.create(
      await client.json<PublicKeyCredentialCreationOptionsJSON>("POST", "/api/sign-up/options"),
    );
    const { response } = await signIn(authenticator);
    expect(response.status).toBe(400);
  });

  it("rejects a passkey presented for another account", async () => {
    const first = await signUp();
    const second = await signUp();
    const [credential] = first.authenticator.credentials;
    assert(credential !== undefined);
    credential.userHandle = second.accountId;
    const { response } = await signIn(first.authenticator);
    expect(response.status).toBe(400);
  });

  it("rejects an assertion without user verification", async () => {
    const { authenticator } = await signUp();
    const client = new Client();
    const options = await client.json<PublicKeyCredentialRequestOptionsJSON>(
      "POST",
      "/api/sign-in/options",
    );
    const assertion = await authenticator.get(options, { userVerified: false });
    expect((await client.request("POST", "/api/sign-in", assertion)).status).toBe(400);
  });

  it("rejects a replayed assertion", async () => {
    const { authenticator } = await signUp();
    const client = new Client();
    const options = await client.json<PublicKeyCredentialRequestOptionsJSON>(
      "POST",
      "/api/sign-in/options",
    );
    const assertion = await authenticator.get(options);
    expect((await client.request("POST", "/api/sign-in", assertion)).status).toBe(204);
    expect((await new Client().request("POST", "/api/sign-in", assertion)).status).toBe(400);
  });
});

describe("session", () => {
  it("requires a session", async () => {
    expect((await new Client().request("GET", "/api/session")).status).toBe(401);
    const forged = new Client();
    forged.cookie = `__Host-session=${"A".repeat(22)}.${"B".repeat(43)}`;
    expect((await forged.request("GET", "/api/session")).status).toBe(401);
  });

  it("lasts 30 days and is extended on each use", async () => {
    const { client } = await signUp();
    const response = await client.request("GET", "/api/session");
    expect(response.headers.get("Set-Cookie")).toMatch(
      /^__Host-session=[^;]+; Max-Age=2592000; Path=\/; HttpOnly; Secure; SameSite=Lax$/,
    );
  });

  it("ends when it expires", async () => {
    const { client, accountId } = await signUp();
    const stub = env.ACCOUNT.get(env.ACCOUNT.idFromName(accountId));
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec("UPDATE sessions SET expires_at = ?", Date.now() - 1);
    });
    expect((await client.request("GET", "/api/session")).status).toBe(401);
  });

  it("ends on sign-out without affecting other sessions", async () => {
    const { client, authenticator } = await signUp();
    const other = await signIn(authenticator);
    const response = await client.request("POST", "/api/sign-out");
    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toMatch(/^__Host-session=; Max-Age=0;/);
    expect(client.cookie).toBeNull();
    expect((await other.client.request("GET", "/api/session")).status).toBe(200);
  });

  it("rejects cross-origin requests", async () => {
    const { client } = await signUp();
    const response = await client.request("POST", "/api/sign-out", undefined, {
      Origin: "https://evil.test",
    });
    expect(response.status).toBe(403);
    expect((await client.request("GET", "/api/session")).status).toBe(200);
  });
});

describe("passkeys", () => {
  it("adds a passkey that can sign in", async () => {
    const { client, authenticator, accountId } = await signUp();
    const second = new SoftwareAuthenticator(ORIGIN);
    expect((await addPasskey(client, authenticator, second)).status).toBe(204);
    expect(await client.json<Passkey[]>("GET", "/api/passkeys")).toHaveLength(2);
    const { client: other } = await signIn(second);
    expect(await other.json("GET", "/api/session")).toMatchObject({ accountId });
  });

  it("asks to confirm with an existing passkey and excludes registered ones", async () => {
    const { client, authenticator } = await signUp();
    const options = await client.json<AddPasskeyOptions>("POST", "/api/passkeys/options");
    const ids = authenticator.credentials.map(({ id }) => id);
    expect(options.confirm.userVerification).toBe("required");
    expect(options.confirm.allowCredentials?.map(({ id }) => id)).toEqual(ids);
    expect(options.create.excludeCredentials?.map(({ id }) => id)).toEqual(ids);
  });

  it("rejects adding a passkey without a valid confirmation", async () => {
    const { client, authenticator } = await signUp();
    const stranger = await signUp();
    const attempt = async (
      confirm: (options: PublicKeyCredentialRequestOptionsJSON) => Promise<unknown>,
    ) => {
      const options = await client.json<AddPasskeyOptions>("POST", "/api/passkeys/options");
      return client.request("POST", "/api/passkeys", {
        confirmation: await confirm(options.confirm),
        credential: await new SoftwareAuthenticator(ORIGIN).create(options.create),
      });
    };
    expect((await attempt(async () => undefined)).status).toBe(400);
    expect(
      (await attempt((options) => authenticator.get(options, { userVerified: false }))).status,
    ).toBe(400);
    expect((await attempt((options) => stranger.authenticator.get(options))).status).toBe(400);
    expect(await client.json<Passkey[]>("GET", "/api/passkeys")).toHaveLength(1);
  });

  it("rejects challenges issued to another account", async () => {
    const first = await signUp();
    const second = await signUp();
    const options = await first.client.json<AddPasskeyOptions>("POST", "/api/passkeys/options");
    const response = await second.client.request("POST", "/api/passkeys", {
      confirmation: await second.authenticator.get(options.confirm),
      credential: await new SoftwareAuthenticator(ORIGIN).create(options.create),
    });
    expect(response.status).toBe(400);
  });

  it("removes a passkey, but never the last one", async () => {
    const { client, authenticator } = await signUp();
    const second = new SoftwareAuthenticator(ORIGIN);
    await addPasskey(client, authenticator, second);
    const [first] = await client.json<Passkey[]>("GET", "/api/passkeys");
    assert(first !== undefined);
    expect((await client.request("DELETE", `/api/passkeys/${first.id}`)).status).toBe(204);
    expect((await signIn(authenticator)).response.status).toBe(400);
    const [remaining] = await client.json<Passkey[]>("GET", "/api/passkeys");
    assert(remaining !== undefined);
    expect((await client.request("DELETE", `/api/passkeys/${remaining.id}`)).status).toBe(409);
    expect((await client.request("DELETE", "/api/passkeys/unknown")).status).toBe(404);
  });

  it("requires a session", async () => {
    expect((await new Client().request("GET", "/api/passkeys")).status).toBe(401);
    expect((await new Client().request("POST", "/api/passkeys/options")).status).toBe(401);
  });
});
