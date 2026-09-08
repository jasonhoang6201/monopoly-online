/**
 * Bấm ô trên bàn cờ hộ bài kiểm thử.
 *
 * Bàn cờ vẽ trong canvas nên Playwright không có phần tử nào để bấm; phải hỏi
 * `BoardScene` toạ độ ô rồi quy về pixel màn hình. Canvas dựng ở độ phân giải
 * riêng (`scale.width/height`) chứ không bằng kích thước hiển thị, nên phải
 * nhân tỉ lệ — thiếu bước này thì cú bấm rơi lệch sang ô khác.
 */

/** Toạ độ tâm ô `id` tính theo pixel màn hình. */
export async function tileXY(page, id) {
  const box = await page.locator('canvas').boundingBox();
  const c = await page.evaluate((tid) => {
    const sc = window.__monopoly.controller.scene;
    const q = sc.tileQuad(tid);
    return {
      x: q.reduce((a, p) => a + p.x, 0) / q.length,
      y: q.reduce((a, p) => a + p.y, 0) / q.length,
      w: sc.scale.width, h: sc.scale.height,
    };
  }, id);
  return { x: box.x + c.x * (box.width / c.w), y: box.y + c.y * (box.height / c.h) };
}

/** Bấm vào một ô trên bàn cờ. */
export async function clickTile(page, id) {
  const { x, y } = await tileXY(page, id);
  await page.mouse.click(x, y);
  await page.waitForTimeout(260);
}

/**
 * Chọn đất cho một vế trong hộp thoại đề nghị giao dịch: mở phiên chọn, bấm
 * lần lượt các ô, rồi chốt.
 *
 * @param {'mine'|'theirs'} side
 * @param {number[]} ids các ô cần bật (bấm lại ô đang bật là tắt)
 */
export async function pickTradeTiles(page, side, ids) {
  await page.locator(`.side-pick[data-side="${side}"]`).click();
  await page.waitForTimeout(600);
  for (const id of ids) await clickTile(page, id);
  await page.locator('.tp-done').click();
  await page.waitForTimeout(600);
}
