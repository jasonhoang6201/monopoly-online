/**
 * Song sắt ô Khám Lớn: hai tấm dựng lên ở ô tù khi có người ngồi tù thật
 * (không tính người đi ngang thăm), sập xuống khi ô tù trống.
 *
 * Ô tù là góc dưới-trái (ô 10). Hai tấm đứng ngay trên hai mép quay vào
 * bàn cờ: mép trên (giáp ô 11) và mép phải (giáp ô 9). Chân tấm trùng đường
 * mép ô, đầu song chĩa vào trong ô, nên song dựng là mọc từ mép vào, sập là
 * rạp ngược về mép. Quân đứng dồn về góc ngoài (`tokenSpot`) nên nằm trong
 * góc hai tấm quây lại.
 *
 * Mỗi chủ đề một kiểu song:
 *   gốc        sắt rèn đen, đầu giáo mạ vàng, ổ khoá đồng
 *   halloween  hàng rào nghĩa địa: song cong vẹo, gỉ xanh, đầu nhọn, khoá đầu lâu
 *   christmas  song kẹo gậy sọc đỏ trắng, tuyết đọng trên thanh ngang, khoá thắt nơ
 */

/**
 * Khung hai tấm trong hệ toạ độ ô góc (đơn vị: cạnh ô, gốc ở tâm ô; ô góc
 * nằm thẳng trục màn hình). `x, y` là giữa chân tấm, nằm đúng trên mép ô.
 * Tấm vẽ nằm ngang, đầu song chĩa lên; `rot` xoay nó cho đầu song chĩa vào
 * trong ô: π thì chĩa xuống (tấm mép trên), −π/2 thì chĩa sang trái (tấm mép
 * phải). `len` là bề dài dọc mép, `h` là bề cao từ chân tới đầu song.
 *
 * Mỗi tấm chạy từ tâm trụ đầu ngoài tới tâm trụ góc; hai đầu tấm nằm dưới
 * trụ nên không lộ chỗ cắt.
 */
const PH = 0.19;
/** Cạnh trụ góc và trụ đầu, theo cạnh ô. */
const POST_BIG = PH * 0.78, POST_END = PH * 0.5;
const LEN = 1 - PH / 2 - POST_END / 2;
export const JAIL_PANELS = {
  top:   { x: (POST_END / 2 - PH / 2) / 2, y: -0.5, rot: Math.PI, len: LEN, h: PH },
  right: { x: 0.5, y: (PH / 2 - POST_END / 2) / 2, rot: -Math.PI / 2, len: LEN, h: PH },
};

/**
 * Ba trụ: trụ góc đứng ở ô vuông giao nhau của hai dải song (góc trên-phải),
 * hai trụ nhỏ chặn đầu ngoài của mỗi tấm. `x, y` là tâm trụ.
 */
export const JAIL_POSTS = [
  { x: 0.5 - PH / 2, y: -0.5 + PH / 2, s: POST_BIG, big: true },
  { x: -0.5 + POST_END / 2, y: -0.5 + PH / 2, s: POST_END, big: false },
  { x: 0.5 - PH / 2, y: 0.5 - POST_END / 2, s: POST_END, big: false },
];

/** Số giả ngẫu nhiên theo hạt giống — song cong vẹo khỏi đổi mỗi lần vẽ lại. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bảng màu từng chủ đề. */
const STYLE = {
  classic: {
    bar: ['#4A4440', '#1E1A17', '#0C0A09'], rail: '#2A2522', tip: '#E2BE6A', tipDark: '#8E6A22',
  },
  halloween: {
    bar: ['#3E3550', '#1C1626', '#0A0710'], rail: '#231B30', tip: '#2A2238', tipDark: '#0A0710',
    rust: 'rgba(122,181,57,0.55)',
  },
  christmas: {
    bar: ['#FFFFFF', '#F2ECE6', '#D9CFC8'], stripe: '#C8202C', rail: '#1F6B3A', tip: '#F4F8FF', tipDark: '#B8C6D8',
  },
};

/**
 * Vẽ một tấm song sắt.
 *
 * @param {'classic'|'halloween'|'christmas'} theme
 * @param {'top'|'right'} kind tấm trên có ổ khoá
 * @param {number} W bề ngang canvas (px)
 * @param {number} H bề cao canvas (px)
 * @returns {HTMLCanvasElement}
 */
