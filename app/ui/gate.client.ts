import { redirect } from "react-router";

import { getSession, type Session } from "~/app/lib/account.client";
import { type Stage, STAGE_HOME } from "~/app/lib/stage";

export function stageOf(session: Session | null): Stage {
  if (!session) return "signed-out";
  if (!session.device) return "no-device";
  return session.unlocked ? "ready" : "locked";
}

export async function requireStage(stage: Stage): Promise<Session | null> {
  const session = await getSession();
  const actual = stageOf(session);
  if (actual !== stage) throw redirect(STAGE_HOME[actual]);
  return session;
}

export async function requireReady(): Promise<
  Session & { device: NonNullable<Session["device"]> }
> {
  const session = await requireStage("ready");
  if (!session?.device) throw redirect("/sign-in");
  return { ...session, device: session.device };
}
