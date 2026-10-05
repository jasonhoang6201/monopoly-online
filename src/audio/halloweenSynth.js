/**
 * Nhạc cụ tổng hợp của chủ đề Halloween — cùng cách làm với trang concept Jason
 * đã nghe và chốt: dao động sin/tam giác bọc đường bao, thêm một mẩu nhiễu
 * lọc dải cho tiếng gõ. Không tải file âm thanh nào.
 *
 *   · mộc cầm (`xylo`): tiếng xương gõ — Saint-Saëns dùng chính nhạc cụ này
 *     cho tiếng xương trong Danse Macabre.
 *   · xương lạch cạch (`bones`), chuông nhà nguyện (`chapelBell`), theremin,
 *     organ.
 *
 * Mọi hàm nhận `a` là bộ âm thanh (`audio.js`), `when` theo đồng hồ
 * AudioContext và `dest` là nút nhận (đường hiệu ứng hay đường nhạc).
 */

/** Đường bao lên nhanh, tắt theo hàm mũ. */
function env(g, t0, attack, peak, dur) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

/** Một dao động có đường bao, nối vào `dest` (kèm nhánh hồi âm nếu `wet`). */
function tone(a, freq, t0, peak, dur, dest, type = 'sine', attack = 0.004, wet = 0) {
  const ctx = a.ctx;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  env(g, t0, attack, peak, dur);
  o.connect(g).connect(dest);
  if (wet && a.reverb) {
    const s = ctx.createGain();
    s.gain.value = wet;
    g.connect(s).connect(a.reverb);
  }
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** Mẩu nhiễu lọc dải — tiếng gõ đầu nốt, tiếng cọ của xương. */
function noise(a, t0, dur, freq, q, peak, dest) {
  const ctx = a.ctx;
  const n = a.noiseSource(dur + 0.02);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = ctx.createGain();
  env(g, t0, 0.002, peak, dur);
  n.connect(bp).connect(g).connect(dest);
  n.start(t0);
}

/** Mộc cầm: thanh gỗ gõ, bồi âm ×3,9 tắt rất nhanh, đầu nốt có tiếng gõ. */
export function xylo(a, freq, when, gain, dest, dur = 0.38) {
  tone(a, freq, when, gain, dur, dest, 'sine', 0.002, 0.25);
  tone(a, freq * 3.9, when, gain * 0.16, dur * 0.22, dest, 'sine', 0.001);
  noise(a, when, 0.02, 1800, 2, gain * 0.13, dest);
}

/** Một cú xương gõ vào nhau: gỗ khô tần số 380–700 Hz kèm tiếng cọ. */
export function boneClack(a, when, gain, dest) {
  const f = 380 + Math.random() * 320;
  tone(a, f, when, gain, 0.09, dest, 'triangle', 0.002);
  tone(a, f * 2.6, when, gain * 0.16, 0.04, dest, 'sine', 0.002);
  noise(a, when, 0.05, 700, 3, gain * 0.55, dest);
}

/** Chuông nhà nguyện: gốc 196 Hz, bồi âm chuông ×2, ×2,76, ×5,4, ngân dài. */
export function chapelBell(a, when, gain, dest, f = 196) {
  for (const [m, p, d] of [[1, 1, 3.2], [2, 0.47, 2.2], [2.76, 0.35, 1.6], [5.4, 0.12, 0.7]]) {
    tone(a, f * m, when, gain * p, d, dest, 'sine', 0.003, 0.35);
  }
  tone(a, f * 0.5, when, gain * 0.35, 3.4, dest, 'sine', 0.01, 0.2);
}

/** Theremin: một nốt sin trượt lên rồi trượt xuống, rung 6 Hz. */
export function theremin(a, when, gain, dest, from = 330, peak = 520, to = 280, dur = 1.9) {
  const ctx = a.ctx;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lg = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(from, when);
  o.frequency.exponentialRampToValueAtTime(peak, when + dur * 0.3);
  o.frequency.exponentialRampToValueAtTime(to, when + dur * 0.85);
  lfo.frequency.value = 6;
  lg.gain.value = 9;
  lfo.connect(lg).connect(o.frequency);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + 0.15);
  g.gain.setValueAtTime(gain, when + dur * 0.63);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g).connect(dest);
  if (a.reverb) {
    const s = ctx.createGain();
    s.gain.value = 0.3;
    g.connect(s).connect(a.reverb);
  }
  o.start(when); lfo.start(when);
  o.stop(when + dur + 0.05); lfo.stop(when + dur + 0.05);
}

/**
 * Organ nhà thờ: mỗi nốt bốn bồi âm (ống 8', 4', 2⅔', 2'), qua bộ lọc thấp,
 * rung biên độ 5,2 Hz.
 */
export function organ(a, freqs, when, dur, gain, dest) {
  const ctx = a.ctx;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  lp.connect(dest);
  if (a.reverb) {
    const s = ctx.createGain();
    s.gain.value = 0.35;
    lp.connect(s).connect(a.reverb);
  }
  const bus = ctx.createGain();
  const trem = ctx.createOscillator();
  const tg = ctx.createGain();
  trem.frequency.value = 5.2;
  tg.gain.value = gain * 0.12;
  trem.connect(tg).connect(bus.gain);
  bus.gain.setValueAtTime(0.0001, when);
  bus.gain.exponentialRampToValueAtTime(gain, when + 0.09);
  bus.gain.setValueAtTime(gain, when + dur * 0.5);
  bus.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  bus.connect(lp);
  for (const f of freqs) {
    for (const [m, p] of [[1, 0.32], [2, 0.18], [3, 0.1], [4, 0.05]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f * m;
      g.gain.value = p;
      o.connect(g).connect(bus);
      o.start(when); o.stop(when + dur + 0.05);
    }
  }
  trem.start(when); trem.stop(when + dur + 0.05);
}

/** Tiếng rên của xác sống: nhiễu trầm lọc dải quét xuống, lẫn một nốt sin trượt. */
export function groan(a, when, gain, dest) {
  const ctx = a.ctx;
  const L = 1.4;
  const n = a.noiseSource(L + 0.2);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 6;
  bp.frequency.setValueAtTime(520, when);
  bp.frequency.exponentialRampToValueAtTime(300, when + L);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, when + L);
  n.connect(bp).connect(g).connect(dest);
  n.start(when);
  const o = ctx.createOscillator();
  const og = ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(300, when);
  o.frequency.exponentialRampToValueAtTime(262, when + L);
  env(og, when, 0.2, gain * 0.5, L);
  o.connect(og).connect(dest);
  o.start(when); o.stop(when + L + 0.05);
}

export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
