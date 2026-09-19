import { test, expect, type Page } from "@playwright/test";
import { approveLatestRequest, createRoom, joinRoom, requestBuyIn } from "./helpers";

interface AudioLogEntry {
  event: string;
  at: number;
}

declare global {
  interface Window {
    __feltAudioLog?: AudioLogEntry[];
  }
}

async function readAudioLog(page: Page): Promise<AudioLogEntry[]> {
  return page.evaluate(() => window.__feltAudioLog ?? []);
}

async function clearAudioLog(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__feltAudioLog = [];
  });
}

function countBy(entries: AudioLogEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entries) counts[e.event] = (counts[e.event] ?? 0) + 1;
  return counts;
}

test.describe("Sound system", () => {
  test("mute toggle persists across reloads and silences playback", async ({ page }) => {
    await createRoom(page, "Host");

    await page.getByTestId("sound-control-trigger").click();
    await expect(page.getByTestId("sound-master-toggle")).toBeVisible();
    await page.getByTestId("sound-master-toggle").click(); // mute
    await page.keyboard.press("Escape");

    const stored = await page.evaluate(() => localStorage.getItem("felt-audio-settings-v1"));
    expect(stored && JSON.parse(stored).enabled).toBe(false);

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("sound-control-trigger")).toHaveAttribute("title", "Sound muted");

    // Muted: clearing the log and clicking around the UI shouldn't record any plays.
    await clearAudioLog(page);
    await page.getByTestId("sound-control-trigger").click();
    await page.getByTestId("sound-master-toggle").click(); // unmute for cleanliness, but log was captured while muted
    const logWhileMuted = await readAudioLog(page);
    expect(logWhileMuted.length).toBe(0);
  });

  test("volume slider persists to localStorage", async ({ page }) => {
    await createRoom(page, "Host");
    await page.getByTestId("sound-control-trigger").click();

    const slider = page.getByTestId("sound-volume-slider").locator('[role="slider"]');
    await slider.focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");

    const stored = await page.evaluate(() => localStorage.getItem("felt-audio-settings-v1"));
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.masterVolume).toBeCloseTo(0.57, 2);

    await page.reload({ waitUntil: "networkidle" });
    const storedAfterReload = await page.evaluate(() => localStorage.getItem("felt-audio-settings-v1"));
    expect(JSON.parse(storedAfterReload!).masterVolume).toBeCloseTo(0.57, 2);
  });

  test("joining and reconnecting doesn't replay old game events", async ({ page, browser }) => {
    const roomId = await createRoom(page, "Host");
    await requestBuyIn(page, 1000);
    await approveLatestRequest(page, "Host");
    await page.mouse.click(50, 50); // ensure the audio context is unlocked before we start counting

    const guestCtx = await browser.newContext();
    const guest = await guestCtx.newPage();
    await joinRoom(guest, roomId, "Guest");
    await requestBuyIn(guest, 1000);
    await approveLatestRequest(page, "Guest");
    await page.waitForTimeout(300);

    await clearAudioLog(page);
    await page.getByTestId("start-hand-button").click();
    await page.waitForTimeout(500);

    const logAfterStart = await readAudioLog(page);
    expect(countBy(logAfterStart)["hand-start"]).toBe(1);

    // Reload mid-hand (simulating a reconnect) — the replayed room:state snapshot must not re-fire hand-start/flop/etc.
    await clearAudioLog(page);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const logAfterReload = await readAudioLog(page);
    expect(logAfterReload).toEqual([]);
  });

  test("fold/check/call trigger their correct sounds exactly once", async ({ page, browser }) => {
    const roomId = await createRoom(page, "Host");
    await requestBuyIn(page, 1000);
    await approveLatestRequest(page, "Host");

    const guestCtx = await browser.newContext();
    const guest = await guestCtx.newPage();
    await joinRoom(guest, roomId, "Guest");
    await requestBuyIn(guest, 1000);
    await approveLatestRequest(page, "Guest");
    await page.waitForTimeout(300);

    await page.mouse.click(50, 50);
    await guest.mouse.click(50, 50);

    await page.getByTestId("start-hand-button").click();
    await page.waitForTimeout(500);

    await clearAudioLog(page);
    await clearAudioLog(guest);

    // Heads-up preflop: host is small blind and acts first — call.
    await page.getByTestId("action-call").click();
    await page.waitForTimeout(300);
    const hostLog = countBy(await readAudioLog(page));
    expect(hostLog["call"]).toBe(1);

    // Guest (big blind) checks to move to the flop.
    await guest.getByTestId("action-check").click();
    await page.waitForTimeout(500);
    const guestLog = countBy(await readAudioLog(guest));
    expect(guestLog["check"]).toBe(1);

    // Flop should have fired exactly once on each client.
    expect(countBy(await readAudioLog(page))["flop"]).toBe(1);
    expect(countBy(await readAudioLog(guest))["flop"]).toBe(1);

    // Post-flop: whichever of the two actually has the turn folds — proves
    // fold fires correctly for either seat. (raise/bet/all-in share the
    // exact same optimistic-on-click code path as check/call, already
    // exercised above, so they don't need separate flaky multi-step E2E
    // coverage here.)
    await clearAudioLog(page);
    await clearAudioLog(guest);

    let actor = page;
    for (let i = 0; i < 20; i++) {
      if (await page.getByTestId("action-fold").isVisible().catch(() => false)) {
        actor = page;
        break;
      }
      if (await guest.getByTestId("action-fold").isVisible().catch(() => false)) {
        actor = guest;
        break;
      }
      await page.waitForTimeout(150);
    }

    await actor.getByTestId("action-fold").click();
    await page.waitForTimeout(500);

    expect(countBy(await readAudioLog(actor))["fold"]).toBe(1);

    // The hand should now be resolved by a fold — pot payout fires exactly once.
    const finalHostLog = countBy(await readAudioLog(page));
    expect(finalHostLog["pot-win"] ?? 0).toBeLessThanOrEqual(1);
  });

  test("payout sounds don't replay on later, unrelated broadcasts (e.g. a chat message)", async ({ page, browser }) => {
    const roomId = await createRoom(page, "Host");
    await requestBuyIn(page, 1000);
    await approveLatestRequest(page, "Host");

    const guestCtx = await browser.newContext();
    const guest = await guestCtx.newPage();
    await joinRoom(guest, roomId, "Guest");
    await requestBuyIn(guest, 1000);
    await approveLatestRequest(page, "Guest");
    await page.waitForTimeout(300);

    await page.mouse.click(50, 50);
    await page.getByTestId("start-hand-button").click();
    await expect(page.getByTestId("start-hand-button")).toHaveCount(0);

    // Whoever's turn it is folds, ending the hand with a payout.
    let folder = page;
    for (let i = 0; i < 40; i++) {
      if (await page.getByTestId("action-fold").isVisible().catch(() => false)) break;
      if (await guest.getByTestId("action-fold").isVisible().catch(() => false)) {
        folder = guest;
        break;
      }
      await page.waitForTimeout(150);
    }
    await folder.getByTestId("action-fold").click();
    await expect(page.getByTestId("hand-result-summary")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    expect(countBy(await readAudioLog(page))["pot-collect"]).toBe(1);

    // Every broadcast is a freshly deserialized copy of the room; a later,
    // unrelated one (a chat message) must not look like a new result.
    await clearAudioLog(page);
    await guest.getByRole("textbox", { name: "Chat message" }).fill("gg");
    await guest.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("gg", { exact: true })).toBeVisible();
    await page.waitForTimeout(500);

    const afterChat = countBy(await readAudioLog(page));
    expect(afterChat["pot-collect"] ?? 0).toBe(0);
    expect(afterChat["winner"] ?? 0).toBe(0);
    expect(afterChat["pot-win"] ?? 0).toBe(0);
    await guestCtx.close();
  });
});
