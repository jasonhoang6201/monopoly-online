/**
 * Xí ngầu 3D — dựng hẳn khối lập phương trong không gian rồi chiếu phối cảnh
 * xuống canvas, thay cho lối tráo ảnh phẳng die-1…die-6 trước đây.
 *
 * Mỗi khung hình vẽ lại: bóng đổ khối, ba mặt đang hướng về phía người xem,
 * ánh sáng đánh từ trên-trái, chấm nghiêng theo mặt (hình bầu dục đúng phối
 * cảnh chứ không phải hình tròn dán lên).
 *
 * Toàn bộ hướng của con xí ngầu giữ bằng quaternion — nhờ vậy vừa quay tự do
 * ba trục lúc lăn, vừa nội suy mượt (slerp) về đúng mặt số cuối cùng.
 */

/* --------------------------------------------------------- quaternion */

/** Nhân hai quaternion: quay theo b trước, rồi tới a. */
export function qMul(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

export function qNorm(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** Quaternion quay quanh trục (x,y,z) một góc `ang` radian. */
export function qAxis(x, y, z, ang) {
  const l = Math.hypot(x, y, z) || 1;
  const h = ang / 2, s = Math.sin(h) / l;
  return [Math.cos(h), x * s, y * s, z * s];
}

/** Nội suy cầu — luôn đi đường ngắn nhất giữa hai hướng. */
export function qSlerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) { bb = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }
  if (d > 0.9995) {
    return qNorm([
      a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t,
      a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t,
    ]);
  }
  const th = Math.acos(d), s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return [
    a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb,
    a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb,
  ];
}

/** Ma trận quay 3×3 (hàng trước) tương ứng quaternion. */
function qMat(q) {
  const [w, x, y, z] = q;
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z;
  const wx = w * x, wy = w * y, wz = w * z;
  return [
    1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy),
    2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx),
    2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy),
  ];
}

/**
 * Khoảng cách từ tâm khối tới điểm thấp nhất, tính theo bội số nửa cạnh:
 * bằng 1 khi một mặt nằm phẳng, tới √3 khi khối chống mũi xuống bàn.
 * Nhờ số này con xí ngầu lăn qua cạnh thì nhổm lên đúng như khối thật,
 * chứ không lún nửa mình xuống mặt bàn.
 */
export function supportFactor(q) {
  const m = qMat(q);
  return Math.abs(m[3]) + Math.abs(m[4]) + Math.abs(m[5]);
}

const rot = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

/** Hướng ngẫu nhiên, phân bố đều trên mặt cầu. */
export function qRandom() {
  const u = Math.random(), v = Math.random(), w = Math.random();
  return [
    Math.sqrt(1 - u) * Math.sin(2 * Math.PI * v),
    Math.sqrt(1 - u) * Math.cos(2 * Math.PI * v),
    Math.sqrt(u) * Math.sin(2 * Math.PI * w),
    Math.sqrt(u) * Math.cos(2 * Math.PI * w),
  ];
}

/* ------------------------------------------------------------- khối xí ngầu */

/**
 * Sáu mặt: `n` pháp tuyến, `u` trục ngang, `w` trục dọc của mặt.
 * Giữ đúng luật hai mặt đối nhau cộng lại bằng 7.
 */
const FACES = [
  { v: 1, n: [0, 0, 1], u: [1, 0, 0], w: [0, 1, 0] },
  { v: 6, n: [0, 0, -1], u: [-1, 0, 0], w: [0, 1, 0] },
  { v: 3, n: [1, 0, 0], u: [0, 0, -1], w: [0, 1, 0] },
  { v: 4, n: [-1, 0, 0], u: [0, 0, 1], w: [0, 1, 0] },
  { v: 5, n: [0, -1, 0], u: [1, 0, 0], w: [0, 0, 1] },
  { v: 2, n: [0, 1, 0], u: [1, 0, 0], w: [0, 0, -1] },
];

/* Vị trí chấm trong hệ toạ độ mặt, [-1,1] */
const A = -0.42, B = 0, C = 0.42;
const PIPS = {
  1: [[B, B]],
  2: [[A, A], [C, C]],
  3: [[A, A], [B, B], [C, C]],
  4: [[A, A], [C, A], [A, C], [C, C]],
  5: [[A, A], [C, A], [B, B], [A, C], [C, C]],
  6: [[A, A], [C, A], [A, B], [C, B], [A, C], [C, C]],
};

