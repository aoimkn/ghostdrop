import { z } from "zod";

import { cloudflareContext } from "~/app/.server/context";
import { base64urlBytes, error, readJson } from "~/app/.server/http";
import { account, sessionContext } from "~/app/.server/session";

import type { Route } from "./+types/complete";

const body = z.object({ manifest: base64urlBytes({ maxBytes: 48 * 1024 }) });

export async function action({ request, params, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const { accountId, tokenHash } = context.get(sessionContext);
  const { manifest } = await readJson(request, body);
  const result = await account(env, accountId).completeDrop(tokenHash, params.id, manifest);
  if (result === "not-found") return error(404, result);
  if (result === "incomplete") return error(409, result);
  return new Response(null, { status: 204 });
}
