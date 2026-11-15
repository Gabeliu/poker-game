import { test, expect, devices, type Browser, type Page } from "@playwright/test";
import { approveLatestRequest, createRoom, goAllIn, requestBuyIn } from "./helpers";

/**
 * The table as it's actually used on a phone: an iPhone-sized, touch-only
 * viewport. Covers the things that only go wrong (or only matter) there —
 * the join form flashing before the table, finding the room code, telling an
 * opponent's cards apart at showdown, noticing you're out of chips, and
 * knowing when chips bought mid-hand can be played.
 *
 * Set SHOTS=<dir> to also save a screenshot at each step.
 */
const iphone = devices["iPhone 13"];
const PHONE = {
  viewport: iphone.viewport,
  userAgent: iphone.userAgent,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};
const SHOTS = process.env.SHOTS;

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** A phone page that remembers whether the "Join table" form was ever put
 * on screen — even for a single frame, which no later assertion could see. */
async function phonePage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const w = window as unknown as { __sawJoinForm: boolean };
    w.__sawJoinForm = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="table-join-submit"]')) w.__sawJoinForm = true;
    }).observe(document, { childList: true, subtree: true });
  });
  return page;
}

const sawJoinForm = (page: Page) => page.evaluate(() => (window as unknown as { __sawJoinForm: boolean }).__sawJoinForm);

async function joinAndSit(page: Page, roomId: string, name: string): Promise<void> {
  await page.goto(`/table/${roomId}`);
  await page.getByLabel("Your display name").fill(name);
  await page.getByTestId("table-join-submit").click();
  await expect(page.getByTestId("buyin-trigger")).toBeVisible({ timeout: 10_000 });
  await page.locator('[data-testid="empty-seat"][data-seat-action="sit"]').first().click();
  await expect(page.locator('[data-testid="empty-seat"][data-seat-action="sit"]')).toHaveCount(0);
}

/** Host + guest, both seated with `chips` each, on phones. */
async function twoPlayerTable(browser: Browser, chips: number): Promise<{ host: Page; guest: Page; roomId: string }> {
  const host = await phonePage(browser);
  const guest = await phonePage(browser);
  const roomId = await createRoom(host, "Host");
  await requestBuyIn(host, chips);
  await approveLatestRequest(host, "Host");
  await joinAndSit(guest, roomId, "Guest");
  await requestBuyIn(guest, chips);
  await approveLatestRequest(host, "Guest");
  await expect(guest.getByTestId("your-stack")).toHaveAttribute("data-your-chips", String(chips), { timeout: 10_000 });
  return { host, guest, roomId };
}

async function whoseTurn(pages: Page[]): Promise<Page> {
  for (let i = 0; i < 60; i++) {
    for (const p of pages) {
      if (await p.getByTestId("action-fold").isVisible().catch(() => false)) return p;
    }
    await pages[0].waitForTimeout(200);
  }
  throw new Error("Nobody was given the turn");
}

/** Total overlapping area, in CSS px², between any element matching `a` and any matching `b`. */
async function overlapArea(page: Page, a: string, b: string): Promise<number> {
  return page.evaluate(
    ([selA, selB]) => {
      const rects = (sel: string) => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect());
      let total = 0;
      for (const ra of rects(selA)) {
        for (const rb of rects(selB)) {
          const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (w > 0 && h > 0) total += w * h;
        }
      }
      return Math.round(total);
    },
    [a, b]
  );
}

