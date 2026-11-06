import { GearSixIcon } from "@phosphor-icons/react/dist/csr/GearSix";
import { Link } from "react-router";

import { m } from "~/app/paraglide/messages";
import { DeviceName } from "~/app/ui/device";
import { Logo } from "~/app/ui/logo";

export function AppHeader({ deviceName }: { deviceName: string }) {
  return (
    <header className="flex min-h-11 flex-wrap items-center justify-between gap-2">
      <Logo />
      <div className="flex items-center gap-4">
        <span className="label inline-flex items-center gap-1">
          <DeviceName name={deviceName} />
        </span>
        <Link
          to="/settings"
          className="gd-button gd-button--subtle label min-h-11 min-w-11"
          aria-label={m.account_settings()}
        >
          <GearSixIcon size={24} aria-hidden />
        </Link>
      </div>
    </header>
  );
}
