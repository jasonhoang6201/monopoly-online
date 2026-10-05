/**
 * Nhạc chờ chủ đề Halloween: Danse Macabre, Op. 40 — Camille Saint-Saëns,
 * 1874, đã thuộc phạm vi công cộng. Soạn lại cho Web Audio theo bốn đoạn của
 * bản gốc:
 *   1. Nửa đêm: đàn hạc gõ nốt Rê mười hai lần.
 *   2. Thần chết lên dây: vĩ cầm kéo quãng ba cung La–Mi giáng (nốt Mi được
 *      lên dây hạ xuống Mi giáng), xen với quãng năm đúng Rê–La.
 *   3. Điệu valse Sol thứ trên mộc cầm — tiếng xương khua.
 *   4. Câu nhạc đi xuống từng nửa cung trên vĩ cầm.
 * Giai điệu đoạn 3 và 4 chép theo trí nhớ và rút gọn để lặp được, không phải
 * bản phổ đầy đủ; tai Jason là nơi chốt cuối, xem `demo/halloween.html`.
 *
 * Khai theo ô nhịp như `xmasSongs.js`: `chord` là hợp âm đệm, `mel` là giai
 * điệu dạng "nốt:phách" ("-" là lặng), `sec` là đoạn (quyết định nhạc cụ).
 * Nhịp 3/8: mỗi ô ba phách móc đơn. Giai điệu nằm trong quãng 196–622 Hz.
 */
