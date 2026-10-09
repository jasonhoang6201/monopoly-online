/**
 * Nhạc chờ của chủ đề Tết — hai bài **sáng tác mới** cho game, viết trên
 * thang năm cung (C D E G A) cho ra hơi nhạc dân gian ngày Tết. Không chép
 * bài Tết nào: những bài quen tai đều còn bản quyền.
 *
 *   · Xuân Về Phố Thị — nhanh, rộn ràng: phòng chờ.
 *   · Mai Vàng Đào Thắm — chậm hơn, ngân dài: màn hạ màn.
 *
 * Khai theo đúng lối của nhạc Giáng Sinh (`xmasSongs.js`): `chord` là hợp âm
 * đệm, `mel` là giai điệu "nốt:phách" ("-" là lặng), tổng phách mỗi ô bằng
 * `meter` — `checkTetSongs()` soát điều này.
 *
 * Giai điệu chơi bằng đàn tranh, đệm bằng ghi-ta trầm của `audio.js`; trống
 * cái giữ phách mạnh, phách tre gõ phách lẻ, đầu mỗi câu một tiếng chiêng.
 */
import { tranh, drum, clapper, gong, mtof } from './tetSynth.js';

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const midiOf = (n) => {
  const m = /^([A-G]#?)(\d)$/.exec(n);
  return m ? NOTE[m[1]] + (Number(m[2]) + 1) * 12 : null;
};

/** Hợp âm đệm — chỉ dùng nốt trong thang năm cung, khỏi lạc hơi. */
const CHORDS = {
  C:  { bass: [48, 43], tones: [55, 60, 64] },
  Am: { bass: [45, 52], tones: [57, 60, 64] },
  G:  { bass: [43, 50], tones: [55, 62, 67] },
  D:  { bass: [50, 45], tones: [57, 62, 64] },
  E:  { bass: [40, 47], tones: [52, 59, 64] },
};

const bar = (chord, mel) => ({ chord, mel });

const XUAN = {
  key: 'xuan',
  name: 'Xuân Về Phố Thị',
  meter: 4,
  beat: 0.3,          // 200 phách/phút — rộn như chợ hoa ngày cuối năm
  style: 'lively',
  bars: [
    bar('C', 'C5:1 D5:.5 E5:.5 G5:1 E5:1'), bar('Am', 'D5:.5 C5:.5 A4:1 G4:2'),
    bar('Am', 'A4:1 C5:.5 D5:.5 E5:1 D5:1'), bar('C', 'C5:1 A4:1 C5:2'),
    bar('C', 'E5:1 G5:.5 A5:.5 G5:1 E5:1'), bar('D', 'D5:.5 E5:.5 D5:.5 C5:.5 A4:2'),
    bar('G', 'G4:1 A4:.5 C5:.5 D5:1 E5:.5 D5:.5'), bar('C', 'C5:3 -:1'),
    bar('G', 'G5:1 A5:1 G5:.5 E5:.5 D5:1'), bar('C', 'E5:.5 G5:.5 E5:.5 D5:.5 C5:2'),
    bar('Am', 'A4:.5 C5:.5 D5:1 E5:.5 G5:.5 E5:1'), bar('D', 'D5:4'),
    bar('C', 'C5:1 D5:.5 E5:.5 G5:1 A5:1'), bar('E', 'G5:.5 E5:.5 D5:.5 E5:.5 G5:2'),
    bar('Am', 'A5:1 G5:.5 E5:.5 D5:.5 C5:.5 D5:1'), bar('C', 'C5:4'),
  ],
};

const MAI_DAO = {
  key: 'maidao',
  name: 'Mai Vàng Đào Thắm',
  meter: 4,
  beat: 0.46,
  style: 'gentle',
  bars: [
    bar('C', 'G4:1 C5:1 D5:1 E5:1'), bar('Am', 'G5:2 E5:1 D5:1'),
    bar('G', 'D5:1.5 E5:.5 D5:1 C5:1'), bar('Am', 'A4:3 -:1'),
    bar('C', 'C5:1 E5:1 G5:1 A5:1'), bar('G', 'G5:1.5 A5:.5 G5:1 E5:1'),
    bar('D', 'D5:1 E5:1 D5:1 A4:1'), bar('C', 'C5:3 -:1'),
  ],
};

export const TET_SONGS = { xuan: XUAN, maidao: MAI_DAO };
export const TET_PLAYLISTS = { menu: ['xuan'], win: ['maidao'] };

function parseBar(mel) {
  let at = 0;
  return mel.trim().split(/\s+/).map((tok) => {
    const [n, b] = tok.split(':');
    const len = Number(b);
    const out = [n === '-' ? null : midiOf(n), at, len];
    at += len;
    return out;
  });
}

const PARSED = new Map(Object.values(TET_SONGS).map((s) => [s.key, s.bars.map((b) => parseBar(b.mel))]));

/** Ô nhịp nào lệch phách, nốt lạ hay hợp âm lạ — rỗng là ổn. */
export function checkTetSongs() {
  const errs = [];
  for (const s of Object.values(TET_SONGS)) {
    PARSED.get(s.key).forEach((notes, i) => {
      const sum = notes.reduce((x, n) => x + n[2], 0);
      if (Math.abs(sum - s.meter) > 1e-6) errs.push(`${s.key} ô ${i + 1}: ${sum}/${s.meter} phách`);
      if (notes.some((n) => n[0] === undefined)) errs.push(`${s.key} ô ${i + 1}: nốt lạ`);
      if (!CHORDS[s.bars[i].chord]) errs.push(`${s.key} ô ${i + 1}: hợp âm lạ ${s.bars[i].chord}`);
    });
  }
  return errs;
}

export const tetBarSeconds = (song) => song.meter * song.beat;

/**
 * Lập lịch một ô nhịp.
 * @param {import('./audio.js').Audio} a
 */
export function scheduleTetBar(a, song, i, t0) {
  const b = song.beat;
  const out = a.musicBus;
  const chord = CHORDS[song.bars[i].chord];
  const lively = song.style === 'lively';

  /* Giai điệu: đàn tranh. Nốt dài (từ hai phách) và nốt mở câu được láy —
     láy hết thì nghe như đàn bị chùng dây. */
  PARSED.get(song.key)[i].forEach(([m, at, len], k) => {
    if (m == null) return;
    const bend = len >= 2 || (k === 0 && i % 4 === 0);
    tranh(a, mtof(m), t0 + at * b, Math.max(0.25, len * b * 1.1), lively ? 0.2 : 0.17, { bend });
  });

  // Đệm: bè trầm phách 1 và 3, hợp âm rải phách 2 và 4
  a.gtr(mtof(chord.bass[0]), t0, b * 1.8, 0.24, { bright: 0.2 });
  a.gtr(mtof(chord.bass[1]), t0 + 2 * b, b * 1.8, 0.2, { bright: 0.2 });
  for (const k of [1, 3]) {
    chord.tones.forEach((m, j) => a.gtr(mtof(m), t0 + k * b + j * 0.02, b * 0.8, 0.06, { bright: 0.5, rel: 0.1 }));
  }

  // Bộ gõ: chiêng mở mỗi câu bốn ô, trống phách mạnh, phách tre phách lẻ
  if (i % 4 === 0) gong(a, t0, lively ? 0.07 : 0.09, out);
  drum(a, t0, lively ? 0.22 : 0.16, out);
  if (lively) drum(a, t0 + 2 * b, 0.14, out);
  for (let k = 0; k < (lively ? 8 : 4); k++) {
    const step = lively ? b / 2 : b;
    if (k % 2 === 1 || !lively) clapper(a, t0 + k * step, lively ? 0.06 : 0.04, out);
  }
}
