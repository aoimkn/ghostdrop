import { WarningCircleIcon } from "@phosphor-icons/react/dist/csr/WarningCircle";

export function Alert({
  tone,
  quiet = false,
  children,
}: {
  tone: "warning" | "danger";
  quiet?: boolean;
  children: string;
}) {
  return (
    <div
      className={tone === "warning" ? "gd-alert gd-alert--warning" : "gd-alert"}
      role={quiet ? "status" : "alert"}
    >
      <WarningCircleIcon className="gd-alert__icon" aria-hidden />
      <div className="gd-alert__main">
        <span className="body">{children}</span>
      </div>
    </div>
  );
}