import { xylo, bowed, chapelBell, mtof } from './halloweenSynth.js';

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const midiOf = (n) => {
  const m = /^([A-G]#?)(\d)$/.exec(n);
  return m ? NOTE[m[1]] + (Number(m[2]) + 1) * 12 : null;
};

/** Hợp âm: `bass` nốt trầm phách 1, `tones` ba nốt đệm phách 2 và 3. */
const CHORDS = {
  Dped: { bass: [38], tones: [] },
  Gm:   { bass: [43], tones: [55, 58, 62] },
  Cm:   { bass: [48], tones: [55, 60, 63] },
  Bb:   { bass: [46], tones: [53, 58, 62] },
  F:    { bass: [41], tones: [53, 57, 60] },
  D:    { bass: [38], tones: [54, 57, 62] },
  D7:   { bass: [38], tones: [54, 57, 60] },
};

const bar = (chord, mel, sec) => ({ chord, mel, sec });
const rep = (n, b) => Array.from({ length: n }, () => b);

/** Điệu valse — dùng ở cả bài chờ lẫn bài hạ màn. */
const WALTZ = [
  bar('Gm', 'D4:1 G4:1 G4:1', 'waltz'), bar('Gm', 'G4:1 A4:1 A#4:1', 'waltz'),
  bar('Gm', 'A#4:1 A4:1 G4:1', 'waltz'), bar('D', 'F#4:1 D4:1 -:1', 'waltz'),
  bar('Gm', 'D4:1 G4:1 G4:1', 'waltz'), bar('Gm', 'G4:1 A4:1 A#4:1', 'waltz'),
  bar('Cm', 'C5:1 A#4:1 A4:1', 'waltz'), bar('Bb', 'A#4:3', 'waltz'),
  bar('Bb', 'A#4:1 C5:1 D5:1', 'waltz'), bar('Bb', 'D5:1 C5:1 A#4:1', 'waltz'),
  bar('F', 'A4:1 A#4:1 C5:1', 'waltz'), bar('F', 'C5:1 A#4:1 A4:1', 'waltz'),
  bar('Gm', 'G4:1 A4:1 A#4:1', 'waltz'), bar('D', 'A4:1 G4:1 F#4:1', 'waltz'),
  bar('Gm', 'G4:1 D4:1 A#3:1', 'waltz'), bar('Gm', 'G3:3', 'waltz'),
];

const DANSE = {
  key: 'danse',
  name: 'Danse Macabre',
  meter: 3,
  beat: 0.27,
  bars: [
    // Nửa đêm: mười hai tiếng Rê
    ...rep(12, bar('Dped', 'D4:3', 'midnight')),
    // Lên dây: quãng ba cung rồi quãng năm, ba lượt
    ...[0, 1, 2].flatMap(() => [bar('Dped', 'A4:1 A4:1 -:1', 'tri'), bar('Dped', 'D4:2 -:1', 'fifth')]),
    ...WALTZ,
    // Câu đi xuống từng nửa cung
    bar('D7', 'D#5:1 D5:1 C#5:1', 'chrom'), bar('Gm', 'D5:3', 'chrom'),
    bar('D7', 'C5:1 B4:1 A#4:1', 'chrom'), bar('D', 'A4:3', 'chrom'),
    bar('D7', 'G#4:1 G4:1 F#4:1', 'chrom'), bar('Gm', 'G4:3', 'chrom'),
    bar('D7', 'D#4:1 D4:1 C#4:1', 'chrom'), bar('D', 'D4:3', 'chrom'),
    ...WALTZ,
  ],
};

/** Màn hạ màn: chỉ điệu valse, nhanh hơn một chút. */
const DANSE_WIN = {
  key: 'danse-win',
  name: 'Danse Macabre · hạ màn',
  meter: 3,
  beat: 0.24,
  bars: [...WALTZ, ...rep(2, bar('Gm', 'G4:1 D4:1 G3:1', 'waltz'))],
};

export const HALLOWEEN_SONGS = { danse: DANSE, 'danse-win': DANSE_WIN };

/** Danh sách phát theo chế độ: phòng chờ và màn hạ màn. */
export const HALLOWEEN_PLAYLISTS = { menu: ['danse'], win: ['danse-win'] };

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
 *   (gảy dây: đàn hạc, bè trầm pizzicato) và đường nhạc `musicBus`
 */
export function scheduleSpookyBar(a, song, i, t0) {
  const b = song.beat;
  const out = a.musicBus;
  const { chord: ch, sec } = song.bars[i];
  const chord = CHORDS[ch];
  const notes = PARSED.get(song.key)[i];

  if (sec === 'midnight') {
    // Đàn hạc gõ Rê hai quãng tám, chuông nhà nguyện rất nhỏ ngân theo
    for (const [m] of notes) {
      if (m == null) continue;
      a.gtr(mtof(m), t0, 2.2, 0.3, { bright: 0.75 });
      a.gtr(mtof(m - 12), t0, 2.4, 0.22, { bright: 0.5 });
      chapelBell(a, t0, 0.035, out, mtof(m - 12));
    }
    return;
  }

  if (sec === 'tri' || sec === 'fifth') {
    const up = sec === 'tri' ? 6 : 7;
    for (const [m, at, len] of notes) {
      if (m == null) continue;
      const dur = Math.max(0.2, len * b * 0.92);
      bowed(a, mtof(m), t0 + at * b, dur, 0.07, out);
      bowed(a, mtof(m + up), t0 + at * b, dur, 0.06, out);
    }
    a.gtr(mtof(chord.bass[0]), t0, b * 2, 0.24, { bright: 0.3 });
    return;
  }

  // Giai điệu: mộc cầm ở đoạn valse, vĩ cầm ở câu đi xuống
  for (const [m, at, len] of notes) {
    if (m == null) continue;
    const when = t0 + at * b;
    if (sec === 'chrom') bowed(a, mtof(m), when, Math.max(0.2, len * b * 0.95), 0.085, out);
    else {
      xylo(a, mtof(m), when, 0.17, out, Math.min(0.9, Math.max(0.3, len * b * 1.4)));
      // Một lớp gảy dây rất nhỏ cho giai điệu có thân, không chỉ toàn tiếng gõ
      a.gtr(mtof(m), when, Math.max(0.25, len * b * 0.9), 0.06, { bright: 0.55 });
    }
  }

  // Đệm valse: bè trầm pizzicato phách 1, hợp âm ngắn phách 2 và 3
  a.gtr(mtof(chord.bass[0]), t0, b * 1.6, 0.3, { bright: 0.3 });
  for (const k of [1, 2]) {
    chord.tones.forEach((m, j) => a.gtr(mtof(m), t0 + k * b + j * 0.01, b * 0.55, 0.07 - j * 0.01, { bright: 0.45, rel: 0.06 }));
  }
}
