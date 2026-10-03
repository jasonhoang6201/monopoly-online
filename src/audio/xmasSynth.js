/**
 * Tiếng cho chủ đề Giáng Sinh: chuông tay, chuông xe tuần lộc, chuông nhà
 * thờ, celesta, khối băng rơi, tiếng chân lạo xạo trên tuyết.
 *
 * Mọi tiếng ở đây **tổng hợp sẵn thành mẫu** (`AudioBuffer`) một lần rồi giữ
 * lại, lúc phát chỉ còn một `BufferSource` và một `Gain`. Chuông là tổng của
 * nhiều bồi âm tắt dần; dựng bằng oscillator thì một ô nhịp Jingle Bells (giai
 * điệu + tám lần lắc chuông, mỗi lần tám quả chuông nhỏ ba bồi âm) cần hơn trăm
 * nút âm thanh, máy yếu nghe ra giật. Mẫu dựng sẵn thì mỗi tiếng một nút.
 *
 * Tỉ lệ bồi âm lấy theo chuông thật:
 *   · chuông nhà thờ có bồi âm tierce là quãng ba thứ (×1,2) nằm trên âm gốc,
 *     chính nó cho ra tiếng trầm buồn đặc trưng;
 *   · chuông xe tuần lộc là quả cầu kim loại có hòn bi lăn bên trong: tiếng
 *     cao, tắt rất nhanh, nhiều quả va lệch nhau vài mili giây. Tắt nhanh là
 *     điểm khác chuông gió — chuông gió ngân dài và thưa.
 */

const TAU = Math.PI * 2;
const cache = new Map();

/**
 * Dựng mẫu chuông: tổng các sóng sin tắt dần theo hàm mũ.
 *
 * @param {AudioContext} ctx
 * @param {string} key khoá giữ mẫu trong bộ nhớ đệm
 * @param {number} f0 tần số gốc (Hz)
 * @param {Array<[number, number, number]>} partials [tỉ lệ tần số, biên độ, thời gian tắt (giây)]
 * @param {object} [o] `dur` độ dài mẫu, `click` độ đậm tiếng gõ lúc đánh
 */
function bellBuffer(ctx, key, f0, partials, o = {}) {
  if (cache.has(key)) return cache.get(key);
  const sr = ctx.sampleRate;
  const dur = o.dur ?? Math.max(...partials.map((p) => p[2])) * 1.2;
  const len = Math.max(1, Math.floor(sr * dur));
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (const [ratio, amp, decay] of partials) {
    const f = f0 * ratio;
    if (f >= sr / 2) continue;
    const w = (TAU * f) / sr;
    const k = Math.exp(-1 / (decay * sr));   // hệ số tắt mỗi mẫu
    const ph = Math.random() * TAU;
    let env = amp;
    for (let i = 0; i < len; i++) {
      d[i] += env * Math.sin(w * i + ph);
      env *= k;
    }
  }
  // Tiếng búa gõ: một mẩu nhiễu rất ngắn ở đầu mẫu, sai phân để bỏ phần trầm
  const click = o.click ?? 0;
  if (click > 0) {
    const n = Math.floor(sr * 0.006);
    let prev = 0;
    for (let i = 0; i < n && i < len; i++) {
      const x = Math.random() * 2 - 1;
      d[i] += (x - prev) * click * (1 - i / n);
      prev = x;
    }
  }
  normalize(d, 0.9, Math.floor(sr * 0.004));
  cache.set(key, buf);
  return buf;
}

/** Đưa đỉnh về `peak`, vuốt mép đầu và mép cuối cho khỏi lụp bụp. */
function normalize(d, peak, fadeIn = 0) {
  let max = 1e-6;
  for (const v of d) if (Math.abs(v) > max) max = Math.abs(v);
  const g = peak / max;
  const tail = Math.min(d.length, 256);
  for (let i = 0; i < d.length; i++) {
    let e = 1;
    if (i < fadeIn) e = i / fadeIn;
    if (i > d.length - tail) e *= (d.length - i) / tail;
    d[i] *= g * e;
  }
}

/** Phát một mẫu tới `dest`, kèm một nhánh gửi sang hồi âm nếu có. */
export function play(a, buf, when, gain, dest, o = {}) {
  const ctx = a.ctx;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (o.rate) src.playbackRate.value = o.rate;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(dest);
  if (o.wet && a.reverb) {
    const s = ctx.createGain();
    s.gain.value = o.wet;
    g.connect(s).connect(a.reverb);
  }
  src.start(when);
  return src;
}

/* ------------------------------------------------------------------ nhạc cụ */

/** Celesta / hộp nhạc: thanh kim loại gõ, bồi âm ×2,76 và ×5,4 tắt nhanh hơn gốc. */
const CELESTA = (dur) => [[1, 1, dur], [2, 0.18, dur * 0.5], [2.76, 0.28, dur * 0.32], [5.4, 0.1, dur * 0.16], [8.93, 0.04, dur * 0.08]];

