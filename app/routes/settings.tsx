import { Suspense, useState } from "react";
import { useNavigate, useRevalidator } from "react-router";

import {
  addPasskey,
  deleteAccount,
  type Device,
  listDevices,
  listPasskeys,
  type Passkey,
  removeDevice,
  removePasskey,
  renameDevice,
} from "~/app/lib/account.client";
import { onlyAt } from "~/app/.server/stage";
import { ApiError } from "~/app/lib/api.client";
import { isValidDeviceName, MAX_DEVICE_NAME_LENGTH } from "~/app/lib/device-name";
import { listDrops } from "~/app/lib/drops.client";
import { requireReady } from "~/app/ui/gate.client";
import { m } from "~/app/paraglide/messages";
import { getLocale, locales, setLocale } from "~/app/paraglide/runtime";
import { Alert } from "~/app/ui/alert";
import { AppHeader } from "~/app/ui/app-header";
import { Dialog } from "~/app/ui/dialog";
import { errorMessage, isCancelledByUser } from "~/app/ui/error-message";
import { Field } from "~/app/ui/field";
import { BackHeader } from "~/app/ui/page";
import { AccountCounts } from "~/app/ui/settings/account-counts";
import { DeviceRows } from "~/app/ui/settings/device-rows";
import { PasskeyRows } from "~/app/ui/settings/passkey-rows";
import { SignOutDialog } from "~/app/ui/sign-out-dialog";
import { ListRowsSkeleton, LineSkeleton } from "~/app/ui/skeleton";

import type { Route } from "./+types/settings";

const SECTION = "flex flex-col gap-2 md:gap-4 md:rounded-lg md:bg-surface-raised md:p-6";
const LIST = "rounded-md bg-surface-raised md:-mx-4 md:bg-transparent";
const ACTION = "gd-button gd-button--secondary label min-h-11 md:self-start";

const LANGUAGE_NAMES: Record<string, string> = { ja: "日本語", en: "English" };

export const middleware: Route.MiddlewareFunction[] = [onlyAt("ready")];

export async function clientLoader() {
  const session = await requireReady();
  const devices = listDevices();
  const passkeys = listPasskeys();
  return {
    deviceName: session.device.name,
    devices,
    passkeys,
    counts: Promise.all([passkeys, devices, listDrops()]).then(
      ([passkeyList, deviceList, drops]) => ({
        passkeys: passkeyList.length,
        devices: deviceList.length,
        pendingDrops: drops.length,
      }),
    ),
  };
}

type Open =
  | { kind: "rename"; device: Device }
  | { kind: "remove-device"; device: Device }
  | { kind: "remove-passkey"; passkey: Passkey }
  | { kind: "sign-out" }
  | { kind: "delete-account" }
  | null;

