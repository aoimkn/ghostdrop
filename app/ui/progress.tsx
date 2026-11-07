import { formatSizeOf } from "~/app/ui/format";

export function TransferProgress({
  label,
  fraction,
  total,
  failed,
}: {
  label: string;
  fraction: number;
  total: number;
  failed: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className={`label ${failed ? "text-ink-muted" : ""}`}>{label}</span>
        <span className="mono text-ink-muted">{formatSizeOf(fraction * total, total)}</span>
      </div>
      <progress
        className={`gd-progress ${failed ? "gd-progress--stopped" : ""}`}
        aria-label={label}
        max={1}
        value={fraction}
      />
    </div>
  );
}
