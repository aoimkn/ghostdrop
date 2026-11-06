import { z } from "zod";

import { cloudflareContext } from "~/app/.server/context";
import { error, readJson } from "~/app/.server/http";
import { proofSchema, verifier } from "~/app/.server/passphrase-proof";
import { account, sessionContext } from "~/app/.server/session";

import type { Route } from "./+types/unlock";

const body = z.object({ proof: proofSchema });

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const { accountId, tokenHash } = context.get(sessionContext);
  const { proof } = await readJson(request, body);
  const result = await account(env, accountId).unlockDevice(tokenHash, await verifier(proof));
  if (result === "no-device") return error(403, "no-device");
  if (result === "wrong-passphrase") return error(403, "wrong-passphrase");
  return new Response(null, { status: 204 });
}
