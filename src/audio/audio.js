/**
 * Nhạc nền và âm thanh — tổng hợp trực tiếp bằng Web Audio API,
 * không dùng file ngoài.
 *
 * NHẠC NỀN chỉ chạy ở màn hình chờ (chưa khai cuộc). Vào ván là im,
 * chỉ còn hiệu ứng âm thanh để không át tiếng bàn cờ.
 *
 * Chất nhạc: ĐỘC TẤU GHI-TA THÙNG dây nilon, điệu valse tươi kiểu phòng trà
 * Sài Gòn những năm 60. Một cây đàn lo hết: ngón cái giữ nốt trầm ở phách 1,
 * ngón trỏ – giữa – áp út rải hợp âm ở phách 2 và 3, giai điệu chạy trên dây
 * cao có rung ngón và luyến, thỉnh thoảng quạt nhẹ một nhịp hay điểm một nốt
 * bồi; tiếng gõ thùng (golpe) giữ nhịp thay cho bộ gõ.
 * Giai điệu đi trên thang RÊ TRƯỞNG (rê mi fa♯ sol la si đô♯), vòng hoà thanh
 * Rê – Si thứ – Sol – La quen tai và sáng sủa. Câu nhạc bám mấy bậc ngũ cung
 * rê–mi–fa♯–la–si nên vẫn ra chất Việt, mà nghe thì phơi phới chứ không u ám.
 *
 * Bản nhạc dựng theo ĐOẠN chứ không lặp một vòng ngắn: sáu đoạn
 * (Dạo · A · B · Ngân · A' · Kết) tổng cộng 42 ô nhịp ≈ 1 phút 15,
 * mỗi ô nhịp rút một câu nhạc từ kho rồi biến tấu và nắn về nốt trong hợp âm,
 * nên vòng sau không bao giờ giống hệt vòng trước.
 */

const A4 = 440;
/** Số hiệu MIDI → tần số (Hz). */
const mtof = (m) => A4 * 2 ** ((m - 69) / 12);

/** Rê trưởng, ba quãng tám. Cách 7 bậc là lên một quãng tám. */
const MEL_MIDI = [
  50, 52, 54, 55, 57, 59, 61,   //  0–6   rê3 … đô♯4
  62, 64, 66, 67, 69, 71, 73,   //  7–13  rê4 … đô♯5
  74, 76, 78, 79, 81, 83, 85,   // 14–20  rê5 … đô♯6
];
const MEL = MEL_MIDI.map(mtof);
/** Bậc gốc của giai điệu: rê4. */
const ROOT = 7;

/**
 * Vòng hoà thanh. `bass` là nốt trầm ngón cái gảy ở phách 1,
 * `tones` là hợp âm ba ngón kia rải ở phách 2 và 3.
 */
const PROG_A = [
  { bass: 38, tones: [62, 66, 69] },   // Rê trưởng
  { bass: 47, tones: [62, 66, 71] },   // Si thứ
  { bass: 43, tones: [62, 67, 71] },   // Sol trưởng
  { bass: 45, tones: [61, 64, 69] },   // La trưởng
  { bass: 38, tones: [62, 66, 69] },   // Rê trưởng
  { bass: 47, tones: [62, 66, 71] },   // Si thứ
  { bass: 43, tones: [62, 67, 71] },   // Sol trưởng
  { bass: 45, tones: [61, 64, 67] },   // La bảy — câu chuyển
];

const PROG_B = [
  { bass: 43, tones: [62, 67, 71] },   // Sol trưởng
  { bass: 45, tones: [61, 64, 69] },   // La trưởng
  { bass: 42, tones: [61, 66, 69] },   // Fa♯ thứ
  { bass: 47, tones: [62, 66, 71] },   // Si thứ
  { bass: 40, tones: [62, 64, 67] },   // Mi thứ bảy
  { bass: 45, tones: [61, 64, 69] },   // La trưởng
  { bass: 38, tones: [62, 66, 69] },   // Rê trưởng
  { bass: 45, tones: [61, 64, 67] },   // La bảy
];

/**
 * Kho câu nhạc. Mỗi câu là danh sách [bậc, số phách móc đơn];
 * bậc tính tương đối so với nốt gốc. Một ô nhịp valse = 6 móc đơn.
 */
