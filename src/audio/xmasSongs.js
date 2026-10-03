/**
 * Nhạc chờ của chủ đề Giáng Sinh — ba bài đã hết hạn bản quyền nên chép giai
 * điệu thẳng vào mã:
 *   · Jingle Bells — James Lord Pierpont, 1857
 *   · Silent Night (Stille Nacht) — Franz Xaver Gruber, 1818
 *   · We Wish You a Merry Christmas — dân ca Anh, thế kỷ 16
 *
 * Nhạc chỉ chạy ở màn hình chờ (chọn kiểu chơi, gõ tên, phòng chờ) và màn hạ
 * màn, như nhạc ghi-ta của chủ đề mặc định. Phòng chờ luân phiên Jingle Bells
 * và Silent Night; màn hạ màn chơi We Wish You a Merry Christmas.
 *
 * Mỗi bài khai theo ô nhịp: `chord` là hợp âm đệm, `mel` là giai điệu dạng
 * "nốt:phách" ("-" là lặng). Tổng phách mỗi ô phải bằng `meter` — bài kiểm
 * thử `tests/theme.mjs` soát điều này qua `checkSongs()`.
 *
 * Đệm dùng lại cây ghi-ta Karplus–Strong của `audio.js` cho bè trầm và hợp âm,
 * giai điệu chơi bằng celesta, nhịp giữ bằng chuông xe tuần lộc.
 */
