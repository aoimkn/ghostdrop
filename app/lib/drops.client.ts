import { base64URLStringToBuffer, bufferToBase64URLString } from "@simplewebauthn/browser";
import { z } from "zod";

import { call, request } from "./api.client";
import { type ItemMeta, openItem, openManifest, sealManifest, sealPart } from "./drop-crypto";
import {
  MAX_DROP_BYTES,
  MAX_ITEMS,
  paddedSize,
  partCount,
  partSize,
  sealedSize,
} from "./drop-format";
import type { Item } from "./content";
import { loadKey } from "./keystore.client";

const UPLOAD_CONCURRENCY = 3;

const deviceRef = z.object({ id: z.string(), name: z.string().nullable() });

const drop = z.object({
  id: z.string(),
  sender: deviceRef,
  target: deviceRef.nullable(),
  items: z.array(z.object({ size: z.number() })),
  manifest: z.string(),
  createdAt: z.number(),
  expiresAt: z.number(),
});

export type Drop = z.infer<typeof drop>;

export class LockedError extends Error {}

class DropTooLargeError extends Error {}

class TooManyItemsError extends Error {}

class MismatchedDropError extends Error {}

type Progress = (fraction: number) => void;

export async function sendDrop(
  items: Item[],
  target: string | null,
  { onProgress, signal }: { onProgress?: Progress; signal?: AbortSignal } = {},
): Promise<void> {
  const master = await requireKey();
  const total = items.reduce((sum, { content }) => sum + content.size, 0);
  if (total > MAX_DROP_BYTES) throw new DropTooLargeError();
  if (items.length > MAX_ITEMS) throw new TooManyItemsError();
  const { id } = z
    .object({ id: z.string() })
    .parse(
      await call("POST", "/api/drops", {
        target,
        items: items.map(({ content }) => ({ size: paddedSize(content.size) })),
      }),
    );
  const dropId = decode(id);
  const totalBytes = items.reduce(
    (sum, { content }) => sum + sealedSize(paddedSize(content.size)),
    0,
  );
  let sentBytes = 0;
  try {
    const jobs = items.flatMap(({ content }, index) =>
      Array.from({ length: partCount(paddedSize(content.size)) }, (_, part) => async () => {
        signal?.throwIfAborted();
        const sealed = await sealPart(master, dropId, index, content, part);
        await request("PUT", `/api/drops/${id}/items/${index}/parts/${part}`, {
          body: sealed,
          signal,
        });
        sentBytes += partSize(paddedSize(content.size), part);
        onProgress?.(sentBytes / totalBytes);
      }),
    );
    await runConcurrently(jobs, UPLOAD_CONCURRENCY);
    const groupNumbers = [
      ...new Set(items.flatMap(({ group }) => (group === null ? [] : [group]))),
    ];
    const meta: ItemMeta[] = items.map(({ type, name, group, content }) => ({
      type,
      name,
      group: group === null ? null : groupNumbers.indexOf(group),
      size: content.size,
    }));
    await call("POST", `/api/drops/${id}/complete`, {
      manifest: encode(await sealManifest(master, dropId, meta)),
    });
  } catch (error) {
    await call("DELETE", `/api/drops/${id}`).catch(() => undefined);
    throw error;
  }
}

export async function listDrops(): Promise<Drop[]> {
  return z.array(drop).parse(await call("GET", "/api/drops"));
}

export function isReceivable(candidate: Drop, deviceId: string): boolean {
  return candidate.target === null
    ? candidate.sender.id !== deviceId
    : candidate.target.id === deviceId;
}

export async function readManifest(candidate: Drop): Promise<ItemMeta[]> {
  return openManifest(await requireKey(), decode(candidate.id), decode(candidate.manifest));
}

export async function receiveDrop(
  candidate: Drop,
  { onProgress }: { onProgress?: Progress } = {},
): Promise<Item[]> {
  const master = await requireKey();
  const dropId = decode(candidate.id);
  const meta = await openManifest(master, dropId, decode(candidate.manifest));
  if (
    meta.length !== candidate.items.length ||
    meta.some((item, index) => paddedSize(item.size) !== candidate.items[index]?.size)
  ) {
    throw new MismatchedDropError();
  }
  const totalBytes = candidate.items.reduce((sum, { size }) => sum + sealedSize(size), 0);
  let readBytes = 0;
  const counted = () =>
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        readBytes += chunk.byteLength;
        onProgress?.(readBytes / totalBytes);
        controller.enqueue(chunk);
      },
    });
  const received: Item[] = [];
  for (const [index, item] of meta.entries()) {
    const response = await request("GET", `/api/drops/${candidate.id}/items/${index}`);
    if (!response.body) throw new MismatchedDropError();
    const plain = await openItem(
      master,
      dropId,
      index,
      item.size,
      response.body.pipeThrough(counted()),
    );
    received.push({
      type: item.type,
      name: item.name,
      group: item.group === null ? null : String(item.group),
      content: new Blob(plain, { type: item.type }),
    });
  }
  await call("POST", `/api/drops/${candidate.id}/received`);
  return received;
}

export async function deleteDrop(id: string): Promise<void> {
  await call("DELETE", `/api/drops/${encodeURIComponent(id)}`);
}

export function watchDrops(
  onChange: () => void,
  onConnection: (connected: boolean) => void,
): () => void {
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let delay = 1000;
  let stopped = false;
  const connect = () => {
    clearTimeout(retry);
    const url = new URL("/api/events", window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const current = new WebSocket(url);
    socket = current;
    let opened = false;
    current.addEventListener("open", () => {
      opened = true;
      delay = 1000;
      onConnection(true);
      onChange();
    });
    current.addEventListener("message", () => onChange());
    current.addEventListener("close", () => {
      if (stopped || socket !== current) return;
      socket = null;
      // Suspended apps lose their socket while the network is fine, so only a failed attempt means offline.
      if (opened) {
        if (!document.hidden) connect();
        return;
      }
      onConnection(false);
      if (document.hidden) return;
      retry = setTimeout(connect, delay);
      delay = Math.min(delay * 2, 30_000);
    });
  };
  const reconnectNow = () => {
    if (document.hidden || socket !== null) return;
    delay = 1000;
    connect();
  };
  const onVisibility = () => {
    if (document.hidden) clearTimeout(retry);
    else reconnectNow();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("online", reconnectNow);
  connect();
  return () => {
    stopped = true;
    clearTimeout(retry);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("online", reconnectNow);
    socket?.close();
  };
}

async function requireKey(): Promise<CryptoKey> {
  const key = await loadKey();
  if (!key) throw new LockedError();
  return key;
}

async function runConcurrently(jobs: (() => Promise<void>)[], limit: number): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      if (job) await job();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(base64URLStringToBuffer(value));
}

function encode(bytes: Uint8Array<ArrayBuffer>): string {
  return bufferToBase64URLString(bytes.slice().buffer);
}
