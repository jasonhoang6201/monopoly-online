/**
 * Hình học bàn cờ.
 *
 * Bàn cờ là hình vuông chia thành 12 đơn vị mỗi cạnh:
 *   góc = 1.5 đơn vị · 9 ô thường = 9 đơn vị · góc = 1.5 đơn vị
 * Mọi hàm nhận `S` (cạnh bàn cờ tính bằng px) nên dùng được cho cả
 * texture độ phân giải cao lẫn toạ độ màn hình.
 */

/** Cạnh của texture bàn cờ vẽ sẵn. */
export const TEX = 1600;

export const UNIT = (S) => S / 12;
/** Chiều sâu ô (cũng là cạnh ô góc). */
export const DEPTH = (S) => (S / 12) * 1.5;
/** Chiều rộng ô thường. */
export const EDGE = (S) => S / 12;

export const CORNERS = [0, 10, 20, 30];
export const isCorner = (id) => CORNERS.includes(id);

/** Cạnh của ô: 0 = dưới, 1 = trái, 2 = trên, 3 = phải. */
export function sideOf(id) {
  if (id <= 9) return 0;
  if (id <= 19) return 1;
  if (id <= 29) return 2;
  return 3;
}

/**
 * Tâm ô, tính theo hệ toạ độ có gốc ở góc trên-trái bàn cờ.
 * Ô 0 (BẮT ĐẦU) nằm ở góc dưới-phải, đi ngược chiều kim đồng hồ.
 */
export function tileCenter(id, S) {
  const d = DEPTH(S), e = EDGE(S);
  switch (sideOf(id)) {
    case 0: // hàng dưới, đi từ phải sang trái
      return id === 0
        ? { x: S - d / 2, y: S - d / 2 }
        : { x: S - d - (id - 0.5) * e, y: S - d / 2 };
    case 1: // cột trái, đi từ dưới lên
      return id === 10
        ? { x: d / 2, y: S - d / 2 }
        : { x: d / 2, y: S - d - (id - 10 - 0.5) * e };
    case 2: // hàng trên, đi từ trái sang phải
      return id === 20
        ? { x: d / 2, y: d / 2 }
        : { x: d + (id - 20 - 0.5) * e, y: d / 2 };
    default: // cột phải, đi từ trên xuống
      return id === 30
        ? { x: S - d / 2, y: d / 2 }
        : { x: S - d / 2, y: d + (id - 30 - 0.5) * e };
  }
}

/**
 * Góc xoay nội dung ô sao cho "phía trên" của ô luôn hướng vào giữa bàn cờ.
 * Trả về radian.
 */
export function tileAngle(id) {
  switch (id) {
    case 0:  return -Math.PI / 4;        // góc dưới-phải, chữ chéo vào trong
    case 10: return Math.PI / 4;         // góc dưới-trái
    case 20: return (Math.PI * 3) / 4;   // góc trên-trái
    case 30: return -(Math.PI * 3) / 4;  // góc trên-phải
    default:
      switch (sideOf(id)) {
        case 0: return 0;
        case 1: return Math.PI / 2;
        case 2: return Math.PI;
        default: return -Math.PI / 2;
      }
  }
}

/** Kích thước ô ở hệ toạ độ cục bộ (trước khi xoay). */
export function tileSize(id, S) {
  const d = DEPTH(S), e = EDGE(S);
  return isCorner(id) ? { w: d, h: d } : { w: e, h: d };
}

/** Lưới đặt quân: 3 cột × 2 hàng — đủ chỗ cho cả sáu người chơi. */
export const SLOT_COLS = 3;
export const MAX_SLOTS = 6;

/**
 * Vị trí đặt quân cờ trên ô — dàn thành lưới nhỏ để các quân không chồng nhau.
 * `slot` 0..5, trả về offset đã xoay theo hướng ô.
 */
export function tokenSpot(id, slot, S) {
  const c = tileCenter(id, S);
  const { w, h } = tileSize(id, S);
  const i = ((slot % MAX_SLOTS) + MAX_SLOTS) % MAX_SLOTS;
  // Cột chạy -1 · 0 · 1 quanh trục ô, hàng 0 ở phía ngoài
  const col = (i % SLOT_COLS) - (SLOT_COLS - 1) / 2;
  const row = (i / SLOT_COLS) | 0;

  if (isCorner(id)) {
    // Ô góc: lưới thẳng trục màn hình, đẩy về phía góc ngoài
    // để không đè lên chữ (chữ ở góc được dồn vào phía trong).
    const out = { 0: [1, 1], 10: [-1, 1], 20: [-1, -1], 30: [1, -1] }[id];
    const k = 0.7071; // chuẩn hoá đường chéo
    return {
      x: c.x + out[0] * k * w * 0.13 + col * w * 0.25,
      y: c.y + out[1] * k * h * 0.13 + (row - 0.5) * h * 0.26,
    };
  }

  // Ô thường: dồn về nửa ngoài của ô, xoay theo hướng ô.
  const a = tileAngle(id);
  const lx = col * w * 0.33;
  const ly = h * 0.20 + (row - 0.5) * h * 0.26;
  const cos = Math.cos(a), sin = Math.sin(a);
  return { x: c.x + lx * cos - ly * sin, y: c.y + lx * sin + ly * cos };
}

/**
 * Một điểm trên trục dọc của ô, đo từ MÉP TRONG — cạnh quay vào lòng bàn cờ,
 * cũng là nơi in dải màu nhóm đất. `out` dương là đi tiếp vào lòng bàn cờ,
 * `out` âm là lùi vào trong lòng ô.
 *
 * Dùng cho vệt sáng báo đất có nhà và cho bảng nhà nổi lên lúc rê chuột.
 */
export function tileEdgePoint(id, S, out = 0) {
  const c = tileCenter(id, S);
  const { h } = tileSize(id, S);
  const a = tileAngle(id);
  const ly = -h / 2 - out;                 // trục Y cục bộ hướng ra ngoài bàn cờ
  return { x: c.x - ly * Math.sin(a), y: c.y + ly * Math.cos(a), angle: a };
}

/** Ô vuông trong lòng bàn cờ (vùng trống ở giữa). */
export function innerRect(S) {
  const d = DEPTH(S);
  return { x: d, y: d, size: S - 2 * d };
}