/** Hướng gốc đưa mặt số `v` quay thẳng về phía người xem (+Z). */
const FACE_HOME = (() => {
  const map = new Map();
  for (const f of FACES) {
    const [x, y, z] = f.n;
    if (z > 0.99) map.set(f.v, [1, 0, 0, 0]);
    else if (z < -0.99) map.set(f.v, qAxis(1, 0, 0, Math.PI));
    // trục quay = n × Z, góc = góc giữa n và Z
    else map.set(f.v, qAxis(y, -x, 0, Math.acos(Math.max(-1, Math.min(1, z)))));
  }
  return map;
})();

/**
 * Hướng đích để mặt `value` ngửa lên nhìn thẳng vào người xem, chọn sẵn góc
 * xoay quanh trục nhìn gần với hướng hiện tại nhất — con xí ngầu chỉ khẽ
 * chỉnh mình lúc dừng chứ không giật ngược một vòng.
 */
export function qForValue(value, from) {
  const home = FACE_HOME.get(value);
  let best = home, bestDot = -1;
  for (let k = 0; k < 4; k++) {
    const cand = qMul(qAxis(0, 0, 1, (k * Math.PI) / 2), home);
    const d = Math.abs(
      cand[0] * from[0] + cand[1] * from[1] + cand[2] * from[2] + cand[3] * from[3],
    );
    if (d > bestDot) { bestDot = d; best = cand; }
  }
  return best;
}

/* ------------------------------------------------------------------ vẽ */

const LIGHT = (() => {
  const l = [-0.42, -0.72, 0.55];
  const n = Math.hypot(...l);
  return [l[0] / n, l[1] / n, l[2] / n];
})();

/** Đường viền bo góc đi qua các đỉnh đã chiếu. */
function roundPoly(ctx, pts, r) {
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const d1 = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
    const d2 = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const r1 = Math.min(r, d1 * 0.4), r2 = Math.min(r, d2 * 0.4);
    const a = { x: p1.x + ((p0.x - p1.x) / d1) * r1, y: p1.y + ((p0.y - p1.y) / d1) * r1 };
    const b = { x: p1.x + ((p2.x - p1.x) / d2) * r2, y: p1.y + ((p2.y - p1.y) / d2) * r2 };
    if (i === 0) ctx.moveTo(a.x, a.y); else ctx.lineTo(a.x, a.y);
    ctx.quadraticCurveTo(p1.x, p1.y, b.x, b.y);
  }
  ctx.closePath();
}

