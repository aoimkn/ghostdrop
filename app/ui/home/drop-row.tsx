import type { ItemMeta } from "~/app/lib/drop-crypto";
import type { Drop } from "~/app/lib/drops.client";
import { formatSize, formatTimeLeft } from "~/app/ui/format";
import { m } from "~/app/paraglide/messages";
import { getLocale } from "~/app/paraglide/runtime";
import { Alert } from "~/app/ui/alert";
import { TransferProgress } from "~/app/ui/progress";

export function Route({ drop }: { drop: Drop }) {
  return (
    <>
      <span>{drop.sender.name ?? m.device_unknown()}</span>
      <span className="gd-drop__arrow" aria-hidden>
        &rarr;
      </span>
      <span>{drop.target ? (drop.target.name ?? m.device_unknown()) : m.drop_target_any()}</span>
    </>
  );
}

function describe(meta: readonly ItemMeta[], size: number): string {
  const labels = [...new Set(meta.map((item) => item.name ?? item.type))];
  return `${m.drop_item_count({ count: meta.length })} · ${labels.join(", ")} · ${formatSize(size)}`;
}

type Props = {
  drop: Drop;
  meta: readonly ItemMeta[];
  size: number;
  fresh: boolean;
  receivable: boolean;
  receiveBlocked: boolean;
  deleting: boolean;
  receiving: { progress: number; failed: boolean } | null;
  stacked: boolean;
  now: number;
  onReceive: () => void;
  onDelete: () => void;
};

export function DropRow({
  drop,
  meta,
  size,
  fresh,
  receivable,
  receiveBlocked,
  deleting,
  receiving,
  stacked,
  now,
  onReceive,
  onDelete,
}: Props) {
  const highlighted = fresh || receiving !== null;
  return (
    <div
      className={`gd-drop ${highlighted ? "gd-drop--arrived" : ""} ${receiving ? "flex-col items-stretch" : ""}`}
    >
      <div
        className={`gd-drop__main ${stacked || receiving ? "basis-full" : ""} ${receiving ? "flex-none" : ""}`}
      >
        <div className="gd-drop__route label">
          <Route drop={drop} />
          {fresh && receivable && !receiving && (
            <span className="gd-badge gd-badge--signal caption">{m.drop_new()}</span>
          )}
        </div>
        <div className="gd-drop__meta mono">{describe(meta, size)}</div>
        <div className="gd-drop__expiry caption">
          {m.drop_expires_in({ time: formatTimeLeft(getLocale(), drop.expiresAt - now) })}
        </div>
      </div>
      {receiving?.failed === true && <Alert tone="danger">{m.drop_receive_failed()}</Alert>}
      {receiving && (
        <TransferProgress
          label={receiving.failed ? m.drop_receive_failed() : m.drop_receive_in_progress()}
          fraction={receiving.progress}
          total={size}
          failed={receiving.failed}
        />
      )}
      {(!receiving || receiving.failed) && (
        <div className={`gd-drop__actions ${stacked ? "w-full" : ""}`}>
          {receivable && (
            <button
              type="button"
              className={`gd-button gd-button--primary label min-h-11 ${stacked ? "flex-1" : ""}`}
              disabled={receiveBlocked || deleting}
              onClick={onReceive}
            >
              {receiving?.failed === true ? m.common_retry() : m.drop_receive()}
            </button>
          )}
          <button
            type="button"
            className="gd-button gd-button--subtle gd-button--destructive label min-h-11"
            disabled={deleting}
            aria-busy={deleting || undefined}
            onClick={onDelete}
          >
            {m.drop_delete()}
          </button>
        </div>
      )}
    </div>
  );
}
