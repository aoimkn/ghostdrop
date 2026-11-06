import { z } from "zod";

import { cloudflareContext } from "~/.server/context";
import { error, readJson } from "~/.server/http";
import { proofSchema, verifier } from "~/.server/passphrase";
import { account, sessionContext } from "~/.server/session";

import type { Route } from "./+types/device-unlock";

const body = z.object({ proof: proofSchema });

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const { accountId, tokenHash } = context.get(sessionContext);
  const { proof } = await readJson(request, body);
  const result = await account(env, accountId).unlockDevice(tokenHash, await verifier(proof));
  if (result === "no-device") return error(409, "no-device");
  if (result === "wrong-passphrase") return error(403, "wrong-passphrase");
  return new Response(null, { status: 204 });
}
