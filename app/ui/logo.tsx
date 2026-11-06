export function Logo({ className = "title" }: { className?: string }) {
  return (
    <span className={`gd-logo ${className}`}>
      <span className="sr-only">ghostdrop</span>
      <span aria-hidden>
        gh
        <svg className="gd-logo__o" viewBox="0 0 100 100" aria-hidden="true">
          <path
            className="gd-logo__vessel"
            d="M84.955 48.965 A39.000 39.000 0 1 1 51.035 15.045 A1.500 1.500 0 0 1 52.318 16.845 A26.000 26.000 0 0 0 53.442 31.475 A1.500 1.500 0 0 1 51.653 33.457 A21.000 21.000 0 1 0 66.543 48.347 A1.500 1.500 0 0 1 68.525 46.558 A26.000 26.000 0 0 0 83.155 47.682 A1.500 1.500 0 0 1 84.955 48.965 Z"
          />
          <circle className="gd-logo__soul" cx="77.75" cy="22.25" r="15" />
        </svg>
        stdrop
      </span>
    </span>
  );
}
