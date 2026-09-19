import { test, expect } from "@playwright/test";
import { createRoom, joinRoom, rejectLatestRequest, requestBuyIn } from "./helpers";

test("a rejected buy-in shows the player a temporary message on screen, as well as in chat", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  const roomId = await createRoom(host, "Host");
  await joinRoom(guest, roomId, "Guest");
  await requestBuyIn(guest, 1500);

  await rejectLatestRequest(host, "Guest");

  // The player who was turned down gets a toast naming the amount…
  await expect(guest.getByText("The host declined your 1,500 chip buy-in.")).toBeVisible({ timeout: 10_000 });
  // …the host, who did the rejecting, doesn't need telling…
  await expect(host.getByText("The host declined your 1,500 chip buy-in.")).toHaveCount(0);
  // …and it goes away by itself.
  await expect(guest.getByText("The host declined your 1,500 chip buy-in.")).toBeHidden({ timeout: 15_000 });

  await hostCtx.close();
  await guestCtx.close();
});

test("an approved buy-in doesn't show the decline message", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  const roomId = await createRoom(host, "Host");
  await joinRoom(guest, roomId, "Guest");
  await requestBuyIn(guest, 800);
  await host.getByTestId("host-requests-trigger").click();
  await host.getByTestId("buyin-request-row").filter({ hasText: "Guest" }).first().getByRole("button", { name: "Approve" }).click();
  await expect(guest.getByTestId("your-stack")).toContainText("800", { timeout: 10_000 });
  await expect(guest.getByText(/declined your/)).toHaveCount(0);
  await hostCtx.close();
  await guestCtx.close();
});
