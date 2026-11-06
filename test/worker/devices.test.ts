import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { assert, describe, expect, it } from "vitest";

import { Client } from "./client";
import { newPassphrase, type PassphraseMaterial, signIn, signUp } from "./helpers";

type Device = { id: string; name: string; locked: boolean; current: boolean; createdAt: number };
type Session = { accountId: string; device: { id: string; name: string; locked: boolean } | null };

async function addDevice(client: Client, name: string, proof: string) {
  return client.request("POST", "/api/devices", { name, proof });
}

async function secondDevice() {
  const first = await signUp();
  const { client } = await signIn(first.authenticator);
  expect((await addDevice(client, "second", first.passphrase.proof)).status).toBe(204);
  return { ...first, second: client };
}

function expireSessions(accountId: string, where = "1 = 1") {
  const stub = env.ACCOUNT.get(env.ACCOUNT.idFromName(accountId));
  return runInDurableObject(stub, (_, state) => {
    state.storage.sql.exec(`UPDATE sessions SET expires_at = ? WHERE ${where}`, Date.now() - 1);
  });
}

async function replace(client: Client, passphrase: PassphraseMaterial) {
  return client.request("PUT", "/api/passphrase", passphrase);
}

describe("adding a device", () => {
  it("serves the passphrase parameters to a signed-in browser", async () => {
    const { authenticator, passphrase } = await signUp();
    const { client } = await signIn(authenticator);
    expect(await client.json("GET", "/api/passphrase")).toEqual({ params: passphrase.params });
  });

  it("adds the browser once the passphrase is proven", async () => {
    const { authenticator, passphrase } = await signUp();
    const { client } = await signIn(authenticator);
    expect((await addDevice(client, "second", passphrase.proof)).status).toBe(204);
    const session = await client.json<Session>("GET", "/api/session");
    expect(session.device).toMatchObject({ name: "second", locked: false });
  });

  it("rejects a wrong passphrase", async () => {
    const { authenticator } = await signUp();
    const { client } = await signIn(authenticator);
    const response = await addDevice(client, "second", newPassphrase().proof);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "wrong-passphrase" });
    expect((await client.json<Session>("GET", "/api/session")).device).toBeNull();
  });

  it("requires a unique, non-empty name", async () => {
    const { authenticator, passphrase } = await signUp();
    const { client } = await signIn(authenticator);
    expect((await addDevice(client, "first", passphrase.proof)).status).toBe(409);
    expect((await addDevice(client, " first ", passphrase.proof)).status).toBe(409);
    expect((await addDevice(client, "   ", passphrase.proof)).status).toBe(400);
  });

  it("accepts names of up to 32 characters, counting code points", async () => {
    const { authenticator, passphrase } = await signUp();
    const { client } = await signIn(authenticator);
    expect((await addDevice(client, "a".repeat(33), passphrase.proof)).status).toBe(400);
    expect((await addDevice(client, "😀".repeat(33), passphrase.proof)).status).toBe(400);
    expect((await addDevice(client, ` ${"😀".repeat(32)} `, passphrase.proof)).status).toBe(204);
    const [, device] = await client.json<Device[]>("GET", "/api/devices");
    assert(device !== undefined);
    const rename = (name: string) => client.request("PATCH", `/api/devices/${device.id}`, { name });
    expect((await rename("b".repeat(33))).status).toBe(400);
    expect((await rename("b".repeat(32))).status).toBe(204);
  });

  it("treats canonically equivalent names as the same", async () => {
    const { authenticator, passphrase } = await signUp();
    const { client } = await signIn(authenticator);
    expect((await addDevice(client, "café", passphrase.proof)).status).toBe(204);
    const { client: other } = await signIn(authenticator);
    expect((await addDevice(other, "café", passphrase.proof)).status).toBe(409);
  });

  it("adds a browser only once", async () => {
    const { client, passphrase } = await signUp();
    expect((await addDevice(client, "again", passphrase.proof)).status).toBe(409);
  });
});