export function celesta(a, freq, when, gain, dest, dur = 1.4) {
  const f = Math.round(freq * 10) / 10;
  const buf = bellBuffer(a.ctx, `cel:${f}:${dur}`, f, CELESTA(dur), { click: 0.25 });
  return play(a, buf, when, gain, dest, { wet: 0.35 });
}

/** Một lần lắc chùm chuông xe tuần lộc. Bốn biến thể dựng sẵn, bốc ngẫu nhiên. */
function sleighBuffer(ctx, v) {
  const key = `sleigh:${v}`;
  if (cache.has(key)) return cache.get(key);
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.16);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  // 9 quả chuông nhỏ va nhau trong ~22 ms, mỗi quả ba bồi âm tắt trong vài chục ms
  for (let b = 0; b < 9; b++) {
    const at = Math.floor(Math.random() * sr * 0.022);
    const f = 3400 + Math.random() * 2400;
    const amp = 0.5 + Math.random() * 0.5;
    for (const [ratio, pa, dec] of [[1, 1, 0.055], [1.51, 0.55, 0.035], [2.33, 0.3, 0.02]]) {
      const w = (TAU * f * ratio) / sr;
      const k = Math.exp(-1 / ((dec + Math.random() * 0.02) * sr));
      let env = amp * pa;
      for (let i = at; i < len; i++) { d[i] += env * Math.sin(w * (i - at)); env *= k; }
    }
  }
  // Tiếng bi lăn và vỏ chuông cọ nhau: nhiễu cao tần tắt nhanh
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const x = Math.random() * 2 - 1;
    d[i] += (x - prev) * 0.35 * Math.exp(-i / (sr * 0.03));
    prev = x;
  }
  normalize(d, 0.8, 16);
  cache.set(key, buf);
  return buf;
}

export function sleighShake(a, when, gain, dest) {
  const buf = sleighBuffer(a.ctx, (Math.random() * 4) | 0);
  return play(a, buf, when, gain, dest, { wet: 0.15, rate: 0.94 + Math.random() * 0.12 });
}

/**
 * Khối băng rơi xuống mặt bàn: tiếng "cộp" trầm của khối đặc chạm mặt gỗ,
 * kèm tiếng băng nứt giòn và hai lần nảy nhỏ dần. Bốn biến thể.
 */
function iceDropBuffer(ctx, v) {
  const key = `ice-drop:${v}`;
  if (cache.has(key)) return cache.get(key);
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.3);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const hit = (at, amp) => {
    const s0 = Math.floor(at * sr);
    // Thân: sin trầm 180–260 Hz tắt nhanh + nhiễu lọc thấp ~700 Hz
    const fb = 180 + Math.random() * 80;
    let env = amp;
    const kb = Math.exp(-1 / (0.03 * sr));
    let lp = 0;
    const c = 1 - Math.exp((-TAU * 700) / sr);
    for (let i = 0; s0 + i < len && i < sr * 0.12; i++) {
      lp += c * ((Math.random() * 2 - 1) - lp);
      d[s0 + i] += env * (Math.sin((TAU * fb * i) / sr) * 0.8 + lp * 2.2 * Math.exp(-i / (sr * 0.012)));
      env *= kb;
    }
    // Băng kêu giòn: một mode 1,1–1,6 kHz tắt trong ~35 ms
    const fc = 1100 + Math.random() * 500;
    const kc = Math.exp(-1 / (0.035 * sr));
    let e2 = amp * 0.35;
    for (let i = 0; s0 + i < len; i++) { d[s0 + i] += e2 * Math.sin((TAU * fc * i) / sr); e2 *= kc; }
  };
  hit(0, 1);
  hit(0.06 + Math.random() * 0.02, 0.38);
  hit(0.11 + Math.random() * 0.03, 0.16);
  normalize(d, 0.85, 8);
  cache.set(key, buf);
  return buf;
}

export function iceDrop(a, when, gain, dest) {
  const buf = iceDropBuffer(a.ctx, (Math.random() * 4) | 0);
  return play(a, buf, when, gain, dest, { wet: 0.06, rate: 0.94 + Math.random() * 0.12 });
}

/**
 * Chuông tay bản demo (`demo/christmas.html`, nút "Mua đất"): năm bồi âm
 * ×1, ×2, ×3, ×4,2, ×5,4 không có tiếng gõ đầu. Bồi âm càng cao tắt càng
 * nhanh, đúng công thức của demo: tắt hết trong 1,4 / (1 + (tỉ lệ − 1) · 0,35)
 * giây, quy ra hằng số tắt mũ bằng cách chia cho ln(10⁴) ≈ 9,2.
 */
const DEMO_HANDBELL = [[1, 1], [2, 0.5], [3, 0.25], [4.2, 0.18], [5.4, 0.1]]
  .map(([r, amp]) => [r, amp, 1.4 / (1 + (r - 1) * 0.35) / 9.2]);

