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

/** Gắn khung đèn vào một hộp thoại vừa dựng. */
export function attachLedFrame(modal) {
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
