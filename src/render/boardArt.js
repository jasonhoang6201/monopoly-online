/**
 * Vẽ toàn bộ mặt bàn cờ vào một canvas độ phân giải cao.
 * Phong cách: sơn mài Sài Gòn xưa, trống đồng Đông Sơn, hồi văn cung đình Huế.
 */
import { BOARD, GROUPS, money } from '../data/board.js';
import { TEX, DEPTH, EDGE, tileCenter, tileAngle, tileSize, isCorner, innerRect } from './geometry.js';
import {
  bronzeDrum, lacBird, fretBand, knotFretBand, plaquePath,
  paperGrain, roundRect, lotusCorner,
  cloudScroll, curvedRoof,
} from './motifs.js';
import { icon, TILE_ICON } from './icons.js';
import { drawArt } from './artwork.js';

export const P = {
  lacDeep:  '#450D09',
  lac:      '#7C1E14',
  lacLight: '#A0301F',
  gold:     '#C8A048',
  goldLight:'#E9CE85',
  goldDeep: '#8A6A22',
  paper:    '#F0E3C8',
  paperWarm:'#E4D2AC',
  paperDeep:'#CCB489',
  // Sơn mài cánh gián: nền sẫm dùng cho lòng bàn cờ, khung ngoài và cả
  // phông nền quanh bàn — cả màn hình cùng một tông, nét vàng mới nổi lên.
  groundLight:'#4A241A',
  ground:     '#30150F',
  groundDeep: '#1B0B07',
  groundNight:'#150A06',
  ink:      '#221A11',
  inkSoft:  '#5A4632',
  jade:     '#2E6B52',
  indigo:   '#1B2A4A',
};

/**
 * Hai họ chữ tự lưu trữ, đều có bộ tiếng Việt đầy đủ:
 * Noto Serif cho tên ô (dấu thanh rõ, đọc tốt ở cỡ nhỏ),
 * Playfair Display cho tiêu đề và biển hiệu.
 */
export const SERIF = '"Noto Serif", Georgia, "Times New Roman", serif';
export const DISPLAY = '"Playfair Display", Georgia, serif';

/** Đặt font với letter-spacing (bỏ qua nếu trình duyệt không hỗ trợ). */
function setFont(ctx, weight, size, spacing = 0, family = SERIF, style = '') {
  ctx.font = `${style} ${weight} ${size}px ${family}`.trim();
  try { ctx.letterSpacing = `${spacing}px`; } catch { /* Safari cũ */ }
}

/** Thu nhỏ cỡ chữ cho tới khi vừa bề ngang. */
function fitFont(ctx, text, maxW, weight, size, spacing = 0, family = SERIF) {
  let s = size;
  do {
    setFont(ctx, weight, s, spacing, family);
    if (ctx.measureText(text).width <= maxW) break;
    s -= 0.6;
  } while (s > 5);
  return s;
}

/**
 * Ngắt dòng theo từ rồi thu nhỏ dần cho tới khi vừa cả bề ngang lẫn số dòng
 * cho phép. Không để dòng nào kết thúc bằng gạch nối lơ lửng.
 */
function wrapFit(ctx, text, maxW, maxLines, weight, size, family = SERIF, style = '') {
  const words = text.split(' ');
  let s = size;
  for (;;) {
    setFont(ctx, weight, s, 0, family, style);
    const lines = [];
    let cur = '';
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && ctx.measureText(next).width > maxW) { lines.push(cur); cur = word; }
      else cur = next;
    }
    if (cur) lines.push(cur);

    for (let i = 0; i < lines.length - 1; i++) {
      const m = lines[i].match(/ ([–—-])$/);
      if (m) {
        lines[i] = lines[i].slice(0, -2);
        lines[i + 1] = `${m[1]} ${lines[i + 1]}`;
      }
    }

    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (s <= 5 || (lines.length <= maxLines && widest <= maxW)) return { lines, size: s };
    s -= 0.5;
  }
}

/* ------------------------------------------------------------ màu & chữ */

