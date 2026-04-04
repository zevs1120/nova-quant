import { test, expect } from '@playwright/test';

test.describe('Watchlist Persistence and Cross-Tab Sync', () => {
  test('should sync symbol from Today to Watchlist via button click', async ({ page }) => {
    // 1. 进入 Today 标签页
    await page.goto('/?tab=today');

    // 2. 找到第一个卡片的 "+ Watchlist" 按钮并点击
    const cardSymbol = await page.locator('.today-rebuild-card-title').first().innerText();
    const watchButton = page.locator('.today-rebuild-watchlist-button').first();
    await watchButton.click();

    // 3. 验证按钮状态变为 "Saved"
    await expect(watchButton).toHaveClass(/is-saved/);

    // 4. 切换到 Watchlist 标签页 (在 My Stack 下)
    await page.goto('/?tab=my&section=watchlist');

    // 5. 验证符号出现在 "来自 Today 的保存" 文件夹中
    const watchlistCard = page.locator('.watchlist-card-symbol', { hasText: cardSymbol });
    await expect(watchlistCard).toBeVisible();
  });

  test('should allow removing item from Watchlist', async ({ page }) => {
    await page.goto('/?tab=my&section=watchlist');

    const initialCount = await page.locator('.watchlist-card').count();
    if (initialCount > 0) {
      // 点击第一个 "移除" 按钮
      await page
        .locator('.watchlist-action-button', { hasText: /移除|Remove/i })
        .first()
        .click();

      // 验证数量减少
      await expect(page.locator('.watchlist-card')).toHaveCount(initialCount - 1);
    }
  });
});
