/**
 * Trả lời bảng "chọn một ô đất" — nay là bảng chọn **trên bàn cờ**
 * (`src/ui/tilePicker.js`), không còn là danh sách trong hộp thoại.
 *
 * Ô nằm trên canvas Phaser nên bài kiểm không bấm được bằng toạ độ chuột cho
 * chắc tay; gọi thẳng `scene.onTileClick` đúng như cú bấm của người chơi, rồi
 * bấm nút chốt ở hộp xác nhận.
 */

/** Các ô đang sáng, tức là chọn được. Rỗng khi không có phiên chọn nào. */
export const markedTiles = (page) => page.evaluate(
  () => [...(window.__monopoly.scene.markSet ?? [])],
);

/** Bảng chọn ô có đang mở không? */
export const picking = (page) => page.locator('.tile-pick').count().then((n) => n > 0);

/**
 * Chọn một ô rồi chốt ở hộp xác nhận.
 * @param {number} [id] ô muốn chọn; bỏ trống thì lấy ô sáng đầu tiên.
 * @returns {Promise<number>} ô đã chốt
 */
export async function pickOnBoard(page, id = null) {
  await page.locator('.tile-pick').first().waitFor({ state: 'visible', timeout: 15000 });
  const tile = id ?? (await markedTiles(page))[0];
  /* Bọc trong khối lệnh để không trả promise về: `onTileClick` là hàm async,
     nó chỉ kết thúc sau khi hộp xác nhận đóng — mà hộp ấy do chính bài kiểm
     bấm ở dòng dưới. Trả promise ra thì `evaluate` ngồi chờ chính mình. */
  // Bảng chọn nhanh (kỹ năng Nhà Du Hành) chốt ngay khi bấm ô, không có hộp xác nhận
  const quick = await page.locator('.tile-pick[data-quick]').count();
  await page.evaluate((t) => { window.__monopoly.scene.onTileClick(t); }, tile);
  await page.waitForTimeout(400);
  if (quick) return tile;
  await page.locator('.scrim.show .modal-foot button.btn').first().click({ timeout: 10000 });
  await page.waitForTimeout(400);
  return tile;
}

/**
 * Bấm thật (chuột) vào một viên xí ngầu trên canvas — Xí Ngầu Gian chọn viên
 * lắc lại. Khác ô cờ, viên xí ngầu đi qua `dieAt` trong `pointerdown`, nên bấm
 * bằng toạ độ mới thử đúng đường người chơi đi.
 * @param {0|1} i viên trái / viên phải
 */
export async function clickDie(page, i, { tap = false } = {}) {
  const at = await page.evaluate((k) => {
    const sc = window.__monopoly.scene;
    const cv = sc.game.canvas;
    const r = cv.getBoundingClientRect();
    const h = sc.diceHome[k];
    return { x: r.left + h.x * (r.width / cv.width), y: r.top + h.y * (r.height / cv.height) };
  }, i);
  if (tap) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
}

/** Hai viên xí ngầu có đang sáng vòng, bấm được không? */
export const dicePickable = (page) => page.evaluate(() => !!window.__monopoly.scene.dicePick);