const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** Trộn hai mã màu theo tỉ lệ t (0 = a, 1 = b). */
function mix(a, b, t) {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  const c = (u, v) => Math.round(u + (v - u) * t);
  return `rgb(${c(r1, r2)},${c(g1, g2)},${c(b1, b2)})`;
}

/** Độ sáng cảm nhận, 0…1 — dùng để chọn chữ vàng hay chữ mực. */
function luma(hex) {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Tách chuỗi thành các con chữ kiểu "small caps": chữ vốn viết hoa giữ cỡ lớn,
 * chữ thường chuyển thành chữ hoa cỡ nhỏ — dáng chữ khắc trên biển hiệu xưa.
 */
const scParts = (text) => [...text].map((ch) => ({ ch: ch.toUpperCase(), big: ch === ch.toUpperCase() }));

/** Đo bề ngang một dòng small caps, đồng thời ghi lại bề ngang từng con chữ. */
function scMeasure(ctx, parts, size, gap, weight, family) {
  let total = 0;
  for (const p of parts) {
    setFont(ctx, weight, p.big ? size : size * 0.76, 0, family);
    p.w = ctx.measureText(p.ch).width;
    total += p.w + gap;
  }
  return total - gap;
}

/** Cỡ chữ small caps lớn nhất còn vừa bề ngang `maxW`. */
function scFit(ctx, parts, maxW, size, weight, family) {
  let s = size;
  while (s > 4 && scMeasure(ctx, parts, s, s * 0.02, weight, family) > maxW) s -= 0.4;
  return s;
}

/** Vẽ một dòng small caps căn giữa quanh `cx`, chân chữ tại `baseY`. */
function scDraw(ctx, parts, cx, baseY, size, weight, family) {
  const gap = size * 0.02;
  const total = scMeasure(ctx, parts, size, gap, weight, family);
  const prevAlign = ctx.textAlign, prevBase = ctx.textBaseline;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let px = cx - total / 2;
  for (const p of parts) {
    setFont(ctx, weight, p.big ? size : size * 0.76, 0, family);
    ctx.fillText(p.ch, px, baseY);
    px += p.w + gap;
  }
  ctx.textAlign = prevAlign;
  ctx.textBaseline = prevBase;
}

/**
 * Vẽ bàn cờ, trả về canvas dùng làm texture cho Phaser.
 * @param {number} S cạnh bàn cờ (px)
 */
export function paintBoard(S = TEX) {
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');

  drawFrame(ctx, S);
  drawInner(ctx, S);
  for (const t of BOARD) drawTile(ctx, t, S);
  drawOuterTrim(ctx, S);

  return cv;
}

/* ------------------------------------------------------------------ nền */

function drawFrame(ctx, S) {
  // Khung ngoài cùng tông sơn mài với lòng bàn cờ — vành ô giấy dó ở giữa
  // được kẹp giữa hai mảng sẫm nên nổi hẳn lên như khảm trên hộp sơn mài.
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, P.ground);
  g.addColorStop(0.5, P.groundNight);
  g.addColorStop(1, P.ground);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  paperGrain(ctx, 0, 0, S, S, 0.06, 7);
}

/* ------------------------------------------------- lòng bàn cờ (ở giữa) */

