/**
 * Hiệu ứng âm thanh của chủ đề Giáng Sinh.
 *
 * `audio.sfx(name)` tra bảng này trước khi xem bảng gốc, nên chỉ cần khai
 * những tiếng muốn đổi. Tiếng không có ở đây (pháo hoa, đất rung, lửa cháy,
 * búa gõ, cọc thế chấp…) giữ nguyên bản gốc — chúng tả đúng việc đang xảy ra
 * trên ô đất, đổi sang tiếng chuông thì mất nghĩa.
 *
 * Mỗi hàm nhận `(a, t, o)`: `a` là bộ âm thanh (`audio.js`), `t` là thời điểm
 * phát theo đồng hồ AudioContext, `o` là tham số riêng như bản gốc.
 */
import {
  celesta, demoHandbell, demoGlock, iceDrop, churchBell, snowStep, mtof,
} from './xmasSynth.js';

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/** Rải một hợp âm trên celesta, mỗi nốt cách nhau `gap` giây. */
function arp(a, t, midis, gap, gain, dur = 1.2) {
  midis.forEach((m, i) => celesta(a, mtof(m), t + i * gap, gain * (1 - i * 0.08), a.sfxGain, dur));
}

/*
 * Cao độ: mọi tiếng lặp nhiều trong một lượt (bước chân, băng chuyền, tiền
 * xu, bấm nút) đặt quanh quãng tám 4–5 (260–1050 Hz). Bản trước đặt ở quãng
 * 6–7 (1–2,6 kHz, bồi âm tới hơn 10 kHz), nghe vài lượt là rát tai.
 */
