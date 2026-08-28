/**
 * Hoạ tiết truyền thống dùng chung: chim Lạc (Đông Sơn), mặt trống đồng,
 * hồi văn (fret) kiểu hoàng cung Huế, và vân giấy dó.
 */
import chimLacUrl from '../../assets/chim-lac.png';

/** Ảnh chim Lạc vẽ tay — nạp xong thì dùng thay hình vector. */
let birdImg = null;

/**
 * Nạp trước ảnh chim Lạc. Gọi trước khi vẽ bàn cờ; nếu ảnh hỏng hoặc
 * chưa kịp nạp thì `lacBird` tự rơi về nét vẽ vector như cũ.
 */
export function loadLacBird() {
  if (birdImg) return Promise.resolve(birdImg);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { birdImg = img; resolve(img); };
    img.onerror = () => resolve(null);
    img.src = chimLacUrl;
  });
}

/**
 * Vẽ ảnh chim Lạc vào đúng khung mà bản vector chiếm chỗ (rộng ~3.4 lần
 * `size`). Ảnh quay đầu về +x nên phải xoay thêm nửa vòng cho khớp hướng
 * bay của bản vector.
 */
function lacBirdImage(ctx, x, y, size, angle) {
  const w = size * 3.4;
  const h = w * (birdImg.naturalHeight / birdImg.naturalWidth);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI);
  ctx.drawImage(birdImg, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/**
 * Chim Lạc — dáng chim bay trên vành thứ mười mặt trống đồng Ngọc Lũ:
 * mỏ giáo dài gần bằng thân, mào hai lông vuốt ngược, cổ vươn thẳng,
 * thân thon, một cánh xoè ngược lên, ba lông đuôi xoè kéo dài về sau,
 * chân duỗi thẳng ra đằng đuôi.
 * Vẽ trong hệ cục bộ rộng ~3.4 (x: −1.50 … 1.90), cao ~1.8, đầu quay về −x.
 */
export function lacBird(ctx, x, y, size, angle, fill) {
  if (birdImg) { lacBirdImage(ctx, x, y, size, angle); return; }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(size, size);
  ctx.fillStyle = fill;

  // Mỏ giáo + đầu + cổ thon + thân — một nét liền
  ctx.beginPath();
  ctx.moveTo(0.94, 0.00);                                        // gốc đuôi
  ctx.bezierCurveTo(0.60, -0.20, 0.28, -0.30, 0.00, -0.30);      // lưng
  ctx.bezierCurveTo(-0.20, -0.30, -0.36, -0.26, -0.48, -0.22);   // cổ trên
  ctx.bezierCurveTo(-0.60, -0.19, -0.70, -0.28, -0.76, -0.16);   // bướu đầu
  ctx.lineTo(-1.42, 0.02);                                       // mỏ vuốt nhọn
  ctx.lineTo(-0.78, 0.14);
  ctx.bezierCurveTo(-0.68, 0.22, -0.56, 0.16, -0.46, 0.06);      // má + hàm dưới
  ctx.bezierCurveTo(-0.26, 0.02, -0.04, 0.14, 0.18, 0.26);       // cổ dưới → ức
  ctx.bezierCurveTo(0.40, 0.36, 0.70, 0.32, 0.94, 0.00);         // bụng → gốc đuôi
  ctx.closePath();
  ctx.fill();

  // Mào hai lông vuốt ngược sau gáy
  for (const [x0, y0, c1x, c1y, tx, ty, c2x, c2y, x1, y1] of [
    [-0.70, -0.20, -0.62, -0.58, -0.30, -0.70, -0.46, -0.46, -0.50, -0.24],
    [-0.52, -0.23, -0.44, -0.52, -0.16, -0.60, -0.34, -0.40, -0.36, -0.26],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(c1x, c1y, tx, ty);
    ctx.quadraticCurveTo(c2x, c2y, x1, y1);
    ctx.closePath();
    ctx.fill();
  }

  // Cánh bản rộng xoè ngược lên — khối chính để nhận ra con chim
  ctx.beginPath();
  ctx.moveTo(-0.12, -0.26);
  ctx.bezierCurveTo(0.10, -0.80, 0.48, -1.16, 0.92, -1.26);
  ctx.bezierCurveTo(0.90, -1.00, 0.86, -0.66, 0.78, -0.28);
  ctx.bezierCurveTo(0.48, -0.16, 0.12, -0.16, -0.12, -0.26);
  ctx.closePath();
  ctx.fill();

  // Ba lông đuôi bản dày, xoè hẹp về sau
  for (let i = 0; i < 3; i++) {
    const spread = -0.13 + i * 0.13;
    ctx.beginPath();
    ctx.moveTo(0.90, 0.02);
    ctx.bezierCurveTo(1.24, 0.02 + spread * 0.5, 1.56, spread, 1.86, spread * 1.4 - 0.05);
    ctx.lineTo(1.83, spread * 1.4 + 0.07);
    ctx.bezierCurveTo(1.54, spread + 0.12, 1.22, 0.14 + spread * 0.5, 0.90, 0.16);
    ctx.closePath();
    ctx.fill();
  }

  // Chân duỗi ngắn về sau
  ctx.strokeStyle = fill;
  ctx.lineWidth = 0.05;
  ctx.lineCap = 'round';
  for (const dy of [0.04, -0.04]) {
    ctx.beginPath();
    ctx.moveTo(0.36, 0.28);
    ctx.quadraticCurveTo(0.74, 0.48 + dy, 1.02, 0.52 + dy);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Mặt trống đồng Ngọc Lũ: ngôi sao 14 cánh ở tâm, các vành đồng tâm,
 * vành răng cưa, và vành chim Lạc bay ngược chiều kim đồng hồ.
 */
export function bronzeDrum(ctx, cx, cy, R, color, opts = {}) {
  // `birdAlpha` tách riêng để vành chim Lạc nổi hơn phần hoa văn chìm còn lại.
  const { birds = 16, birdSize = 0.088, alpha = 1, birdAlpha = alpha } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  const ring = (r, w) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  };

  // Ngôi sao 14 cánh
  const rays = 14, rOut = R * 0.20, rIn = R * 0.072;
  ctx.beginPath();
  for (let i = 0; i < rays * 2; i++) {
    const a = (i / (rays * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? rOut : rIn;
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  ring(R * 0.26, R * 0.006);
  ring(R * 0.30, R * 0.012);

  // Vành chấm tròn
  const dots = 40;
  for (let i = 0; i < dots; i++) {
    const a = (i / dots) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * R * 0.365, cy + Math.sin(a) * R * 0.365, R * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }

  ring(R * 0.42, R * 0.006);

  // Vành răng cưa
  const teeth = 48;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = ((i + 0.5) / teeth) * Math.PI * 2;
    const a2 = ((i + 1) / teeth) * Math.PI * 2;
    const rA = R * 0.47, rB = R * 0.53;
    if (i === 0) ctx.moveTo(cx + Math.cos(a0) * rA, cy + Math.sin(a0) * rA);
    ctx.lineTo(cx + Math.cos(a1) * rB, cy + Math.sin(a1) * rB);
    ctx.lineTo(cx + Math.cos(a2) * rA, cy + Math.sin(a2) * rA);
  }
  ctx.closePath();
  ctx.lineWidth = R * 0.007;
  ctx.stroke();

  ring(R * 0.58, R * 0.006);
  ring(R * 0.62, R * 0.014);

  // Vành chim Lạc
  const rBird = R * 0.775;
  ctx.globalAlpha = birdAlpha;
  for (let i = 0; i < birds; i++) {
    const a = (i / birds) * Math.PI * 2;
    const bx = cx + Math.cos(a) * rBird;
    const by = cy + Math.sin(a) * rBird;
    // Chim bay ngược chiều kim đồng hồ → đầu hướng theo tiếp tuyến.
    lacBird(ctx, bx, by, R * birdSize, a + Math.PI / 2, color);
  }
  ctx.globalAlpha = alpha;

  ring(R * 0.93, R * 0.006);
  ring(R * 0.97, R * 0.014);

  ctx.restore();
}

/**
 * Hồi văn (chữ Vạn / meander) — dải hoa văn viền kiểu cung đình Huế.
 * Vẽ một dải ngang dài `len`, cao `h`, bắt đầu tại (x, y).
 */
export function fretBand(ctx, x, y, len, h, color, lw) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';

  const step = h * 1.6;
  const n = Math.floor(len / step);
  const pad = h * 0.22;

  for (let i = 0; i < n; i++) {
    const ox = i * step + (len - n * step) / 2;
    ctx.beginPath();
    // Móc xoắn vuông lồng nhau
    ctx.moveTo(ox + pad, h - pad);
    ctx.lineTo(ox + pad, pad);
    ctx.lineTo(ox + step - pad, pad);
    ctx.lineTo(ox + step - pad, h - pad * 2.2);
    ctx.lineTo(ox + pad * 2.4, h - pad * 2.2);
    ctx.lineTo(ox + pad * 2.4, pad * 2.4);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Khối "thắt nút" (盘长 / lưới trám): năm ô vuông xếp so le chạm nhau ở góc,
 * tạo ra mắt lưới hình trám — mô-típ hay thấy trên biển hiệu Chợ Lớn xưa.
 */
function knotBlock(ctx, x, y, w, h, lw) {
  const s = Math.min(w, h);
  const cell = s / 3;
  const ox = x + (w - s) / 2, oy = y + (h - s) / 2;
  ctx.lineWidth = lw;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if ((i + j) % 2 === 0) ctx.strokeRect(ox + i * cell, oy + j * cell, cell, cell);
    }
  }
}

/** Móc hồi văn (chữ 回): xoắn vuông một vòng rưỡi, mở lên hoặc xuống. */
function keyHook(ctx, x, y, w, h, lw, down) {
  const p = lw * 1.2;
  ctx.save();
  ctx.translate(x, down ? y : y + h);
  if (!down) ctx.scale(1, -1);
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(p, h - p);
  ctx.lineTo(p, p);
  ctx.lineTo(w - p, p);
  ctx.lineTo(w - p, h - p * 3.2);
  ctx.lineTo(p * 3.4, h - p * 3.2);
  ctx.lineTo(p * 3.4, p * 3.4);
  ctx.stroke();
  ctx.restore();
}

/**
 * Dải hoa văn đầu biển hiệu: khối thắt nút xen kẽ móc hồi văn, hai móc
 * liền nhau lật ngược chiều nhau cho cài vào nhau.
 * Vẽ trong khung (x, y, len, h). Đặt `knots: false` cho dải hẹp — khối
 * thắt nút cần chỗ, ở dải mỏng chỉ còn là vệt rối.
 */
export function knotFretBand(ctx, x, y, len, h, color, lw, opts = {}) {
  const { knots = true } = opts;
  const n = Math.max(1, Math.round(len / (h * (knots ? 2.0 : 1.3))));
  const u = len / n;
  const knotW = knots ? Math.min(u * 0.44, h) : 0;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  for (let i = 0; i < n; i++) {
    const ox = x + i * u;
    if (knots) knotBlock(ctx, ox, y, knotW, h, lw);
    keyHook(ctx, ox + knotW, y, u - knotW, h, lw, i % 2 === 0);
  }
  ctx.restore();
}

/** Biển tên bát giác (vát bốn góc) — dáng biển hiệu gỗ khắc. */
export function plaquePath(ctx, x, y, w, h, cut) {
  const c = Math.min(cut, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

/** Vân giấy dó: chấm nhiễu mờ để mặt phẳng bớt "phẳng". */
export function paperGrain(ctx, x, y, w, h, amount = 0.05, seed = 1) {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const n = Math.floor((w * h) / 900);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const px = x + rnd() * w, py = y + rnd() * h;
    const r = rnd() * 1.6 + 0.35;
    ctx.globalAlpha = rnd() * amount;
    ctx.fillStyle = rnd() > 0.5 ? '#000' : '#fff';
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Khung chữ nhật bo góc. */
export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Mây cuộn (vân kiên) — mô-típ mây chạm khắc: mấy múi mây tròn xếp liền nhau,
 * đầu mây xoáy thành vòng ốc, chân mây vuốt thành nét mảnh về đuôi.
 *
 * Vẽ trong hộp đơn vị: x chạy từ −1 (đuôi) đến +1 (đầu mây), y từ −0.5 (đỉnh
 * múi) đến +0.35 (chân mây). `flip` lật ngang để làm cặp mây đối xứng.
 */
export function cloudScroll(ctx, x, y, size, color, lw, flip = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -size : size, size);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw / size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Viền trên: ba múi mây to dần về phía đầu
  ctx.beginPath();
  ctx.moveTo(-1.00, 0.10);
  ctx.bezierCurveTo(-0.92, -0.24, -0.60, -0.28, -0.50, 0.02);
  ctx.bezierCurveTo(-0.42, -0.34, -0.04, -0.42, 0.06, -0.04);
  ctx.bezierCurveTo(0.16, -0.44, 0.62, -0.44, 0.66, -0.02);
  ctx.stroke();

  // Đầu mây xoáy ốc
  ctx.beginPath();
  for (let i = 0; i <= 34; i++) {
    const t = i / 34;
    const a = -Math.PI * 0.62 + t * Math.PI * 2.15;
    const r = 0.34 * (1 - t * 0.74);
    const px = 0.44 + Math.cos(a) * r, py = 0.02 + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.stroke();

  // Chân mây vuốt về đuôi
  ctx.beginPath();
  ctx.moveTo(0.28, 0.32);
  ctx.bezierCurveTo(-0.08, 0.40, -0.62, 0.36, -1.02, 0.18);
  ctx.stroke();

  ctx.restore();
}

/**
 * Mái đình nhìn chính diện: bờ nóc thẳng trên đỉnh, hai mái dốc xuống, diềm
 * mái võng ở giữa và hai đầu đao vút ngược lên.
 * Khung (x, y, len, h): `len` đo hết hai mút đầu đao, `y` là mức bờ nóc,
 * `h` là khoảng từ bờ nóc xuống chỗ võng nhất của diềm mái.
 */
export function curvedRoof(ctx, x, y, len, h, color) {
  const cx = x + len / 2;
  const k = len / 2 / 1.16;   // nửa bề ngang tính đến góc mái, chưa kể đầu đao
  ctx.save();
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.moveTo(cx - k * 0.42, y);                                            // bờ nóc
  ctx.lineTo(cx + k * 0.42, y);
  ctx.lineTo(cx + k * 0.90, y + h * 0.56);                                 // dốc mái phải
  ctx.quadraticCurveTo(cx + k * 1.02, y + h * 0.34, cx + k * 1.16, y + h * 0.20);
  ctx.quadraticCurveTo(cx + k * 1.06, y + h * 0.62, cx + k * 0.96, y + h * 0.90);
  ctx.quadraticCurveTo(cx + k * 0.48, y + h, cx, y + h);                   // diềm mái võng
  ctx.quadraticCurveTo(cx - k * 0.48, y + h, cx - k * 0.96, y + h * 0.90);
  ctx.quadraticCurveTo(cx - k * 1.06, y + h * 0.62, cx - k * 1.16, y + h * 0.20);
  ctx.quadraticCurveTo(cx - k * 1.02, y + h * 0.34, cx - k * 0.90, y + h * 0.56);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/** Hoa văn góc: bốn cánh sen cách điệu. */
export function lotusCorner(ctx, x, y, size, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(size, size);
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate((i - 1) * 0.42);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(0.30, -0.20, 0.52, -0.60, 0.42, -1.0);
    ctx.bezierCurveTo(0.18, -0.72, -0.10, -0.44, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
