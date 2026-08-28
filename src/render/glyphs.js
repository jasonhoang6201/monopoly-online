/**
 * Ký hiệu nhà & khách sạn — một nguồn duy nhất cho cả hai nơi dùng tới:
 * nhúng thẳng vào HTML (bảng quản lý tài sản, thẻ đất, bảng xem nhanh) và
 * vẽ ra canvas bằng `Path2D` (bảng nhà nổi lên khi rê chuột trên bàn cờ).
 *
 * Đường vẽ lấy từ bộ icon mã nguồn mở **Phosphor Icons** (giấy phép MIT) —
 * `fill/house-fill` và `fill/building-apartment-fill`. Bản gốc giữ ở
 * `assets/icons/`, kèm giấy phép. Hình vẽ thật thay cho ký tự ⌂ / ★ trước đây:
 * ⌂ tuỳ từng máy mà ra một dáng khác nhau, có máy còn không có sẵn.
 */

/** Khung toạ độ gốc của hai đường vẽ — cả hai đều 256 × 256. */
export const GLYPH_BOX = 256;

/** Nhà: mái dốc, thân vuông, khoét cửa ở chân. */
export const HOUSE_PATH = 'M224,120v96a8,8,0,0,1-8,8H160a8,8,0,0,1-8-8V164a4,4,0,0,0-4-4H108a4,4,0,0,0-4,4v52a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V120a16,16,0,0,1,4.69-11.31l80-80a16,16,0,0,1,22.62,0l80,80A16,16,0,0,1,224,120Z';

/** Khách sạn: khối nhà cao tầng có ô cửa sổ và cổng lớn. */
export const HOTEL_PATH = 'M240,208h-8V72a8,8,0,0,0-8-8H184V40a8,8,0,0,0-8-8H80a8,8,0,0,0-8,8V96H32a8,8,0,0,0-8,8V208H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16ZM80,176H64a8,8,0,0,1,0-16H80a8,8,0,0,1,0,16Zm0-32H64a8,8,0,0,1,0-16H80a8,8,0,0,1,0,16Zm64,64H112V168h32Zm-8-64H120a8,8,0,0,1,0-16h16a8,8,0,0,1,0,16Zm0-32H120a8,8,0,0,1,0-16h16a8,8,0,0,1,0,16Zm0-32H120a8,8,0,0,1,0-16h16a8,8,0,0,1,0,16Zm56,96H176a8,8,0,0,1,0-16h16a8,8,0,0,1,0,16Zm0-32H176a8,8,0,0,1,0-16h16a8,8,0,0,1,0,16Zm0-32H176a8,8,0,0,1,0-16h16a8,8,0,0,1,0,16Z';

/** Ngân hàng — nút thế chấp. */
export const BANK_PATH = 'M248,208a8,8,0,0,1-8,8H16a8,8,0,0,1,0-16H240A8,8,0,0,1,248,208ZM16.3,98.18a8,8,0,0,1,3.51-9l104-64a8,8,0,0,1,8.38,0l104,64A8,8,0,0,1,232,104H208v64h16a8,8,0,0,1,0,16H32a8,8,0,0,1,0-16H48V104H24A8,8,0,0,1,16.3,98.18ZM144,160a8,8,0,0,0,16,0V112a8,8,0,0,0-16,0Zm-48,0a8,8,0,0,0,16,0V112a8,8,0,0,0-16,0Z';

/** Chìa khoá — nút chuộc lại đất đang thế chấp. */
export const KEY_PATH = 'M216.57,39.43A80,80,0,0,0,83.91,120.78L28.69,176A15.86,15.86,0,0,0,24,187.31V216a16,16,0,0,0,16,16H72a8,8,0,0,0,8-8V208H96a8,8,0,0,0,8-8V184h16a8,8,0,0,0,5.66-2.34l9.56-9.57A79.73,79.73,0,0,0,160,176h.1A80,80,0,0,0,216.57,39.43ZM180,92a16,16,0,1,1,16-16A16,16,0,0,1,180,92Z';

