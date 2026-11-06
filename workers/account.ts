import { DurableObject } from "cloudflare:workers";
import { z } from "zod";

import { Drops, type DropSummary, type Sender } from "./drops";

export type NewPasskey = {
  id: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  aaguid: string;
};

export type Passkey = NewPasskey & { createdAt: number; lastUsedAt: number | null };

export type PasskeySummary = Pick<Passkey, "id" | "aaguid" | "createdAt" | "lastUsedAt">;

export type Passphrase = { params: Uint8Array; verifier: Uint8Array };

export type Device = { id: string; name: string; locked: boolean; createdAt: number };

type DeviceRow = { id: string; name: string; epoch: number; created_at: number };

type PasskeyRow = {
  id: string;
  public_key: ArrayBuffer;
  counter: number;
  transports: string;
  aaguid: string;
  created_at: number;
  last_used_at: number | null;
};

export class Account extends DurableObject<Env> {
  private readonly drops: Drops;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.drops = new Drops(ctx, env.DROPS);
    this.migrate();
  }

  private migrate(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS passkeys (
        id TEXT PRIMARY KEY,
        public_key BLOB NOT NULL,
        counter INTEGER NOT NULL,
        transports TEXT NOT NULL,
        aaguid TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS passphrase (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        params BLOB NOT NULL,
        verifier BLOB NOT NULL,
        epoch INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL UNIQUE,
        epoch INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    this.drops.migrate();
  }

  exists(): boolean {
    return this.passkeyCount() > 0;
  }

  create(passkey: NewPasskey, passphrase: Passphrase): boolean {
    if (this.exists()) return false;
    this.ctx.storage.transactionSync(() => {
      this.insertPasskey(passkey);
      this.ctx.storage.sql.exec(
        "INSERT INTO passphrase (id, params, verifier, epoch) VALUES (1, ?, ?, 1)",
        passphrase.params,
        passphrase.verifier,
      );
    });
    return true;
  }

  async delete(): Promise<void> {
    await this.drops.burnAll();
    this.closeSockets();
    await this.ctx.storage.deleteAll();
    this.migrate();
  }

  addPasskey(passkey: NewPasskey): boolean {
    if (!this.exists() || this.getPasskey(passkey.id)) return false;
    this.insertPasskey(passkey);
    return true;
  }

  getPasskey(id: string): Passkey | null {
    const row = this.ctx.storage.sql
      .exec<PasskeyRow>("SELECT * FROM passkeys WHERE id = ?", id)
      .toArray()[0];
    if (!row) return null;
    return {
      id: row.id,
      publicKey: new Uint8Array(row.public_key),
      counter: row.counter,
      transports: z.array(z.string()).parse(JSON.parse(row.transports)),
      aaguid: row.aaguid,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    };
  }

  listPasskeys(): PasskeySummary[] {
    return this.ctx.storage.sql
      .exec<Pick<PasskeyRow, "id" | "aaguid" | "created_at" | "last_used_at">>(
        "SELECT id, aaguid, created_at, last_used_at FROM passkeys ORDER BY created_at",
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        aaguid: row.aaguid,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
      }));
  }

  removePasskey(id: string): "removed" | "not-found" | "last-passkey" {
    if (!this.getPasskey(id)) return "not-found";
    if (this.passkeyCount() === 1) return "last-passkey";
    this.ctx.storage.sql.exec("DELETE FROM passkeys WHERE id = ?", id);
    return "removed";
  }

  recordPasskeyUse(id: string, counter: number): void {
    this.ctx.storage.sql.exec(
      "UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?",
      counter,
      Date.now(),
      id,
    );
  }

  async createSession(tokenHash: string, expiresAt: number): Promise<void> {
    this.purgeExpiredSessions();
    this.ctx.storage.sql.exec(
      "INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)",
      tokenHash,
      expiresAt,
    );
    await this.settle();
  }

  extendSession(tokenHash: string, expiresAt: number): boolean {
    const updated = this.ctx.storage.sql.exec(
      "UPDATE sessions SET expires_at = ? WHERE token_hash = ? AND expires_at > ?",
      expiresAt,
      tokenHash,
      Date.now(),
    ).rowsWritten;
    return updated > 0;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.removeSession(tokenHash);
    await this.settle();
  }

  passphraseParams(): Uint8Array | null {
    const row = this.ctx.storage.sql
      .exec<{ params: ArrayBuffer }>("SELECT params FROM passphrase")
      .toArray()[0];
    return row ? new Uint8Array(row.params) : null;
  }

  async replacePassphrase(passphrase: Passphrase, tokenHash: string): Promise<void> {
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "UPDATE passphrase SET params = ?, verifier = ?, epoch = epoch + 1",
        passphrase.params,
        passphrase.verifier,
      );
      this.ctx.storage.sql.exec(
        "UPDATE devices SET epoch = (SELECT epoch FROM passphrase) WHERE token_hash = ?",
        tokenHash,
      );
    });
    if (await this.drops.burnAll()) this.notify();
  }

  async addDevice(
    tokenHash: string,
    device: { id: string; name: string },
    verifier: Uint8Array,
  ): Promise<"added" | "wrong-passphrase" | "already-added" | "name-taken"> {
    if (!this.verifierMatches(verifier)) return "wrong-passphrase";
    this.purgeExpiredSessions();
    const result = this.insertDevice(tokenHash, device);
    await this.settle();
    return result;
  }

  private insertDevice(
    tokenHash: string,
    device: { id: string; name: string },
  ): "added" | "already-added" | "name-taken" {
    if (this.deviceRow(tokenHash)) return "already-added";
    if (this.nameTaken(device.name)) return "name-taken";
    this.ctx.storage.sql.exec(
      "INSERT INTO devices (id, token_hash, name, epoch, created_at) VALUES (?, ?, ?, (SELECT epoch FROM passphrase), ?)",
      device.id,
      tokenHash,
      device.name,
      Date.now(),
    );
    return "added";
  }

  unlockDevice(
    tokenHash: string,
    verifier: Uint8Array,
  ): "unlocked" | "wrong-passphrase" | "no-device" {
    if (!this.deviceRow(tokenHash)) return "no-device";
    if (!this.verifierMatches(verifier)) return "wrong-passphrase";
    this.ctx.storage.sql.exec(
      "UPDATE devices SET epoch = (SELECT epoch FROM passphrase) WHERE token_hash = ?",
      tokenHash,
    );
    return "unlocked";
  }

  currentDevice(tokenHash: string): Device | null {
    const row = this.deviceRow(tokenHash);
    return row ? this.toDevice(row) : null;
  }

  async listDevices(): Promise<Device[]> {
    this.purgeExpiredSessions();
    const devices = this.ctx.storage.sql
      .exec<DeviceRow>("SELECT id, name, epoch, created_at FROM devices ORDER BY created_at")
      .toArray()
      .map((row) => this.toDevice(row));
    await this.settle();
    return devices;
  }

  async renameDevice(id: string, name: string): Promise<"renamed" | "not-found" | "name-taken"> {
    this.purgeExpiredSessions();
    const result = this.updateDeviceName(id, name);
    await this.settle();
    return result;
  }

  private updateDeviceName(id: string, name: string): "renamed" | "not-found" | "name-taken" {
    const current = this.ctx.storage.sql
      .exec<{ name: string }>("SELECT name FROM devices WHERE id = ?", id)
      .toArray()[0];
    if (!current) return "not-found";
    if (current.name !== name && this.nameTaken(name)) return "name-taken";
    this.ctx.storage.sql.exec("UPDATE devices SET name = ? WHERE id = ?", name, id);
    return "renamed";
  }

  async removeDevice(id: string): Promise<{ tokenHash: string } | null> {
    const row = this.ctx.storage.sql
      .exec<{ token_hash: string }>("SELECT token_hash FROM devices WHERE id = ?", id)
      .toArray()[0];
    if (!row) return null;
    await this.deleteSession(row.token_hash);
    return { tokenHash: row.token_hash };
  }

  async createDrop(
    tokenHash: string,
    targetId: string | null,
    sizes: number[],
  ): Promise<
    | { id: string }
    | "no-device"
    | "locked"
    | "bad-target"
    | "invalid-size"
    | "too-many-items"
    | "too-large"
    | "limit-reached"
  > {
    const sender = this.unlockedSender(tokenHash);
    if (typeof sender === "string") return sender;
    if (targetId !== null && (targetId === sender.deviceId || !this.deviceExists(targetId))) {
      return "bad-target";
    }
    return this.drops.create(sender, targetId, sizes);
  }

  dropUploadTarget(tokenHash: string, dropId: string, index: number, part: number) {
    const sender = this.unlockedSender(tokenHash);
    if (typeof sender === "string") return null;
    return this.drops.uploadTarget(sender, dropId, index, part);
  }

  async recordDropPart(dropId: string, index: number, part: number, etag: string): Promise<void> {
    await this.drops.recordPart(dropId, index, part, etag);
  }

  async completeDrop(
    tokenHash: string,
    dropId: string,
    manifest: Uint8Array,
  ): Promise<"completed" | "not-found" | "incomplete"> {
    const sender = this.unlockedSender(tokenHash);
    if (typeof sender === "string") return "not-found";
    const result = await this.drops.complete(sender, dropId, manifest);
    if (result === "completed") this.notify();
    return result;
  }

  async listDrops(tokenHash: string): Promise<DropSummary[] | null> {
    this.purgeExpiredSessions();
    await this.settle();
    if (!this.deviceRow(tokenHash)) return null;
    const names = new Map(
      this.ctx.storage.sql
        .exec<{ id: string; name: string }>("SELECT id, name FROM devices")
        .toArray()
        .map(({ id, name }) => [id, name]),
    );
    return this.drops.list(names);
  }

  dropItemKey(tokenHash: string, dropId: string, index: number): string | null {
    const receiver = this.unlockedSender(tokenHash);
    if (typeof receiver === "string") return null;
    return this.drops.itemKey(receiver, dropId, index);
  }

  async receiveDrop(tokenHash: string, dropId: string): Promise<boolean> {
    const receiver = this.unlockedSender(tokenHash);
    if (typeof receiver === "string" || !this.drops.receivable(receiver, dropId)) return false;
    if (await this.drops.burn(dropId)) this.notify();
    return true;
  }

  async deleteDrop(tokenHash: string, dropId: string): Promise<boolean> {
    if (!this.deviceRow(tokenHash) || !this.drops.exists(dropId)) return false;
    if (await this.drops.burn(dropId)) this.notify();
    return true;
  }

  override async alarm(): Promise<void> {
    if (await this.drops.burnExpired()) this.notify();
  }

  override fetch(request: Request): Response {
    const deviceId = request.headers.get("X-Device-Id");
    if (request.headers.get("Upgrade") !== "websocket" || deviceId === null) {
      return new Response(null, { status: 400 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    if (!client || !server) throw new Error("failed to create a WebSocket pair");
    this.ctx.acceptWebSocket(server, [deviceId]);
    return new Response(null, { status: 101, webSocket: client });
  }

  deviceIdFor(tokenHash: string): string | null {
    return this.deviceRow(tokenHash)?.id ?? null;
  }

  private notify(): void {
    for (const socket of this.ctx.getWebSockets()) socket.send("drops");
  }

  private closeSockets(deviceId?: string): void {
    for (const socket of this.ctx.getWebSockets(deviceId)) socket.close(1000, "signed out");
  }

  private unlockedSender(tokenHash: string): Sender | "no-device" | "locked" {
    const row = this.deviceRow(tokenHash);
    if (!row) return "no-device";
    if (this.toDevice(row).locked) return "locked";
    return { deviceId: row.id };
  }

  private deviceExists(id: string): boolean {
    return this.ctx.storage.sql.exec("SELECT 1 FROM devices WHERE id = ?", id).toArray().length > 0;
  }

  private purgeExpiredSessions(): void {
    const expired = this.ctx.storage.sql
      .exec<{ token_hash: string }>(
        "SELECT token_hash FROM sessions WHERE expires_at <= ?",
        Date.now(),
      )
      .toArray();
    for (const { token_hash } of expired) this.removeSession(token_hash);
  }

  private removeSession(tokenHash: string): void {
    const device = this.deviceRow(tokenHash);
    if (device) {
      this.drops.discardTargetedAt(device.id);
      this.closeSockets(device.id);
    }
    this.ctx.storage.sql.exec("DELETE FROM devices WHERE token_hash = ?", tokenHash);
    this.ctx.storage.sql.exec("DELETE FROM sessions WHERE token_hash = ?", tokenHash);
  }

  private async settle(): Promise<void> {
    if (await this.drops.flush()) this.notify();
  }

  private deviceRow(tokenHash: string): DeviceRow | undefined {
    return this.ctx.storage.sql
      .exec<DeviceRow>(
        "SELECT id, name, epoch, created_at FROM devices WHERE token_hash = ?",
        tokenHash,
      )
      .toArray()[0];
  }

  private toDevice(row: DeviceRow): Device {
    const { epoch } = this.ctx.storage.sql
      .exec<{ epoch: number }>("SELECT epoch FROM passphrase")
      .one();
    return { id: row.id, name: row.name, locked: row.epoch !== epoch, createdAt: row.created_at };
  }

  private nameTaken(name: string): boolean {
    return (
      this.ctx.storage.sql.exec("SELECT 1 FROM devices WHERE name = ?", name).toArray().length > 0
    );
  }

  private verifierMatches(verifier: Uint8Array): boolean {
    const row = this.ctx.storage.sql
      .exec<{ verifier: ArrayBuffer }>("SELECT verifier FROM passphrase")
      .toArray()[0];
    if (!row) return false;
    const stored = new Uint8Array(row.verifier);
    if (stored.length !== verifier.length) return false;
    let difference = 0;
    for (const [i, byte] of stored.entries()) difference |= byte ^ (verifier[i] ?? 0);
    return difference === 0;
  }

  private passkeyCount(): number {
    return this.ctx.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM passkeys").one().n;
  }

  private insertPasskey(passkey: NewPasskey): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO passkeys (id, public_key, counter, transports, aaguid, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      passkey.id,
      passkey.publicKey,
      passkey.counter,
      JSON.stringify(passkey.transports),
      passkey.aaguid,
      Date.now(),
    );
  }
}
