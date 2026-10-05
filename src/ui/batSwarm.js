/**
 * Đàn dơi bay toàn màn hình — chủ đề Halloween, mỗi lần quân đi qua ô Bắt Đầu.
 *
 * Vẽ trên một canvas HTML phủ cả cửa sổ chứ không trong Phaser: khung vẽ
 * Phaser nằm dưới cột trái và các bảng HTML, dơi bay trong đó thì bị che mất
 * nửa màn hình. Canvas này `pointer-events: none` nên không chặn cú bấm nào,
 * bay xong thì tự gỡ khỏi trang.
 *
 * Chỉ là hình, không chữ, không huy hiệu — theo quy tắc hoạt cảnh của bàn cờ.
 */
import { drawBat } from '../render/halloweenArt.js';
import { reducedMotion } from '../theme/theme.js';

/** Thời lượng một lượt dơi bay (ms). */
const DUR = 2300;
/** Số dơi trong đàn. */
const COUNT = 26;

/**
 * Thả một đàn dơi từ điểm (x, y) — toạ độ CSS của ô Bắt Đầu trên màn hình.
 * Dơi toả ra mọi hướng nhưng dồn về phía trên, bay vụt qua mép màn hình.
 * @returns {Promise<void>} xong khi con dơi cuối đã ra khỏi màn hình
 */
export function batSwarm(x, y) {
  if (reducedMotion()) return Promise.resolve();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth, H = window.innerHeight;
  const cv = document.createElement('canvas');
  cv.className = 'bat-swarm';
  cv.setAttribute('aria-hidden', 'true');
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  Object.assign(cv.style, {
    position: 'fixed', inset: '0', width: `${W}px`, height: `${H}px`,
    pointerEvents: 'none', zIndex: '2000',
  });
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);

  const reach = Math.hypot(W, H);
  const bats = Array.from({ length: COUNT }, (_, i) => {
    // Góc toả: phần lớn hướng lên trên (−π/2 ± 1.3), vài con bay ngang
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
    return {
      a,
      wob: Math.random() * Math.PI * 2,
      delay: (i / COUNT) * 0.45 + Math.random() * 0.08,
      size: 14 + Math.random() * 22,
      dist: reach * (0.75 + Math.random() * 0.4),
      flap: 14 + Math.random() * 8,
    };
  });

  return new Promise((resolve) => {
    const t0 = performance.now();
    const frame = (now) => {
      const t = (now - t0) / DUR;
      g.clearRect(0, 0, W, H);
      for (const b of bats) {
        const k = (t - b.delay) / (1 - b.delay);
        if (k <= 0 || k >= 1) continue;
        const e = k * k * (1.6 - 0.6 * k);           // vụt ra chậm rồi nhanh dần
        const bx = x + Math.cos(b.a) * b.dist * e + Math.sin(k * 9 + b.wob) * 18;
        const by = y + Math.sin(b.a) * b.dist * e + Math.cos(k * 7 + b.wob) * 12;
        const s = b.size * (0.6 + e * 0.9);           // bay về phía người xem
        g.globalAlpha = Math.min(1, k * 6) * (1 - Math.max(0, k - 0.85) / 0.15);
        g.shadowColor = 'rgba(140,107,192,.85)';
        g.shadowBlur = 4;
        drawBat(g, bx, by, s, now / 1000 * b.flap + b.wob);
      }
      if (t < 1) requestAnimationFrame(frame);
      else { cv.remove(); resolve(); }
    };
    requestAnimationFrame(frame);
  });
}
