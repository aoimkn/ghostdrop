import { cloudflareContext } from "~/app/.server/context";
import { account, sessionContext } from "~/app/.server/session";

import type { Route } from "./+types/session";

export async function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { accountId, tokenHash } = context.get(sessionContext);
  const device = await account(env, accountId).currentDevice(tokenHash);
  return Response.json({
    accountId,
    device: device ? { id: device.id, name: device.name, locked: device.locked } : null,
  });
}
