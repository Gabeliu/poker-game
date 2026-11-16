import { test, expect, type Browser, type Page } from "@playwright/test";
import { approveLatestRequest, createRoom, joinRoom, playHandToCompletion, requestBuyIn } from "./helpers";

/** A laptop screen once the browser's own toolbars are taken off it. */
const LAPTOP = { width: 1366, height: 650 };

async function seatPlayers(browser: Browser, stacks: number[], viewport = { width: 1280, height: 720 }) {
  const names = ["Gabriel", "Bob", "Carol", "Dave", "Erin", "Frank", "Grace", "Heidi"];
  const pages: Page[] = [];
  for (let i = 0; i < stacks.length; i++) {
    const ctx = await browser.newContext({ viewport });
    pages.push(await ctx.newPage());
  }
  const host = pages[0];
  const roomId = await createRoom(host, names[0]);
  await requestBuyIn(host, stacks[0]);
  await approveLatestRequest(host, names[0]);
  for (let i = 1; i < stacks.length; i++) {
    await joinRoom(pages[i], roomId, names[i]);
    await requestBuyIn(pages[i], stacks[i]);
  }
  for (let i = 1; i < stacks.length; i++) await approveLatestRequest(host, names[i]);
  await expect(pages[stacks.length - 1].getByTestId("your-stack")).toContainText(stacks[stacks.length - 1].toLocaleString("en-US"));
  return { pages, host, roomId, names: names.slice(0, stacks.length) };
}

async function startHand(host: Page) {
  await host.getByTestId("start-hand-button").click();
  await expect(host.getByTestId("start-hand-button")).toHaveCount(0);
}

async function whoseTurn(pages: Page[]): Promise<Page> {
  for (let attempt = 0; attempt < 60; attempt++) {
    for (const page of pages) {
      if (await page.getByTestId("action-fold").isVisible().catch(() => false)) return page;
    }
    await pages[0].waitForTimeout(150);
  }
  throw new Error("Nobody's turn came up");
}

async function shove(page: Page) {
  await page.getByTestId("action-raise").click();
  await page.getByTestId("betcontrols-allin-preset").click();
  await page.getByTestId("betcontrols-confirm").click();
}

/** Everything that would be wrong with the table's layout right now: a seat
 * (or its cards) outside the table area, two seats on top of each other, or a
 * seat covering the pot or the board. */
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    type Box = { l: number; t: number; r: number; b: number; w: number; h: number };
    const out: string[] = [];
    const stage = document.querySelector(".table-stage")!.getBoundingClientRect();
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
    };
    const overlap = (a: Box, b: Box) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 2 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 2;
    const groups: { name: string; parts: Box[] }[] = [];
    for (const seat of document.querySelectorAll<HTMLElement>(".player-seat")) {
      groups.push({
        name: seat.dataset.playerName ?? "?",
        parts: [...seat.querySelectorAll(".seat-panel, .opponent-cards")].map(box).filter((r) => r.w > 0),
      });
    }
    const self = document.querySelector(".self-seat");
    if (self) {
      const parts = [box(self)];
      const cards = self.querySelector(".self-cards");
      if (cards && box(cards).h > 0) parts.push(box(cards));
      groups.push({ name: "(you)", parts });
    }
    for (const g of groups) {
      for (const p of g.parts) {
        if (p.t < stage.top - 1 || p.b > stage.bottom + 1 || p.l < stage.left - 1 || p.r > stage.right + 1) {
          out.push(`${g.name} is outside the table area`);
        }
      }
    }
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (groups[i].parts.some((a) => groups[j].parts.some((b) => overlap(a, b)))) {
          out.push(`${groups[i].name} overlaps ${groups[j].name}`);
        }
      }
    }
    const content = document.querySelector(".table-board-content, .table-board > .table-lobby");
    if (content) {
      const pieces = [...content.children].map(box).filter((r) => r.w > 0 && r.h > 0);
      for (const g of groups) {
        if (g.parts.some((p) => pieces.some((k) => overlap(p, k)))) out.push(`${g.name} covers the pot or board`);
      }
    }
    if (document.documentElement.scrollHeight > window.innerHeight + 1) out.push("the page scrolls");
    return [...new Set(out)];
  });
}

