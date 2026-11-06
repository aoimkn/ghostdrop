import { useState } from "react";
import { useNavigate } from "react-router";

import { onlyAt } from "~/app/.server/stage";
import { listDevices, replacePassphrase } from "~/app/lib/account.client";
import { listDrops } from "~/app/lib/drops.client";
import { requireReady } from "~/app/ui/gate.client";
import { isLongEnough } from "~/app/lib/passphrase";
import { m } from "~/app/paraglide/messages";
import { Alert } from "~/app/ui/alert";
import { Dialog } from "~/app/ui/dialog";
import { errorMessage } from "~/app/ui/error-message";
import { Field } from "~/app/ui/field";
import { BackHeader, Column } from "~/app/ui/page";

import type { Route } from "./+types/replace-passphrase";

export const middleware: Route.MiddlewareFunction[] = [onlyAt("device")];

export async function clientLoader() {
  await requireReady();
  const [devices, drops] = await Promise.all([listDevices(), listDrops()]);
  return {
    otherDevices: devices.filter((device) => !device.current).length,
    pendingDrops: drops.length,
  };
}

export default function ReplacePassphrase({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const [passphrase, setPassphrase] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const valid = isLongEnough(passphrase);

  const confirm = async () => {
    setBusy(true);
    try {
      await replacePassphrase(passphrase);
      await navigate("/");
    } catch (caught) {
      setConfirming(false);
      setAlert(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Column>
      <BackHeader to="/settings">
        <h1 className="title m-0">{m.passphrase_new_title()}</h1>
      </BackHeader>
      {alert !== null && <Alert tone="danger">{alert}</Alert>}
      <form
        className="flex flex-1 flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) setConfirming(true);
        }}
      >
        <Field
          label={m.passphrase_new_label()}
          hint={m.passphrase_hint()}
          type="password"
          autoComplete="new-password"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
        />
        <button
          type="submit"
          className="gd-button gd-button--primary label mt-auto min-h-12"
          disabled={!valid}
        >
          {m.passphrase_replace()}
        </button>
      </form>
      {confirming && (
        <Dialog
          title={m.passphrase_replace_title()}
          body={m.passphrase_replace_body()}
          confirmLabel={m.passphrase_replace_confirm()}
          danger
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void confirm()}
        >
          <span className="mono text-ink-muted">
            {m.drop_pending_count({ count: loaderData.pendingDrops })} &middot;{" "}
            {m.device_other_count({ count: loaderData.otherDevices })}
          </span>
        </Dialog>
      )}
    </Column>
  );
}