/* ==================================================================
   Bản HTML — dùng `currentColor` để nơi nào gọi thì nơi ấy định màu
   ================================================================== */

const svg = (d, cls) => `<svg class="gi ${cls}" viewBox="0 0 ${GLYPH_BOX} ${GLYPH_BOX}"
    xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;

export const houseSvg = () => svg(HOUSE_PATH, 'gi-house');
export const hotelSvg = () => svg(HOTEL_PATH, 'gi-hotel');
export const bankSvg = () => svg(BANK_PATH, 'gi-bank');
export const keySvg = () => svg(KEY_PATH, 'gi-key');

/**
 * Dãy ký hiệu cho mức xây dựng của một ô: 1…4 là bấy nhiêu căn nhà,
 * 5 là khách sạn. Trả về chuỗi rỗng khi ô còn trống.
 */
export function buildGlyphs(houses) {
  if (!houses) return '';
  if (houses === 5) return `<span class="gi-row is-hotel">${hotelSvg()}</span>`;
  return `<span class="gi-row">${houseSvg().repeat(houses)}</span>`;
}

/** Nhãn chữ đi kèm — "3 nhà" / "Khách sạn". */
export const buildLabel = (houses) => (houses === 5 ? 'Khách sạn' : `${houses} nhà`);

/* ==================================================================
   Bản canvas — vẽ icon thành texture cho Phaser
   ================================================================== */

/**
 * Vẽ một icon vào giữa khung `s × s`, có đổ bóng và vành sáng để khối
 * không bị bẹt khi nằm trên nền sơn mài tối.
 *
 * @param {string} d      đường vẽ (hệ toạ độ 256 × 256)
 * @param {number} s      cạnh khung vẽ
 * @param {object} o
 * @param {string} o.top    màu đỉnh khối
 * @param {string} o.bottom màu chân khối
 * @param {string} o.rim    màu vành ngoài
 */
export function paintGlyph(d, s = 128, o = {}) {
  const cv = document.createElement('canvas');
  cv.width = s; cv.height = s;
  const ctx = cv.getContext('2d');

  // Chừa lề cho vành và bóng khỏi bị cắt cụt ở mép khung
  const pad = s * 0.10;
  const k = (s - pad * 2) / GLYPH_BOX;
  ctx.translate(pad, pad);
  ctx.scale(k, k);

  const path = new Path2D(d);

  // Bóng đổ xuống dưới — khối nổi hẳn khỏi mặt bàn
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = GLYPH_BOX * 0.09;
  ctx.shadowOffsetY = GLYPH_BOX * 0.05;
  ctx.fillStyle = o.bottom ?? '#2E6B52';
  ctx.fill(path);
  ctx.restore();

  // Thân khối: sáng ở đỉnh, trầm ở chân
  const g = ctx.createLinearGradient(0, 0, 0, GLYPH_BOX);
  g.addColorStop(0, o.top ?? '#6FBF98');
  g.addColorStop(0.55, o.bottom ?? '#2E6B52');
  g.addColorStop(1, o.rim ?? '#1D4436');
  ctx.fillStyle = g;
  ctx.fill(path);

  // Vành ngoài mảnh cho nét tách khỏi nền
  ctx.lineWidth = GLYPH_BOX * 0.035;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = o.rim ?? '#122E24';
  ctx.stroke(path);

  return cv;
}

/** Căn nhà — ngọc bích, tông nhà ngói cũ. */
export const paintHouseGlyph = (s = 128) => paintGlyph(HOUSE_PATH, s, {
  top: '#7ED0A6', bottom: '#2E6B52', rim: '#10281F',
});

/** Khách sạn — sơn son thếp vàng, hạng trên hẳn căn nhà. */
export const paintHotelGlyph = (s = 128) => paintGlyph(HOTEL_PATH, s, {
  top: '#F6DFA2', bottom: '#C8A048', rim: '#4A3410',
});

/**
 * Vệt sáng nằm trên mép trong của ô — "ngọn đèn" báo đất đã có nhà.
 * Đậm nhất ở chính giữa rồi loang đều về hai phía, nên khi dán trùng lên
 * mép ô thì nửa hắt vào mặt ô, nửa loang ra lòng bàn cờ.
 *
 * Vẽ bằng màu trắng để Phaser nhuộm lại theo màu người chơi (`setTint`).
 */
export function paintEdgeGlow(w = 256, h = 128) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');

  // Loang theo chiều dày
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0.00, 'rgba(255,255,255,0)');
  g.addColorStop(0.30, 'rgba(255,255,255,.14)');
  g.addColorStop(0.42, 'rgba(255,255,255,.52)');
  g.addColorStop(0.50, 'rgba(255,255,255,.92)');
  g.addColorStop(0.58, 'rgba(255,255,255,.52)');
  g.addColorStop(0.70, 'rgba(255,255,255,.14)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Vuốt mờ hai đầu để vệt sáng không cắt ngang bằng một nhát vuông
  const f = ctx.createLinearGradient(0, 0, w, 0);
  f.addColorStop(0.00, 'rgba(0,0,0,1)');
  f.addColorStop(0.16, 'rgba(0,0,0,0)');
  f.addColorStop(0.84, 'rgba(0,0,0,0)');
  f.addColorStop(1.00, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = f;
  ctx.fillRect(0, 0, w, h);

  return cv;
}

/**
 * Chỗ đặt "gốc đèn" trong ảnh `paintEdgeSpill` — phần trên gốc là chút sáng
 * hắt ngược lên mặt ô, phần dưới là vệt loang ra lòng bàn cờ.
 */
export const SPILL_ROOT = 0.12;

/**
 * Ánh đèn hắt ra từ **chân ô đất**: sáng nhất ngay sát mép ô rồi mờ dần một
 * chiều về phía lòng bàn cờ — đúng kiểu đèn giấu dưới gờ, chứ không phải một
 * vệt sáng đối xứng nằm đè lên mép.
 *
 * Vẽ bằng màu trắng để Phaser nhuộm lại theo màu người chơi (`setTint`).
 */
export function paintEdgeSpill(w = 256, h = 256) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0.00, 'rgba(255,255,255,0)');
  g.addColorStop(SPILL_ROOT * 0.5, 'rgba(255,255,255,.42)');
  g.addColorStop(SPILL_ROOT, 'rgba(255,255,255,1)');      // gốc đèn — chỗ sáng nhất
  g.addColorStop(0.24, 'rgba(255,255,255,.60)');
  g.addColorStop(0.40, 'rgba(255,255,255,.30)');
  g.addColorStop(0.62, 'rgba(255,255,255,.12)');
  g.addColorStop(0.82, 'rgba(255,255,255,.03)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  /* Vuốt mờ hai đầu, và vuốt mạnh tay dần theo chiều loang: càng xa gốc thì
     vệt sáng càng phải xoè ra, giữ nguyên bề ngang sẽ thành một thanh chữ
     nhật cứng đờ chứ không ra ánh đèn. */
  ctx.globalCompositeOperation = 'destination-out';
  const rows = 72;
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    const k = 0.15 + Math.max(0, t - SPILL_ROOT) * 0.40;   // bề rộng vùng vuốt
    const f = ctx.createLinearGradient(0, 0, w, 0);
    f.addColorStop(0.00, 'rgba(0,0,0,1)');
    f.addColorStop(k, 'rgba(0,0,0,0)');
    f.addColorStop(1 - k, 'rgba(0,0,0,0)');
    f.addColorStop(1.00, 'rgba(0,0,0,1)');
    ctx.fillStyle = f;
    ctx.fillRect(0, (t * h) - 1, w, (h / rows) + 2);
  }

  return cv;
}
