/**
 * Lớp trang trí Giáng Sinh vẽ chồng lên mặt bàn cờ: tuyết đọng trên mép trong
 * của dãy ô, gờ tuyết dồn ở mép ngoài (lề đường), phụ kiện trên từng ô đất và
 * dây đèn LED chạy quanh lòng bàn cờ.
 *
 * Vẽ thẳng vào ảnh bàn cờ (`paintBoard`) chứ không thành một texture riêng:
 * texture cùng cỡ bàn cờ (tới 3200 px) là thêm vài chục MB bộ nhớ đồ hoạ, và
 * mọi thứ `BoardScene` cắt dán từ ảnh bàn cờ (dải tên đè lên nước màu chủ đất,
 * bản xám của ô thế chấp, bản sao ô trong hoạt cảnh) tự mang theo tuyết. Ảnh
 * bàn cờ chỉ vẽ lại khi gờ tuyết dày thêm một nấc (theo số vòng đã chơi —
 * `snowLevel`), tối đa bốn lần một ván.
 *
 * Canvas này chỉ có dây và bóng đèn **đang tắt**. Bóng sáng là ảnh nhỏ riêng
 * do `BoardScene.addTileGlow` dựng theo `ledBulbs`, chỉ ở ô đã có nhà, nên
 * xây thêm hay bán bớt nhà không phải vẽ lại cả bàn.
 */
import { BOARD } from '../data/board.js';
import { tileCenter, tileAngle, tileSize, isCorner, innerRect, DEPTH, EDGE } from './geometry.js';
import { drawXmasIcon } from './xmasArt.js';

/** Số bóng trên đoạn dây trước mỗi ô: 1–4 nhà bật 1–4 bóng, khách sạn bật đủ. */
export const LEDS_PER_TILE = 5;

/**
 * Nấc dày của gờ tuyết theo số vòng cả bàn đã đi qua ô Bắt Đầu.
 *
 * `st.laps` đếm mọi lần qua ô Bắt Đầu của mọi người, nên chia cho số người
 * để ra "vòng bàn": cả bàn cùng đi hết hai vòng thì tuyết dày thêm một nấc,
 * tối đa 4 nấc. Bàn ít người hay đông người đều dày lên cùng nhịp ván.
 */
export const SNOW_LEVELS = 4;
export function snowLevel(laps, players) {
  const rounds = laps / Math.max(1, players);
  return Math.max(0, Math.min(SNOW_LEVELS, Math.floor(rounds / 2)));
}

/**
 * Phụ kiện chỉ đặt ở bốn ô góc. Ô đất và nhà ga đã có tên, giá, dải màu,
 * thêm hình nữa thì chật và rối mắt (Jason đã bỏ); ô góc rộng gấp đôi nên
 * còn chỗ trống cạnh biểu tượng của ô.
 */
const CORNER_PROPS = { 0: 'sleigh', 10: 'snowman', 20: 'tree', 30: 'santa' };
export function tileProp(id) {
  return CORNER_PROPS[id] ?? null;
}

/** Số giả ngẫu nhiên theo hạt giống — hình tuyết khỏi đổi mỗi lần vẽ lại. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Vị trí bóng đèn quanh lòng bàn cờ: mỗi ô `LEDS_PER_TILE` bóng, đặt ngay
 * trên mép trong (phía lòng bàn cờ) để không đè lên chữ của ô. `tile` là ô
 * đứng sau bóng ấy, `slot` là thứ tự bóng trong đoạn dây của ô (0…4).
 * @returns {Array<{x:number, y:number, tile:number, slot:number}>}
 */
export function ledBulbs(S) {
  const { x, y, size } = innerRect(S);
  const e = EDGE(S);
  const off = e * 0.16;          // lùi vào lòng bàn cờ bấy nhiêu
  const per = 9 * LEDS_PER_TILE; // 9 ô mỗi cạnh
  const out = [];
  /* Mỗi cạnh đi theo chiều số ô tăng dần (xem `tileCenter`): `first` là ô
     đầu cạnh. Cạnh dưới đi phải → trái, cạnh trái đi dưới → lên. */
  const sides = [
    { first: 21, at: (u) => ({ x: x + u, y: y + off }) },                // cạnh trên
    { first: 31, at: (u) => ({ x: x + size - off, y: y + u }) },         // cạnh phải
    { first: 1, at: (u) => ({ x: x + size - u, y: y + size - off }) },   // cạnh dưới
    { first: 11, at: (u) => ({ x: x + off, y: y + size - u }) },         // cạnh trái
  ];
  for (const { first, at } of sides) {
    for (let k = 0; k < per; k++) {
      const p = at(((k + 0.5) / per) * size);
      out.push({ ...p, tile: first + Math.floor(k / LEDS_PER_TILE), slot: k % LEDS_PER_TILE });
    }
  }
  return out;
}