export const XMAS_SFX = {
  /**
   * Lắc xí ngầu: im lặng, chỉ còn tiếng khối băng rơi chạm bàn (`diceHit`).
   * Jason thấy tiếng băng va nhau trong ống nghe cao, chỉ muốn giữ tiếng trầm.
   *
   * Động đất cũng gọi `shake` nhưng không kèm `count`: khi ấy giữ tiếng gõ
   * gốc cho cảnh nhà rung.
   */
  shake(a, t, o = {}) {
    if (o.count == null) a.SFX.shake.call(a, t, o);
  },

  /** Khối băng rơi xuống bàn: mạnh nhẹ theo cú chạm. */
  diceHit(a, t, o = {}) {
    const g = clamp01(o.gain ?? 0.6);
    iceDrop(a, t, 0.1 + 0.32 * g, a.sfxGain);
  },

  dice(a, t) {
    XMAS_SFX.shake(a, t, { count: 8, span: 0.36 });
    for (let i = 0; i < 3; i++) XMAS_SFX.diceHit(a, t + 0.42 + i * 0.11, { gain: 0.8 - i * 0.25 });
  },

  /** Quân bước sang ô kế: tiếng chân trên tuyết, nhỏ vì mỗi bước đều kêu. */
  step(a, t) { snowStep(a, t, 0.3, a.sfxGain); },

  /** Tiền xu: ba nốt celesta đi lên (Đô trưởng, quãng tám 5). */
  coin(a, t) { arp(a, t, [72, 76, 79], 0.04, 0.14, 0.7); },

  /**
   * Qua ô Bắt Đầu: chuỗi năm nốt glockenspiel Sol 5, La 5, Si 5, Rê 6, Sol 6
   * cách nhau 0,09 s, lấy từ nút "Qua Bắt Đầu" trong `demo/christmas.html`.
   * Bản demo còn lớp chuông xe tuần lộc phát cùng lúc; Jason chỉ giữ chuỗi nốt.
   */
  go(a, t) {
    [783.99, 880, 987.77, 1174.66, 1567.98].forEach((f, i) => demoGlock(a, t + i * 0.09, a.sfxGain, f));
  },

  /**
   * Mua đất: chuông cửa "ding-dong", chuông tay của demo hai nhát Mi 5 rồi
   * Đô 5. Bản ba nhát Mi 6, Rê 6, Mi 6 của demo bị chê cao (Jason chọn bản
   * này trong ba phương án).
   */
  buy(a, t) {
    demoHandbell(a, t, 0.45, a.sfxGain, 659.25);
    demoHandbell(a, t + 0.32, 0.4, a.sfxGain, 523.25);
  },

  /** Xây nhà: hộp nhạc bốn nốt. */
  build(a, t) { arp(a, t, [67, 71, 74, 79], 0.11, 0.14); },

  /** Tới lượt mình: chuông tay hai nhát nhẹ, thấp hơn chuông mua đất một quãng tám. */
  turn(a, t) {
    demoHandbell(a, t, 0.32, a.sfxGain, 659);
    demoHandbell(a, t + 0.18, 0.26, a.sfxGain, 784);
  },

  /** Lật thẻ / mở hộp quà: celesta lướt lên. */
  card(a, t) { arp(a, t, [76, 79, 83, 86], 0.05, 0.1, 0.7); },

  /**
   * Một hộp quà lướt qua vạch trong băng chuyền. Kêu dày tới vài chục lần mỗi
   * giây nên phải rất ngắn và nhỏ; dải chậm lại thì tiếng trầm và to dần.
   */
  cardTick(a, t, o = {}) {
    const k = clamp01(o.slow ?? 0);
    celesta(a, mtof(84 - Math.round(k * 7)), t, 0.03 + 0.05 * k, a.sfxGain, 0.25);
  },

  /** Vào tù: chuông nhà thờ đổ hai hồi. */
  jail(a, t) {
    churchBell(a, t, 0.5, a.sfxGain);
    churchBell(a, t + 1.3, 0.38, a.sfxGain);
  },

  /** Chuộc đất: ba nốt đi lên. */
  redeem(a, t) { arp(a, t, [67, 72, 76], 0.09, 0.14); },

  /** Chốt giao dịch: hợp âm rải. */
  trade(a, t) { arp(a, t, [60, 65, 67, 72], 0.075, 0.14); },

  /** Bấm nút: một tiếng celesta rất ngắn. */
  click(a, t) { celesta(a, mtof(84), t, 0.06, a.sfxGain, 0.2); },

  /**
   * Bão tuyết: gió hú. Nhiễu trắng qua hai bộ lọc dải — một dải rộng cho tiếng
   * gió ào, một dải hẹp cho tiếng rít — quét tần số lên rồi xuống trong 2 giây.
   */
  wind(a, t) {
    const ctx = a.ctx;
    const L = 2.2;
    for (const [f0, f1, q, peak] of [[280, 900, 0.9, 0.5], [650, 1500, 8, 0.16]]) {
      const n = a.noiseSource(L + 0.3);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q;
      bp.frequency.setValueAtTime(f0, t);
      bp.frequency.linearRampToValueAtTime(f1, t + L * 0.45);
      bp.frequency.linearRampToValueAtTime(f0 * 0.8, t + L);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.5);
      g.gain.setValueAtTime(peak, t + L * 0.6);
      g.gain.linearRampToValueAtTime(0.0001, t + L + 0.25);
      n.connect(bp).connect(g).connect(a.sfxGain);
      n.start(t);
    }
  },

  /** Mái nhà sập dưới tuyết: gỗ kêu răng rắc rồi một tiếng uỵch trầm. */
  snowfall(a, t) {
    const ctx = a.ctx;
    for (let i = 0; i < 5; i++) a.clack(t + i * 0.05 + Math.random() * 0.02, 600 + Math.random() * 500, 0.09, 5);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(110, t + 0.24);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.6);
    g.gain.setValueAtTime(0.0001, t + 0.24);
    g.gain.linearRampToValueAtTime(0.45, t + 0.26);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    o.connect(g).connect(a.sfxGain);
    o.start(t + 0.24); o.stop(t + 0.85);
    const n = a.noiseSource(0.9);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t + 0.24);
    ng.gain.linearRampToValueAtTime(0.3, t + 0.28);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    n.connect(lp).connect(ng).connect(a.sfxGain);
    n.start(t + 0.24);
  },
};
