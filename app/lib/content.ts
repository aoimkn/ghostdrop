export type Item = {
  type: string;
  name: string | null;
  // Items sharing a group are alternative formats of one clipboard entry.
  group: string | null;
  content: Blob;
};

export type ClipboardEntry = Pick<ClipboardItem, "types" | "getType">;

export type Transfer = {
  readonly types: readonly string[];
  getData(type: string): string;
  readonly items: ArrayLike<TransferItem>;
};

type TransferItem = {
  readonly kind: string;
  getAsFile(): File | null;
  webkitGetAsEntry?(): { readonly isDirectory: boolean } | null;
};

export type OutputPlan = { clipboard: Item[][]; files: Item[] };

const CLIPBOARD_TYPES = new Set(["text/plain", "text/html", "image/png"]);
const UNKNOWN_TYPE = "application/octet-stream";

export class FolderNotSupportedError extends Error {}

export function fromText(text: string): Item[] {
  return [{ type: "text/plain", name: null, group: null, content: new Blob([text]) }];
}

export function fromFiles(files: Iterable<File>): Item[] {
  return Array.from(files, fileItem);
}

export async function fromClipboard(entries: readonly ClipboardEntry[]): Promise<Item[]> {
  const items: Item[] = [];
  for (const entry of entries) {
    const types = preferWritable(entry.types);
    const group = types.length > 1 ? crypto.randomUUID() : null;
    for (const type of types) {
      items.push({ type, name: null, group, content: await entry.getType(type) });
    }
  }
  return items;
}

// A DataTransfer is readable only while its event is dispatched, so this stays synchronous.
// String representations come from one source and are kept together; files stay separate.
export function fromDataTransfer(transfer: Transfer): Item[] {
  const files: File[] = [];
  for (const item of Array.from(transfer.items)) {
    if (item.kind !== "file") continue;
    if (item.webkitGetAsEntry?.()?.isDirectory === true) throw new FolderNotSupportedError();
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  const types = preferWritable(transfer.types.filter((type) => type !== "Files"));
  const group = types.length > 1 ? crypto.randomUUID() : null;
  const strings = types.map((type) => ({
    type,
    name: null,
    group,
    content: new Blob([transfer.getData(type)]),
  }));
  return [...strings, ...fromFiles(files)];
}

export function planOutput(items: readonly Item[]): OutputPlan {
  const clipboard = new Map<string | Item, Item[]>();
  const files: Item[] = [];
  for (const item of items) {
    if (!isClipboardType(item.type)) {
      files.push(item);
      continue;
    }
    const key = item.group ?? item;
    clipboard.set(key, [...(clipboard.get(key) ?? []), item]);
  }
  return { clipboard: [...clipboard.values()], files };
}

export function toClipboardItem(entry: readonly Item[]): ClipboardItem {
  return new ClipboardItem(
    Object.fromEntries(
      entry.map((item) => [
        baseType(item.type),
        new Blob([item.content], { type: baseType(item.type) }),
      ]),
    ),
  );
}

export function toFile(item: Item): File {
  return new File([item.content], item.name ?? "", { type: item.type });
}

function fileItem(file: File): Item {
  return {
    type: file.type === "" ? UNKNOWN_TYPE : file.type,
    name: file.name,
    group: null,
    content: file,
  };
}

// Formats that cannot be written to a clipboard add nothing when another format of the same
// content can be.
function preferWritable(types: readonly string[]): readonly string[] {
  const writable = types.filter(isClipboardType);
  return writable.length > 0 ? writable : types;
}

function isClipboardType(type: string): boolean {
  return CLIPBOARD_TYPES.has(baseType(type));
}

function baseType(type: string): string {
  return (type.split(";")[0] ?? "").trim().toLowerCase();
}
