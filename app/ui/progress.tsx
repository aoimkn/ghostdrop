export function ProgressBar({
  label,
  fraction,
  stopped = false,
  className = "",
}: {
  label: string;
  fraction: number;
  stopped?: boolean;
  className?: string;
}) {
  return (
    <progress
      className={`gd-progress ${stopped ? "gd-progress--stopped" : ""} ${className}`}
      aria-label={label}
      max={1}
      value={fraction}
    />
  );
}
