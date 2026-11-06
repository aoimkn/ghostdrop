import { isoBase64URL } from "@simplewebauthn/server/helpers";

import {
  isPaddedSize,
  MAX_ITEMS,
  maxPaddedTotal,
  partCount,
  partSize,
} from "../app/lib/drop-format";

const LIFETIME_MS = 24 * 60 * 60 * 1000;
const UPLOAD_TIMEOUT_MS = 60 * 60 * 1000;
const MAX_PENDING = 10;

export type DropItem = { size: number };

export type DeviceRef = { id: string; name: string | null };

export type DropSummary = {
  id: string;
  sender: DeviceRef;
  target: DeviceRef | null;
  items: DropItem[];
  manifest: Uint8Array;
  createdAt: number;
  expiresAt: number;
};

export type Sender = { deviceId: string };

type DropRow = {
  id: string;
  sender_id: string;
  target_id: string | null;
  state: "uploading" | "completing" | "pending";
  manifest: ArrayBuffer | null;
  created_at: number;
  expires_at: number;
};

type ItemRow = { drop_id: string; idx: number; size: number; upload_id: string | null };

type Cleanup = { key: string; uploadId: string | null };

export function objectKey(dropId: string, index: number): string {
  return `drops/${dropId}/${index}`;
}

export class Drops {
  private cleanups: Cleanup[] = [];
  private discarded = false;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly bucket: R2Bucket,
  ) {}

  migrate(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS drops (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        target_id TEXT,
        state TEXT NOT NULL,
        manifest BLOB,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS drop_items (
        drop_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        size INTEGER NOT NULL,
        upload_id TEXT,
        PRIMARY KEY (drop_id, idx)
      );
      CREATE TABLE IF NOT EXISTS drop_parts (
        drop_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        part INTEGER NOT NULL,
        etag TEXT NOT NULL,
        PRIMARY KEY (drop_id, idx, part)
      );
    `);
  }

  async create(
    sender: Sender,
    targetId: string | null,
    sizes: number[],
  ): Promise<{ id: string } | "invalid-size" | "too-many-items" | "too-large" | "limit-reached"> {
    if (!sizes.every(isPaddedSize)) return "invalid-size";
    if (sizes.length > MAX_ITEMS) return "too-many-items";
    const total = sizes.reduce((sum, size) => sum + size, 0);
    if (total > maxPaddedTotal(sizes.length)) return "too-large";
    const count = this.ctx.storage.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM drops")
      .one().n;
    if (count >= MAX_PENDING) return "limit-reached";
    const id = randomId();
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO drops (id, sender_id, target_id, state, created_at, expires_at) VALUES (?, ?, ?, 'uploading', ?, ?)",
        id,
        sender.deviceId,
        targetId,
        now,
        now + UPLOAD_TIMEOUT_MS,
      );
      for (const [index, size] of sizes.entries()) {
        this.ctx.storage.sql.exec(
          "INSERT INTO drop_items (drop_id, idx, size) VALUES (?, ?, ?)",
          id,
          index,
          size,
        );
      }
    });
    await this.scheduleExpiry();
    try {
      for (const index of sizes.keys()) {
        const upload = await this.bucket.createMultipartUpload(objectKey(id, index));
        this.ctx.storage.sql.exec(
          "UPDATE drop_items SET upload_id = ? WHERE drop_id = ? AND idx = ?",
          upload.uploadId,
          id,
          index,
        );
      }
    } catch (error) {
      await this.burn(id);
      throw error;
    }
    return { id };
  }

  uploadTarget(
    sender: Sender,
    dropId: string,
    index: number,
    part: number,
  ): { key: string; uploadId: string; size: number } | null {
    const drop = this.row(dropId);
    if (drop?.state !== "uploading" || drop.sender_id !== sender.deviceId) return null;
    const item = this.item(dropId, index);
    if (item?.upload_id == null || part < 0 || part >= partCount(item.size)) return null;
    return {
      key: objectKey(dropId, index),
      uploadId: item.upload_id,
      size: partSize(item.size, part),
    };
  }

  async recordPart(dropId: string, index: number, part: number, etag: string): Promise<void> {
    if (this.row(dropId)?.state !== "uploading") return;
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO drop_parts (drop_id, idx, part, etag) VALUES (?, ?, ?, ?)",
      dropId,
      index,
      part,
      etag,
    );
    this.ctx.storage.sql.exec(
      "UPDATE drops SET expires_at = ? WHERE id = ?",
      Date.now() + UPLOAD_TIMEOUT_MS,
      dropId,
    );
    await this.scheduleExpiry();
  }

  async complete(
    sender: Sender,
    dropId: string,
    manifest: Uint8Array,
  ): Promise<"completed" | "not-found" | "incomplete"> {
    const drop = this.row(dropId);
    if (drop?.state !== "uploading" || drop.sender_id !== sender.deviceId) return "not-found";
    const items = this.items(dropId);
    const parts = this.ctx.storage.sql
      .exec<{ idx: number; part: number; etag: string }>(
        "SELECT idx, part, etag FROM drop_parts WHERE drop_id = ? ORDER BY idx, part",
        dropId,
      )
      .toArray();
    const complete = items.every(
      (item) => parts.filter(({ idx }) => idx === item.idx).length === partCount(item.size),
    );
    if (!complete) return "incomplete";
    this.ctx.storage.sql.exec("UPDATE drops SET state = 'completing' WHERE id = ?", dropId);
    try {
      for (const item of items) {
        if (item.upload_id === null) throw new Error("missing upload");
        await this.bucket
          .resumeMultipartUpload(objectKey(dropId, item.idx), item.upload_id)
          .complete(
            parts
              .filter(({ idx }) => idx === item.idx)
              .map(({ part, etag }) => ({ partNumber: part + 1, etag })),
          );
      }
    } catch (error) {
      await this.burn(dropId);
      throw error;
    }
    const now = Date.now();
    this.ctx.storage.sql.exec(
      "UPDATE drops SET state = 'pending', manifest = ?, created_at = ?, expires_at = ? WHERE id = ?",
      manifest,
      now,
      now + LIFETIME_MS,
      dropId,
    );
    this.ctx.storage.sql.exec("DELETE FROM drop_parts WHERE drop_id = ?", dropId);
    await this.scheduleExpiry();
    return "completed";
  }

  list(deviceNames: Map<string, string>): DropSummary[] {
    return this.ctx.storage.sql
      .exec<DropRow>("SELECT * FROM drops WHERE state = 'pending' ORDER BY created_at")
      .toArray()
      .map((drop) => ({
        id: drop.id,
        sender: device(drop.sender_id, deviceNames),
        target: drop.target_id === null ? null : device(drop.target_id, deviceNames),
        items: this.items(drop.id).map(({ size }) => ({ size })),
        manifest: new Uint8Array(drop.manifest ?? new ArrayBuffer(0)),
        createdAt: drop.created_at,
        expiresAt: drop.expires_at,
      }));
  }

  receivable(receiver: Sender, dropId: string): boolean {
    const drop = this.row(dropId);
    if (drop?.state !== "pending") return false;
    return drop.target_id === null
      ? drop.sender_id !== receiver.deviceId
      : drop.target_id === receiver.deviceId;
  }

  itemKey(receiver: Sender, dropId: string, index: number): string | null {
    if (!this.receivable(receiver, dropId) || !this.item(dropId, index)) return null;
    return objectKey(dropId, index);
  }

  exists(dropId: string): boolean {
    return this.row(dropId) !== null;
  }

  async burn(dropId: string): Promise<boolean> {
    this.discard(dropId);
    return this.flush();
  }

  async burnAll(): Promise<boolean> {
    for (const { id } of this.ids("SELECT id FROM drops")) this.discard(id);
    return this.flush();
  }

  async burnExpired(): Promise<boolean> {
    for (const { id } of this.ids("SELECT id FROM drops WHERE expires_at <= ?", Date.now())) {
      this.discard(id);
    }
    return this.flush();
  }

  // Synchronous so callers can burn drops in the same step as the change that causes it;
  // the stored content is removed by the next flush.
  discardTargetedAt(deviceId: string): void {
    for (const { id } of this.ids("SELECT id FROM drops WHERE target_id = ?", deviceId)) {
      this.discard(id);
    }
  }

  async flush(): Promise<boolean> {
    const { cleanups, discarded } = this;
    this.cleanups = [];
    this.discarded = false;
    for (const { key, uploadId } of cleanups) {
      if (uploadId === null) {
        await this.bucket.delete(key);
      } else {
        await this.bucket
          .resumeMultipartUpload(key, uploadId)
          .abort()
          .catch(() => this.bucket.delete(key));
      }
    }
    await this.scheduleExpiry();
    return discarded;
  }

  private discard(dropId: string): void {
    const drop = this.row(dropId);
    if (!drop) return;
    this.discarded = true;
    for (const item of this.items(dropId)) {
      const key = objectKey(dropId, item.idx);
      if (drop.state === "pending") this.cleanups.push({ key, uploadId: null });
      else if (item.upload_id !== null) this.cleanups.push({ key, uploadId: item.upload_id });
    }
    this.ctx.storage.transactionSync(() => {
      for (const table of ["drop_parts", "drop_items"]) {
        this.ctx.storage.sql.exec(`DELETE FROM ${table} WHERE drop_id = ?`, dropId);
      }
      this.ctx.storage.sql.exec("DELETE FROM drops WHERE id = ?", dropId);
    });
  }

  private ids(query: string, ...bindings: (string | number)[]): { id: string }[] {
    return this.ctx.storage.sql.exec<{ id: string }>(query, ...bindings).toArray();
  }

  private async scheduleExpiry(): Promise<void> {
    const next = this.ctx.storage.sql
      .exec<{ at: number | null }>("SELECT MIN(expires_at) AS at FROM drops")
      .one().at;
    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }

  private row(dropId: string): DropRow | null {
    return (
      this.ctx.storage.sql.exec<DropRow>("SELECT * FROM drops WHERE id = ?", dropId).toArray()[0] ??
      null
    );
  }

  private items(dropId: string): ItemRow[] {
    return this.ctx.storage.sql
      .exec<ItemRow>("SELECT * FROM drop_items WHERE drop_id = ? ORDER BY idx", dropId)
      .toArray();
  }

  private item(dropId: string, index: number): ItemRow | undefined {
    return this.ctx.storage.sql
      .exec<ItemRow>("SELECT * FROM drop_items WHERE drop_id = ? AND idx = ?", dropId, index)
      .toArray()[0];
  }
}

function device(id: string, names: Map<string, string>): DeviceRef {
  return { id, name: names.get(id) ?? null };
}

function randomId(): string {
  return isoBase64URL.fromBuffer(crypto.getRandomValues(new Uint8Array(16)));
}