function drawInner(ctx, S) {
  const { x, y, size } = innerRect(S);
  const cx = x + size / 2, cy = y + size / 2;

  // Nền sơn mài sẫm — nét vàng của trống đồng và chim Lạc mới nổi lên được
  const g = ctx.createRadialGradient(cx, cy - size * 0.1, size * 0.05, cx, cy, size * 0.78);
  g.addColorStop(0, P.groundLight);
  g.addColorStop(0.62, P.ground);
  g.addColorStop(1, P.groundDeep);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, size, size);
  paperGrain(ctx, x, y, size, size, 0.055, 23);

  // Mặt trống đồng làm hoa văn chìm.
  // Hoa văn trống để chìm, riêng vành chim Lạc đậm hơn cho thấy rõ dáng chim.
  // Ảnh chim là nét mảnh nên phải vẽ to và thưa hơn bản vector mới đọc ra dáng.
  bronzeDrum(ctx, cx, cy, size * 0.465, P.gold, {
    birds: 10, birdSize: 0.132, alpha: 0.22, birdAlpha: 0.95,
  });

  // Hồi văn viền quanh lòng bàn cờ
  const inset = size * 0.028;
  const bandH = size * 0.026;
  const lw = Math.max(1.2, size * 0.0035);
  ctx.save();
  ctx.globalAlpha = 0.62;
  for (let side = 0; side < 4; side++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((side * Math.PI) / 2);
    const half = size / 2 - inset;
    fretBand(ctx, -half, -half, half * 2, bandH, P.gold, lw);
    ctx.restore();
  }
  ctx.restore();

  // Đường viền kép
  ctx.strokeStyle = P.gold;
  ctx.lineWidth = size * 0.006;
  ctx.globalAlpha = 0.6;
  ctx.strokeRect(x + inset * 0.45, y + inset * 0.45, size - inset * 0.9, size - inset * 0.9);
  ctx.globalAlpha = 1;

  // Lòng bàn cờ để trống hẳn: chỉ còn trống đồng, chim Lạc và tấm biển tên.
  // Hai lưng bài Cơ Hội / Khí Vận đã bỏ — chỗ ấy nay là bảng nút hành động.
  drawCartouche(ctx, cx, cy, size);
}

/** Tấm biển sơn mài ở chính giữa bàn cờ. */
function drawCartouche(ctx, cx, cy, size) {
  // Biển chỉ còn một dòng tên nên bóp sát lại, chừa lề vừa đủ quanh chữ.
  const w = size * 0.56, h = size * 0.15;
  const x = cx - w / 2, y = cy - h / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = size * 0.03;
  ctx.shadowOffsetY = size * 0.008;
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, P.lacLight);
  g.addColorStop(1, P.lacDeep);
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, h * 0.16);
  ctx.fill();
  ctx.restore();

  // Viền vàng kép
  ctx.strokeStyle = P.gold;
  ctx.lineWidth = size * 0.0035;
  roundRect(ctx, x, y, w, h, h * 0.16); ctx.stroke();
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = size * 0.002;
  roundRect(ctx, x + h * 0.07, y + h * 0.07, w - h * 0.14, h - h * 0.14, h * 0.12); ctx.stroke();
  ctx.globalAlpha = 1;

  // Cánh sen bốn góc
  const inset = h * 0.16;
  lotusCorner(ctx, x + inset, y + inset, h * 0.16, -Math.PI * 0.75, 'rgba(233,206,133,.5)');
  lotusCorner(ctx, x + w - inset, y + inset, h * 0.16, Math.PI * 0.75, 'rgba(233,206,133,.5)');
  lotusCorner(ctx, x + inset, y + h - inset, h * 0.16, -Math.PI * 0.25, 'rgba(233,206,133,.5)');
  lotusCorner(ctx, x + w - inset, y + h - inset, h * 0.16, Math.PI * 0.25, 'rgba(233,206,133,.5)');

  // Chữ
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = P.goldLight;
  setFont(ctx, 800, h * 0.49, h * 0.108, DISPLAY);
  ctx.fillText('CỜ TỶ PHÚ', cx + h * 0.054, cy - h * 0.03);

  // Gạch chỉ mảnh với hạt trám ở giữa. Không thêm chim Lạc ở đây —
  // vành trống đồng phía sau đã có 16 con, thêm nữa sẽ chen vào tên biển.
  const ruleY = cy + h * 0.33;
  ctx.strokeStyle = 'rgba(233,206,133,.42)';
  ctx.lineWidth = Math.max(1, size * 0.0015);
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.26, ruleY);
  ctx.lineTo(cx - w * 0.03, ruleY);
  ctx.moveTo(cx + w * 0.03, ruleY);
  ctx.lineTo(cx + w * 0.26, ruleY);
  ctx.stroke();

  ctx.fillStyle = 'rgba(233,206,133,.6)';
  ctx.beginPath();
  ctx.moveTo(cx, ruleY - h * 0.022);
  ctx.lineTo(cx + h * 0.016, ruleY);
  ctx.lineTo(cx, ruleY + h * 0.022);
  ctx.lineTo(cx - h * 0.016, ruleY);
  ctx.closePath();
  ctx.fill();
}

