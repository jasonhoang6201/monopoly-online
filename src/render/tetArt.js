/**
 * Hình vẽ của chủ đề Tết — toàn bộ vẽ bằng canvas 2D, không tải ảnh.
 *
 *   · `drawTetScene`: cảnh Tết trong lòng bàn cờ — cành mai vàng góc trái,
 *     cành đào hồng góc phải, hai đèn lồng treo trên, hai câu đối hai bên,
 *     bánh chưng và xấp lì xì dưới chân tấm biển tên.
 *   · `paintPetal`, `paintLixi`: ảnh nhỏ cho hoa rơi trên bàn và tiền bay.
 *
 * Cũng như cảnh Giáng Sinh, cảnh dồn ra mép và nửa dưới lòng bàn: giữa bàn
 * lúc chơi bị thanh nút và bảng thông báo che.
 */

/** Số giả ngẫu nhiên theo hạt giống — hoa nằm yên một chỗ mỗi lần vẽ lại. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MAI = { petal: '#FFD23F', edge: '#E9A100', heart: '#C8501B' };
const DAO = { petal: '#FF9EC0', edge: '#E8679A', heart: '#B0244F' };

/** Một bông năm cánh xoay `rot`. */
export function blossom(ctx, x, y, r, c, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.rotate((i / 5) * Math.PI * 2);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.55, r * 0.42, r * 0.58, 0, 0, Math.PI * 2);
    ctx.fillStyle = c.petal;
    ctx.fill();
    ctx.lineWidth = Math.max(0.6, r * 0.06);
    ctx.strokeStyle = c.edge;
    ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = c.heart;
  ctx.fill();
  // Nhuỵ: mấy chấm nhỏ toả quanh tâm
  ctx.fillStyle = '#FFF2B0';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32, r * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Nụ hoa: một giọt tròn trên cuống. */
function bud(ctx, x, y, r, c) {
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.55, r * 0.75, 0, 0, Math.PI * 2);
  ctx.fillStyle = c.petal;
  ctx.fill();
  ctx.strokeStyle = c.edge;
  ctx.lineWidth = Math.max(0.5, r * 0.08);
  ctx.stroke();
}

/**
 * Một cành hoa mọc từ (x0,y0) theo hướng (dx,dy): thân chính cong, ba nhánh
 * phụ, hoa và nụ rải dọc thân.
 */
function branch(ctx, x0, y0, dx, dy, len, c, seed) {
  const rand = rng(seed);
  const pts = [];
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#4A2A1A';
  const twig = (sx, sy, ang, L, w, depth) => {
    let x = sx, y = sy, a = ang;
    const steps = 6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 0; i < steps; i++) {
      a += (rand() - 0.5) * 0.5;
      const nx = x + Math.cos(a) * (L / steps), ny = y + Math.sin(a) * (L / steps);
      ctx.lineTo(nx, ny);
      x = nx; y = ny;
      pts.push([x, y, depth]);
      if (depth < 2 && i > 1 && i < steps - 1 && rand() < 0.4) {
        // Nhánh phụ: vẽ sau khi xong nét này, nhỏ và ngắn hơn
        pts.push(['fork', x, y, a + (rand() < 0.5 ? -1 : 1) * (0.6 + rand() * 0.4), L * 0.45, w * 0.55, depth + 1]);
      }
    }
    ctx.lineWidth = w;
    ctx.stroke();
  };
  twig(x0, y0, Math.atan2(dy, dx), len, len * 0.035, 0);
  // Nhánh phụ dựng sau thân chính
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k];
    if (p[0] === 'fork') twig(p[1], p[2], p[3], p[4], p[5], p[6]);
  }
  ctx.restore();

  // Hoa và nụ dọc thân, nhánh càng nhỏ hoa càng dày
  const r = len * 0.05;
  for (const p of pts) {
    if (p[0] === 'fork') continue;
    const [x, y] = p;
    if (rand() < 0.62) blossom(ctx, x + (rand() - 0.5) * r, y + (rand() - 0.5) * r, r * (0.8 + rand() * 0.45), c, rand() * 6);
    else bud(ctx, x + (rand() - 0.5) * r, y + (rand() - 0.5) * r, r * 0.6, c);
  }
}

