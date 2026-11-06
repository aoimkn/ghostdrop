import { cloudflareContext } from "~/app/.server/context";
import { error } from "~/app/.server/http";
import { account, sessionContext } from "~/app/.server/session";

import type { Route } from "./+types/passkey";

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "DELETE") return error(405, "method-not-allowed");
  const { env } = context.get(cloudflareContext);
  const { accountId } = context.get(sessionContext);
  const result = await account(env, accountId).removePasskey(params.id);
  if (result === "not-found") return error(404, "not-found");
  if (result === "last-passkey") return error(409, "last-passkey");
  return new Response(null, { status: 204 });
}
