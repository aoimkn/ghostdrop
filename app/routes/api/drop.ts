import { cloudflareContext } from "~/.server/context";
import { error } from "~/.server/http";
import { account, sessionContext } from "~/.server/session";

import type { Route } from "./+types/drop";

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "DELETE") return error(405, "method-not-allowed");
  const { env } = context.get(cloudflareContext);
  const { accountId, tokenHash } = context.get(sessionContext);
  if (!(await account(env, accountId).deleteDrop(tokenHash, params.id))) {
    return error(404, "not-found");
  }
  return new Response(null, { status: 204 });
}
