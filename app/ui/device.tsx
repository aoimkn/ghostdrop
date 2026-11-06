import { DevicesIcon } from "@phosphor-icons/react/dist/csr/Devices";
import { LockSimpleIcon } from "@phosphor-icons/react/dist/csr/LockSimple";

import { m } from "~/app/paraglide/messages";

export function DeviceName({ name }: { name: string }) {
  return (
    <>
      <DevicesIcon size={20} aria-hidden />
      <span>{name}</span>
    </>
  );
}

export function LockedBadge() {
  return (
    <span className="gd-badge gd-badge--warning caption">
      <LockSimpleIcon size={12} aria-hidden />
      {m.device_locked()}
    </span>
  );
}