/** Đèn lồng đỏ treo bằng sợi dây từ mép trên lòng bàn cờ. */
function lantern(ctx, x, top, hang, s) {
  const cy = top + hang + s * 0.5;
  ctx.save();
  ctx.strokeStyle = '#E3B341';
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, cy - s * 0.5);
  ctx.stroke();

  // Thân đèn: elip đỏ đổ sáng từ giữa
  const g = ctx.createRadialGradient(x - s * 0.15, cy - s * 0.1, s * 0.05, x, cy, s * 0.6);
  g.addColorStop(0, '#FF7A4A');
  g.addColorStop(0.5, '#E0251B');
  g.addColorStop(1, '#8A0F0A');
  ctx.beginPath();
  ctx.ellipse(x, cy, s * 0.48, s * 0.44, 0, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.shadowColor = 'rgba(255,90,40,.55)';
  ctx.shadowBlur = s * 0.35;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Gân đèn
  ctx.strokeStyle = 'rgba(120,10,6,.55)';
  ctx.lineWidth = Math.max(0.8, s * 0.02);
  for (const k of [-0.6, -0.25, 0.25, 0.6]) {
    ctx.beginPath();
    ctx.ellipse(x, cy, Math.abs(k) * s * 0.48, s * 0.44, 0, -Math.PI / 2, Math.PI / 2, k < 0);
    ctx.stroke();
  }

  // Nắp vàng trên dưới
  ctx.fillStyle = '#E3B341';
  ctx.fillRect(x - s * 0.22, cy - s * 0.5, s * 0.44, s * 0.1);
  ctx.fillRect(x - s * 0.22, cy + s * 0.4, s * 0.44, s * 0.1);

  // Chữ Phúc vàng giữa đèn
  ctx.fillStyle = '#FFE08A';
  ctx.font = `700 ${Math.round(s * 0.22)}px "Playfair Display", Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PHÚC', x, cy + s * 0.01);

  // Tua đỏ
  ctx.strokeStyle = '#C8231B';
  ctx.lineWidth = Math.max(1, s * 0.025);
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * s * 0.025, cy + s * 0.5);
    ctx.lineTo(x + i * s * 0.035, cy + s * 0.85);
    ctx.stroke();
  }
  ctx.restore();
}

/** Câu đối: dải giấy đỏ dọc, chữ vàng xếp từng chữ một. */
function scroll(ctx, x, y, w, h, words) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = w * 0.3;
  ctx.fillStyle = '#C8231B';
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#E3B341';
  ctx.lineWidth = Math.max(1, w * 0.05);
  ctx.strokeRect(x - w / 2 + w * 0.1, y + w * 0.1, w * 0.8, h - w * 0.2);
  ctx.fillStyle = '#FFE08A';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const step = h / (words.length + 0.4);
  const fs = Math.min(w * 0.5, step * 0.55);
  words.forEach((wd, i) => {
    // Chữ dài (THỊNH, VƯỢNG) thu nhỏ cho lọt lòng dải, chữ ngắn giữ cỡ lớn
    ctx.font = `700 ${Math.round(fs)}px "Playfair Display", Georgia, serif`;
    const fit = Math.min(1, (w * 0.74) / ctx.measureText(wd).width);
    ctx.font = `700 ${Math.round(fs * fit)}px "Playfair Display", Georgia, serif`;
    ctx.fillText(wd, x, y + step * (i + 0.7));
  });
  ctx.restore();
}

/** Bánh chưng: khối vuông lá dong xanh, buộc lạt tre. */
function banhChung(ctx, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.06);
  const g = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
  g.addColorStop(0, '#4E9A3A');
  g.addColorStop(1, '#245E22');
  ctx.fillStyle = g;
  ctx.shadowColor = 'rgba(0,0,0,.4)';
  ctx.shadowBlur = s * 0.15;
  ctx.fillRect(-s / 2, -s / 2, s, s);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#E8D9A8';
  ctx.lineWidth = s * 0.05;
  for (const k of [-0.18, 0.18]) {
    ctx.beginPath(); ctx.moveTo(k * s, -s / 2); ctx.lineTo(k * s, s / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s / 2, k * s); ctx.lineTo(s / 2, k * s); ctx.stroke();
  }
  ctx.restore();
}

/** Bao lì xì: phong bì đỏ, viền vàng, đồng tiền vàng giữa. */
function drawLixi(ctx, cx, cy, w, h, rot = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = w * 0.15;
  ctx.fillStyle = '#D42A1E';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.shadowBlur = 0;
  // Nắp phong bì
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.lineTo(0, -h / 2 + h * 0.28);
  ctx.lineTo(w / 2, -h / 2);
  ctx.fillStyle = '#B21C14';
  ctx.fill();
  ctx.strokeStyle = '#E3B341';
  ctx.lineWidth = Math.max(1, w * 0.05);
  ctx.strokeRect(-w / 2 + w * 0.06, -h / 2 + w * 0.06, w - w * 0.12, h - w * 0.12);
  ctx.beginPath();
  ctx.arc(0, h * 0.1, w * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = '#F2C94C';
  ctx.fill();
  ctx.fillStyle = '#B21C14';
  ctx.fillRect(-w * 0.06, h * 0.1 - w * 0.06, w * 0.12, w * 0.12);
  ctx.restore();
}

/**
 * Cảnh Tết trong lòng bàn cờ.
 * @param {number} x
 * @param {number} y góc trên trái lòng bàn cờ
 * @param {number} size cạnh lòng bàn cờ
 */
export function drawTetScene(ctx, x, y, size) {
  const cx = x + size / 2;

  // Hai cành hoa: mai vàng mọc từ góc dưới trái, đào hồng từ góc dưới phải
  branch(ctx, x + size * 0.02, y + size * 0.99, size * 0.6, -size * 0.75, size * 0.42, MAI, 11);
  branch(ctx, x + size * 0.02, y + size * 0.92, size * 0.9, -size * 0.2, size * 0.24, MAI, 23);
  branch(ctx, x + size * 0.98, y + size * 0.99, -size * 0.6, -size * 0.75, size * 0.42, DAO, 37);
  branch(ctx, x + size * 0.98, y + size * 0.92, -size * 0.9, -size * 0.2, size * 0.24, DAO, 41);

  // Đèn lồng treo hai góc trên
  lantern(ctx, x + size * 0.12, y + size * 0.03, size * 0.03, size * 0.11);
  lantern(ctx, x + size * 0.88, y + size * 0.03, size * 0.07, size * 0.095);

  // Câu đối hai bên
  const sw = size * 0.07, sh = size * 0.4;
  scroll(ctx, x + size * 0.07, y + size * 0.24, sw, sh, ['AN', 'KHANG']);
  scroll(ctx, x + size * 0.93, y + size * 0.24, sw, sh, ['THỊNH', 'VƯỢNG']);

  // Dưới chân tấm biển: bánh chưng bên trái, xấp lì xì bên phải
  banhChung(ctx, cx - size * 0.2, y + size * 0.87, size * 0.1);
  banhChung(ctx, cx - size * 0.29, y + size * 0.89, size * 0.08);
  drawLixi(ctx, cx + size * 0.2, y + size * 0.87, size * 0.07, size * 0.1, 0.18);
  drawLixi(ctx, cx + size * 0.27, y + size * 0.88, size * 0.07, size * 0.1, -0.12);
  drawLixi(ctx, cx + size * 0.235, y + size * 0.9, size * 0.07, size * 0.1, 0.04);

  // Cánh hoa rơi lác đác ở nửa trên
  const rand = rng(97);
  for (let i = 0; i < 18; i++) {
    const c = i % 2 ? MAI : DAO;
    blossom(ctx, x + size * (0.15 + rand() * 0.7), y + size * (0.06 + rand() * 0.3),
      size * (0.008 + rand() * 0.008), c, rand() * 6);
  }
}

/** Ảnh một cánh hoa rơi — mai hoặc đào. */
export function paintPetal(size, kind = 'mai') {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d');
  blossom(ctx, size / 2, size / 2, size * 0.46, kind === 'mai' ? MAI : DAO);
  return cv;
}

/** Ảnh bao lì xì cho tiền bay (tỉ lệ 1 : 1,4). */
export function paintLixi(w) {
  const h = Math.round(w * 1.4);
  const cv = document.createElement('canvas');
  cv.width = w + 8; cv.height = h + 8;
  drawLixi(cv.getContext('2d'), (w + 8) / 2, (h + 8) / 2, w, h);
  return cv;
}
