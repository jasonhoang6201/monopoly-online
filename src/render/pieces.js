/**
 * Quân cờ, nhà/khách sạn và đồng tiền — vẽ bằng canvas với đổ bóng và
 * bắt sáng để có cảm giác khối 3D. Riêng xí ngầu dựng khối thật ở dice3d.js.
 */
import { P } from './boardArt.js';

/* Vàng của quân cờ đứng riêng khỏi bảng màu bàn cờ: chủ đề Giáng Sinh đổi nét
   vàng của bàn sang xanh băng, nhưng vành đế và cổ quân vẫn là thếp vàng —
   như quả châu vàng treo trên cây thông. */
const TOKEN_GOLD = '#C8A048';
const TOKEN_GOLD_DEEP = '#8A6A22';

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
  ctx.strokeStyle = TOKEN_GOLD;
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
  ctx.fillStyle = TOKEN_GOLD;
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

  // Giáng Sinh: quân đội mũ Noel thay cho chỏm vàng
  if (P.theme === 'christmas') {
    santaHat(ctx, cx, headY, headR, s);
    return cv;
  }

  // Chỏm vàng nhỏ trên đỉnh cho quân cờ có chỗ kết
  const tipY = headY - headR * 0.92;
  const tg = ctx.createRadialGradient(
    cx - s * 0.012, tipY - s * 0.012, s * 0.004, cx, tipY, s * 0.042,
  );
  tg.addColorStop(0, '#FFF0BE');
  tg.addColorStop(1, TOKEN_GOLD_DEEP);
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.arc(cx, tipY, s * 0.042, 0, Math.PI * 2);
  ctx.fill();

  return cv;
}

/**
 * Mũ Noel đội lệch trên đầu quân: chóp đỏ gập sang phải, vành lông trắng ôm
 * nửa trên đầu, quả bông trắng ở chóp. Mũ màu đỏ cố định chứ không theo màu
 * người chơi — người ta nhận nhau bằng màu thân quân, mũ chỉ là phụ kiện.
 */
function santaHat(ctx, cx, headY, headR, s) {
  const brimY = headY - headR * 0.42;
  const tip = { x: cx + headR * 1.25, y: headY - headR * 1.55 };

  ctx.save();
  // Chóp mũ
  let g = ctx.createLinearGradient(cx - headR, 0, cx + headR * 1.3, 0);
  g.addColorStop(0, '#8E141B');
  g.addColorStop(0.45, '#D8343C');
  g.addColorStop(1, '#A11E26');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.95, brimY);
  ctx.bezierCurveTo(cx - headR * 0.85, headY - headR * 1.55, cx + headR * 0.2, headY - headR * 2.05, tip.x, tip.y);
  ctx.bezierCurveTo(cx + headR * 0.75, headY - headR * 1.25, cx + headR * 0.95, headY - headR * 0.9, cx + headR * 0.95, brimY);
  ctx.closePath();
  ctx.fill();

  // Vành lông trắng
  g = ctx.createLinearGradient(0, brimY - headR * 0.3, 0, brimY + headR * 0.3);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(1, '#D7E6F2');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, brimY, headR * 1.08, headR * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Quả bông
  g = ctx.createRadialGradient(tip.x - s * 0.01, tip.y - s * 0.01, s * 0.004, tip.x, tip.y, s * 0.05);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(1, '#CFE0EE');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, s * 0.048, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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

/* ------------------------------------------------------------- hào quang */

/**
 * Vầng sáng tràn ra ngoài viền quân bao nhiêu điểm ảnh, theo bề ngang texture
 * quân. BoardScene cũng gọi hàm này để đặt điểm neo, nên chỉ chỉnh ở đây.
 */
export const auraPad = (w) => Math.round(w * 0.13);

