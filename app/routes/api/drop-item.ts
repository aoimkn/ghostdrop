import { cloudflareContext } from "~/app/.server/context";
import { error } from "~/app/.server/http";
import { account, sessionContext } from "~/app/.server/session";

import type { Route } from "./+types/drop-item";

export async function loader({ params, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { accountId, tokenHash } = context.get(sessionContext);
  const index = Number(params.index);
  if (!Number.isSafeInteger(index)) return error(404, "not-found");
  const key = await account(env, accountId).dropItemKey(tokenHash, params.id, index);
  const object = key === null ? null : await env.DROPS.get(key);
  if (!object) return error(404, "not-found");
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(object.size),
      "Cache-Control": "no-store",
    },
  });
}