describe("devices", () => {
  it("lists the account's devices and marks the current one", async () => {
    const { client, second } = await secondDevice();
    const devices = await client.json<Device[]>("GET", "/api/devices");
    expect(devices.map(({ name, current, locked }) => ({ name, current, locked }))).toEqual([
      { name: "first", current: true, locked: false },
      { name: "second", current: false, locked: false },
    ]);
    const fromSecond = await second.json<Device[]>("GET", "/api/devices");
    expect(fromSecond.find(({ current }) => current)?.name).toBe("second");
  });

  it("renames a device to an unused name", async () => {
    const { client } = await secondDevice();
    const [first, second] = await client.json<Device[]>("GET", "/api/devices");
    assert(first !== undefined && second !== undefined);
    expect(
      (await client.request("PATCH", `/api/devices/${second.id}`, { name: "first" })).status,
    ).toBe(409);
    expect(
      (await client.request("PATCH", `/api/devices/${first.id}`, { name: "first" })).status,
    ).toBe(204);
    expect(
      (await client.request("PATCH", `/api/devices/${second.id}`, { name: "laptop" })).status,
    ).toBe(204);
    expect((await client.request("PATCH", "/api/devices/unknown", { name: "x" })).status).toBe(404);
    const names = (await client.json<Device[]>("GET", "/api/devices")).map(({ name }) => name);
    expect(names).toEqual(["first", "laptop"]);
  });

  it("signs a removed device out immediately", async () => {
    const { client, second } = await secondDevice();
    const target = (await client.json<Device[]>("GET", "/api/devices")).find(
      ({ current }) => !current,
    );
    assert(target !== undefined);
    const response = await client.request("DELETE", `/api/devices/${target.id}`);
    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toMatch(/^__Host-session=[^;]/);
    expect((await second.request("GET", "/api/session")).status).toBe(401);
    expect(await client.json<Device[]>("GET", "/api/devices")).toHaveLength(1);
    expect((await client.request("DELETE", `/api/devices/${target.id}`)).status).toBe(404);
  });

  it("signs out when removing the current device", async () => {
    const { client } = await signUp();
    const [current] = await client.json<Device[]>("GET", "/api/devices");
    assert(current !== undefined);
    const response = await client.request("DELETE", `/api/devices/${current.id}`);
    expect(response.headers.get("Set-Cookie")).toMatch(/^__Host-session=; Max-Age=0;/);
    expect((await client.request("GET", "/api/session")).status).toBe(401);
  });

  it("removes the device on sign-out", async () => {
    const { client, second } = await secondDevice();
    await second.request("POST", "/api/sign-out");
    const names = (await client.json<Device[]>("GET", "/api/devices")).map(({ name }) => name);
    expect(names).toEqual(["first"]);
  });

  it("removes the device when its session expires and frees its name", async () => {
    const { client, accountId, authenticator, passphrase } = await secondDevice();
    const [first] = await client.json<Device[]>("GET", "/api/devices");
    assert(first !== undefined);
    await expireSessions(
      accountId,
      "token_hash <> (SELECT token_hash FROM devices WHERE name = 'first')",
    );
    expect((await client.json<Device[]>("GET", "/api/devices")).map(({ name }) => name)).toEqual([
      "first",
    ]);
    const { client: again } = await signIn(authenticator);
    expect((await addDevice(again, "second", passphrase.proof)).status).toBe(204);
  });

  it("requires a session", async () => {
    expect((await new Client().request("GET", "/api/devices")).status).toBe(401);
    expect((await new Client().request("GET", "/api/passphrase")).status).toBe(401);
  });
});

describe("replacing the passphrase", () => {
  it("locks the other devices until they enter the new passphrase", async () => {
    const { client, second, passphrase } = await secondDevice();
    const next = newPassphrase();
    expect((await replace(client, next)).status).toBe(204);
    expect((await client.json<Session>("GET", "/api/session")).device?.locked).toBe(false);
    expect((await second.json<Session>("GET", "/api/session")).device?.locked).toBe(true);
    expect(await second.json("GET", "/api/passphrase")).toEqual({ params: next.params });

    const unlock = (proof: string) => second.request("POST", "/api/device/unlock", { proof });
    expect((await unlock(passphrase.proof)).status).toBe(403);
    expect((await unlock(next.proof)).status).toBe(204);
    expect((await second.json<Session>("GET", "/api/session")).device?.locked).toBe(false);
  });

  it("lets a browser that has not been added replace a forgotten passphrase", async () => {
    const { authenticator, client: first } = await signUp();
    const { client } = await signIn(authenticator);
    const next = newPassphrase();
    expect((await replace(client, next)).status).toBe(204);
    expect((await addDevice(client, "second", next.proof)).status).toBe(204);
    expect((await first.json<Session>("GET", "/api/session")).device?.locked).toBe(true);
  });

  it("unlocks only a browser that is a device", async () => {
    const { authenticator, passphrase } = await signUp();
    const { client } = await signIn(authenticator);
    const response = await client.request("POST", "/api/device/unlock", {
      proof: passphrase.proof,
    });
    expect(response.status).toBe(403);
  });

  it("rejects malformed passphrase material", async () => {
    const { client } = await signUp();
    expect((await replace(client, { params: "", proof: newPassphrase().proof })).status).toBe(400);
    expect((await replace(client, { params: newPassphrase().params, proof: "AAAA" })).status).toBe(
      400,
    );
  });
});

describe("account deletion", () => {
  it("deletes passkeys and devices and signs every device out", async () => {
    const { client, second, authenticator } = await secondDevice();
    const response = await client.request("DELETE", "/api/account");
    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toMatch(/^__Host-session=; Max-Age=0;/);
    expect((await second.request("GET", "/api/session")).status).toBe(401);
    expect((await signIn(authenticator)).response.status).toBe(400);
  });
});
