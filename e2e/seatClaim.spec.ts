import { test, expect, type Browser, type Page } from "@playwright/test";
import { approveLatestRequest, createRoom, joinRoom, requestBuyIn } from "./helpers";

/**
 * Getting a seat back from a browser that doesn't have its token — the same
 * player returning in another browser or on another device. Each "other
 * browser" here is a fresh browser context: no saved seat, no cookies.
 */

/** Opens the table in a brand new browser and tries to join under `name`. */
async function arriveInAnotherBrowser(browser: Browser, roomId: string, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/table/${roomId}`);
  await page.getByLabel("Your display name").fill(name);
  await page.getByTestId("table-join-submit").click();
  return page;
}

async function hostAndGuest(browser: Browser): Promise<{ host: Page; guest: Page; roomId: string }> {
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  const roomId = await createRoom(host, "Host");
  await requestBuyIn(host, 1000);
  await approveLatestRequest(host, "Host");
  await joinRoom(guest, roomId, "Guest");
  await requestBuyIn(guest, 750);
  await approveLatestRequest(host, "Guest");
  await expect(guest.getByTestId("your-stack")).toHaveAttribute("data-your-chips", "750", { timeout: 10_000 });
  return { host, guest, roomId };
}

test.describe("getting your seat back from another browser", () => {
  test("the host approves: the new browser gets the seat and its chips, and the old one is signed out", async ({ browser }) => {
    const { host, guest, roomId } = await hostAndGuest(browser);

    // Same person, different browser: their own name is "taken"…
    const guest2 = await arriveInAnotherBrowser(browser, roomId, "guest");
    await expect(guest2.getByText("That name is already taken at this table.")).toBeVisible();
    // …and instead of a dead end, they can ask for the seat.
    await expect(guest2.getByTestId("seat-claim-offer")).toBeVisible();
    await guest2.getByTestId("seat-claim-request").click();
    await expect(guest2.getByTestId("seat-claim-pending")).toContainText("Asked the host for guest’s seat");

    // Only the host is asked — and is told the seat's holder is still online.
    const card = host.getByTestId("seat-claim-card");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText("says they’re Guest");
    await expect(card.getByTestId("seat-claim-status")).toContainText("Guest is still connected");
    await expect(guest.getByTestId("seat-claim-card")).toHaveCount(0);

    await card.getByTestId("seat-claim-approve").click();

    // The new browser is seated as Guest, with Guest's stack.
    await expect(guest2.getByTestId("your-stack")).toHaveAttribute("data-your-chips", "750", { timeout: 10_000 });
    await expect(guest2.locator(".self-name")).toContainText("Guest");
    await expect(guest2.getByTestId("table-join-submit")).toHaveCount(0);
    // The old browser is told why it's out, and lands on the join form.
    await expect(guest.getByText("Your seat was moved to another browser or device, with the host's approval.")).toBeVisible({ timeout: 10_000 });
    await expect(guest.getByTestId("table-join-submit")).toBeVisible();
    // The table still has exactly one Guest, connected, and the request is gone.
    await expect(host.getByTestId("player-seat")).toHaveCount(1);
    await expect(host.getByTestId("player-seat")).toHaveAttribute("data-player-name", "Guest");
    await expect(host.getByTestId("seat-claim-card")).toHaveCount(0);

    // The old browser's token is dead: reloading doesn't sneak it back in.
    await guest.reload();
    await expect(guest.getByTestId("table-join-submit")).toBeVisible({ timeout: 10_000 });
    await expect(host.getByTestId("player-seat")).toHaveCount(1);

    // And the seat survives a reload in its new home.
    await guest2.reload();
    await expect(guest2.getByTestId("your-stack")).toHaveAttribute("data-your-chips", "750", { timeout: 10_000 });
  });

  test("the host rejects with a reason, and the person asking is shown it", async ({ browser }) => {
    const { host, guest, roomId } = await hostAndGuest(browser);
    const stranger = await arriveInAnotherBrowser(browser, roomId, "Guest");
    await stranger.getByTestId("seat-claim-request").click();
    await expect(stranger.getByTestId("seat-claim-pending")).toBeVisible();

    // Reject opens a list of reasons; one is chosen already, so two taps reject.
    const card = host.getByTestId("seat-claim-card");
    await card.getByTestId("seat-claim-reject").click();
    await expect(card.getByRole("radio")).toHaveCount(4);
    await card.getByRole("radio", { name: "That player is still at the table." }).check();
    await card.getByTestId("seat-claim-reject-confirm").click();

    const rejected = stranger.getByTestId("seat-claim-rejected");
    await expect(rejected).toContainText("The host didn’t give you Guest’s seat.", { timeout: 10_000 });
    await expect(rejected).toContainText("That player is still at the table.");
    await expect(host.getByTestId("seat-claim-card")).toHaveCount(0);
    // Nothing changed for the real Guest.
    await expect(guest.getByTestId("your-stack")).toHaveAttribute("data-your-chips", "750");
    await expect(guest.getByTestId("table-join-submit")).toHaveCount(0);

    // Asking again, the host types their own reason this time.
    await stranger.getByTestId("table-join-submit").click();
    await stranger.getByTestId("seat-claim-request").click();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByTestId("seat-claim-reject").click();
    await card.getByRole("radio", { name: "Something else…" }).check();
    await expect(card.getByTestId("seat-claim-reject-confirm")).toBeDisabled(); // a reason is required
    await card.getByTestId("seat-claim-custom-reason").fill("Nice try, Dave");
    await card.getByTestId("seat-claim-reject-confirm").click();
    await expect(stranger.getByTestId("seat-claim-rejected")).toContainText("Nice try, Dave", { timeout: 10_000 });

    // Turned down, they can still join the ordinary way under another name.
    await stranger.getByLabel("Your display name").fill("Dave");
    await stranger.getByTestId("table-join-submit").click();
    await expect(stranger.getByTestId("buyin-trigger")).toBeVisible({ timeout: 10_000 });
    await expect(stranger.getByTestId("seat-claim-rejected")).toHaveCount(0);
  });

  test("a request is withdrawn when the person asking cancels or goes away", async ({ browser }) => {
    const { host, roomId } = await hostAndGuest(browser);
    const asker = await arriveInAnotherBrowser(browser, roomId, "Guest");
    await asker.getByTestId("seat-claim-request").click();
    await expect(host.getByTestId("seat-claim-card")).toBeVisible({ timeout: 10_000 });

    await asker.getByTestId("seat-claim-cancel").click();
    await expect(host.getByTestId("seat-claim-card")).toHaveCount(0);
    await expect(asker.getByTestId("table-join-submit")).toBeVisible();

    // Ask again, then close the tab: the host isn't left with a dead request.
    await asker.getByTestId("table-join-submit").click();
    await asker.getByTestId("seat-claim-request").click();
    await expect(host.getByTestId("seat-claim-card")).toBeVisible({ timeout: 10_000 });
    await asker.context().close();
    await expect(host.getByTestId("seat-claim-card")).toHaveCount(0, { timeout: 10_000 });
  });

  test("a host who lost their own browser can be let back in by a player at the table", async ({ browser }) => {
    const { host, guest, roomId } = await hostAndGuest(browser);

    // The host's browser is gone for good; nobody is left who could approve anything.
    await host.context().close();
    await expect(guest.getByText(/lost connection.*paused until they reconnect/i)).toBeVisible({ timeout: 10_000 });

    const host2 = await arriveInAnotherBrowser(browser, roomId, "Host");
    await host2.getByTestId("seat-claim-request").click();

    // With the host away, the request for the host's seat goes to the table.
    const card = guest.getByTestId("seat-claim-card");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByTestId("seat-claim-status")).toContainText("Host is offline right now.");
    await card.getByTestId("seat-claim-approve").click();

    // Back in as the host: their chips, and the host's controls.
    await expect(host2.getByTestId("your-stack")).toHaveAttribute("data-your-chips", "1000", { timeout: 10_000 });
    await expect(host2.getByTestId("host-settings-trigger")).toBeVisible();
    await expect(guest.getByText(/lost connection.*paused until they reconnect/i)).toHaveCount(0);
    await expect(host2.getByTestId("start-hand-button")).toBeEnabled();
  });
});
