import { expect, test } from "@playwright/test";

test("separate browser accounts confirm payments and public ballots on one authority", async ({ browser, baseURL }) => {
  const contexts = await Promise.all([browser.newContext({baseURL, viewport:test.info().project.use.viewport}), browser.newContext({baseURL, viewport:test.info().project.use.viewport})]);
  const pages = await Promise.all(contexts.map(context=>context.newPage()));
  try {
    for (const page of pages) {
      await page.goto("/");
      await page.getByRole("button",{name:"Create alpha test account",exact:true}).click();
      await expect(page.locator(".alpha-network")).toContainText("Alpha test account registered.");
      await page.getByRole("button",{name:"Claim funded alpha UBI",exact:true}).click();
      await expect(page.getByTestId("alpha-balance")).toHaveText("480.00 Aqua");
    }
    const [alice,bob]=pages;
    const bobId=await bob.locator("#alpha-receive").inputValue();
    await alice.getByRole("button",{name:"Wallet",exact:true}).click();
    await alice.locator("#alpha-to").fill(bobId);
    await alice.locator("#alpha-amount").fill("100");
    await alice.getByRole("button",{name:"Send confirmed alpha payment",exact:true}).click();
    await expect(alice.getByTestId("alpha-balance")).toHaveText("380.00 Aqua");
    await bob.getByRole("button",{name:"Refresh authority",exact:true}).click();
    await expect(bob.getByTestId("alpha-balance")).toHaveText("576.00 Aqua");
    // Lose the acknowledgement after the authority commits; retry must not pay twice.
    await alice.route("**/events",async route=>{
      if(route.request().method()!=="POST")return route.continue();
      await route.fetch(); await route.abort("failed"); await alice.unroute("**/events");
    });
    await alice.locator("#alpha-amount").fill("10");
    await alice.getByRole("button",{name:"Send confirmed alpha payment",exact:true}).click();
    await expect(alice.locator(".alpha-network")).toContainText("No confirmation received");
    await alice.getByRole("button",{name:"Retry pending signed request",exact:true}).click();
    await expect(alice.getByTestId("alpha-balance")).toHaveText("370.00 Aqua");
    const title=`Browser ballot ${Date.now()} ${Math.random()}`;
    for(const page of pages){await page.getByRole("button",{name:"Decisions",exact:true}).click();await page.getByLabel("I consent to publicly signed alpha test votes.").check();}
    await alice.locator("#alpha-proposal-title").fill(title);
    await alice.getByRole("button",{name:"Open public alpha proposal",exact:true}).click();
    const proposal=alice.locator(".alpha-network article").filter({hasText:title});
    await proposal.getByRole("button",{name:"Alpha vote yes",exact:true}).click();
    await expect(proposal).toContainText("yes 1, no 0, abstain 0");
    await expect(proposal.getByRole("button",{name:"Alpha vote yes",exact:true})).toBeDisabled();
    await bob.getByRole("button",{name:"Refresh authority",exact:true}).click();
    const other=bob.locator(".alpha-network article").filter({hasText:title});
    await other.getByRole("button",{name:"Alpha vote no",exact:true}).click();
    await expect(other).toContainText("yes 1, no 1, abstain 0");
    await bob.screenshot({path:test.info().outputPath("alpha-decisions.png"),fullPage:true});
    await bob.reload();
    await expect(bob.getByTestId("alpha-balance")).toHaveText("585.60 Aqua");
  } finally {for(const context of contexts)await context.close();}
});
