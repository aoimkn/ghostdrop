import { useEffect, useRef, useState, type ReactNode } from "react";

import type { Device } from "~/app/lib/account.client";
import type { Item } from "~/app/lib/content";
import { MAX_DROP_BYTES } from "~/app/lib/drop-format";
import { formatSize, formatSizeOf } from "~/app/lib/format";
import { m } from "~/app/paraglide/messages";
import { Alert } from "~/app/ui/alert";
import { ProgressBar } from "~/app/ui/progress";

import type { Compose } from "./use-compose";

function groups(items: readonly Item[]): Item[][] {
  const byGroup = new Map<string | Item, Item[]>();
  for (const item of items) {
    const key = item.group ?? item;
    byGroup.set(key, [...(byGroup.get(key) ?? []), item]);
  }
  return [...byGroup.values()];
}

function ItemRows({
  items,
  onRemove,
}: {
  items: readonly Item[];
  onRemove?: (group: Item[]) => void;
}) {
  return (
    <div className="flex flex-col rounded-md bg-surface-raised">
      {groups(items).map((group, index) => {
        const [first] = group;
        if (!first) return null;
        const size = group.reduce((sum, item) => sum + item.content.size, 0);
        return (
          <div
            key={index}
            className="flex items-center gap-4 border-b border-border px-4 py-2 last:border-b-0"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              {first.name !== null && <span className="body break-all">{first.name}</span>}
              <span className="mono text-ink-muted">
                {group.map((item) => item.type).join(", ")} &middot; {formatSize(size)}
              </span>
            </div>
            {onRemove && (
              <button
                type="button"
                className="gd-button gd-button--subtle label min-h-11"
                onClick={() => onRemove(group)}
              >
                {m.drop_remove_item()}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Sources({ compose, wide }: { compose: Compose; wide: boolean }) {
  const files = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`gd-dropzone body ${over ? "gd-dropzone--active" : ""} ${wide ? "" : "min-h-0 gap-4 p-4"}`}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        compose.addTransfer(event.dataTransfer);
      }}
    >
      <span>{over ? m.drop_zone_drag_over() : m.drop_zone_idle()}</span>
      <div
        className={wide ? "flex flex-wrap justify-center gap-2" : "grid w-full grid-cols-2 gap-2"}
      >
        <button
          type="button"
          className="gd-button gd-button--secondary label min-h-11"
          onClick={() => void compose.paste()}
        >
          {m.drop_paste()}
        </button>
        <button
          type="button"
          className="gd-button gd-button--secondary label min-h-11"
          onClick={() => files.current?.click()}
        >
          {m.drop_pick_files()}
        </button>
        <button
          type="button"
          className="gd-button gd-button--secondary label min-h-11"
          onClick={compose.startWriting}
        >
          {m.drop_write_text()}
        </button>
        {!wide && (
          <button
            type="button"
            className="gd-button gd-button--secondary label min-h-11"
            onClick={() => camera.current?.click()}
          >
            {m.drop_take_photo()}
          </button>
        )}
      </div>
      <input
        ref={files}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files) compose.addFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        hidden
        onChange={(event) => {
          if (event.target.files) compose.addFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function Targets({
  compose,
  devices,
  wide,
}: {
  compose: Compose;
  devices: readonly Device[];
  wide: boolean;
}) {
  const options = [
    { id: null, name: m.drop_target_any(), locked: false },
    ...devices.filter((device) => !device.current),
  ];
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="label mb-2 p-0 text-ink-muted">{m.drop_target_label()}</legend>
      <div className={wide ? "flex flex-wrap gap-2" : "flex flex-col rounded-md bg-surface-raised"}>
        {options.map((option) => {
          const checked = compose.target === option.id;
          return (
            <label
              key={option.id ?? ""}
              className={
                wide
                  ? `gd-button gd-button--secondary label ${checked ? "border-accent text-accent" : ""}`
                  : "body flex min-h-12 items-center gap-3 border-b border-border px-4 last:border-b-0"
              }
            >
              <input
                type="radio"
                name="target"
                className="accent-accent"
                checked={checked}
                onChange={() => compose.setTarget(option.id)}
              />
              <span>{option.name}</span>
              {option.locked && (
                <span className="gd-badge gd-badge--warning caption">{m.device_locked()}</span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Progress({
  compose,
  deviceName,
  targetName,
  inset,
}: {
  compose: Compose;
  deviceName: string;
  targetName: string;
  inset: boolean;
}) {
  const failed = compose.phase === "failed";
  return (
    <div
      className={`flex flex-col gap-4 rounded-md p-4 ${inset ? "bg-surface-sunken" : "bg-surface-raised"}`}
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className={`label ${failed ? "text-ink-muted" : ""}`}>
          {failed ? m.drop_send_failed() : m.drop_send_in_progress()}
        </span>
        <span className="mono text-ink-muted">
          {formatSizeOf(compose.progress * compose.bytes, compose.bytes)}
        </span>
      </div>
      <ProgressBar
        className={inset ? "bg-surface" : ""}
        label={m.drop_send_in_progress()}
        fraction={compose.progress}
        stopped={failed}
      />
      <span className="gd-drop__route label text-ink-muted">
        <span>{deviceName}</span>
        <span className="gd-drop__arrow" aria-hidden>
          &rarr;
        </span>
        <span>{targetName}</span>
      </span>
    </div>
  );
}

function TextInput({ compose }: { compose: Compose }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <label className="gd-field">
      <span className="gd-field__label label">{m.drop_text_label()}</span>
      <textarea
        ref={ref}
        className="gd-field__input body min-h-32 py-2"
        value={compose.text}
        onChange={(event) => compose.setText(event.target.value)}
      />
    </label>
  );
}

type Props = {
  compose: Compose;
  devices: readonly Device[];
  deviceName: string;
  wide: boolean;
  header?: ReactNode;
};

export function ComposePanel({ compose, devices, deviceName, wide, header }: Props) {
  const busy = compose.phase !== "editing";
  const targetName =
    compose.target === null
      ? m.drop_target_any()
      : (devices.find((device) => device.id === compose.target)?.name ?? m.device_unknown());
  return (
    <>
      {header}
      {compose.phase === "failed" && <Alert tone="danger">{m.drop_send_failed()}</Alert>}
      {compose.alert !== null && <Alert tone="warning">{compose.alert}</Alert>}
      {busy ? (
        <Progress compose={compose} deviceName={deviceName} targetName={targetName} inset={wide} />
      ) : (
        wide && <Sources compose={compose} wide />
      )}
      {!busy && compose.writing && <TextInput compose={compose} />}
      {compose.items.length > 0 && (
        <ItemRows items={compose.items} onRemove={busy ? undefined : compose.remove} />
      )}
      {!busy && !wide && (
        <span className="mono text-right text-ink-muted">
          {m.drop_item_count({ count: compose.all.length })} &middot;{" "}
          {formatSizeOf(compose.bytes, MAX_DROP_BYTES)}
        </span>
      )}
      {!busy && <Targets compose={compose} devices={devices} wide={wide} />}
      <div
        className={
          wide ? "flex flex-wrap items-center justify-end gap-4" : "mt-auto flex flex-col gap-2"
        }
      >
        {wide && !busy && (
          <span className="mono mr-auto text-ink-muted">
            {m.drop_item_count({ count: compose.all.length })} &middot;{" "}
            {formatSizeOf(compose.bytes, MAX_DROP_BYTES)}
          </span>
        )}
        {compose.phase === "editing" && (
          <button
            type="button"
            className={`gd-button gd-button--primary label ${wide ? "min-h-11 px-6" : "min-h-12"}`}
            disabled={compose.all.length === 0 || compose.overLimit}
            onClick={() => void compose.send()}
          >
            {m.drop_send()}
          </button>
        )}
        {compose.phase === "failed" && (
          <button
            type="button"
            className="gd-button gd-button--primary label min-h-12"
            onClick={() => void compose.send()}
          >
            {m.common_retry()}
          </button>
        )}
        {busy && (
          <button
            type="button"
            className="gd-button gd-button--subtle gd-button--destructive label min-h-12"
            onClick={compose.reset}
          >
            {m.drop_send_cancel()}
          </button>
        )}
      </div>
    </>
  );
}
