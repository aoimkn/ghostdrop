import { use } from "react";

import { m } from "~/app/paraglide/messages";

export function AccountCounts({
  counts,
}: {
  counts: Promise<{ passkeys: number; devices: number; pendingDrops: number }>;
}) {
  const { passkeys, devices, pendingDrops } = use(counts);
  return (
    <span className="mono text-ink-muted">
      {m.passkey_count({ count: passkeys })} &middot; {m.device_count({ count: devices })} &middot;{" "}
      {m.drop_pending_count({ count: pendingDrops })}
    </span>
  );
}
