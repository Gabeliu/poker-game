import { test, expect } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "../src/lib/events";
import { approveLatestRequest, createRoom, goAllIn, joinRoom, requestBuyIn } from "./helpers";

/** Sets up two heads-up players, ready to start a hand (equal 1,000 stacks
 * unless the guest's buy-in is overridden). */
async function setupHeadsUp(browser: import("@playwright/test").Browser, guestBuyIn = 1000) {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  const roomId = await createRoom(host, "Host");
  await requestBuyIn(host, 1000);
  await approveLatestRequest(host, "Host");
  await joinRoom(guest, roomId, "Guest");
  await requestBuyIn(guest, guestBuyIn);
  await approveLatestRequest(host, "Guest");
  await expect(guest.getByTestId("your-stack")).toContainText(guestBuyIn.toLocaleString("en-US"), { timeout: 10_000 });

  await host.getByTestId("start-hand-button").click();
  // player-seat renders for any seated player regardless of hand phase (it
  // was already true before this click, since Guest was already seated) —
  // wait for the lobby's start button to actually disappear instead, which
  // only happens once the hand has genuinely started.
  await expect(host.getByTestId("start-hand-button")).toHaveCount(0);
  return { hostCtx, guestCtx, host, guest };
}

/** Both players shove preflop — whichever page acts first raises to the
 * ALL-IN preset, the other calls it off, leaving 3 streets still to come. */
async function bothAllInPreflop(host: import("@playwright/test").Page, guest: import("@playwright/test").Page) {
  const pages = [host, guest];
  let firstMover: import("@playwright/test").Page | null = null;
  for (const page of pages) {
    if (await page.getByTestId("action-raise").isVisible().catch(() => false)) {
      firstMover = page;
      break;
    }
  }
  if (!firstMover) throw new Error("Neither page had a visible raise button to shove with");
  await goAllIn(firstMover);

  // Wait for the other player's turn to actually arrive (their broadcast
  // may not have landed yet the instant the shove resolves) before acting,
  // rather than a single point-in-time visibility check that can race the
  // update and silently call nothing.
  const other = firstMover === host ? guest : host;
  await expect(other.getByTestId("action-call")).toBeVisible({ timeout: 10_000 });
  await goAllIn(other);
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

    // Run 1 is dealt and revealed first, alone — no second board at all
    // while it's still in progress.
    await expect(host.locator('[data-boards="2"]')).not.toBeVisible();
    await expect(host.getByTestId("hand-result-summary")).not.toBeVisible();

    // Run 1 resolves with its own "Run 1 — winner" beat — and at that exact
    // moment run 2 has no real cards yet, only empty placeholders (it
    // hasn't started dealing), even once the dual-board frame appears.
    await expect(host.getByTestId("run1-result-banner")).toBeVisible({ timeout: 10_000 });
    await expect(boardCards(host, "Run 2")).toHaveCount(0);

    // Run 2 then deals and resolves on its own.
    await expect(host.locator('[data-boards="2"]')).toBeVisible({ timeout: 10_000 });
    await expect(guest.locator('[data-boards="2"]')).toBeVisible({ timeout: 10_000 });

    // The reveal is staged (server-paced) — the final combined result
    // shouldn't already be showing the instant the dual board appears.
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

  test("a stray start-hand request mid-decision is rejected and doesn't stall the hand", async ({ browser }) => {
    const { hostCtx, guestCtx, host, guest } = await setupHeadsUp(browser);
    const roomId = host.url().split("/table/")[1];
    await bothAllInPreflop(host, guest);
    await expect(host.getByTestId("runit-decision-prompt")).toBeVisible({ timeout: 10_000 });

    // Straight to the socket, bypassing the UI (which hides the Start button
    // mid-hand) — the server itself must refuse, without side effects.
    const token = await host.evaluate((id) => localStorage.getItem(`poker:token:${id}`), roomId);
    const client: Socket<ServerToClientEvents, ClientToServerEvents> = io("http://localhost:3000", { autoConnect: false });
    try {
      client.connect();
      const joined = await client
        .timeout(5000)
        .emitWithAck("room:join", { roomId, displayName: "Host", playerToken: token ?? undefined });
      expect(joined.ok).toBe(true);
      const rejected = await client.timeout(5000).emitWithAck("host:startHand", { roomId });
      expect(rejected).toEqual({ ok: false, error: "A hand is already in progress." });
    } finally {
      client.disconnect();
    }

    // The decision is still live, and its own timeout still fires (nobody
    // clicks anything here — a manual choice would re-arm the timer and hide
    // exactly the stall this guards against) and the hand runs to completion.
    await expect(host.getByTestId("runit-decision-prompt")).toBeVisible();
    await expect(host.getByTestId("hand-result-summary")).toBeVisible({ timeout: 30_000 });

    await hostCtx.close();
    await guestCtx.close();
  });

  test("an unmatched excess is shown as an uncalled bet (not a side pot), and each run has one winner", async ({ browser }) => {
    // Host 1,000 vs guest 200: both shove, so 800 of the host's chips can
    // never be matched.
    const { hostCtx, guestCtx, host, guest } = await setupHeadsUp(browser, 200);
    await bothAllInPreflop(host, guest);
    await expect(host.getByTestId("runit-decision-prompt")).toBeVisible({ timeout: 10_000 });
    await host.getByTestId("runit-twice").click();
    await guest.getByTestId("runit-twice").click();
    await expect(host.getByTestId("hand-result-summary")).toBeVisible({ timeout: 30_000 });

    // The refund is called out as such, and there's no one-player side pot.
    await expect(host.getByTestId("uncalled-bet")).toContainText("Uncalled 800 returned to");
    await expect(host.getByText(/Side \d/)).toHaveCount(0);

    // Heads-up, no side pot: each run is won by exactly one player (or is a
    // chop) — never marked "(won)" for both players just because of the refund.
    const rows = host.locator('[data-testid="per-run-result"]');
    await expect(rows).toHaveCount(2);
    const texts = await rows.allTextContents();
    for (const run of ["Run 1", "Run 2"]) {
      const winners = texts.filter((t) => new RegExp(`${run}:[^·]*\(won\)`).test(t)).length;
      const scooped = await host.getByText("Scoop").count();
      // one "(won)" per run, or that run's winner scooped both (no marker)
      expect(winners + scooped).toBeGreaterThanOrEqual(1);
      expect(winners).toBeLessThanOrEqual(1);
    }

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
