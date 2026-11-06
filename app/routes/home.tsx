import { GearSixIcon } from "@phosphor-icons/react/dist/csr/GearSix";
import { useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router";

import { onlyAt } from "~/app/.server/stage";
import { listDevices } from "~/app/lib/account.client";
import { ApiError } from "~/app/lib/api.client";
import { type Item, totalSize } from "~/app/lib/content";
import { MAX_PENDING_DROPS } from "~/app/lib/drop-format";
import {
  deleteDrop,
  type Drop,
  isReceivable,
  LockedError,
  receiveDrop,
} from "~/app/lib/drops.client";
import { takeShared } from "~/app/lib/share.client";
import { formatSize } from "~/app/ui/format";
import { requireReady } from "~/app/ui/gate.client";
import { m } from "~/app/paraglide/messages";
import { Alert } from "~/app/ui/alert";
import { errorMessage } from "~/app/ui/error-message";
import { DeviceName } from "~/app/ui/device";
import { ComposePanel, Sources } from "~/app/ui/home/compose";
import { DropRow, Route as DropRoute } from "~/app/ui/home/drop-row";
import { ReceivedContent } from "~/app/ui/home/received";
import { useCompose } from "~/app/ui/home/use-compose";
import { type Entry, useDrops } from "~/app/ui/home/use-drops";
import { Logo } from "~/app/ui/logo";
import { BackHeader, Column } from "~/app/ui/page";
import { TransferProgress } from "~/app/ui/progress";
import { DropRowsSkeleton } from "~/app/ui/skeleton";
import { useNow } from "~/app/ui/use-now";
import { useOnline } from "~/app/ui/use-online";
import { useUpdateWhenIdle } from "~/app/ui/update";

import type { Route } from "./+types/home";

export const middleware: Route.MiddlewareFunction[] = [onlyAt("ready")];

export async function clientLoader() {
  const session = await requireReady();
  return { device: session.device, devices: listDevices() };
}

const WIDE = "(min-width: 768px)";

function useWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE).matches,
  );
}

type Receiving = { entry: Entry; progress: number; failed: boolean };
type Received = { drop: Drop; items: Item[] };

