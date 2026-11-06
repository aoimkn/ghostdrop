import { z } from "zod";

import { cloudflareContext } from "~/app/.server/context";
import { error, readJson } from "~/app/.server/http";
import { deviceNameSchema } from "~/app/.server/device";
import { account, clearedSessionCookie, sessionContext } from "~/app/.server/session";

import type { Route } from "./+types/device";

const body = z.object({ name: deviceNameSchema });

export async function action({ request, params, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const { accountId, tokenHash } = context.get(sessionContext);
  const stub = account(env, accountId);
  if (request.method === "PATCH") {
    const { name } = await readJson(request, body);
    const result = await stub.renameDevice(params.id, name);
    if (result === "not-found") return error(404, "not-found");
    if (result === "name-taken") return error(409, "name-taken");
    return new Response(null, { status: 204 });
  }
  if (request.method === "DELETE") {
    const removed = await stub.removeDevice(params.id);
    if (!removed) return error(404, "not-found");
    return new Response(null, {
      status: 204,
      headers: removed.tokenHash === tokenHash ? { "Set-Cookie": clearedSessionCookie() } : {},
    });
  }
  return error(405, "method-not-allowed");
}
