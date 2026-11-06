import { assert, describe, expect, it } from "vitest";

import {
  type ClipboardEntry,
  FolderNotSupportedError,
  fromClipboard,
  fromDataTransfer,
  fromFiles,
  fromText,
  type Item,
  planOutput,
  type Transfer,
} from "~/app/lib/content";

function transfer(
  strings: Record<string, string>,
  entries: { file: File; directory?: boolean }[] = [],
): Transfer {
  return {
    types: [...Object.keys(strings), ...(entries.length > 0 ? ["Files"] : [])],
    getData: (type) => strings[type] ?? "",
    items: entries.map(({ file, directory = false }) => ({
      kind: "file",
      getAsFile: () => file,
      webkitGetAsEntry: () => ({ isDirectory: directory }),
    })),
  };
}

function entry(blobs: Record<string, string>): ClipboardEntry {
  return {
    types: Object.keys(blobs),
    getType: (type) => Promise.resolve(new Blob([blobs[type] ?? ""], { type })),
  };
}

function item(type: string, group: string | null = null): Item {
  return { type, name: null, group, content: new Blob([type]) };
}

describe("input", () => {
  it("turns typed text into one plain-text item", async () => {
    const [text, ...rest] = fromText("hello");
    expect(rest).toEqual([]);
    expect(text).toMatchObject({ type: "text/plain", name: null, group: null });
    expect(await text?.content.text()).toBe("hello");
  });

  it("keeps a file's name and type, and marks an unknown type as such", () => {
    const items = fromFiles([
      new File(["a"], "photo.jpg", { type: "image/jpeg" }),
      new File(["b"], "data.bin"),
    ]);
    expect(items.map(({ type, name, group }) => ({ type, name, group }))).toEqual([
      { type: "image/jpeg", name: "photo.jpg", group: null },
      { type: "application/octet-stream", name: "data.bin", group: null },
    ]);
  });

  it("groups the formats of one clipboard entry and keeps entries apart", async () => {
    const items = await fromClipboard([
      entry({ "text/html": "<b>hi</b>", "text/plain": "hi" }),
      entry({ "image/png": "png" }),
    ]);
    expect(items.map(({ type }) => type)).toEqual(["text/html", "text/plain", "image/png"]);
    const [html, plain, image] = items;
    assert(html && plain && image);
    expect(html.group).not.toBeNull();
    expect(plain.group).toBe(html.group);
    expect(image.group).toBeNull();
    expect(await plain.content.text()).toBe("hi");
  });

  it("groups pasted or dropped strings and keeps files separate", async () => {
    const file = new File(["x"], "a.txt", { type: "text/plain" });
    const items = fromDataTransfer(
      transfer({ "text/plain": "hi", "text/html": "<i>hi</i>" }, [{ file }]),
    );
    expect(items.map(({ type, name }) => ({ type, name }))).toEqual([
      { type: "text/plain", name: null },
      { type: "text/html", name: null },
      { type: "text/plain", name: "a.txt" },
    ]);
    expect(items[0]?.group).not.toBeNull();
    expect(items[1]?.group).toBe(items[0]?.group);
    expect(items[2]?.group).toBeNull();
    expect(await items[1]?.content.text()).toBe("<i>hi</i>");
  });

  it("leaves out formats a clipboard cannot hold when another one can", async () => {
    const pasted = fromDataTransfer(
      transfer({ "text/html": "<b>hi</b>", "text/plain": "hi", "text/rtf": "{\\rtf1 hi}" }),
    );
    expect(pasted.map(({ type }) => type)).toEqual(["text/html", "text/plain"]);
    const copied = await fromClipboard([entry({ "image/png": "png", "image/svg+xml": "svg" })]);
    expect(copied.map(({ type }) => type)).toEqual(["image/png"]);
    expect(copied[0]?.group).toBeNull();
    const link = fromDataTransfer(transfer({ "text/uri-list": "https://example.com" }));
    expect(link.map(({ type }) => type)).toEqual(["text/uri-list"]);
  });

  it("leaves out formats the clipboard cannot hold when another one can", async () => {
    const pasted = fromDataTransfer(
      transfer({ "text/plain": "hi", "text/html": "<i>hi</i>", "text/rtf": "{\\rtf1 hi}" }),
    );
    expect(pasted.map(({ type }) => type)).toEqual(["text/plain", "text/html"]);
    const copied = await fromClipboard([entry({ "text/rtf": "{\\rtf1 hi}", "text/plain": "hi" })]);
    expect(copied.map(({ type }) => type)).toEqual(["text/plain"]);
    expect(copied[0]?.group).toBeNull();
    const dragged = fromDataTransfer(transfer({ "text/uri-list": "https://example.com" }));
    expect(dragged.map(({ type }) => type)).toEqual(["text/uri-list"]);
  });

  it("does not group a single string format", () => {
    expect(fromDataTransfer(transfer({ "text/plain": "hi" }))[0]?.group).toBeNull();
  });

  it("rejects folders", () => {
    const folder = new File([], "photos");
    expect(() => fromDataTransfer(transfer({}, [{ file: folder, directory: true }]))).toThrow(
      FolderNotSupportedError,
    );
  });
});

describe("output", () => {
  it("offers text, HTML and PNG for the clipboard and everything else as files", () => {
    const plan = planOutput([
      item("text/plain"),
      item("image/jpeg"),
      item("image/png"),
      item("application/pdf"),
    ]);
    expect(plan.clipboard.map((formats) => formats.map(({ type }) => type))).toEqual([
      ["text/plain"],
      ["image/png"],
    ]);
    expect(plan.files.map(({ type }) => type)).toEqual(["image/jpeg", "application/pdf"]);
  });

  it("writes the formats of one clipboard entry back together", () => {
    const plan = planOutput([
      item("text/html", "1"),
      item("text/plain", "1"),
      item("text/rtf", "1"),
      item("text/plain", "2"),
    ]);
    expect(plan.clipboard.map((formats) => formats.map(({ type }) => type))).toEqual([
      ["text/html", "text/plain"],
      ["text/plain"],
    ]);
    expect(plan.files.map(({ type }) => type)).toEqual(["text/rtf"]);
  });

  it("matches clipboard types regardless of parameters and case", () => {
    expect(planOutput([item("Text/Plain; charset=utf-8")]).clipboard).toHaveLength(1);
  });
});
