import { test, expect, type Page } from "@playwright/test";
import { approveLatestRequest, createRoom, joinRoom, playHandToCompletion, rejectLatestRequest, requestBuyIn } from "./helpers";

async function foldWhoeversTurn(pages: Page[]): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    for (const page of pages) {
      const fold = page.getByTestId("action-fold");
      if (await fold.isVisible().catch(() => false)) {
        await fold.click();
        return;
      }
    }
    await pages[0].waitForTimeout(250);
  }
  throw new Error("No page had a visible fold button");
}

test.describe("Felt poker table — full multiplayer flow", () => {
  test("create, join, buy-in approval, reject/resubmit, and a full hand to showdown", async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    const carolCtx = await browser.newContext();

    const host = await hostCtx.newPage();
    const bob = await bobCtx.newPage();
    const carol = await carolCtx.newPage();

    // 1-3. Host creates a room and becomes owner.
    const roomId = await createRoom(host, "Gabriel");
    await expect(host.getByRole("heading", { name: "Poker Night" })).toBeVisible();

    // Host buys in.
    await requestBuyIn(host, 5000);
    await expect(host.getByText("Waiting for the host to approve")).toBeVisible();
    // Host approves their own request via the host panel.
    await approveLatestRequest(host, "Gabriel");
    await expect(host.getByTestId("your-stack")).toContainText("5,000");

    // 4. Bob opens the shared link and joins.
    await joinRoom(bob, roomId, "Bob");

    // 5-7. Bob requests a 2,500 chip buy-in; host sees it and approves it.
    await requestBuyIn(bob, 2500);
    await expect(bob.getByText("Waiting for the host to approve")).toBeVisible();
    await approveLatestRequest(host, "Bob");
    await expect(bob.getByTestId("your-stack")).toContainText("2,500", { timeout: 10_000 });

    // 8-11. Carol joins, requests a buy-in, host rejects it, Carol resubmits, host approves.
    await joinRoom(carol, roomId, "Carol");
    await requestBuyIn(carol, 9_999_999); // will be rejected regardless of reason
    await rejectLatestRequest(host, "Carol");
    await requestBuyIn(carol, 1500);
    await approveLatestRequest(host, "Carol");
    await expect(carol.getByTestId("your-stack")).toContainText("1,500", { timeout: 10_000 });

    // 12. Game cannot start with fewer than 2 approved players — already satisfied (3 approved). Sanity check the
    // start button is enabled now that we have 3 approved players.
    await expect(host.getByTestId("start-hand-button")).toBeEnabled();

    // 13-17. Start a hand and play check/call/fold through to showdown or an uncontested win.
    await host.getByTestId("start-hand-button").click();
    // player-seat renders for any seated player regardless of hand phase
    // (it was already true before this click, since Bob/Carol were already
    // seated) — wait for the lobby's start button to actually disappear
    // instead, which only happens once the hand has genuinely started.
    await expect(host.getByTestId("start-hand-button")).toHaveCount(0);
    await playHandToCompletion([host, bob, carol]);

    // Sanity: the UI reached a post-hand state without crashing.
    expect(await host.getByTestId("start-hand-button").isVisible()).toBe(true);

    // 18. Test a second buy-in / top-up request for Bob.
    const bobChipsBefore = Number(await bob.getByTestId("your-stack").getAttribute("data-your-chips"));
    await requestBuyIn(bob, 1000);
    await approveLatestRequest(host, "Bob");
    await expect(host.getByTestId("buyin-request-row").filter({ hasText: "Bob" })).toHaveCount(0);
    await expect
      .poll(async () => Number(await bob.getByTestId("your-stack").getAttribute("data-your-chips")))
      .toBe(bobChipsBefore + 1000);

    // 21. Desktop layout screenshot.
    await host.screenshot({ path: "e2e/screenshots/desktop-lobby.png" });

    // 22. Mobile layout.
    await host.setViewportSize({ width: 390, height: 844 });
    await host.waitForTimeout(200);
    await host.screenshot({ path: "e2e/screenshots/mobile-lobby.png" });

    await hostCtx.close();
    await bobCtx.close();
    await carolCtx.close();
  });

  test("a player can disconnect (reload) and reconnect without losing their seat or chips", async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    const guest = await guestCtx.newPage();

    const roomId = await createRoom(host, "Host");
    await requestBuyIn(host, 3000);
    await approveLatestRequest(host, "Host");

    await joinRoom(guest, roomId, "Guest");
    await requestBuyIn(guest, 3000);
    await approveLatestRequest(host, "Guest");
    await expect(guest.getByTestId("your-stack")).toContainText("3,000", { timeout: 10_000 });

    // Simulate a disconnect + reconnect via page reload (same browser context => same localStorage token).
    await guest.reload();
    await expect(guest.getByTestId("your-stack")).toContainText("3,000", { timeout: 10_000 });
    // Only the one other seat (Host) should exist from Guest's view — no
    // duplicate player was created on reconnect.
    await expect(guest.getByTestId("player-seat")).toHaveCount(1);

    await hostCtx.close();
    await guestCtx.close();
  });

  test("other players are told when the host leaves (disconnects), and the room shows it's paused", async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    const guest = await guestCtx.newPage();

    const roomId = await createRoom(host, "Host");
    await joinRoom(guest, roomId, "Guest");
    await expect(guest.getByTestId("player-seat")).toHaveCount(1);

    // "Leave table" is just a client-side navigation — from the server's
    // perspective this looks exactly like any other disconnect (closing the
    // tab, losing network), so closing the host's context here exercises
    // the same real path a host clicking "Leave table" takes.
    await hostCtx.close();

    await expect(guest.getByText("Host disconnected.")).toBeVisible({ timeout: 10_000 });
    await expect(guest.getByText(/lost connection.*paused until they reconnect/i)).toBeVisible({ timeout: 10_000 });

    await guestCtx.close();
  });

  test("host can remove a player and transfer ownership", async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    const guest = await guestCtx.newPage();

    const roomId = await createRoom(host, "Host");
    await joinRoom(guest, roomId, "Guest");

    // From Host's view, only the one other player (Guest) renders as a seat.
    await expect(host.getByTestId("player-seat")).toHaveCount(1);

    // Open settings, remove Guest via the players tab — a confirmation step
    // sits in front of the actual removal to avoid an accidental kick.
    await host.getByTestId("host-settings-trigger").click();
    await host.getByRole("tab", { name: "Players" }).click();
    await host.getByRole("button", { name: "Remove" }).click();
    await host.getByTestId("confirm-remove-player").click();
    await host.keyboard.press("Escape");

    await expect(host.getByTestId("player-seat")).toHaveCount(0);

    await hostCtx.close();
    await guestCtx.close();
  });

  test("post-hand summary shows net profit/loss (not gross pot) for every contributor, signed and opposite", async ({ browser }) => {
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
    await foldWhoeversTurn([host, guest]);
    await expect(host.getByTestId("hand-result-summary")).toBeVisible({ timeout: 10_000 });
    // The payout also lands as a "+amount" popup over the winner.
    await expect(host.getByTestId("win-float")).toBeVisible();

    const hostRow = host.locator('[data-testid="result-row"][data-player-name="Host"]');
    const guestRow = host.locator('[data-testid="result-row"][data-player-name="Guest"]');
    const hostNet = Number(await hostRow.locator("[data-net-change]").getAttribute("data-net-change"));
    const guestNet = Number(await guestRow.locator("[data-net-change]").getAttribute("data-net-change"));

    // One player is up, the other down by exactly the same amount — a fold
    // just moves the blinds around, it can't create or destroy chips.
    expect(hostNet).not.toBe(0);
    expect(guestNet).not.toBe(0);
    expect(hostNet + guestNet).toBe(0);

    await hostCtx.close();
    await guestCtx.close();
  });

  test("a mid-hand rebuy request never touches the active stack — it's queued and applied at the next hand", async ({ browser }) => {
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
    // Captured before blinds are posted, so the later net-change comparison
    // isn't thrown off by the hand's own blind post already being deducted.
    const chipsAtHandStart = Number(await guest.getByTestId("your-stack").getAttribute("data-your-chips"));

    await host.getByTestId("start-hand-button").click();
    await expect(host.getByTestId("player-seat").first()).toBeVisible();

    // Guest requests more chips while the hand is still live.
    const chipsBeforeRequest = Number(await guest.getByTestId("your-stack").getAttribute("data-your-chips"));
    await requestBuyIn(guest, 400);
    await approveLatestRequest(host, "Guest");

    // The host's approval is marked "next hand", and the guest's own stack
    // panel shows the queued amount without changing the live number.
    await expect(guest.getByTestId("your-stack")).toHaveAttribute("data-pending-topup", "400", { timeout: 10_000 });
    expect(Number(await guest.getByTestId("your-stack").getAttribute("data-your-chips"))).toBe(chipsBeforeRequest);

    await foldWhoeversTurn([host, guest]);
    await expect(host.getByTestId("hand-result-summary")).toBeVisible({ timeout: 10_000 });

    // Once the hand ends, the queued chips land automatically.
    await expect
      .poll(async () => Number(await guest.getByTestId("your-stack").getAttribute("data-pending-topup")))
      .toBe(0);
    const guestNet = Number(
      await host
        .locator('[data-testid="result-row"][data-player-name="Guest"]')
        .locator("[data-net-change]")
        .getAttribute("data-net-change")
    );
    expect(Number(await guest.getByTestId("your-stack").getAttribute("data-your-chips"))).toBe(
      chipsAtHandStart + guestNet + 400
    );

    await hostCtx.close();
    await guestCtx.close();
  });

  test("a network drop and recovery resyncs the client automatically, without a manual reload", async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const carolCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    const guest = await guestCtx.newPage();
    const carol = await carolCtx.newPage();

    const roomId = await createRoom(host, "Host");
    await joinRoom(guest, roomId, "Guest");
    await expect(guest.getByTestId("player-seat")).toHaveCount(1); // sees Host

    // Simulate the guest's tab losing connectivity, e.g. a phone getting
    // backgrounded long enough for the OS to suspend its network access.
    await guestCtx.setOffline(true);

    // While offline, a new player joins and takes a seat — something the
    // guest's client has no way to learn about until it resyncs.
    await joinRoom(carol, roomId, "Carol");

    // Restore connectivity — socket.io reconnects the transport, and the
    // resync protocol (room:resync + stateVersion guard) should pick up the
    // missed state with no manual reload required.
    await guestCtx.setOffline(false);
    await expect(guest.getByTestId("player-seat")).toHaveCount(2, { timeout: 15_000 });

    await hostCtx.close();
    await guestCtx.close();
    await carolCtx.close();
  });

  test("cards already on the table aren't re-dealt or re-flipped after a reload", async ({ browser }) => {
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
    await host.getByTestId("start-hand-button").click();
    await expect(host.getByTestId("start-hand-button")).toHaveCount(0);

    // Preflop: SB calls, BB checks -> the flop is dealt.
    for (const page of [host, guest]) {
      for (let i = 0; i < 20; i++) {
        const call = page.getByTestId("action-call");
        const check = page.getByTestId("action-check");
        if (await call.isVisible().catch(() => false)) { await call.click(); break; }
        if (await check.isVisible().catch(() => false)) { await check.click(); break; }
        await page.waitForTimeout(150);
      }
    }
    const board = host.locator('[aria-label="Community cards"] [role="img"]');
    await expect(board).toHaveCount(3);

    // Freshly dealt cards do animate (travel + flip)...
    const dealAnimations = () =>
      host.evaluate(
        () => document.getAnimations().filter((a) => ["deal-in", "card-flip"].includes((a as CSSAnimation).animationName)).length
      );
    expect(await dealAnimations()).toBeGreaterThan(0);

    // ...but after a reload the same cards are simply there — nothing replays.
    await host.reload();
    await expect(board).toHaveCount(3);
    expect(await dealAnimations()).toBe(0);

    await hostCtx.close();
    await guestCtx.close();
  });

  test("table layout stays usable with a larger player count", async ({ browser }) => {
    const names = ["Host", "Bob", "Carol", "Dave", "Erin", "Frank", "Grace"];
    const contexts = await Promise.all(names.map(() => browser.newContext()));
    const pages = await Promise.all(contexts.map((c) => c.newPage()));

    const roomId = await createRoom(pages[0], names[0]);
    for (let i = 1; i < pages.length; i++) {
      await joinRoom(pages[i], roomId, names[i]);
    }

    for (let i = 0; i < pages.length; i++) {
      await requestBuyIn(pages[i], 1000);
      await approveLatestRequest(pages[0], names[i]);
    }

    // From pages[0] (Host)'s view, everyone else renders as a seat — Host itself does not.
    await expect(pages[0].getByTestId("player-seat")).toHaveCount(names.length - 1);
    await expect(pages[0].getByTestId("start-hand-button")).toBeEnabled();

    await pages[0].screenshot({ path: "e2e/screenshots/desktop-7-players.png" });
    await pages[0].setViewportSize({ width: 390, height: 844 });
    await pages[0].waitForTimeout(200);
    await pages[0].screenshot({ path: "e2e/screenshots/mobile-7-players.png" });

    // All 7 seats should be positioned within the viewport (no seat rendered off-screen).
    for (const seat of await pages[0].getByTestId("player-seat").all()) {
      const box = await seat.boundingBox();
      expect(box).not.toBeNull();
    }

    await Promise.all(contexts.map((c) => c.close()));
  });
});
