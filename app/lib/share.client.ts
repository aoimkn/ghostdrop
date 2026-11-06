import { z } from "zod";

import { type Place, transact } from "./idb.client";

// The service worker writes here when another app shares with ghostdrop.
const PLACE: Place = { database: "ghostdrop-share", store: "share" };
const KEY = "pending";

const shared = z.object({ text: z.string().nullable(), files: z.array(z.instanceof(File)) });

export type Shared = z.infer<typeof shared>;

export async function takeShared(): Promise<Shared | null> {
  const value: unknown = await transact(PLACE, "readonly", (store) => store.get(KEY));
  if (value === undefined) return null;
  await transact(PLACE, "readwrite", (store) => store.delete(KEY));
  const parsed = shared.safeParse(value);
  return parsed.success ? parsed.data : null;
}
