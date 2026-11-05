import { generateAuthenticationOptions } from "@simplewebauthn/server";

import { cloudflareContext } from "~/.server/context";
import { issueChallenge, relyingParty } from "~/.server/webauthn";

import type { Route } from "./+types/sign-in-options";

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const options = await generateAuthenticationOptions({
    rpID: relyingParty(request).id,
    userVerification: "required",
  });
  await issueChallenge(env, options.challenge, { kind: "sign-in" });
  return Response.json(options);
}
