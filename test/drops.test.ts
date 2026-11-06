import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { assert, describe, expect, it } from "vitest";

import { openItem, openManifest, sealManifest, sealPart } from "~/lib/drop-crypto";
import {
  MAX_DROP_BYTES,
  MAX_ITEMS,
  paddedSize,
  partCount,
  partSize,
  RECORD_BYTES,
  sealedSize,
} from "~/lib/drop-format";
import { deriveKey, newParams, proof } from "~/lib/passphrase";

import { SoftwareAuthenticator } from "./authenticator";
import { Client, ORIGIN, signUpBody } from "./client";
import { signIn } from "./helpers";

type Drop = {
  id: string;
  sender: { id: string; name: string | null };
  target: { id: string; name: string | null } | null;
  items: { size: number }[];
  manifest: string;
  createdAt: number;
  expiresAt: number;
};
type Device = { id: string; name: string; current: boolean };

async function account() {
  const authenticator = new SoftwareAuthenticator(ORIGIN);
  const passphrase = "correct horse battery staple";
  const params = newParams();
  const master = await deriveKey(passphrase, params);
  const material = {
    params: isoBase64URL.fromBuffer(params),
    proof: isoBase64URL.fromBuffer(await proof(master)),
  };
  const first = new Client();
  const options = await first.json<PublicKeyCredentialCreationOptionsJSON>(
    "POST",
    "/api/sign-up/options",
  );
  const response = await first.request(
    "POST",
    "/api/sign-up",
    signUpBody(await authenticator.create(options), material, "first"),
  );
  expect(response.status).toBe(204);
  const { client: second } = await signIn(authenticator);
  await second.request("POST", "/api/devices", { name: "second", proof: material.proof });
  const devices = await first.json<Device[]>("GET", "/api/devices");
  const id = (name: string) => devices.find((device) => device.name === name)?.id ?? "";
  return {
    accountId: options.user.id,
    authenticator,
    master,
    material,
    first,
    second,
    firstId: id("first"),
    secondId: id("second"),
  };
}

type PublicKeyCredentialCreationOptionsJSON = Parameters<SoftwareAuthenticator["create"]>[0];

async function createPadded(client: Client, padded: number[], target: string | null = null) {
  return client.request("POST", "/api/drops", { target, items: padded.map((size) => ({ size })) });
}

async function create(client: Client, sizes: number[], target: string | null = null) {
  return createPadded(client, sizes.map(paddedSize), target);
}

async function upload(client: Client, dropId: string, sizes: number[]) {
  for (const [index, size] of sizes.entries()) {
    const padded = paddedSize(size);
    for (let part = 0; part < partCount(padded); part++) {
      const response = await client.upload(
        `/api/drops/${dropId}/items/${index}/parts/${part}`,
        new Uint8Array(partSize(padded, part)),
      );
      expect(response.status).toBe(204);
    }
  }
}

async function send(client: Client, sizes: number[], target: string | null = null) {
  const response = await create(client, sizes, target);
  expect(response.status).toBe(201);
  const { id } = await response.json<{ id: string }>();
  await upload(client, id, sizes);
  const completed = await client.request("POST", `/api/drops/${id}/complete`, { manifest: "AQ" });
  expect(completed.status).toBe(204);
  return id;
}

const list = (client: Client) => client.json<Drop[]>("GET", "/api/drops");

