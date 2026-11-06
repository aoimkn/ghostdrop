import { use } from "react";

import type { Passkey } from "~/app/lib/account.client";
import { m } from "~/app/paraglide/messages";
import { getLocale } from "~/app/paraglide/runtime";
import { formatDate } from "~/app/ui/format";

export function PasskeyRows({
  passkeys,
  onRemove,
}: {
  passkeys: Promise<Passkey[]>;
  onRemove: (passkey: Passkey) => void;
}) {
  const locale = getLocale();
  return use(passkeys).map((passkey) => (
    <div key={passkey.id} className="gd-device last:border-b-0">
      <div className="gd-device__main">
        <div className="caption text-ink-muted">
          {m.passkey_created_at({ date: formatDate(locale, passkey.createdAt) })}
        </div>
        <div className="caption text-ink-muted">
          {passkey.lastUsedAt === null
            ? m.passkey_never_used()
            : m.passkey_last_used_at({ date: formatDate(locale, passkey.lastUsedAt) })}
        </div>
      </div>
      <button
        type="button"
        className="gd-button gd-button--subtle gd-button--destructive label min-h-11"
        onClick={() => onRemove(passkey)}
      >
        {m.passkey_remove()}
      </button>
    </div>
  ));
}