const PHRASES = [
  [[0, 1], [2, 1], [4, 2], [2, 2]],
  [[4, 2], [5, 1], [4, 1], [2, 2]],
  [[0, 1], [1, 1], [2, 1], [4, 1], [5, 2]],
  [[7, 2], [5, 2], [4, 2]],
  [[4, 6]],
  [[2, 2], [4, 2], [7, 2]],              // rải quãng ba đi lên, nghe reo vui
  [[5, 1], [7, 3], [5, 2]],
  [[0, 6]],
  [],                                    // ô nhịp để trống, lấy hơi
  [[2, 1], [4, 1], [5, 1], [7, 1], [9, 2]],
  [[7, 2], [6, 1], [5, 1], [4, 2]],
  [[4, 1], [5, 1], [7, 2], [5, 2]],
  [[2, 3], [4, 3]],
  [[0, 2], [4, 2], [2, 2]],
  [[7, 1], [5, 1], [4, 1], [2, 1], [0, 2]],
  [[4, 1], [2, 1], [0, 1], [2, 1], [4, 2]],
];

/**
 * Bố cục bản nhạc. `pool` là các câu được phép dùng trong đoạn,
 * `oct` là số bậc dịch lên/xuống (7 bậc = một quãng tám),
 * `perc` là độ đậm của tiếng gõ thùng.
 */
const SECTIONS = [
  { name: 'Dạo',  bars: 2,  prog: PROG_A, pool: [8, 7, 12],            vel: 0.00, oct: 0, perc: 0.6 },
  { name: 'A',    bars: 8,  prog: PROG_A, pool: [0, 1, 5, 13, 15, 11], vel: 0.26, oct: 0, perc: 1 },
  { name: 'B',    bars: 8,  prog: PROG_B, pool: [2, 9, 6, 3, 10, 5],   vel: 0.30, oct: 0, perc: 1 },
  { name: 'Ngân', bars: 8,  prog: PROG_A, pool: [4, 12, 13, 8],        vel: 0.24, oct: 7, perc: 0.7 },
  { name: "A'",   bars: 8,  prog: PROG_A, pool: [0, 5, 15, 1, 11, 14], vel: 0.32, oct: 0, perc: 1 },
  { name: 'Kết',  bars: 8,  prog: PROG_A, pool: [7, 12, 14, 4],        vel: 0.20, oct: 0, perc: 0.6 },
];

/** Âm lượng nhạc nền khi đang bật (đo ở master ≈ −28 dBFS). */
const MUSIC_LEVEL = 0.80;
const SFX_LEVEL = 0.55;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp01 = (n) => Math.max(0, Math.min(1, n));

