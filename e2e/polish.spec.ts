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

const heroAceTransform = (page: import("@playwright/test").Page) =>
  page.getByTestId("hero-ace").evaluate((el) => getComputedStyle(el).transform);

test("hero: cursor parallax moves the ace without shifting the layout, and is off for reduced motion and touch-size screens", async ({ browser }) => {
  // Desktop: the ace drifts and tilts with the cursor; the copy and buttons don't move.
  const desktop = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await desktop.newPage();
  await page.goto("/");
  const cta = page.getByTestId("create-table-trigger");
  await expect(cta).toBeVisible();
  await expect(page.getByTestId("join-table-trigger")).toBeVisible();
  await expect(page.getByTestId("hero-stage")).toBeVisible();
  await page.waitForTimeout(1600); // entrance animation settles
  const ctaBefore = await cta.boundingBox();
  const aceBefore = await heroAceTransform(page);
  await page.mouse.move(1750, 750);
  await expect.poll(() => heroAceTransform(page), { timeout: 5000 }).not.toBe(aceBefore);
  expect(await cta.boundingBox()).toEqual(ctaBefore);
  await page.screenshot({ path: "e2e/screenshots/polish-landing-1920.png" });
  await desktop.close();

  // Reduced motion: no cursor tracking at all.
  const reduced = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
  const still = await reduced.newPage();
  await still.goto("/");
  await expect(still.getByTestId("hero-ace")).toBeAttached();
  await still.waitForTimeout(800);
  const stillBefore = await heroAceTransform(still);
  await still.mouse.move(300, 300);
  await still.waitForTimeout(700);
  expect(await heroAceTransform(still)).toBe(stillBefore);
  await reduced.close();

  // Phone: cursor tracking is off, nothing overflows, and the artwork is on screen.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await phone.newPage();
  await mobile.goto("/");
  await expect(mobile.getByTestId("create-table-trigger")).toBeVisible();
  await mobile.waitForTimeout(1600);
  const phoneBefore = await heroAceTransform(mobile);
  await mobile.mouse.move(300, 400);
  await mobile.waitForTimeout(700);
  expect(await heroAceTransform(mobile)).toBe(phoneBefore);
  expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const ace = await mobile.getByTestId("hero-ace").boundingBox();
  expect(ace).not.toBeNull();
  expect(ace!.y).toBeLessThan(844); // the hero art starts within the first screen
  await phone.close();
});

test("hero: the generated hand and chip artwork load and are drawn as image layers", async ({ page }) => {
  await page.goto("/");
  const hand = page.getByTestId("hero-ace").locator("img.hero-raster");
  const chips = page.locator(".hero-chips-raster img.hero-raster");
  await expect(hand).toBeVisible();
  await expect(chips).toBeVisible();
  for (const img of [hand, chips]) {
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  }
});
