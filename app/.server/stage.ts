import { type MiddlewareFunction, redirect, type RouterContextProvider } from "react-router";

import { cloudflareContext } from "./context";
import { account, readSession } from "./session";

// What the server can tell about this browser from its session alone. Whether the passphrase key
// is in the browser is known only there, so "device" may still turn out locked.
type ServerStage =
  | { stage: "signed-out" }
  | { stage: "no-device" }
  | { stage: "locked" | "device"; deviceName: string };

const HOME = {
  "signed-out": "/sign-in",
  "no-device": "/add-device",
  locked: "/unlock",
  device: "/",
};

async function serverStage({
  context,
  request,
}: {
  context: Readonly<RouterContextProvider>;
  request: Request;
}): Promise<ServerStage> {
  const { env } = context.get(cloudflareContext);
  const session = await readSession(env, request);
  if (session === null) return { stage: "signed-out" };
  const device = await account(env, session.accountId).currentDevice(session.tokenHash);
  if (device === null) return { stage: "no-device" };
  return { stage: device.locked ? "locked" : "device", deviceName: device.name };
}

function leaveUnless<S extends ServerStage["stage"]>(
  current: ServerStage,
  ...allowed: S[]
): asserts current is Extract<ServerStage, { stage: S }> {
  if (!(allowed as readonly string[]).includes(current.stage)) throw redirect(HOME[current.stage]);
}

// Sends the browser where its session belongs before the page is rendered, so it never sees a page
// it would be moved away from.
export function onlyAt(...allowed: ServerStage["stage"][]): MiddlewareFunction<Response> {
  return async (args, next) => {
    leaveUnless(await serverStage(args), ...allowed);
    return next();
  };
}
