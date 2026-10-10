/**
 * Cảnh bộ xương diễn giữa nghĩa địa Halloween khi có chuyện trên bàn: mua
 * đất, xây nhà / khách sạn, đóng thuế, trả tiền thuê, dừng ở nhà ga, Thuỷ Cục,
 * Nhà Máy Điện. Hàng bộ xương nhảy (`dance.js`) mờ đi trong lúc diễn rồi hiện
 * lại.
 *
 * Mỗi cảnh là một hàm vẽ canvas 2D theo thời gian `t` (giây) — không dựng sẵn
 * khung hình như hàng nhảy, vì đạo cụ (tay xương, quan tài, xe tải, thác
 * nước, tia điện) đổi hình liên tục. `BoardScene` vẽ vào một CanvasTexture phủ
 * lòng bàn mỗi khung hình trong lúc có cảnh.
 *
 * Toạ độ: `C.U` là cạnh lòng bàn tính theo đơn vị vẽ, `C.G` là mặt đất (0.84U,
 * gần làn giữa của hàng nhảy), `C.s` cỡ bộ xương diễn chính.
 */
import { drawSkeleton, drawHalloweenIcon, paintHauntedHouse, paintHauntedCastle } from './halloweenArt.js';

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, p) => a + (b - a) * p;
const ease = (p) => p * p * (3 - 2 * p);
/** Tiến độ 0→1 của đoạn [a, b] tại thời điểm t. */
const seg = (t, a, b) => clamp((t - a) / (b - a));
/** Số giả ngẫu nhiên cố định theo hạt, để mảnh đất văng giống nhau mỗi lần xem. */
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

const BONE = '#ECE6D6';

/* ------------------------------------------------------------- hình học xương */

/* Chép đúng hệ toạ độ của drawSkeleton: gốc ở bàn chân, hông cao 0.46s, vai
   (0.03s, -0.78s). Cần để biết bàn tay đang ở đâu mà gắn đạo cụ vào. */
function legPts(s, a, kb, toe) {
  const hip = [0, -s * 0.46];
  const k = [hip[0] + Math.sin(a) * s * 0.23, hip[1] + Math.cos(a) * s * 0.23];
  const f = [k[0] + Math.sin(a - kb) * s * 0.23, k[1] + Math.cos(a - kb) * s * 0.23];
  const t = toe ? [f[0] + s * 0.04, f[1] + s * 0.045] : [f[0] + s * 0.06, f[1]];
  return [k, f, t];
}
const bobOf = (s, P) => -Math.max(...P.legs.map((l) => legPts(s, ...l)[2][1]));
function handLocal(s, P, back) {
  const sh = [s * 0.03, -s * 0.78];
  const [a, eb] = P.arms[back ? 0 : 1];
  const e = [sh[0] + Math.sin(a) * s * 0.17, sh[1] + Math.cos(a) * s * 0.17];
  return [e[0] + Math.sin(a + eb) * s * 0.16, e[1] + Math.cos(a + eb) * s * 0.16];
}
const headLocal = (s) => [s * 0.06, -s * 0.91];
/** Điểm trong hệ bộ xương → toạ độ màn hình, tính cả gập hông (bow, chỉ thân trên), nhún (bob) và ngả (lean). */
function skelPt(x, y, s, P, dir, p, upper = true) {
  const bob = bobOf(s, P);
  let px = p[0], py = p[1];
  if (upper && P.bow) {
    const a = P.bow * 1.05, hy = -s * 0.46, c = Math.cos(a), sn = Math.sin(a);
    [px, py] = [px * c - (py - hy) * sn, px * sn + (py - hy) * c + hy];
  }
  py += bob;
  const c = Math.cos(P.lean || 0), sn = Math.sin(P.lean || 0);
  [px, py] = [px * c - py * sn, px * sn + py * c];
  return [x + dir * px, y + py];
}
const handAt = (x, y, s, P, dir, back = false) => skelPt(x, y, s, P, dir, handLocal(s, P, back));
const headAt = (x, y, s, P, dir) => skelPt(x, y, s, P, dir, headLocal(s));

/* Tư thế */
const STAND = () => ({ legs: [[-0.09, 0, false], [0.09, 0, false]], arms: [[-0.12, 0.25], [0.12, 0.25]] });
/** Bước đi giống quân cờ đi bộ của game: pha p, tay đánh theo chân trừ khi đưa `arms`. */
function walkPose(p, arms) {
  const leg = (q) => [Math.sin(q) * 0.5, Math.max(0, -Math.cos(q)) * 0.7, false];
  const arm = (q) => [-Math.sin(q) * 0.6, 0.35 + Math.max(0, Math.sin(q)) * 0.4];
  return { legs: [leg(p + Math.PI), leg(p)], arms: arms ?? [arm(p + Math.PI), arm(p)] };
}
/** Quỳ một gối: gối sau chạm đất, cẳng sau nằm ngang; đùi trước nằm ngang, cẳng trước thẳng đứng. */
const KNEEL = () => ({ legs: [[0.02, 1.6, false], [1.5, 1.5, false]], arms: [[0.3, 0.4], [0.4, 0.3]] });
function mixPose(A, B, p) {
  const n = (a, b) => (a ?? 0) + ((b ?? 0) - (a ?? 0)) * p;
  return {
    legs: A.legs.map((l, i) => [n(l[0], B.legs[i][0]), n(l[1], B.legs[i][1]), p < 0.5 ? l[2] : B.legs[i][2]]),
    arms: A.arms.map((a, i) => [n(a[0], B.arms[i][0]), n(a[1], B.arms[i][1])]),
    lean: n(A.lean, B.lean), tilt: n(A.tilt, B.tilt), bow: n(A.bow, B.bow),
  };
}
/** Pha bước chân theo quãng đã đi, để bàn chân không trượt trên đất. */
const stride = (dist, s) => (dist / (s * 0.42)) * Math.PI;

function skel(g, x, y, s, P, o = {}) {
  drawSkeleton(g, x, y, s, { pose: P, hat: o.hat, dir: o.dir ?? 1, lw: o.lw ?? 1.2, down: o.down, bow: P.bow });
}

/* ------------------------------------------------------------- lớp vẽ phụ */

/* drawSkeleton tự đặt globalAlpha nên không làm mờ được bằng alpha của
   context. Muốn mờ hay nhuộm màu thì vẽ ra canvas phụ rồi dán lại. */
const pool = [];
/** Canvas đích và số điểm ảnh mỗi đơn vị vẽ của lần `paintSkit` đang chạy. */
let CV = null, DPR = 1;
function scratch(i) {
  if (!pool[i]) pool[i] = document.createElement('canvas');
  const c = pool[i];
  if (c.width !== CV.width || c.height !== CV.height) { c.width = CV.width; c.height = CV.height; }
  const x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, c.width, c.height);
  x.setTransform(DPR, 0, 0, DPR, 0, 0);
  return [c, x];
}
let depth = 0;
/** Vẽ `fn` lên lớp riêng, nhuộm `tint` (độ phủ tintA), rồi dán với độ mờ alpha. */
function layer(g, fn, { alpha = 1, tint, tintA = 1, glow, glowBlur = 0 } = {}) {
  const [c, x] = scratch(depth++);
  fn(x);
  depth--;
  if (tint) {
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.globalAlpha = tintA; x.fillStyle = tint; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
  }
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = alpha;
  if (glow) { g.shadowColor = glow; g.shadowBlur = glowBlur * DPR; }
  g.drawImage(c, 0, 0);
  g.restore();
}

/* ------------------------------------------------------------- đạo cụ chung */

