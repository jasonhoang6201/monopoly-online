/**
 * Vòng lắc giành quyền đi trước — ván nào bây giờ cũng mở màn bằng nó, nên
 * mọi bài kiểm thử đều phải đi qua đây trước khi chạm tới lượt chơi thật.
 */

/** Thứ tự đi đã chốt trên máy này (null nghĩa là còn đang lắc). */
export const orderOf = (page) => page.evaluate(
  () => window.__monopoly?.controller?.state?.order ?? null,
).catch(() => null);

/**
 * Bấm hộ nút "Lắc xí ngầu" ở mọi máy cho tới khi thứ tự chốt xong.
 *
 * @param {object|object[]} pages một hoặc nhiều trang (bản online có nhiều máy)
 * @param {object} [o]
 * @param {boolean} [o.normalize] trả thứ tự về đúng thứ tự ghế sau khi lắc.
 *   Phần lớn bài kiểm thử dựng kịch bản theo số ghế nên cần điểm xuất phát cố
 *   định; chuyện bốc thăm đúng hay sai đã có phần kiểm riêng lo.
 * @returns {Promise<number[]|null>} thứ tự bốc thăm được, hoặc null nếu hỏng
 */
export async function playRollOff(pages, { normalize = true, ms = 90000 } = {}) {
  const list = Array.isArray(pages) ? pages : [pages];
  const t0 = Date.now();
  let order = null;

  while (Date.now() - t0 < ms) {
    for (const p of list) {
      const b = p.locator('.scrim.show button.btn', { hasText: 'Lắc xí ngầu' }).first();
      if (await b.count().catch(() => 0)) await b.click({ timeout: 4000 }).catch(() => {});
    }
    const seen = await Promise.all(list.map(orderOf));
    if (seen.every(Array.isArray)) { order = seen[0]; break; }
    await list[0].waitForTimeout(250);
  }
  if (!order) return null;

  // Chốt thứ tự xong vẫn còn dòng thông báo chạy; chờ thanh nút hiện ra rồi
  // mới trả về, để bài kiểm thử bấm được ngay.
  for (const p of list) {
    await p.waitForFunction(
      () => document.querySelectorAll('#actions button').length > 0,
      null, { timeout: 20000 },
    ).catch(() => {});
  }

  if (normalize) {
    await list[0].evaluate(() => {
      const c = window.__monopoly.controller;
      c.state.setOrder(c.state.players.map((_, i) => i));
      c.sync();
      c.beginTurn();
    });
    await list[0].waitForTimeout(600);
  }
  return order;
}
