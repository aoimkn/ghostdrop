import { expect, test } from "@playwright/test";

import { open, PHONE, signUp, untilServiceWorkerControls } from "./helpers";

test("an unknown address shows the not-found screen", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("[error_not_found_title]")).toBeVisible();
  await page.getByRole("link", { name: "[common_go_home]" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("home survives a reload, says when it is offline, and shows the error screen when it cannot load", async ({
  browser,
}) => {
  const phone = await open(browser, PHONE);
  await signUp(phone.page, "iPhone");
  await expect(phone.page.getByText("[common_offline]")).toBeHidden();

  await phone.page.context().setOffline(true);
  await expect(phone.page.getByText("[common_offline]")).toBeVisible();
  await phone.page.context().setOffline(false);
  await expect(phone.page.getByText("[common_offline]")).toBeHidden({ timeout: 15_000 });

  await phone.page.reload();
  await expect(phone.page.getByText("[drop_pending_title]")).toBeVisible();

  await phone.page.route("**/api/session", (route) => route.abort());
  await phone.page.reload();
  await expect(phone.page.getByText("[error_unknown_title]")).toBeVisible();
});

test("once opened, the app shows its own error screen when offline", async ({ browser }) => {
  const { page } = await open(browser, PHONE, { serviceWorker: true });
  await page.goto("/sign-in");
  await untilServiceWorkerControls(page);

  await page.context().setOffline(true);
  await page.goto("/");
  await expect(page.getByText("[error_unknown_title]")).toBeVisible();
});
