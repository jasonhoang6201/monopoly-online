/**
 * Nhạc cụ tổng hợp của chủ đề Tết — không tải file nào, toàn bộ dựng bằng
 * Web Audio như hai chủ đề trước:
 *
 *   · đàn tranh (`tranh`): mượn dây Karplus–Strong của `audio.js`, gảy sáng
 *     và nhấn nhá một nốt luyến từ dưới lên — cái "láy" làm tiếng tranh khác
 *     tiếng ghi-ta.
 *   · trống cái (`drum`), phách tre (`clapper`), chiêng (`gong`), pháo
 *     (`firecrackers`), xèng tiền (`chime`).
 *
 * Mọi hàm nhận `a` là bộ âm thanh, `when` theo đồng hồ AudioContext, và
 * `dest` là nút nhận (đường hiệu ứng hay đường nhạc).
 */

export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

function env(g, t0, attack, peak, dur) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function tone(a, freq, t0, peak, dur, dest, type = 'sine', attack = 0.004, glide = 0) {
  const o = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t0 + dur);
  env(g, t0, attack, peak, dur);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(a, t0, dur, freq, q, peak, dest, type = 'bandpass') {
  const n = a.noiseSource(dur + 0.02);
  const f = a.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.ctx.createGain();
  env(g, t0, 0.001, peak, dur);
  n.connect(f).connect(g).connect(dest);
  n.start(t0);
}

/**
 * Đàn tranh: dây sáng, ngân vừa. `bend` bật nốt láy — gảy thấp hơn một cung
 * rồi nhấn lên đúng cao độ, kiểu tay trái ấn phím đàn.
 */
export function tranh(a, freq, when, dur, gain, o = {}) {
  if (o.bend) a.gtr(freq * 0.891, when - 0.06, 0.07, gain * 0.55, { bright: 1, rel: 0.03 });
  a.gtr(freq, when, dur, gain, { bright: 1, vib: dur > 0.5 ? 14 : 0, rel: 0.4 });
}

/** Trống cái: thân trầm rơi cao độ, mặt da đập một mẩu nhiễu. */
export function drum(a, when, gain, dest) {
  tone(a, 120, when, gain, 0.42, dest, 'sine', 0.002, 0.45);
  tone(a, 70, when, gain * 0.7, 0.55, dest, 'sine', 0.003, 0.8);
  noise(a, when, 0.05, 900, 1.2, gain * 0.35, dest);
}

/** Phách tre gõ lên mặt gỗ: khô, cao, ngắn. */
export function clapper(a, when, gain, dest) {
  a.woodBlock(when, 1150 + Math.random() * 120, gain, dest);
}

/** Chiêng: gốc thấp, bồi âm lệch kiểu kim loại, ngân dài và rung nhẹ. */
export function gong(a, when, gain, dest, f = 180) {
  for (const [m, p, d] of [[1, 1, 2.8], [1.48, 0.45, 2.1], [2.01, 0.32, 1.6], [2.74, 0.2, 1.1], [4.1, 0.08, 0.5]]) {
    tone(a, f * m, when, gain * p, d, dest, 'sine', 0.006, 0.985);
  }
  noise(a, when, 0.08, 2400, 0.8, gain * 0.25, dest);
}

/** Một tràng pháo: `n` tiếng nổ ngắn, dồn dập rồi thưa dần, mỗi tiếng một độ to. */
export function firecrackers(a, when, gain, dest, n = 18) {
  let t = when;
  for (let i = 0; i < n; i++) {
    const g = gain * (0.55 + Math.random() * 0.45);
    noise(a, t, 0.045, 1600 + Math.random() * 1800, 0.7, g, dest);
    noise(a, t, 0.08, 180, 0.9, g * 0.6, dest, 'lowpass');
    t += 0.035 + Math.random() * 0.05 + (i / n) * 0.04;
  }
}

/** Xèng tiền xu va nhau — mấy nốt sin cao, rất ngắn, lệch nhau. */
export function chime(a, when, gain, dest, midis = [84, 88, 91]) {
  midis.forEach((m, i) => {
    tone(a, mtof(m), when + i * 0.035, gain * (1 - i * 0.15), 0.32, dest, 'sine', 0.002);
    tone(a, mtof(m) * 2.76, when + i * 0.035, gain * 0.12, 0.08, dest, 'sine', 0.001);
  });
}
