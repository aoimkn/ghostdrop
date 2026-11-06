import { type Browser, expect, type Page, test } from "@playwright/test";

import { attachAuthenticator, type Authenticator } from "./authenticator";

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const PASSPHRASE = "lantern orchard copper meadow";

async function open(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  return { page, authenticator: await attachAuthenticator(page) };
}

async function signUp(page: Page, deviceName: string) {
  await page.goto("/");
  await page.getByRole("link", { name: "[account_sign_up]" }).click();
  await page.getByLabel("[passphrase_new_label]").fill(PASSPHRASE);
  await page.getByLabel("[device_name_label]").fill(deviceName);
  await page.getByRole("button", { name: "[account_sign_up]" }).click();
  await expect(page.getByText("[drop_pending_title]")).toBeVisible();
}

async function signInAs(page: Page, authenticator: Authenticator, from: Authenticator) {
  await authenticator.add(await from.credentials());
  await page.goto("/");
  await page.getByRole("button", { name: "[account_sign_in]" }).click();
  await expect(page).toHaveURL(/\/add-device$/);
}

async function addDevice(page: Page, passphrase: string, deviceName: string) {
  await page.getByLabel("[passphrase_label]").fill(passphrase);
  await page.getByLabel("[device_name_label]").fill(deviceName);
  await page.getByRole("button", { name: "[device_add]" }).click();
}

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

test("an unknown address shows the not-found screen", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("[error_not_found_title]")).toBeVisible();
  await page.getByRole("link", { name: "[common_go_home]" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("home says when the device is offline and stops once it is back", async ({ browser }) => {
  const phone = await open(browser, PHONE);
  await signUp(phone.page, "iPhone");
  await expect(phone.page.getByText("[common_offline]")).toBeHidden();

  await phone.page.context().setOffline(true);
  await expect(phone.page.getByText("[common_offline]")).toBeVisible();
  await phone.page.context().setOffline(false);
  await expect(phone.page.getByText("[common_offline]")).toBeHidden({ timeout: 15_000 });
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
  await expect(desktop.page.getByText("[drop_receive_failed]")).toHaveCount(2);
  await desktop.page.unroute("**/api/drops/*/items/*");

  await desktop.page.getByRole("button", { name: "[common_retry]" }).click();
  await expect(desktop.page.getByText("Retry me.")).toBeVisible();
});

test("a page that cannot load shows the unexpected-error screen", async ({ page }) => {
  await page.route("**/api/session", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByText("[error_unknown_title]")).toBeVisible();
});

test("once opened, the app shows its own error screen when offline", async ({ browser }) => {
  const context = await browser.newContext({ viewport: PHONE, serviceWorkers: "allow" });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller === null) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }),
      );
    }
  });

  await context.setOffline(true);
  await page.goto("/");
  await expect(page.getByText("[error_unknown_title]")).toBeVisible();
});
