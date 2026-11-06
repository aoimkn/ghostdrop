import { cloudflareContext } from "~/.server/context";
import { error } from "~/.server/http";
import { account, clearedSessionCookie, sessionContext } from "~/.server/session";

import type { Route } from "./+types/account";

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "DELETE") return error(405, "method-not-allowed");
  const { env } = context.get(cloudflareContext);
  const { accountId } = context.get(sessionContext);
  await account(env, accountId).delete();
  return new Response(null, { status: 204, headers: { "Set-Cookie": clearedSessionCookie() } });
}
