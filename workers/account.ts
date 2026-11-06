import { DurableObject } from "cloudflare:workers";
import { z } from "zod";

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
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
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

  createSession(tokenHash: string, expiresAt: number): void {
    this.purgeExpiredSessions();
    this.ctx.storage.sql.exec(
      "INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)",
      tokenHash,
      expiresAt,
    );
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

  deleteSession(tokenHash: string): void {
    this.ctx.storage.sql.exec("DELETE FROM devices WHERE token_hash = ?", tokenHash);
    this.ctx.storage.sql.exec("DELETE FROM sessions WHERE token_hash = ?", tokenHash);
  }

  passphraseParams(): Uint8Array | null {
    const row = this.ctx.storage.sql
      .exec<{ params: ArrayBuffer }>("SELECT params FROM passphrase")
      .toArray()[0];
    return row ? new Uint8Array(row.params) : null;
  }

  replacePassphrase(passphrase: Passphrase, tokenHash: string): void {
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
  }

  addDevice(
    tokenHash: string,
    device: { id: string; name: string },
    verifier: Uint8Array,
  ): "added" | "wrong-passphrase" | "already-added" | "name-taken" {
    if (!this.verifierMatches(verifier)) return "wrong-passphrase";
    this.purgeExpiredSessions();
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

  listDevices(): Device[] {
    this.purgeExpiredSessions();
    return this.ctx.storage.sql
      .exec<DeviceRow>("SELECT id, name, epoch, created_at FROM devices ORDER BY created_at")
      .toArray()
      .map((row) => this.toDevice(row));
  }

  renameDevice(id: string, name: string): "renamed" | "not-found" | "name-taken" {
    this.purgeExpiredSessions();
    const current = this.ctx.storage.sql
      .exec<{ name: string }>("SELECT name FROM devices WHERE id = ?", id)
      .toArray()[0];
    if (!current) return "not-found";
    if (current.name !== name && this.nameTaken(name)) return "name-taken";
    this.ctx.storage.sql.exec("UPDATE devices SET name = ? WHERE id = ?", name, id);
    return "renamed";
  }

  removeDevice(id: string): { tokenHash: string } | null {
    const row = this.ctx.storage.sql
      .exec<{ token_hash: string }>("SELECT token_hash FROM devices WHERE id = ?", id)
      .toArray()[0];
    if (!row) return null;
    this.deleteSession(row.token_hash);
    return { tokenHash: row.token_hash };
  }

  private purgeExpiredSessions(): void {
    const now = Date.now();
    this.ctx.storage.sql.exec(
      "DELETE FROM devices WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires_at <= ?)",
      now,
    );
    this.ctx.storage.sql.exec("DELETE FROM sessions WHERE expires_at <= ?", now);
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