describe("sending and receiving", () => {
  it("delivers an encrypted drop and burns it on receipt", async () => {
    const { first, second, master } = await account();
    const items = [
      { type: "text/plain", name: null, content: new Blob(["hello"]) },
      { type: "image/png", name: "a.png", content: new Blob([new Uint8Array(70_000).fill(7)]) },
    ];
    const created = await create(
      first,
      items.map(({ content }) => content.size),
    );
    const { id } = await created.json<{ id: string }>();
    const dropId = isoBase64URL.toBuffer(id);
    for (const [index, { content }] of items.entries()) {
      for (let part = 0; part < partCount(paddedSize(content.size)); part++) {
        const sealed = await sealPart(master, dropId, index, content, part);
        await first.upload(`/api/drops/${id}/items/${index}/parts/${part}`, sealed);
      }
    }
    const manifest = await sealManifest(
      master,
      dropId,
      items.map(({ type, name, content }) => ({ type, name, size: content.size })),
    );
    expect(
      (
        await first.request("POST", `/api/drops/${id}/complete`, {
          manifest: isoBase64URL.fromBuffer(manifest),
        })
      ).status,
    ).toBe(204);

    const [drop] = await list(second);
    assert(drop !== undefined);
    expect(drop.items).toEqual(items.map(({ content }) => ({ size: paddedSize(content.size) })));
    const meta = await openManifest(master, dropId, isoBase64URL.toBuffer(drop.manifest));
    expect(meta.map(({ type, name }) => ({ type, name }))).toEqual([
      { type: "text/plain", name: null },
      { type: "image/png", name: "a.png" },
    ]);
    for (const [index, item] of meta.entries()) {
      const response = await second.request("GET", `/api/drops/${id}/items/${index}`);
      expect(Number(response.headers.get("Content-Length"))).toBe(
        sealedSize(paddedSize(item.size)),
      );
      assert(response.body !== null);
      const plain = await openItem(master, dropId, index, item.size, response.body);
      const expected = items[index]?.content;
      assert(expected !== undefined);
      expect(await new Blob(plain).arrayBuffer()).toEqual(await expected.arrayBuffer());
    }

    expect((await second.request("POST", `/api/drops/${id}/received`)).status).toBe(204);
    expect(await list(first)).toEqual([]);
    expect((await second.request("GET", `/api/drops/${id}/items/0`)).status).toBe(404);
    const objects = await env.DROPS.list({ prefix: `drops/${id}/` });
    expect(objects.objects).toEqual([]);
  });

  it("uploads large items in several parts", async () => {
    const { first, second } = await account();
    const size = 9 * 1024 * 1024;
    expect(partCount(paddedSize(size))).toBe(2);
    const id = await send(first, [size]);
    const response = await second.request("GET", `/api/drops/${id}/items/0`);
    expect((await response.arrayBuffer()).byteLength).toBe(sealedSize(paddedSize(size)));
  });

  it("shows a drop only once it is completely uploaded", async () => {
    const { first, second } = await account();
    const response = await create(first, [10, 20]);
    const { id } = await response.json<{ id: string }>();
    await upload(first, id, [10]);
    expect(
      (await first.request("POST", `/api/drops/${id}/complete`, { manifest: "AQ" })).status,
    ).toBe(409);
    expect(await list(second)).toEqual([]);
    expect((await second.request("GET", `/api/drops/${id}/items/0`)).status).toBe(404);
    expect((await second.request("POST", `/api/drops/${id}/received`)).status).toBe(404);
    await first.upload(
      `/api/drops/${id}/items/1/parts/0`,
      new Uint8Array(sealedSize(paddedSize(20))),
    );
    expect(
      (await first.request("POST", `/api/drops/${id}/complete`, { manifest: "AQ" })).status,
    ).toBe(204);
  });

  it("rejects a part of the wrong size or from another device", async () => {
    const { first, second } = await account();
    const { id } = await (await create(first, [10])).json<{ id: string }>();
    const path = `/api/drops/${id}/items/0/parts/0`;
    expect((await first.upload(path, new Uint8Array(25))).status).toBe(400);
    expect((await second.upload(path, new Uint8Array(sealedSize(paddedSize(10))))).status).toBe(
      404,
    );
    expect((await first.upload(`/api/drops/${id}/items/0/parts/1`, new Uint8Array(1))).status).toBe(
      404,
    );
  });
});