/**
 * Vẽ lớp trang trí lên ảnh bàn cờ.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} S cạnh bàn cờ (px)
 * @param {number} level nấc gờ tuyết 0…SNOW_LEVELS
 */
export function drawXmasDeco(ctx, S, level = 0) {
  for (const t of BOARD) drawDrift(ctx, t.id, S, level);
  for (const t of BOARD) drawProp(ctx, t.id, S);
  drawInnerSnow(ctx, S);
  drawWire(ctx, S);
}

/* ------------------------------------------------- gờ tuyết ở mép ngoài */

/**
 * Tuyết dồn ở mép ngoài ô (phía lề bàn cờ) — chính là "đống tuyết còn phủ
 * lại trên đường". Cao tối đa 8,5% chiều cao ô: cao hơn thì đè lên giá tiền.
 */
function drawDrift(ctx, id, S, level) {
  const c = tileCenter(id, S);
  const { w, h } = tileSize(id, S);
  const r = rng(id * 131 + 7);
  const hMax = h * (0.022 + 0.016 * level);

  const edge = (len) => {
    // Đường lượn sóng dọc một mép dài `len`, chân nằm ở y = 0, tuyết phồng lên y âm
    ctx.beginPath();
    ctx.moveTo(-len / 2, 0);
    const n = 4;
    for (let i = 0; i < n; i++) {
      const x0 = -len / 2 + (i / n) * len;
      const x1 = -len / 2 + ((i + 1) / n) * len;
      ctx.quadraticCurveTo((x0 + x1) / 2, -hMax * (0.7 + r() * 0.6), x1, -hMax * (0.25 + r() * 0.3));
    }
    ctx.lineTo(len / 2, 0);
    ctx.closePath();
  };
  const paint = () => {
    const g = ctx.createLinearGradient(0, -hMax * 1.3, 0, 0);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(1, '#DCEBF6');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,160,195,.55)';
    ctx.lineWidth = Math.max(0.8, S * 0.0008);
    ctx.stroke();
  };

  ctx.save();
  ctx.translate(c.x, c.y);
  if (isCorner(id)) {
    // Ô góc giáp lề ở hai mép ngoài
    const out = { 0: [1, 1], 10: [-1, 1], 20: [-1, -1], 30: [1, -1] }[id];
    ctx.save();
    ctx.translate(0, out[1] * h / 2);
    if (out[1] < 0) ctx.rotate(Math.PI);
    edge(w); paint();
    ctx.restore();
    ctx.save();
    ctx.translate(out[0] * w / 2, 0);
    ctx.rotate(out[0] > 0 ? -Math.PI / 2 : Math.PI / 2);
    edge(h); paint();
    ctx.restore();
  } else {
    ctx.rotate(tileAngle(id));
    ctx.translate(0, h / 2);
    edge(w); paint();
  }
  ctx.restore();
}

/* ----------------------------------------------------------- phụ kiện */

function drawProp(ctx, id, S) {
  const name = tileProp(id);
  if (!name) return;
  const c = tileCenter(id, S);
  const { w, h } = tileSize(id, S);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(tileAngle(id));
  // Đổ bóng nhẹ cho phụ kiện đứng hẳn lên mặt ô thay vì như in chìm
  ctx.shadowColor = 'rgba(30,58,85,.28)';
  ctx.shadowBlur = w * 0.04;
  ctx.shadowOffsetY = w * 0.015;
  // Ô góc: nội dung dồn về phía trong; phụ kiện đứng cạnh biểu tượng của ô
  drawXmasIcon(ctx, name, w * 0.33, -h * 0.27, w * 0.30);
  ctx.restore();
}

/* --------------------------------- tuyết đọng trên mép trong của dãy ô */