export default function Home({ loaderData }: Route.ComponentProps) {
  const { device, devices } = loaderData;
  const navigate = useNavigate();
  const wide = useWide();
  const now = useNow(30_000);
  const { entries, connected, refresh } = useDrops();
  const online = useOnline();
  const offline = !online || !connected;
  const [receiving, setReceiving] = useState<Receiving | null>(null);
  const [received, setReceived] = useState<Received | null>(null);
  const [deleting, setDeleting] = useState<ReadonlySet<string>>(new Set());
  const [alert, setAlert] = useState<string | null>(null);
  const toUnlock = () => void navigate("/unlock");
  const compose = useCompose({ onSent: () => void refresh(), onLocked: toUnlock });
  useUpdateWhenIdle(!compose.open && receiving === null && received === null);

  const onShared = useEffectEvent(compose.addShared);
  useEffect(() => {
    const pickUp = async () => {
      const shared = await takeShared();
      if (shared !== null) onShared(shared);
    };
    void pickUp();
  }, []);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (!event.clipboardData || compose.phase !== "editing") return;
      event.preventDefault();
      compose.addTransfer(event.clipboardData);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [compose]);

  const receive = async (entry: Entry) => {
    setReceived(null);
    setReceiving({ entry, progress: 0, failed: false });
    try {
      const items = await receiveDrop(entry.drop, {
        onProgress: (progress) => setReceiving({ entry, progress, failed: false }),
      });
      setReceiving(null);
      setReceived({ drop: entry.drop, items });
      await refresh();
    } catch (error) {
      if (error instanceof LockedError) toUnlock();
      else setReceiving((current) => current && { ...current, failed: true });
    }
  };

  const remove = async (entry: Entry) => {
    const { id } = entry.drop;
    setDeleting((current) => new Set(current).add(id));
    setAlert(null);
    if (receiving?.entry.drop.id === id) setReceiving(null);
    try {
      await deleteDrop(id);
    } catch (error) {
      // Gone already: received elsewhere, deleted elsewhere or expired.
      if (!(error instanceof ApiError && error.code === "not-found")) setAlert(errorMessage(error));
    }
    setDeleting((current) => new Set([...current].filter((other) => other !== id)));
    await refresh();
  };

  const header = (
    <header className="flex min-h-11 flex-wrap items-center justify-between gap-2">
      <Logo />
      <div className="flex items-center gap-4">
        <span className="label inline-flex items-center gap-1">
          <DeviceName name={device.name} />
        </span>
        <Link
          to="/settings"
          className="gd-button gd-button--subtle label min-h-11 min-w-11"
          aria-label={m.account_settings()}
        >
          <GearSixIcon size={24} aria-hidden />
        </Link>
      </div>
    </header>
  );

  const pending = (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="label m-0 text-ink-muted">{m.drop_pending_title()}</h2>
        {entries && (
          <span className="mono text-ink-muted">
            {entries.length} / {MAX_PENDING_DROPS}
          </span>
        )}
      </div>
      {entries === null && <DropRowsSkeleton rows={2} />}
      {entries?.length === 0 && (
        <p className="body m-0 rounded-md bg-surface-raised px-4 py-6 text-center text-ink-muted">
          {m.drop_pending_empty()}
        </p>
      )}
      {entries?.map((entry) => (
        <DropRow
          key={entry.drop.id}
          drop={entry.drop}
          meta={entry.meta}
          size={entry.size}
          fresh={entry.fresh}
          receivable={isReceivable(entry.drop, device.id)}
          receiveBlocked={receiving !== null && !receiving.failed}
          deleting={deleting.has(entry.drop.id)}
          receiving={
            wide && receiving?.entry.drop.id === entry.drop.id
              ? { progress: receiving.progress, failed: receiving.failed }
              : null
          }
          stacked={!wide}
          now={now}
          onReceive={() => void receive(entry)}
          onDelete={() => void remove(entry)}
        />
      ))}
    </section>
  );

  if (wide) {
    return (
      <main className="min-h-dvh px-[max(16px,3vw)] py-6">
        <div className="mx-auto flex max-w-280 flex-col gap-6">
          {header}
          {alert !== null && <Alert tone="danger">{alert}</Alert>}
          {offline && (
            <Alert tone="warning" quiet>
              {m.common_offline()}
            </Alert>
          )}
          <div className="flex flex-wrap items-start gap-6">
            <section className="flex min-w-0 flex-[1_1_420px] flex-col gap-4 rounded-lg bg-surface-raised p-6">
              <h2 className="label m-0 text-ink-muted">{m.drop_compose_title()}</h2>
              <ComposePanel compose={compose} devices={devices} deviceName={device.name} wide />
            </section>
            <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-6">
              {received && (
                <div className="gd-drop gd-drop--arrived flex-col items-stretch gap-4">
                  <div className="gd-drop__main flex-none">
                    <div className="gd-drop__route label">
                      <DropRoute drop={received.drop} />
                      <span className="gd-badge gd-badge--signal caption">{m.drop_received()}</span>
                    </div>
                  </div>
                  <ReceivedContent items={received.items} inset />
                  <div className="gd-drop__actions justify-end">
                    <button
                      type="button"
                      className="gd-button gd-button--subtle label min-h-11"
                      onClick={() => setReceived(null)}
                    >
                      {m.common_close()}
                    </button>
                  </div>
                </div>
              )}
              {pending}
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (receiving || received) {
    const drop = receiving?.entry.drop ?? received?.drop;
    const size = received ? totalSize(received.items) : (receiving?.entry.size ?? 0);
    const count = received?.items.length ?? receiving?.entry.meta.length ?? 0;
    return (
      <Column>
        <BackHeader
          onBack={() => {
            setReceiving(null);
            setReceived(null);
          }}
        >
          <div className="flex min-w-0 flex-col">
            <span className="gd-drop__route label">{drop && <DropRoute drop={drop} />}</span>
            <span className="caption text-ink-muted">
              {m.drop_item_count({ count })} &middot; {formatSize(size)}
            </span>
          </div>
        </BackHeader>
        {received ? (
          <>
            <div className="flex">
              <span className="gd-badge gd-badge--signal caption">{m.drop_received()}</span>
            </div>
            <ReceivedContent items={received.items} />
          </>
        ) : (
          receiving && (
            <>
              {receiving.failed && <Alert tone="danger">{m.drop_receive_failed()}</Alert>}
              <section className="flex flex-col gap-2 rounded-md bg-surface-raised p-4">
                <TransferProgress
                  label={receiving.failed ? m.drop_receive_failed() : m.drop_receive_in_progress()}
                  fraction={receiving.progress}
                  total={size}
                  failed={receiving.failed}
                />
              </section>
              {receiving.failed && (
                <div className="mt-auto flex flex-col gap-2">
                  <button
                    type="button"
                    className="gd-button gd-button--primary label min-h-12"
                    onClick={() => void receive(receiving.entry)}
                  >
                    {m.common_retry()}
                  </button>
                </div>
              )}
            </>
          )
        )}
      </Column>
    );
  }

  if (compose.open) {
    return (
      <Column>
        <ComposePanel
          compose={compose}
          devices={devices}
          deviceName={device.name}
          wide={false}
          header={
            <BackHeader onBack={compose.reset}>
              <h1 className="title m-0">{m.drop_compose_title()}</h1>
            </BackHeader>
          }
        />
      </Column>
    );
  }

  return (
    <Column>
      {header}
      {alert !== null && <Alert tone="danger">{alert}</Alert>}
      {offline && (
        <Alert tone="warning" quiet>
          {m.common_offline()}
        </Alert>
      )}
      <Sources compose={compose} wide={false} />
      {pending}
    </Column>
  );
}