export default function Settings({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const locale = getLocale();
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const toSignIn = async () => {
    await navigate("/sign-in");
  };

  const run = async (action: () => Promise<void>, after?: () => Promise<void>) => {
    setBusy(true);
    setAlert(null);
    try {
      await action();
      setOpen(null);
      if (after) await after();
      else await revalidator.revalidate();
    } catch (caught) {
      if (open?.kind === "rename" && caught instanceof ApiError && caught.code === "name-taken") {
        setNameError(errorMessage(caught));
      } else {
        setOpen(null);
        if (!isCancelledByUser(caught)) setAlert(errorMessage(caught));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-dvh md:px-[max(16px,3vw)] md:py-6">
      <div className="mx-auto flex max-w-280 flex-col gap-6">
        <div className="hidden md:block">
          <AppHeader deviceName={loaderData.deviceName} />
        </div>
        <div className="mx-auto flex min-h-dvh w-full max-w-110 flex-col gap-6 px-4 pt-4 pb-6 md:min-h-0 md:max-w-160 md:p-0">
          <BackHeader to="/">
            <h1 className="title m-0">{m.account_settings()}</h1>
          </BackHeader>
          {alert !== null && <Alert tone="danger">{alert}</Alert>}

          <section className={SECTION}>
            <h2 className="label m-0 text-ink-muted">{m.device_list_title()}</h2>
            <div className={LIST}>
              <Suspense fallback={<ListRowsSkeleton rows={2} />}>
                <DeviceRows
                  devices={loaderData.devices}
                  onRename={(device) => {
                    setNewName(device.name);
                    setNameError(null);
                    setOpen({ kind: "rename", device });
                  }}
                  onRemove={(device) => setOpen({ kind: "remove-device", device })}
                />
              </Suspense>
            </div>
          </section>

          <section className={SECTION}>
            <h2 className="label m-0 text-ink-muted">{m.passkey_list_title()}</h2>
            <div className={LIST}>
              <Suspense fallback={<ListRowsSkeleton rows={1} />}>
                <PasskeyRows
                  passkeys={loaderData.passkeys}
                  onRemove={(passkey) => setOpen({ kind: "remove-passkey", passkey })}
                />
              </Suspense>
            </div>
            <button
              type="button"
              className={ACTION}
              disabled={busy}
              onClick={() => void run(addPasskey)}
            >
              {m.passkey_add()}
            </button>
          </section>

          <section className={SECTION}>
            <h2 className="label m-0 text-ink-muted">{m.passphrase_title()}</h2>
            <button
              type="button"
              className={ACTION}
              onClick={() => void navigate("/settings/passphrase")}
            >
              {m.passphrase_replace()}
            </button>
          </section>

          <section className={SECTION}>
            <h2 className="label m-0 text-ink-muted">{m.account_language_label()}</h2>
            <fieldset className="m-0 border-0 p-0">
              <legend className="sr-only">{m.account_language_label()}</legend>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-[repeat(2,160px)]">
                {locales.map((candidate) => (
                  <label
                    key={candidate}
                    className="gd-button gd-button--secondary gd-choice label min-h-11"
                  >
                    <input
                      type="radio"
                      name="language"
                      className="accent-accent"
                      checked={candidate === locale}
                      onChange={() => void setLocale(candidate)}
                    />
                    <span lang={candidate}>{LANGUAGE_NAMES[candidate] ?? candidate}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          <section className={SECTION}>
            <h2 className="label m-0 text-ink-muted">{m.account_title()}</h2>
            <button type="button" className={ACTION} onClick={() => setOpen({ kind: "sign-out" })}>
              {m.account_sign_out()}
            </button>
            <button
              type="button"
              className="gd-button gd-button--subtle gd-button--destructive label min-h-11 md:self-start"
              onClick={() => setOpen({ kind: "delete-account" })}
            >
              {m.account_delete()}
            </button>
          </section>

          {open?.kind === "rename" && (
            <Dialog
              title={m.device_rename_title()}
              confirmLabel={m.device_rename_confirm()}
              busy={busy}
              onCancel={() => setOpen(null)}
              onConfirm={() => {
                if (isValidDeviceName(newName)) {
                  void run(() => renameDevice(open.device.id, newName));
                }
              }}
            >
              <Field
                label={m.device_name_label()}
                hint={m.device_name_hint({ max: MAX_DEVICE_NAME_LENGTH })}
                error={nameError}
                autoComplete="off"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            </Dialog>
          )}
          {open?.kind === "remove-device" && (
            <Dialog
              title={m.device_remove_title({ name: open.device.name })}
              body={m.device_remove_body()}
              confirmLabel={m.device_remove_confirm()}
              danger
              busy={busy}
              onCancel={() => setOpen(null)}
              onConfirm={() => void run(() => removeDevice(open.device.id))}
            />
          )}
          {open?.kind === "remove-passkey" && (
            <Dialog
              title={m.passkey_remove_title()}
              body={m.passkey_remove_body()}
              confirmLabel={m.passkey_remove_confirm()}
              danger
              busy={busy}
              onCancel={() => setOpen(null)}
              onConfirm={() => void run(() => removePasskey(open.passkey.id))}
            />
          )}
          {open?.kind === "sign-out" && <SignOutDialog onCancel={() => setOpen(null)} />}
          {open?.kind === "delete-account" && (
            <Dialog
              title={m.account_delete_title()}
              body={m.account_delete_body()}
              confirmLabel={m.account_delete_confirm()}
              danger
              busy={busy}
              onCancel={() => setOpen(null)}
              onConfirm={() => void run(deleteAccount, toSignIn)}
            >
              <Suspense fallback={<LineSkeleton />}>
                <AccountCounts counts={loaderData.counts} />
              </Suspense>
            </Dialog>
          )}
        </div>
      </div>
    </main>
  );
}
