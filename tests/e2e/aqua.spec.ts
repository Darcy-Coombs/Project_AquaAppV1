import { expect, test } from "@playwright/test";

test("tester can onboard, verify, claim, and see mobile dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Project Aqua" })).toBeVisible();
  await page.getByRole("button", { name: "identity" }).click();
  await page.locator("#email").fill(`alice-${Date.now()}@example.test`);
  await page.getByRole("button", { name: "Create email identity" }).click();
  await page.getByTestId("beta-verify").click();
  await expect(page.getByTestId("identity-level")).toContainText("beta_override");
  await page.getByRole("button", { name: "dashboard" }).click();
  await page.getByRole("button", { name: "Claim weekly UBI" }).click();
  await expect(page.getByTestId("balance")).toContainText("480.00");
});

test("Run button executes a local protocol flow", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("identity-level")).toContainText(/beta_override|pohw_lite/);
  await expect(page.getByTestId("balance")).toContainText("480.00");
  await expect(page.getByTestId("run-status")).toContainText("run-complete");
});

test("Sync scans local active user and nodes", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("run-status")).toContainText("run-complete");
  await page.getByRole("button", { name: "sync", exact: true }).click();
  await expect(page.getByTestId("sync-active-user")).toContainText(/runner-|user-/);
  await page.getByRole("button", { name: "Find local nodes" }).click();
  await expect(page.getByTestId("node-list")).toContainText("online");
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByTestId("sync-status")).toContainText("synced via");
});

test("mobile install manifest and download controls are available", async ({ page, request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  await expect(await manifest.json()).toMatchObject({
    name: "Project Aqua",
    display: "standalone",
    start_url: "."
  });
  await page.goto("/");
  await page.getByRole("button", { name: "settings" }).click();
  await expect(page.getByText("Mobile download")).toBeVisible();
  await page.getByTestId("install-app").click();
  await expect(page.getByTestId("install-status")).toContainText(/install|Home Screen/);
});
