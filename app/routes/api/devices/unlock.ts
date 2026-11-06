import { z } from "zod";

import { cloudflareContext } from "~/app/.server/context";
import { error, readJson, tooManyAttempts } from "~/app/.server/http";
import { proofSchema, verifier } from "~/app/.server/passphrase-proof";
import { account, sessionContext } from "~/app/.server/session";

import type { Route } from "./+types/unlock";

const body = z.object({ proof: proofSchema });

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const { accountId, tokenHash } = context.get(sessionContext);
  const { proof } = await readJson(request, body);
  const result = await account(env, accountId).unlockDevice(tokenHash, await verifier(proof));
  if (result.result === "no-device" || result.result === "wrong-passphrase") {
    return error(403, result.result);
  }
  if (result.result === "too-many-attempts") return tooManyAttempts(result.retryAt);
  return new Response(null, { status: 204 });
}
