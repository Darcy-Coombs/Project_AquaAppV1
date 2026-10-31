import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("real-key admission remains pending after reload without an authority", async ({ page }) => {
  await page.goto("/");
  await page.getByText("More & settings", { exact: true }).click();
  await page.getByRole("button", { name: "identity", exact: true }).click();
  await page.getByRole("button", { name: "Create email identity" }).click();
  await expect(page.getByTestId("identity-level")).toContainText("email");
  await page.getByRole("button", { name: "Community", exact: true }).click();
  await page.getByText("Advanced identity details", { exact: true }).click();
  const recipientKey = (await page.locator(".membership-card .break-word").innerText()).trim();
  await page.getByRole("button", { name: "Explore demo" }).click();
  await page.getByLabel("Recipient’s public key").fill(recipientKey);
  await page.getByRole("button", { name: "Create signed invitation" }).click();
  const invite = await page.getByLabel("Signed invitation", { exact: true }).inputValue();
  await page.getByRole("button", { name: "Exit demo" }).click();
  await page.getByLabel("Signed invitation", { exact: true }).fill(invite);
  await page.getByRole("button", { name: "Review invitation", exact: true }).click();
  await expect(page.getByText("authority unverified", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Queue admission request" }).click();
  await expect(page.locator(".membership-card .status-chip")).toHaveText("admission-pending");
  await page.reload();
  await page.getByRole("button", { name: "Community", exact: true }).click();
  await expect(page.locator(".membership-card .status-chip")).toHaveText("admission-pending");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByTestId("branch-balance")).toHaveText("0.00");
  await expect(page.getByText("Not activated", { exact: true })).toBeVisible();
});

test("BranchID invitation, offline queue, growth vote, payment and demo isolation", async ({ page }) => {
  const errors: string[] = []; const posts: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (request.method() === "POST") posts.push(request.url()); });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo" }).click();
  await page.getByRole("button", { name: "Community", exact: true }).click();
  await page.getByRole("button", { name: "Create signed invitation" }).click();
  const invitation = await page.getByLabel("Signed invitation", { exact: true }).inputValue();
  expect(invitation).not.toContain("privateKey");
  await page.getByLabel("Demo identity").selectOption("4");
  await page.getByRole("button", { name: "Review invitation", exact: true }).click();
  await expect(page.getByText("Invited by Maya", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Simulate offline" }).click();
  await page.getByRole("button", { name: "Accept invitation", exact: true }).click();
  await expect(page.getByText("Queued locally.", { exact: false })).toBeVisible();
  await expect(page.locator(".membership-card .status-chip")).toContainText("key-only");
  await page.getByRole("button", { name: "Reconnect & submit 1 queued" }).click();
  await expect(page.locator(".membership-card .status-chip")).toContainText("admitted");
  await expect(page.getByText("join: finalised (demo)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Collapse", exact: true }).click();
  await expect(page.locator(".branch-row")).toHaveCount(4);
  await page.getByRole("button", { name: "Expand", exact: true }).click();
  await expect(page.locator(".branch-row")).toHaveCount(5);
  await page.getByLabel("Demo identity").selectOption("0");
  await page.getByLabel("Member to discuss").selectOption({ label: "You" });
  await page.getByLabel("Observed facts / public evidence reference").fill("Workshop onboarding observed today; context requested.");
  await page.getByRole("button", { name: "Open non-punitive review" }).click();
  await page.getByLabel("Demo identity").selectOption("4");
  await page.getByLabel("Response, appeal or closing note").fill("I attended the workshop; please add this context.");
  await page.getByRole("button", { name: "Add response", exact: true }).click();
  await page.getByRole("button", { name: "Record appeal", exact: true }).click();
  await expect(page.getByText("Appeal: I attended the workshop; please add this context.")).toBeVisible();
  await expect(page.locator(".membership-card .status-chip")).toContainText("admitted");
  await page.getByRole("button", { name: "Decisions", exact: true }).click();
  await page.getByRole("button", { name: "Propose the next tranche" }).click();
  for (const actor of ["4", "0", "1"]) {
    await page.getByLabel("Demo identity").selectOption(actor);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Support", exact: true }).click();
  }
  await page.getByRole("button", { name: "Advance demo clock to closing & evaluate" }).click();
  await expect(page.getByText("A signed demo authorisation released this tranche.")).toBeVisible();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Claim 480 simulated Aqua" }).click();
  await expect(page.getByTestId("branch-balance")).toHaveText("480.00");
  await expect(page.getByRole("button", { name: "Claim 480 simulated Aqua" })).toBeDisabled();
  await page.getByRole("button", { name: "Wallet", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your demo wallet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send simulated Aqua" })).toHaveCount(0);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Exit demo" }).click();
  await expect(page.getByTestId("branch-balance")).toHaveText("0.00");
  await page.getByRole("button", { name: "Decisions", exact: true }).click();
  await expect(page.getByRole("button", { name: "Propose the next tranche" })).toBeDisabled();
  expect(posts).toEqual([]); expect(errors).toEqual([]);
});

test("encrypted key backup restores the same wallet to an empty profile", async ({ page, browser }, testInfo) => {
  await page.goto("/");
  await page.getByText("Existing protocol test tools", { exact: false }).click();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByTestId("branch-balance")).toHaveText("480.00");
  await page.getByText("More & settings", { exact: true }).click();
  await page.getByRole("button", { name: "settings", exact: true }).click();
  await page.getByText("Encrypted key backup & restore", { exact: true }).click();
  await page.getByLabel("Backup passphrase (12+ characters)").fill("test-only-backup-passphrase");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download encrypted backup" }).click();
  const download = await downloadPromise;
  const backupPath = testInfo.outputPath("test-encrypted-backup.json");
  await download.saveAs(backupPath);
  const restoredContext = await browser.newContext();
  const restored = await restoredContext.newPage();
  await restored.goto(process.env.AQUA_WEB_URL ?? "http://127.0.0.1:5173");
  await restored.getByText("More & settings", { exact: true }).click();
  await restored.getByRole("button", { name: "identity", exact: true }).click();
  await restored.getByText("Encrypted key backup & restore", { exact: true }).click();
  await restored.getByLabel("Backup passphrase (12+ characters)").fill("test-only-backup-passphrase");
  await restored.getByLabel("Restore encrypted backup into an empty profile").setInputFiles(backupPath);
  await expect(restored.getByRole("status")).toContainText("Keys, wallet events and queue restored");
  await restored.getByRole("button", { name: "Home", exact: true }).click();
  await expect(restored.getByTestId("branch-balance")).toHaveText("480.00");
  await restoredContext.close();
});

