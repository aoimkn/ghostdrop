import { cloudflareContext } from "~/app/.server/context";
import { account, clearedSessionCookie, sessionContext } from "~/app/.server/session";

import type { Route } from "./+types/sign-out";

export async function action({ context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const { accountId, tokenHash } = context.get(sessionContext);
  await account(env, accountId).deleteSession(tokenHash);
  return new Response(null, { status: 204, headers: { "Set-Cookie": clearedSessionCookie() } });
}
