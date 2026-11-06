import { z } from "zod";

export type NewPasskey = {
  id: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  aaguid: string;
};

export type Passkey = NewPasskey & { createdAt: number; lastUsedAt: number | null };

type PasskeySummary = Pick<Passkey, "id" | "aaguid" | "createdAt" | "lastUsedAt">;

type PasskeyRow = {
  id: string;
  public_key: ArrayBuffer;
  counter: number;
  transports: string;
  aaguid: string;
  created_at: number;
  last_used_at: number | null;
};

export class Passkeys {
  constructor(private readonly sql: SqlStorage) {}

  migrate(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS passkeys (
        id TEXT PRIMARY KEY,
        public_key BLOB NOT NULL,
        counter INTEGER NOT NULL,
        transports TEXT NOT NULL,
        aaguid TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER
      );
    `);
  }

  any(): boolean {
    return this.count() > 0;
  }

  insert(passkey: NewPasskey): void {
    this.sql.exec(
      "INSERT INTO passkeys (id, public_key, counter, transports, aaguid, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      passkey.id,
      passkey.publicKey,
      passkey.counter,
      JSON.stringify(passkey.transports),
      passkey.aaguid,
      Date.now(),
    );
  }

  get(id: string): Passkey | null {
    const row = this.sql.exec<PasskeyRow>("SELECT * FROM passkeys WHERE id = ?", id).toArray()[0];
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

  list(): PasskeySummary[] {
    return this.sql
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

  remove(id: string): "removed" | "not-found" | "last-passkey" {
    if (!this.get(id)) return "not-found";
    if (this.count() === 1) return "last-passkey";
    this.sql.exec("DELETE FROM passkeys WHERE id = ?", id);
    return "removed";
  }

  recordUse(id: string, counter: number): void {
    this.sql.exec(
      "UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?",
      counter,
      Date.now(),
      id,
    );
  }

  private count(): number {
    return this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM passkeys").one().n;
  }
}
