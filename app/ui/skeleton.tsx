function Bar({ width, height = 12 }: { width: string; height?: number }) {
  return <span className="gd-skeleton" aria-hidden style={{ width, height }} />;
}

export function DropRowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="contents" aria-busy="true">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="gd-drop">
          <div className="gd-drop__main basis-full gap-2.5">
            <Bar width="55%" height={14} />
            <Bar width="80%" />
            <Bar width="30%" height={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListRowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="contents" aria-busy="true">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="gd-device last:border-b-0">
          <div className="gd-device__main gap-2">
            <Bar width="40%" height={14} />
            <Bar width="30%" height={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LineSkeleton() {
  return <Bar width="60%" height={14} />;
}