/* ---------------------------------------------------------------- các ô */

function drawTile(ctx, t, S) {
  const c = tileCenter(t.id, S);
  const a = tileAngle(t.id);
  const corner = isCorner(t.id);
  const { w, h } = tileSize(t.id, S);

  // --- Nền ô: vẽ KHÔNG xoay theo góc chéo, nếu không ô góc sẽ thành hình thoi.
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(corner ? 0 : a);
  const x = -w / 2, y = -h / 2;

  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#F4E8D0');
  g.addColorStop(1, P.paperWarm);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);

  if (corner) {
    ctx.fillStyle = {
      0:  'rgba(200,160,72,.20)',
      10: 'rgba(27,42,74,.13)',
      20: 'rgba(46,107,82,.14)',
      30: 'rgba(124,30,20,.15)',
    }[t.id];
    ctx.fillRect(x, y, w, h);
  }

  paperGrain(ctx, x, y, w, h, 0.05, t.id * 37 + 11);

  ctx.strokeStyle = 'rgba(34,26,17,.62)';
  ctx.lineWidth = Math.max(1, S * 0.0016);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();

  // --- Nội dung ô: xoay để đọc được từ phía ngoài bàn cờ.
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(a);
  if (corner) drawCornerFace(ctx, t, w, h);
  else if (t.type === 'property') drawPropertyFace(ctx, t, w, h);
  else drawSpecialFace(ctx, t, w, h);
  ctx.restore();
}

/* Tỉ lệ dựng đầu ô — dùng chung cho ô đất trên bàn và thẻ trong hộp thoại.
   Cổng phủ kín bề ngang ô, nên chiều cao đầu ô chính là chiều cao ảnh cổng khi
   kéo hết bề ngang: 1 / 3,0118 của w, quy ra h (= 1,5 w). Biển tên treo vừa
   khít vào lòng cổng — khoảng trống giữa hai cột, tính từ bụng mái xuống chân. */
const HEADER_H  = 0.2214;   // chiều cao đầu ô, theo h
const BADGE_W   = 0.68;     // bề ngang biển tên, theo w
const BADGE_H   = 0.155;    // chiều cao biển tên, theo w
const BADGE_TOP = 0.168;    // mép trên biển tên tính từ mép trên ô, theo w

/** Mép trên biển tên — phần vẽ cổng và phần vẽ biển đều đo từ đây. */
const badgeTop = (y, w) => y + w * BADGE_TOP;

/**
 * Dải mang sắc nhóm đất và tên ô, đo theo chiều cao ô tính từ **mép trong**
 * (cạnh quay vào lòng bàn cờ, cũng là đầu ô).
 *
 * Bàn cờ vẽ sẵn một lần rồi ván chơi mới phủ nước màu chủ đất lên; nước màu
 * ấy kéo cả chữ lẫn sắc nhóm về phía nó. `BoardScene` cắt đúng dải này trên
 * ảnh bàn cờ gốc rồi dán trở lại đè lên nước màu, nên tên ô và màu nhóm giữ
 * nguyên độ tương phản.
 *
 * Ô đất: dải là cái cổng — trong đó có biển tên. Ô nhà ga / tiện ích: cổng
 * không có, tên và giá nằm ở nửa dưới thân ô.
 */
export function nameBand(type) {
  return type === 'property'
    ? { top: 0, bottom: HEADER_H }
    : { top: 0.50, bottom: 0.97 };
}

/**
 * Đầu ô là một **cái cổng** phủ kín dải trên cùng: mái đình cong đầu đao chạm
 * hồi văn, hai cột chạy sát hai mép ô, chân cột đài sen đỗ trên gạch chỉ chân
 * đầu ô. Sắc nhóm đất nằm ngay trong nét cổng và trong tấm biển tên treo giữa
 * hai cột — không còn khoang màu bao quanh.
 *
 * `card` = thẻ trong hộp thoại: bỏ gạch chỉ chân cổng. Thẻ đứng riêng trên nền
 * tối nên đã tự tách bạch, kẻ thêm chỉ làm thẻ nặng nề.
 */
