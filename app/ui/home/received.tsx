import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { ExportIcon } from "@phosphor-icons/react/dist/csr/Export";
import { useEffect, useState } from "react";

import { type Item, planOutput, toClipboardItem, toFile, totalSize } from "~/app/lib/content";
import { formatSize } from "~/app/ui/format";
import { m } from "~/app/paraglide/messages";
import { Alert } from "~/app/ui/alert";

function canShare(file: File): boolean {
  return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
}

function download(file: File, name: string) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const COPIED_MS = 2000;

function ClipboardEntry({ entry, surface }: { entry: readonly Item[]; surface: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const image = entry.find((item) => item.type.startsWith("image/png"));
  const text = image ? undefined : entry.find((item) => item.type.startsWith("text/plain"));
  useEffect(() => {
    if (text) void text.content.text().then(setPreview);
  }, [text]);
  const showImage = (element: HTMLImageElement | null) => {
    if (!element || !image) return undefined;
    const url = URL.createObjectURL(image.content);
    element.src = url;
    return () => URL.revokeObjectURL(url);
  };
  useEffect(() => {
    const timer = copy === "copied" ? setTimeout(() => setCopy("idle"), COPIED_MS) : undefined;
    return () => clearTimeout(timer);
  }, [copy]);

  const write = async () => {
    try {
      await navigator.clipboard.write([toClipboardItem(entry)]);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  };

  return (
    <>
      {copy === "failed" && <Alert tone="danger">{m.drop_copy_failed()}</Alert>}
      <div className={`flex flex-col gap-4 rounded-md p-4 ${surface}`}>
        <div className="mono text-ink-muted">
          {entry.map((item) => item.type).join(", ")} &middot; {formatSize(totalSize(entry))}
        </div>
        {image && (
          <img
            ref={showImage}
            alt={m.drop_image_preview()}
            className="block max-h-60 w-full rounded-sm bg-surface-sunken object-contain"
          />
        )}
        {preview !== null && <p className="body m-0 line-clamp-3 wrap-break-word">{preview}</p>}
        <button
          type="button"
          className={`gd-button label min-h-11 ${copy === "copied" ? "gd-button--secondary" : "gd-button--primary"}`}
          aria-live="polite"
          onClick={() => void write()}
        >
          {copy === "copied" ? (
            <>
              <CheckIcon size={20} aria-hidden />
              {m.drop_copied()}
            </>
          ) : (
            m.drop_copy_to_clipboard()
          )}
        </button>
      </div>
    </>
  );
}

function FileRow({ item }: { item: Item }) {
  const file = toFile(item);
  const name = item.name ?? m.drop_unnamed_file();
  const share = canShare(file);
  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-2 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="body break-all">{name}</span>
        <span className="mono text-ink-muted">
          {item.type} &middot; {formatSize(item.content.size)}
        </span>
      </div>
      {share ? (
        <button
          type="button"
          className="gd-button gd-button--subtle label min-h-11"
          onClick={() => void navigator.share({ files: [file] }).catch(() => undefined)}
        >
          <ExportIcon size={20} aria-hidden />
          {m.drop_share()}
        </button>
      ) : (
        <button
          type="button"
          className="gd-button gd-button--primary label min-h-11"
          onClick={() => download(file, name)}
        >
          <DownloadSimpleIcon size={20} aria-hidden />
          {m.drop_download()}
        </button>
      )}
    </div>
  );
}

export function ReceivedContent({
  items,
  inset = false,
}: {
  items: readonly Item[];
  inset?: boolean;
}) {
  const { clipboard, files } = planOutput(items);
  const surface = inset ? "bg-surface-sunken" : "bg-surface-raised";
  return (
    <>
      {clipboard.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="label m-0 text-ink-muted">{m.drop_clipboard_title()}</h2>
          {clipboard.map((entry, index) => (
            <ClipboardEntry key={index} entry={entry} surface={surface} />
          ))}
        </section>
      )}
      {files.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="label m-0 text-ink-muted">{m.drop_files_title()}</h2>
          <div className={`flex flex-col rounded-md ${surface}`}>
            {files.map((item, index) => (
              <FileRow key={index} item={item} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
