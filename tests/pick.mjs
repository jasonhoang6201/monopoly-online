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
  await page.evaluate((t) => { window.__monopoly.scene.onTileClick(t); }, tile);
  await page.waitForTimeout(400);
  await page.locator('.scrim.show .modal-foot button.btn').first().click({ timeout: 10000 });
  await page.waitForTimeout(400);
  return tile;
}