/**
 * Vầng sáng bo theo viền quân của người đã học kỹ năng tối thượng.
 *
 * Lấy dáng quân từ chính texture quân (bỏ bóng đổ mờ dưới đế — chỉ giữ điểm
 * ảnh gần đặc), tô dáng đó bằng màu nhánh, rồi in lại quanh vị trí gốc theo
 * nhiều vòng bán kính tăng dần với độ trong thấp. Chỗ in chồng nhiều lần (sát
 * viền quân) đậm, càng ra xa càng ít lần chồng nên nhạt dần — thành vầng sáng
 * ôm dáng quân. Không dùng `ctx.filter = blur` vì Safari chưa hỗ trợ trên
 * canvas: ở đó vầng sáng sẽ thành một cái bóng viền cứng.
 *
 * Màu trắng (đủ 5 tối thượng) gần trùng nền kem của ô đất: vòng ngoài cùng in
 * màu tối mờ trước, vầng trắng in đè lên trong, nên vẫn tách khỏi nền.
 * Canvas trả về rộng hơn texture quân `pad` điểm ảnh mỗi phía; BoardScene đặt
 * nó trùng tâm với quân và dưới lớp quân, nên phần giữa bị thân quân che,
 * chỉ lộ vầng sáng quanh viền.
 * @param {HTMLCanvasElement|HTMLImageElement} token texture quân (paintToken)
 * @param {string} color màu hex (`ultColor` trong core/skills.js)
 * @returns {{cv: HTMLCanvasElement, pad: number}}
 */
export function paintAura(token, color) {
  const W = token.width, H = token.height;
  const pad = auraPad(W);
  const cv = canvas(W + pad * 2, H + pad * 2);
  const ctx = cv.getContext('2d');
  const RINGS = 6, DIRS = 16;
  const ring = (sil, from, to, alpha) => {
    for (let r = from; r <= to; r++) {
      const rad = (pad * r) / RINGS;
      ctx.globalAlpha = alpha * (1 - (r - 1) / RINGS);
      for (let d = 0; d < DIRS; d++) {
        const a = (d / DIRS) * Math.PI * 2 + r * 0.4;
        ctx.drawImage(sil, pad + Math.cos(a) * rad, pad + Math.sin(a) * rad);
      }
    }
  };
  if (color.toUpperCase() === '#FFFFFF') {
    ring(silhouette(token, () => '#3a2a1c'), 3, RINGS, 0.14);
    ring(silhouette(token, () => color), 1, 4, 0.2);
  } else {
    ring(silhouette(token, () => color), 1, RINGS, 0.16);
  }
  ctx.globalAlpha = 1;
  return { cv, pad };
}

/**
 * Một bóng mờ khi quân đi: giữ nguyên hình và khối sáng tối của quân, phủ màu
 * hào quang lên 60% — nhìn ra vẫn là quân đó, mà màu đủ đậm để nhận ra. Độ
 * trong do BoardScene đặt theo khoảng cách tới quân.
 * @param {HTMLCanvasElement|HTMLImageElement} token texture quân (paintToken)
 * @param {string} color màu hex của một nhánh
 */
export function paintGhost(token, color) {
  return silhouette(token, () => color, 0.6);
}

/**
 * Dáng quân không kèm bóng đổ dưới đế: điểm ảnh nào độ đặc dưới ~55% (bóng đổ
 * vẽ ở 34%) thì xoá hẳn, còn lại giữ nguyên để mép quân không bị răng cưa.
 * `tint` < 1 thì giữ hình quân bên dưới và phủ màu lên theo tỉ lệ đó; bằng 1
 * thì tô đặc màu.
 */
function silhouette(token, fill, tint = 1) {
  const W = token.width, H = token.height;
  const cv = canvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.drawImage(token, 0, 0);
  const img = ctx.getImageData(0, 0, W, H);
  const px = img.data;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 140) px[i] = 0;
  ctx.putImageData(img, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = tint;
  ctx.fillStyle = fill(ctx);
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return cv;
}