function witchHat(g, x, y, r, color, rot = 0) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = '#2C1A47';
  g.beginPath(); g.ellipse(0, 0, r * 1.65, r * 0.32, 0, 0, TAU); g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(-r * 0.95, -r * 0.05); g.lineTo(r * 0.95, -r * 0.05);
  g.quadraticCurveTo(r * 0.5, -r * 1.2, -r * 0.2, -r * 1.7);
  g.quadraticCurveTo(-r * 0.9, -r * 2.1, -r * 1.3, -r * 1.55);
  g.quadraticCurveTo(-r * 0.6, -r * 1.35, -r * 0.95, -r * 0.05);
  g.fill();
  g.fillStyle = '#2C1A47'; g.fillRect(-r * 0.95, -r * 0.42, r * 1.9, r * 0.34);
  g.fillStyle = '#E8742A'; g.fillRect(-r * 0.22, -r * 0.4, r * 0.44, r * 0.3);
  g.restore();
}

function coin(g, x, y, r, spin = 1) {
  const w = Math.max(0.15, Math.abs(spin));
  g.save(); g.translate(x, y); g.scale(w, 1);
  g.fillStyle = '#B8860B'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.fillStyle = '#F2C14E'; g.beginPath(); g.arc(0, 0, r * 0.8, 0, TAU); g.fill();
  g.fillStyle = '#B8860B'; g.fillRect(-r * 0.12, -r * 0.45, r * 0.24, r * 0.9);
  g.restore();
}