export class Audio {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.sfxOn = true;
    this.started = false;
    /** Đang ở màn hình chờ — nơi duy nhất được phép có nhạc nền. */
    this.menuMode = false;
    this.buffers = new Map();
    this.barCount = 0;
    this.sectionIdx = 0;
    this.barInSection = 0;
    this.nextBarTime = 0;
  }

  /** Tên đoạn nhạc đang chơi — tiện cho việc kiểm thử. */
  get section() { return SECTIONS[this.sectionIdx]?.name ?? '—'; }

  /** Khởi tạo — phải gọi từ trong một cử chỉ của người dùng. */
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;

    // Nén nhẹ cho đỡ vỡ tiếng khi nhiều nốt chồng nhau
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxOn ? SFX_LEVEL : 0;
    this.sfxGain.connect(this.master);

    // Vang phòng trà — vừa đủ rộng thôi, dội dài quá thì hoá ra âm u
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.6, 3.0);
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.24;
    this.reverb.connect(this.reverbGain).connect(this.master);

    this.buildBody();
  }

  /**
   * Thùng đàn — mọi tiếng ghi-ta đều đi qua đây. Gỗ không khuếch đại đều mọi
   * tần số: hộp đàn cộng hưởng mạnh ở vài chỗ (không khí trong thùng ~100 Hz,
   * mặt gỗ ~205 Hz, thân đàn ~430 Hz), chính mấy cái bướu đó làm dây nghe ra
   * "cây đàn" chứ không phải sợi dây căng trần.
   */
  buildBody() {
    const ctx = this.ctx;
    // Tiếng gảy nhiều đỉnh nhọn, nghe nhỏ hơn hẳn tiếng kéo vĩ ở cùng biên độ,
    // nên cây đàn phải để to hơn mức tưởng.
    this.guitarIn = ctx.createGain();
    this.guitarIn.gain.value = 1.15;

    const dry = ctx.createGain();
    dry.gain.value = 0.78;
    this.guitarIn.connect(dry).connect(this.musicGain);

    for (const [freq, q, amp] of [[100, 7, 0.55], [205, 9, 0.34], [430, 6, 0.20]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = amp;
      this.guitarIn.connect(bp).connect(g).connect(this.musicGain);
    }

    const send = ctx.createGain();
    send.gain.value = 0.45;
    this.guitarIn.connect(send).connect(this.reverb);
  }

  makeImpulse(seconds, decay) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // -------------------------------------------------------------- nhạc cụ

  /**
   * Sinh mẫu tiếng một dây ghi-ta bằng Karplus–Strong.
   *
   * Dây được "gảy" đúng kiểu thật: kéo lệch thành hình tam giác có đỉnh nằm ở
   * điểm gảy rồi buông — gảy sát ngựa đàn cho ra tam giác nhọn, nhiều bồi âm,
   * tiếng đanh; gảy về phía lỗ thoát âm cho tam giác tù, tiếng tròn và tối.
   * Vòng lặp đọc bằng nội suy tuyến tính nên cao độ vẫn đúng ở ngăn cao, và
   * mỗi vòng lại bị lọc bớt cao tần — dây nilon tắt bồi âm rất nhanh.
   *
   * Dây ngân bao lâu là chuyện của chính nó, không phải của trường độ nốt —
   * muốn nốt ngắn thì phải chặn dây lại (xem `gtr`). Nhờ vậy mỗi cao độ chỉ
   * cần dựng một mẫu duy nhất và giữ lại dùng mãi.
   *
   * @param {number} freq   cao độ (Hz)
   * @param {number} bright 0 = gảy bằng thịt ngón, 1 = gảy bằng móng sát ngựa
   */
  stringBuffer(freq, bright = 0.45) {
    const key = `${freq.toFixed(1)}:${bright}`;
    if (this.buffers.has(key)) return this.buffers.get(key);

    const sr = this.ctx.sampleRate;
    // Dây trầm ngân lâu hơn dây cao. Cắt mẫu ở chỗ đã tắt còn -45 dB, quá đó
    // tai không nghe ra nữa mà giữ lại thì tốn bộ nhớ.
    const t60 = Math.min(2.6, 0.9 + 260 / freq);
    const len = Math.floor(sr * t60 * 0.75);
    const buf = this.ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);

    const D = sr / freq;                     // độ dài dây tính theo mẫu

    // Bộ lọc trong vòng lặp — chỗ dây mất cao tần. Hệ số phải nhỏ dần theo cao
    // độ: nốt càng cao thì mỗi giây sóng chạy hết vòng dây càng nhiều lần, để
    // nguyên một hệ số thì nốt cao vừa bật ra đã tắt ngóm.
    const damp = Math.min(0.45, Math.max(0.03, (0.30 - bright * 0.14) * (220 / freq)));

    // Hao hụt tính theo mỗi VÒNG dây chứ không phải mỗi mẫu: sóng chạy hết một
    // vòng là đúng một chu kỳ, nên một giây có `freq` vòng.
    const loss = Math.pow(10, -3 / (t60 * freq));

    // Cực của bộ lọc trong vòng lặp. Tử số phải bù lại đúng bằng `1 - pole`,
    // không thì phần hồi tiếp của bộ lọc ăn thêm một phần năng lượng nữa và
    // nốt tắt nhanh hơn hẳn thời gian đã đặt.
    const pole = damp * loss;
    const drive = loss * (1 - pole);

    // Bộ lọc ấy cũng làm trễ tín hiệu. Trừ phần trễ đó khỏi độ dài dây thì cao
    // độ mới đúng — ở ngăn cao cả vòng dây chỉ dài vài chục mẫu, lệch nửa mẫu
    // là phô ngay.
    const w = (2 * Math.PI * freq) / sr;
    const lag = Math.atan2(pole * Math.sin(w), 1 - pole * Math.cos(w)) / w;
    const N = Math.max(2, Math.floor(D - lag));
    const frac = Math.min(1, Math.max(0, D - lag - N));
    // Dài hơn một ô để còn chỗ đọc lùi khi nội suy phần lẻ
    const M = N + 1;
    const ring = new Float32Array(M);

    const pluckPos = Math.max(0.06, 0.42 - bright * 0.30);
    for (let i = 0; i < M; i++) {
      const x = i / M;
      const tri = x < pluckPos ? x / pluckPos : (1 - x) / (1 - pluckPos);
      ring[i] = tri * 0.86 + (Math.random() * 2 - 1) * 0.14;
    }
    // Bỏ thành phần một chiều, không thì dây "phồng" lên rồi ù
    let dc = 0;
    for (const v of ring) dc += v;
    dc /= M;
    for (let i = 0; i < M; i++) ring[i] -= dc;

    let read = 0;
    let prev = 0;
    let peak = 1e-6;
    for (let i = 0; i < len; i++) {
      const newer = ring[(read + 1) % M];    // trễ N mẫu
      const older = ring[read];              // trễ N+1 mẫu
      const s = newer + (older - newer) * frac;
      prev = s * drive + prev * pole;
      ring[read] = prev;
      out[i] = s;
      if (Math.abs(s) > peak) peak = Math.abs(s);
      read = (read + 1) % M;
    }

    // Chuẩn hoá về cùng một mức rồi vuốt đuôi cho khỏi "cụp" lúc hết mẫu
    const norm = 0.9 / peak;
    const tail = Math.max(1, Math.floor(sr * 0.02));
    for (let i = 0; i < len; i++) {
      out[i] *= norm * (i > len - tail ? (len - i) / tail : 1);
    }

    this.buffers.set(key, buf);
    return buf;
  }

  /**
   * Gảy một nốt trên thùng đàn. `dur` là trường độ nốt: hết chừng ấy thì ngón
   * chặn dây lại, chứ bản thân dây vẫn còn ngân được lâu hơn.
   *
   * @param {object} [o] `bright` 0–1 · `vib` biên độ rung ngón (cent)
   *                     · `rel` thời gian buông ngón (giây)
   */
  gtr(freq, when, dur = 1.6, gain = 0.35, o = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    // Gom độ sáng về từng mốc để còn dùng lại mẫu đã dựng
    const bright = Math.round((o.bright ?? 0.45) * 4) / 4;

    const src = ctx.createBufferSource();
    src.buffer = this.stringBuffer(freq, bright);
    src.detune.value = (Math.random() - 0.5) * 7;   // chẳng cây đàn nào chuẩn tuyệt đối

    if (o.vib) {
      // Rung ngón vào muộn, sau khi tiếng đã ngân — y như tay trái nhấn rung
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 4.6 + Math.random() * 0.9;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, when);
      depth.gain.linearRampToValueAtTime(o.vib, when + Math.min(0.5, dur * 0.7));
      lfo.connect(depth).connect(src.detune);
      lfo.start(when); lfo.stop(when + dur + 0.4);
    }

    // Chặn dây khi hết trường độ — buông ngón chứ không cắt phụt
    const rel = o.rel ?? 0.3;
    const g = ctx.createGain();
    g.gain.value = gain;
    g.gain.setValueAtTime(gain, when + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + rel);
    src.connect(g).connect(this.guitarIn);
    src.start(when);

    if (bright > 0.3) this.nail(when, gain * bright);
  }

  /** Tiếng móng tay miết qua dây ngay trước khi nốt vang. */
  nail(when, gain) {
    const n = this.noiseSource(0.02);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain * 0.22, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.02);
    n.connect(bp).connect(g).connect(this.guitarIn);
    n.start(when);
  }

  /**
   * Quạt cả nắm dây. Quạt xuống thì dây trầm kêu trước, quạt lên thì ngược lại;
   * khoảng lệch giữa các dây chính là cái làm nên tiếng "rẹt".
   */
  strum(midis, when, gain = 0.18, o = {}) {
    const order = o.up ? [...midis].reverse() : midis;
    const spread = o.spread ?? 0.022;
    order.forEach((m, i) => {
      this.gtr(mtof(m), when + i * spread, o.dur ?? 1.4, gain * (1 - i * 0.12), {
        bright: o.bright ?? 0.6,
        rel: o.rel,
      });
    });
  }

  /** Gõ ngón vào mặt thùng (golpe) — giữ nhịp thay cho bộ gõ. */
  golpe(when, gain = 0.05) {
    if (!this.ctx) return;
    const n = this.noiseSource(0.06);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 230;
    bp.Q.value = 1.4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);
    n.connect(bp).connect(g).connect(this.guitarIn);
    n.start(when);
  }

  /** Tiếng ngón tay trượt trên dây quấn khi đổi thế bấm. */
  squeak(when, gain = 0.03) {
    if (!this.ctx) return;
    const n = this.noiseSource(0.13);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 6;
    bp.frequency.setValueAtTime(1500, when);
    bp.frequency.exponentialRampToValueAtTime(2700, when + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.13);
    n.connect(bp).connect(g).connect(this.guitarIn);
    n.start(when);
  }

  /** Nốt bồi (flageolet): chạm hờ ngón lên dây ở ngăn 12 — tiếng chuông trong vắt. */
  harmonic(freq, when, gain = 0.08, dur = 2.4) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    for (const [mult, amp] of [[1, 1], [2, 0.18], [3, 0.07]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(when); o.stop(when + (mult === 1 ? dur : dur * 0.4) + 0.05);
    }
    g.connect(this.guitarIn);
    this.nail(when, gain * 0.7);
  }

  noiseSource(dur) {
    const sr = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(sr * dur));
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  // ------------------------------------------------------------- nhạc nền

  /** Bật nhạc màn hình chờ. Gọi lại nhiều lần cũng không sao. */
  startMusic() {
    this.init();
    if (!this.ctx) return;
    this.menuMode = true;
    if (this.started) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.started = true;
    this.nextBarTime = this.ctx.currentTime + 0.25;
    this.sectionIdx = 0;
    this.barInSection = 0;
    this.barCount = 0;
    this.applyMusicGain(1.6);
    this.timer = setInterval(() => this.schedule(), 120);
  }

  /**
   * Tắt nhạc nền (vào ván đấu). Nhỏ dần rồi mới ngắt để không cụt tiếng —
   * các nốt đã lập lịch trước vẫn tắt êm theo đường bao này.
   */
  stopMusic(fade = 1.4) {
    this.menuMode = false;
    clearInterval(this.timer);
    this.timer = null;
    if (!this.started) return;
    this.started = false;
    if (this.musicGain) {
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, this.ctx.currentTime);
      this.musicGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + fade);
    }
  }

  /** Chỉnh âm lượng nhạc theo hai điều kiện: người chơi bật, và đang ở màn chờ. */
  applyMusicGain(seconds = 0.4) {
    if (!this.musicGain) return;
    const target = this.musicOn && this.started ? MUSIC_LEVEL : 0;
    this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, seconds / 3);
  }

  /** Thời lượng một phách móc đơn (giây). Nhịp trôi nhẹ cho đỡ máy móc. */
  eighth() {
    const bpm = 100 + Math.sin(this.barCount * 0.19) * 2;
    return 60 / bpm / 2;
  }

  /**
   * Lập lịch trước từng Ô NHỊP (valse 3 phách) — mỗi ô nhịp rút một câu nhạc
   * trong kho của đoạn hiện tại rồi biến tấu, nên bản nhạc trôi đi liên tục
   * chứ không quay lại vòng lặp ngắn.
   */
  schedule() {
    if (!this.ctx || !this.started) return;
    // Trình duyệt chưa cho phát (chưa có cử chỉ người dùng): đứng chờ,
    // đừng dồn một loạt ô nhịp để rồi đổ ập ra cùng lúc khi được phép.
    if (this.ctx.state !== 'running') {
      this.nextBarTime = this.ctx.currentTime + 0.25;
      return;
    }
    const lookahead = 1.2;

    while (this.nextBarTime < this.ctx.currentTime + lookahead) {
      this.scheduleBar(this.nextBarTime);
      this.nextBarTime += this.eighth() * 6;

      this.barCount += 1;
      this.barInSection += 1;
      if (this.barInSection >= SECTIONS[this.sectionIdx].bars) {
        this.barInSection = 0;
        this.sectionIdx = (this.sectionIdx + 1) % SECTIONS.length;
      }
    }
  }

  /** Bậc gần nhất nằm trong hợp âm — dùng để nắn các nốt ngân dài. */
  snapToChord(idx, chordPcs) {
    const lo = Math.max(0, Math.min(MEL.length - 1, idx));
    for (let d = 0; d < 4; d++) {
      for (const s of d === 0 ? [0] : [-d, d]) {
        const j = lo + s;
        if (j >= 0 && j < MEL.length && chordPcs.includes(MEL_MIDI[j] % 12)) return j;
      }
    }
    return lo;
  }

  scheduleBar(t0) {
    const sec = SECTIONS[this.sectionIdx];
    const E = this.eighth();
    const beat = E * 2;
    const bar = E * 6;
    const chord = sec.prog[this.barCount % sec.prog.length];
    const first = this.barInSection === 0;

    /* --- Ngón cái: nốt trầm rơi vào phách 1, ngân hết ô nhịp rồi nhả ra cho
           hợp âm sau vào chỗ sạch sẽ */
    this.gtr(mtof(chord.bass), t0, bar * 0.95, 0.34, { bright: 0.2 });

    /* --- Ba ngón kia rải hợp âm ở phách 2 và 3; thỉnh thoảng quạt lên một
           nhịp cho câu đệm khỏi đều đều như máy */
    const strumBar = !first && Math.random() < 0.16;
    for (const b of [1, 2]) {
      const when = t0 + beat * b + (Math.random() - 0.5) * 0.008;
      if (strumBar && b === 2) {
        this.strum(chord.tones, when, 0.10, { up: true, spread: 0.016, dur: beat * 1.4 });
      } else {
        chord.tones.forEach((m, i) => {
          this.gtr(mtof(m), when + i * 0.014, beat * 1.7, 0.10 - i * 0.018, { bright: 0.42 });
        });
      }
    }

    /* --- Gõ thùng giữ nhịp */
    if (sec.perc > 0) {
      this.golpe(t0 + beat, 0.055 * sec.perc);
      this.golpe(t0 + beat * 2, 0.038 * sec.perc);
    }

    /* --- Đổi thế bấm thì có tiếng ngón trượt trên dây */
    if (Math.random() < 0.12) this.squeak(t0 - 0.06, 0.026);

    /* --- Nốt bồi điểm xuyết đầu mỗi đoạn và rải rác giữa chừng */
    if (first || Math.random() < 0.14) {
      const m = pick(chord.tones) + 12;
      this.harmonic(mtof(m), t0 + beat * (first ? 0 : 2), first ? 0.075 : 0.045, 1.8);
    }

    /* --- Giai điệu chạy trên dây cao, biến tấu mỗi lần dùng */
    if (sec.vel <= 0) return;
    const phrase = PHRASES[pick(sec.pool)];
    if (!phrase || phrase.length === 0) return;

    const shift = pick([0, 0, 0, 1, -1, 2]);
    const chordPcs = chord.tones.map((m) => m % 12);
    const swing = E * 0.05;

    let cursor = 0;
    for (const [degree, len] of phrase) {
      let idx = ROOT + degree + shift + sec.oct;
      // Nốt ngân dài phải nằm trong hợp âm, nếu không câu nhạc sẽ chỏi
      if (len >= 3) idx = this.snapToChord(idx, chordPcs);
      idx = Math.max(0, Math.min(MEL.length - 1, idx));

      const when = t0 + cursor * E + (cursor % 2 === 1 ? swing : 0);
      const vel = sec.vel * (cursor === 0 ? 1.12 : 0.86) * (0.9 + Math.random() * 0.2);
      // Cho dây ngân quá trường độ một chút — chồng tiếng như vậy mới ra ngón
      // móc, nhưng đừng dài quá kẻo mấy nốt chạy nhanh nhoè vào nhau
      const dur = Math.min(2.6, Math.max(0.55, len * E * 1.5));

      // Luyến: bật ngón lên từ nốt dưới (hammer-on)
      if (len >= 2 && idx > 0 && Math.random() < 0.14) {
        this.gtr(MEL[idx - 1], when - E * 0.22, 0.6, vel * 0.55, { bright: 0.5 });
      }
      this.gtr(MEL[idx], when, dur, vel, {
        bright: 0.72,
        vib: len >= 3 ? 8 + Math.random() * 5 : 0,
      });

      // Thỉnh thoảng chồng một bè quãng tám dưới cho câu nhạc dày lên
      if (len >= 3 && Math.random() < 0.28 && idx >= 7) {
        this.gtr(MEL[idx - 7], when + 0.02, dur * 0.9, vel * 0.45, { bright: 0.3 });
      }
      cursor += len;
    }
  }

  // ------------------------------------------------------------ hiệu ứng

  /**
   * @param {'dice'|'shake'|'diceHit'|'step'|'coin'|'buy'|'build'|'card'|'jail'
   *        |'bankrupt'|'firework'|'trade'|'turn'|'click'} name
   * @param {object} [opts] tham số riêng của từng hiệu ứng (gain, i, …)
   */
  sfx(name, opts = {}) {
    this.init();
    if (!this.ctx || !this.sfxOn) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    (this.SFX[name] ?? this.SFX.click).call(this, t, opts);
  }

  get SFX() {
    return {
      /** Lắc xí ngầu trong ống: chuỗi tiếng gõ vang trong lòng ống tre. */
      shake(t, o = {}) {
        const n = o.count ?? 9;
        const span = o.span ?? 0.42;
        for (let i = 0; i < n; i++) {
          const when = t + (i / n) * span + Math.random() * 0.02;
          const strength = 0.55 + Math.sin((i / n) * Math.PI) * 0.45;
          this.clack(when, 780 + Math.random() * 900, 0.085 * strength, 6);
        }
      },

      /** Một con xí ngầu chạm mặt bàn. */
      diceHit(t, o = {}) {
        const g = clamp01(o.gain ?? 0.6);
        this.clack(t, 1300 + Math.random() * 1400, 0.02 + 0.16 * g, 3);
        if (g > 0.5) this.woodBlock(t, 320, 0.05 * g, this.sfxGain);
      },

      /** Xí ngầu lăn (dùng cho các chỗ gọi gọn một tiếng). */
      dice(t) {
        this.SFX.shake.call(this, t, { count: 8, span: 0.36 });
        for (let i = 0; i < 3; i++) {
          this.SFX.diceHit.call(this, t + 0.42 + i * 0.11, { gain: 0.8 - i * 0.25 });
        }
      },

      /** Quân cờ nhảy sang ô kế: một tiếng gõ gỗ nhẹ, cao thấp xen kẽ. */
      step(t, o = {}) {
        const p = [1, 1.06, 0.94][(o.i ?? 0) % 3];
        this.woodBlock(t, 760 * p, 0.075, this.sfxGain);
        const n = this.noiseSource(0.035);
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2400 * p;
        bp.Q.value = 2;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.05, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
        n.connect(bp).connect(g).connect(this.sfxGain);
        n.start(t);
      },

      /** Tiền xu: chuông nhỏ leng keng. */
      coin(t) {
        for (const [i, f] of [1568, 2093, 2637].entries()) {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.type = 'sine';
          o.frequency.value = f * (0.99 + Math.random() * 0.02);
          const w = t + i * 0.028;
          g.gain.setValueAtTime(0, w);
          g.gain.linearRampToValueAtTime(0.10 / (i + 1), w + 0.006);
          g.gain.exponentialRampToValueAtTime(0.001, w + 0.5);
          o.connect(g).connect(this.sfxGain);
          g.connect(this.reverb);
          o.start(w); o.stop(w + 0.55);
        }
      },

      /** Mua đất: tiếng mõ gỗ chắc nịch. */
      buy(t) { this.woodBlock(t, 520, 0.22, this.sfxGain); },
      /** Xây nhà: hai tiếng gõ. */
      build(t) {
        this.woodBlock(t, 700, 0.18, this.sfxGain);
        this.woodBlock(t + 0.12, 900, 0.15, this.sfxGain);
      },
      /** Chốt giao dịch: hợp âm rải đi lên. */
      trade(t) {
        [261.63, 349.23, 392.00, 523.25].forEach((f, i) =>
          this.pluckSfx(f, t + i * 0.075, 0.26));
      },
      /**
       * Tới lượt mình — một tiếng chuông nhỏ.
       *
       * Bản online người ta hay ngó sang cửa sổ khác trong lúc chờ, nên phải có
       * tiếng gọi về. Ngân dài và trong, khác hẳn tiếng mõ gỗ khô của các hiệu
       * ứng còn lại, để nghe một cái là biết ngay đang gọi mình.
       */
      turn(t) {
        for (const [i, f] of [784, 1174.7, 1568].entries()) {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.type = 'sine';
          o.frequency.value = f;
          const w = t + i * 0.045;
          const peak = 0.13 / (i * 0.9 + 1);
          g.gain.setValueAtTime(0.0001, w);
          g.gain.linearRampToValueAtTime(peak, w + 0.012);
          g.gain.exponentialRampToValueAtTime(0.001, w + 1.5 - i * 0.35);
          o.connect(g).connect(this.sfxGain);
          g.connect(this.reverb);
          o.start(w); o.stop(w + 1.6);
        }
      },

      /** Rút thẻ: tiếng giấy lướt. */
      card(t) {
        const n = this.noiseSource(0.34);
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(900, t);
        bp.frequency.exponentialRampToValueAtTime(3400, t + 0.26);
        bp.Q.value = 1.1;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.11, t + 0.07);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
        n.connect(bp).connect(g).connect(this.sfxGain);
        n.start(t);
      },
      /** Vào tù: tiếng chuông chùa trầm. */
      jail(t) {
        for (const [i, f] of [110, 164.8, 220, 293.7].entries()) {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.type = i === 0 ? 'sine' : 'triangle';
          o.frequency.value = f;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.20 / (i + 1.4), t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t + 2.6);
          o.connect(g).connect(this.sfxGain);
          g.connect(this.reverb);
          o.start(t); o.stop(t + 2.7);
        }
      },
      /** Phá sản: quãng trượt đi xuống ảm đạm. */
      bankrupt(t) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(300, t);
        o.frequency.exponentialRampToValueAtTime(48, t + 1.5);
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1800, t);
        lp.frequency.exponentialRampToValueAtTime(180, t + 1.5);
        g.gain.setValueAtTime(0.20, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
        o.connect(lp).connect(g).connect(this.sfxGain);
        g.connect(this.reverb);
        o.start(t); o.stop(t + 1.7);
      },
      /** Pháo hoa: tiếng nổ trầm rồi tia lửa lách tách. */
      firework(t) {
        const n = this.noiseSource(0.6);
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(900, t);
        lp.frequency.exponentialRampToValueAtTime(120, t + 0.5);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.30, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        n.connect(lp).connect(g).connect(this.sfxGain);
        g.connect(this.reverb);
        n.start(t);
        for (let i = 0; i < 14; i++) {
          const w = t + 0.1 + Math.random() * 0.55;
          const s = this.noiseSource(0.04);
          const hp = this.ctx.createBiquadFilter();
          hp.type = 'highpass'; hp.frequency.value = 4200;
          const sg = this.ctx.createGain();
          sg.gain.setValueAtTime(0.07, w);
          sg.gain.exponentialRampToValueAtTime(0.001, w + 0.04);
          s.connect(hp).connect(sg).connect(this.sfxGain);
          s.start(w);
        }
      },
      click(t) { this.woodBlock(t, 1200, 0.08, this.sfxGain); },
    };
  }

  /** Tiếng gõ khô của quân xí ngầu bằng xương. */
  clack(when, freq, gain, q = 4) {
    const n = this.noiseSource(0.05);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
    n.connect(bp).connect(g).connect(this.sfxGain);
    g.connect(this.reverb);
    n.start(when);
  }

  woodBlock(t, freq, gain, dest = this.sfxGain) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.06);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + 0.15);
  }

  pluckSfx(freq, when, gain) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.stringBuffer(freq, 0.5);
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.sfxGain);
    g.connect(this.reverb);
    src.start(when);
  }

  // ------------------------------------------------------------- điều khiển

  /** Bật/tắt riêng nhạc nền. Bật lại ở màn hình chờ thì nhạc chạy tiếp. */
  toggleMusic() {
    this.init();
    this.musicOn = !this.musicOn;
    if (this.musicOn && this.menuMode && !this.started) this.startMusic();
    else this.applyMusicGain(this.musicOn ? 0.8 : 0.5);
    return this.musicOn;
  }

  /** Bật/tắt riêng hiệu ứng âm thanh. */
  toggleSfx() {
    this.init();
    this.sfxOn = !this.sfxOn;
    if (this.sfxGain) {
      this.sfxGain.gain.setTargetAtTime(this.sfxOn ? SFX_LEVEL : 0, this.ctx.currentTime, 0.05);
    }
    return this.sfxOn;
  }
}

export const audio = new Audio();
