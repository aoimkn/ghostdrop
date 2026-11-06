import { expect, test } from "@playwright/test";

import { addDevice, DESKTOP, open, PASSPHRASE, PHONE, signInAs, signUp } from "./helpers";

test("replacing the passphrase locks the other devices until they enter it", async ({
  browser,
}) => {
  const phone = await open(browser, PHONE);
  await signUp(phone.page, "iPhone");
  const desktop = await open(browser, DESKTOP);
  await signInAs(desktop.page, desktop.authenticator, phone.authenticator);
  await addDevice(desktop.page, PASSPHRASE, "MacBook Air");
  await expect(desktop.page.getByText("[drop_pending_title]")).toBeVisible();

  const replaced = "a different passphrase for this account";
  await phone.page.goto("/settings/passphrase");
  await phone.page.getByLabel("[passphrase_new_label]").fill(replaced);
  await phone.page.getByRole("button", { name: "[passphrase_replace]" }).click();
  await phone.page.getByRole("button", { name: "[passphrase_replace_confirm]" }).click();
  await expect(phone.page.getByText("[drop_pending_title]")).toBeVisible();

  await desktop.page.reload();
  await expect(desktop.page).toHaveURL(/\/unlock$/);
  await desktop.page.getByLabel("[passphrase_label]").fill(PASSPHRASE);
  await desktop.page.getByRole("button", { name: "[device_unlock]" }).click();
  await expect(desktop.page.getByText("[error_wrong_passphrase]")).toBeVisible();
  await desktop.page.getByLabel("[passphrase_label]").fill(replaced);
  await desktop.page.getByRole("button", { name: "[device_unlock]" }).click();
  await expect(desktop.page.getByText("[drop_pending_title]")).toBeVisible();
});
