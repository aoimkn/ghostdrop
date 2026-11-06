import { cloudflareContext } from "~/app/.server/context";
import { error, isSameOrigin } from "~/app/.server/http";
import { account, sessionContext } from "~/app/.server/session";

import type { Route } from "./+types/events";

// Browsers send cookies with cross-site WebSocket handshakes as GET requests, which the
// same-origin middleware lets through, so the origin is checked here.
export async function loader({ request, context }: Route.LoaderArgs) {
  if (request.headers.get("Upgrade") !== "websocket") return error(426, "upgrade-required");
  if (!isSameOrigin(request)) return error(403, "cross-origin");
  const { env } = context.get(cloudflareContext);
  const { accountId, tokenHash } = context.get(sessionContext);
  const stub = account(env, accountId);
  const deviceId = await stub.deviceIdFor(tokenHash);
  if (deviceId === null) return error(403, "no-device");
  const upgraded = await stub.fetch("https://account/events", {
    headers: { Upgrade: "websocket", "X-Device-Id": deviceId },
  });
  // The Durable Object's response has immutable headers, and the session middleware
  // appends the refreshed cookie to it.
  return new Response(null, { status: upgraded.status, webSocket: upgraded.webSocket });
}
