import { describe, expect, it } from "vitest";

import {
  openItem,
  openManifest,
  sealManifest,
  sealPart,
  TamperedError,
} from "~/app/lib/drop-crypto";
import {
  PART_BYTES,
  RECORD_BYTES,
  SEALED_RECORD_BYTES,
  paddedSize,
  partCount,
  sealedSize,
} from "~/app/lib/drop-format";
import { deriveKey, newParams } from "~/app/lib/passphrase";

const master = await deriveKey("correct horse battery staple", newParams());

function dropId(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(16));
}

function content(size: number): Blob {
  const bytes = new Uint8Array(size);
  for (let offset = 0; offset < size; offset += 65536) {
    crypto.getRandomValues(bytes.subarray(offset, Math.min(size, offset + 65536)));
  }
  return new Blob([bytes]);
}

async function seal(id: Uint8Array<ArrayBuffer>, index: number, blob: Blob) {
  const parts: Uint8Array<ArrayBuffer>[] = [];
  for (let part = 0; part < partCount(paddedSize(blob.size)); part++) {
    parts.push(await sealPart(master, id, index, blob, part));
  }
  return new Uint8Array(await new Blob(parts).arrayBuffer());
}

function stream(bytes: Uint8Array, chunk = 10_000): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + chunk));
      offset += chunk;
    },
  });
}

async function open(id: Uint8Array<ArrayBuffer>, index: number, size: number, sealed: Uint8Array) {
  const plain = await openItem(master, id, index, size, stream(sealed));
  return new Uint8Array(await new Blob(plain).arrayBuffer());
}

describe("items", () => {
  it.each([0, 1, RECORD_BYTES, RECORD_BYTES + 1, PART_BYTES * 2 + 5])(
    "round-trips %i bytes in the expected sealed size",
    async (size) => {
      const id = dropId();
      const blob = content(size);
      const sealed = await seal(id, 0, blob);
      expect(sealed.length).toBe(sealedSize(paddedSize(size)));
      expect(await open(id, 0, size, sealed)).toEqual(new Uint8Array(await blob.arrayBuffer()));
    },
  );

  it("rejects altered, reordered, truncated or extended content", async () => {
    const id = dropId();
    const size = RECORD_BYTES * 3;
    const sealed = await seal(id, 0, content(size));

    const altered = sealed.slice();
    altered[5] = (altered[5] ?? 0) ^ 1;
    await expect(open(id, 0, size, altered)).rejects.toThrow(TamperedError);

    const reordered = new Uint8Array(sealed.length);
    reordered.set(sealed.subarray(SEALED_RECORD_BYTES, 2 * SEALED_RECORD_BYTES), 0);
    reordered.set(sealed.subarray(0, SEALED_RECORD_BYTES), SEALED_RECORD_BYTES);
    reordered.set(sealed.subarray(2 * SEALED_RECORD_BYTES), 2 * SEALED_RECORD_BYTES);
    await expect(open(id, 0, size, reordered)).rejects.toThrow(TamperedError);

    await expect(open(id, 0, size, sealed.subarray(0, 2 * SEALED_RECORD_BYTES))).rejects.toThrow(
      TamperedError,
    );
    await expect(open(id, 0, size, new Uint8Array([...sealed, 0]))).rejects.toThrow(TamperedError);
  });

  it("rejects a final record cut at a record boundary", async () => {
    const id = dropId();
    const sealed = await seal(id, 0, content(RECORD_BYTES * 3));
    await expect(
      open(id, 0, RECORD_BYTES * 2, sealed.subarray(0, 2 * SEALED_RECORD_BYTES)),
    ).rejects.toThrow(TamperedError);
  });

  it("rejects content moved to another item or drop", async () => {
    const id = dropId();
    const blob = content(100);
    const sealed = await seal(id, 0, blob);
    await expect(open(id, 1, 100, sealed)).rejects.toThrow(TamperedError);
    await expect(open(dropId(), 0, 100, sealed)).rejects.toThrow(TamperedError);
  });
});

describe("padding", () => {
  it("makes every item up to one record look alike", async () => {
    const id = dropId();
    const sizes = [0, 1, 1000, RECORD_BYTES];
    const sealed = await Promise.all(sizes.map((size) => seal(id, 0, content(size))));
    expect(new Set(sealed.map(({ length }) => length)).size).toBe(1);
  });

  it("rounds larger items with Padmé, adding less than 1/32", () => {
    expect(paddedSize(RECORD_BYTES + 1)).toBe(RECORD_BYTES + 2048);
    expect(paddedSize(100 * 1024 * 1024)).toBe(100 * 1024 * 1024);
    for (const size of [70_000, 1_234_567, 9_999_999, 77_777_777]) {
      const padded = paddedSize(size);
      expect(padded).toBeGreaterThanOrEqual(size);
      expect(padded - size).toBeLessThan(size / 32);
      expect(paddedSize(padded)).toBe(padded);
    }
  });
});

describe("manifest", () => {
  const items = [
    { type: "text/plain", name: null, size: 5 },
    { type: "image/png", name: "screenshot.png", size: 1234 },
  ];

  it("round-trips", async () => {
    const id = dropId();
    expect(await openManifest(master, id, await sealManifest(master, id, items))).toEqual(items);
  });

  it("rejects another drop's manifest or an unknown version", async () => {
    const sealed = await sealManifest(master, dropId(), items);
    await expect(openManifest(master, dropId(), sealed)).rejects.toThrow(TamperedError);
    const future = sealed.slice();
    future[0] = 2;
    await expect(openManifest(master, dropId(), future)).rejects.toThrow("unsupported drop format");
  });
});
