import { expect, type Page, test } from "@playwright/test";

import { open, PHONE, signUp, untilServiceWorkerControls } from "./helpers";

// What the browser sends when another app shares with the installed ghostdrop.
async function share(page: Page) {
  await page.evaluate(() => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/share";
    form.enctype = "multipart/form-data";
    for (const [name, value] of [
      ["title", "Reservation"],
      ["text", "See you there"],
      ["url", "https://example.com/r/4821"],
    ] as const) {
      const input = document.createElement("input");
      input.name = name;
      input.value = value;
      form.append(input);
    }
    const files = document.createElement("input");
    files.type = "file";
    files.name = "files";
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([new Uint8Array([137, 80, 78, 71])], "photo.png", { type: "image/png" }),
    );
    files.files = transfer.files;
    form.append(files);
    document.body.append(form);
    form.submit();
  });
}

test("content shared from another app opens ready to send", async ({ browser }) => {
  const { page } = await open(browser, PHONE, { serviceWorker: true });
  await signUp(page, "iPhone");
  await untilServiceWorkerControls(page);

  await share(page);
  await expect(page.getByRole("heading", { name: "[drop_compose_title]" })).toBeVisible();
  await expect(page.getByText("photo.png")).toBeVisible();
  await expect(page.getByText(/^text\/plain/)).toBeVisible();
});

test("a share that reaches the server is dropped unread", async ({ page }) => {
  const response = await page.request.post("/share", {
    multipart: { text: "should not be kept" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe("/");
});
