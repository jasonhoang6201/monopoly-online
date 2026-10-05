/**
 * Hiệu ứng âm thanh của chủ đề Halloween.
 *
 * `audio.sfx(name)` tra bảng này trước bảng gốc, nên chỉ khai những tiếng
 * muốn đổi. Tiếng không có ở đây (pháo hoa, đất rung, lửa, búa gõ…) giữ bản
 * gốc vì chúng tả đúng việc đang xảy ra trên ô đất.
 *
 * Năm tiếng Jason nghe ở trang concept và chốt, mỗi tiếng một việc:
 *   xương lạch cạch → lắc xí ngầu · chuông nhà nguyện → qua ô Bắt Đầu ·
 *   theremin → mua đất · mộc cầm → tiền, nút, thẻ · organ → phá sản.
 *
 * Cao độ: tiếng lặp nhiều trong một lượt (bước chân, băng chuyền, tiền, bấm
 * nút) đặt trong quãng 260–1050 Hz, như đã chốt sau lần Giáng Sinh bị chê
 * rát tai. Chuông và organ trầm hơn nhưng mỗi ván chỉ kêu vài lần.
 */
import {
  xylo, boneClack, chapelBell, theremin, organ, groan, mtof,
} from './halloweenSynth.js';

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/** Rải mấy nốt mộc cầm, mỗi nốt cách nhau `gap` giây. */
function run(a, t, midis, gap, gain, dur = 0.38) {
  midis.forEach((m, i) => xylo(a, mtof(m), t + i * gap, gain * (1 - i * 0.06), a.sfxGain, dur));
}

export const HALLOWEEN_SFX = {
  /**
   * Lắc xí ngầu: xương gõ lạch cạch trong lòng bàn tay. Động đất cũng gọi
   * `shake` nhưng không kèm `count`: khi ấy giữ tiếng gõ gốc cho cảnh nhà rung.
   */
  shake(a, t, o = {}) {
    if (o.count == null) { a.SFX.shake.call(a, t, o); return; }
    const n = Math.min(7, o.count);
    const span = o.span ?? 0.42;
    for (let i = 0; i < n; i++) {
      boneClack(a, t + (i / n) * span + Math.random() * 0.025, 0.26, a.sfxGain);
    }
  },

  /** Quả bí ngô vuông rơi xuống bàn: cú gõ gỗ trầm, mạnh nhẹ theo cú chạm. */
  diceHit(a, t, o = {}) {
    const g = clamp01(o.gain ?? 0.6);
    boneClack(a, t, 0.08 + 0.26 * g, a.sfxGain);
  },

  dice(a, t) {
    HALLOWEEN_SFX.shake(a, t, { count: 7, span: 0.4 });
    for (let i = 0; i < 3; i++) HALLOWEEN_SFX.diceHit(a, t + 0.46 + i * 0.11, { gain: 0.8 - i * 0.25 });
  },

  /** Bộ xương bước sang ô kế: một tiếng xương khẽ, nhỏ vì bước nào cũng kêu. */
  step(a, t) { boneClack(a, t, 0.1, a.sfxGain); },

  /** Tiền xu: ba nốt mộc cầm Rê thứ đi lên (Rê 4, Fa 4, La 4). */
  coin(a, t) { run(a, t, [62, 65, 69], 0.05, 0.22, 0.3); },

  /** Qua ô Bắt Đầu: ba tiếng chuông nhà nguyện, gốc 196 Hz. */
  go(a, t) {
    for (let i = 0; i < 3; i++) chapelBell(a, t + i * 0.55, 0.3 - i * 0.05, a.sfxGain);
  },

  /** Mua đất: theremin trượt lên rồi xuống. */
  buy(a, t) { theremin(a, t, 0.3, a.sfxGain, 330, 520, 280, 1.5); },

  /** Xây nhà: bốn nốt mộc cầm đi lên. */
  build(a, t) { run(a, t, [62, 65, 69, 74], 0.1, 0.22); },

  /** Tới lượt mình: hai nốt La 4, Rê 5. */
  turn(a, t) { run(a, t, [69, 74], 0.16, 0.24, 0.45); },

  /** Lật thẻ: mộc cầm lướt lên. */
  card(a, t) { run(a, t, [62, 65, 69, 72], 0.05, 0.18, 0.3); },

  /**
   * Một ô lướt qua vạch trong băng chuyền: kêu dày nên rất ngắn và nhỏ; dải
   * chậm lại thì tiếng trầm và to dần.
   */
  cardTick(a, t, o = {}) {
    const k = clamp01(o.slow ?? 0);
    xylo(a, mtof(74 - Math.round(k * 7)), t, 0.05 + 0.08 * k, a.sfxGain, 0.14);
  },

  /** Vào tù: một hồi chuông trầm 147 Hz. */
  jail(a, t) { chapelBell(a, t, 0.36, a.sfxGain, 146.83); },

  /** Chuộc đất: ba nốt đi lên. */
  redeem(a, t) { run(a, t, [62, 67, 71], 0.09, 0.2); },

  /** Chốt giao dịch: hợp âm rải Rê thứ. */
  trade(a, t) { run(a, t, [62, 65, 69, 74], 0.07, 0.18); },

  /** Bấm nút: một nốt mộc cầm rất ngắn. */
  click(a, t) { xylo(a, mtof(74), t, 0.08, a.sfxGain, 0.12); },

  /** Phá sản: hợp âm Rê thứ trên organ nhà thờ, tắt dần. */
  bankrupt(a, t) { organ(a, [146.83, 174.61, 220, 293.66], t, 2.6, 0.5, a.sfxGain); },

  /** Xác Sống Tràn Phố: tiếng rên trầm kéo dài. */
  zombie(a, t) {
    groan(a, t, 0.32, a.sfxGain);
    groan(a, t + 0.5, 0.22, a.sfxGain);
  },

  /** Phù Thuỷ Cưỡi Chổi: theremin vụt lên cao rồi rơi, như tiếng chổi xé gió. */
  witch(a, t) { theremin(a, t, 0.26, a.sfxGain, 300, 880, 360, 1.7); },

  /** Bia mộ trồi lên: đất uỵch trầm rồi vài tiếng xương. */
  grave(a, t) {
    a.SFX.thud.call(a, t, {});
    for (let i = 0; i < 3; i++) boneClack(a, t + 0.15 + i * 0.09, 0.14, a.sfxGain);
  },
};
