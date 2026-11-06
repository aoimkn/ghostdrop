import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { z } from "zod";

import { cloudflareContext } from "~/.server/context";
import { error, readJson } from "~/.server/http";
import { account, sessionContext } from "~/.server/session";

import type { Route } from "./+types/drop-complete";

const body = z.object({
  manifest: z
    .string()
    .min(1)
    .max(64 * 1024)
    .regex(/^[A-Za-z0-9_-]+$/),
});

export async function action({ request, params, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const { accountId, tokenHash } = context.get(sessionContext);
  const { manifest } = await readJson(request, body);
  const result = await account(env, accountId).completeDrop(
    tokenHash,
    params.id,
    isoBase64URL.toBuffer(manifest),
  );
  if (result === "not-found") return error(404, result);
  if (result === "incomplete") return error(409, result);
  return new Response(null, { status: 204 });
}
