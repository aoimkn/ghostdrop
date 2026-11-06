import { WarningCircleIcon } from "@phosphor-icons/react/dist/csr/WarningCircle";

const TONES = {
  danger: { className: "gd-alert", Icon: WarningCircleIcon },
  warning: { className: "gd-alert gd-alert--warning", Icon: WarningCircleIcon },
};

export function Alert({
  tone,
  quiet = false,
  children,
}: {
  tone: keyof typeof TONES;
  quiet?: boolean;
  children: string;
}) {
  const { className, Icon } = TONES[tone];
  return (
    <div className={className} role={quiet ? "status" : "alert"}>
      <Icon className="gd-alert__icon" aria-hidden />
      <div className="gd-alert__main">
        <span className="body">{children}</span>
      </div>
    </div>
  );
}
