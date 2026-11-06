import { z } from "zod";

import { transact } from "./idb.client";
import { SHARE_KEY, SHARE_PLACE } from "./share";

const shared = z.object({ text: z.string().nullable(), files: z.array(z.instanceof(File)) });

export type Shared = z.infer<typeof shared>;

export async function takeShared(): Promise<Shared | null> {
  const value: unknown = await transact(SHARE_PLACE, "readonly", (store) => store.get(SHARE_KEY));
  if (value === undefined) return null;
  await transact(SHARE_PLACE, "readwrite", (store) => store.delete(SHARE_KEY));
  const parsed = shared.safeParse(value);
  return parsed.success ? parsed.data : null;
}
