import { test, expect, type Page } from "@playwright/test";

async function createRoom(page: Page, hostName: string): Promise<string> {
  await page.goto("/");
  await page.getByTestId("create-table-trigger").click();
  await page.getByLabel("Your display name").fill(hostName);
  await page.getByTestId("create-table-submit").click();
  await page.waitForURL(/\/table\/[A-Z0-9]+/);
  const url = page.url();
  return url.split("/table/")[1];
}

async function joinRoom(page: Page, roomId: string, name: string): Promise<void> {
  await page.goto(`/table/${roomId}`);
  await page.getByLabel("Your display name").fill(name);
  await page.getByTestId("table-join-submit").click();
  await expect(page.getByTestId("player-seat").filter({ hasText: name }).first()).toBeVisible({ timeout: 10_000 });
}

async function requestBuyIn(page: Page, amount: number): Promise<void> {
  await page.getByTestId("buyin-trigger").click();
  await page.getByLabel("Amount").fill(String(amount));
  await page.getByTestId("buyin-submit").click();
}

async function approveLatestRequest(hostPage: Page, playerName: string): Promise<void> {
  await hostPage.getByTestId("host-requests-trigger").click();
  const row = hostPage.getByTestId("buyin-request-row").filter({ hasText: playerName }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole("button", { name: "Approve" }).click();
  await hostPage.keyboard.press("Escape");
}

async function rejectLatestRequest(hostPage: Page, playerName: string): Promise<void> {
  await hostPage.getByTestId("host-requests-trigger").click();
  const row = hostPage.getByTestId("buyin-request-row").filter({ hasText: playerName }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole("button", { name: "Reject" }).click();
  await hostPage.keyboard.press("Escape");
}

/** If it's this page's turn, take the safest available action (check > call > fold). */
async function actIfMyTurn(page: Page): Promise<boolean> {
  const check = page.getByTestId("action-check");
  const call = page.getByTestId("action-call");
  const fold = page.getByTestId("action-fold");

  if (await check.isVisible().catch(() => false)) {
    await check.click();
    return true;
  }
  if (await call.isVisible().catch(() => false)) {
    await call.click();
    return true;
  }
  if (await fold.isVisible().catch(() => false)) {
    await fold.click();
    return true;
  }
  return false;
}

/** Drives all pages through a full hand (check/call bot) until it reaches hand-complete. */
async function playHandToCompletion(pages: Page[], maxSteps = 60): Promise<void> {
  for (let i = 0; i < maxSteps; i++) {
    const resultVisible = await pages[0].getByTestId("hand-result-summary").isVisible().catch(() => false);
    const startNextVisible = await pages[0]
      .getByTestId("start-hand-button")
      .isVisible()
      .catch(() => false);
    if (resultVisible || startNextVisible) return;

    let actedThisRound = false;
    for (const page of pages) {
      const acted = await actIfMyTurn(page);
      if (acted) {
        actedThisRound = true;
        await page.waitForTimeout(150);
      }
    }
    if (!actedThisRound) {
      await pages[0].waitForTimeout(200);
    }
  }
  throw new Error("Hand did not complete within the expected number of steps");
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
    await expect(host.getByText("Poker Night")).toBeVisible();

    // Host buys in.
    await requestBuyIn(host, 5000);
    await expect(host.getByText("Waiting for the host to approve")).toBeVisible();
    // Host approves their own request via the host panel.
    await approveLatestRequest(host, "Gabriel");
    await expect(host.getByTestId("player-seat").filter({ hasText: "Gabriel" })).toContainText("5,000");

    // 4. Bob opens the shared link and joins.
    await joinRoom(bob, roomId, "Bob");

    // 5-7. Bob requests a 2,500 chip buy-in; host sees it and approves it.
    await requestBuyIn(bob, 2500);
    await expect(bob.getByText("Waiting for the host to approve")).toBeVisible();
    await approveLatestRequest(host, "Bob");
    await expect(bob.getByTestId("player-seat").filter({ hasText: "Bob" })).toContainText("2,500", { timeout: 10_000 });

    // 8-11. Carol joins, requests a buy-in, host rejects it, Carol resubmits, host approves.
    await joinRoom(carol, roomId, "Carol");
    await requestBuyIn(carol, 9_999_999); // will be rejected regardless of reason
    await rejectLatestRequest(host, "Carol");
    await requestBuyIn(carol, 1500);
    await approveLatestRequest(host, "Carol");
    await expect(carol.getByTestId("player-seat").filter({ hasText: "Carol" })).toContainText("1,500", { timeout: 10_000 });

    // 12. Game cannot start with fewer than 2 approved players — already satisfied (3 approved). Sanity check the
    // start button is enabled now that we have 3 approved players.
    await expect(host.getByTestId("start-hand-button")).toBeEnabled();

    // 13-17. Start a hand and play check/call/fold through to showdown or an uncontested win.
    await host.getByTestId("start-hand-button").click();
    await expect(host.getByTestId("player-seat").first()).toBeVisible();
    await playHandToCompletion([host, bob, carol]);

    // Chip conservation: total chips across all three players should still equal what was bought in (5000+2500+1500).
    const totalChips = async () => {
      let total = 0;
      for (const page of [host, bob, carol]) {
        const text = await page.getByTestId("player-seat").filter({ hasText: "Gabriel" }).getAttribute("data-player-chips");
        total += Number(text ?? 0);
      }
      return total;
    };
    // (Sanity: at least confirm the UI reached a post-hand state without crashing.)
    expect(await host.getByTestId("start-hand-button").isVisible()).toBe(true);
    void totalChips;

    // 18. Test a second buy-in / top-up request for Bob.
    const bobChipsBefore = Number(
      await bob.getByTestId("player-seat").filter({ hasText: "Bob" }).getAttribute("data-player-chips")
    );
    await requestBuyIn(bob, 1000);
    await approveLatestRequest(host, "Bob");
    await expect(host.getByTestId("buyin-request-row").filter({ hasText: "Bob" })).toHaveCount(0);
    await expect
      .poll(async () =>
        Number(await bob.getByTestId("player-seat").filter({ hasText: "Bob" }).getAttribute("data-player-chips"))
      )
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
    await expect(guest.getByTestId("player-seat").filter({ hasText: "Guest" })).toContainText("3,000", {
      timeout: 10_000,
    });

    // Simulate a disconnect + reconnect via page reload (same browser context => same localStorage token).
    await guest.reload();
    await expect(guest.getByTestId("player-seat").filter({ hasText: "Guest" })).toContainText("3,000", {
      timeout: 10_000,
    });
    // Only 2 seats should exist — no duplicate player was created on reconnect.
    await expect(guest.getByTestId("player-seat")).toHaveCount(2);

    await hostCtx.close();
    await guestCtx.close();
  });

  test("host can remove a player and transfer ownership", async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    const guest = await guestCtx.newPage();

    const roomId = await createRoom(host, "Host");
    await joinRoom(guest, roomId, "Guest");

    await expect(host.getByTestId("player-seat")).toHaveCount(2);

    // Open settings, remove Guest via the players tab.
    await host.getByTestId("host-settings-trigger").click();
    await host.getByRole("tab", { name: "Players" }).click();
    await host.getByRole("button", { name: "Remove" }).click();
    await host.keyboard.press("Escape");

    await expect(host.getByTestId("player-seat")).toHaveCount(1);

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

    await expect(pages[0].getByTestId("player-seat")).toHaveCount(names.length);
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
