import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { getSession } from "~/app/lib/account.client";
import type { ItemMeta } from "~/app/lib/drop-crypto";
import { type Drop, listDrops, readManifest, watchDrops } from "~/app/lib/drops.client";
import { homeOf, stageOf } from "~/app/ui/gate.client";

export type Entry = { drop: Drop; meta: ItemMeta[]; size: number; fresh: boolean };

export function useDrops(): { entries: Entry[] | null; refresh: () => Promise<void> } {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const fresh = useRef(new Set<string>());
  const manifests = useRef(new Map<string, ItemMeta[]>());

  const refresh = async () => {
    const stage = stageOf(await getSession());
    if (stage !== "ready") {
      await navigate(homeOf(stage));
      return;
    }
    const drops = await listDrops();
    const known = seen.current;
    const next: Entry[] = [];
    for (const drop of drops) {
      let meta = manifests.current.get(drop.id);
      if (!meta) {
        meta = await readManifest(drop);
        manifests.current.set(drop.id, meta);
      }
      if (known !== null && !known.has(drop.id)) fresh.current.add(drop.id);
      next.unshift({
        drop,
        meta,
        size: meta.reduce((sum, item) => sum + item.size, 0),
        fresh: fresh.current.has(drop.id),
      });
    }
    seen.current = new Set([...(known ?? []), ...drops.map(({ id }) => id)]);
    setEntries(next);
  };

  const onChange = useEffectEvent(() => void refresh());
  useEffect(() => watchDrops(onChange), []);

  return { entries, refresh };
}
