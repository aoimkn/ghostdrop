import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { DevicesIcon } from "@phosphor-icons/react/dist/csr/Devices";
import { GearSixIcon } from "@phosphor-icons/react/dist/csr/GearSix";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router";

import { listDevices } from "~/app/lib/account.client";
import type { Item } from "~/app/lib/content";
import { MAX_PENDING_DROPS } from "~/app/lib/drop-format";
import {
  deleteDrop,
  type Drop,
  isReceivable,
  LockedError,
  receiveDrop,
} from "~/app/lib/drops.client";
import { formatSize, formatSizeOf } from "~/app/lib/format";
import { requireReady } from "~/app/lib/gate.client";
import { m } from "~/app/paraglide/messages";
import { Alert } from "~/app/ui/alert";
import { ComposePanel, Sources } from "~/app/ui/home/compose";
import { DropRow, Route as DropRoute } from "~/app/ui/home/drop-row";
import { ReceivedContent, totalSize } from "~/app/ui/home/received";
import { useCompose } from "~/app/ui/home/use-compose";
import { type Entry, useDrops } from "~/app/ui/home/use-drops";
import { Logo } from "~/app/ui/logo";
import { ProgressBar } from "~/app/ui/progress";
import { useNow } from "~/app/ui/use-now";

import type { Route } from "./+types/home";

export async function clientLoader() {
  const session = await requireReady();
  return { device: session.device, devices: await listDevices() };
}

export function HydrateFallback() {
  return null;
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

function BackHeader({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <header className="flex min-h-11 items-center gap-2">
      <button
        type="button"
        className="gd-button gd-button--subtle label min-h-11 min-w-11"
        aria-label={m.common_back()}
        onClick={onBack}
      >
        <CaretLeftIcon size={24} aria-hidden />
      </button>
      {children}
    </header>
  );
}

type Receiving = { entry: Entry; progress: number; failed: boolean };
type Received = { drop: Drop; items: Item[] };

export default function Home({ loaderData }: Route.ComponentProps) {
  const { device, devices } = loaderData;
  const navigate = useNavigate();
  const wide = useWide();
  const now = useNow(30_000);
  const { entries, refresh } = useDrops();
  const [receiving, setReceiving] = useState<Receiving | null>(null);
  const [received, setReceived] = useState<Received | null>(null);
  const toUnlock = () => void navigate("/unlock");
  const compose = useCompose({ onSent: () => void refresh(), onLocked: toUnlock });

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
    if (receiving?.entry.drop.id === entry.drop.id) setReceiving(null);
    await deleteDrop(entry.drop.id);
    await refresh();
  };

  const header = (
    <header className="flex min-h-11 flex-wrap items-center justify-between gap-2">
      <Logo />
      <div className="flex items-center gap-2">
        <Link to="/settings" className="gd-button gd-button--subtle label min-h-11">
          <DevicesIcon size={20} aria-hidden />
          <span>{device.name}</span>
        </Link>
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
          fresh={entry.fresh}
          receivable={isReceivable(entry.drop, device.id)}
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
        <div className="mx-auto flex max-w-[1120px] flex-col gap-6">
          {header}
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
                    <div className="gd-drop__expiry caption">{m.drop_received_body()}</div>
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

  const phoneColumn = "mx-auto flex min-h-dvh w-full max-w-[440px] flex-col gap-6 px-4 pt-4 pb-6";

  if (receiving || received) {
    const drop = receiving?.entry.drop ?? received?.drop;
    const size = received
      ? totalSize(received.items)
      : (receiving?.entry.meta.reduce((sum, item) => sum + item.size, 0) ?? 0);
    const count = received?.items.length ?? receiving?.entry.meta.length ?? 0;
    return (
      <main className={phoneColumn}>
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
            <div className="flex items-center gap-2">
              <span className="gd-badge gd-badge--signal caption">{m.drop_received()}</span>
              <span className="caption text-ink-muted">{m.drop_received_body()}</span>
            </div>
            <ReceivedContent items={received.items} />
          </>
        ) : (
          receiving && (
            <>
              {receiving.failed && <Alert tone="danger">{m.drop_receive_failed()}</Alert>}
              <section className="flex flex-col gap-2 rounded-md bg-surface-raised p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="label text-ink-muted">
                    {receiving.failed ? m.drop_receive_failed() : m.drop_receive_in_progress()}
                  </span>
                  <span className="mono text-ink-muted">
                    {formatSizeOf(receiving.progress * size, size)}
                  </span>
                </div>
                <ProgressBar
                  label={m.drop_receive_in_progress()}
                  fraction={receiving.progress}
                  stopped={receiving.failed}
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
      </main>
    );
  }

  if (compose.open) {
    return (
      <main className={phoneColumn}>
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
      </main>
    );
  }

  return (
    <main className={phoneColumn}>
      {header}
      <Sources compose={compose} wide={false} />
      {pending}
    </main>
  );
}
