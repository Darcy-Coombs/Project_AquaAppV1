import { expect, test, type Page } from "@playwright/test";

async function openLab(page: Page) {
  const url = new URL(process.env.AQUA_WEB_URL ?? "http://127.0.0.1:5173");
  // WebAuthn RP IDs require a domain, even when the IP is a secure loopback.
  url.hostname = "localhost";
  await page.goto(url.toString());
  await page.getByText("More & settings", { exact: true }).click();
  await page.getByRole("button", { name: "Aqua ID Lab", exact: true }).click();
}
async function ceremony(page: Page) {
  const section = page.getByRole("region", { name: "Human Presence Challenge" });
  await expect(section).toBeVisible();
  for (let round = 1; round <= 5; round++) {
    await expect(section.getByText(`Round ${round} of 5`, { exact: false })).toBeVisible();
    const target = section.locator('button[data-indicated="true"]');
    // Poll DOM state independently of animation frames: other parallel browser
    // tests can background this page while the five-second timer is running.
    await expect.poll(() => target.count(), { timeout: 15000 }).toBe(1);
    await target.click();
  }
  await expect(section).toHaveCount(0);
}
async function inventory(page: Page) {
  return JSON.parse(await page.getByTestId("lab-records").innerText());
}
test("ID Lab enrolment, local replay rejection, verified renewal, persistence and privacy", async ({ page, context }, testInfo) => {
  test.setTimeout(120000);
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", transport: "internal", hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true
  } });
  const labPosts: string[] = [];
  page.on("request", request => { if (request.method() === "POST") labPosts.push(request.url()); });
  await openLab(page);
  await expect(page.getByRole("heading", { name: "CURRENT LIMITATION" })).toBeVisible();
  await page.getByRole("button", { name: "CREATE AQUA ID", exact: true }).click();
  await ceremony(page);
  await expect(page.getByTestId("lab-status")).toContainText("Aqua ID Created");
  await page.getByRole("button", { name: "WHAT DOES AQUA KNOW?", exact: true }).click();
  const first = await inventory(page);
  expect(new Set(Object.values(first.derivedInMemory.scopedPseudonyms)).size).toBe(3);
  expect(JSON.stringify(first)).not.toMatch(/rootKey|privateKey|rawTrace/);
  await page.getByRole("button", { name: "CAST TEST VOTE" }).click();
  await expect(page.getByTestId("lab-status")).toHaveText("ACCEPTED");
  await page.getByRole("button", { name: "CAST TEST VOTE" }).click();
  await expect(page.getByTestId("lab-status")).toContainText("REJECTED — NULLIFIER ALREADY USED");
  await page.reload();
  await page.getByText("More & settings", { exact: true }).click();
  await page.getByRole("button", { name: "Aqua ID Lab", exact: true }).click();
  await page.getByRole("button", { name: "WHAT DOES AQUA KNOW?", exact: true }).click();
  await expect(page.getByTestId("lab-epoch")).toHaveText("Renewal epoch: 0");
  expect((await inventory(page)).derivedInMemory).toEqual(first.derivedInMemory);
  await page.getByRole("button", { name: "VERIFY CONTROL" }).click();
  await expect(page.getByTestId("lab-status")).toContainText("CONTROL VERIFIED");
  await page.getByRole("button", { name: "RENEW AQUA ID" }).click();
  await ceremony(page);
  await expect(page.getByTestId("lab-epoch")).toHaveText("Renewal epoch: 1");
  const next = await inventory(page);
  expect(next.derivedInMemory.nullifier).toBe(first.derivedInMemory.nullifier);
  for (const scope of ["Voting", "Chaos Chat", "DEX"]) expect(next.derivedInMemory.scopedPseudonyms[scope]).not.toBe(first.derivedInMemory.scopedPseudonyms[scope]);
  expect(next.identity.authentication).toEqual(first.identity.authentication);
  expect(next.identity.records).toHaveLength(2);
  expect(next.identity.records[1].challenge.challengeId).not.toBe(next.identity.records[0].challenge.challengeId);
  await page.getByRole("button", { name: "CAST TEST VOTE" }).click();
  await expect(page.getByTestId("lab-status")).toContainText("REJECTED");
  const other = await context.newPage();
  await openLab(other);
  await other.getByRole("button", { name: "CAST TEST VOTE" }).click();
  await expect(other.getByTestId("lab-status")).toContainText("REJECTED");
  await other.close();
  await page.getByRole("button", { name: "RENEW AQUA ID" }).click();
  await page.getByRole("button", { name: "Cancel challenge" }).click();
  await expect(page.getByTestId("lab-epoch")).toHaveText("Renewal epoch: 1");
  expect(labPosts).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `output/playwright/id-lab-${testInfo.project.name}.png`, fullPage: true });
  // Storage loss is an ordinary failure mode, not a recoverable passkey backup.
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("aqua-id-lab-v01");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(["identities", "used"], "readwrite");
        tx.objectStore("identities").clear(); tx.objectStore("used").clear();
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.getByRole("button", { name: "VERIFY CONTROL" }).click();
  await expect(page.getByRole("alert")).toContainText("No local identity remains");
  await expect(page.getByRole("button", { name: "CREATE AQUA ID", exact: true })).toBeEnabled();
});

test("unsupported browser explains requirements without a weak fallback", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "PublicKeyCredential", { value: undefined }));
  await openLab(page);
  await expect(page.getByRole("alert")).toContainText("lacks Web Crypto or WebAuthn");
  await expect(page.getByRole("button", { name: "CREATE AQUA ID", exact: true })).toBeDisabled();
});

test("loopback IP explains how to switch to a valid WebAuthn hostname", async ({ page }) => {
  await page.goto("/");
  await page.getByText("More & settings", { exact: true }).click();
  await page.getByRole("button", { name: "Aqua ID Lab", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("hostname, not an IP address");
  await expect(page.getByRole("button", { name: "CREATE AQUA ID", exact: true })).toBeDisabled();
});
