import { useState } from "react";
import { useNavigate } from "react-router";

import { onlyAt } from "~/app/.server/stage";
import { addDevice, signOut } from "~/app/lib/account.client";
import { ApiError } from "~/app/lib/api.client";
import { isValidDeviceName } from "~/app/lib/device-name";
import { m } from "~/app/paraglide/messages";
import { Alert } from "~/app/ui/alert";
import { errorMessage } from "~/app/ui/error-message";
import { Field } from "~/app/ui/field";
import { useLockout } from "~/app/ui/use-lockout";
import { Column } from "~/app/ui/page";

import type { Route } from "./+types/add-device";

export const middleware: Route.MiddlewareFunction[] = [onlyAt("no-device")];

export default function AddDevice() {
  const navigate = useNavigate();
  const [passphrase, setPassphrase] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const lockout = useLockout();
  const disabled = busy || lockout.locked;

  const submit = async () => {
    setBusy(true);
    setAlert(null);
    setPassphraseError(null);
    setNameError(null);
    try {
      await addDevice(passphrase, name);
      await navigate("/");
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : null;
      if (code === "already-added") await navigate("/");
      else if (code === "wrong-passphrase") setPassphraseError(errorMessage(caught));
      else if (code === "name-taken") setNameError(errorMessage(caught));
      else {
        lockout.noteError(caught);
        setAlert(errorMessage(caught));
      }
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    await signOut();
    await navigate("/sign-in");
  };

  return (
    <Column spread>
      <form
        id="add-device"
        className="flex flex-col gap-6 pt-12"
        onSubmit={(event) => {
          event.preventDefault();
          if (passphrase && isValidDeviceName(name)) void submit();
        }}
      >
        <div className="flex flex-col gap-2">
          {alert !== null && <Alert tone="warning">{alert}</Alert>}
          <h1 className="title m-0">{m.device_add_title()}</h1>
          <p className="body m-0 text-ink-muted">{m.device_add_body()}</p>
        </div>
        <Field
          label={m.passphrase_label()}
          hint={m.passphrase_hint()}
          error={passphraseError}
          type="password"
          autoComplete="current-password"
          disabled={lockout.locked}
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
        />
        <Field
          label={m.device_name_label()}
          hint={m.device_name_hint()}
          error={nameError}
          autoComplete="off"
          disabled={lockout.locked}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </form>
      <div className="flex flex-col gap-2">
        <button
          type="submit"
          form="add-device"
          className="gd-button gd-button--primary label min-h-12"
          disabled={disabled || !passphrase || !isValidDeviceName(name)}
          aria-busy={busy || undefined}
        >
          {m.device_add()}
        </button>
        <button
          type="button"
          className="gd-button gd-button--subtle label min-h-11"
          onClick={() => void leave()}
        >
          {m.account_sign_out()}
        </button>
      </div>
    </Column>
  );
}
