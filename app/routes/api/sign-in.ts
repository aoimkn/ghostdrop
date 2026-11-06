import { isoBase64URL } from "@simplewebauthn/server/helpers";

import { cloudflareContext } from "~/.server/context";
import { error, readJson } from "~/.server/http";
import { startSession } from "~/.server/session";
import { authenticationResponse, redeemChallenge, verifyAssertion } from "~/.server/webauthn";

import type { Route } from "./+types/sign-in";

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const response = await readJson(request, authenticationResponse);
  const redeemed = await redeemChallenge(env, response);
  if (redeemed?.purpose.kind !== "sign-in") return error(400, "invalid-challenge");
  const userHandle = response.response.userHandle;
  if (userHandle === undefined || isoBase64URL.toBuffer(userHandle).length !== 16) {
    return error(400, "verification-failed");
  }
  const accountId = isoBase64URL.fromBuffer(isoBase64URL.toBuffer(userHandle));
  if (!(await verifyAssertion(env, request, accountId, response, redeemed.challenge))) {
    return error(400, "verification-failed");
  }
  const { cookie } = await startSession(env, accountId);
  return new Response(null, { status: 204, headers: { "Set-Cookie": cookie } });
}
