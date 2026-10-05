/**
 * Viền đèn LED quanh hộp thoại — chủ đề Giáng Sinh.
 *
 * Mỗi hộp thoại có sẵn một khung rỗng (`.led-frame`); chỉ khi đang chơi chủ
 * đề Giáng Sinh mới rải bóng đèn vào. Bóng rải đều theo chu vi hình chữ nhật
 * bo góc của hộp, dây điện võng vào trong giữa hai bóng. Bóng chia ba nhóm,
 * CSS cho ba nhóm sáng lệch pha nhau (`theme/christmas.css`) nên ánh sáng
 * chạy vòng quanh khung.
 *
 * Cỡ hộp thoại đổi liên tục (băng chuyền bóc thẻ co lại quanh mặt thẻ, nội
 * dung dài thêm) nên khung đo lại theo `ResizeObserver`, gộp mỗi khung hình
 * một lần đo.
 */
import { isXmas, onTheme } from '../theme/theme.js';

/** Khoảng cách giữa hai bóng (px) và bán kính góc hộp thoại (khớp `.modal`). */
const STEP = 34;
const RADIUS = 15;
/** Khung nằm lùi ra ngoài mép hộp bấy nhiêu px (khớp `inset` trong CSS). */
const OUT = 7;
const COLORS = ['#FF4D55', '#4FD27F', '#FFCF4A', '#57B8FF', '#FF8AD0'];

/**
 * Mạng nhện góc và con dơi treo ngược — khung trang trí hộp thoại chủ đề
 * Halloween. Hình tĩnh, đặt **ngoài** mép hộp (CSS `.spook-frame`), nên không
 * bao giờ đè lên chữ trong hộp, cũng không cần đo lại khi hộp đổi cỡ.
 */
function spookSvg() {
  const web = (flip) => {
    const spokes = 6, rings = 4, R = 60;
    const ang = Array.from({ length: spokes }, (_, i) => Math.PI + (i / (spokes - 1)) * (Math.PI / 2));
    let d = '';
    for (const a of ang) d += `M0 0L${(Math.cos(a) * R).toFixed(1)} ${(Math.sin(a) * R).toFixed(1)}`;
    for (let k = 1; k <= rings; k++) {
      const rr = (k / rings) * R * 0.9;
      for (let i = 0; i < spokes - 1; i++) {
        const a0 = ang[i], a1 = ang[i + 1], am = (a0 + a1) / 2;
        d += `M${(Math.cos(a0) * rr).toFixed(1)} ${(Math.sin(a0) * rr).toFixed(1)}`
          + `Q${(Math.cos(am) * rr * 0.86).toFixed(1)} ${(Math.sin(am) * rr * 0.86).toFixed(1)} `
          + `${(Math.cos(a1) * rr).toFixed(1)} ${(Math.sin(a1) * rr).toFixed(1)}`;
      }
    }
    return `<svg class="spook-web ${flip ? 'r' : 'l'}" viewBox="-62 -62 64 64"><path d="${d}"/></svg>`;
  };
  const bat = '<svg class="spook-bat" viewBox="0 0 64 64"><path d="M32 2v14" class="thread"/>'
    + '<g transform="translate(0 64) scale(1 -1)"><path d="M28 30C22 21 12 21 3 26c4 2 6 6 6 10 3-3 7-3 9 0 2-3 6-3 10-2zM36 30c6-9 16-9 25-4-4 2-6 6-6 10-3-3-7-3-9 0-2-3-6-3-10-2z"/>'
    + '<path d="M32 25c-4 0-5 3-5 7s2 6 5 6 5-2 5-6-1-7-5-7z"/><path d="M28.5 27l1-5 2.5 3 2.5-3 1 5z"/>'
    + '<circle class="eye" cx="30" cy="30.5" r="1.2"/><circle class="eye" cx="34" cy="30.5" r="1.2"/></g></svg>';
  return web(false) + web(true) + bat;
}