test.describe("desktop table", () => {
  test("a full table fits a laptop-sized window: in a hand, while raising, and at showdown", async ({ browser }) => {
    test.setTimeout(240_000);
    const { pages, host } = await seatPlayers(browser, Array(8).fill(2000), LAPTOP);

    await expect.poll(() => layoutProblems(host)).toEqual([]);

    await startHand(host);
    const actor = await whoseTurn(pages);
    await expect.poll(() => layoutProblems(actor)).toEqual([]);
    // Someone who isn't on the clock sees a differently-shaped action bar.
    const watcher = pages.find((p) => p !== actor)!;
    await expect.poll(() => layoutProblems(watcher)).toEqual([]);

    // The raise panel is the tallest thing the action bar ever shows; on a
    // short window it used to squeeze the table down to a strip.
    await actor.getByTestId("action-raise").click();
    await expect(actor.getByTestId("betcontrols-confirm")).toBeVisible();
    await expect.poll(() => layoutProblems(actor)).toEqual([]);
    const tableHeight = await actor.locator(".poker-table").evaluate((el) => el.getBoundingClientRect().height);
    expect(tableHeight).toBeGreaterThan(280);
    await actor.getByRole("button", { name: "Cancel" }).click();

    await playHandToCompletion(pages, 300);
    await expect(host.getByTestId("hand-result-summary")).toBeVisible();
    for (const page of [host, pages[3]]) await expect.poll(() => layoutProblems(page)).toEqual([]);

    // Eight results don't all fit beside a short table, so the list scrolls —
    // with whoever won at the top, where it can't be missed.
    const rows = host.getByTestId("result-row");
    await expect(rows).toHaveCount(8);
    const firstNet = Number(await rows.first().locator("[data-net-change]").getAttribute("data-net-change"));
    expect(firstNet).toBeGreaterThan(0);
    await expect(rows.first()).toBeInViewport({ ratio: 1 });

    // …and on a roomy window all eight are on screen at once.
    await host.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => host.getByTestId("hand-result-summary").evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
    await expect.poll(() => layoutProblems(host)).toEqual([]);
  });

  test("keyboard shortcuts act on a bare key only — not Ctrl+F, Ctrl+C, or typing in chat", async ({ browser }) => {
    const { pages, host } = await seatPlayers(browser, [1000, 1000]);
    await startHand(host);
    const actor = await whoseTurn(pages);

    // Typing in the chat box (it contains f, c and r).
    await actor.getByPlaceholder("Message…").click();
    await actor.keyboard.type("for real, call or raise?");
    await expect(actor.getByTestId("action-fold")).toBeVisible();

    // Browser shortcuts while focus is on the page itself.
    await actor.locator(".table-stage").click({ position: { x: 5, y: 5 } });
    for (const combo of ["Control+f", "Control+c", "Control+r", "Meta+f", "Alt+c"]) {
      await actor.keyboard.press(combo).catch(() => {});
    }
    await actor.waitForTimeout(400);
    // Ctrl+R may have reloaded the page — either way it is still this player's turn.
    await expect(actor.getByTestId("action-fold")).toBeVisible({ timeout: 10_000 });
    await expect(actor.getByTestId("betcontrols-confirm")).toHaveCount(0);

    // With a dialog open, a stray key belongs to the dialog.
    await actor.getByTestId("sound-control-trigger").click();
    await actor.keyboard.press("f");
    await actor.keyboard.press("Escape");
    await expect(actor.locator('[role="dialog"]')).toHaveCount(0);
    await expect(actor.getByTestId("action-fold")).toBeVisible();

    // The raise panel has its own buttons; F and C don't reach through it.
    await actor.locator(".table-stage").click({ position: { x: 5, y: 5 } });
    await actor.keyboard.press("r");
    await expect(actor.getByTestId("betcontrols-confirm")).toBeVisible();
    await actor.keyboard.press("f");
    await actor.keyboard.press("c");
    await expect(actor.getByTestId("betcontrols-confirm")).toBeVisible();
    await actor.getByRole("button", { name: "Cancel" }).click();

    // And a bare key still does what it says.
    await actor.locator(".table-stage").click({ position: { x: 5, y: 5 } });
    await actor.keyboard.press("f");
    await expect(actor.getByTestId("action-fold")).toHaveCount(0);
    await expect(host.getByTestId("hand-result-summary")).toBeVisible();
  });

  test("calling for your whole stack is one button, and there's no raising into players who are all-in", async ({ browser }) => {
    // Heads-up the dealer (the host, on the first hand) acts first.
    const { pages, host } = await seatPlayers(browser, [300, 2000]);
    const bob = pages[1];
    await startHand(host);
    await shove(host);

    // Bob covers the shove and nobody else can act: he can call or fold. A
    // raise could only ever be handed straight back.
    await expect(bob.getByTestId("action-call")).toHaveText(/^Call 250/i);
    await expect(bob.getByTestId("action-raise")).toHaveCount(0);
    await expect(bob.getByTestId("action-allin")).toHaveCount(0);
    await bob.getByTestId("action-fold").click();
    await expect(host.getByTestId("start-hand-button")).toBeVisible();

    // Next hand Bob has the button and shoves; calling takes all of the host's
    // chips, so that's the one thing the button says.
    await startHand(host);
    await shove(bob);
    const call = host.getByTestId("action-call");
    await expect(call).toHaveText(/^Call All-In \d/i);
    await expect(host.locator(".poker-action")).toHaveCount(2);
    await expect(host.getByTestId("action-raise")).toHaveCount(0);
    await expect(host.getByTestId("action-allin")).toHaveCount(0);
    await call.click();
    await expect(host.getByTestId("action-fold")).toHaveCount(0);
  });

  test("room settings refuse a blank timer and a minimum buy-in above the maximum", async ({ page }) => {
    await createRoom(page, "Gabriel");
    await page.getByTestId("host-settings-trigger").click();
    const save = page.getByTestId("settings-save");
    const timer = page.locator("#settings-turn-seconds");

    await timer.fill("");
    await expect(page.getByTestId("settings-turn-seconds-error")).toHaveText("Enter 5 to 300 seconds.");
    await expect(save).toBeDisabled();
    await timer.fill("3");
    await expect(save).toBeDisabled();
    await timer.fill("45");
    await expect(page.getByTestId("settings-turn-seconds-error")).toHaveCount(0);
    await expect(save).toBeEnabled();

    await page.locator("#settings-min-buyin").fill("5000");
    await page.locator("#settings-max-buyin").fill("100");
    await expect(page.getByTestId("settings-max-buyin-error")).toHaveText("Must be at least the minimum.");
    await expect(save).toBeDisabled();
    await page.locator("#settings-max-buyin").fill("10000");
    await expect(save).toBeEnabled();
    await save.click();
    await expect(save).toHaveCount(0);

    // Saved as typed, and offered back when the dialog is reopened.
    await page.getByTestId("host-settings-trigger").click();
    await expect(timer).toHaveValue("45");
    await expect(page.locator("#settings-min-buyin")).toHaveValue("5000");
    await expect(page.locator("#settings-max-buyin")).toHaveValue("10000");
    await page.keyboard.press("Escape");
    await page.getByTestId("buyin-trigger").click();
    await expect(page.getByText("Min 5,000 · Max 10,000")).toBeVisible();
  });

  test("the home page's room-code box takes a code or a whole invite link, and nothing else", async ({ page, context }) => {
    const roomId = await createRoom(page, "Gabriel");
    const visitor = await context.browser()!.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
    const guest = await visitor.newPage();
    await guest.goto("/");
    await guest.getByTestId("join-table-trigger").click();
    const field = guest.getByPlaceholder("Enter room code");

    await field.fill("ab/../c d?x=1");
    await expect(field).toHaveValue("ABCDX1");

    await field.fill("");
    await guest.evaluate((text) => navigator.clipboard.writeText(text), `http://localhost:3000/table/${roomId.toLowerCase()}`);
    await field.focus();
    await guest.keyboard.press("Control+v");
    await expect(field).toHaveValue(roomId);
    await guest.getByTestId("landing-join-submit").click();
    await guest.waitForURL(new RegExp(`/table/${roomId}$`));
    await expect(guest.getByRole("heading", { name: "Join table" })).toBeVisible();
    await visitor.close();
  });

  test("someone who hasn't sat down yet can read the table's name around the seat straight across", async ({ browser }) => {
    const hostCtx = await browser.newContext({ viewport: LAPTOP });
    const host = await hostCtx.newPage();
    const roomId = await createRoom(host, "Gabriel");
    const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const guest = await guestCtx.newPage();
    await guest.goto(`/table/${roomId}`);
    await guest.getByLabel("Your display name").fill("Bob");
    await guest.getByTestId("table-join-submit").click();
    await expect(guest.locator("[data-top-seat-button]")).toBeVisible();

    const covered = () =>
      guest.evaluate(() => {
        const seat = document.querySelector("[data-top-seat-button]")!.getBoundingClientRect();
        return [...document.querySelectorAll(".table-lobby > *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.height > 0 && r.top < seat.bottom - 1 && r.bottom > seat.top && r.left < seat.right && r.right > seat.left;
          })
          .map((el) => el.textContent?.trim());
      });
    for (const size of [{ width: 1280, height: 720 }, LAPTOP, { width: 1440, height: 900 }]) {
      await guest.setViewportSize(size);
      await expect.poll(covered).toEqual([]);
    }
  });

  test("the turn countdown shows what is really left: after a reload, and on a device whose clock is wrong", async ({ browser }) => {
    const hostCtx = await browser.newContext();
    // Bob's device thinks it is ten minutes later than it is.
    const bobCtx = await browser.newContext();
    await bobCtx.addInitScript(() => {
      const realNow = Date.now.bind(Date);
      Date.now = () => realNow() + 10 * 60 * 1000;
    });
    const host = await hostCtx.newPage();
    const bob = await bobCtx.newPage();
    const roomId = await createRoom(host, "Gabriel");
    await requestBuyIn(host, 1000);
    await approveLatestRequest(host, "Gabriel");
    await joinRoom(bob, roomId, "Bob");
    await requestBuyIn(bob, 1000);
    await approveLatestRequest(host, "Bob");
    await expect(bob.getByTestId("your-stack")).toContainText("1,000");
    const secondsLeft = async (page: Page) => Number(await page.getByTestId("turn-timer").getAttribute("data-seconds-left"));

    // Heads-up the host acts first, on a 30-second clock.
    await startHand(host);
    await expect(host.getByTestId("turn-timer")).toBeVisible();
    expect(await secondsLeft(host)).toBeGreaterThanOrEqual(28);

    // A reload partway through the turn used to start the countdown again from 30.
    await host.waitForTimeout(4000);
    await host.reload();
    await expect(host.getByTestId("turn-timer")).toBeVisible();
    const afterReload = await secondsLeft(host);
    expect(afterReload).toBeLessThanOrEqual(26);
    expect(afterReload).toBeGreaterThanOrEqual(18);

    // Bob's turn: his clock being ten minutes fast must not make it read 0:00.
    await host.getByTestId("action-call").click();
    await expect(bob.getByTestId("turn-timer")).toBeVisible();
    expect(await secondsLeft(bob)).toBeGreaterThanOrEqual(27);
    await bob.waitForTimeout(2200);
    const later = await secondsLeft(bob);
    expect(later).toBeLessThanOrEqual(28);
    expect(later).toBeGreaterThanOrEqual(22);
  });
});