function drawTileHeader(ctx, x, y, w, h, color, card) {
  const headerH = h * HEADER_H;
  const orn = mix(color, '#2E0C06', 0.24);   // màu hoa văn: sắc nhóm nhấn tối

  if (!drawArt(ctx, 'gate', orn, x + w / 2, y + headerH / 2, w, headerH)) {
    curvedRoof(ctx, x + w * 0.04, y + headerH * 0.05, w * 0.92, headerH * 0.42, orn);
  }

  if (!card) {
    ctx.strokeStyle = 'rgba(34,26,17,.42)';
    ctx.lineWidth = Math.max(0.8, w * 0.008);
    ctx.beginPath(); ctx.moveTo(x, y + headerH); ctx.lineTo(x + w, y + headerH); ctx.stroke();
  }

  return headerH;
}

/**
 * Biển tên đường tiếng Pháp treo trong lòng cổng. Nền lấy một sắc đậm hơn màu
 * nhóm đất — đây là mảng màu lớn nhất của đầu ô, cũng là chỗ người chơi liếc
 * vào để nhận ra nhóm. Chỉ một đường viền mảnh, không kẻ viền kép.
 * Trả về mép dưới của biển.
 */
function drawNameBadge(ctx, name, x, y, w, h, color) {
  const bw = w * BADGE_W, bh = w * BADGE_H;
  const bx = x + (w - bw) / 2;
  const by = badgeTop(y, w);
  const cut = bh * 0.26;

  ctx.fillStyle = mix(color, '#20120A', 0.16);
  plaquePath(ctx, bx, by, bw, bh, cut);
  ctx.fill();

  const light = luma(color) > 0.58;
  ctx.strokeStyle = light ? mix(color, '#2E0C06', 0.55) : P.goldLight;
  ctx.lineWidth = Math.max(0.7, w * 0.010);
  plaquePath(ctx, bx, by, bw, bh, cut);
  ctx.stroke();

  /* Chữ: một dòng nếu còn đọc được, không thì tách theo dấu xuống dòng sẵn có.
     Biển mỏng nên bản hai dòng phải nhỏ lại và bó sát hàng cho khỏi tràn. */
  const maxW = bw - w * 0.05;
  const flat = name.replace(/\n/g, ' ');
  const one = scParts(flat);
  const oneSize = scFit(ctx, one, maxW, w * 0.090, 600, DISPLAY);
  const lines = oneSize >= w * 0.072 ? [one] : name.split('\n').map(scParts);
  const size = lines.length === 1
    ? oneSize
    : Math.min(w * 0.070, ...lines.map((p) => scFit(ctx, p, maxW, w * 0.070, 600, DISPLAY)));

  ctx.fillStyle = light ? mix(color, '#2E0C06', 0.72) : P.goldLight;
  const step = size * (lines.length === 1 ? 1.14 : 1.02);
  const first = by + bh / 2 - (lines.length - 1) * step / 2 + size * 0.35;
  lines.forEach((p, k) => scDraw(ctx, p, x + w / 2, first + k * step, size, 600, DISPLAY));

  return by + bh;
}

/**
 * Ô đất: cổng + biển tên Pháp + tên nay + giá.
 * `card` = đang vẽ thẻ cho hộp thoại chứ không phải ô trên mặt bàn.
 */
function drawPropertyFace(ctx, t, w, h, card) {
  const x = -w / 2, y = -h / 2;

  drawTileHeader(ctx, x, y, w, h, t.groupHex, card);
  drawNameBadge(ctx, t.short, x, y, w, h, t.groupHex);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Tên đường hiện nay: viết đủ, tự ngắt dòng, đặt giữa khoảng trống thân ô
  if (t.modern) {
    const { lines, size } = wrapFit(ctx, t.modern, w * 0.88, 3, 600, w * 0.135);
    setFont(ctx, 600, size, 0);
    ctx.fillStyle = P.ink;
    const step = size * 1.22;
    const mid = y + (h * HEADER_H + h * 0.855) / 2;
    const first = mid - ((lines.length - 1) * step) / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, 0, first + i * step));
  }

  // Giá
  const ps = fitFont(ctx, money(t.price), w * 0.8, 700, w * 0.135, 0.5);
  setFont(ctx, 700, ps, 0.5);
  ctx.fillStyle = P.lac;
  ctx.fillText(money(t.price), 0, y + h * 0.885);
}