/**
 * Một dải tuyết liền chạy quanh lòng bàn cờ, đè lên mép trên cổng của ô và
 * rủ thành giọt xuống mặt ô ở vài chỗ — tuyết đọng trên mái cổng.
 */
function drawInnerSnow(ctx, S) {
  const { x, y, size } = innerRect(S);
  const d = DEPTH(S);
  const thick = d * 0.07;
  const r = rng(977);
  for (let side = 0; side < 4; side++) {
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.rotate((side * Math.PI) / 2);
    // Trong hệ này, mép trong của dãy ô cạnh dưới nằm ở y = size/2; mặt ô ở y > size/2
    const y0 = size / 2;
    const L = size / 2 + d * 0.02;
    ctx.beginPath();
    ctx.moveTo(-L, y0 - thick * 0.35);
    const n = 36;
    for (let i = 0; i < n; i++) {
      const xa = -L + ((i + 1) / n) * 2 * L;
      ctx.quadraticCurveTo(xa - L / n, y0 - thick * (0.6 + r() * 0.5), xa, y0 - thick * 0.35);
    }
    // Mép dưới (trên mặt ô): đi ngược lại, thỉnh thoảng rủ giọt
    for (let i = n; i > 0; i--) {
      const xa = -L + ((i - 1) / n) * 2 * L;
      const drip = r() < 0.3 ? thick * (1.2 + r() * 1.6) : thick * (0.4 + r() * 0.35);
      ctx.quadraticCurveTo(xa + L / n, y0 + drip, xa, y0 + thick * 0.45);
    }
    ctx.closePath();
    ctx.shadowColor = 'rgba(30,58,85,.25)';
    ctx.shadowBlur = thick * 0.8;
    ctx.shadowOffsetY = thick * 0.25;
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(140,180,212,.6)';
    ctx.lineWidth = Math.max(0.8, S * 0.0007);
    ctx.stroke();
    ctx.restore();
  }
}

/* ---------------------------------------------------------- dây đèn LED */

/** Dây điện võng giữa hai bóng, và thân bóng ở trạng thái tắt (màu nhạt). */
function drawWire(ctx, S) {
  const bulbs = ledBulbs(S);
  const e = EDGE(S);
  const sag = e * 0.035;          // bóng dày (5 bóng một ô) nên mỗi nhịp dây võng nông
  const { x, y, size } = innerRect(S);
  const cx = x + size / 2, cy = y + size / 2;

  ctx.save();
  ctx.strokeStyle = '#1F4D31';
  ctx.lineWidth = Math.max(1, S * 0.0012);
  ctx.beginPath();
  bulbs.forEach((b, i) => {
    const n = bulbs[(i + 1) % bulbs.length];
    if (i === 0) ctx.moveTo(b.x, b.y);
    // Võng về phía lòng bàn cờ
    const mx = (b.x + n.x) / 2, my = (b.y + n.y) / 2;
    const dx = cx - mx, dy = cy - my, L = Math.hypot(dx, dy) || 1;
    ctx.quadraticCurveTo(mx + (dx / L) * sag, my + (dy / L) * sag, n.x, n.y);
  });
  ctx.stroke();

  /* Bóng tắt: thuỷ tinh xám xanh, chỉ có một vệt phản quang. Không vẽ màu ở
     đây: màu là của chủ đất, bật lên ở `BoardScene.addTileGlow` khi ô có nhà. */
  const r = e * 0.065;
  for (const b of bulbs) {
    const ang = Math.atan2(cy - b.y, cx - b.x);  // bóng chúc đầu vào lòng bàn cờ
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(ang - Math.PI / 2);
    ctx.fillStyle = '#1F4D31';
    ctx.fillRect(-r * 0.45, -r * 0.6, r * 0.9, r * 0.7);
    ctx.fillStyle = '#4A607A';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.75, r * 0.62, r * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, r * 0.5, r * 0.16, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** Quầng sáng tròn màu trắng — Phaser nhuộm theo màu bóng (`setTint`). */
export function paintBulbGlow(s = 64) {
  const cv = document.createElement('canvas');
  cv.width = s; cv.height = s;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,.65)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return cv;
}

/** Hạt tuyết rơi — chấm trắng mép mềm. */
export function paintSnowflake(s = 16) {
  const cv = document.createElement('canvas');
  cv.width = s; cv.height = s;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return cv;
}