function puff(g, x, y, r, a, color = '200,190,220') {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${color},${a})`); gr.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/* ================================================================ SỰ KIỆN */

/* Mỗi cảnh: tên, thời lượng, các nhịp (giây → mô tả, ghi lại kịch bản đã
   duyệt để sửa đúng chỗ), và hàm vẽ draw(g, t, C). */
const EVENTS = {};

/* 1. MUA ĐẤT ------------------------------------------------------------- */

const BONE_LINE = '#8A8070';

/**
 * Cẳng tay xương phải thò lên từ đất, gốc (0,0) ở mặt đất, trục hướng lên,
 * dài L. Nắm tay ở (0, -0.82L), nhìn thấy mu bàn tay: ngón cái bên trái,
 * bốn đốt ngón cong vắt ngang trước cuống hoa.
 */
function boneArm(g, L) {
  g.lineCap = 'round';
  const knob = (x, y, r) => {
    g.fillStyle = BONE; g.strokeStyle = BONE_LINE; g.lineWidth = L * 0.008;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.stroke();
  };
  /* Hai xương cẳng tay (quay, trụ) cong phình ra ở giữa, chụm lại ở cổ tay
     và dưới mặt đất. Khe giữa có hình thấu kính nên đọc ra là khoảng hở
     giữa hai xương, không thành một vệt tối thẳng chạy dọc tay. */
  const bone = (x0, y0, cx, cy, x1, y1, w) => {
    for (const [c, lw] of [[BONE_LINE, w + L * 0.014], [BONE, w]]) {
      g.strokeStyle = c; g.lineWidth = lw;
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke();
    }
  };
  bone(-L * 0.025, L * 0.12, -L * 0.1, -L * 0.26, -L * 0.03, -L * 0.64, L * 0.04);
  bone(L * 0.025, L * 0.12, L * 0.095, -L * 0.26, L * 0.032, -L * 0.62, L * 0.034);
  knob(-L * 0.03, -L * 0.65, L * 0.03); knob(L * 0.032, -L * 0.63, L * 0.026);
  // Cổ tay và mu bàn tay
  g.fillStyle = BONE; g.strokeStyle = BONE_LINE; g.lineWidth = L * 0.01;
  g.beginPath(); g.ellipse(0, -L * 0.7, L * 0.06, L * 0.035, 0, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.roundRect(-L * 0.07, -L * 0.88, L * 0.14, L * 0.16, L * 0.03); g.fill(); g.stroke();
  // Đường xương bàn mờ trên mu
  g.strokeStyle = 'rgba(138,128,112,.6)'; g.lineWidth = L * 0.006;
  for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * L * 0.03, -L * 0.74); g.lineTo(i * L * 0.035, -L * 0.86); g.stroke(); }
}
/** Phần ngón tay vẽ đè lên cuống hoa, để trông như nắm quanh cuống. */
function boneFingers(g, L) {
  g.fillStyle = BONE; g.strokeStyle = BONE_LINE; g.lineWidth = L * 0.008;
  for (let i = 0; i < 4; i++) {
    const y = -L * 0.9 + i * L * 0.045;
    g.beginPath(); g.roundRect(-L * 0.02, y - L * 0.018, L * 0.1, L * 0.036, L * 0.018); g.fill(); g.stroke();
    g.beginPath(); g.arc(L * 0.08, y, L * 0.016, 0, TAU); g.fill(); g.stroke();
  }
  // Ngón cái chéo từ trái sang, đè lên ngón trỏ
  g.beginPath(); g.ellipse(-L * 0.045, -L * 0.88, L * 0.05, L * 0.018, -0.6, 0, TAU); g.fill(); g.stroke();
}

/** Hoa cúc không mặt: cánh màu người mua, nhuỵ vàng chấm hạt; tâm (x, y), nghiêng `rot`. */
function flower(g, x, y, r, color, rot) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.scale(1, 0.82); // nghiêng mặt hoa đi một chút nên nhìn hơi dẹt
  const n = 12;
  for (let i = 0; i < n; i++) {
    g.save(); g.rotate((i / n) * TAU);
    g.fillStyle = color;
    g.beginPath(); g.ellipse(0, -r * 0.92, r * 0.26, r * 0.55, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = r * 0.04; g.stroke();
    g.restore();
  }
  g.fillStyle = '#E8B23A'; g.beginPath(); g.arc(0, 0, r * 0.5, 0, TAU); g.fill();
  g.strokeStyle = '#9A6A14'; g.lineWidth = r * 0.05; g.stroke();
  g.fillStyle = '#9A6A14';
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, d = r * 0.33 * Math.sqrt((i + 0.5) / 9);
    g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.04, 0, TAU); g.fill();
  }
  g.restore();
}

EVENTS.buy = {
  name: 'Mua đất', hint: 'Tay xương cầm hoa chui lên, vẩy vẩy', dur: 4.8,
  beats: [[0, 'Đất nứt, mảnh đất văng'], [0.3, 'Hoa nhô lên trước, rồi tới bàn tay xương phải nắm cuống'],
    [1.4, 'Tay vẩy hoa qua lại, đầu hoa trễ theo nhịp vẩy'], [1.8, 'Màu người mua loang ra khắp mảnh đất'],
    [4.2, 'Vẩy chậm dần, tay và hoa mờ đi cùng nhau']],
  draw(g, t, C) {
    const k = 1;
    const bx = C.U * 0.5, by = C.G;
    const L = C.U * 0.2;
    const color = C.actor;

    // Màu loang thành vệt elip trên đất
    const wave = ease(seg(t, 1.8, 3.2));
    if (wave > 0) {
      const R = C.U * 0.46 * wave;
      g.save(); g.translate(bx, by); g.scale(1, 0.24);
      const gr = g.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
      gr.addColorStop(0, rgba(color, 0.55)); gr.addColorStop(0.75, rgba(color, 0.3)); gr.addColorStop(1, rgba(color, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
      g.strokeStyle = rgba(color, 0.9 * (1 - wave)); g.lineWidth = C.U * 0.02 * k;
      g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke();
      g.restore();
      for (let i = 0; i < 14; i++) {
        const a = hash(i) * TAU, d = R * (0.4 + hash(i + 40) * 0.6);
        const life = seg(t, 1.8 + hash(i + 9) * 0.6, 3.8);
        if (life <= 0 || life >= 1) continue;
        const px = bx + Math.cos(a) * d, py = by + Math.sin(a) * d * 0.24 - life * C.U * 0.12 * k;
        g.fillStyle = rgba(color, 1 - life);
        g.beginPath(); g.ellipse(px, py, C.U * 0.007 * k, C.U * 0.004 * k, a + t * 3, 0, TAU); g.fill();
      }
    }

    /* Cả cụm tay + hoa nghiêng phải TILT quanh gốc ở mặt đất. Tay trồi lên
       0.3→1.4s mang theo hoa (hoa ló khỏi đất trước vì ở cao hơn), rồi vẩy
       qua lại tới hết cảnh; cả cụm mờ đi cùng nhau ở 0.4s cuối. Đầu hoa trễ
       theo nhịp vẩy (cong ngược chiều tay đang quật) cho có quán tính. */
    const swing = seg(t, 1.4, 1.8) * (1 - seg(t, 4.2, 4.6));
    const ph = (t - 1.4) * TAU * 1.5;
    const TILT = 0.14 + Math.sin(ph) * 0.3 * swing;
    const lagV = Math.cos(ph) * swing;                // tay đang quật về phía nào
    const rise = ease(seg(t, 0.3, 1.4));
    const armDrop = L * 0.84 * (1 - rise);
    // Cuống: thẳng dưới nắm tay, phần trên cong sang phải rồi tới đầu hoa
    const fistY = -L * 0.84 * rise;                 // toạ độ nắm tay (hệ nghiêng, lên là âm)
    const stemTop = [L * 0.2 - lagV * L * 0.1, fistY - L * 0.5];
    const sway = Math.sin(t * 2.6) * 0.06 * (1 - swing) - lagV * 0.25;
    const fr = L * 0.16;

    g.save();
    g.translate(bx, by); g.rotate(TILT);
    // Chỉ thấy phần trên mặt đất (trong hệ nghiêng, mặt đất xấp xỉ y = 0)
    g.save();
    g.beginPath(); g.rect(-L * 2, -L * 3, L * 4, L * 3); g.clip();
    const head = [stemTop[0], stemTop[1]];
    g.strokeStyle = '#3F7A28'; g.lineWidth = L * 0.03; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, fistY + L * 0.12); g.lineTo(0, fistY - L * 0.08);
    g.quadraticCurveTo(L * 0.01, head[1] + L * 0.12, head[0], head[1]); g.stroke();
    // Một lá mọc giữa cuống
    g.fillStyle = '#4E8A2E';
    g.beginPath(); g.ellipse(L * 0.07, fistY - L * 0.2, L * 0.08, L * 0.025, -0.7 - lagV * 0.3, 0, TAU); g.fill();
    // Tay
    g.save(); g.translate(0, armDrop);
    boneArm(g, L);
    boneFingers(g, L);
    g.restore();
    // Hoa nghiêng thêm theo chiều cong của cuống
    flower(g, head[0], head[1], fr, color, 0.35 + sway);
    g.restore();
    g.restore();

    // Ụ đất và mảnh đất văng
    const crack = seg(t, 0, 0.5);
    if (crack > 0) {
      g.fillStyle = '#2E2036';
      g.beginPath(); g.ellipse(bx, by, L * 0.42 * Math.min(1, crack * 2), L * 0.09, 0, Math.PI, TAU); g.fill();
      g.strokeStyle = '#120B1D'; g.lineWidth = L * 0.012;
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i + 0.5) / 5 * Math.PI;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a) * L * 0.4 * crack, by + Math.sin(a) * L * 0.08); g.stroke();
      }
    }
    for (let i = 0; i < 10; i++) {
      const u = seg(t, 0.25 + hash(i) * 0.2, 1.2 + hash(i) * 0.3);
      if (u <= 0 || u >= 1) continue;
      const vx = (hash(i + 3) - 0.5) * L * 1.6, vy = L * (0.8 + hash(i + 7));
      const px = bx + vx * u, py = by - vy * u + vy * 1.4 * u * u;
      g.fillStyle = '#3A2A44';
      g.fillRect(px, py, L * 0.04, L * 0.035);
    }
  },
};

/* 2. XÂY NHÀ ------------------------------------------------------------- */

let houseImg = null, castleImg = null;

function buildEvent(hotel) {
  return {
    name: hotel ? 'Xây khách sạn' : 'Xây nhà',
    hint: hotel ? 'Khiêng lâu đài ma đặt xuống' : 'Khiêng nhà ma đặt xuống giữa bàn',
    dur: 4.8,
    beats: [[0, 'Bộ xương đội căn nhà trên đầu, đi vào'], [1.6, 'Khom người, hạ nhà xuống'],
      [2.5, 'Buông tay, nhà rơi chạm đất, bụi bốc'], [2.8, 'Đứng thẳng dậy, phủi tay'],
      [3.0, 'Cửa sổ sáng đèn, bí ngô màu người xây bật sáng'], [4.2, 'Mờ dần']],
    draw(g, t, C) {
      const s = C.s, G = C.G;
      const img = hotel ? (castleImg ??= paintHauntedCastle(256)) : (houseImg ??= paintHauntedHouse(256));
      const hs = C.U * (hotel ? 0.2 : 0.17);
      const stopX = C.U * 0.38, start = -C.U * 0.12;
      const walkT = seg(t, 0, 1.6);
      const x = lerp(start, stopX, walkT);
      const UP = { arms: [[2.75, 0.35], [2.95, 0.25]] };
      const BEND = { legs: [[-0.3, 0.5, false], [0.55, 1.1, false]], arms: [[0.75, 0.15], [0.9, 0.05]], bow: 0.55, tilt: 0.25 };
      let P;
      const down = ease(seg(t, 1.6, 2.5)), up = ease(seg(t, 2.8, 3.3));
      if (t < 1.6) P = walkPose(stride(x - start, s), UP.arms);
      else if (t < 2.8) P = mixPose({ ...STAND(), arms: UP.arms }, BEND, down);
      else {
        P = mixPose(BEND, STAND(), up);
        // Phủi tay: hai bàn tay đập vào nhau trước ngực
        const c = seg(t, 3.3, 4.0);
        if (c > 0 && c < 1) { const w = Math.abs(Math.sin(c * Math.PI * 4)); P.arms = [[1.2, 0.9 + 0.4 * w], [1.0, 1.0 + 0.4 * w]]; }
      }
      // Nhà bám theo tay tới lúc buông, rồi rơi tự do xuống đất
      const hand = handAt(x, G, s, P, 1);
      const handFar = handAt(x, G, s, P, 1, true);
      const hx = (hand[0] + handFar[0]) / 2;
      let houseX, houseB;
      const relX = handAt(stopX, G, s, BEND, 1)[0] + hs * 0.42;
      if (t < 2.5) {
        houseX = hx + hs * 0.42 * down;
        houseB = Math.min(hand[1], handFar[1]) + hs * 0.06;
      } else {
        const relY = handAt(stopX, G, s, BEND, 1)[1] + hs * 0.06;
        const f = seg(t, 2.5, 2.72);
        houseX = relX;
        houseB = Math.min(G, lerp(relY, G, f * f));
        const bounce = seg(t, 2.72, 2.95);
        if (bounce > 0 && bounce < 1) houseB = G - Math.sin(bounce * Math.PI) * hs * 0.05;
      }
      // Quầng màu chủ dưới chân nhà
      const lit = ease(seg(t, 3.0, 3.6));
      if (lit > 0) {
        g.save(); g.translate(relX, G); g.scale(1, 0.22);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, hs * 0.9);
        gr.addColorStop(0, rgba(C.actor, 0.55 * lit)); gr.addColorStop(1, rgba(C.actor, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, hs * 0.9, 0, TAU); g.fill();
        g.restore();
      }
      // Nhà đè lên tay lúc đội trên đầu thì trông như cầm; đèn tắt cho tới khi đặt xong
      const drawHouse = () => {
        const sq = t > 2.72 && t < 2.95 ? 1 - Math.sin(seg(t, 2.72, 2.95) * Math.PI) * 0.08 : 1;
        g.save(); g.translate(houseX, houseB); g.scale(1 + (1 - sq) * 0.5, sq);
        g.drawImage(img, -hs / 2, -hs * 0.92, hs, hs);
        // Che cửa sổ cho tới khi lên đèn
        g.globalAlpha = 1 - lit;
        g.fillStyle = '#2A2238';
        const k = hs / 64;
        const wins = hotel ? [[10, 34, 4, 6], [50, 34, 4, 6], [22, 40, 5, 6], [37, 40, 5, 6]] : [[18, 36, 9, 9], [37, 37, 9, 9]];
        for (const [wx, wy, ww, wh] of wins) g.fillRect(-hs / 2 + wx * k, -hs * 0.92 + wy * k, ww * k, wh * k);
        g.restore();
        if (lit > 0) {
          g.save(); g.globalCompositeOperation = 'lighter';
          puff(g, houseX, houseB - hs * 0.4, hs * 0.55, 0.22 * lit, '255,210,122');
          g.restore();
        }
      };
      if (t < 2.5) { skel(g, x, G, s, P, { hat: C.actor }); drawHouse(); }
      else { drawHouse(); skel(g, x, G, s, P, { hat: C.actor }); }
      // Bụi lúc chạm đất
      const dust = seg(t, 2.7, 3.4);
      if (dust > 0 && dust < 1) for (let i = 0; i < 6; i++) {
        const side = i % 2 ? 1 : -1;
        puff(g, relX + side * hs * (0.35 + dust * 0.4 + hash(i) * 0.1), G - hs * 0.04 - dust * hs * 0.1 * hash(i + 5), hs * 0.16 * (0.6 + dust), 0.4 * (1 - dust));
      }
      // Bí ngô sáng bật lên cạnh nhà, mang quầng màu người xây
      const pop = seg(t, 3.3, 3.6);
      if (pop > 0) {
        const ps = hs * 0.32 * (pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.4 : 1) * pop;
        const px = relX + hs * 0.62, py = G - ps * 0.42;
        g.save(); g.globalCompositeOperation = 'lighter'; puff(g, px, py, ps * 1.6, 0.5, hexRGB(C.actor)); g.restore();
        drawHalloweenIcon(g, 'pumpkinLit', px, py, ps);
      }
    },
  };
}
const hexRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return `${n >> 16},${(n >> 8) & 255},${n & 255}`; };
EVENTS.build = buildEvent(false);
EVENTS.hotel = buildEvent(true);

/* 3. THU THUẾ ------------------------------------------------------------ */

function topHat(g, x, y, r, dir, lift = 0, rot = 0) {
  g.save(); g.translate(x, y - lift); g.rotate(rot * dir);
  g.fillStyle = '#0B0712';
  g.beginPath(); g.ellipse(0, 0, r * 1.45, r * 0.26, 0, 0, TAU); g.fill();
  g.fillRect(-r * 0.85, -r * 1.7, r * 1.7, r * 1.7);
  g.fillStyle = '#7A1E2A'; g.fillRect(-r * 0.85, -r * 0.5, r * 1.7, r * 0.3);
  g.strokeStyle = '#3A2A55'; g.lineWidth = r * 0.08; g.strokeRect(-r * 0.85, -r * 1.7, r * 1.7, r * 1.7);
  g.restore();
}

EVENTS.tax = {
  name: 'Đóng thuế', hint: 'Quỳ xuống dâng tiền cho bộ xương ngân hàng', dur: 5.4,
  beats: [[0, 'Ngân hàng đội mũ chóp, đeo kính một mắt, gõ chân chờ'], [0, 'Người đi bước vào'],
    [1.2, 'Quỳ một gối, cúi đầu, hai tay dâng lên'], [1.8, 'Từng đồng xu bay sang tay ngân hàng'],
    [3.8, 'Ngân hàng nhấc mũ, người quỳ cúi rạp hơn'], [4.8, 'Mờ dần']],
  draw(g, t, C) {
    const s = C.s, G = C.G;
    // Ngân hàng: quay mặt sang trái, tay trước ngửa ra đón, tay sau chống hông
    const bx = C.U * 0.66;
    const tap = t < 1.2 ? Math.max(0, Math.sin(t * 14)) : 0;
    const nod = t > 3.8 && t < 4.6 ? Math.sin(seg(t, 3.8, 4.6) * Math.PI) * 0.12 : 0;
    const BP = {
      legs: [[-0.08, 0, false], [0.12 + tap * 0.12, tap * 0.2, tap > 0.3]],
      arms: [[-0.55, 1.9], [1.35, -0.25]],
      lean: -0.04 + nod,
    };
    // Két sắt sau lưng ngân hàng
    const kx = bx + C.U * 0.1, kw = C.U * 0.075, kh = C.U * 0.06;
    g.fillStyle = '#2A2238'; g.fillRect(kx - kw / 2, G - kh, kw, kh);
    g.strokeStyle = '#B8860B'; g.lineWidth = C.U * 0.003; g.strokeRect(kx - kw / 2, G - kh, kw, kh);
    g.beginPath(); g.arc(kx, G - kh / 2, kh * 0.18, 0, TAU); g.stroke();

    skel(g, bx, G, s, BP, { dir: -1 });
    const head = headAt(bx, G, s, BP, -1);
    const r = s * 0.1;
    // Kính một mắt ở hốc mắt phía trước
    g.strokeStyle = '#F2C14E'; g.lineWidth = s * 0.012;
    g.beginPath(); g.arc(head[0] - r * 0.38, head[1] - r * 0.05, r * 0.36, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(head[0] - r * 0.38, head[1] + r * 0.3); g.quadraticCurveTo(head[0] - r * 0.1, head[1] + r * 1.4, head[0] + r * 0.4, head[1] + r * 1.6); g.stroke();
    const lift = t > 3.8 ? Math.sin(seg(t, 3.8, 4.6) * Math.PI) * r * 1.2 : 0;
    topHat(g, head[0], head[1] - r * 0.75, r, -1, lift, lift ? -0.3 : 0);

    // Người đóng thuế
    const stopX = C.U * 0.43, start = -C.U * 0.1;
    const x = lerp(start, stopX, seg(t, 0, 1.2));
    const OFFER = { ...KNEEL(), arms: [[1.45, 0.45], [1.65, 0.35]], bow: 0.35, tilt: 0.35 };
    const BOW = { ...OFFER, bow: 0.7, tilt: 0.45, arms: [[1.1, 0.3], [1.2, 0.3]] };
    let P;
    if (t < 1.2) P = walkPose(stride(x - start, s));
    else if (t < 3.8) P = mixPose(STAND(), OFFER, ease(seg(t, 1.2, 1.7)));
    else P = mixPose(OFFER, BOW, ease(seg(t, 3.8, 4.2)));
    // Run run lúc dâng tiền
    const shiver = t > 1.7 && t < 3.8 ? Math.sin(t * 40) * s * 0.006 : 0;
    skel(g, x + shiver, G, s, P, { hat: C.actor });

    // Xu bay theo vòng cung từ tay người quỳ sang tay ngân hàng; xu đã tới chồng lên nhau
    const from = handAt(x, G, s, P, 1), to = handAt(bx, G, s, BP, -1);
    const cr = s * 0.055;
    let landed = 0;
    for (let i = 0; i < 6; i++) {
      const t0 = 1.8 + i * 0.3, u = seg(t, t0, t0 + 0.5);
      if (u >= 1) { landed++; continue; }
      if (u <= 0) { if (t > 1.7) coin(g, from[0], from[1] - cr * 0.6, cr, 1); continue; }
      const px = lerp(from[0], to[0], u), py = lerp(from[1], to[1], u) - Math.sin(u * Math.PI) * C.U * 0.09;
      coin(g, px, py - cr * 0.6, cr, Math.cos(u * TAU * 2));
    }
    // Chồng xu trên tay ngân hàng; hết đợt thì cất vào két
    const stash = seg(t, 4.3, 4.7);
    for (let i = 0; i < landed; i++) {
      const px = lerp(to[0], kx, stash), py = lerp(to[1] - cr * 0.4 - i * cr * 0.35, G - kh - i * cr * 0.35, stash);
      g.save(); g.translate(px, py); g.scale(1, 0.4); coin(g, 0, 0, cr); g.restore();
    }
  },
};

/* 4. VÀO ĐẤT NGƯỜI KHÁC: KHIÊNG QUAN TÀI -------------------------------- */

EVENTS.rent = {
  name: 'Trả tiền thuê', hint: '6 bộ xương vừa khiêng quan tài vừa nhảy, người trả nằm bên trong', dur: 7.5,
  beats: [[0, 'Đoàn khiêng đi từ trái sang phải suốt cảnh, không dừng: mũ màu chủ đất'],
    [0, 'Vừa trôi sang phải vừa nhảy điệu khiêng quan tài: hai nhịp mỗi giây, nhún gối, bước ngang, lắc người, vung tay'],
    [0, 'Bộ xương màu người trả nằm ngửa trong quan tài, tay duỗi thẳng dọc thân, nảy theo nhịp'],
    [3.4, 'Giữa bàn: vừa đi vừa hạ quan tài xuống ngang hông rồi hất lên'], [6.4, 'Đoàn ra khỏi cảnh bên phải']],
  draw(g, t, C) {
    const G = C.G, s = C.U * 0.105, sFar = s * 0.92;
    const gap = C.U * 0.085;
    // Đi đều từ ngoài mép trái tới ngoài mép phải, nhảy suốt đường
    const gx = lerp(-C.U * 0.35, C.U * 1.35, t / 7.5);
    /* Điệu nhảy giữ đúng bản đứng giữa bàn (nhịp meme khiêng quan tài): hai
       nhịp mỗi giây, nhún gối, chân bước ngang qua lại, người lắc theo, tay
       tự do vung. Đoàn vẫn trôi đều sang phải trong lúc nhảy, nên chân lướt
       theo kiểu bước nhún chứ không bước đi. */
    const beat = t * 2 * TAU;
    const dip = Math.max(0, Math.sin(beat));
    const drop = t > 3.4 && t < 4.4 ? Math.sin(seg(t, 3.4, 4.4) * Math.PI) : 0;
    const tilt = Math.sin(beat / 2) * 0.05;

    const bearer = (gg, bx, by, ss) => {
      const side = Math.sin(beat / 2);
      const P = {
        legs: [[-0.12 + side * 0.15, 0.5 * dip, false], [0.12 + side * 0.15, 0.5 * dip, false]],
        arms: [[lerp(2.75, 1.9, drop), lerp(-0.3, 0.2, drop)], [0.6 + Math.sin(beat) * 0.6, 0.6 + 0.6 * dip]],
        lean: side * 0.06,
      };
      skel(gg, bx, by, ss, P, { hat: C.owner });
    };
    // Hàng xa trước (mờ), quan tài, hàng gần sau
    const xs = [-1, 0, 1].map((k) => gx + k * gap);
    layer(g, (x) => xs.forEach((bx) => bearer(x, bx + gap * 0.45, G - C.U * 0.035, sFar)),
      { tint: '#120B1D', tintA: 0.35 });

    // Quan tài: đáy nằm trên vai hàng gần
    const shoulder = G - s * 0.8 + s * 0.12 * dip + C.U * 0.045 * drop;
    const cl = gap * 2 + C.U * 0.07, ch = C.U * 0.05;
    const cx = gx + gap * 0.22;
    g.save(); g.translate(cx, shoulder); g.rotate(tilt);
    // Thành sau và lòng quan tài
    g.fillStyle = '#1C1020';
    g.beginPath(); g.moveTo(-cl / 2, -ch); g.lineTo(cl / 2, -ch); g.lineTo(cl / 2 - ch * 0.4, -ch * 1.35); g.lineTo(-cl / 2 + ch * 0.6, -ch * 1.35); g.closePath(); g.fill();
    /* Người trả tiền nằm ngửa trong quan tài, đầu bên phải, hai tay duỗi
       thẳng dọc thân. `down: 1, dir: -1` của drawSkeleton xoay người nằm ngang mặt
       hướng lên trời. Nửa trên thân ló khỏi miệng quan tài, nảy theo nhịp nhún. */
    const ds = cl * 0.6;
    const jolt = -Math.abs(Math.sin(beat - 0.6)) * ch * 0.18;
    const LIE = { legs: [[0.03, 0, false], [-0.03, 0, false]], arms: [[-0.04, 0], [0.06, 0]], tilt: Math.sin(beat) * 0.12 };
    drawSkeleton(g, -cl * 0.44, -ch * 1.12 + jolt, ds, { pose: LIE, hat: C.actor, down: 1, dir: -1, lw: 1.2 });
    // Thành trước: gỗ đen, viền tím, quai đồng
    g.fillStyle = '#3B2416';
    g.beginPath();
    g.moveTo(-cl / 2, -ch); g.lineTo(cl / 2, -ch); g.lineTo(cl / 2 - ch * 0.3, 0); g.lineTo(-cl / 2 + ch * 0.5, 0); g.closePath(); g.fill();
    g.strokeStyle = '#6B3F8E'; g.lineWidth = C.U * 0.004; g.stroke();
    g.fillStyle = '#B8860B';
    for (let k = -1; k <= 1; k++) g.fillRect(k * gap - C.U * 0.012, -ch * 0.55, C.U * 0.024, C.U * 0.006);
    // Thập tự trên thành
    g.fillStyle = '#6B3F8E';
    g.fillRect(cl * 0.33, -ch * 0.85, C.U * 0.004, ch * 0.6); g.fillRect(cl * 0.33 - C.U * 0.008, -ch * 0.68, C.U * 0.02, C.U * 0.004);
    g.restore();

    xs.forEach((bx) => bearer(g, bx, G, s));
  },
};

/* 5. QUA NHÀ GA: BÁM XE TẢI ---------------------------------------------- */

function truck(g, x, G, U, t) {
  const L = U * 0.36, wr = U * 0.03;
  const by = G - wr;
  // Thùng hàng
  g.fillStyle = '#3A2D4A'; g.fillRect(x, by - U * 0.13, L * 0.66, U * 0.12);
  g.strokeStyle = '#241A33'; g.lineWidth = U * 0.003;
  for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(x + i * L * 0.11, by - U * 0.13); g.lineTo(x + i * L * 0.11, by - U * 0.01); g.stroke(); }
  g.strokeRect(x, by - U * 0.13, L * 0.66, U * 0.12);
  // Cabin
  g.fillStyle = '#5B3B6E';
  g.beginPath(); g.moveTo(x + L * 0.68, by - U * 0.01); g.lineTo(x + L * 0.68, by - U * 0.1);
  g.lineTo(x + L * 0.86, by - U * 0.1); g.lineTo(x + L, by - U * 0.05); g.lineTo(x + L, by - U * 0.01); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,210,122,.75)';
  g.beginPath(); g.moveTo(x + L * 0.72, by - U * 0.055); g.lineTo(x + L * 0.72, by - U * 0.09); g.lineTo(x + L * 0.85, by - U * 0.09); g.lineTo(x + L * 0.93, by - U * 0.055); g.closePath(); g.fill();
  // Gầm, đèn pha, quầng đèn
  g.fillStyle = '#1C1424'; g.fillRect(x - U * 0.005, by - U * 0.012, L + U * 0.01, U * 0.014);
  g.save(); g.globalCompositeOperation = 'lighter';
  const hl = g.createLinearGradient(x + L, 0, x + L + U * 0.25, 0);
  hl.addColorStop(0, 'rgba(255,220,140,.35)'); hl.addColorStop(1, 'rgba(255,220,140,0)');
  g.fillStyle = hl; g.beginPath(); g.moveTo(x + L, by - U * 0.04); g.lineTo(x + L + U * 0.25, by - U * 0.08); g.lineTo(x + L + U * 0.25, by + U * 0.03); g.closePath(); g.fill();
  g.restore();
  g.fillStyle = '#FFD27A'; g.beginPath(); g.arc(x + L - U * 0.004, by - U * 0.035, U * 0.008, 0, TAU); g.fill();
  // Bánh xe quay
  for (const wx of [x + L * 0.15, x + L * 0.5, x + L * 0.85]) {
    g.fillStyle = '#0B0712'; g.beginPath(); g.arc(wx, by, wr, 0, TAU); g.fill();
    g.fillStyle = '#4A405F'; g.beginPath(); g.arc(wx, by, wr * 0.45, 0, TAU); g.fill();
    g.strokeStyle = '#0B0712'; g.lineWidth = U * 0.003;
    for (let k = 0; k < 3; k++) {
      const a = -x / wr + k * TAU / 3;
      g.beginPath(); g.moveTo(wx, by); g.lineTo(wx + Math.cos(a) * wr * 0.45, by + Math.sin(a) * wr * 0.45); g.stroke();
    }
  }
  // Khói ống xả phía sau
  for (let i = 0; i < 5; i++) {
    const u = ((t * 1.6 + i / 5) % 1);
    puff(g, x - U * 0.01 - u * U * 0.12, by - U * 0.005 - u * U * 0.04, U * (0.012 + u * 0.03), 0.35 * (1 - u), '150,140,170');
  }
  return { gripX: x + U * 0.004, gripY: by - U * 0.085 };
}

EVENTS.station = {
  name: 'Qua nhà ga', hint: 'Bám đuôi xe tải bị kéo đi, bay phấp phới', dur: 5.5,
  beats: [[0, 'Xe tải chạy vào từ trái, bộ xương bám tay vào đuôi thùng'], [0, 'Thân bay ngang theo gió, chân tay giãy'],
    [2.2, 'Mũ bay mất, lộn vòng ra sau'], [2.4, 'Xe chạy chậm lại giữa bàn rồi tăng tốc'], [4.4, 'Ra khỏi cảnh bên phải']],
  draw(g, t, C) {
    const G = C.G, U = C.U, s = C.s * 0.9;
    // Chạy nhanh vào, chậm giữa bàn, vọt ra
    const u = t / 5.5;
    const pos = u + Math.sin(u * TAU) * -0.09;
    const x = lerp(-U * 0.45, U * 1.25, pos);
    const speed = 1 - Math.cos(u * TAU) * 0.45;
    // Vệt gió
    g.strokeStyle = 'rgba(217,207,234,.28)'; g.lineWidth = U * 0.0025; g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const yy = G - U * (0.03 + hash(i) * 0.2), len = U * (0.05 + hash(i + 4) * 0.08) * speed;
      const xx = x - ((t * U * 0.8 + hash(i + 2) * U * 0.5) % (U * 0.5));
      g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx - len, yy); g.stroke();
    }
    const { gripX, gripY } = truck(g, x, G, U, t);
    // Bộ xương bám bằng hai tay giơ thẳng; xoay để đầu chĩa về xe, chân bay ra sau
    const fl = t * 11;
    const P = {
      legs: [[Math.sin(fl) * 0.45, 0.4 + Math.sin(fl + 1) * 0.4, false], [Math.sin(fl + 2.2) * 0.45, 0.3 + Math.sin(fl + 3) * 0.35, false]],
      arms: [[Math.PI - 0.08, 0.05], [Math.PI + 0.06, 0.04]],
    };
    const hatOn = t < 2.2;
    const h = handLocal(s, P, false);
    const bob = bobOf(s, P);
    const th = Math.PI / 2 - 0.12 * speed + Math.sin(t * 9) * 0.1 + Math.sin(t * 23) * 0.04;
    g.save();
    g.translate(gripX, gripY); g.rotate(th); g.translate(-h[0], -(h[1] + bob));
    skel(g, 0, 0, s, P, { hat: hatOn ? C.actor : undefined });
    g.restore();
    // Mũ bay
    if (!hatOn) {
      const f = t - 2.2;
      const hx0 = gripX - s * 1.1, hy0 = gripY - s * 0.05;
      const hx = hx0 - f * U * 0.25 + Math.sin(f * 4) * U * 0.02, hy = hy0 - f * U * 0.12 + f * f * U * 0.09;
      witchHat(g, hx, hy, s * 0.1, C.actor, f * 7);
    }
  },
};

/* 6. QUA THUỶ ĐIỆN: THÁC NƯỚC ĐỔ XUỐNG ------------------------------------ */

EVENTS.hydro = {
  name: 'Qua thuỷ điện', hint: 'Đập xả lũ, thác nước đổ trúng người', dur: 5.4,
  beats: [[0, 'Đập hiện sau lưng, bộ xương đi vào'], [1.1, 'Đất rung, ngửa đầu nhìn lên'], [1.5, 'Cửa xả mở, thác nước đổ xuống'],
    [1.8, 'Bị đè bẹp, ôm đầu; mũ trôi theo vũng nước'], [3.3, 'Nước tạnh'], [3.6, 'Lắc mình như chó, nước văng tung toé'], [4.8, 'Mờ dần']],
  draw(g, t, C) {
    const G = C.G, U = C.U, s = C.s;
    const cx = U * 0.5;
    const appear = ease(seg(t, 0, 0.6)) * (1 - seg(t, 4.8, 5.4));
    // Đập: tường bê tông cong đứng trên chân trời
    const top = G - U * 0.4, base = G - U * 0.12, w = U * 0.5;
    g.save(); g.globalAlpha = appear;
    g.fillStyle = '#3B3450';
    g.beginPath(); g.moveTo(cx - w / 2, base); g.lineTo(cx - w / 2 + U * 0.03, top); g.lineTo(cx + w / 2 - U * 0.03, top); g.lineTo(cx + w / 2, base); g.closePath(); g.fill();
    g.strokeStyle = '#2A2238'; g.lineWidth = U * 0.003;
    for (let i = 1; i < 6; i++) { const yy = lerp(top, base, i / 6); g.beginPath(); g.moveTo(cx - w / 2 + U * 0.03 * (1 - i / 6), yy); g.lineTo(cx + w / 2 - U * 0.03 * (1 - i / 6), yy); g.stroke(); }
    g.fillStyle = '#5A86B8'; g.fillRect(cx - w / 2 + U * 0.03, top - U * 0.008, w - U * 0.06, U * 0.008);
    // Ba cửa xả; cửa giữa mở ra từ 1.5s
    const open = seg(t, 1.4, 1.6);
    for (const k of [-1, 0, 1]) {
      const gx = cx + k * U * 0.12;
      g.fillStyle = '#1C1424'; g.fillRect(gx - U * 0.035, top + U * 0.02, U * 0.07, U * 0.05);
      g.fillStyle = '#6E6585';
      const lift = k === 0 ? open * U * 0.045 : 0;
      g.fillRect(gx - U * 0.035, top + U * 0.02 - lift, U * 0.07, U * 0.05 - lift * 0.8);
    }
    g.restore();

    // Nước: đầu dòng chạy từ cửa xả xuống, đuôi dòng rời cửa lúc 3.3s
    const outY = top + U * 0.07;
    const head = ease(seg(t, 1.5, 1.8)), tail = ease(seg(t, 3.3, 3.7));
    const hitY = G - s * 0.75;
    const y0 = lerp(outY, hitY, tail), y1 = lerp(outY, hitY, head);
    const pour = t > 1.5 && tail < 1;
    if (pour) {
      const ww = U * 0.075;
      const curve = (y) => cx + Math.sin((y - outY) / (hitY - outY) * Math.PI / 2) * U * 0.02;
      g.save();
      const gr = g.createLinearGradient(cx - ww, 0, cx + ww, 0);
      gr.addColorStop(0, 'rgba(90,134,184,.55)'); gr.addColorStop(0.5, 'rgba(190,220,250,.9)'); gr.addColorStop(1, 'rgba(90,134,184,.55)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(curve(y0) - ww / 2, y0);
      for (let y = y0; y <= y1; y += U * 0.01) g.lineTo(curve(y) - ww / 2 - (y - outY) / U * 0.08 * U, y);
      for (let y = y1; y >= y0; y -= U * 0.01) g.lineTo(curve(y) + ww / 2 + (y - outY) / U * 0.08 * U, y);
      g.closePath(); g.fill();
      // Vệt nước chảy
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = U * 0.003;
      for (let i = 0; i < 10; i++) {
        const off = (hash(i) - 0.5) * ww;
        const yy = y0 + ((t * U * 0.9 + hash(i + 3) * U) % Math.max(1, y1 - y0));
        g.beginPath(); g.moveTo(curve(yy) + off, yy); g.lineTo(curve(yy) + off * 1.1, Math.min(y1, yy + U * 0.04)); g.stroke();
      }
      g.restore();
    }
    // Vũng nước loang dưới chân
    const pool = seg(t, 1.8, 2.6) * (1 - seg(t, 4.4, 5.4));
    if (pool > 0) {
      g.fillStyle = `rgba(90,134,184,${0.45 * pool})`;
      g.beginPath(); g.ellipse(cx, G, U * 0.2 * pool, U * 0.025 * pool, 0, 0, TAU); g.fill();
      g.strokeStyle = `rgba(190,220,250,${0.4 * pool})`; g.lineWidth = U * 0.002;
      g.beginPath(); g.ellipse(cx, G, Math.max(0, U * 0.12 * pool + Math.sin(t * 6) * U * 0.01 * pool), U * 0.014 * pool, 0, 0, TAU); g.stroke();
    }

    // Bộ xương
    const start = -U * 0.1;
    const x = lerp(start, cx, seg(t, 0, 1.1));
    const LOOK = { ...STAND(), tilt: -0.45, arms: [[-0.3, 0.3], [0.3, 0.4]] };
    const COVER = { legs: [[-0.35, 0.9, false], [0.45, 1.2, false]], arms: [[2.3, 1.5], [2.5, 1.4]], bow: 0.3, tilt: 0.3 };
    let P, squash = 1, tiltShake = 0;
    if (t < 1.1) P = walkPose(stride(x - start, s));
    else if (t < 1.75) P = mixPose(STAND(), LOOK, ease(seg(t, 1.1, 1.4)));
    else if (t < 3.5) { P = mixPose(LOOK, COVER, ease(seg(t, 1.75, 1.9))); squash = 1 - 0.28 * ease(seg(t, 1.75, 1.95)) + Math.sin(t * 30) * 0.02 * (t < 3.3 ? 1 : 0); }
    else {
      P = mixPose(COVER, STAND(), ease(seg(t, 3.5, 3.7)));
      squash = lerp(0.72, 1, ease(seg(t, 3.5, 3.7)));
      const sh = seg(t, 3.6, 4.6);
      if (sh > 0 && sh < 1) { tiltShake = Math.sin(sh * Math.PI * 9) * 0.35 * (1 - sh); P.arms = [[-0.5 + tiltShake, 0.4], [0.5 - tiltShake, 0.4]]; }
    }
    if (tiltShake) P.tilt = tiltShake;
    const shake = t > 1.1 && t < 1.5 ? Math.sin(t * 60) * U * 0.002 : 0;
    g.save(); g.translate(x + shake, G); g.scale(1 / Math.sqrt(squash), squash); g.translate(-(x + shake), -G);
    skel(g, x + shake, G, s, P, { hat: t < 1.8 ? C.actor : undefined });
    g.restore();
    // Mũ trôi trên vũng nước sang phải
    if (t >= 1.8) {
      const f = t - 1.8;
      const hx = cx + Math.min(f, 2.2) * U * 0.07, hy = G - s * 0.02 + Math.sin(t * 5) * U * 0.003;
      witchHat(g, hx, hy, s * 0.09, C.actor, 0.25 + Math.sin(t * 3) * 0.1);
    }
    // Bọt chỗ nước đập vào đầu
    if (pour && head > 0.95) {
      for (let i = 0; i < 12; i++) {
        const u = (t * 2.5 + hash(i)) % 1;
        const a = -Math.PI / 2 + (hash(i + 7) - 0.5) * 2.6;
        const px = cx + Math.cos(a) * u * U * 0.09, py = hitY + Math.sin(a) * u * U * 0.05 + u * u * U * 0.08;
        g.fillStyle = `rgba(220,236,255,${0.85 * (1 - u)})`;
        g.beginPath(); g.arc(px, py, U * 0.004, 0, TAU); g.fill();
      }
    }
    // Giọt nước văng lúc lắc mình
    const sh = seg(t, 3.6, 4.6);
    if (sh > 0 && sh < 1) for (let i = 0; i < 16; i++) {
      const a = hash(i) * TAU, d = sh * U * (0.06 + hash(i + 1) * 0.07);
      g.fillStyle = `rgba(190,220,250,${0.9 * (1 - sh)})`;
      g.beginPath(); g.arc(x + Math.cos(a) * d, G - s * 0.6 + Math.sin(a) * d * 0.7 + sh * sh * U * 0.05, U * 0.004, 0, TAU); g.fill();
    }
  },
};

/* 7. QUA NHÀ MÁY ĐIỆN: SỜ BÓNG ĐÈN --------------------------------------- */

function bolt(g, x0, y0, x1, y1, seed, w) {
  g.beginPath(); g.moveTo(x0, y0);
  const n = 7;
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny) || 1;
    const off = (hash(seed + i) - 0.5) * 0.35 * Math.hypot(x1 - x0, y1 - y0);
    g.lineTo(lerp(x0, x1, u) + nx / l * off, lerp(y0, y1, u) + ny / l * off);
  }
  g.lineTo(x1, y1);
  g.lineWidth = w * 3; g.strokeStyle = 'rgba(120,220,255,.35)'; g.stroke();
  g.lineWidth = w; g.strokeStyle = '#F0FBFF'; g.stroke();
}

EVENTS.power = {
  name: 'Qua nhà máy điện', hint: 'Sờ vào bóng đèn, bị điện giật', dur: 5.4,
  beats: [[0, 'Bóng đèn treo chập chờn, bộ xương đi tới'], [1.2, 'Ngửa đầu nhìn, đưa ngón tay lên'], [1.9, 'Chạm vào: chớp sáng, tia điện chạy khắp người'],
    [1.9, 'Xương phát sáng xanh, giật tay chân, mũ bật lên trời'], [3.4, 'Cháy đen, ngã ngửa, bốc khói'], [3.9, 'Mũ rơi xuống'], [4.8, 'Mờ dần']],
  draw(g, t, C) {
    const G = C.G, U = C.U, s = C.s;
    const sx = U * 0.46, start = -U * 0.1;
    const REACH = { ...STAND(), arms: [[-0.4, 0.4], [2.45, -0.15]], tilt: -0.35, legs: [[-0.09, 0, false], [0.12, 0.1, true]] };
    // Bóng đèn treo ngay trên đầu ngón tay lúc với
    const tip = handAt(sx, G, s, REACH, 1);
    const br = U * 0.042;
    const bulbX = tip[0] + br * 0.15, bulbY = tip[1] - br * 1.05;
    const zap = t > 1.9 && t < 3.4;
    const fried = t >= 3.4;
    const appear = ease(seg(t, 0, 0.5)) * (1 - seg(t, 4.8, 5.4));

    // Chớp sáng cả cảnh khi bị giật
    if (zap && Math.floor(t * 18) % 3 !== 0) {
      g.fillStyle = `rgba(200,240,255,${0.12 + 0.12 * hash(Math.floor(t * 30))})`;
      g.fillRect(0, 0, U, U);
    }
    // Dây treo và bóng
    g.save(); g.globalAlpha = appear;
    g.strokeStyle = '#0B0712'; g.lineWidth = U * 0.003;
    const swing = zap ? Math.sin(t * 50) * U * 0.004 : Math.sin(t * 1.5) * U * 0.002;
    g.beginPath(); g.moveTo(bulbX, 0); g.lineTo(bulbX + swing, bulbY - br * 1.35); g.stroke();
    const bx = bulbX + swing;
    let glowA = 0.35 + 0.25 * Math.sin(t * 13) * Math.sin(t * 7.1);
    if (zap) glowA = 0.9 + 0.1 * hash(Math.floor(t * 40));
    if (fried) glowA = Math.max(0, 0.25 - (t - 3.4) * 0.15) * (Math.floor(t * 12) % 2);
    g.save(); g.globalCompositeOperation = 'lighter';
    puff(g, bx, bulbY, br * (zap ? 6 : 3), glowA * 0.6, '255,220,140');
    g.restore();
    // Đui đèn
    g.fillStyle = '#7A6A3A'; g.fillRect(bx - br * 0.38, bulbY - br * 1.35, br * 0.76, br * 0.5);
    g.strokeStyle = '#3B3420'; g.lineWidth = U * 0.002;
    for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(bx - br * 0.38, bulbY - br * 1.35 + i * br * 0.16); g.lineTo(bx + br * 0.38, bulbY - br * 1.35 + i * br * 0.16); g.stroke(); }
    // Bầu thuỷ tinh và dây tóc
    g.fillStyle = `rgba(255,236,180,${0.25 + glowA * 0.6})`;
    g.beginPath(); g.moveTo(bx - br * 0.35, bulbY - br * 0.85);
    g.bezierCurveTo(bx - br * 0.4, bulbY - br * 0.5, bx - br, bulbY - br * 0.4, bx - br, bulbY);
    g.arc(bx, bulbY, br, Math.PI, 0, true);
    g.bezierCurveTo(bx + br, bulbY - br * 0.4, bx + br * 0.4, bulbY - br * 0.5, bx + br * 0.35, bulbY - br * 0.85);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = U * 0.002; g.stroke();
    g.strokeStyle = glowA > 0.5 ? '#FFF6D0' : '#C8742A'; g.lineWidth = U * 0.003;
    g.beginPath(); g.moveTo(bx - br * 0.25, bulbY - br * 0.7); g.lineTo(bx - br * 0.2, bulbY);
    for (let i = 0; i < 4; i++) g.lineTo(bx - br * 0.2 + (i + 0.5) * br * 0.1, bulbY + (i % 2 ? 0 : -br * 0.15));
    g.lineTo(bx + br * 0.25, bulbY - br * 0.7); g.stroke();
    g.restore();

    // Bộ xương
    const x = lerp(start, sx, seg(t, 0, 1.2));
    let P, jit = [0, 0];
    if (t < 1.2) P = walkPose(stride(x - start, s));
    else if (t < 1.9) P = mixPose(STAND(), REACH, ease(seg(t, 1.2, 1.75)));
    else if (zap) {
      const k = Math.floor(t * 24);
      const r = (i) => (hash(k * 7 + i) - 0.5);
      P = {
        legs: [[-0.45 + r(1) * 0.4, 0.2 + r(2) * 0.3, false], [0.45 + r(3) * 0.4, 0.2 + r(4) * 0.3, false]],
        arms: [[-1.4 + r(5) * 0.6, r(6) * 0.8], [2.45 + r(7) * 0.15, -0.15]],
        tilt: r(8) * 0.8,
      };
      jit = [r(9) * U * 0.008, r(10) * U * 0.006];
    } else P = { legs: [[-0.2, 0.5, false], [0.4, 0.8, false]], arms: [[-1.2, 0.8], [1.8, 0.9]] };
    const fall = fried ? ease(seg(t, 3.4, 3.9)) : 0;
    const hatOn = t < 1.95;
    const drawMe = (gg) => drawSkeleton(gg, x + jit[0], G + jit[1], s, { pose: P, hat: hatOn ? C.actor : undefined, lw: 1.2, down: fall });
    if (zap) {
      // Xương sáng xanh, nháy xen kẽ với bản âm (xương tối, viền sáng) như phim X-quang
      const neg = Math.floor(t * 18) % 2 === 0;
      layer(g, drawMe, neg ? { tint: '#0B2A3A', tintA: 0.9, glow: '#7FE3FF', glowBlur: 14 } : { tint: '#BFF3FF', tintA: 0.7, glow: '#7FE3FF', glowBlur: 18 });
      // Tia điện từ bóng xuống tay rồi lan khắp người
      const k = Math.floor(t * 20);
      const hand = handAt(x, G, s, P, 1);
      bolt(g, bx, bulbY + br * 0.8, hand[0] + jit[0], hand[1] + jit[1], k, U * 0.003);
      for (let i = 0; i < 3; i++) {
        const a = [x + jit[0], G - s * (0.3 + hash(k + i) * 0.6)];
        bolt(g, hand[0] + jit[0], hand[1] + jit[1], a[0] + (hash(k + i * 3) - 0.5) * s * 0.4, a[1], k * 3 + i * 11, U * 0.002);
      }
    } else if (fried) {
      layer(g, drawMe, { tint: '#1E1A22', tintA: 0.75 * ease(seg(t, 3.4, 3.6)) });
      // Khói bốc lên từ người nằm
      for (let i = 0; i < 6; i++) {
        const u = ((t - 3.4) * 0.8 + hash(i)) % 1;
        puff(g, x + s * (0.2 + hash(i + 2) * 0.6) + Math.sin(u * 6 + i) * U * 0.01, G - s * 0.12 - u * U * 0.14, U * (0.012 + u * 0.03), 0.4 * (1 - u), '120,110,130');
      }
    } else drawMe(g);
    // Mũ bật lên trời khi bị giật, rơi xuống chỗ đầu nằm
    if (!hatOn) {
      const f = t - 1.95;
      const up0 = headAt(sx, G, s, REACH, 1);
      const land = [x - s * 0.98, G - s * 0.1];
      let hx, hy, rot;
      if (t < 3.6) { hx = up0[0] - f * U * 0.02; hy = up0[1] - s * 0.1 - Math.min(f, 0.5) * U * 0.5 + Math.max(0, f - 0.9) ** 2 * U * 0.12; rot = f * 9; }
      else { const u = ease(seg(t, 3.6, 4.0)); hx = lerp(up0[0] - 1.65 * U * 0.02, land[0], u); hy = lerp(Math.min(G - s, up0[1] - U * 0.2), land[1], u); rot = lerp(14.8, Math.PI / 2 + 0.2, u); }
      witchHat(g, hx, hy, s * 0.1, C.actor, rot);
    }
  },
};

/* ================================================================ API */

export const SKITS = EVENTS;

/** Độ hiện của hàng bộ xương nhảy lúc cảnh `kind` đang ở giây `t`: mờ đi lúc vào, hiện lại lúc ra. */
export function skitRowAlpha(kind, t) {
  const E = EVENTS[kind];
  return Math.max(1 - seg(t, 0, 0.35), seg(t, E.dur - 0.4, E.dur));
}

/**
 * Vẽ cảnh `kind` tại giây `t` lên `ctx` (đã xoá sẵn). `px` là số điểm ảnh của
 * canvas ứng với một đơn vị của `C` (vẽ lên canvas có devicePixelRatio thì truyền nó). Cả
 * cảnh mờ đi trong 0.4s cuối.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{U:number, G:number, s:number, actor:string, owner?:string}} C
 */
export function paintSkit(ctx, kind, t, C, px = 1) {
  const E = EVENTS[kind];
  if (!E) return;
  CV = ctx.canvas; DPR = px;
  layer(ctx, (x) => E.draw(x, t, C), { alpha: 1 - seg(t, E.dur - 0.4, E.dur) });
}

/** Cỡ cảnh theo cạnh lòng bàn `U`, khớp cỡ Jason đã duyệt lúc xem thử. */
export const skitFrame = (U, actor, owner) => ({ U, G: U * 0.84, s: U * 0.13, actor, owner: owner ?? actor });
