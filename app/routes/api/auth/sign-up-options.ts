import { generateRegistrationOptions } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import { cloudflareContext } from "~/app/.server/context";
import { limitAuthAttempts } from "~/app/.server/rate-limit";
import { issueChallenge, newAccountId, relyingParty, RP_NAME } from "~/app/.server/webauthn";

import type { Route } from "./+types/sign-up-options";

export const middleware: Route.MiddlewareFunction[] = [limitAuthAttempts];

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const accountId = newAccountId();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: relyingParty(request).id,
    userID: isoBase64URL.toBuffer(accountId),
    userName: RP_NAME,
    attestationType: "none",
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  await issueChallenge(env, options.challenge, { kind: "sign-up", accountId });
  return Response.json(options);
}
