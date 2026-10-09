/**
 * Hiệu ứng âm thanh của chủ đề Tết.
 *
 * `audio.sfx(name)` tra bảng này trước bảng gốc, nên chỉ khai những tiếng
 * muốn đổi. Mỗi tiếng một việc, đọc lên là biết chuyện gì:
 *   pháo nổ → qua ô Bắt Đầu · chiêng → mua đất, tới lượt · xèng → tiền ·
 *   trống → vào tù.
 *
 * Pháo chỉ nổ ở ô Bắt Đầu (mỗi người vài lần một ván) — nổ ở tiếng lặp nhiều
 * như bước chân thì vài lượt là nhức đầu.
 */
import { gong, drum, firecrackers, chime } from './tetSynth.js';

export const TET_SFX = {
  /** Qua ô Bắt Đầu: một tràng pháo, kết bằng tiếng chiêng mừng. */
  go(a, t) {
    firecrackers(a, t, 0.32, a.sfxGain, 16);
    gong(a, t + 0.95, 0.16, a.sfxGain, 220);
  },

  /** Tiền xu: xèng xu va nhau, nhẹ vì kêu nhiều. */
  coin(a, t) { chime(a, t, 0.09, a.sfxGain); },

  /** Mua đất: một tiếng chiêng tròn — giấy đỏ trao tay. */
  buy(a, t) { gong(a, t, 0.22, a.sfxGain, 196); },

  /** Tới lượt mình: hai tiếng trống chầu. */
  turn(a, t) {
    drum(a, t, 0.3, a.sfxGain);
    drum(a, t + 0.16, 0.22, a.sfxGain);
  },

  /** Vào tù: ba hồi trống dồn rồi lặng. */
  jail(a, t) {
    for (let i = 0; i < 3; i++) drum(a, t + i * 0.22, 0.38 - i * 0.06, a.sfxGain);
  },

  /** Pháo hoa: pháo nổ thay cho tiếng bung gốc. */
  firework(a, t) { firecrackers(a, t, 0.22, a.sfxGain, 6); },
};
