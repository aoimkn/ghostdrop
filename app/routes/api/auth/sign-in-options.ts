import { generateAuthenticationOptions } from "@simplewebauthn/server";

import { cloudflareContext } from "~/app/.server/context";
import { limitAuthAttempts } from "~/app/.server/rate-limit";
import { issueChallenge, relyingParty } from "~/app/.server/webauthn";

import type { Route } from "./+types/sign-in-options";

export const middleware: Route.MiddlewareFunction[] = [limitAuthAttempts];

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const options = await generateAuthenticationOptions({
    rpID: relyingParty(request).id,
    userVerification: "required",
  });
  await issueChallenge(env, options.challenge, { kind: "sign-in" });
  return Response.json(options);
}
