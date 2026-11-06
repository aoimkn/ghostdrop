const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 60 * 60 * 1000;

export type Passphrase = { params: Uint8Array; verifier: Uint8Array };

export type Device = { id: string; name: string; locked: boolean; createdAt: number };

type DeviceRow = { id: string; name: string; epoch: number; created_at: number };

// Sessions, devices and the passphrase live together: a device is a session that has
// proven the passphrase, and it stays unlocked only while it knows the current one.
export class Devices {
  constructor(private readonly sql: SqlStorage) {}

  migrate(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS passphrase (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        params BLOB NOT NULL,
        verifier BLOB NOT NULL,
        epoch INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS passphrase_failures (
        at INTEGER NOT NULL
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

  setPassphrase(passphrase: Passphrase): void {
    this.sql.exec(
      "INSERT INTO passphrase (id, params, verifier, epoch) VALUES (1, ?, ?, 1)",
      passphrase.params,
      passphrase.verifier,
    );
  }

  replacePassphrase(passphrase: Passphrase, tokenHash: string): void {
    this.sql.exec(
      "UPDATE passphrase SET params = ?, verifier = ?, epoch = epoch + 1",
      passphrase.params,
      passphrase.verifier,
    );
    this.sql.exec(
      "UPDATE devices SET epoch = (SELECT epoch FROM passphrase) WHERE token_hash = ?",
      tokenHash,
    );
  }

  passphraseParams(): Uint8Array | null {
    const row = this.sql
      .exec<{ params: ArrayBuffer }>("SELECT params FROM passphrase")
      .toArray()[0];
    return row ? new Uint8Array(row.params) : null;
  }

  // Every attempt is refused while the account is at the limit, so a correct guess cannot
  // be told apart from a wrong one.
  checkPassphrase(
    verifier: Uint8Array,
  ):
    | { result: "correct" }
    | { result: "wrong" }
    | { result: "too-many-attempts"; retryAt: number } {
    const now = Date.now();
    this.sql.exec("DELETE FROM passphrase_failures WHERE at <= ?", now - FAILURE_WINDOW_MS);
    const { n: failures, oldest } = this.sql
      .exec<{ n: number; oldest: number }>(
        "SELECT COUNT(*) AS n, MIN(at) AS oldest FROM passphrase_failures",
      )
      .one();
    if (failures >= MAX_FAILURES) {
      return { result: "too-many-attempts", retryAt: oldest + FAILURE_WINDOW_MS };
    }
    if (this.verifierMatches(verifier)) return { result: "correct" };
    this.sql.exec("INSERT INTO passphrase_failures (at) VALUES (?)", now);
    return { result: "wrong" };
  }

  private verifierMatches(verifier: Uint8Array): boolean {
    const row = this.sql
      .exec<{ verifier: ArrayBuffer }>("SELECT verifier FROM passphrase")
      .toArray()[0];
    if (!row) return false;
    const stored = new Uint8Array(row.verifier);
    if (stored.length !== verifier.length) return false;
    let difference = 0;
    for (const [i, byte] of stored.entries()) difference |= byte ^ (verifier[i] ?? 0);
    return difference === 0;
  }

  createSession(tokenHash: string, expiresAt: number): void {
    this.sql.exec(
      "INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)",
      tokenHash,
      expiresAt,
    );
  }

  extendSession(tokenHash: string, expiresAt: number): boolean {
    return (
      this.sql.exec(
        "UPDATE sessions SET expires_at = ? WHERE token_hash = ? AND expires_at > ?",
        expiresAt,
        tokenHash,
        Date.now(),
      ).rowsWritten > 0
    );
  }

  expiredSessions(): string[] {
    return this.sql
      .exec<{ token_hash: string }>(
        "SELECT token_hash FROM sessions WHERE expires_at <= ?",
        Date.now(),
      )
      .toArray()
      .map(({ token_hash }) => token_hash);
  }

  removeSession(tokenHash: string): { deviceId: string } | null {
    const device = this.row(tokenHash);
    this.sql.exec("DELETE FROM devices WHERE token_hash = ?", tokenHash);
    this.sql.exec("DELETE FROM sessions WHERE token_hash = ?", tokenHash);
    return device ? { deviceId: device.id } : null;
  }

  sessionOf(deviceId: string): string | null {
    return (
      this.sql
        .exec<{ token_hash: string }>("SELECT token_hash FROM devices WHERE id = ?", deviceId)
        .toArray()[0]?.token_hash ?? null
    );
  }

  add(
    tokenHash: string,
    device: { id: string; name: string },
  ): "added" | "already-added" | "name-taken" {
    if (this.row(tokenHash)) return "already-added";
    if (this.nameTaken(device.name)) return "name-taken";
    this.sql.exec(
      "INSERT INTO devices (id, token_hash, name, epoch, created_at) VALUES (?, ?, ?, (SELECT epoch FROM passphrase), ?)",
      device.id,
      tokenHash,
      device.name,
      Date.now(),
    );
    return "added";
  }

  unlock(tokenHash: string): void {
    this.sql.exec(
      "UPDATE devices SET epoch = (SELECT epoch FROM passphrase) WHERE token_hash = ?",
      tokenHash,
    );
  }

  rename(id: string, name: string): "renamed" | "not-found" | "name-taken" {
    const current = this.sql
      .exec<{ name: string }>("SELECT name FROM devices WHERE id = ?", id)
      .toArray()[0];
    if (!current) return "not-found";
    if (current.name !== name && this.nameTaken(name)) return "name-taken";
    this.sql.exec("UPDATE devices SET name = ? WHERE id = ?", name, id);
    return "renamed";
  }

  ofSession(tokenHash: string): Device | null {
    const row = this.row(tokenHash);
    return row ? this.toDevice(row) : null;
  }

  exists(id: string): boolean {
    return this.sql.exec("SELECT 1 FROM devices WHERE id = ?", id).toArray().length > 0;
  }

  list(): Device[] {
    return this.sql
      .exec<DeviceRow>("SELECT id, name, epoch, created_at FROM devices ORDER BY created_at")
      .toArray()
      .map((row) => this.toDevice(row));
  }

  names(): Map<string, string> {
    return new Map(this.list().map(({ id, name }) => [id, name]));
  }

  private row(tokenHash: string): DeviceRow | undefined {
    return this.sql
      .exec<DeviceRow>(
        "SELECT id, name, epoch, created_at FROM devices WHERE token_hash = ?",
        tokenHash,
      )
      .toArray()[0];
  }

  private toDevice(row: DeviceRow): Device {
    const { epoch } = this.sql.exec<{ epoch: number }>("SELECT epoch FROM passphrase").one();
    return { id: row.id, name: row.name, locked: row.epoch !== epoch, createdAt: row.created_at };
  }

  private nameTaken(name: string): boolean {
    return this.sql.exec("SELECT 1 FROM devices WHERE name = ?", name).toArray().length > 0;
  }
}
