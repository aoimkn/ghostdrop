import { cloudflareContext } from "~/app/.server/context";
import { error } from "~/app/.server/http";
import { account, sessionContext } from "~/app/.server/session";

import type { Route } from "./+types/received";

export async function action({ params, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const { accountId, tokenHash } = context.get(sessionContext);
  if (!(await account(env, accountId).receiveDrop(tokenHash, params.id))) {
    return error(404, "not-found");
  }
  return new Response(null, { status: 204 });
}
