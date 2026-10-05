/**
 * Lớp trang trí Halloween vẽ thẳng vào ảnh bàn cờ (`paintBoard`): nghĩa địa
 * trong lòng bàn, dây bí ngô chạy quanh mép trong dãy ô, mạng nhện ở bốn góc
 * lòng bàn.
 *
 * Vẽ vào ảnh bàn cờ chứ không thành texture riêng, cùng lý do với
 * `xmasDeco.js`: một texture cỡ bàn cờ tốn vài chục MB, mà những gì đứng yên
 * (trời, nhà nguyện, cây chết, bia mộ, hàng rào) vẽ một lần là đủ. Thứ chuyển
 * động — bộ xương đi, dơi bay, sương trôi, trăng đổi đỏ — là ảnh nhỏ riêng do
 * `BoardScene` dựng, đặt theo toạ độ `graveLayout` khai ở đây.
 *
 * Bí ngô trên dây đều ở trạng thái **tắt**: mặt khắc tối. Ô có nhà thì
 * `BoardScene.lightPumpkins` đặt bí ngô sáng đè đúng chỗ, theo đúng luật đèn
 * LED của Giáng Sinh: số quả sáng bằng số nhà, khách sạn sáng đủ năm.
 */
import { innerRect, EDGE } from './geometry.js';
import { ledBulbs, LEDS_PER_TILE } from './xmasDeco.js';
import { drawHalloweenIcon, drawWebCorner } from './halloweenArt.js';

export { LEDS_PER_TILE as PUMPKINS_PER_TILE };

/** Số giả ngẫu nhiên theo hạt giống — bia mộ khỏi xê dịch mỗi lần vẽ lại. */
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
 * Bố cục nghĩa địa theo tỉ lệ cạnh lòng bàn cờ. Giữa lòng bàn lúc chơi bị
 * bảng nút và tấm biển che, nên cảnh dồn về nửa dưới (chỗ xí ngầu lăn) và
 * trăng lên góc trên phải.
 */
const SCENE = {
  horizon: 0.6,
  moon: { x: 0.8, y: 0.2, r: 0.055 },
  /** Mặt đất dưới chân bộ xương — ba làn, gần to xa nhỏ. */
  lanes: [0.74, 0.83, 0.93],
  /** Bề ngang làn đi, chừa hai đầu cho dây bí ngô và mạng nhện. */
  walk: [0.1, 0.9],
};

/**
 * Toạ độ nghĩa địa trên bàn cờ cạnh `S` — `BoardScene` dựng trăng đỏ, bộ
 * xương, dơi theo đây.
 */
export function graveLayout(S) {
  const { x, y, size } = innerRect(S);
  return {
    x, y, size,
    moon: { x: x + size * SCENE.moon.x, y: y + size * SCENE.moon.y, r: size * SCENE.moon.r },
    lanes: SCENE.lanes.map((f) => y + size * f),
    walk: SCENE.walk.map((f) => x + size * f),
    horizon: y + size * SCENE.horizon,
  };
}

/**
 * Chỗ đặt từng quả bí ngô quanh lòng bàn cờ — đúng chỗ bóng LED của Giáng
 * Sinh, kèm góc xoay cho đáy quả quay về phía ô (mặt quay vào lòng bàn).
 * @returns {Array<{x:number, y:number, tile:number, slot:number, rot:number}>}
 */
export function pumpkinSpots(S) {
  const { x, y, size } = innerRect(S);
  const cx = x + size / 2, cy = y + size / 2;
  return ledBulbs(S).map((b) => ({ ...b, rot: Math.atan2(cx - b.x, -(cy - b.y)) }));
}

/** Cạnh một quả bí ngô trên dây, theo cạnh bàn cờ. */
export const pumpkinSize = (S) => EDGE(S) * 0.17;

/**
 * Vẽ lớp trang trí lên ảnh bàn cờ — gọi sau khi đã vẽ ô, trước tấm biển giữa
 * bàn thì không được (biển phải nằm trên nghĩa địa), nên tách hai hàm:
 * `drawGraveyard` gọi trong lúc vẽ lòng bàn, `drawHalloweenDeco` gọi cuối.
 */
export function drawHalloweenDeco(ctx, S) {
  drawVine(ctx, S);
}

/* -------------------------------------------------------------- nghĩa địa */

