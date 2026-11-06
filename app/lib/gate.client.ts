import { redirect } from "react-router";

import { getSession, type Session } from "./account.client";

export type Stage = "signed-out" | "no-device" | "locked" | "ready";

const HOME: Record<Stage, string> = {
  "signed-out": "/sign-in",
  "no-device": "/add-device",
  locked: "/unlock",
  ready: "/",
};

export function stageOf(session: Session | null): Stage {
  if (!session) return "signed-out";
  if (!session.device) return "no-device";
  return session.unlocked ? "ready" : "locked";
}

export async function requireStage(stage: Stage): Promise<Session | null> {
  const session = await getSession();
  const actual = stageOf(session);
  if (actual !== stage) throw redirect(HOME[actual]);
  return session;
}

export async function requireReady(): Promise<
  Session & { device: NonNullable<Session["device"]> }
> {
  const session = await requireStage("ready");
  if (!session?.device) throw redirect("/sign-in");
  return { ...session, device: session.device };
}

export function homeOf(stage: Stage): string {
  return HOME[stage];
}
