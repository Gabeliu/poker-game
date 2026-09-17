import { test, expect } from "@playwright/test";
import { approveLatestRequest, createRoom, goAllIn, joinRoom, requestBuyIn } from "./helpers";

/** Sets up two heads-up players with equal stacks, ready to start a hand. */
async function setupHeadsUp(browser: import("@playwright/test").Browser) {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  const roomId = await createRoom(host, "Host");
  await requestBuyIn(host, 1000);
  await approveLatestRequest(host, "Host");
  await joinRoom(guest, roomId, "Guest");
  await requestBuyIn(guest, 1000);
  await approveLatestRequest(host, "Guest");
  await expect(guest.getByTestId("your-stack")).toContainText("1,000", { timeout: 10_000 });

  await host.getByTestId("start-hand-button").click();
  await expect(host.getByTestId("player-seat").first()).toBeVisible();
  return { hostCtx, guestCtx, host, guest };
}

/** Both players shove preflop — whichever page acts first raises to the
 * ALL-IN preset, the other calls it off, leaving 3 streets still to come. */
async function bothAllInPreflop(host: import("@playwright/test").Page, guest: import("@playwright/test").Page) {
  for (const page of [host, guest]) {
    if (await page.getByTestId("action-raise").isVisible().catch(() => false)) {
      await goAllIn(page);
      break;
    }
  }
  for (const page of [host, guest]) {
    if (await page.getByTestId("action-call").isVisible().catch(() => false)) {
      await goAllIn(page);
      break;
    }
  }
}

function boardCards(page: import("@playwright/test").Page, label: string) {
  return page.locator(`[aria-label="${label} community cards"] [role="img"]`);
}

/** The dealt cards' own aria-labels ("A of hearts", ...) rather than their
 * rendered text, since the label is the authoritative identity regardless
 * of how the rank/suit glyphs are laid out visually. */
async function boardCardIdentities(page: import("@playwright/test").Page, label: string): Promise<string[]> {
  return boardCards(page, label).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
}

test.describe("run it once / run it twice", () => {
  test("both players agreeing runs the board twice, identically for both clients, with a staged reveal", async ({ browser }) => {
    const { hostCtx, guestCtx, host, guest } = await setupHeadsUp(browser);
    await bothAllInPreflop(host, guest);

    await expect(host.getByTestId("runit-decision-prompt")).toBeVisible({ timeout: 10_000 });
    await expect(guest.getByTestId("runit-decision-prompt")).toBeVisible({ timeout: 10_000 });

    await host.getByTestId("runit-twice").click();
    await guest.getByTestId("runit-twice").click();

    // The dual board renders for both clients once both boards start dealing.
    await expect(host.locator('[data-boards="2"]')).toBeVisible({ timeout: 10_000 });
    await expect(guest.locator('[data-boards="2"]')).toBeVisible({ timeout: 10_000 });

    // The reveal is staged (server-paced) — the result shouldn't already be
    // showing the instant it starts.
    await expect(host.getByTestId("hand-result-summary")).not.toBeVisible();

    // Eventually both boards finish and the result lands, on both clients.
    await expect(host.getByTestId("hand-result-summary")).toBeVisible({ timeout: 20_000 });
    await expect(guest.getByTestId("hand-result-summary")).toBeVisible({ timeout: 20_000 });

    // Each board has 5 cards, and — being server-authoritative — the exact
    // same cards on both clients for the same run.
    await expect(boardCards(host, "Run 1")).toHaveCount(5);
    await expect(boardCards(host, "Run 2")).toHaveCount(5);
    const run1Host = await boardCardIdentities(host, "Run 1");
    const run1Guest = await boardCardIdentities(guest, "Run 1");
    const run2Host = await boardCardIdentities(host, "Run 2");
    const run2Guest = await boardCardIdentities(guest, "Run 2");
    expect(run1Host).toEqual(run1Guest);
    expect(run2Host).toEqual(run2Guest);

    await hostCtx.close();
    await guestCtx.close();
  });

  test("either player choosing 'once' resolves immediately without waiting on the other — single board", async ({ browser }) => {
    const { hostCtx, guestCtx, host, guest } = await setupHeadsUp(browser);
    await bothAllInPreflop(host, guest);

    await expect(host.getByTestId("runit-decision-prompt")).toBeVisible({ timeout: 10_000 });

    // Only the host answers, and picks "once" — should resolve right away,
    // not wait out the full decision timer.
    await host.getByTestId("runit-once").click();

    await expect(host.getByTestId("runit-decision-prompt")).not.toBeVisible();
    await expect(host.locator('[data-boards="2"]')).not.toBeVisible();
    await expect(host.getByTestId("hand-result-summary")).toBeVisible({ timeout: 15_000 });
    await expect(guest.getByTestId("hand-result-summary")).toBeVisible({ timeout: 15_000 });
    await expect(guest.locator('[data-boards="2"]')).not.toBeVisible();

    await hostCtx.close();
    await guestCtx.close();
  });

  test("no response before the deadline defaults to running it once", async ({ browser }) => {
    const { hostCtx, guestCtx, host, guest } = await setupHeadsUp(browser);
    await bothAllInPreflop(host, guest);

    await expect(host.getByTestId("runit-decision-prompt")).toBeVisible({ timeout: 10_000 });

    // Let the 10-second decision window expire without either page answering.
    await expect(host.getByTestId("runit-decision-prompt")).not.toBeVisible({ timeout: 14_000 });
    await expect(host.locator('[data-boards="2"]')).not.toBeVisible();
    await expect(host.getByTestId("hand-result-summary")).toBeVisible({ timeout: 15_000 });

    await hostCtx.close();
    await guestCtx.close();
  });
});
