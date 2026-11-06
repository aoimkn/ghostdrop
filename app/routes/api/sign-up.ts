import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { z } from "zod";

import { cloudflareContext } from "~/.server/context";
import { error, readJson } from "~/.server/http";
import { deviceNameSchema, newDeviceId, passphraseSchema, verifier } from "~/.server/passphrase";
import { account, startSession } from "~/.server/session";
import { redeemChallenge, registrationResponse, relyingParty } from "~/.server/webauthn";

import type { Route } from "./+types/sign-up";

const body = z.object({
  credential: registrationResponse,
  passphrase: passphraseSchema,
  device: z.object({ name: deviceNameSchema }),
});

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const { credential: response, passphrase, device } = await readJson(request, body);
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
  const stub = account(env, accountId);
  const proofVerifier = await verifier(passphrase.proof);
  const created = await stub.create(
    {
      id: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports ?? [],
      aaguid,
    },
    { params: passphrase.params, verifier: proofVerifier },
  );
  if (!created) return error(409, "account-exists");
  const { cookie, tokenHash } = await startSession(env, accountId);
  await stub.addDevice(tokenHash, { id: newDeviceId(), name: device.name }, proofVerifier);
  return new Response(null, { status: 204, headers: { "Set-Cookie": cookie } });
}