/** Ô nhà ga / tiện ích / cơ hội / khí vận / thuế. */
function drawSpecialFace(ctx, t, w, h) {
  const y = -h / 2;
  const ico = TILE_ICON[t.id];
  const isFate = t.type === 'chance' || t.type === 'chest';
  const accent = t.type === 'chance' ? P.lac : t.type === 'chest' ? P.jade : P.indigo;

  // Nền phớt màu cho ô cơ hội / khí vận
  if (isFate) {
    ctx.fillStyle = t.type === 'chance' ? 'rgba(124,30,20,.09)' : 'rgba(46,107,82,.10)';
    ctx.fillRect(-w / 2, y, w, h);
  }

  ctx.save();
  if (isFate) {
    // Rồng bay trong mây, phụng múa trong mây: hai cụm mây cuộn chầu vào giữa,
    // đầu mây quay vào trong nên đuôi mây vuốt ra hai mép ô.
    ctx.globalAlpha = 0.9;
    const cbw = w * 0.50, cbh = h * 0.085, cy = y + h * 0.088;
    for (const s of [-1, 1]) {
      if (!drawArt(ctx, 'cloud', accent, s * w * 0.235, cy, cbw, cbh, s > 0)) {
        cloudScroll(ctx, s * w * 0.235, cy, h * 0.072, accent, Math.max(0.9, w * 0.018), s < 0);
      }
    }
  } else {
    // Hồi văn mảnh ở mép trên: cùng ngôn ngữ trang trí với đầu ô đất, nhưng
    // bỏ khối thắt nút — ở dải hẹp thế này nó chỉ còn là vệt rối.
    const fh = h * 0.062;
    ctx.globalAlpha = 0.6;
    knotFretBand(ctx, -w / 2 + w * 0.08, y + h * 0.026, w * 0.84, fh, accent, Math.max(0.9, fh * 0.15), { knots: false });
  }
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  /* Ô định mệnh mang hình rồng / phụng vẽ tay; ô khác vẫn dùng biểu tượng
     vector. Ô định mệnh không có tên nay lẫn giá tiền nên hình được vẽ to hơn
     và dồn xuống, lấy cả khoảng trống ấy. */
  const beast = t.type === 'chest' ? 'dragon' : t.type === 'chance' ? 'phoenix' : null;
  if (!(beast && drawArt(ctx, beast, accent, 0, y + h * 0.40, w * 0.76, h * 0.40))) {
    if (ico) icon(ctx, ico, 0, y + h * (isFate ? 0.38 : 0.33), w * (isFate ? 0.46 : 0.38), accent);
  }

  // Tên ô: ô định mệnh lấy luôn màu của rồng / phụng cho ăn nhập
  const lines = t.short.split('\n');
  const cap = w * (isFate ? 0.165 : 0.145);
  const size = Math.min(cap, ...lines.map((ln) => fitFont(ctx, ln, w * 0.9, 600, cap, 0.3)));
  setFont(ctx, 600, size, 0.3);
  ctx.fillStyle = isFate ? accent : P.ink;
  const top = y + h * (isFate ? 0.74 : 0.56);
  lines.forEach((ln, i) => ctx.fillText(ln, 0, top + i * size * 1.16));

  // Một dòng thôi: dưới nó là giá, không còn chỗ cho dòng thứ hai.
  if (t.modern) {
    const m = wrapFit(ctx, t.modern, w * 0.88, 1, 400, w * 0.095, SERIF, 'italic');
    setFont(ctx, 400, m.size, 0, SERIF, 'italic');
    ctx.fillStyle = P.inkSoft;
    ctx.fillText(m.lines[0], 0, top + lines.length * size * 1.16 + h * 0.03);
  }

  const foot = t.price ? money(t.price) : t.tax_amount ? `Trả ${money(t.tax_amount)}` : null;
  if (foot) {
    const ps = fitFont(ctx, foot, w * 0.86, 700, w * 0.125, 0.4);
    setFont(ctx, 700, ps, 0.4);
    ctx.fillStyle = P.lac;
    ctx.fillText(foot, 0, y + h * 0.9);
  }
}