describe("addressing", () => {
  it("offers an untargeted drop to every device but the sender", async () => {
    const { first, second } = await account();
    const id = await send(first, [5]);
    expect((await first.request("GET", `/api/drops/${id}/items/0`)).status).toBe(404);
    expect((await first.request("POST", `/api/drops/${id}/received`)).status).toBe(404);
    expect((await second.request("GET", `/api/drops/${id}/items/0`)).status).toBe(200);
  });

  it("offers a targeted drop only to its target", async () => {
    const { first, second, authenticator, material, secondId } = await account();
    const { client: third } = await signIn(authenticator);
    await third.request("POST", "/api/devices", { name: "third", proof: material.proof });
    const id = await send(first, [5], secondId);
    const [drop] = await list(third);
    expect(drop?.target).toEqual({ id: secondId, name: "second" });
    expect((await third.request("GET", `/api/drops/${id}/items/0`)).status).toBe(404);
    expect((await second.request("GET", `/api/drops/${id}/items/0`)).status).toBe(200);
  });

  it("rejects targeting the sender or an unknown device", async () => {
    const { first, firstId } = await account();
    expect((await create(first, [1], firstId)).status).toBe(400);
    expect((await create(first, [1], "unknown")).status).toBe(400);
  });

  it("lets only an unlocked device send or receive", async () => {
    const { first, second, authenticator } = await account();
    const id = await send(first, [5]);
    const { client: browser } = await signIn(authenticator);
    expect((await create(browser, [1])).status).toBe(403);
    expect((await browser.request("GET", "/api/drops")).status).toBe(403);
    expect((await browser.request("GET", `/api/drops/${id}/items/0`)).status).toBe(404);
    expect((await second.request("GET", `/api/drops/${id}/items/0`)).status).toBe(200);
  });
});

describe("limits", () => {
  it("accepts only padded sizes within what 100 MiB of content can pad to", async () => {
    const { first } = await account();
    expect((await createPadded(first, [RECORD_BYTES + 1])).status).toBe(400);
    expect((await createPadded(first, [1000])).status).toBe(400);
    expect((await create(first, [MAX_DROP_BYTES, MAX_DROP_BYTES / 16])).status).toBe(413);
    expect((await create(first, [MAX_DROP_BYTES])).status).toBe(201);
  });

  it("rejects more than 1,000 items", async () => {
    const { first } = await account();
    const response = await create(
      first,
      Array.from({ length: MAX_ITEMS + 1 }, () => 1),
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "too-many-items" });
  });

  it("rejects an eleventh drop without removing any", async () => {
    const { first, second } = await account();
    for (let i = 0; i < 10; i++) await send(first, [1]);
    const response = await create(first, [1]);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "limit-reached" });
    expect(await list(second)).toHaveLength(10);
  });
});

