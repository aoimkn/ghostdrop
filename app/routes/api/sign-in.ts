import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import { cloudflareContext } from "~/.server/context";
import { error, readJson } from "~/.server/http";
import { account, startSession } from "~/.server/session";
import { authenticationResponse, redeemChallenge, relyingParty } from "~/.server/webauthn";

import type { Route } from "./+types/sign-in";

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const response = await readJson(request, authenticationResponse);
  const redeemed = await redeemChallenge(env, response);
  if (redeemed?.purpose.kind !== "sign-in") return error(400, "invalid-challenge");
  const userHandle = response.response.userHandle;
  if (!userHandle || isoBase64URL.toBuffer(userHandle).length !== 16) {
    return error(400, "verification-failed");
  }
  const accountId = isoBase64URL.fromBuffer(isoBase64URL.toBuffer(userHandle));
  const stub = account(env, accountId);
  const passkey = await stub.getPasskey(response.id);
  if (!passkey) return error(400, "verification-failed");
  const rp = relyingParty(request);
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: redeemed.challenge,
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
  if (!verification?.verified) return error(400, "verification-failed");
  await stub.recordPasskeyUse(passkey.id, verification.authenticationInfo.newCounter);
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": await startSession(env, accountId) },
  });
}