export function demoHandbell(a, when, gain, dest, freq) {
  const buf = bellBuffer(a.ctx, `dhb:${freq}`, freq, DEMO_HANDBELL, { dur: 1.2 });
  return play(a, buf, when, gain, dest, { wet: 0.3 });
}

/**
 * Một nốt glockenspiel của bản demo (`bell(…, { partials: GLOCK })` trong
 * demo/christmas.html): bồi âm ×1, ×2,76, ×5,4, ×8,93; lên trong 2 ms rồi tắt
 * theo hàm mũ tới 1/10⁴ sau 1,2 / (1 + (tỉ lệ − 1) · 0,35) giây.
 *
 * Mức âm giữ đúng tuyệt đối như demo (không chuẩn hoá); `play` nhân thêm
 * DEMO_LEVEL vì demo ra loa qua master 0,8, còn game đi qua sfxGain 0,55 và
 * master 0,85.
 */
const DEMO_LEVEL = 0.8 / (0.55 * 0.85);
const GLOCK = [[1, 1], [2.76, 0.32], [5.4, 0.12], [8.93, 0.05]];

function demoGlockBuffer(ctx, freq, gain, dur) {
  const key = `dglock:${freq}:${gain}:${dur}`;
  if (cache.has(key)) return cache.get(key);
  const sr = ctx.sampleRate;
  const total = Math.floor(sr * (dur + 0.05));
  const buf = ctx.createBuffer(1, total, sr);
  const d = buf.getChannelData(0);
  const ln = Math.log(1e4);
  const att = Math.floor(sr * 0.002);
  for (const [ratio, amp] of GLOCK) {
    const f = freq * ratio;
    if (f > 16000) continue;
    const end = Math.floor(sr * (dur / (1 + (ratio - 1) * 0.35)));
    const w = (TAU * f) / sr;
    for (let i = 0; i < end && i < total; i++) {
      const env = i < att ? i / att : Math.exp((-ln * i) / end);
      d[i] += gain * amp * env * Math.sin(w * i);
    }
  }
  cache.set(key, buf);
  return buf;
}

export function demoGlock(a, when, dest, freq, gain = 0.11, dur = 1.2) {
  return play(a, demoGlockBuffer(a.ctx, freq, gain, dur), when, DEMO_LEVEL, dest, { wet: 0.22 });
}

/** Chuông nhà thờ: bồi âm theo phổ đo trên chuông đồng (hum, prime, tierce…). */
const CHURCH = [[0.5, 0.75, 4.5], [1, 1, 3.6], [1.183, 0.6, 2.6], [1.506, 0.35, 2.0], [2, 0.55, 1.6], [2.514, 0.22, 1.0], [2.662, 0.18, 0.9], [3.011, 0.12, 0.7], [4.166, 0.08, 0.5]];

export function churchBell(a, when, gain, dest, freq = 196) {
  const buf = bellBuffer(a.ctx, `church:${freq}`, freq, CHURCH, { click: 0.15, dur: 5 });
  return play(a, buf, when, gain, dest, { wet: 0.5 });
}

/**
 * Bước chân trên tuyết: tuyết nén lại kêu thành chuỗi tiếng lạo xạo rất
 * ngắn, nên dựng bằng vài chục hạt nhiễu 2–6 ms rải trong 90 ms, lọc trung
 * bình trượt cho bớt chói.
 */
function crunchBuffer(ctx, v) {
  const key = `crunch:${v}`;
  if (cache.has(key)) return cache.get(key);
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.1);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let g = 0; g < 26; g++) {
    const at = Math.floor(Math.random() * len * 0.8);
    const n = Math.floor(sr * (0.002 + Math.random() * 0.004));
    const amp = (0.4 + Math.random() * 0.6) * (1 - at / len);
    for (let i = 0; i < n && at + i < len; i++) d[at + i] += (Math.random() * 2 - 1) * amp * (1 - i / n);
  }
  /* Hai lần lọc thông thấp một cực ở ~1,6 kHz: chỉ còn tiếng "rộp" trầm. Quân
     đi 12 ô là 12 tiếng liền, để phần xì trên 4 kHz lại thì nghe rát tai. */
  const c = 1 - Math.exp((-TAU * 1600) / sr);
  for (let pass = 0; pass < 2; pass++) {
    let lp = 0;
    for (let i = 0; i < len; i++) { lp += c * (d[i] - lp); d[i] = lp; }
  }
  normalize(d, 0.8, 8);
  cache.set(key, buf);
  return buf;
}

export function snowStep(a, when, gain, dest) {
  const buf = crunchBuffer(a.ctx, (Math.random() * 5) | 0);
  return play(a, buf, when, gain, dest, { rate: 0.85 + Math.random() * 0.3 });
}

/** Số hiệu MIDI → Hz. */
export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
