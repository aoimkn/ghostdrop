import { expect, test } from "@playwright/test";

import { addDevice, DESKTOP, open, PASSPHRASE, PHONE, signInAs, signUp } from "./helpers";

test("a drop sent from one device is received on another and burned", async ({ browser }) => {
  const phone = await open(browser, PHONE);
  await signUp(phone.page, "iPhone");

  await phone.page.getByRole("button", { name: "[drop_write_text]" }).click();
  await phone.page.getByLabel("[drop_text_label]").fill("Move the launch review to Thursday.");
  await phone.page.getByRole("button", { name: "[drop_send]" }).click();
  await expect(phone.page.locator(".gd-drop")).toHaveCount(1);

  const desktop = await open(browser, DESKTOP);
  await signInAs(desktop.page, desktop.authenticator, phone.authenticator);
  await addDevice(desktop.page, "not the passphrase at all", "MacBook Air");
  await expect(desktop.page.getByText("[error_wrong_passphrase]")).toBeVisible();
  await addDevice(desktop.page, PASSPHRASE, "MacBook Air");

  await desktop.page.getByRole("button", { name: "[drop_receive]" }).click();
  await expect(desktop.page.getByText("Move the launch review to Thursday.")).toBeVisible();
  await expect(desktop.page.getByText("[drop_pending_empty]")).toBeVisible();
  await expect(phone.page.getByText("[drop_pending_empty]")).toBeVisible();
});

test("a receive that fails keeps the drop so it can be tried again", async ({ browser }) => {
  const phone = await open(browser, PHONE);
  await signUp(phone.page, "iPhone");
  await phone.page.getByRole("button", { name: "[drop_write_text]" }).click();
  await phone.page.getByLabel("[drop_text_label]").fill("Retry me.");
  await phone.page.getByRole("button", { name: "[drop_send]" }).click();

  const desktop = await open(browser, DESKTOP);
  await signInAs(desktop.page, desktop.authenticator, phone.authenticator);
  await addDevice(desktop.page, PASSPHRASE, "MacBook Air");

  await desktop.page.route("**/api/drops/*/items/*", (route) => route.abort());
  await desktop.page.getByRole("button", { name: "[drop_receive]" }).click();
  await expect(desktop.page.getByText("[error_receive_failed]")).toBeVisible();
  await expect(desktop.page.getByText("[drop_receive_failed]")).toBeVisible();
  await desktop.page.unroute("**/api/drops/*/items/*");

  await desktop.page.getByRole("button", { name: "[common_retry]" }).click();
  await expect(desktop.page.getByText("Retry me.")).toBeVisible();
});

test("text being written can be removed from the drop", async ({ browser }) => {
  const desktop = await open(browser, DESKTOP);
  await signUp(desktop.page, "MacBook Air");

  await desktop.page.getByRole("button", { name: "[drop_write_text]" }).click();
  await desktop.page.getByLabel("[drop_text_label]").fill("Never mind.");
  await desktop.page.getByRole("button", { name: "[drop_remove_item]" }).click();
  await expect(desktop.page.getByLabel("[drop_text_label]")).toHaveCount(0);
  await expect(desktop.page.getByRole("button", { name: "[drop_send]" })).toBeDisabled();
});

test("copying a received text says whether it worked", async ({ browser }) => {
  const phone = await open(browser, PHONE);
  await signUp(phone.page, "iPhone");
  await phone.page.getByRole("button", { name: "[drop_write_text]" }).click();
  await phone.page.getByLabel("[drop_text_label]").fill("Copy me.");
  await phone.page.getByRole("button", { name: "[drop_send]" }).click();

  const desktop = await open(browser, DESKTOP);
  await signInAs(desktop.page, desktop.authenticator, phone.authenticator);
  await addDevice(desktop.page, PASSPHRASE, "MacBook Air");
  await desktop.page.getByRole("button", { name: "[drop_receive]" }).click();

  await desktop.page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await desktop.page.getByRole("button", { name: "[drop_copy_to_clipboard]" }).click();
  await expect(desktop.page.getByRole("button", { name: "[drop_copied]" })).toBeVisible();
  expect(await desktop.page.evaluate(() => navigator.clipboard.readText())).toBe("Copy me.");
  await expect(
    desktop.page.getByRole("button", { name: "[drop_copy_to_clipboard]" }),
  ).toBeVisible();

  await desktop.page.evaluate(() => {
    navigator.clipboard.write = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await desktop.page.getByRole("button", { name: "[drop_copy_to_clipboard]" }).click();
  await expect(desktop.page.getByText("[drop_copy_failed]")).toBeVisible();
});
