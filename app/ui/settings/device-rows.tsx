import { use } from "react";

import type { Device } from "~/app/lib/account.client";
import { m } from "~/app/paraglide/messages";
import { getLocale } from "~/app/paraglide/runtime";
import { LockedBadge } from "~/app/ui/device";
import { formatDate } from "~/app/ui/format";

export function DeviceRows({
  devices,
  onRename,
  onRemove,
}: {
  devices: Promise<Device[]>;
  onRename: (device: Device) => void;
  onRemove: (device: Device) => void;
}) {
  const locale = getLocale();
  return use(devices).map((device) => (
    <div key={device.id} className="gd-device last:border-b-0">
      <div className="gd-device__main">
        <div className="gd-device__name body">
          <span>{device.name}</span>
          {device.current && <span className="gd-badge caption">{m.device_current()}</span>}
          {device.locked && <LockedBadge />}
        </div>
        <div className="gd-device__since caption">
          {m.device_added_at({ date: formatDate(locale, device.createdAt) })}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="gd-button gd-button--subtle label min-h-11"
          onClick={() => onRename(device)}
        >
          {m.device_rename()}
        </button>
        <button
          type="button"
          className="gd-button gd-button--subtle gd-button--destructive label min-h-11"
          onClick={() => onRemove(device)}
        >
          {m.device_remove()}
        </button>
      </div>
    </div>
  ));
}
