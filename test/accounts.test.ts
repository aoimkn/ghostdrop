import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { SoftwareAuthenticator } from "./authenticator";
import { Client, ORIGIN } from "./client";

type Passkey = { id: string };

async function signUp(client = new Client(), authenticator = new SoftwareAuthenticator(ORIGIN)) {
  const options = await client.json<PublicKeyCredentialCreationOptionsJSON>(
    "POST",
    "/api/sign-up/options",
  );
  const response = await client.request(
    "POST",
    "/api/sign-up",
    await authenticator.create(options),
  );
  expect(response.status).toBe(204);
  return { client, authenticator, accountId: options.user.id };
}

async function signIn(authenticator: SoftwareAuthenticator, client = new Client()) {
  const options = await client.json<PublicKeyCredentialRequestOptionsJSON>(
    "POST",
    "/api/sign-in/options",
  );
  return {
    client,
    response: await client.request("POST", "/api/sign-in", await authenticator.get(options)),
  };
}

async function addPasskey(client: Client, authenticator: SoftwareAuthenticator) {
  const options = await client.json<PublicKeyCredentialCreationOptionsJSON>(
    "POST",
    "/api/passkeys/options",
  );
  return client.request("POST", "/api/passkeys", await authenticator.create(options));
}

describe("sign-up", () => {
  it("creates an account and signs in", async () => {
    const { client, accountId } = await signUp();
    expect(await client.json("GET", "/api/session")).toEqual({ accountId });
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
    const credential = await authenticator.create(options);
    expect((await client.request("POST", "/api/sign-up", credential)).status).toBe(204);
    expect((await new Client().request("POST", "/api/sign-up", credential)).status).toBe(400);
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
    expect((await client.request("POST", "/api/sign-up", credential)).status).toBe(400);
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
    expect((await client.request("POST", "/api/sign-up", credential)).status).toBe(400);
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
    expect((await client.request("POST", "/api/sign-up", credential)).status).toBe(400);
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
    expect(await client.json("GET", "/api/session")).toEqual({ accountId });
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
    const credential = first.authenticator.credentials[0]!;
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
    const { client, accountId } = await signUp();
    const second = new SoftwareAuthenticator(ORIGIN);
    expect((await addPasskey(client, second)).status).toBe(204);
    expect(await client.json<Passkey[]>("GET", "/api/passkeys")).toHaveLength(2);
    const { client: other } = await signIn(second);
    expect(await other.json("GET", "/api/session")).toEqual({ accountId });
  });

  it("excludes passkeys already registered", async () => {
    const { client, authenticator } = await signUp();
    const options = await client.json<PublicKeyCredentialCreationOptionsJSON>(
      "POST",
      "/api/passkeys/options",
    );
    expect(options.excludeCredentials?.map(({ id }) => id)).toEqual([
      authenticator.credentials[0]!.id,
    ]);
  });

  it("rejects a challenge issued to another account", async () => {
    const first = await signUp();
    const second = await signUp();
    const options = await first.client.json<PublicKeyCredentialCreationOptionsJSON>(
      "POST",
      "/api/passkeys/options",
    );
    const credential = await new SoftwareAuthenticator(ORIGIN).create(options);
    expect((await second.client.request("POST", "/api/passkeys", credential)).status).toBe(400);
  });

  it("removes a passkey, but never the last one", async () => {
    const { client, authenticator } = await signUp();
    const second = new SoftwareAuthenticator(ORIGIN);
    await addPasskey(client, second);
    const [first] = await client.json<Passkey[]>("GET", "/api/passkeys");
    expect((await client.request("DELETE", `/api/passkeys/${first!.id}`)).status).toBe(204);
    expect((await signIn(authenticator)).response.status).toBe(400);
    const [remaining] = await client.json<Passkey[]>("GET", "/api/passkeys");
    expect((await client.request("DELETE", `/api/passkeys/${remaining!.id}`)).status).toBe(409);
    expect((await client.request("DELETE", "/api/passkeys/unknown")).status).toBe(404);
  });

  it("requires a session", async () => {
    expect((await new Client().request("GET", "/api/passkeys")).status).toBe(401);
    expect((await new Client().request("POST", "/api/passkeys/options")).status).toBe(401);
  });
});
