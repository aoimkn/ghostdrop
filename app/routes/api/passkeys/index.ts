import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { z } from "zod";

import { cloudflareContext } from "~/app/.server/context";
import { error, readJson } from "~/app/.server/http";
import { account, sessionContext } from "~/app/.server/session";
import {
  authenticationResponse,
  redeemChallenge,
  registrationResponse,
  relyingParty,
  verifyAssertion,
} from "~/app/.server/webauthn";

import type { Route } from "./+types/index";

const body = z.object({ confirmation: authenticationResponse, credential: registrationResponse });

export async function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { accountId } = context.get(sessionContext);
  return Response.json(await account(env, accountId).listPasskeys());
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") return error(405, "method-not-allowed");
  const { env } = context.get(cloudflareContext);
  const { accountId } = context.get(sessionContext);
  const { confirmation, credential: response } = await readJson(request, body);
  const confirmed = await redeemChallenge(env, confirmation);
  if (confirmed?.purpose.kind !== "confirm-passkey" || confirmed.purpose.accountId !== accountId) {
    return error(400, "invalid-challenge");
  }
  if (!(await verifyAssertion(env, request, accountId, confirmation, confirmed.challenge))) {
    return error(400, "verification-failed");
  }
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
