import { test, expect, type Page } from "@playwright/test";
import { approveLatestRequest, createRoom, goAllIn, requestBuyIn } from "./helpers";

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** Overlap area, in px², between the union of two sets of elements. */
async function overlapArea(page: Page, a: string, b: string): Promise<number> {
  return page.evaluate(
    ([selA, selB]) => {
      const union = (sel: string): Box | null => {
        const rects = [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect());
        if (!rects.length) return null;
        return {
          l: Math.min(...rects.map((x) => x.left)),
          t: Math.min(...rects.map((x) => x.top)),
          r: Math.max(...rects.map((x) => x.right)),
          b: Math.max(...rects.map((x) => x.bottom)),
        };
      };
      const boxA = union(selA);
      const boxB = union(selB);
      if (!boxA || !boxB) return 0;
      const w = Math.max(0, Math.min(boxA.r, boxB.r) - Math.max(boxA.l, boxB.l));
      const h = Math.max(0, Math.min(boxA.b, boxB.b) - Math.max(boxA.t, boxB.t));
      return Math.round(w * h);
    },
    [a, b]
  );
}

/** Heads-up with the guest in the seat straight across from the host, both
 * all in, running it twice — the layout with the most on the felt at once. */
async function playRunItTwiceAcross(browser: import("@playwright/test").Browser, viewport: { width: number; height: number }) {
  const hostCtx = await browser.newContext({ viewport });
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  const roomId = await createRoom(host, "Host");
  await requestBuyIn(host, 1000);
  await approveLatestRequest(host, "Host");

  await guest.goto(`/table/${roomId}`);
  await guest.getByLabel("Your display name").fill("Guest");
  await guest.getByTestId("table-join-submit").click();
  await expect(guest.getByTestId("buyin-trigger")).toBeVisible({ timeout: 10_000 });
  const openSeats = guest.locator('[data-testid="empty-seat"][data-seat-action="sit"]');
  await expect(openSeats.first()).toBeVisible();
  const tops = await openSeats.evaluateAll((els) => els.map((e, i) => ({ i, y: e.getBoundingClientRect().top })));
  await openSeats.nth(tops.sort((p, q) => p.y - q.y)[0].i).click(); // the topmost seat
  await requestBuyIn(guest, 1000);
  await approveLatestRequest(host, "Guest");
  await expect(guest.getByTestId("your-stack")).toContainText("1,000", { timeout: 10_000 });

  await host.getByTestId("start-hand-button").click();
  await expect(host.getByTestId("start-hand-button")).toHaveCount(0);
  await expect(host.locator('[data-bet-edge="top-center"]')).toBeVisible();
  return { hostCtx, guestCtx, host, guest };
}

async function shoveBoth(host: Page, guest: Page) {
  let first: Page | null = null;
  for (let i = 0; i < 40 && !first; i++) {
    for (const p of [host, guest]) if (await p.getByTestId("action-raise").isVisible().catch(() => false)) first = p;
    if (!first) await host.waitForTimeout(250);
  }
  if (!first) throw new Error("nobody could raise");
  await goAllIn(first);
  const other = first === host ? guest : host;
  await expect(other.getByTestId("action-call")).toBeVisible({ timeout: 10_000 });
  await goAllIn(other);
  await host.getByTestId("runit-twice").click();
  await guest.getByTestId("runit-twice").click();
  await expect(host.getByTestId("hand-result-summary")).toBeVisible({ timeout: 30_000 });
  await host.waitForTimeout(700);
}

const SIZES = [
  { name: "split-screen", viewport: { width: 940, height: 990 } },
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "phone", viewport: { width: 390, height: 844 } },
];

for (const { name, viewport } of SIZES) {
  test(`the player seated across never covers the pot or the board — ${name}`, async ({ browser }) => {
    test.setTimeout(90_000);
    const { hostCtx, guestCtx, host, guest } = await playRunItTwiceAcross(browser, viewport);

    // Before the all-in: their bet chip is beside them, not on top of the pot.
    await expect(host.locator(".pot-display")).toBeVisible({ timeout: 10_000 });
    await host.waitForTimeout(600);
    expect(await overlapArea(host, '[data-bet-edge="top-center"]', ".pot-display")).toBe(0);
    expect(await overlapArea(host, '[data-bet-edge="top-center"] .seat-bet', ".pot-display")).toBe(0);

    // At the showdown their panel is at its tallest (hand descriptions), and
    // the pot, both boards and the viewer's own cards all have to share the
    // felt with it.
    await shoveBoth(host, guest);
    expect(await overlapArea(host, '[data-bet-edge="top-center"]', ".pot-display")).toBe(0);
    expect(await overlapArea(host, '[data-bet-edge="top-center"]', ".community-board")).toBe(0);
    expect(await overlapArea(host, ".self-cards, .self-seat", ".community-board [role=img]")).toBe(0);
    await expect(host.locator(".pot-display")).toBeVisible();

    await hostCtx.close();
    await guestCtx.close();
  });
}

test("phone: with two boards the cards are full size, not shrunk", async ({ browser }) => {
  test.setTimeout(90_000);
  const { hostCtx, guestCtx, host, guest } = await playRunItTwiceAcross(browser, { width: 390, height: 844 });
  await shoveBoth(host, guest);
  const width = await host.locator('[aria-label="Run 1 community cards"] [role="img"]').first().evaluate((el) => el.getBoundingClientRect().width);
  // One board's cards are 30px on a phone; two boards used to shrink to ~16px.
  expect(width).toBeGreaterThanOrEqual(30);
  await hostCtx.close();
  await guestCtx.close();
});
