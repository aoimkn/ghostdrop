import { LockSimpleIcon } from "@phosphor-icons/react/dist/csr/LockSimple";
import { useState } from "react";
import { useNavigate } from "react-router";

import { unlockDevice } from "~/app/lib/account.client";
import { ApiError } from "~/app/lib/api.client";
import { requireStage } from "~/app/lib/gate.client";
import { m } from "~/app/paraglide/messages";
import { Alert } from "~/app/ui/alert";
import { errorMessage } from "~/app/ui/error-message";
import { Field } from "~/app/ui/field";
import { SignOutDialog } from "~/app/ui/sign-out-dialog";
import { useLockout } from "~/app/ui/use-lockout";

import type { Route } from "./+types/unlock";

export async function clientLoader() {
  const session = await requireStage("locked");
  return { deviceName: session?.device?.name ?? "" };
}

export function HydrateFallback() {
  return null;
}

export default function Unlock({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const lockout = useLockout();

  const submit = async () => {
    setBusy(true);
    setAlert(null);
    setPassphraseError(null);
    try {
      await unlockDevice(passphrase);
      await navigate("/");
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "wrong-passphrase") {
        setPassphraseError(errorMessage(caught));
      } else {
        lockout.noteError(caught);
        setAlert(errorMessage(caught));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-between gap-6 px-4 py-6">
      <form
        id="unlock"
        className="flex flex-col gap-6 pt-12"
        onSubmit={(event) => {
          event.preventDefault();
          if (passphrase) void submit();
        }}
      >
        <div className="flex flex-col gap-2">
          {alert !== null && <Alert tone="warning">{alert}</Alert>}
          <span className="gd-badge gd-badge--warning caption self-start">
            <LockSimpleIcon size={14} aria-hidden />
            {loaderData.deviceName}
          </span>
          <h1 className="title m-0">{m.device_unlock_title()}</h1>
          <p className="body m-0 text-ink-muted">{m.device_unlock_body()}</p>
        </div>
        <Field
          label={m.passphrase_label()}
          error={passphraseError}
          type="password"
          autoComplete="current-password"
          disabled={lockout.locked}
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
        />
      </form>
      <div className="flex flex-col gap-2">
        <button
          type="submit"
          form="unlock"
          className="gd-button gd-button--primary label min-h-12"
          disabled={busy || lockout.locked || !passphrase}
          aria-busy={busy || undefined}
        >
          {m.device_unlock()}
        </button>
        <button
          type="button"
          className="gd-button gd-button--subtle label min-h-11"
          onClick={() => setSigningOut(true)}
        >
          {m.account_sign_out()}
        </button>
      </div>
      {signingOut && <SignOutDialog onCancel={() => setSigningOut(false)} />}
    </main>
  );
}