describe("burning", () => {
  it("lets any device delete a pending drop", async () => {
    const { first, second } = await account();
    const id = await send(first, [5]);
    expect((await first.request("DELETE", `/api/drops/${id}`)).status).toBe(204);
    expect(await list(second)).toEqual([]);
    expect((await second.request("DELETE", `/api/drops/${id}`)).status).toBe(404);
  });

  it("burns drops when they expire", async () => {
    const { first, second, accountId } = await account();
    const id = await send(first, [5]);
    const [drop] = await list(second);
    assert(drop !== undefined);
    expect(drop.expiresAt - drop.createdAt).toBe(24 * 60 * 60 * 1000);
    expect(Date.now() - drop.createdAt).toBeLessThan(60 * 1000);
    const stub = env.ACCOUNT.get(env.ACCOUNT.idFromName(accountId));
    await runDurableObjectAlarm(stub);
    expect(await list(second)).toHaveLength(1);
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec("UPDATE drops SET expires_at = ?", Date.now() - 1);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await list(second)).toEqual([]);
    expect((await env.DROPS.list({ prefix: `drops/${id}/` })).objects).toEqual([]);
  });

  it("burns every drop when the passphrase is replaced", async () => {
    const { first, second } = await account();
    await send(first, [5]);
    const params = newParams();
    const master = await deriveKey("a different passphrase", params);
    await first.request("PUT", "/api/passphrase", {
      params: isoBase64URL.fromBuffer(params),
      proof: isoBase64URL.fromBuffer(await proof(master)),
    });
    expect(await list(first)).toEqual([]);
    expect((await second.request("GET", "/api/drops")).status).toBe(200);
  });

  it("burns every drop when the account is deleted", async () => {
    const { first, second } = await account();
    const id = await send(first, [5]);
    await second.request("DELETE", "/api/account");
    expect((await env.DROPS.list({ prefix: `drops/${id}/` })).objects).toEqual([]);
    expect((await first.request("GET", "/api/drops")).status).toBe(401);
  });

  it("abandons an upload that makes no progress for an hour", async () => {
    const { first, accountId } = await account();
    const { id } = await (await create(first, [10, 20])).json<{ id: string }>();
    const stub = env.ACCOUNT.get(env.ACCOUNT.idFromName(accountId));
    const deadline = () =>
      runInDurableObject(
        stub,
        (_, state) =>
          state.storage.sql.exec<{ at: number }>("SELECT expires_at AS at FROM drops").one().at,
      );
    const before = await deadline();
    expect(before - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000);
    await upload(first, id, [10]);
    expect(await deadline()).toBeGreaterThanOrEqual(before);
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec("UPDATE drops SET expires_at = ?", Date.now() - 1);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await first.upload(`/api/drops/${id}/items/1/parts/0`, new Uint8Array(1))).status).toBe(
      404,
    );
    for (let i = 0; i < 10; i++) expect((await create(first, [1])).status).toBe(201);
  });

  it("counts drops still being uploaded toward the limit", async () => {
    const { first } = await account();
    for (let i = 0; i < 10; i++) expect((await create(first, [1])).status).toBe(201);
    expect((await create(first, [1])).status).toBe(409);
  });

  it("burns drops targeted at a removed device", async () => {
    const { first, second, secondId } = await account();
    const targeted = await send(first, [5], secondId);
    await send(first, [5]);
    await second.request("POST", "/api/sign-out");
    const remaining = await list(first);
    expect(remaining.map(({ id }) => id)).not.toContain(targeted);
    expect(remaining).toHaveLength(1);
    expect((await env.DROPS.list({ prefix: `drops/${targeted}/` })).objects).toEqual([]);
  });

  it("burns drops targeted at a device whose session expired", async () => {
    const { first, accountId, secondId } = await account();
    await send(first, [5], secondId);
    const stub = env.ACCOUNT.get(env.ACCOUNT.idFromName(accountId));
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec(
        "UPDATE sessions SET expires_at = ? WHERE token_hash = (SELECT token_hash FROM devices WHERE id = ?)",
        Date.now() - 1,
        secondId,
      );
    });
    expect(await list(first)).toEqual([]);
  });

  it("keeps a drop from a removed sender", async () => {
    const { first, second, firstId } = await account();
    await send(first, [5]);
    await second.request("DELETE", `/api/devices/${firstId}`);
    const [drop] = await list(second);
    expect(drop?.sender).toEqual({ id: firstId, name: null });
  });
});

async function connect(client: Client, origin = ORIGIN) {
  const response = await exports.default.fetch(`${ORIGIN}/api/events`, {
    headers: { Upgrade: "websocket", Origin: origin, Cookie: client.cookie ?? "" },
  });
  return response;
}
describe("notifications", () => {
  it("tells connected devices when drops change", async () => {
    const { first, second } = await account();
    const response = await connect(second);
    expect(response.status).toBe(101);
    const socket = response.webSocket;
    assert(socket !== null);
    socket.accept();
    const messages: string[] = [];
    socket.addEventListener("message", (event) => messages.push(String(event.data)));
    const id = await send(first, [5]);
    await second.request("POST", `/api/drops/${id}/received`);
    await expect.poll(() => messages).toEqual(["drops", "drops"]);
  });

  it("closes the connection when the device is removed", async () => {
    const { first, second, secondId } = await account();
    const socket = (await connect(second)).webSocket;
    assert(socket !== null);
    socket.accept();
    const closed = new Promise<number>((resolve) =>
      socket.addEventListener("close", (event) => resolve(event.code)),
    );
    await first.request("DELETE", `/api/devices/${secondId}`);
    expect(await closed).toBe(1000);
  });

  it("rejects cross-origin connections and browsers that are not devices", async () => {
    const { second, authenticator } = await account();
    expect((await connect(second, "https://evil.test")).status).toBe(403);
    const { client: browser } = await signIn(authenticator);
    expect((await connect(browser)).status).toBe(403);
  });
});
