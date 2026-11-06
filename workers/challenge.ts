import { DurableObject } from "cloudflare:workers";

export type ChallengePurpose =
  | { kind: "sign-up"; accountId: string }
  | { kind: "sign-in" }
  | { kind: "confirm-passkey"; accountId: string }
  | { kind: "add-passkey"; accountId: string };

type Stored = { purpose: ChallengePurpose; expiresAt: number };

const LIFETIME_MS = 5 * 60 * 1000;

// One instance per challenge, addressed by the challenge itself, so a challenge can be
// redeemed once without a server-side secret or a shared index.
export class Challenge extends DurableObject<Env> {
  async issue(purpose: ChallengePurpose): Promise<void> {
    const expiresAt = Date.now() + LIFETIME_MS;
    await this.ctx.storage.put<Stored>("challenge", { purpose, expiresAt });
    await this.ctx.storage.setAlarm(expiresAt);
  }

  async redeem(): Promise<ChallengePurpose | null> {
    const stored = await this.ctx.storage.get<Stored>("challenge");
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    if (!stored || stored.expiresAt <= Date.now()) return null;
    return stored.purpose;
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
