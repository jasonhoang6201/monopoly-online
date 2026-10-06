/**
 * Đồ vật Halloween vẽ bằng canvas: bí ngô, đầu lâu, vạc phù thuỷ, bàn tay
 * xác sống, cổng nghĩa địa, bia mộ, dơi, mạng nhện, phù thuỷ cưỡi chổi, nhà
 * ma, lâu đài ma — và bộ xương biết đi dùng làm quân cờ.
 *
 * Biểu tượng khai theo đúng khuôn `xmasArt.js`: mỗi hình là danh sách lớp
 * `[đường SVG, màu tô, (màu viền, nét)]` trong khung 64 × 64, đọc qua `Path2D`.
 * Đường vẽ lấy từ trang concept Jason đã chốt, nên hình trên bàn khớp hình
 * trong trang ấy.
 *
 * Bộ xương thì không vẽ sẵn được bằng một đường: tay chân đổi góc theo pha
 * bước, nên vẽ bằng nét (`drawSkeleton`) và quân cờ dựng vài khung hình từ đó.
 */

const BONE = '#ECE6D6';
const BONE_SHADE = '#CFC6B2';
const NIGHT = '#120B1D';
const VIOLET = '#3A2360';
const VIOLET_DEEP = '#2C1A47';
const PUMPKIN = '#E8742A';
const PUMPKIN_DEEP = '#B84C16';
const OOZE = '#7FB539';
const GLOW = '#FFD27A';

