import { DurableObject } from "cloudflare:workers";

export type NewPasskey = {
  id: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  aaguid: string;
};

export type Passkey = NewPasskey & { createdAt: number; lastUsedAt: number | null };

export type PasskeySummary = Pick<Passkey, "id" | "aaguid" | "createdAt" | "lastUsedAt">;

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
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS passkeys (
        id TEXT PRIMARY KEY,
        public_key BLOB NOT NULL,
        counter INTEGER NOT NULL,
        transports TEXT NOT NULL,
        aaguid TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL
      );
    `);
  }

  exists(): boolean {
    return this.passkeyCount() > 0;
  }

  create(passkey: NewPasskey): boolean {
    if (this.exists()) return false;
    this.insertPasskey(passkey);
    return true;
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
      transports: JSON.parse(row.transports) as string[],
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
    this.ctx.storage.sql.exec("DELETE FROM sessions WHERE expires_at <= ?", Date.now());
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
    this.ctx.storage.sql.exec("DELETE FROM sessions WHERE token_hash = ?", tokenHash);
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
