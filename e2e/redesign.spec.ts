import { test, expect, type Page } from "@playwright/test";
import { createRoom, joinRoom, requestBuyIn, approveLatestRequest, playHandToCompletion, actIfMyTurn } from "./helpers";

async function checkSeatBounds(page: Page) {
  const viewport = page.viewportSize()!;
  const boxes = await page.locator('.player-seat, .empty-seat, .self-seat').evaluateAll((seats) => seats.map((seat) => {
    const { x, y, width, height } = seat.getBoundingClientRect();
    return { x, y, width, height };
  }));
  for (const box of boxes) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const overlap = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    expect(overlap, `Seats ${i} and ${j} overlap`).toBe(false);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const board = await page.locator('.community-board').count() ? await page.locator('.community-board').boundingBox() : null;
  const ownCards = await page.locator('.self-cards').count() ? await page.locator('.self-cards').boundingBox() : null;
  if (board && ownCards && ownCards.height > 0) {
    expect(board.y + board.height, 'The board must clear your hole cards').toBeLessThan(ownCards.y + 2);
  }
}

test('poker room visual checks, full table, expansion and responsive gameplay', async ({ browser }) => {
  test.setTimeout(180_000);
  const contexts = await Promise.all(Array.from({ length: 8 }, () => browser.newContext({ viewport: { width: 1440, height: 900 } })));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const host = pages[0];
  const errors: string[] = [];
  host.on('pageerror', (error) => errors.push(error.message));
  await host.goto('/');
  await expect(host.getByTestId('create-table-trigger')).toBeVisible();
  await host.screenshot({ path: 'e2e/screenshots/redesign-landing-1440.png' });
  const room = await createRoom(host, 'Gabriel');
  await expect(host.getByRole('heading', { name: 'Poker Night' })).toBeVisible();
  await host.screenshot({ path: 'e2e/screenshots/redesign-waiting-1440.png' });
  await checkSeatBounds(host);
  const names = ['Gabriel', 'Alex', 'Sophie', 'James', 'Oliver', 'Emma', 'Noah', 'Mia'];
  for (let i = 1; i < pages.length; i++) await joinRoom(pages[i], room, names[i]);
  for (let i = 0; i < pages.length; i++) {
    await requestBuyIn(pages[i], 5000);
    await approveLatestRequest(host, names[i]);
  }
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await host.setViewportSize(viewport);
    await checkSeatBounds(host);
    await host.screenshot({ path: `e2e/screenshots/redesign-full-${viewport.width}.png` });
  }
  await host.setViewportSize({ width: 1440, height: 900 });
  const expandedWidth = (await host.locator('.poker-table').boundingBox())!.width;
  await host.getByRole('button', { name: 'Collapse players and history' }).click();
  await host.getByRole('button', { name: 'Collapse chat', exact: true }).click();
  await expect.poll(async () => (await host.locator('.poker-table').boundingBox())!.width).toBeGreaterThan(expandedWidth + 100);
  await checkSeatBounds(host);
  await host.screenshot({ path: 'e2e/screenshots/redesign-collapsed-1440.png' });
  await host.getByRole('button', { name: 'Expand players and history' }).click();
  await host.getByRole('button', { name: 'Expand chat', exact: true }).click();
  await host.getByTestId('start-hand-button').click();
  await expect(host.locator('.self-cards [role="img"]')).toHaveCount(2);
  await checkSeatBounds(host);
  await host.screenshot({ path: 'e2e/screenshots/redesign-playing-1440.png' });
  await host.setViewportSize({ width: 390, height: 844 });
  await checkSeatBounds(host);
  await host.screenshot({ path: 'e2e/screenshots/redesign-playing-390.png' });
  await host.setViewportSize({ width: 1440, height: 900 });
  for (const player of pages) {
    if (await player.getByTestId('action-raise').isVisible()) {
      await player.screenshot({ path: 'e2e/screenshots/redesign-actions-1440.png' });
      await player.getByTestId('action-raise').click();
      await expect(player.getByLabel('Bet amount slider')).toBeVisible();
      await player.screenshot({ path: 'e2e/screenshots/redesign-raise-1440.png' });
      await player.getByRole('button', { name: 'Cancel', exact: true }).click();
      await player.setViewportSize({ width: 390, height: 844 });
      await checkSeatBounds(player);
      await player.screenshot({ path: 'e2e/screenshots/redesign-actions-390.png' });
      await player.setViewportSize({ width: 1440, height: 900 });
      break;
    }
  }
  for (let round = 0; round < 3; round++) {
    for (const player of pages) await actIfMyTurn(player);
    if (await host.locator('.community-board [role="img"]').count() > 0) break;
  }
  await expect(host.locator('.community-board [role="img"]').first()).toBeVisible();
  await host.screenshot({ path: 'e2e/screenshots/redesign-flop-1440.png' });
  await playHandToCompletion(pages);
  await expect(host.getByTestId('hand-result-summary')).toBeVisible();
  await checkSeatBounds(host);
  await host.screenshot({ path: 'e2e/screenshots/redesign-showdown-1440.png' });
  await host.setViewportSize({ width: 390, height: 844 });
  await checkSeatBounds(host);
  await host.screenshot({ path: 'e2e/screenshots/redesign-showdown-390.png' });
  expect(errors).toEqual([]);
  await Promise.all(contexts.map((context) => context.close()));
});
