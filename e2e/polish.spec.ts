import { test, expect } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import { createRoom, joinRoom, requestBuyIn, approveLatestRequest, playHandToCompletion } from "./helpers";
import type { ClientToServerEvents, ServerToClientEvents } from "../src/lib/events";

test("disconnected seats block both start buttons and a direct socket request until reconnect", async ({ browser }) => {
  test.setTimeout(90_000);
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));
  const [host, guest, other] = pages;
  const roomId = await createRoom(host, "Host");
  await joinRoom(guest, roomId, "Guest");
  await joinRoom(other, roomId, "Other");
  for (let i = 0; i < pages.length; i++) {
    await requestBuyIn(pages[i], 1000);
    await approveLatestRequest(host, ["Host", "Guest", "Other"][i]);
  }
  await expect(host.getByTestId("start-hand-button")).toBeEnabled();
  await guest.goto("about:blank");
  await expect(host.getByTestId("start-hand-button")).toBeDisabled();
  await expect(host.getByText("Waiting for all seated players to reconnect.", { exact: true })).toBeVisible();
  await expect(host.getByTestId("player-seat")).toHaveCount(2);
  const playerToken = await host.evaluate((id) => localStorage.getItem(`poker:token:${id}`), roomId);
  const client: Socket<ServerToClientEvents, ClientToServerEvents> = io("http://localhost:3000", { autoConnect: false });
  try {
    client.connect();
    const joined = await client.timeout(5000).emitWithAck("room:join", { roomId, displayName: "Host", playerToken: playerToken ?? undefined });
    expect(joined.ok).toBe(true);
    const rejected = await client.timeout(5000).emitWithAck("host:startHand", { roomId });
    expect(rejected).toEqual({ ok: false, error: "Waiting for all seated players to reconnect." });
    await expect(host.locator('.self-cards [role="img"]')).toHaveCount(0);
  } finally {
    client.disconnect();
  }
  await guest.goto(`/table/${roomId}`);
  await expect(host.getByTestId("start-hand-button")).toBeEnabled();
  await host.getByTestId("start-hand-button").click();
  await expect(host.getByTestId("start-hand-button")).toBeHidden();
  await expect(guest.getByTestId("buyin-trigger")).toBeVisible();
  await playHandToCompletion(pages);
  await expect(host.getByTestId("hand-result-summary")).toBeVisible();
  await guest.goto("about:blank");
  await expect(host.getByTestId("start-hand-button")).toBeDisabled();
  await expect(host.getByText("Waiting for all seated players to reconnect.", { exact: true })).toBeVisible();
  await guest.goto(`/table/${roomId}`);
  await expect(host.getByTestId("start-hand-button")).toBeEnabled();
  await Promise.all(contexts.map((ctx) => ctx.close()));
});

test("hero parallax preserves layout and respects reduced motion and mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  const cta = page.getByTestId("create-table-trigger");
  await expect(cta).toBeVisible();
  const before = await cta.boundingBox();
  await page.mouse.move(1750, 750);
  await expect.poll(() => page.locator('.hero-scene').evaluate((el) => Number((el as HTMLElement).style.getPropertyValue('--parallax-x')))).toBeGreaterThan(0.5);
  expect(await cta.boundingBox()).toEqual(before);
  await page.screenshot({ path: "e2e/screenshots/polish-landing-1920.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.mouse.move(300, 300);
  await expect.poll(() => page.locator('.hero-hand').evaluate((el) => getComputedStyle(el).translate)).toBe('none');
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.mouse.move(300, 400);
  await expect.poll(() => page.locator('.hero-hand').evaluate((el) => getComputedStyle(el).translate)).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
