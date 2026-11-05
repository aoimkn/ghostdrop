import { verifyRegistrationResponse } from "@simplewebauthn/server";

import { cloudflareContext } from "~/.server/context";
import { error, readJson } from "~/.server/http";
import { account, startSession } from "~/.server/session";
import { redeemChallenge, registrationResponse, relyingParty } from "~/.server/webauthn";

import type { Route } from "./+types/sign-up";

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const response = await readJson(request, registrationResponse);
  const redeemed = await redeemChallenge(env, response);
  if (redeemed?.purpose.kind !== "sign-up") return error(400, "invalid-challenge");
  const rp = relyingParty(request);
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: redeemed.challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
    requireUserVerification: true,
  }).catch(() => null);
  if (verification?.verified !== true) return error(400, "verification-failed");
  const { credential, aaguid } = verification.registrationInfo;
  const { accountId } = redeemed.purpose;
  const created = await account(env, accountId).create({
    id: credential.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports ?? [],
    aaguid,
  });
  if (!created) return error(409, "account-exists");
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": await startSession(env, accountId) },
  });
}
