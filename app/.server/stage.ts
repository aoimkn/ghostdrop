import { type MiddlewareFunction, redirect, type RouterContextProvider } from "react-router";

import { type Stage, STAGE_HOME } from "~/app/lib/stage";

import { cloudflareContext } from "./context";
import { account, readSession } from "./session";

// The server sees only the session, so "ready" here can still turn out locked in a browser whose
// passphrase key is gone.
async function serverStage({
  context,
  request,
}: {
  context: Readonly<RouterContextProvider>;
  request: Request;
}): Promise<Stage> {
  const { env } = context.get(cloudflareContext);
  const session = await readSession(env, request);
  if (session === null) return "signed-out";
  const device = await account(env, session.accountId).currentDevice(session.tokenHash);
  if (device === null) return "no-device";
  return device.locked ? "locked" : "ready";
}

// Sends the browser where its session belongs before the page is rendered, so it never sees a page
// it would be moved away from.
export function onlyAt(...allowed: Stage[]): MiddlewareFunction<Response> {
  return async (args, next) => {
    const stage = await serverStage(args);
    if (!allowed.includes(stage)) throw redirect(STAGE_HOME[stage]);
    return next();
  };
}
