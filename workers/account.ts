import { DurableObject } from "cloudflare:workers";

import { type Device, Devices, type Passphrase } from "./devices";
import { Drops, type DropSummary, type Sender } from "./drops";
import { type NewPasskey, type Passkey, Passkeys } from "./passkeys";

export class Account extends DurableObject<Env> {
  private readonly passkeys: Passkeys;
  private readonly devices: Devices;
  private readonly drops: Drops;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.passkeys = new Passkeys(ctx.storage.sql);
    this.devices = new Devices(ctx.storage.sql);
    this.drops = new Drops(ctx, env.DROPS);
    this.migrate();
  }

  create(passkey: NewPasskey, passphrase: Passphrase): boolean {
    if (this.passkeys.any()) return false;
    this.ctx.storage.transactionSync(() => {
      this.passkeys.insert(passkey);
      this.devices.setPassphrase(passphrase);
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
    if (!this.passkeys.any() || this.passkeys.get(passkey.id)) return false;
    this.passkeys.insert(passkey);
    return true;
  }

  getPasskey(id: string): Passkey | null {
    return this.passkeys.get(id);
  }

  listPasskeys() {
    return this.passkeys.list();
  }

  removePasskey(id: string) {
    return this.passkeys.remove(id);
  }

  recordPasskeyUse(id: string, counter: number): void {
    this.passkeys.recordUse(id, counter);
  }

  async createSession(tokenHash: string, expiresAt: number): Promise<void> {
    this.purgeExpiredSessions();
    this.devices.createSession(tokenHash, expiresAt);
    await this.settle();
  }

  extendSession(tokenHash: string, expiresAt: number): boolean {
    return this.devices.extendSession(tokenHash, expiresAt);
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.removeSession(tokenHash);
    await this.settle();
  }

  passphraseParams(): Uint8Array | null {
    return this.devices.passphraseParams();
  }

  async replacePassphrase(passphrase: Passphrase, tokenHash: string): Promise<void> {
    this.ctx.storage.transactionSync(() => this.devices.replacePassphrase(passphrase, tokenHash));
    if (await this.drops.burnAll()) this.notify();
  }

  async addDevice(
    tokenHash: string,
    device: { id: string; name: string },
    verifier: Uint8Array,
  ): Promise<
    | { result: "added" | "wrong-passphrase" | "already-added" | "name-taken" }
    | { result: "too-many-attempts"; retryAt: number }
  > {
    const check = this.devices.checkPassphrase(verifier);
    if (check.result === "wrong") return { result: "wrong-passphrase" };
    if (check.result === "too-many-attempts") return check;
    this.purgeExpiredSessions();
    const result = this.devices.add(tokenHash, device);
    await this.settle();
    return { result };
  }

  unlockDevice(
    tokenHash: string,
    verifier: Uint8Array,
  ):
    | { result: "unlocked" | "wrong-passphrase" | "no-device" }
    | { result: "too-many-attempts"; retryAt: number } {
    if (!this.devices.ofSession(tokenHash)) return { result: "no-device" };
    const check = this.devices.checkPassphrase(verifier);
    if (check.result === "wrong") return { result: "wrong-passphrase" };
    if (check.result === "too-many-attempts") return check;
    this.devices.unlock(tokenHash);
    return { result: "unlocked" };
  }

  currentDevice(tokenHash: string): Device | null {
    return this.devices.ofSession(tokenHash);
  }

  deviceIdFor(tokenHash: string): string | null {
    return this.devices.ofSession(tokenHash)?.id ?? null;
  }

  async listDevices(): Promise<Device[]> {
    this.purgeExpiredSessions();
    await this.settle();
    return this.devices.list();
  }

  async renameDevice(id: string, name: string): Promise<"renamed" | "not-found" | "name-taken"> {
    this.purgeExpiredSessions();
    await this.settle();
    return this.devices.rename(id, name);
  }

  async removeDevice(id: string): Promise<{ tokenHash: string } | null> {
    const tokenHash = this.devices.sessionOf(id);
    if (tokenHash === null) return null;
    await this.deleteSession(tokenHash);
    return { tokenHash };
  }

  async createDrop(
    tokenHash: string,
    targetId: string | null,
    sizes: number[],
  ): Promise<
    | { result: "created"; id: string }
    | {
        result:
          | "no-device"
          | "locked"
          | "bad-target"
          | "invalid-size"
          | "too-many-items"
          | "too-large"
          | "limit-reached";
      }
  > {
    const unlocked = this.unlockedSender(tokenHash);
    if (unlocked.result !== "unlocked") return unlocked;
    const { sender } = unlocked;
    if (targetId !== null && (targetId === sender.deviceId || !this.devices.exists(targetId))) {
      return { result: "bad-target" };
    }
    return this.drops.create(sender, targetId, sizes);
  }

  dropUploadTarget(tokenHash: string, dropId: string, index: number, part: number) {
    const unlocked = this.unlockedSender(tokenHash);
    if (unlocked.result !== "unlocked") return null;
    return this.drops.uploadTarget(unlocked.sender, dropId, index, part);
  }

  async recordDropPart(dropId: string, index: number, part: number, etag: string): Promise<void> {
    await this.drops.recordPart(dropId, index, part, etag);
  }

  async completeDrop(
    tokenHash: string,
    dropId: string,
    manifest: Uint8Array,
  ): Promise<"completed" | "not-found" | "incomplete"> {
    const unlocked = this.unlockedSender(tokenHash);
    if (unlocked.result !== "unlocked") return "not-found";
    const result = await this.drops.complete(unlocked.sender, dropId, manifest);
    if (result === "completed") this.notify();
    return result;
  }

  async listDrops(tokenHash: string): Promise<DropSummary[] | null> {
    this.purgeExpiredSessions();
    await this.settle();
    if (!this.devices.ofSession(tokenHash)) return null;
    return this.drops.list(this.devices.names());
  }

  dropItemKey(tokenHash: string, dropId: string, index: number): string | null {
    const unlocked = this.unlockedSender(tokenHash);
    if (unlocked.result !== "unlocked") return null;
    return this.drops.itemKey(unlocked.sender, dropId, index);
  }

  async receiveDrop(tokenHash: string, dropId: string): Promise<boolean> {
    const unlocked = this.unlockedSender(tokenHash);
    if (unlocked.result !== "unlocked" || !this.drops.receivable(unlocked.sender, dropId)) {
      return false;
    }
    if (await this.drops.burn(dropId)) this.notify();
    return true;
  }

  async deleteDrop(tokenHash: string, dropId: string): Promise<boolean> {
    if (!this.devices.ofSession(tokenHash) || !this.drops.exists(dropId)) return false;
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

  private migrate(): void {
    this.passkeys.migrate();
    this.devices.migrate();
    this.drops.migrate();
  }

  private unlockedSender(
    tokenHash: string,
  ): { result: "unlocked"; sender: Sender } | { result: "no-device" | "locked" } {
    const device = this.devices.ofSession(tokenHash);
    if (!device) return { result: "no-device" };
    if (device.locked) return { result: "locked" };
    return { result: "unlocked", sender: { deviceId: device.id } };
  }

  private purgeExpiredSessions(): void {
    for (const tokenHash of this.devices.expiredSessions()) this.removeSession(tokenHash);
  }

  private removeSession(tokenHash: string): void {
    const removed = this.devices.removeSession(tokenHash);
    if (!removed) return;
    this.drops.discardTargetedAt(removed.deviceId);
    this.closeSockets(removed.deviceId);
  }

  private async settle(): Promise<void> {
    if (await this.drops.flush()) this.notify();
  }

  private notify(): void {
    for (const socket of this.ctx.getWebSockets()) socket.send("drops");
  }

  private closeSockets(deviceId?: string): void {
    for (const socket of this.ctx.getWebSockets(deviceId)) socket.close(1000, "signed out");
  }
}