export function paintJailPanel(theme, kind, W, H) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(W);
  cv.height = Math.round(H);
  const ctx = cv.getContext('2d');
  const S = STYLE[theme] ?? STYLE.classic;
  const front = kind === 'top';
  // Song cách đều nhau ~1/8 bề dài ô, tấm ngắn thì ít song hơn
  const n = Math.max(5, Math.round((W / H) * 2.2));
  const barW = H * 0.17;
  const tipH = H * 0.12;
  const pad = H * 0.12;
  const rnd = rng(front ? 71 : 37);
  // Hai thanh ngang: một sát đỉnh (dưới đầu song), một sát chân
  const railTop = tipH + H * 0.05;
  const railLow = H * 0.86;
  const railH = H * 0.055;

  /* Halloween: mỗi song nghiêng một chút, đỉnh lệch khỏi chân — hàng rào
     nghĩa địa lâu năm, đất lún không đều. */
  const bars = Array.from({ length: n }, (_, i) => {
    const x = pad + barW / 2 + (i * (W - 2 * pad - barW)) / (n - 1);
    const lean = theme === 'halloween' ? (rnd() - 0.5) * H * 0.15 : 0;
    const drop = theme === 'halloween' ? rnd() * H * 0.06 : 0;
    return { x, lean, drop };
  });

  // Bóng đổ dưới chân tấm
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(W / 2, H - H * 0.02, W * 0.48, H * 0.025, 0, 0, Math.PI * 2);
  ctx.fill();

  const drawRail = (y) => {
    const g = ctx.createLinearGradient(0, y, 0, y + railH);
    g.addColorStop(0, theme === 'christmas' ? '#2E8A4E' : S.bar[0]);
    g.addColorStop(1, S.rail);
    ctx.fillStyle = g;
    ctx.fillRect(pad * 0.5, y, W - pad, railH);
    if (theme === 'christmas') {
      // Dây kim tuyến vàng chạy dọc thanh ngang xanh
      ctx.fillStyle = '#E2BE6A';
      ctx.fillRect(pad * 0.5, y + railH * 0.42, W - pad, railH * 0.16);
    }
  };

  drawRail(railLow);

  for (const b of bars) {
    const top = tipH + b.drop;
    const x0 = b.x, x1 = b.x + b.lean;
    ctx.save();
    // Song là một hình thang nghiêng nối chân (x0, H) với đỉnh (x1, top)
    ctx.beginPath();
    ctx.moveTo(x0 - barW / 2, H * 0.97);
    ctx.lineTo(x1 - barW / 2, top);
    ctx.lineTo(x1 + barW / 2, top);
    ctx.lineTo(x0 + barW / 2, H * 0.97);
    ctx.closePath();
    const g = ctx.createLinearGradient(x0 - barW / 2, 0, x0 + barW / 2, 0);
    g.addColorStop(0, S.bar[1]);
    g.addColorStop(0.35, S.bar[0]);
    g.addColorStop(1, S.bar[2]);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    if (theme === 'christmas') {
      // Sọc kẹo gậy chéo
      ctx.strokeStyle = S.stripe;
      ctx.lineWidth = barW * 0.55;
      for (let y = top - barW * 2; y < H + barW * 2; y += barW * 1.6) {
        ctx.beginPath();
        ctx.moveTo(x0 - barW, y + barW);
        ctx.lineTo(x0 + barW, y - barW);
        ctx.stroke();
      }
      // Bóng đổ phía phải cho song tròn lại
      const sh = ctx.createLinearGradient(x0 - barW / 2, 0, x0 + barW / 2, 0);
      sh.addColorStop(0, 'rgba(255,255,255,0.25)');
      sh.addColorStop(0.5, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(60,0,0,0.30)');
      ctx.fillStyle = sh;
      ctx.fillRect(x0 - barW * 2, 0, barW * 4, H);
    } else if (theme === 'halloween') {
      // Mảng gỉ xanh độc loang trên thân song
      ctx.fillStyle = S.rust;
      for (let k = 0; k < 3; k++) {
        const y = top + rnd() * (H - top);
        ctx.beginPath();
        ctx.ellipse(x0 + (rnd() - 0.5) * barW, y, barW * 0.5, H * 0.03, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Đầu song
    if (theme === 'christmas') {
      // Móc kẹo gậy: nửa vòng cong sang phải, sọc đỏ ở đầu móc
      ctx.lineCap = 'round';
      ctx.lineWidth = barW;
      ctx.strokeStyle = S.bar[0];
      ctx.beginPath();
      ctx.arc(x1 + barW * 0.9, top + barW * 0.2, barW * 0.9, Math.PI, Math.PI * 1.9);
      ctx.stroke();
      ctx.strokeStyle = S.stripe;
      ctx.lineWidth = barW * 0.5;
      ctx.beginPath();
      ctx.arc(x1 + barW * 0.9, top + barW * 0.2, barW * 0.9, Math.PI * 1.25, Math.PI * 1.5);
      ctx.stroke();
    } else {
      // Đầu giáo: hình thoi nhọn
      const tw = barW * (theme === 'halloween' ? 1.5 : 1.9);
      const g2 = ctx.createLinearGradient(x1 - tw, 0, x1 + tw, 0);
      g2.addColorStop(0, S.tip);
      g2.addColorStop(1, S.tipDark);
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(x1, top - tipH);
      ctx.lineTo(x1 + tw / 2, top - tipH * 0.25);
      ctx.lineTo(x1, top + tipH * 0.12);
      ctx.lineTo(x1 - tw / 2, top - tipH * 0.25);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawRail(railTop);

  if (theme === 'christmas') {
    // Tuyết đọng trên thanh ngang trên: dải trắng lượn sóng
    ctx.fillStyle = '#FAFCFF';
    ctx.beginPath();
    ctx.moveTo(pad * 0.4, railTop + railH * 0.2);
    for (let x = pad * 0.4; x <= W - pad * 0.4; x += H * 0.5) {
      ctx.quadraticCurveTo(x + H * 0.25, railTop - railH * (0.7 + rnd() * 0.6), x + H * 0.5, railTop + railH * 0.1);
    }
    ctx.lineTo(W - pad * 0.4, railTop + railH * 0.45);
    ctx.lineTo(pad * 0.4, railTop + railH * 0.45);
    ctx.closePath();
    ctx.fill();
  }

  if (front) {
    // Tấm mép trên xoay 180° khi đặt lên bàn: vẽ khoá ngược sẵn để lên bàn thì đứng thẳng
    const ly = (railTop + railLow) / 2;
    ctx.save();
    ctx.translate(W / 2, ly);
    ctx.rotate(Math.PI);
    drawLock(ctx, theme, 0, -H * 0.04, H * 0.42);
    ctx.restore();
  }
  return cv;
}

/** Ổ khoá treo giữa tấm trước. */
function drawLock(ctx, theme, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  if (theme === 'halloween') {
    // Đầu lâu xương cốt làm ổ khoá
    ctx.fillStyle = '#E8E0CC';
    ctx.beginPath();
    ctx.arc(0, -s * 0.15, s * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-s * 0.3, s * 0.1, s * 0.6, s * 0.35);
    ctx.fillStyle = '#120C18';
    ctx.beginPath();
    ctx.ellipse(-s * 0.2, -s * 0.15, s * 0.13, s * 0.16, 0, 0, Math.PI * 2);
    ctx.ellipse(s * 0.2, -s * 0.15, s * 0.13, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9AD14E';
    ctx.beginPath();
    ctx.arc(-s * 0.2, -s * 0.13, s * 0.05, 0, Math.PI * 2);
    ctx.arc(s * 0.2, -s * 0.13, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#120C18';
    for (let i = -1; i <= 1; i++) ctx.fillRect(i * s * 0.14 - s * 0.03, s * 0.2, s * 0.06, s * 0.22);
    ctx.restore();
    return;
  }
  // Quai khoá
  ctx.lineWidth = s * 0.16;
  ctx.strokeStyle = theme === 'christmas' ? '#C9D3E0' : '#6E6258';
  ctx.beginPath();
  ctx.arc(0, -s * 0.2, s * 0.3, Math.PI, 0);
  ctx.lineTo(s * 0.3, s * 0.05);
  ctx.moveTo(-s * 0.3, -s * 0.2);
  ctx.lineTo(-s * 0.3, s * 0.05);
  ctx.stroke();
  // Thân khoá
  const g = ctx.createLinearGradient(-s / 2, 0, s / 2, 0);
  g.addColorStop(0, theme === 'christmas' ? '#F1D27A' : '#E9CE85');
  g.addColorStop(1, theme === 'christmas' ? '#A8801E' : '#8E6A22');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-s * 0.5, -s * 0.05, s, s * 0.75, s * 0.12);
  ctx.fill();
  // Lỗ khoá
  ctx.fillStyle = '#2A1B0C';
  ctx.beginPath();
  ctx.arc(0, s * 0.25, s * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-s * 0.04, s * 0.25, s * 0.08, s * 0.22);
  if (theme === 'christmas') {
    // Nơ đỏ thắt trên quai
    ctx.fillStyle = '#C8202C';
    ctx.beginPath();
    ctx.ellipse(-s * 0.24, -s * 0.52, s * 0.22, s * 0.13, -0.4, 0, Math.PI * 2);
    ctx.ellipse(s * 0.24, -s * 0.52, s * 0.22, s * 0.13, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8E121C';
    ctx.beginPath();
    ctx.arc(0, -s * 0.52, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Màu trụ theo chủ đề: mặt đỉnh, cạnh vát sáng, cạnh vát tối, ba nấc quả cầu đỉnh. */
const POST = {
  classic: { face: '#2C2622', lit: '#5A514A', dark: '#0E0B0A', ball: ['#FFF3C4', '#D8B058', '#6E4F14'] },
  halloween: { face: '#2E2838', lit: '#5C5270', dark: '#0C0912', ball: ['#F2FFD8', '#9AD14E', '#2F5A12'], glow: 'rgba(154,209,78,0.45)' },
  christmas: { face: '#F4F8FF', lit: '#FFFFFF', dark: '#9FB2C8', ball: ['#FFB3B8', '#C8202C', '#4A0810'], ring: '#1F6B3A' },
};

/**
 * Trụ vuông nhìn từ trên xuống: bốn cạnh vát (trên, trái sáng; dưới, phải
 * tối — ánh sáng chiếu từ góc trên-trái, cùng hướng bóng đổ của song) quanh
 * mặt đỉnh phẳng, giữa đỉnh là quả cầu tô gradient tròn lệch sáng về trên-trái.
 *
 * @param {'classic'|'halloween'|'christmas'} theme
 * @param {number} S cạnh canvas (px)
 * @param {boolean} big trụ góc: cầu to hơn, có vòng đế
 */
export function paintJailPost(theme, S, big) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(S);
  const ctx = cv.getContext('2d');
  const C = POST[theme] ?? POST.classic;
  const b = S * 0.2;                       // bề rộng cạnh vát
  const quad = (pts, fill) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  quad([[0, 0], [S, 0], [S - b, b], [b, b]], C.lit);
  quad([[0, 0], [b, b], [b, S - b], [0, S]], C.lit);
  quad([[S, 0], [S, S], [S - b, S - b], [S - b, b]], C.dark);
  quad([[0, S], [b, S - b], [S - b, S - b], [S, S]], C.dark);
  // Hai cạnh vát cùng tông khác sắc một chút cho thấy khối
  ctx.globalAlpha = 0.35;
  quad([[0, 0], [b, b], [b, S - b], [0, S]], C.dark);
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.face;
  ctx.fillRect(b, b, S - 2 * b, S - 2 * b);

  const cx = S / 2, cy = S / 2;
  const r = S * (big ? 0.3 : 0.24);
  if (C.ring) {
    ctx.fillStyle = C.ring;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.25, 0, Math.PI * 2); ctx.fill();
  }
  if (C.glow) {
    const gl = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.7);
    gl.addColorStop(0, C.glow);
    gl.addColorStop(1, 'rgba(154,209,78,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.7, 0, Math.PI * 2); ctx.fill();
  }
  // Bóng của cầu đổ xuống mặt đỉnh, lệch về dưới-phải
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.arc(cx + r * 0.22, cy + r * 0.28, r, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.08, cx, cy, r);
  g.addColorStop(0, C.ball[0]);
  g.addColorStop(0.45, C.ball[1]);
  g.addColorStop(1, C.ball[2]);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  if (theme === 'christmas') {
    // Tuyết đọng trên nửa trên quả cầu
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.1, cy - r * 0.55, r * 0.7, r * 0.32, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  return cv;
}
