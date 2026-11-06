import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { decodeClientDataJSON, isoBase64URL } from "@simplewebauthn/server/helpers";
import { z } from "zod";

import type { ChallengePurpose } from "../../workers/challenge";
import { account } from "./session";

export const RP_NAME = "ghostdrop";

export function relyingParty(request: Request): { id: string; origin: string } {
  const url = new URL(request.url);
  return { id: url.hostname, origin: url.origin };
}

const base64url = z.string().regex(/^[A-Za-z0-9_-]+$/);

export const registrationResponse = z.looseObject({
  id: base64url,
  rawId: base64url,
  type: z.literal("public-key"),
  response: z.looseObject({
    clientDataJSON: base64url,
    attestationObject: base64url,
    transports: z.array(z.string()).optional(),
  }),
  clientExtensionResults: z.looseObject({}),
}) satisfies z.ZodType<RegistrationResponseJSON>;

export const authenticationResponse = z.looseObject({
  id: base64url,
  rawId: base64url,
  type: z.literal("public-key"),
  response: z.looseObject({
    clientDataJSON: base64url,
    authenticatorData: base64url,
    signature: base64url,
    userHandle: base64url.optional(),
  }),
  clientExtensionResults: z.looseObject({}),
}) satisfies z.ZodType<AuthenticationResponseJSON>;

export async function issueChallenge(
  env: Env,
  challenge: string,
  purpose: ChallengePurpose,
): Promise<void> {
  await env.CHALLENGE.get(env.CHALLENGE.idFromName(challenge)).issue(purpose);
}

// The challenge is read from the unverified client data only to find its record;
// verification still checks it against the redeemed value.
export async function redeemChallenge(
  env: Env,
  response: { response: { clientDataJSON: string } },
): Promise<{ challenge: string; purpose: ChallengePurpose } | null> {
  let challenge: string;
  try {
    challenge = decodeClientDataJSON(response.response.clientDataJSON).challenge;
  } catch {
    return null;
  }
  if (!isoBase64URL.isBase64URL(challenge)) return null;
  const purpose = await env.CHALLENGE.get(env.CHALLENGE.idFromName(challenge)).redeem();
  return purpose ? { challenge, purpose } : null;
}

export function newAccountId(): string {
  return isoBase64URL.fromBuffer(crypto.getRandomValues(new Uint8Array(16)));
}

export async function verifyAssertion(
  env: Env,
  request: Request,
  accountId: string,
  response: AuthenticationResponseJSON,
  challenge: string,
): Promise<boolean> {
  const stub = account(env, accountId);
  const passkey = await stub.getPasskey(response.id);
  if (!passkey) return false;
  const rp = relyingParty(request);
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
    credential: {
      id: passkey.id,
      publicKey: new Uint8Array(passkey.publicKey),
      counter: passkey.counter,
      transports: passkey.transports,
    },
    requireUserVerification: true,
  }).catch(() => null);
  if (verification?.verified !== true) return false;
  await stub.recordPasskeyUse(passkey.id, verification.authenticationInfo.newCounter);
  return true;
}