import { celesta, sleighShake, mtof } from './xmasSynth.js';

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const midiOf = (n) => {
  const m = /^([A-G]#?)(\d)$/.exec(n);
  return m ? NOTE[m[1]] + (Number(m[2]) + 1) * 12 : null;
};

/** Hợp âm: `bass` hai nốt trầm luân phiên, `tones` ba nốt rải. */
const CHORDS = {
  C:  { bass: [48, 43], tones: [55, 60, 64] },
  F:  { bass: [41, 48], tones: [53, 57, 60] },
  G:  { bass: [43, 50], tones: [55, 59, 62] },
  G7: { bass: [43, 50], tones: [53, 59, 62] },
  D:  { bass: [50, 45], tones: [54, 57, 62] },
  D7: { bass: [50, 45], tones: [54, 57, 60] },
  A7: { bass: [45, 52], tones: [55, 57, 61] },
  Am: { bass: [45, 52], tones: [57, 60, 64] },
  Em: { bass: [40, 47], tones: [55, 59, 64] },
};

const bar = (chord, mel) => ({ chord, mel });

const JINGLE = {
  key: 'jingle',
  name: 'Jingle Bells',
  meter: 4,
  beat: 0.4,          // 150 phách/phút
  style: 'jingle',
  bars: [
    // Đoạn đầu — Dashing through the snow
    bar('G', 'D4:1 B4:1 A4:1 G4:1'), bar('G', 'D4:3 D4:.5 D4:.5'),
    bar('G', 'D4:1 B4:1 A4:1 G4:1'), bar('C', 'E4:4'),
    bar('Am', 'E4:1 C5:1 B4:1 A4:1'), bar('D', 'F#4:4'),
    bar('D7', 'D5:1 D5:1 C5:1 A4:1'), bar('G', 'B4:4'),
    bar('G', 'D4:1 B4:1 A4:1 G4:1'), bar('G', 'D4:4'),
    bar('G', 'D4:1 B4:1 A4:1 G4:1'), bar('C', 'E4:3 E4:1'),
    bar('Am', 'E4:1 C5:1 B4:1 A4:1'), bar('D', 'D5:1 D5:1 D5:1 D5:1'),
    bar('D7', 'E5:1 D5:1 C5:1 A4:1'), bar('G', 'G4:2 D5:2'),
    // Điệp khúc — Jingle bells, jingle bells
    bar('G', 'B4:1 B4:1 B4:2'), bar('G', 'B4:1 B4:1 B4:2'),
    bar('G', 'B4:1 D5:1 G4:1.5 A4:.5'), bar('G', 'B4:4'),
    bar('C', 'C5:1 C5:1 C5:1.5 C5:.5'), bar('G', 'C5:1 B4:1 B4:1 B4:.5 B4:.5'),
    bar('A7', 'B4:1 A4:1 A4:1 B4:1'), bar('D7', 'A4:2 D5:2'),
    bar('G', 'B4:1 B4:1 B4:2'), bar('G', 'B4:1 B4:1 B4:2'),
    bar('G', 'B4:1 D5:1 G4:1.5 A4:.5'), bar('G', 'B4:4'),
    bar('C', 'C5:1 C5:1 C5:1.5 C5:.5'), bar('G', 'C5:1 B4:1 B4:1 B4:.5 B4:.5'),
    bar('D7', 'D5:1 D5:1 C5:1 A4:1'), bar('G', 'G4:4'),
  ],
};

/** Nhịp 6/8, đơn vị phách là móc đơn — ru chậm, không có chuông xe tuần lộc. */
const SILENT = {
  key: 'silent',
  name: 'Silent Night',
  meter: 6,
  beat: 0.34,
  style: 'lullaby',
  bars: [
    bar('C', 'G4:3 A4:1 G4:2'), bar('C', 'E4:6'),
    bar('C', 'G4:3 A4:1 G4:2'), bar('C', 'E4:6'),
    bar('G', 'D5:4 D5:2'), bar('G', 'B4:6'),
    bar('C', 'C5:4 C5:2'), bar('C', 'G4:6'),
    bar('F', 'A4:4 A4:2'), bar('F', 'C5:3 B4:1 A4:2'),
    bar('C', 'G4:3 A4:1 G4:2'), bar('C', 'E4:6'),
    bar('F', 'A4:4 A4:2'), bar('F', 'C5:3 B4:1 A4:2'),
    bar('C', 'G4:3 A4:1 G4:2'), bar('C', 'E4:6'),
    bar('G', 'D5:4 D5:2'), bar('G7', 'F5:3 D5:1 B4:2'),
    bar('C', 'C5:6'), bar('C', 'E5:6'),
    bar('C', 'C5:3 G4:1 E4:2'), bar('G7', 'G4:3 F4:1 D4:2'),
    bar('C', 'C4:6'), bar('C', '-:6'),
  ],
};

/** Nhịp 3/4, ô đầu là nhịp lấy đà (một nốt D4 ở phách ba). */
const WISH = {
  key: 'wish',
  name: 'We Wish You a Merry Christmas',
  meter: 3,
  beat: 0.42,
  style: 'waltz',
  bars: [
    bar('D', '-:2 D4:1'),
    bar('G', 'G4:1 G4:.5 A4:.5 G4:.5 F#4:.5'), bar('C', 'E4:1 E4:1 E4:1'),
    bar('A7', 'A4:1 A4:.5 B4:.5 A4:.5 G4:.5'), bar('D', 'F#4:1 D4:1 D4:1'),
    bar('Em', 'B4:1 B4:.5 C5:.5 B4:.5 A4:.5'), bar('C', 'G4:1 E4:1 D4:.5 D4:.5'),
    bar('D7', 'E4:1 A4:1 F#4:1'), bar('G', 'G4:2 D4:1'),
    bar('G', 'G4:1 G4:1 G4:1'), bar('D', 'F#4:2 F#4:1'),
    bar('D', 'G4:1 F#4:1 E4:1'), bar('D', 'D4:2 A4:1'),
    bar('G', 'B4:1 A4:1 G4:1'), bar('G', 'D5:1 D4:1 D4:.5 D4:.5'),
    bar('D7', 'E4:1 A4:1 F#4:1'), bar('G', 'G4:3'),
  ],
};

export const SONGS = { jingle: JINGLE, silent: SILENT, wish: WISH };

/** Danh sách phát theo chế độ: phòng chờ luân phiên hai bài, hạ màn một bài. */
export const PLAYLISTS = { menu: ['jingle', 'silent'], win: ['wish'] };

/** Giai điệu của một ô nhịp, đã tách thành [midi | null, phách bắt đầu, số phách]. */
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

const PARSED = new Map(Object.values(SONGS).map((s) => [s.key, s.bars.map((b) => parseBar(b.mel))]));

/** Ô nhịp nào lệch phách so với `meter` — trả về danh sách lỗi, rỗng là ổn. */
export function checkSongs() {
  const errs = [];
  for (const s of Object.values(SONGS)) {
    PARSED.get(s.key).forEach((notes, i) => {
      const sum = notes.reduce((a, n) => a + n[2], 0);
      if (Math.abs(sum - s.meter) > 1e-6) errs.push(`${s.key} ô ${i + 1}: ${sum}/${s.meter} phách`);
      if (notes.some((n) => n[0] === undefined)) errs.push(`${s.key} ô ${i + 1}: nốt lạ`);
      if (!CHORDS[s.bars[i].chord]) errs.push(`${s.key} ô ${i + 1}: hợp âm lạ ${s.bars[i].chord}`);
    });
  }
  return errs;
}

/** Độ dài một ô nhịp (giây). */
export const barSeconds = (song) => song.meter * song.beat;

/**
 * Lập lịch một ô nhịp.
 *
 * @param {import('./audio.js').Audio} a bộ âm thanh — mượn cây ghi-ta `gtr` và
 *   đường nhạc `musicGain` / `guitarIn` của nó
 * @param {object} song bài đang chơi
 * @param {number} i chỉ số ô nhịp
 * @param {number} t0 thời điểm bắt đầu ô nhịp (giây, theo đồng hồ AudioContext)
 */
export function scheduleSongBar(a, song, i, t0) {
  const b = song.beat;
  const out = a.musicBus;
  const chord = CHORDS[song.bars[i].chord];

  /* --- Giai điệu: celesta lên một quãng tám cho sáng, chồng một bè ghi-ta
         đúng cao độ ở mức nhỏ để tiếng có thân, không chỉ toàn tiếng chuông */
  const lead = song.style === 'lullaby' ? 0.20 : 0.24;
  for (const [m, at, len] of PARSED.get(song.key)[i]) {
    if (m == null) continue;
    const when = t0 + at * b;
    celesta(a, mtof(m + 12), when, lead, out, Math.min(2.4, Math.max(0.9, len * b * 2)));
    a.gtr(mtof(m), when, Math.max(0.3, len * b * 0.95), song.style === 'lullaby' ? 0.10 : 0.12, { bright: 0.6 });
  }

  /* --- Đệm */
  if (song.style === 'jingle') {
    // Bè trầm "um" phách 1 và 3, hợp âm "pah" phách 2 và 4 — nhịp đi bộ của bài
    a.gtr(mtof(chord.bass[0]), t0, b * 1.8, 0.32, { bright: 0.2 });
    a.gtr(mtof(chord.bass[1]), t0 + 2 * b, b * 1.8, 0.28, { bright: 0.2 });
    for (const k of [1, 3]) {
      chord.tones.forEach((m, j) => a.gtr(mtof(m), t0 + k * b + j * 0.012, b * 0.7, 0.085 - j * 0.012, { bright: 0.5, rel: 0.08 }));
    }
    // Chuông xe tuần lộc mỗi móc đơn, nhấn ở phách 2 và 4
    for (let k = 0; k < 8; k++) {
      const accent = k === 2 || k === 6 ? 1 : k % 2 === 0 ? 0.55 : 0.32;
      sleighShake(a, t0 + k * b * 0.5, 0.11 * accent, out);
    }
  } else if (song.style === 'waltz') {
    a.gtr(mtof(chord.bass[0]), t0, b * 2.6, 0.32, { bright: 0.2 });
    for (const k of [1, 2]) {
      chord.tones.forEach((m, j) => a.gtr(mtof(m), t0 + k * b + j * 0.014, b * 0.8, 0.08 - j * 0.012, { bright: 0.48, rel: 0.1 }));
    }
    sleighShake(a, t0, 0.09, out);
    sleighShake(a, t0 + b, 0.05, out);
    sleighShake(a, t0 + 2 * b, 0.05, out);
  } else {
    // Ru: nốt trầm ngân cả ô, ba ngón rải lên rồi xuống trên năm móc đơn còn lại
    a.gtr(mtof(chord.bass[0]), t0, b * 5.8, 0.26, { bright: 0.15 });
    const [x, y, z] = chord.tones;
    [x, y, z, y, x].forEach((m, k) => a.gtr(mtof(m), t0 + (k + 1) * b, b * 1.8, 0.07, { bright: 0.35 }));
  }
}
