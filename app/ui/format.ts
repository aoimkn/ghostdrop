const KIB = 1024;
const MIB = 1024 * KIB;

export function formatSize(bytes: number): string {
  if (bytes < KIB) return `${bytes} B`;
  if (bytes < MIB) return `${Math.round(bytes / KIB)} KiB`;
  const mib = bytes / MIB;
  return `${mib < 10 ? mib.toFixed(1) : Math.round(mib)} MiB`;
}

export function formatSizeOf(done: number, total: number): string {
  if (done < MIB || total < MIB) return `${formatSize(done)} / ${formatSize(total)}`;
  return `${(done / MIB).toFixed(1)} / ${formatSize(total)}`;
}

export function formatTimeLeft(locale: string, ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const [value, unit] = minutes < 60 ? [minutes, "minute"] : [Math.floor(minutes / 60), "hour"];
  return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "short" }).format(value);
}

export function formatDate(locale: string, ms: number): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(ms);
}

export function formatTime(locale: string, ms: number): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(ms);
}