/** Bao lồi (gift wrapping) — dùng lấy bóng khối của con xí ngầu. */
function hull(input) {
  /* Các mặt kề nhau dùng chung đỉnh, phải gộp lại trước khi quét */
  const seen = new Set();
  const pts = [];
  for (const p of input) {
    const key = `${Math.round(p.x * 8)},${Math.round(p.y * 8)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pts.push(p);
  }
  if (pts.length < 3) return pts;

  let start = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].x < pts[start].x || (pts[i].x === pts[start].x && pts[i].y < pts[start].y)) start = i;
  }
  const out = [];
  let cur = start;
  do {
    out.push(pts[cur]);
    let next = (cur + 1) % pts.length;
    for (let i = 0; i < pts.length; i++) {
      if (i === cur) continue;
      const cross = (pts[next].x - pts[cur].x) * (pts[i].y - pts[cur].y)
        - (pts[next].y - pts[cur].y) * (pts[i].x - pts[cur].x);
      const far = Math.hypot(pts[i].x - pts[cur].x, pts[i].y - pts[cur].y)
        > Math.hypot(pts[next].x - pts[cur].x, pts[next].y - pts[cur].y);
      if (cross < 0 || (cross === 0 && far)) next = i;
    }
    cur = next;
  } while (cur !== start && out.length <= pts.length);
  return out;
}

export function makeDieCanvas(size = 256) {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  return cv;
}

/**
 * Vẽ con xí ngầu ở hướng `q` lên canvas vuông.
 * @param {HTMLCanvasElement} cv khung vẽ riêng của con xí ngầu này
 * @param {number[]} q quaternion hướng hiện tại
 */
export function drawDie(cv, q) {
  const s = cv.width;
  const ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, s, s);

  const e = s * 0.248;          // nửa cạnh khối
  const cam = e * 7.6;          // khoảng cách mắt nhìn
  const m = qMat(q);
  const half = s / 2;
  const proj = (p) => {
    const k = cam / (cam - p[2]);          // càng gần mắt càng nở ra
    return { x: half + p[0] * k, y: half + p[1] * k };
  };

  /* Mặt nào đang quay về phía người xem, xa vẽ trước gần vẽ sau */
  const faces = [];
  for (const f of FACES) {
    const n = rot(m, f.n);
    const c = [n[0] * e, n[1] * e, n[2] * e];
    // hướng từ tâm mặt tới mắt nhìn
    if (n[0] * -c[0] + n[1] * -c[1] + n[2] * (cam - c[2]) <= 0) continue;
    faces.push({ f, n, c, u: rot(m, f.u), w: rot(m, f.w) });
  }
  faces.sort((p, r) => p.c[2] - r.c[2]);

  /* Thân khối: tô đặc phần bao lồi để các cạnh vát trông liền một mảnh */
  const corners = [];
  for (const g of faces) {
    for (const [su, sw] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      corners.push(proj([
        g.c[0] + (g.u[0] * su + g.w[0] * sw) * e,
        g.c[1] + (g.u[1] * su + g.w[1] * sw) * e,
        g.c[2] + (g.u[2] * su + g.w[2] * sw) * e,
      ]));
    }
  }
  if (corners.length) {
    const body = hull(corners);
    ctx.save();
    ctx.shadowColor = 'rgba(20,12,4,.45)';
    ctx.shadowBlur = s * 0.05;
    ctx.shadowOffsetY = s * 0.018;
    roundPoly(ctx, body, s * 0.035);
    ctx.fillStyle = '#C4AC84';
    ctx.fill();
    ctx.restore();
    roundPoly(ctx, body, s * 0.035);
    ctx.strokeStyle = 'rgba(78,58,36,.55)';
    ctx.lineWidth = s * 0.012;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  for (const g of faces) {
    const lit = Math.max(0, g.n[0] * LIGHT[0] + g.n[1] * LIGHT[1] + g.n[2] * LIGHT[2]);
    const k = 0.62 + 0.50 * lit;                       // hệ số sáng của mặt
    const tint = (mul) => {
      const t = Math.min(1, k * mul);
      return `rgb(${Math.round(252 * t)},${Math.round(240 * t)},${Math.round(214 * t)})`;
    };

    /* Thu mặt vào trong một chút để lộ cạnh vát */
    const inset = 0.88;
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sw]) => proj([
      g.c[0] + (g.u[0] * su + g.w[0] * sw) * e * inset,
      g.c[1] + (g.u[1] * su + g.w[1] * sw) * e * inset,
      g.c[2] + (g.u[2] * su + g.w[2] * sw) * e * inset,
    ]));

    const grd = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[2].x, pts[2].y);
    grd.addColorStop(0, tint(1.04));
    grd.addColorStop(0.55, tint(0.97));
    grd.addColorStop(1, tint(0.85));
    roundPoly(ctx, pts, s * 0.055);
    ctx.fillStyle = grd;
    ctx.fill();

    /* Chấm — vẽ trong hệ toạ độ của mặt nên tự méo đúng theo phối cảnh */
    const o = proj(g.c);
    const pu = proj([g.c[0] + g.u[0] * e, g.c[1] + g.u[1] * e, g.c[2] + g.u[2] * e]);
    const pw = proj([g.c[0] + g.w[0] * e, g.c[1] + g.w[1] * e, g.c[2] + g.w[2] * e]);
    const val = g.f.v;
    const red = val === 1 || val === 4;                // lối xí ngầu Á Đông
    const dim = Math.min(1, 0.55 + 0.45 * k);

    /* Mặt gần như nghiêng hẳn: nền chiếu suy biến, bỏ chấm cho khỏi loang */
    const det = (pu.x - o.x) * (pw.y - o.y) - (pu.y - o.y) * (pw.x - o.x);
    if (Math.abs(det) < s * s * 0.002) continue;

    ctx.save();
    ctx.transform(pu.x - o.x, pu.y - o.y, pw.x - o.x, pw.y - o.y, o.x, o.y);
    for (const [a, b] of PIPS[val]) {
      const r = (val === 1 ? 0.20 : 0.148);
      const rg = ctx.createRadialGradient(a - r * 0.3, b - r * 0.3, r * 0.08, a, b, r);
      if (red) {
        rg.addColorStop(0, `rgb(${Math.round(226 * dim)},${Math.round(86 * dim)},${Math.round(62 * dim)})`);
        rg.addColorStop(1, `rgb(${Math.round(126 * dim)},${Math.round(26 * dim)},${Math.round(16 * dim)})`);
      } else {
        rg.addColorStop(0, `rgb(${Math.round(84 * dim)},${Math.round(66 * dim)},${Math.round(48 * dim)})`);
        rg.addColorStop(1, `rgb(${Math.round(24 * dim)},${Math.round(17 * dim)},${Math.round(9 * dim)})`);
      }
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(a, b, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return cv;
}

/** Vệt bóng mềm hắt xuống mặt bàn cờ. */
export function paintDieShadow(s = 128) {
  const cv = document.createElement('canvas');
  cv.width = s; cv.height = s;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(8,10,18,.62)');
  g.addColorStop(0.45, 'rgba(8,10,18,.34)');
  g.addColorStop(1, 'rgba(8,10,18,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return cv;
}
