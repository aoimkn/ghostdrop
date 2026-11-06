import { formatSizeOf } from "~/app/ui/format";

export function TransferProgress({
  label,
  fraction,
  total,
  failed,
  inset = false,
}: {
  label: string;
  fraction: number;
  total: number;
  failed: boolean;
  inset?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className={`label ${failed ? "text-ink-muted" : ""}`}>{label}</span>
        <span className="mono text-ink-muted">{formatSizeOf(fraction * total, total)}</span>
      </div>
      <progress
        className={`gd-progress ${failed ? "gd-progress--stopped" : ""} ${inset ? "bg-surface" : ""}`}
        aria-label={label}
        max={1}
        value={fraction}
      />
    </div>
  );
}
