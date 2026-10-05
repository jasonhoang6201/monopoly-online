/**
 * Nhạc chủ đề Halloween: điệu valse Sol thứ trong Danse Macabre, Op. 40 —
 * Camille Saint-Saëns, 1874, đã thuộc phạm vi công cộng — chơi trên mộc cầm.
 * Giai điệu chép theo trí nhớ và rút gọn để lặp được, không phải bản phổ đầy đủ.
 *
 * Chỉ còn một bài, dùng cho cả phòng chờ lẫn màn hạ màn. Bản phòng chờ cũ
 * (12 tiếng Rê nửa đêm, vĩ cầm lên dây, câu đi xuống nửa cung) Jason nghe ở
 * `demo/halloween.html` và bỏ: chỉ giữ đoạn valse.
 *
 * Khai theo ô nhịp như `xmasSongs.js`: `chord` là hợp âm đệm, `mel` là giai
 * điệu dạng "nốt:phách" ("-" là lặng).
 * Nhịp 3/8: mỗi ô ba phách móc đơn. Giai điệu nằm trong quãng 196–622 Hz.
 */
import { xylo, mtof } from './halloweenSynth.js';

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const midiOf = (n) => {
  const m = /^([A-G]#?)(\d)$/.exec(n);
  return m ? NOTE[m[1]] + (Number(m[2]) + 1) * 12 : null;
};

/** Hợp âm: `bass` nốt trầm phách 1, `tones` ba nốt đệm phách 2 và 3. */
const CHORDS = {
  Gm:   { bass: [43], tones: [55, 58, 62] },
  Cm:   { bass: [48], tones: [55, 60, 63] },
  Bb:   { bass: [46], tones: [53, 58, 62] },
  F:    { bass: [41], tones: [53, 57, 60] },
  D:    { bass: [38], tones: [54, 57, 62] },
};

const bar = (chord, mel) => ({ chord, mel });
const rep = (n, b) => Array.from({ length: n }, () => b);

/** Điệu valse Sol thứ. */
const WALTZ = [
  bar('Gm', 'D4:1 G4:1 G4:1'), bar('Gm', 'G4:1 A4:1 A#4:1'),
  bar('Gm', 'A#4:1 A4:1 G4:1'), bar('D', 'F#4:1 D4:1 -:1'),
  bar('Gm', 'D4:1 G4:1 G4:1'), bar('Gm', 'G4:1 A4:1 A#4:1'),
  bar('Cm', 'C5:1 A#4:1 A4:1'), bar('Bb', 'A#4:3'),
  bar('Bb', 'A#4:1 C5:1 D5:1'), bar('Bb', 'D5:1 C5:1 A#4:1'),
  bar('F', 'A4:1 A#4:1 C5:1'), bar('F', 'C5:1 A#4:1 A4:1'),
  bar('Gm', 'G4:1 A4:1 A#4:1'), bar('D', 'A4:1 G4:1 F#4:1'),
  bar('Gm', 'G4:1 D4:1 A#3:1'), bar('Gm', 'G3:3'),
];

const DANSE = {
  key: 'danse',
  name: 'Danse Macabre',
  meter: 3,
  beat: 0.24,
  bars: [...WALTZ, ...rep(2, bar('Gm', 'G4:1 D4:1 G3:1'))],
};

export const HALLOWEEN_SONGS = { danse: DANSE };

/** Phòng chờ và màn hạ màn chơi cùng một bài. */
export const HALLOWEEN_PLAYLISTS = { menu: ['danse'], win: ['danse'] };

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

const PARSED = new Map(Object.values(HALLOWEEN_SONGS).map((s) => [s.key, s.bars.map((b) => parseBar(b.mel))]));

/** Ô nhịp nào lệch phách, nốt lạ, hợp âm lạ — trả về danh sách lỗi, rỗng là ổn. */
export function checkHalloweenSongs() {
  const errs = [];
  for (const s of Object.values(HALLOWEEN_SONGS)) {
    PARSED.get(s.key).forEach((notes, i) => {
      const sum = notes.reduce((a, n) => a + n[2], 0);
      if (Math.abs(sum - s.meter) > 1e-6) errs.push(`${s.key} ô ${i + 1}: ${sum}/${s.meter} phách`);
      if (notes.some((n) => n[0] === undefined)) errs.push(`${s.key} ô ${i + 1}: nốt lạ`);
      if (!CHORDS[s.bars[i].chord]) errs.push(`${s.key} ô ${i + 1}: hợp âm lạ ${s.bars[i].chord}`);
    });
  }
  return errs;
}

export const spookyBarSeconds = (song) => song.meter * song.beat;

/**
 * Lập lịch một ô nhịp.
 *
 * @param {import('./audio.js').Audio} a bộ âm thanh — mượn cây ghi-ta `gtr`
 *   (gảy dây: bè trầm pizzicato, hợp âm đệm) và đường nhạc `musicBus`
 */
export function scheduleSpookyBar(a, song, i, t0) {
  const b = song.beat;
  const out = a.musicBus;
  const { chord: ch } = song.bars[i];
  const chord = CHORDS[ch];
  const notes = PARSED.get(song.key)[i];

  // Giai điệu trên mộc cầm
  for (const [m, at, len] of notes) {
    if (m == null) continue;
    const when = t0 + at * b;
    xylo(a, mtof(m), when, 0.17, out, Math.min(0.9, Math.max(0.3, len * b * 1.4)));
    // Một lớp gảy dây rất nhỏ cho giai điệu có thân, không chỉ toàn tiếng gõ
    a.gtr(mtof(m), when, Math.max(0.25, len * b * 0.9), 0.06, { bright: 0.55 });
  }

  // Đệm valse: bè trầm pizzicato phách 1, hợp âm ngắn phách 2 và 3
  a.gtr(mtof(chord.bass[0]), t0, b * 1.6, 0.3, { bright: 0.3 });
  for (const k of [1, 2]) {
    chord.tones.forEach((m, j) => a.gtr(mtof(m), t0 + k * b + j * 0.01, b * 0.55, 0.07 - j * 0.01, { bright: 0.45, rel: 0.06 }));
  }
}
