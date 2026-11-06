import { expect, type Page, test } from "@playwright/test";

import { open, PHONE, signUp } from "./helpers";

// Holds the matching requests until the returned release is called.
async function hold(page: Page, url: string) {
  let release: (() => void) | undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(url, async (route) => {
    if (route.request().method() === "GET") await released;
    await route.continue();
  });
  return () => release?.();
}

test("lists show skeleton rows while they load, and keep their rows while they reload", async ({
  browser,
}) => {
  const { page } = await open(browser, PHONE);
  await signUp(page, "iPhone");

  const drops = await hold(page, "**/api/drops");
  await page.reload();
  await expect(page.locator(".gd-skeleton").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "[drop_paste]" })).toBeEnabled();
  drops();
  await expect(page.getByText("[drop_pending_empty]")).toBeVisible();

  await page.goto("/settings");
  const deviceRows = page.locator(".gd-device");
  await expect(deviceRows.getByText("iPhone")).toBeVisible();
  const devices = await hold(page, "**/api/devices");
  await page.getByRole("button", { name: "[device_rename]" }).click();
  await page.getByLabel("[device_name_label]").fill("iPhone 2");
  await page.getByRole("button", { name: "[device_rename_confirm]" }).click();
  await expect(deviceRows.getByText("iPhone", { exact: true })).toBeVisible();
  await expect(page.locator(".gd-skeleton")).toHaveCount(0);
  devices();
  await expect(deviceRows.getByText("iPhone 2")).toBeVisible();
});
