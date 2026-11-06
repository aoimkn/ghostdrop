// Where a browser belongs, by how far along it is: signed in, added as a device, unlocked.
export type Stage = "signed-out" | "no-device" | "locked" | "ready";

export const STAGE_HOME: Record<Stage, string> = {
  "signed-out": "/sign-in",
  "no-device": "/add-device",
  locked: "/unlock",
  ready: "/",
};
