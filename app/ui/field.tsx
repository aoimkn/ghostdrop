import { useId, type InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string | null;
};

export function Field({ label, hint, error, ...input }: Props) {
  const id = useId();
  const note = error ?? hint ?? null;
  return (
    <label
      className={error === null || error === undefined ? "gd-field" : "gd-field gd-field--error"}
    >
      <span className="gd-field__label label">{label}</span>
      <input
        className="gd-field__input body min-h-11"
        aria-invalid={error === null || error === undefined ? undefined : true}
        aria-describedby={note === null ? undefined : id}
        {...input}
      />
      {note !== null && (
        <span className="gd-field__hint caption" id={id}>
          {note}
        </span>
      )}
    </label>
  );
}
