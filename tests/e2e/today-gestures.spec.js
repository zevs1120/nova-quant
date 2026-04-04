import { test, expect } from '@playwright/test';

test.describe('Today Tab Gestures and Guidance', () => {
  test.beforeEach(async ({ page }) => {
    // 假设存在一个直接进入 Today 预览的 URL 或通过点击触发
    await page.goto('/?tab=today');
    // 触发预览打开（根据项目实际逻辑点击卡片）
    await page.click('.today-tinder-shell .today-rebuild-card');
  });

  test('should show guidance overlay on first open', async ({ page }) => {
    const guidance = page.locator('.today-preview-guidance');
    await expect(guidance).toBeVisible();

    // 点击关闭引导（假设点击任意处或特定按钮关闭）
    await page.click('body');
    await expect(guidance).not.toBeVisible();
  });

  test('should handle horizontal swipe to accept', async ({ page }) => {
    const card = page.locator('.today-preview-card');

    // 获取卡片中心点
    const box = await card.boundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    // 模拟向右滑动（采纳）
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 150, centerY, { steps: 10 });

    // 验证状态属性是否更新
    await expect(card).toHaveAttribute('data-gesture-intent', 'accept');
    await expect(card).toHaveAttribute('data-gesture-active', 'true');

    await page.mouse.up();
    // 验证卡片是否触发了后续逻辑（如加入观察列表成功提示）
  });

  test('should handle horizontal swipe to skip', async ({ page }) => {
    const card = page.locator('.today-preview-card');

    const box = await card.boundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    // 模拟向左滑动（跳过）
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX - 150, centerY, { steps: 10 });

    await expect(card).toHaveAttribute('data-gesture-intent', 'skip');
    await page.mouse.up();
  });
});
