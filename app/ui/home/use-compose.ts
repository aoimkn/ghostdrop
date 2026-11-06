import { useRef, useState } from "react";

import { ApiError } from "~/app/lib/api.client";
import {
  FolderNotSupportedError,
  fromClipboard,
  fromDataTransfer,
  fromFiles,
  fromText,
  type Item,
  type Transfer,
} from "~/app/lib/content";
import { MAX_DROP_BYTES, MAX_ITEMS } from "~/app/lib/drop-format";
import { LockedError, sendDrop } from "~/app/lib/drops.client";
import { m } from "~/app/paraglide/messages";
import { errorMessage } from "~/app/ui/error-message";

export type Phase = "editing" | "sending" | "failed";

const REFUSALS = new Set(["limit-reached", "rate-limited", "too-large", "too-many-items"]);

export function useCompose({ onSent, onLocked }: { onSent: () => void; onLocked: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("editing");
  const [progress, setProgress] = useState(0);
  const [alert, setAlert] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const all = writing && text.length > 0 ? [...fromText(text), ...items] : items;
  const bytes = all.reduce((sum, item) => sum + item.content.size, 0);
  const overLimit = bytes > MAX_DROP_BYTES || all.length > MAX_ITEMS;

  const add = (added: Item[]) => {
    setAlert(null);
    setItems((current) => [...current, ...added]);
  };

  const addTransfer = (transfer: Transfer) => {
    try {
      add(fromDataTransfer(transfer));
    } catch (error) {
      if (error instanceof FolderNotSupportedError) setAlert(m.drop_folder_not_supported());
      else throw error;
    }
  };

  const paste = async () => {
    try {
      add(await fromClipboard(await navigator.clipboard.read()));
    } catch {
      setAlert(m.drop_paste_failed());
    }
  };

  const reset = () => {
    abort.current?.abort();
    setItems([]);
    setWriting(false);
    setText("");
    setPhase("editing");
    setProgress(0);
    setAlert(null);
  };

  const send = async () => {
    const controller = new AbortController();
    abort.current = controller;
    setPhase("sending");
    setProgress(0);
    setAlert(null);
    try {
      await sendDrop(all, target, { onProgress: setProgress, signal: controller.signal });
      reset();
      onSent();
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof LockedError) {
        onLocked();
      } else if (error instanceof ApiError && REFUSALS.has(error.code)) {
        setPhase("editing");
        setAlert(errorMessage(error));
      } else {
        setPhase("failed");
      }
    }
  };

  return {
    items,
    all,
    bytes,
    overLimit,
    writing,
    text,
    target,
    phase,
    progress,
    alert,
    open: items.length > 0 || writing || phase !== "editing",
    addFiles: (files: Iterable<File>) => add(fromFiles(files)),
    addTransfer,
    paste,
    startWriting: () => setWriting(true),
    setText,
    remove: (removed: readonly Item[]) =>
      setItems((current) => current.filter((item) => !removed.includes(item))),
    setTarget,
    send,
    reset,
  };
}

export type Compose = ReturnType<typeof useCompose>;
