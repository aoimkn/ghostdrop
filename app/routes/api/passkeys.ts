import { verifyRegistrationResponse } from "@simplewebauthn/server";

import { cloudflareContext } from "~/.server/context";
import { error, readJson } from "~/.server/http";
import { account, sessionContext } from "~/.server/session";
import { redeemChallenge, registrationResponse, relyingParty } from "~/.server/webauthn";

import type { Route } from "./+types/passkeys";

export async function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { accountId } = context.get(sessionContext);
  return Response.json(await account(env, accountId).listPasskeys());
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") return error(405, "method-not-allowed");
  const { env } = context.get(cloudflareContext);
  const { accountId } = context.get(sessionContext);
  const response = await readJson(request, registrationResponse);
  const redeemed = await redeemChallenge(env, response);
  if (redeemed?.purpose.kind !== "add-passkey" || redeemed.purpose.accountId !== accountId) {
    return error(400, "invalid-challenge");
  }
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
  const added = await account(env, accountId).addPasskey({
    id: credential.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports ?? [],
    aaguid,
  });
  if (!added) return error(409, "passkey-exists");
  return new Response(null, { status: 204 });
}