/** Cảnh nghĩa địa phủ kín lòng bàn cờ. */
export function drawGraveyard(ctx, S) {
  const { x, y, size } = innerRect(S);
  const L = graveLayout(S);
  const R = rng(1031);
  const at = (fx, fy) => [x + size * fx, y + size * fy];

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();

  // Trời: tím đen trên cao, ngả tím ở chân trời
  const sky = ctx.createLinearGradient(0, y, 0, L.horizon);
  sky.addColorStop(0, '#0B0712');
  sky.addColorStop(0.55, '#1A1029');
  sky.addColorStop(1, '#33204F');
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, size, L.horizon - y);

  // Sao: chấm nhỏ thưa, chỉ ở nửa trên
  for (let i = 0; i < 70; i++) {
    const [sx, sy] = at(R(), R() * 0.5);
    ctx.globalAlpha = 0.25 + R() * 0.5;
    ctx.fillStyle = '#E6DDF5';
    ctx.beginPath(); ctx.arc(sx, sy, size * (0.0012 + R() * 0.0018), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Trăng và quầng
  const m = L.moon;
  const halo = ctx.createRadialGradient(m.x, m.y, m.r * 0.8, m.x, m.y, m.r * 3.4);
  halo.addColorStop(0, 'rgba(243,233,198,.28)');
  halo.addColorStop(1, 'rgba(243,233,198,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(m.x - m.r * 3.4, m.y - m.r * 3.4, m.r * 6.8, m.r * 6.8);
  drawHalloweenIcon(ctx, 'moon', m.x, m.y, m.r * 2.9);

  // Nhà nguyện bên trái chân trời, cửa sổ còn ánh nến
  const hz = L.horizon;
  ctx.fillStyle = '#160D24';
  const [chx] = at(0.12, 0);
  const cw = size * 0.1, ch = size * 0.12;
  ctx.fillRect(chx - cw / 2, hz - ch, cw, ch);
  ctx.beginPath(); ctx.moveTo(chx - cw * 0.6, hz - ch); ctx.lineTo(chx, hz - ch - size * 0.06); ctx.lineTo(chx + cw * 0.6, hz - ch); ctx.fill();
  ctx.fillRect(chx - size * 0.004, hz - ch - size * 0.12, size * 0.008, size * 0.065);
  ctx.fillRect(chx - size * 0.017, hz - ch - size * 0.1, size * 0.034, size * 0.008);
  ctx.fillStyle = 'rgba(255,190,90,.6)';
  ctx.fillRect(chx - size * 0.012, hz - ch * 0.7, size * 0.024, size * 0.04);

  // Cây chết bên phải: cành rẽ đôi, càng xa thân càng mảnh
  ctx.strokeStyle = '#160D24';
  ctx.lineCap = 'round';
  const branch = (bx, by, a, len, d) => {
    if (d === 0) return;
    const x2 = bx + Math.cos(a) * len, y2 = by + Math.sin(a) * len;
    ctx.lineWidth = d * size * 0.0022;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(x2, y2); ctx.stroke();
    branch(x2, y2, a - 0.45, len * 0.7, d - 1);
    branch(x2, y2, a + 0.38, len * 0.66, d - 1);
  };
  const [tx] = at(0.88, 0);
  branch(tx, hz + size * 0.02, -Math.PI / 2 - 0.08, size * 0.085, 6);

  // Mặt đất
  const gr = ctx.createLinearGradient(0, hz, 0, y + size);
  gr.addColorStop(0, '#22163A');
  gr.addColorStop(1, '#0E0818');
  ctx.fillStyle = gr;
  ctx.fillRect(x, hz, size, y + size - hz);

  // Hàng rào sắt dọc chân trời
  ctx.strokeStyle = '#2E2146';
  ctx.lineWidth = Math.max(1, size * 0.003);
  ctx.beginPath();
  ctx.moveTo(x, hz - size * 0.012); ctx.lineTo(x + size, hz - size * 0.012);
  ctx.moveTo(x, hz - size * 0.034); ctx.lineTo(x + size, hz - size * 0.034);
  ctx.stroke();
  for (let fx = x; fx < x + size; fx += size * 0.022) {
    ctx.beginPath(); ctx.moveTo(fx, hz + size * 0.004); ctx.lineTo(fx, hz - size * 0.052); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx - size * 0.004, hz - size * 0.05); ctx.lineTo(fx, hz - size * 0.06); ctx.lineTo(fx + size * 0.004, hz - size * 0.05); ctx.fill();
  }

  // Ba hàng bia mộ, xa nhỏ gần to; vài bia có bí ngô sáng dưới chân
  const rows = [[0.665, 0.5, 8], [0.755, 0.68, 7], [0.875, 0.85, 6]];
  const shades = ['#3C3350', '#4A405F', '#5A4F70'];
  rows.forEach(([fy, sc, n], row) => {
    for (let k = 0; k < n; k++) {
      const fx = 0.06 + ((k + 0.25 + R() * 0.5) / n) * 0.88;
      const [sx, sy] = at(fx, fy + R() * 0.015);
      stone(ctx, sx, sy, size * 0.075 * sc * (0.8 + R() * 0.4), R() < 0.3 ? 'cross' : R() < 0.55 ? 'slab' : 'round',
        (R() - 0.5) * 0.18, shades[row]);
      if (R() < 0.3) glowPumpkin(ctx, sx + size * 0.03 * sc, sy, size * 0.03 * sc);
    }
  });

  // Sương nằm sát đất
  for (let k = 0; k < 5; k++) {
    const [fx, fy] = at(0.1 + k * 0.2 + R() * 0.05, 0.7 + (k % 3) * 0.08);
    const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, size * 0.25);
    fg.addColorStop(0, 'rgba(183,155,224,.12)');
    fg.addColorStop(1, 'rgba(183,155,224,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(fx - size * 0.25, fy - size * 0.25, size * 0.5, size * 0.5);
  }

  // Mạng nhện bốn góc lòng bàn: chỗ duy nhất không có chữ nào
  const r = size * 0.12;
  const lw = Math.max(1, size * 0.0018);
  drawWebCorner(ctx, x, y, r, 0, 'rgba(217,207,234,.5)', lw);
  drawWebCorner(ctx, x + size, y, r, Math.PI / 2, 'rgba(217,207,234,.5)', lw);
  drawWebCorner(ctx, x + size, y + size, r, Math.PI, 'rgba(217,207,234,.38)', lw);
  drawWebCorner(ctx, x, y + size, r, -Math.PI / 2, 'rgba(217,207,234,.38)', lw);
  ctx.restore();
}

/** Một tấm bia: vòm, phiến hay thập tự, nghiêng nhẹ. Chân bia tại (sx, sy). */
function stone(ctx, sx, sy, h, kind, tilt, shade) {
  const w = h * 0.62;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(tilt);
  ctx.fillStyle = shade;
  if (kind === 'cross') {
    ctx.fillRect(-w * 0.12, -h, w * 0.24, h);
    ctx.fillRect(-w * 0.4, -h * 0.75, w * 0.8, w * 0.22);
  } else if (kind === 'slab') {
    ctx.fillRect(-w / 2, -h * 0.82, w, h * 0.82);
  } else {
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2, -h + w / 2);
    ctx.arc(0, -h + w / 2, w / 2, Math.PI, 0);
    ctx.lineTo(w / 2, 0); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(w * 0.1, -h * 0.8, w * 0.3, h * 0.8);
  ctx.restore();
}

/** Bí ngô nhỏ cháy sáng dưới chân bia, kèm quầng cam loang ra đất. */
function glowPumpkin(ctx, px, py, s) {
  const gl = ctx.createRadialGradient(px, py - s * 0.5, 0, px, py - s * 0.5, s * 2.6);
  gl.addColorStop(0, 'rgba(255,160,50,.35)');
  gl.addColorStop(1, 'rgba(255,160,50,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(px - s * 2.6, py - s * 3.1, s * 5.2, s * 5.2);
  drawHalloweenIcon(ctx, 'pumpkinLit', px, py - s * 0.5, s);
}

/* --------------------------------------------------------- dây bí ngô */

/** Dây leo xanh chạy quanh lòng bàn cờ, bí ngô tắt treo ở từng chỗ đèn. */
function drawVine(ctx, S) {
  const spots = pumpkinSpots(S);
  const e = EDGE(S);
  const { x, y, size } = innerRect(S);
  const cx = x + size / 2, cy = y + size / 2;
  const sag = e * 0.03;

  ctx.save();
  ctx.strokeStyle = '#3E5A26';
  ctx.lineWidth = Math.max(1, S * 0.0013);
  ctx.beginPath();
  spots.forEach((b, i) => {
    const n = spots[(i + 1) % spots.length];
    if (i === 0) ctx.moveTo(b.x, b.y);
    const mx = (b.x + n.x) / 2, my = (b.y + n.y) / 2;
    const dx = cx - mx, dy = cy - my, l = Math.hypot(dx, dy) || 1;
    ctx.quadraticCurveTo(mx + (dx / l) * sag, my + (dy / l) * sag, n.x, n.y);
  });
  ctx.stroke();
  ctx.restore();

  const ps = pumpkinSize(S);
  for (const b of spots) drawHalloweenIcon(ctx, 'pumpkin', b.x, b.y, ps, { rot: b.rot });
}