/** Bốn ô góc. */
function drawCornerFace(ctx, t, w, h) {
  const accent = { 0: P.goldDeep, 10: P.indigo, 20: P.jade, 30: P.lac }[t.id];
  // Dồn nội dung về phía trong bàn cờ, chừa nửa ngoài cho quân cờ đứng.
  icon(ctx, TILE_ICON[t.id], 0, -h * 0.30, w * 0.30, accent);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = t.short.replace(/\n/g, ' ');
  // Chữ nằm chéo nên có thêm chỗ theo đường chéo ô.
  const size = fitFont(ctx, label, w * 1.12, 700, w * 0.122, w * 0.012, DISPLAY);
  setFont(ctx, 700, size, w * 0.012, DISPLAY);
  ctx.fillStyle = P.ink;
  ctx.fillText(label, 0, -h * 0.055);

  const sub = {
    0:  'Nhận 200$ khi đi ngang',
    10: 'Khám Lớn Sài Gòn',
    20: 'Nghỉ chân · miễn phí',
    30: 'Về Khám Lớn ngay',
  }[t.id];
  const ss = fitFont(ctx, sub, w * 1.12, 400, w * 0.082, 0);
  ctx.font = `italic ${ss}px ${SERIF}`;
  ctx.fillStyle = P.inkSoft;
  ctx.fillText(sub, 0, h * 0.06);
}

/**
 * Vẽ một ô cờ thành THẺ CHỮ NHẬT đứng riêng, dùng trong các hộp thoại.
 * Dùng đúng những hàm vẽ mặt ô của bàn cờ nên thẻ trông y hệt ô thật —
 * cùng dải màu, cùng kiểu chữ, cùng biểu tượng.
 *
 * @param {number} tileId
 * @param {number} w bề ngang thẻ (px). Chiều cao = w × 1.5 (ô góc là vuông).
 */
export function paintTileCard(tileId, w = 220) {
  const t = BOARD[tileId];
  const corner = isCorner(tileId);
  const h = corner ? w : w * 1.5;
  const r = w * 0.055;

  const cv = document.createElement('canvas');
  cv.width = Math.round(w);
  cv.height = Math.round(h);
  const ctx = cv.getContext('2d');

  ctx.save();
  roundRect(ctx, 0, 0, w, h, r);
  ctx.clip();

  // Nền giấy
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#F4E8D0');
  g.addColorStop(1, P.paperWarm);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  if (corner) {
    ctx.fillStyle = {
      0: 'rgba(200,160,72,.20)', 10: 'rgba(27,42,74,.13)',
      20: 'rgba(46,107,82,.14)', 30: 'rgba(124,30,20,.15)',
    }[t.id];
    ctx.fillRect(0, 0, w, h);
  }
  paperGrain(ctx, 0, 0, w, h, 0.05, t.id * 37 + 11);

  // Mặt ô vẽ trong hệ toạ độ tâm thẻ, không xoay
  ctx.translate(w / 2, h / 2);
  if (corner) drawCornerFace(ctx, t, w, h);
  else if (t.type === 'property') drawPropertyFace(ctx, t, w, h, true);
  else drawSpecialFace(ctx, t, w, h);
  ctx.restore();

  return cv;
}

/* ------------------------------------------------------------ viền ngoài */

function drawOuterTrim(ctx, S) {
  // Một đường chỉ vàng duy nhất, mép ngoài trùng đúng mép bàn cờ:
  // vẽ tâm nét lệch vào nửa bề dày nên nét phủ đúng dải [0, lw].
  const lw = S * 0.005;
  ctx.strokeStyle = P.gold;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = lw;
  ctx.strokeRect(lw / 2, lw / 2, S - lw, S - lw);
  ctx.globalAlpha = 1;
}

/** Bảng tra màu nhóm dùng cho UI HTML. */
export const GROUP_HEX = Object.fromEntries(
  Object.entries(GROUPS).map(([k, v]) => [k, v.hex]),
);

export { DEPTH, EDGE };
