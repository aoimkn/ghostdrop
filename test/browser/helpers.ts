import { type Browser, expect, type Page } from "@playwright/test";

import { attachAuthenticator, type Authenticator } from "./authenticator";

export const PHONE = { width: 390, height: 844 };
export const DESKTOP = { width: 1280, height: 800 };
export const PASSPHRASE = "lantern orchard copper meadow";

export async function open(
  browser: Browser,
  viewport: { width: number; height: number },
  { serviceWorker = false }: { serviceWorker?: boolean } = {},
) {
  const context = await browser.newContext({
    viewport,
    serviceWorkers: serviceWorker ? "allow" : "block",
  });
  const page = await context.newPage();
  return { page, authenticator: await attachAuthenticator(page) };
}

export async function untilServiceWorkerControls(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller === null) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }),
      );
    }
  });
}

export async function signUp(page: Page, deviceName: string) {
  await page.goto("/");
  await page.getByRole("link", { name: "[account_sign_up]" }).click();
  await page.getByLabel("[passphrase_new_label]").fill(PASSPHRASE);
  await page.getByLabel("[device_name_label]").fill(deviceName);
  await page.getByRole("button", { name: "[account_sign_up]" }).click();
  await expect(page.getByText("[drop_pending_title]")).toBeVisible();
}

export async function signInAs(page: Page, authenticator: Authenticator, from: Authenticator) {
  await authenticator.add(await from.credentials());
  await page.goto("/");
  await page.getByRole("button", { name: "[account_sign_in]" }).click();
  await expect(page).toHaveURL(/\/add-device$/);
}

export async function addDevice(page: Page, passphrase: string, deviceName: string) {
  await page.getByLabel("[passphrase_label]").fill(passphrase);
  await page.getByLabel("[device_name_label]").fill(deviceName);
  await page.getByRole("button", { name: "[device_add]" }).click();
}
