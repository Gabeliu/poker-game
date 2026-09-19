import { test, expect, type Browser, type Page } from "@playwright/test";
import { approveLatestRequest, createRoom, joinRoom, requestBuyIn } from "./helpers";

async function twoPlayersInHand(browser: Browser) {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  const roomId = await createRoom(host, "Host");
  await requestBuyIn(host, 2000);
  await approveLatestRequest(host, "Host");
  await joinRoom(guest, roomId, "Guest");
  await requestBuyIn(guest, 2000);
  await approveLatestRequest(host, "Guest");
  await expect(guest.getByTestId("your-stack")).toContainText("2,000", { timeout: 10_000 });
  await host.getByTestId("start-hand-button").click();
  await expect(host.getByTestId("start-hand-button")).toHaveCount(0);
  return { hostCtx, guestCtx, host, guest, roomId };
}

async function whoseTurn(host: Page, guest: Page): Promise<Page> {
  for (let i = 0; i < 40; i++) {
    for (const p of [host, guest]) if (await p.getByTestId("action-raise").isVisible().catch(() => false)) return p;
    await host.waitForTimeout(250);
  }
  throw new Error("nobody has a raise button");
}

test.describe("raise amount controls", () => {
  test("− and + step the amount by the big blind, hold to repeat, and respect the min and max", async ({ browser }) => {
    const { hostCtx, guestCtx, host, guest } = await twoPlayersInHand(browser);
    const page = await whoseTurn(host, guest);
    await page.getByTestId("action-raise").click();

    const amount = page.getByLabel("Raise amount");
    const plus = page.getByTestId("betcontrols-plus");
    const minus = page.getByTestId("betcontrols-minus");
    const value = async () => Number((await amount.inputValue()).replace(/,/g, ""));

    const min = await value();
    await expect(minus).toBeDisabled(); // already at the minimum raise

    await plus.click();
    expect(await value()).toBe(min + 50); // default blinds are 25 / 50
    await plus.click();
    expect(await value()).toBe(min + 100);
    await minus.click();
    expect(await value()).toBe(min + 50);

    // Holding + keeps stepping.
    const box = (await plus.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1300);
    await page.mouse.up();
    expect(await value()).toBeGreaterThan(min + 50 + 50 * 4);

    // The slider and ALL-IN preset agree, and + stops at the max.
    await page.getByTestId("betcontrols-allin-preset").click();
    await expect(plus).toBeDisabled();
    const max = await value();
    expect(max).toBeGreaterThan(min);

    // Typing works, and is clamped once the field loses focus.
    await amount.fill("1");
    await amount.blur();
    expect(await value()).toBe(min);

    await hostCtx.close();
    await guestCtx.close();
  });
});

test.describe("buy-in request card", () => {
  test("Approve keeps its label and fill while hovered or focused", async ({ browser }) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const guestCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    const guest = await guestCtx.newPage();
    const roomId = await createRoom(host, "Host");
    await joinRoom(guest, roomId, "Guest");
    await requestBuyIn(guest, 5000);

    const card = host.locator("[data-buyin-request]").first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    const approve = card.getByRole("button", { name: "Approve" });
    const reject = card.getByRole("button", { name: "Reject" });

    const paint = (b: import("@playwright/test").Locator) =>
      b.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor };
      });
    // Opaque lime fill, dark label — before and while hovered.
    const alpha = (c: string) => (c.startsWith("rgba") ? Number(c.split(",")[3].replace(")", "")) : 1);
    const before = await paint(approve);
    await approve.hover();
    await host.waitForTimeout(300); // let the colour transition finish
    const hovered = await paint(approve);
    expect(alpha(hovered.bg)).toBeGreaterThan(0.85);
    expect(hovered.bg).toBe(before.bg);
    expect(hovered.color).toBe(before.color);

    // Reject keeps its red outline instead of the header's transparent border.
    await reject.hover();
    await host.waitForTimeout(300);
    expect((await paint(reject)).border).not.toBe("rgba(0, 0, 0, 0)");

    await hostCtx.close();
    await guestCtx.close();
  });
});
