import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { Client } from "./client";
import { newPassphrase, signIn, signUp } from "./helpers";

async function attempt(client: Client, path: string) {
  return (await client.request("POST", path)).status;
}

describe("sign-up and sign-in attempts", () => {
  it("are limited per network", async () => {
    const client = new Client("203.0.113.7");
    for (let i = 0; i < 5; i++) {
      expect(await attempt(client, "/api/sign-up/options")).toBe(200);
      expect(await attempt(client, "/api/sign-in/options")).toBe(200);
    }
    expect(await attempt(client, "/api/sign-in/options")).toBe(429);
    expect(await attempt(new Client("203.0.113.8"), "/api/sign-in/options")).toBe(200);
  });

  it("count an IPv6 /64 as one network", async () => {
    const prefix = "2001:db8:85a3:42";
    for (let i = 0; i < 10; i++) {
      expect(await attempt(new Client(`${prefix}::${i + 1}`), "/api/sign-in/options")).toBe(200);
    }
    expect(await attempt(new Client(`${prefix}:0:0:0:ff`), "/api/sign-in/options")).toBe(429);
    expect(await attempt(new Client("2001:db8:85a3:43::1"), "/api/sign-in/options")).toBe(200);
  });
});

describe("wrong passphrase entries", () => {
  it("block every browser of the account, even with the right passphrase, for an hour", async () => {
    const { authenticator, passphrase, accountId, client: first } = await signUp();
    const { client } = await signIn(authenticator);
    const add = (proof: string) =>
      client.request("POST", "/api/devices", { name: "second", proof });
    for (let i = 0; i < 10; i++) expect((await add(newPassphrase().proof)).status).toBe(403);
    const refused = await add(passphrase.proof);
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: "too-many-attempts" });
    const retryAfter = Number(refused.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(60 * 60 - 60);
    expect(retryAfter).toBeLessThanOrEqual(60 * 60);
    const unlock = await first.request("POST", "/api/device/unlock", { proof: passphrase.proof });
    expect(unlock.status).toBe(429);
    expect(await unlock.json()).toEqual({ error: "too-many-attempts" });

    const stub = env.ACCOUNT.get(env.ACCOUNT.idFromName(accountId));
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec(
        "UPDATE passphrase_failures SET at = ? WHERE at = (SELECT MIN(at) FROM passphrase_failures)",
        Date.now() - 60 * 60 * 1000 + 30 * 1000,
      );
    });
    const later = await add(passphrase.proof);
    expect(Number(later.headers.get("Retry-After"))).toBeLessThanOrEqual(30);

    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec("UPDATE passphrase_failures SET at = ?", Date.now() - 60 * 60 * 1000);
    });
    expect((await add(passphrase.proof)).status).toBe(204);
  });

  it("do not count correct entries", async () => {
    const { authenticator, passphrase, client: first } = await signUp();
    const { client } = await signIn(authenticator);
    for (let i = 0; i < 9; i++) {
      await client.request("POST", "/api/devices", {
        name: "second",
        proof: newPassphrase().proof,
      });
    }
    for (let i = 0; i < 3; i++) {
      const response = await first.request("POST", "/api/device/unlock", {
        proof: passphrase.proof,
      });
      expect(response.status).toBe(204);
    }
  });
});