test.describe("on a phone", () => {
  test("the room code is on the table screen, and a returning player never sees the join form", async ({ browser }) => {
    const host = await phonePage(browser);
    const roomId = await createRoom(host, "Host");
    await expect(host.getByTestId("buyin-trigger")).toBeVisible();
    expect(await sawJoinForm(host), "join form shown after creating a table").toBe(false);

    // The code is right there in the header, fully on screen, and readable.
    const code = host.getByTestId("room-code");
    await expect(code).toBeVisible();
    await expect(code).toHaveAttribute("data-room-code", roomId);
    await expect(code).toContainText(roomId);
    const box = (await code.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(PHONE.viewport.width);
    const codeFont = await host.locator(".room-code-value").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(codeFont).toBeGreaterThanOrEqual(11);
    // …without the header eating the table's space (it wrapped onto 4 lines before).
    const headerHeight = await host.locator(".room-header").evaluate((el) => el.getBoundingClientRect().height);
    expect(headerHeight).toBeLessThanOrEqual(92);
    await shot(host, "1-lobby");

    // Reopening the page with a saved seat goes straight back to the table:
    // a loading screen, then the table — never the "Join table" form.
    await host.reload();
    await expect(host.getByTestId("buyin-trigger")).toBeVisible({ timeout: 10_000 });
    expect(await sawJoinForm(host), "join form flashed on reload").toBe(false);

    // A hand-typed, lower-case link is the same table.
    await host.goto(`/table/${roomId.toLowerCase()}`);
    await expect(host.getByTestId("room-code")).toHaveAttribute("data-room-code", roomId, { timeout: 10_000 });
    expect(await sawJoinForm(host), "join form shown for a lower-case link").toBe(false);

    // A table that doesn't exist still lands on the form, with the reason.
    const stranger = await phonePage(browser);
    await stranger.goto("/table/NOPE99");
    await stranger.getByLabel("Your display name").fill("Stranger");
    await stranger.getByTestId("table-join-submit").click();
    await expect(stranger.getByText(/This table isn't open any more/)).toBeVisible();
  });

  test("leaving a table really leaves it, and a later table isn't overwritten by the old one", async ({ browser }) => {
    const host = await phonePage(browser);
    const guest = await phonePage(browser);
    const firstRoom = await createRoom(host, "Host");
    await joinAndSit(guest, firstRoom, "Guest");
    await expect(guest.getByTestId("player-seat")).toHaveCount(1);

    // The host walks away with the header's Leave button…
    await host.getByRole("button", { name: "Leave table" }).click();
    await host.waitForURL((url) => url.pathname === "/");
    // …and the table is told, instead of the host staying "connected" forever.
    await expect(guest.getByText("Host left the table.")).toBeVisible({ timeout: 10_000 });
    await expect(guest.getByText(/lost connection.*paused until they reconnect/i)).toBeVisible();

    // The host starts a brand new table in the same browser session.
    await host.getByTestId("create-table-trigger").click();
    await host.getByTestId("create-table-submit").click();
    await host.waitForURL(/\/table\/[A-Z0-9]+/);
    const secondRoom = host.url().split("/table/")[1];
    expect(secondRoom).not.toBe(firstRoom);
    await expect(host.getByTestId("room-code")).toHaveAttribute("data-room-code", secondRoom);

    // Activity at the old table must not drag the host's screen back to it
    // (it used to replace the room, dropping them onto the join form).
    await guest.getByRole("button", { name: "Open chat" }).click();
    await guest.getByRole("textbox", { name: "Chat message" }).fill("anyone there?");
    await guest.getByRole("button", { name: "Send message" }).click();
    await host.waitForTimeout(800);
    await expect(host.getByTestId("room-code")).toHaveAttribute("data-room-code", secondRoom);
    await expect(host.getByTestId("table-join-submit")).toHaveCount(0);

    // Leaving kept the seat: typing the first table's code on the home page
    // goes straight back to it as the same player, no name asked.
    await host.getByRole("button", { name: "Leave table" }).click();
    await host.waitForURL((url) => url.pathname === "/");
    await host.getByTestId("join-table-trigger").click();
    await host.getByPlaceholder("Enter room code").fill(firstRoom.toLowerCase());
    await host.getByTestId("landing-join-submit").click();
    await expect(host.getByTestId("room-code")).toHaveAttribute("data-room-code", firstRoom, { timeout: 10_000 });
    await expect(host.getByTestId("table-join-submit")).toHaveCount(0);
    await expect(guest.getByText("Host reconnected.")).toBeVisible({ timeout: 10_000 });
    await expect(guest.getByText(/lost connection.*paused until they reconnect/i)).toHaveCount(0);
    await expect(host.getByTestId("player-seat")).toHaveCount(1); // still seated, with the guest across
  });

  test("buying chips mid-hand says they arrive next hand, and the buy button is finger-sized", async ({ browser }) => {
    const { host, guest } = await twoPlayerTable(browser, 1000);

    // The everyday top-up button is a real button, not 10px grey text.
    const buy = guest.getByTestId("buyin-trigger");
    const size = (await buy.boundingBox())!;
    expect(size.height).toBeGreaterThanOrEqual(36);
    expect(size.width).toBeGreaterThanOrEqual(80);
    expect(await buy.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    await shot(guest, "2-seated");

    await host.getByTestId("start-hand-button").click();
    await expect(host.getByTestId("start-hand-button")).toHaveCount(0);
    const actor = await whoseTurn([host, guest]);
    const waiter = actor === host ? guest : host;
    const waiterName = waiter === host ? "Host" : "Guest";
    const liveChips = await waiter.getByTestId("your-stack").getAttribute("data-your-chips");

    // Asking mid-hand: the dialog, a toast, and a standing note all say "next hand".
    await waiter.getByTestId("buyin-trigger").click();
    await expect(waiter.getByText(/can't use new chips in it/)).toBeVisible();
    await shot(waiter, "3-midhand-dialog");
    await waiter.getByLabel("Amount").fill("500");
    await waiter.getByTestId("buyin-submit").click();
    await expect(waiter.getByText(/Request sent\. If the host approves, your 500 chips are added at the start of the next hand\./)).toBeVisible();
    await expect(waiter.getByTestId("chips-request-next-hand")).toContainText("500 chips requested");
    await shot(waiter, "4-midhand-requested");

    // Approved mid-hand: told again, and the live stack is untouched.
    await approveLatestRequest(host, waiterName);
    await expect(waiter.getByText("Buy-in approved — your 500 chips are added at the start of the next hand.")).toBeVisible({ timeout: 10_000 });
    await expect(waiter.getByTestId("chips-next-hand")).toContainText("+500 chips approved");
    await expect(waiter.getByTestId("your-stack")).toHaveAttribute("data-your-chips", liveChips!);
    await shot(waiter, "5-midhand-approved");

    // The hand ends; the chips land and the note goes away.
    await actor.getByTestId("action-fold").click();
    await expect(host.getByTestId("hand-result-summary")).toBeVisible({ timeout: 10_000 });
    // The player who folded stays folded on the other screen — their card
    // backs used to pop back up once the hand was over.
    await expect(waiter.getByTestId("player-seat")).toHaveAttribute("data-player-status", "folded");
    await expect(waiter.getByTestId("opponent-cards")).toHaveCount(0);
    await expect(waiter.getByTestId("your-stack")).toHaveAttribute("data-pending-topup", "0");
    await expect(waiter.getByTestId("chips-next-hand")).toHaveCount(0);

    // Between hands, an approval says the chips are usable right away.
    await requestBuyIn(waiter, 300);
    await approveLatestRequest(host, waiterName);
    await expect(waiter.getByText("Buy-in approved — 300 chips added to your stack.")).toBeVisible({ timeout: 10_000 });
  });

  test("at showdown both of an opponent's cards are readable, clear of the board, and the loser is told to buy chips", async ({ browser }) => {
    test.setTimeout(120_000);
    const { host, guest } = await twoPlayerTable(browser, 1000);
    await host.getByTestId("start-hand-button").click();
    await expect(host.getByTestId("start-hand-button")).toHaveCount(0);

    // Sound: a tap is all it takes to get the audio context running — and
    // to get it running *again* after the phone takes audio away (screen
    // lock, a call, switching apps), which used to leave it dead for good.
    // (Skipped where the test browser has no Web Audio at all.)
    if (await host.evaluate(() => "AudioContext" in window || "webkitAudioContext" in window)) {
      const audioState = () => host.evaluate(() => window.__feltAudioState?.());
      await host.touchscreen.tap(195, 300);
      await expect.poll(audioState).toBe("running");
      await host.evaluate(() => window.__feltAudioInterrupt?.());
      await expect.poll(audioState).toBe("suspended");
      await host.touchscreen.tap(195, 300);
      await expect.poll(audioState).toBe("running");
    }

    // Both players shove; equal stacks, so whoever loses is left with nothing.
    const first = await whoseTurn([host, guest]);
    const second = first === host ? guest : host;
    await goAllIn(first);
    await expect(second.getByTestId("action-call")).toBeVisible({ timeout: 10_000 });
    await goAllIn(second);
    await expect(host.getByTestId("runit-once")).toBeVisible({ timeout: 10_000 });
    await host.getByTestId("runit-once").click();
    await expect(host.getByTestId("hand-result-summary")).toBeVisible({ timeout: 40_000 });
    await host.waitForTimeout(1200); // let the reveal flip and payout settle
    await shot(host, "6-showdown-host");
    await shot(guest, "6-showdown-guest");

    for (const page of [host, guest]) {
      const cards = page.getByTestId("opponent-cards").locator('[role="img"]');
      await expect(cards).toHaveCount(2);
      // Each card shows its own rank and suit, and nothing is drawn over
      // either of them — the left card's suit used to sit under the right card.
      const readable = await page.getByTestId("opponent-cards").evaluate((root) =>
        [...root.querySelectorAll('[role="img"]')].map((card) => {
          const hit = (sel: string) => {
            const el = card.querySelector(sel);
            if (!el) return false;
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return Boolean(top && card.contains(top));
          };
          return { rank: hit(".card-compact-rank"), suit: hit(".card-compact-suit"), width: card.getBoundingClientRect().width };
        })
      );
      for (const card of readable) {
        expect(card.rank, "rank covered").toBe(true);
        expect(card.suit, "suit covered").toBe(true);
        expect(card.width).toBeGreaterThanOrEqual(22);
      }
      // And the board isn't sitting on top of the opponent's seat or cards.
      expect(await overlapArea(page, ".community-board [role=img]", ".player-seat .seat-panel, .player-seat .opponent-cards")).toBe(0);
      expect(await overlapArea(page, ".pot-display", ".player-seat .seat-panel, .player-seat .opponent-cards")).toBe(0);
    }

    const hostChips = Number(await host.getByTestId("your-stack").getAttribute("data-your-chips"));
    test.skip(hostChips === 1000, "split pot — nobody busted this run");
    const loser = hostChips === 0 ? host : guest;
    const winner = loser === host ? guest : host;
    const loserName = loser === host ? "Host" : "Guest";

    // The loser can't miss it: a call-out with a full-size button…
    const callout = loser.getByTestId("out-of-chips");
    await expect(callout).toBeVisible();
    await expect(callout).toContainText("You're out of chips");
    const button = (await callout.getByTestId("buyin-trigger").boundingBox())!;
    expect(button.height).toBeGreaterThanOrEqual(40);
    await expect(loser.getByTestId("buyin-trigger")).toHaveCount(1);
    await expect(winner.getByTestId("out-of-chips")).toHaveCount(0);
    // …and everyone else can see why they aren't being dealt in.
    await expect(winner.getByTestId("player-seat")).toContainText("No chips");
    await shot(loser, "7-out-of-chips");

    // Buying back in clears it.
    await callout.getByTestId("buyin-trigger").click();
    await loser.getByLabel("Amount").fill("800");
    await loser.getByTestId("buyin-submit").click();
    await expect(callout).toContainText("800 requested");
    await shot(loser, "8-rebuy-requested");
    await approveLatestRequest(host, loserName);
    await expect(loser.getByTestId("your-stack")).toHaveAttribute("data-your-chips", "800", { timeout: 10_000 });
    await expect(loser.getByTestId("out-of-chips")).toHaveCount(0);
    await shot(loser, "9-rebought");
  });

  test("the browser's Back button leaves the table too, and coming forward again takes the seat back", async ({ browser }) => {
    const host = await phonePage(browser);
    const guest = await phonePage(browser);
    const roomId = await createRoom(host, "Host");
    await joinAndSit(guest, roomId, "Guest");
    await expect(guest.getByTestId("player-seat")).toHaveCount(1);

    // Back to the home page without touching the Leave button…
    await host.goBack();
    await host.waitForURL((url) => url.pathname === "/");
    // …still tells the table, instead of the host staying "connected".
    await expect(guest.getByText("Host left the table.")).toBeVisible({ timeout: 10_000 });

    // Forward again: straight back into the same seat, no join form.
    await host.goForward();
    await expect(host.getByTestId("room-code")).toHaveAttribute("data-room-code", roomId, { timeout: 10_000 });
    await expect(host.getByTestId("table-join-submit")).toHaveCount(0);
    await expect(guest.getByText("Host reconnected.")).toBeVisible({ timeout: 10_000 });
    await expect(host.getByTestId("player-seat")).toHaveCount(1);
  });

  test("a toast sits below the header, clear of its buttons and the drawer buttons", async ({ browser }) => {
    const host = await phonePage(browser);
    await createRoom(host, "Host");
    await host.getByTestId("room-code").click(); // "Room code … copied" (or spelled out, without clipboard access)
    const toast = host.locator("[data-sonner-toast]").first();
    await expect(toast).toBeVisible();
    await host.waitForTimeout(500); // let it finish sliding in
    const box = (await toast.boundingBox())!;
    const header = (await host.locator(".room-header").boundingBox())!;
    expect(box.y, "toast overlaps the header").toBeGreaterThanOrEqual(header.y + header.height);
    for (const name of ["Open players and history", "Open chat"]) {
      const button = (await host.getByRole("button", { name }).boundingBox())!;
      const overlapsX = box.x < button.x + button.width && box.x + box.width > button.x;
      expect(overlapsX, `toast covers "${name}"`).toBe(false);
    }
    // The header's controls stay usable while it's showing.
    await host.getByTestId("sound-control-trigger").click();
    await expect(host.getByTestId("sound-master-toggle")).toBeVisible();
  });

  test("the server answers its health check without rendering a page", async ({ request }) => {
    const res = await request.get("/healthz");
    expect(res.status()).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});