/** Gắn khung đèn vào một hộp thoại vừa dựng. */
export function attachLedFrame(modal) {
  const spook = document.createElement('div');
  spook.className = 'spook-frame';
  spook.setAttribute('aria-hidden', 'true');
  spook.innerHTML = spookSvg();
  modal.appendChild(spook);

  const frame = document.createElement('div');
  frame.className = 'led-frame';
  frame.setAttribute('aria-hidden', 'true');
  modal.appendChild(frame);

  let pending = 0;
  let size = '';
  const build = () => {
    pending = 0;
    if (!frame.isConnected) { ro.disconnect(); return; }
    if (!isXmas()) { frame.innerHTML = ''; size = ''; return; }
    const w = modal.offsetWidth + OUT * 2, h = modal.offsetHeight + OUT * 2;
    const key = `${w}x${h}`;
    if (key === size || w < 40 || h < 40) return;
    size = key;
    frame.innerHTML = frameSvg(w, h);
  };
  const ro = new ResizeObserver(() => { if (!pending) pending = requestAnimationFrame(build); });
  ro.observe(modal);
  frame._build = () => { size = ''; build(); };
}

// Đổi chủ đề lúc hộp thoại đang mở (chủ phòng đổi trong phòng chờ): dựng lại
onTheme(() => {
  for (const f of document.querySelectorAll('.led-frame')) f._build?.();
});

/** Dây và bóng đèn cho khung `w × h`, dạng chuỗi SVG. */
function frameSvg(w, h) {
  const r = RADIUS + OUT;
  const per = 2 * (w + h) - 8 * r + 2 * Math.PI * r;
  const n = Math.max(12, Math.round(per / STEP));
  const pts = Array.from({ length: n }, (_, i) => pointOn(w, h, r, (i / n) * per));

  let wire = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    // Võng vào trong: ngược chiều pháp tuyến ra ngoài của đoạn ấy
    const nx = (a.nx + b.nx) / 2, ny = (a.ny + b.ny) / 2;
    const mx = (a.x + b.x) / 2 - nx * 6, my = (a.y + b.y) / 2 - ny * 6;
    wire += `Q${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }

  const bulbs = pts.map((p, i) => {
    const c = COLORS[i % COLORS.length];
    const rot = (Math.atan2(p.ny, p.nx) * 180) / Math.PI - 90;
    return `<g class="led g${i % 3}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${rot.toFixed(0)})">`
      + `<circle class="led-halo" cy="3.5" r="9" fill="${c}"/>`
      + '<rect x="-2.4" y="-5" width="4.8" height="4" rx="1" fill="#1F4D31"/>'
      + `<ellipse cy="3.4" rx="4.2" ry="6" fill="${c}"/>`
      + '<ellipse cx="-1.3" cy="1.6" rx="1.2" ry="2" fill="#fff" opacity=".7"/></g>';
  }).join('');

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<path d="${wire}Z" fill="none" stroke="#1F4D31" stroke-width="1.6"/>${bulbs}</svg>`;
}

/** Điểm trên chu vi hình chữ nhật bo góc ở quãng `s`, kèm pháp tuyến hướng ra ngoài. */
function pointOn(w, h, r, s) {
  const arc = (cx, cy, a) => ({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) });
  const q = (Math.PI * r) / 2;
  const segs = [
    [w - 2 * r, (t) => ({ x: r + t, y: 0, nx: 0, ny: -1 })],
    [q, (t) => arc(w - r, r, -Math.PI / 2 + t / r)],
    [h - 2 * r, (t) => ({ x: w, y: r + t, nx: 1, ny: 0 })],
    [q, (t) => arc(w - r, h - r, t / r)],
    [w - 2 * r, (t) => ({ x: w - r - t, y: h, nx: 0, ny: 1 })],
    [q, (t) => arc(r, h - r, Math.PI / 2 + t / r)],
    [h - 2 * r, (t) => ({ x: 0, y: h - r - t, nx: -1, ny: 0 })],
    [q, (t) => arc(r, r, Math.PI + t / r)],
  ];
  for (const [len, at] of segs) {
    if (s <= len) return at(s);
    s -= len;
  }
  return segs[0][1](0);
}
