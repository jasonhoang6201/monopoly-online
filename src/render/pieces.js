/**
 * Quân cờ, nhà/khách sạn và đồng tiền — vẽ bằng canvas với đổ bóng và
 * bắt sáng để có cảm giác khối 3D. Riêng xí ngầu dựng khối thật ở dice3d.js.
 */
import { P } from './boardArt.js';

/* --------------------------------------------------------- tiện ích màu */

function hex2rgb(h) {
  const v = parseInt(h.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));

/** Làm sáng (amt > 0) hoặc tối (amt < 0) một màu hex. */
export function shade(hex, amt) {
  const [r, g, b] = hex2rgb(hex);
  const t = amt > 0 ? 255 : 0;
  const p = Math.abs(amt);
  return `rgb(${clamp(r + (t - r) * p)},${clamp(g + (t - g) * p)},${clamp(b + (t - b) * p)})`;
}

function canvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return cv;
}

/* ------------------------------------------------------------- quân cờ */

/**
 * Quân cờ dáng tượng nhỏ: đế bầu, thân thon, đầu tròn — không đeo biểu tượng
 * gì cả, người chơi nhận nhau bằng MÀU cho gọn mắt.
 * @param {string} css màu người chơi
 * @param {number} s cạnh texture
 */
export function paintToken(css, s = 160) {
  const cv = canvas(s, s * 1.12);
  const ctx = cv.getContext('2d');
  const cx = s / 2;
  const H = s * 1.12;

  const dark = shade(css, -0.45);
  const mid = shade(css, -0.12);
  const light = shade(css, 0.34);
  const glow = shade(css, 0.62);

  // Bóng đổ trên mặt bàn
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx + s * 0.03, H * 0.935, s * 0.33, s * 0.085, 0, 0, Math.PI * 2);
  ctx.filter = 'blur(2px)';
  ctx.fill();
  ctx.restore();

  // Đế
  const baseY = H * 0.90;
  let g = ctx.createLinearGradient(cx - s * 0.34, 0, cx + s * 0.34, 0);
  g.addColorStop(0, dark); g.addColorStop(0.38, light); g.addColorStop(1, mid);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, baseY, s * 0.33, s * 0.105, 0, 0, Math.PI * 2);
  ctx.fill();
  // vành đế vàng
  ctx.strokeStyle = P.gold;
  ctx.lineWidth = s * 0.018;
  ctx.beginPath();
  ctx.ellipse(cx, baseY, s * 0.33, s * 0.105, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Thân thon
  const topY = H * 0.44;
  g = ctx.createLinearGradient(cx - s * 0.24, 0, cx + s * 0.24, 0);
  g.addColorStop(0, dark);
  g.addColorStop(0.30, light);
  g.addColorStop(0.52, mid);
  g.addColorStop(1, shade(css, -0.32));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.26, baseY);
  ctx.bezierCurveTo(cx - s * 0.24, baseY - s * 0.22, cx - s * 0.16, topY + s * 0.10, cx - s * 0.135, topY);
  ctx.lineTo(cx + s * 0.135, topY);
  ctx.bezierCurveTo(cx + s * 0.16, topY + s * 0.10, cx + s * 0.24, baseY - s * 0.22, cx + s * 0.26, baseY);
  ctx.closePath();
  ctx.fill();

  // Bắt sáng dọc thân
  ctx.save();
  ctx.globalAlpha = 0.4;
  g = ctx.createLinearGradient(cx - s * 0.14, 0, cx - s * 0.02, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, glow);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.085, (baseY + topY) / 2, s * 0.055, (baseY - topY) * 0.40, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Cổ vàng
  ctx.fillStyle = P.gold;
  ctx.beginPath();
  ctx.ellipse(cx, topY, s * 0.16, s * 0.048, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.045, topY - s * 0.012, s * 0.06, s * 0.018, 0, 0, Math.PI * 2);
  ctx.fill();

  // Đầu tròn
  const headR = s * 0.155, headY = H * 0.315;
  g = ctx.createRadialGradient(cx - headR * 0.38, headY - headR * 0.42, headR * 0.12, cx, headY, headR);
  g.addColorStop(0, glow);
  g.addColorStop(0.42, light);
  g.addColorStop(1, shade(css, -0.35));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.fill();

  // Chỏm vàng nhỏ trên đỉnh cho quân cờ có chỗ kết
  const tipY = headY - headR * 0.92;
  const tg = ctx.createRadialGradient(
    cx - s * 0.012, tipY - s * 0.012, s * 0.004, cx, tipY, s * 0.042,
  );
  tg.addColorStop(0, '#FFF0BE');
  tg.addColorStop(1, P.goldDeep);
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.arc(cx, tipY, s * 0.042, 0, Math.PI * 2);
  ctx.fill();

  return cv;
}

/* ---------------------------------------------------------- đồng tiền xu */

/** Đồng tiền cổ lỗ vuông — dùng cho hiệu ứng tiền bay. */
export function paintCoin(s = 48) {
  const cv = canvas(s, s);
  const ctx = cv.getContext('2d');
  const c = s / 2, R = s * 0.44;

  const g = ctx.createRadialGradient(c - R * 0.4, c - R * 0.4, R * 0.1, c, c, R);
  g.addColorStop(0, '#FFF0BE');
  g.addColorStop(0.45, '#E0B451');
  g.addColorStop(0.82, '#A8802C');
  g.addColorStop(1, '#6E5216');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = 'rgba(60,42,10,.6)';
  ctx.lineWidth = s * 0.035;
  ctx.beginPath(); ctx.arc(c, c, R * 0.9, 0, Math.PI * 2); ctx.stroke();

  // Lỗ vuông ở giữa
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillRect(c - R * 0.22, c - R * 0.22, R * 0.44, R * 0.44);
  ctx.restore();
  ctx.strokeStyle = 'rgba(60,42,10,.75)';
  ctx.lineWidth = s * 0.028;
  ctx.strokeRect(c - R * 0.22, c - R * 0.22, R * 0.44, R * 0.44);

  // Bốn chấm mô phỏng chữ triện
  ctx.fillStyle = 'rgba(70,50,14,.5)';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * R * 0.55, c + Math.sin(a) * R * 0.55, R * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  return cv;
}
