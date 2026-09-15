import { expect, type Page } from "@playwright/test";

export async function createRoom(page: Page, hostName: string): Promise<string> {
  await page.goto("/");
  await page.getByTestId("create-table-trigger").click();
  await page.getByLabel("Your display name").fill(hostName);
  await page.getByTestId("create-table-submit").click();
  await page.waitForURL(/\/table\/[A-Z0-9]+/);
  const url = page.url();
  return url.split("/table/")[1];
}

export async function joinRoom(page: Page, roomId: string, name: string): Promise<void> {
  await page.goto(`/table/${roomId}`);
  await page.getByLabel("Your display name").fill(name);
  await page.getByTestId("table-join-submit").click();
  // The viewer never renders as their own player-seat (that's the "you" side
  // of the redesign — your identity is the big hole cards + stack panel
  // instead), so confirm the join by the room chrome being present instead.
  await expect(page.getByTestId("buyin-trigger")).toBeVisible({ timeout: 10_000 });
}

export async function requestBuyIn(page: Page, amount: number): Promise<void> {
  await page.getByTestId("buyin-trigger").click();
  await page.getByLabel("Amount").fill(String(amount));
  await page.getByTestId("buyin-submit").click();
}

export async function approveLatestRequest(hostPage: Page, playerName: string): Promise<void> {
  await hostPage.getByTestId("host-requests-trigger").click();
  const row = hostPage.getByTestId("buyin-request-row").filter({ hasText: playerName }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole("button", { name: "Approve" }).click();
  await hostPage.keyboard.press("Escape");
}

export async function rejectLatestRequest(hostPage: Page, playerName: string): Promise<void> {
  await hostPage.getByTestId("host-requests-trigger").click();
  const row = hostPage.getByTestId("buyin-request-row").filter({ hasText: playerName }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole("button", { name: "Reject" }).click();
  await hostPage.keyboard.press("Escape");
}

/** If it's this page's turn, take the safest available action (check > call > fold). */
export async function actIfMyTurn(page: Page): Promise<boolean> {
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
export async function playHandToCompletion(pages: Page[], maxSteps = 60): Promise<void> {
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
