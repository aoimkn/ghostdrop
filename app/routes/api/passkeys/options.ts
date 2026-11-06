import { generateAuthenticationOptions, generateRegistrationOptions } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import { cloudflareContext } from "~/app/.server/context";
import { account, sessionContext } from "~/app/.server/session";
import { issueChallenge, relyingParty, RP_NAME } from "~/app/.server/webauthn";

import type { Route } from "./+types/options";

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const { accountId } = context.get(sessionContext);
  const passkeys = await account(env, accountId).listPasskeys();
  const rpID = relyingParty(request).id;
  const confirm = await generateAuthenticationOptions({
    rpID,
    allowCredentials: passkeys.map(({ id }) => ({ id })),
    userVerification: "required",
  });
  const create = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: isoBase64URL.toBuffer(accountId),
    userName: RP_NAME,
    attestationType: "none",
    excludeCredentials: passkeys.map(({ id }) => ({ id })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  await issueChallenge(env, confirm.challenge, { kind: "confirm-passkey", accountId });
  await issueChallenge(env, create.challenge, { kind: "add-passkey", accountId });
  return Response.json({ confirm, create });
}
