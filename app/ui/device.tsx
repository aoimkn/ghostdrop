import { DevicesIcon } from "@phosphor-icons/react/dist/csr/Devices";

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
  return <span className="gd-badge gd-badge--warning caption">{m.device_locked()}</span>;
}
