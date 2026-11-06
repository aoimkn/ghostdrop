import { useState } from "react";
import { useNavigate } from "react-router";

import { signUp } from "~/app/lib/account.client";
import { isValidDeviceName } from "~/app/lib/device-name";
import { requireStage } from "~/app/lib/gate.client";
import { isLongEnough } from "~/app/lib/passphrase";
import { m } from "~/app/paraglide/messages";
import { Alert } from "~/app/ui/alert";
import { errorMessage, isCancelledByUser } from "~/app/ui/error-message";
import { Field } from "~/app/ui/field";
import { Column, PageHeader } from "~/app/ui/page-header";

export async function clientLoader() {
  await requireStage("signed-out");
  return null;
}

export function HydrateFallback() {
  return null;
}

export default function SignUp() {
  const navigate = useNavigate();
  const [passphrase, setPassphrase] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = isLongEnough(passphrase) && isValidDeviceName(name);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signUp(passphrase, name);
      await navigate("/");
    } catch (caught) {
      if (!isCancelledByUser(caught)) setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Column>
      <PageHeader back="/sign-in">{m.account_sign_up_title()}</PageHeader>
      {error !== null && <Alert tone="warning">{error}</Alert>}
      <form
        className="flex flex-1 flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) void submit();
        }}
      >
        <p className="body m-0 text-ink-muted">{m.account_sign_up_body()}</p>
        <Field
          label={m.passphrase_new_label()}
          hint={m.passphrase_hint()}
          type="password"
          autoComplete="new-password"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
        />
        <Field
          label={m.device_name_label()}
          hint={m.device_name_hint()}
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          type="submit"
          className="gd-button gd-button--primary label mt-auto min-h-12"
          disabled={!valid || busy}
          aria-busy={busy || undefined}
        >
          {m.account_sign_up()}
        </button>
      </form>
    </Column>
  );
}
