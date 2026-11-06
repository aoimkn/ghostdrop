import { useEffect, useId, useRef, type ReactNode } from "react";

import { m } from "~/app/paraglide/messages";

type Props = {
  title: string;
  body?: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function Dialog({
  title,
  body,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="gd-dialog"
      role={danger ? "alertdialog" : "dialog"}
      aria-labelledby={titleId}
      aria-describedby={body === undefined ? undefined : bodyId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <form
        className="contents"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <h2 className="gd-dialog__title title" id={titleId}>
          {title}
        </h2>
        {body !== undefined && (
          <p className="gd-dialog__body body" id={bodyId}>
            {body}
          </p>
        )}
        {children}
        <div className="gd-dialog__actions">
          <button
            type="button"
            className="gd-button gd-button--secondary label"
            disabled={busy}
            onClick={onCancel}
          >
            {m.common_cancel()}
          </button>
          <button
            type="submit"
            className={`gd-button ${danger ? "gd-button--danger" : "gd-button--primary"} label`}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
