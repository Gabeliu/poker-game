import { test, expect } from "@playwright/test";
import { approveLatestRequest, createRoom, joinRoom, requestBuyIn } from "./helpers";

test.describe("blind inputs only accept valid values", () => {
  test("creating a table: negatives can't be typed, and invalid pairs can't be submitted", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("create-table-trigger").click();
    await page.getByLabel("Your display name").fill("Host");
    const submit = page.getByTestId("create-table-submit");
    const small = page.getByLabel("Small blind");
    const big = page.getByLabel("Big blind");

    await expect(submit).toBeEnabled(); // defaults 25 / 50

    // The minus key does nothing, and a pasted negative loses its sign.
    await small.click();
    await small.press("End");
    await small.press("-");
    await expect(small).toHaveValue("25");
    await small.fill("-5");
    await expect(small).toHaveValue("5");

    // Big blind (50) is fine against a small blind of 5; push it below the small blind.
    await expect(submit).toBeEnabled();
    await big.fill("3");
    await expect(page.getByTestId("bb-error")).toContainText("at least the small blind");
    await expect(submit).toBeDisabled();

    // Blank is invalid too, not silently a default.
    await small.fill("");
    await expect(page.getByTestId("sb-error")).toContainText("whole number");
    await expect(submit).toBeDisabled();

    // Decimals can't be typed.
    await small.fill("2.5");
    await expect(small).toHaveValue("25");

    // Back to a valid pair: enabled again, and the room is created with them.
    await small.fill("10");
    await big.fill("20");
    await expect(submit).toBeEnabled();
    await submit.click();
    await page.waitForURL(/\/table\/[A-Z0-9]+/);
    await expect(page.getByText("10 / 20").first()).toBeVisible();
  });

  test("host settings: invalid blinds can't be saved, and blinds can't change mid-hand", async ({ browser }) => {
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

    // Between hands: a bad pair is blocked in the form, a good one saves.
    await host.getByTestId("host-settings-trigger").click();
    const small = host.getByLabel("Small blind");
    const big = host.getByLabel("Big blind");
    const save = host.getByTestId("settings-save");
    await big.fill("10"); // small is still 25
    await expect(host.getByTestId("settings-bb-error")).toContainText("at least the small blind");
    await expect(save).toBeDisabled();
    await small.fill("");
    await expect(save).toBeDisabled();
    await small.fill("10");
    await big.fill("20");
    await expect(save).toBeEnabled();
    await save.click();
    await expect(host.getByText("10 / 20").first()).toBeVisible();

    // Mid-hand the server refuses a blind change and the dialog says why.
    await host.getByTestId("start-hand-button").click();
    await expect(host.getByTestId("start-hand-button")).toHaveCount(0);
    await host.getByTestId("host-settings-trigger").click();
    await host.getByLabel("Small blind").fill("50");
    await host.getByLabel("Big blind").fill("100");
    await host.getByTestId("settings-save").click();
    await expect(host.getByTestId("settings-save-error")).toContainText("between hands");
    await expect(host.getByText("10 / 20").first()).toBeVisible();

    await hostCtx.close();
    await guestCtx.close();
  });
});
