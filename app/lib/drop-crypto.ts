import { z } from "zod";

import {
  FORMAT_VERSION,
  RECORD_BYTES,
  RECORDS_PER_PART,
  SEALED_RECORD_BYTES,
  TAG_BYTES,
  paddedSize,
  recordCount,
} from "./drop-format";

const itemMeta = z.object({
  type: z.string(),
  name: z.string().nullable(),
  group: z.number().int().nonnegative().nullable(),
  size: z.number().int().nonnegative(),
});

export type ItemMeta = z.infer<typeof itemMeta>;

const encoder = new TextEncoder();

// Every item has its own key, bound to the drop and the item's position, so records
// cannot be moved between items or drops. Within an item, the nonce carries the record
// index and a final-record flag, so records cannot be reordered, dropped or cut short.
async function key(master: CryptoKey, dropId: Uint8Array<ArrayBuffer>, label: string) {
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: dropId, info: encoder.encode(`ghostdrop ${label}`) },
    master,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function itemKey(master: CryptoKey, dropId: Uint8Array<ArrayBuffer>, index: number) {
  return key(master, dropId, `v${FORMAT_VERSION} item ${index}`);
}

function nonce(record: number, last: boolean): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(12);
  const view = new DataView(bytes.buffer);
  view.setUint32(7, record);
  bytes[11] = last ? 1 : 0;
  return bytes;
}

export async function sealManifest(
  master: CryptoKey,
  dropId: Uint8Array<ArrayBuffer>,
  items: ItemMeta[],
): Promise<Uint8Array<ArrayBuffer>> {
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: new Uint8Array(12) },
    await key(master, dropId, `v${FORMAT_VERSION} manifest`),
    encoder.encode(JSON.stringify(items)),
  );
  const out = new Uint8Array(1 + sealed.byteLength);
  out[0] = FORMAT_VERSION;
  out.set(new Uint8Array(sealed), 1);
  return out;
}

export async function openManifest(
  master: CryptoKey,
  dropId: Uint8Array<ArrayBuffer>,
  sealed: Uint8Array,
): Promise<ItemMeta[]> {
  if (sealed[0] !== FORMAT_VERSION) throw new Error("unsupported drop format");
  const plain = await decrypt(
    await key(master, dropId, `v${FORMAT_VERSION} manifest`),
    new Uint8Array(12),
    sealed.slice(1),
  );
  return z
    .array(itemMeta)
    .min(1)
    .parse(JSON.parse(new TextDecoder().decode(plain)));
}

export async function sealPart(
  master: CryptoKey,
  dropId: Uint8Array<ArrayBuffer>,
  index: number,
  content: Blob,
  part: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const padded = paddedSize(content.size);
  const records = recordCount(padded);
  const first = part * RECORDS_PER_PART;
  const last = Math.min(records, first + RECORDS_PER_PART);
  if (first >= last) throw new RangeError("part out of range");
  const cryptoKey = await itemKey(master, dropId, index);
  const sealed: Uint8Array[] = [];
  for (let record = first; record < last; record++) {
    const plain = new Uint8Array(Math.min(RECORD_BYTES, padded - record * RECORD_BYTES));
    plain.set(
      new Uint8Array(
        await content.slice(record * RECORD_BYTES, (record + 1) * RECORD_BYTES).arrayBuffer(),
      ),
    );
    const iv = nonce(record, record === records - 1);
    sealed.push(
      new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, plain)),
    );
  }
  return concat(sealed);
}

export async function openItem(
  master: CryptoKey,
  dropId: Uint8Array<ArrayBuffer>,
  index: number,
  size: number,
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array<ArrayBuffer>[]> {
  const cryptoKey = await itemKey(master, dropId, index);
  const padded = paddedSize(size);
  const records = recordCount(padded);
  const reader = new ExactReader(stream.getReader());
  const plain: Uint8Array<ArrayBuffer>[] = [];
  for (let record = 0; record < records; record++) {
    const last = record === records - 1;
    const length = last ? padded - record * RECORD_BYTES + TAG_BYTES : SEALED_RECORD_BYTES;
    const sealed = await reader.read(length);
    const iv = nonce(record, last);
    const opened = await decrypt(cryptoKey, iv, sealed);
    const keep = Math.max(0, Math.min(opened.length, size - record * RECORD_BYTES));
    if (keep > 0) plain.push(opened.slice(0, keep));
  }
  await reader.end();
  return plain;
}

export class TamperedError extends Error {
  constructor() {
    super("drop content was tampered with");
  }
}

async function decrypt(
  cryptoKey: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  sealed: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, sealed));
  } catch {
    throw new TamperedError();
  }
}

class ExactReader {
  private buffer = new Uint8Array(0);

  constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

  async read(length: number): Promise<Uint8Array<ArrayBuffer>> {
    while (this.buffer.length < length) {
      const { done, value } = await this.reader.read();
      if (done) throw new TamperedError();
      this.buffer = concat([this.buffer, value]);
    }
    const out = this.buffer.slice(0, length);
    this.buffer = this.buffer.slice(length);
    return out;
  }

  async end(): Promise<void> {
    if (this.buffer.length > 0) throw new TamperedError();
    const { done } = await this.reader.read();
    if (!done) throw new TamperedError();
  }
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