for (const width of [390, 768, 1440]) test(`responsive UI at ${width}px with keyboard, errors, explorer and screenshots`, async ({ page }) => {
  await page.setViewportSize({ width, height: 950 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your place in Aqua." })).toBeVisible();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
  await page.getByRole("button", { name: "Explore demo" }).click();
  await mkdir("output/playwright/branchid", { recursive: true });
  await page.screenshot({ path: `output/playwright/branchid/home-${width}.png`, fullPage: true });
  await page.getByRole("button", { name: "Community", exact: true }).click();
  await page.getByLabel("Signed invitation", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "Review invitation", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Accessible list" }).click();
  await page.getByLabel("Find a name or member ID").fill("Maya");
  await expect(page.locator(".branch-row")).toHaveCount(1);
  await page.getByLabel("Find a name or member ID").fill("");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".branch-row")).toHaveCount(4);
  const dimensions = await page.evaluate(() => ({ screen: innerWidth, document: document.documentElement.scrollWidth }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.screen);
  await page.screenshot({ path: `output/playwright/branchid/community-${width}.png`, fullPage: true });
  await page.getByRole("button", { name: "Decisions", exact: true }).click();
  await page.screenshot({ path: `output/playwright/branchid/decisions-${width}.png`, fullPage: true });
});

test("existing keys, wallet events and queue survive UI upgrade and demo use", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Existing protocol test tools", { exact: false }).click();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByTestId("branch-balance")).toHaveText("480.00");
  const inventory = () => page.evaluate(async () => {
    return await new Promise<Record<string, unknown[]>>((resolve, reject) => {
      const request = indexedDB.open("aqua-web-v1");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result; const transaction = database.transaction(["keys", "events", "queue"], "readonly"); const result: Record<string, unknown[]> = {};
        for (const name of ["keys", "events", "queue"]) { const query = transaction.objectStore(name).getAll(); query.onsuccess = () => { result[name] = query.result; }; }
        transaction.oncomplete = () => { database.close(); resolve(result); };
      };
    });
  });
  // Wait for the existing legacy network queue to settle before comparison.
  await page.waitForTimeout(2200);
  const before = await inventory();
  await page.getByRole("button", { name: "Explore demo" }).click();
  await page.getByRole("button", { name: "Claim 480 simulated Aqua" }).click();
  await page.getByRole("button", { name: "Exit demo" }).click();
  await page.reload();
  await expect(page.getByTestId("branch-balance")).toHaveText("480.00");
  expect(await inventory()).toEqual(before);
});