/** Hình elip dạng đường SVG — `Path2D` không có lệnh elip riêng. */
const E = (cx, cy, rx, ry = rx) =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0z`;

/** Mặt khắc của bí ngô: hai mắt tam giác và cái miệng răng cưa. */
const PUMPKIN_FACE = 'M22 32l6-8 4 8zM34 32l4-8 6 8zM18 42q14 13 28 0l-4 1-3 4-3-3-4 4-4-4-3 3-3-4z';

const SKULL = 'M32 8c-13 0-21 9-21 21 0 7 3 12 8 15v8h26v-8c5-3 8-8 8-15 0-12-8-21-21-21z';

export const HALLOWEEN_ICONS = {
  /* Bí ngô tắt: mặt khắc tối. Bản sáng (`pumpkinLit`) chỉ khác màu mặt. */
  pumpkin: [
    ['M30 14c0-5 3-8 7-9l1 3c-3 1-4 3-4 6z', '#4E6B2A'],
    [E(20, 38, 14, 18), PUMPKIN_DEEP], [E(44, 38, 14, 18), PUMPKIN_DEEP],
    [E(32, 38, 14, 20), PUMPKIN],
    ['M32 18q-3 20 0 40', null, 'rgba(120,40,8,.45)', 1.4],
    [PUMPKIN_FACE, '#3B1A0C'],
  ],
  pumpkinLit: [
    ['M30 14c0-5 3-8 7-9l1 3c-3 1-4 3-4 6z', '#4E6B2A'],
    [E(20, 38, 14, 18), '#C85A1C'], [E(44, 38, 14, 18), '#C85A1C'],
    [E(32, 38, 14, 20), '#F58A3A'],
    ['M32 18q-3 20 0 40', null, 'rgba(120,40,8,.4)', 1.4],
    [PUMPKIN_FACE, GLOW, '#FFF3C4', 0.8],
  ],
  skull: [
    [SKULL, BONE],
    [E(24, 30, 6), NIGHT], [E(40, 30, 6), NIGHT],
    ['M32 36l-3 6h6z', NIGHT],
    ['M26 52v-6M30.5 52v-6M35 52v-6M39.5 52v-6', null, NIGHT, 2],
  ],
  /* Khám Lớn: đầu lâu sau song sắt */
  jail: [
    ['M8 8h48v50H8z', 'rgba(14,10,22,.55)'],
    ['M32 14c-9 0-14 6-14 14 0 5 2 8 5 10v5h18v-5c3-2 5-5 5-10 0-8-5-14-14-14z', BONE],
    [E(27, 29, 4), NIGHT], [E(37, 29, 4), NIGHT], ['M32 33l-2 4h4z', NIGHT],
    ['M8 8h48v50H8z', null, '#8C7BA8', 2.5],
    ['M18 8v50M28 8v50M38 8v50M48 8v50', null, '#8C7BA8', 2.5],
  ],
  /* Bến Đậu: vạc phù thuỷ sôi */
  cauldron: [
    ['M22 60q4-8 10-2 6-6 10 2z', PUMPKIN],
    ['M14 58l4-7M50 58l-4-7', null, '#1A1326', 3],
    ['M12 30c0 15 8 24 20 24s20-9 20-24z', '#1A1326', '#8C6BC0', 1.5],
    [E(32, 30, 21, 5), OOZE],
    [E(26, 23, 3), '#9AD14E'], [E(37, 19, 2.2), '#9AD14E'], [E(33, 12, 1.5), '#9AD14E'],
  ],
  /* Vào Tù: bàn tay xác sống trồi lên khỏi đất */
  hand: [
    ['M26 56V40l-6-11 3-2 5 8V18h3.5v16V14h3.5v20V16h3.5v18l3-8 3 1-4 14v15z', OOZE, '#4E7A22', 1],
    ['M29 44h7', null, '#4E7A22', 1.2],
    ['M6 58q8-8 16-2 10-8 20 0 8-6 16 2z', '#3B2A22'],
  ],
  /* Bắt Đầu: cổng sắt nghĩa địa, mũi tên cam chỉ chiều đi */
  gate: [
    ['M8 58h48', null, '#2B2236', 4],
    ['M12 58V22M52 58V22', null, '#7A6C92', 5],
    ['M12 24Q32 6 52 24', null, '#7A6C92', 3],
    ['M20 58V18M26 58V14M32 58V12M38 58V14M44 58V18', null, '#9A8BB2', 2],
    ['M20 18l-1.5-4h3zM26 14l-1.5-4h3zM32 12l-1.5-4h3zM38 14l-1.5-4h3zM44 18l-1.5-4h3z', '#9A8BB2'],
    ['M14 40h36', null, '#9A8BB2', 2],
    ['M40 47h-16m5-5-5 5 5 5', null, PUMPKIN, 2.8],
  ],
  moon: [
    [E(32, 32, 22), '#F3E9C6'],
    [E(24, 26, 4), '#DDD0A6'], [E(38, 38, 6), '#DDD0A6'], [E(40, 22, 2.5), '#DDD0A6'],
  ],
  tomb: [
    ['M16 58V26c0-10 7-16 16-16s16 6 16 16v32z', '#544A66'],
    ['M16 58V26c0-10 7-16 16-16v48z', '#615676'],
    ['M8 57h48v5H8z', '#2B2236'],
    ['M38 18l-3 7 4 4-2 6', null, '#2B2236', 1.4],
  ],
  cross: [
    ['M28 10h8v48h-8zM18 22h28v7H18z', '#544A66'],
    ['M28 10h4v48h-4zM18 22h14v3H18z', '#615676'],
    ['M14 57h36v5H14z', '#2B2236'],
  ],
  bat: [
    ['M28 30C22 21 12 21 3 26c4 2 6 6 6 10 3-3 7-3 9 0 2-3 6-3 10-2zM36 30c6-9 16-9 25-4-4 2-6 6-6 10-3-3-7-3-9 0-2-3-6-3-10-2z', '#0B0712', '#8C6BC0', 1],
    ['M32 25c-4 0-5 3-5 7s2 6 5 6 5-2 5-6-1-7-5-7z', '#0B0712', '#8C6BC0', 1],
    ['M28.5 27l1-5 2.5 3 2.5-3 1 5z', '#0B0712'],
    [E(30, 30.5, 1.1), '#FFB347'], [E(34, 30.5, 1.1), '#FFB347'],
  ],
  zombie: [
    ['M22 44h20l3 18H19z', '#4A3C5E'],
    ['M16 18c0-6 6-10 16-10s16 4 16 10v22c0 10-7 16-16 16s-16-6-16-16z', OOZE],
    ['M16 21c4-9 10-13 16-13s13 3 16 10l-6-3-4 4-4-5-5 4-4-3-5 4z', '#2E3B1A'],
    [E(25, 32, 5), BONE], [E(25, 32, 2), NIGHT], [E(40, 33, 3.2), BONE], [E(40, 33, 1.4), NIGHT],
    ['M24 46h16', null, '#2E3B1A', 2.4],
    ['M27 44v4M32 44v4M37 44v4', null, '#2E3B1A', 1.4],
  ],
  /* Phù thuỷ cưỡi chổi, bay sang phải */
  witch: [
    ['M4 44L46 36', null, '#7A4B2A', 2.6],
    ['M4 44l-4 -6l2 9l-1 6l6-5l6 1z', '#C79A4A', '#7A4B2A', 0.8],
    ['M20 42q4-14 14-20l8 16q-8 6-22 4z', VIOLET_DEEP],
    ['M24 40l-6 10M28 40l-2 12', null, VIOLET_DEEP, 2],
    ['M33 24q-6 6-14 4', null, VIOLET_DEEP, 3],
    [E(37, 19, 5), OOZE],
    ['M41 19l5 2-5 1z', '#5E8C27'],
    ['M29 15h17v3H29z', VIOLET_DEEP],
    ['M31 15l4-13 7 13z', VIOLET],
    ['M32 13h9v2h-9z', PUMPKIN],
  ],
  candle: [
    ['M32 10c5 6 6 11 0 17-6-6-5-11 0-17z', '#FFB347'],
    ['M32 16c2 3 2 6 0 9-2-3-2-6 0-9z', '#FFF3C4'],
    ['M25 30h14v26H25z', BONE],
    ['M18 56h28v4H18z', '#2B2236'],
  ],
};

const pathCache = new Map();
function path(d) {
  if (!pathCache.has(d)) pathCache.set(d, new Path2D(d));
  return pathCache.get(d);
}

/** Vẽ một đồ vật, tâm tại (cx, cy), cạnh `size`. `o.flip` lật ngang. */
export function drawHalloweenIcon(ctx, name, cx, cy, size, o = {}) {
  const layers = HALLOWEEN_ICONS[name];
  if (!layers) return;
  const k = size / 64;
  ctx.save();
  ctx.translate(cx, cy);
  if (o.rot) ctx.rotate(o.rot);
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  ctx.scale(o.flip ? -k : k, o.flipY ? -k : k);
  ctx.translate(-32, -32);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [d, fill, stroke, width] of layers) {
    const p = path(d);
    if (fill) { ctx.fillStyle = fill; ctx.fill(p); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width ?? 1; ctx.stroke(p); }
  }
  ctx.restore();
}

/** Một biểu tượng vẽ sẵn ra canvas riêng — Phaser dùng làm texture. */
export function paintHalloweenIcon(name, s = 128, o = {}) {
  const cv = document.createElement('canvas');
  cv.width = s; cv.height = s;
  drawHalloweenIcon(cv.getContext('2d'), name, s / 2, s / 2, s, o);
  return cv;
}

/* ------------------------------------------------------------- mạng nhện */

/**
 * Mạng nhện góc: tâm ở (x, y), toả một góc vuông bắt đầu từ `a0` (radian),
 * bán kính `r`. Sáu sợi toả, năm vòng võng vào phía góc như mạng thật.
 */
export function drawWebCorner(ctx, x, y, r, a0, color = 'rgba(217,207,234,.75)', lw = 1) {
  const spokes = 6, rings = 5;
  const ang = Array.from({ length: spokes }, (_, i) => a0 + (i / (spokes - 1)) * (Math.PI / 2));
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const a of ang) { ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  for (let k = 1; k <= rings; k++) {
    const rr = (k / rings) * r * 0.92;
    for (let i = 0; i < spokes - 1; i++) {
      const p0 = ang[i], p1 = ang[i + 1], pm = (p0 + p1) / 2;
      ctx.moveTo(x + Math.cos(p0) * rr, y + Math.sin(p0) * rr);
      ctx.quadraticCurveTo(x + Math.cos(pm) * rr * 0.86, y + Math.sin(pm) * rr * 0.86,
        x + Math.cos(p1) * rr, y + Math.sin(p1) * rr);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** Mạng nhện góc trên-trái trên canvas vuông `s` — texture cho ô thế chấp. */
export function paintWebCorner(s = 128) {
  const cv = document.createElement('canvas');
  cv.width = s; cv.height = s;
  // Nét dày theo cỡ texture: ảnh này thu xuống còn chừng 20 điểm ảnh trên bàn,
  // nét mảnh hơn s/30 thì tan mất
  const g = cv.getContext('2d');
  // Viền tối dưới nét trắng: mạng nhện nằm trên mái cổng nhiều hoa văn, thiếu
  // viền thì nét trắng lẫn vào nét cổng
  drawWebCorner(g, 2, 2, s - 4, 0, 'rgba(14,10,22,.7)', Math.max(2, s / 14));
  drawWebCorner(g, 2, 2, s - 4, 0, 'rgba(244,240,252,1)', Math.max(1, s / 26));
  return cv;
}

/* ----------------------------------------------------------- bộ xương */

/**
 * Vẽ một bộ xương đứng trên mặt đất tại (x, y), cao `s`.
 *
 * @param {object} o
 *   `phase` pha bước chân (radian), `stand` đứng yên hai chân thẳng,
 *   `dir` 1 nhìn sang phải, -1 sang trái, `hat` màu mũ phù thuỷ (null là đầu
 *   trần), `band` màu dải mũ, `bow` 0…1 cúi chào (gập người ra trước),
 *   `down` 0…1 ngã nằm, `lw` hệ số nét, `pose` tư thế khớp cho điệu nhảy
 *   (xem `src/render/dance.js`) — có `pose` thì bỏ qua `phase`/`stand`/`bow`.
 */
export function drawSkeleton(g, x, y, s, o = {}) {
  const phase = o.phase ?? 0;
  const dir = o.dir ?? 1;
  const down = o.down ?? 0;
  const bow = o.bow ?? 0;
  g.save();
  g.translate(x, y);
  if (down) g.rotate(-dir * down * Math.PI / 2);
  g.scale(dir, 1);
  const P = o.pose;
  const hip = [0, -s * 0.46];
  // Chân: đùi lệch `a` khỏi phương thẳng đứng (dương là ra trước), cẳng gập
  // thêm `kb` ở gối; `toe` là kiễng — bàn chân chúc mũi xuống đất thay vì nằm ngang
  const legPts = (a, kb, toe) => {
    const k = [hip[0] + Math.sin(a) * s * 0.23, hip[1] + Math.cos(a) * s * 0.23];
    const f = [k[0] + Math.sin(a - kb) * s * 0.23, k[1] + Math.cos(a - kb) * s * 0.23];
    const t = toe ? [f[0] + s * 0.04, f[1] + s * 0.045] : [f[0] + s * 0.06, f[1]];
    return [k, f, t];
  };
  if (P?.lean) g.rotate(P.lean);
  // Có tư thế thì hạ cả người cho điểm thấp nhất của hai chân chạm đất —
  // gối gập hay kiễng đều làm hông cao thấp khác nhau
  const bob = P ? -Math.max(...P.legs.map((l) => legPts(...l)[2][1]))
    : o.stand || down ? 0 : -Math.abs(Math.sin(phase)) * s * 0.025;
  g.translate(0, bob);
  g.strokeStyle = BONE; g.fillStyle = BONE;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = Math.max(1.2, s * 0.042 * (o.lw ?? 1));

  const leg = (p, side) => {
    let a, kb, toe = false;
    if (P) [a, kb, toe] = P.legs[side < 0 ? 0 : 1];
    else if (o.stand) { a = side * 0.09; kb = 0; }
    else { a = Math.sin(p) * 0.55; kb = Math.max(0, -Math.cos(p)) * 0.7; }
    const [k, f, t] = legPts(a, kb, toe);
    g.beginPath(); g.moveTo(...hip); g.lineTo(...k); g.lineTo(...f); g.lineTo(...t); g.stroke();
  };

  // Hai chân và chậu đứng yên; nửa trên gập quanh hông khi cúi chào
  g.globalAlpha = 0.8; leg(phase + Math.PI, -1); g.globalAlpha = 1;
  g.beginPath(); g.ellipse(hip[0], hip[1], s * 0.075, s * 0.04, 0, 0, Math.PI * 2); g.fill();
  leg(phase, 1);

  g.save();
  g.translate(...hip);
  g.rotate(bow * 1.05);
  g.translate(-hip[0], -hip[1]);
  const sh = [s * 0.03, -s * 0.78];
  const arm = (p, side, back) => {
    let a, eb;
    if (P) [a, eb] = P.arms[back ? 0 : 1];
    else if (bow) {
      // Cúi chào: tay trước vắt ngang bụng, tay sau duỗi ra sau
      a = back ? 0.9 : -0.2; eb = back ? 0.2 : -1.4;
    } else if (o.stand) { a = side * 0.12; eb = 0.25; }
    else { a = -Math.sin(p) * 0.6; eb = 0.35 + Math.max(0, Math.sin(p)) * 0.4; }
    const e = [sh[0] + Math.sin(a) * s * 0.17, sh[1] + Math.cos(a) * s * 0.17];
    const h = [e[0] + Math.sin(a + eb) * s * 0.16, e[1] + Math.cos(a + eb) * s * 0.16];
    g.beginPath(); g.moveTo(...sh); g.lineTo(...e); g.lineTo(...h); g.stroke();
  };
  g.globalAlpha = 0.8; arm(phase + Math.PI, -1, true); g.globalAlpha = 1;
  g.beginPath(); g.moveTo(...hip); g.lineTo(...sh); g.stroke();                       // cột sống
  for (let r = 0; r < 3; r++) {                                                        // xương sườn
    const yy = sh[1] + s * (0.06 + r * 0.055), w = s * (0.1 - r * 0.012);
    g.beginPath(); g.moveTo(-w, yy + s * 0.02); g.quadraticCurveTo(0, yy - s * 0.025, w, yy + s * 0.02); g.stroke();
  }
  arm(phase, 1, false);

  // Đầu lâu (cùng mũ) nghiêng quanh cổ; âm là ngửa lên
  if (P?.tilt) { g.translate(...sh); g.rotate(P.tilt); g.translate(-sh[0], -sh[1]); }
  const hx = sh[0] + s * 0.03, hy = sh[1] - s * 0.13, hr = s * 0.1;
  g.beginPath(); g.arc(hx, hy, hr, 0, Math.PI * 2); g.fill();
  g.fillRect(hx - hr * 0.55, hy + hr * 0.5, hr * 1.1, hr * 0.55);
  g.fillStyle = BONE_SHADE;
  g.fillRect(hx - hr * 0.55, hy + hr * 0.9, hr * 1.1, hr * 0.15);
  g.fillStyle = NIGHT;
  g.beginPath(); g.arc(hx + hr * 0.38, hy - hr * 0.05, hr * 0.27, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(hx - hr * 0.12, hy - hr * 0.05, hr * 0.24, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(hx + hr * 0.18, hy + hr * 0.25); g.lineTo(hx + hr * 0.08, hy + hr * 0.45); g.lineTo(hx + hr * 0.28, hy + hr * 0.45); g.fill();

  if (o.hat) {
    // Mũ phù thuỷ: vành rộng, chóp gập về sau, cả mũ mang màu người chơi
    const dark = o.band ?? VIOLET_DEEP;
    g.fillStyle = dark;
    g.beginPath(); g.ellipse(hx, hy - hr * 0.8, hr * 1.65, hr * 0.32, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = o.hat;
    g.beginPath();
    g.moveTo(hx - hr * 0.95, hy - hr * 0.85);
    g.lineTo(hx + hr * 0.95, hy - hr * 0.85);
    g.quadraticCurveTo(hx + hr * 0.5, hy - hr * 2.0, hx - hr * 0.2, hy - hr * 2.5);
    g.quadraticCurveTo(hx - hr * 0.9, hy - hr * 2.9, hx - hr * 1.3, hy - hr * 2.35);
    g.quadraticCurveTo(hx - hr * 0.6, hy - hr * 2.15, hx - hr * 0.95, hy - hr * 0.85);
    g.closePath(); g.fill();
    g.fillStyle = dark;
    g.fillRect(hx - hr * 0.95, hy - hr * 1.22, hr * 1.9, hr * 0.34);
    g.fillStyle = PUMPKIN;
    g.fillRect(hx - hr * 0.22, hy - hr * 1.2, hr * 0.44, hr * 0.3);
  }
  g.restore();
  g.restore();
}

/* ---------------------------------------------------------------- dơi */

/** Dơi đang vỗ cánh, tâm (x, y), sải `s` mỗi bên. `flap` là pha cánh (radian). */
export function drawBat(g, x, y, s, flap, color = '#07040C') {
  const w = Math.sin(flap) * s * 0.5;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x - s * 0.5, y - w - s * 0.2, x - s, y - w);
  g.quadraticCurveTo(x - s * 0.7, y - w * 0.4 + s * 0.15, x - s * 0.35, y + s * 0.12);
  g.quadraticCurveTo(x, y + s * 0.05, x + s * 0.35, y + s * 0.12);
  g.quadraticCurveTo(x + s * 0.7, y - w * 0.4 + s * 0.15, x + s, y - w);
  g.quadraticCurveTo(x + s * 0.5, y - w - s * 0.2, x, y);
  g.fill();
  g.beginPath(); g.ellipse(x, y + s * 0.05, s * 0.16, s * 0.22, 0, 0, Math.PI * 2); g.fill();
  // Hai tai nhọn
  g.beginPath();
  g.moveTo(x - s * 0.12, y - s * 0.1); g.lineTo(x - s * 0.08, y - s * 0.3); g.lineTo(x - s * 0.02, y - s * 0.12);
  g.moveTo(x + s * 0.12, y - s * 0.1); g.lineTo(x + s * 0.08, y - s * 0.3); g.lineTo(x + s * 0.02, y - s * 0.12);
  g.fill();
}

/** Một khung hình dơi ra canvas — `k` là pha cánh theo phần tư vòng. */
export function paintBatFrame(s = 96, k = 0, color = '#07040C') {
  const cv = document.createElement('canvas');
  cv.width = s; cv.height = Math.round(s * 0.7);
  const g = cv.getContext('2d');
  // Viền tím mỏng cho dơi đen còn đọc ra trên nền đêm
  g.shadowColor = 'rgba(140,107,192,.9)';
  g.shadowBlur = s * 0.04;
  drawBat(g, s / 2, cv.height * 0.5, s * 0.46, (k / 4) * Math.PI * 2, color);
  return cv;
}

/* ------------------------------------------------------------- bia mộ */

/**
 * Bia mộ khắc tên người phá sản và vòng phá sản. Chân bia nằm ở mép dưới
 * canvas (Phaser đặt gốc 0.5, 1) để bia "mọc" lên từ chỗ đặt.
 *
 * @param {string} name tên người chơi
 * @param {?number} round vòng phá sản
 * @param {string} css màu người chơi — dải hoa trước bia
 */
export function paintTombstone(name, round, css, w = 160) {
  const h = Math.round(w * 1.3);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const sw = w * 0.82, x0 = (w - sw) / 2, top = h * 0.04, base = h * 0.9;

  // Thân bia vòm, nửa trái sáng hơn như có trăng chiếu
  const body = new Path2D();
  body.moveTo(x0, base);
  body.lineTo(x0, top + sw / 2);
  body.arc(w / 2, top + sw / 2, sw / 2, Math.PI, 0);
  body.lineTo(x0 + sw, base);
  body.closePath();
  const grd = g.createLinearGradient(x0, 0, x0 + sw, 0);
  grd.addColorStop(0, '#7A6E93');
  grd.addColorStop(0.45, '#625679');
  grd.addColorStop(1, '#463D58');
  g.fillStyle = grd;
  g.fill(body);
  g.strokeStyle = '#2B2236';
  g.lineWidth = w * 0.025;
  g.stroke(body);
  // Vết nứt
  g.beginPath();
  g.moveTo(x0 + sw * 0.78, top + sw * 0.3); g.lineTo(x0 + sw * 0.7, top + sw * 0.48);
  g.lineTo(x0 + sw * 0.8, top + sw * 0.58); g.lineTo(x0 + sw * 0.74, top + sw * 0.75);
  g.lineWidth = w * 0.014; g.stroke();
  // Đế
  g.fillStyle = '#2B2236';
  g.fillRect(w * 0.02, base - h * 0.01, w * 0.96, h * 0.09);

  // Chữ khắc: tên, rồi vòng phá sản
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = BONE;
  g.font = `700 ${Math.round(w * 0.13)}px "Playfair Display", Georgia, serif`;
  g.fillText('R.I.P', w / 2, top + sw * 0.42);
  let fs = w * 0.15;
  const label = name.toUpperCase();
  do {
    g.font = `700 ${Math.round(fs)}px "Be Vietnam Pro", ui-sans-serif, sans-serif`;
    if (g.measureText(label).width <= sw * 0.86) break;
    fs -= 1;
  } while (fs > 7);
  g.fillText(label, w / 2, top + sw * 0.74);
  if (round != null) {
    g.fillStyle = '#D9CFEA';
    g.font = `500 ${Math.round(w * 0.095)}px "Be Vietnam Pro", ui-sans-serif, sans-serif`;
    g.fillText(`vòng ${round}`, w / 2, top + sw * 0.98);
  }
  // Dải màu người chơi dưới chân bia — nhận ra mộ ai mà không phải đọc chữ
  g.fillStyle = css;
  g.fillRect(x0 + sw * 0.12, base - h * 0.06, sw * 0.76, h * 0.04);
  return cv;
}

/* ------------------------------------------------------ nhà ma, lâu đài */

/**
 * Nhà ma và lâu đài ma, khai thành lớp `[đường, màu tô, màu viền, nét]` trong
 * khung 64 × 64. Một nguồn cho hai nơi: canvas của bảng nhà bật lên khi rê
 * chuột trên bàn cờ (`paintHauntedHouse`/`paintHauntedCastle`) và ký hiệu nhà
 * trong hộp thoại (`render/glyphs.js` dựng SVG từ cùng các lớp này), nên căn
 * nhà trên bàn và trong hộp thoại là một hình.
 */
const HOUSE_INK = '#1A1326';
export const HAUNTED_HOUSE = [
  ['M12 58V30l20-4 20 6v26z', '#4A3C5E', HOUSE_INK, 1.6],
  ['M8 32L30 6l26 28-4 2L30 12 12 34z', '#2C1A47', HOUSE_INK, 1.6],
  ['M40 14h6v10l-6-6z', '#2C1A47', HOUSE_INK, 1.2],
  ['M18 36h9v9h-9zM37 37h9v9h-9z', GLOW, HOUSE_INK, 1.2],
  ['M28 46h8v12h-8z', HOUSE_INK],
  ['M22.5 36v9M18 40.5h9M41.5 37v9M37 41.5h9', null, HOUSE_INK, 1],
];
export const HAUNTED_CASTLE = [
  ['M6 60V26h12v34zM46 60V26h12v34z', '#4A3C5E', HOUSE_INK, 1.4],
  ['M16 60V34h32v26z', '#3D3150', HOUSE_INK, 1.4],
  ['M4 27L12 6l8 21zM44 27l8-21 8 21z', '#2C1A47', HOUSE_INK, 1.4],
  ['M16 35v-5h4v3h4v-3h4v3h4v-3h4v3h4v-3h4v5z', '#4A3C5E', HOUSE_INK, 1.2],
  ['M12 6V0M52 6V0', null, HOUSE_INK, 1.2],
  ['M12 0l8 3-8 3zM52 0l8 3-8 3z', PUMPKIN],
  ['M10 34h4v6h-4zM50 34h4v6h-4zM22 40h5v6h-5zM37 40h5v6h-5z', GLOW, HOUSE_INK, 0.8],
  ['M27 60V50q5-6 10 0v10z', HOUSE_INK],
];

function paintLayers(layers, s) {
  const cv = document.createElement('canvas');
  cv.width = s; cv.height = s;
  const g = cv.getContext('2d');
  g.scale(s / 64, s / 64);
  g.lineJoin = 'round';
  for (const [d, c, st, lw] of layers) {
    const p = path(d);
    if (c) { g.fillStyle = c; g.fill(p); }
    if (st) { g.strokeStyle = st; g.lineWidth = lw ?? 1.2; g.stroke(p); }
  }
  return cv;
}

/**
 * Nhà ma: căn nhà gỗ mái nhọn nghiêng, cửa sổ vàng. Thay hình nhà ở bảng
 * nhà bật lên khi rê chuột (`BoardScene.showHousePlaque`).
 */
export const paintHauntedHouse = (s = 192) => paintLayers(HAUNTED_HOUSE, s);

/** Lâu đài ma: hai tháp chóp nhọn, cờ đuôi nheo cam, cửa sổ vàng. */
export const paintHauntedCastle = (s = 192) => paintLayers(HAUNTED_CASTLE, s);
