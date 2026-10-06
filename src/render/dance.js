/**
 * Biên đạo cho hàng bộ xương giữa nghĩa địa Halloween: các điệu của Michael
 * Jackson — moonwalk, kiễng mũi chân chỉ tay lên trời (Billie Jean), dang tay
 * vồ của Thriller, đá chân giữ mũ, ngả người 45° (Smooth Criminal), xoay vòng.
 *
 * Tư thế viết theo hệ của `drawSkeleton` khi nhìn sang phải: góc tính bằng
 * radian lệch khỏi phương thẳng đứng hướng xuống, dương là ra trước.
 *   legs: [[a, gậpGối, kiễng], [...]] — chân sau rồi chân trước
 *   arms: [[a, gậpKhuỷu], [...]]      — tay sau rồi tay trước
 *   lean  ngả cả người quanh bàn chân, tilt  nghiêng đầu (âm là ngửa)
 *
 * Mỗi điệu dựng sẵn vài khung thành texture (`BoardScene.danceFrames`), nên
 * mỗi khung hình chỉ đổi texture chứ không vẽ lại.
 */

const lerp = (a, b, p) => a + (b - a) * p;
const ease = (p) => p * p * (3 - 2 * p);
const TAU = Math.PI * 2;

/** Điệu nhảy: `frames` khung, `loop` là điệu lặp (khung cuối nối về khung đầu). */
export const MOVES = {
  /* Moonwalk: một chân bàn chân phẳng trượt từ trước ra sau, chân kia gập gối
     kiễng mũi; nửa chu kỳ thì hai chân đổi vai. Người trôi ngược hướng mặt. */
  moon: {
    frames: 6, loop: true,
    pose(t) {
      const u = (t * 2) % 1;
      const flat = [0.2 - 0.45 * u, 0, false];
      const toe = [0.35, 1.0, true];
      const sw = Math.sin(t * TAU) * 0.12;
      return {
        legs: t < 0.5 ? [flat, toe] : [toe, flat],
        arms: [[-0.25 + sw, 0.6], [0.15 - sw, 0.7]],
        lean: 0.04,
      };
    },
  },
  /* Billie Jean: kiễng hai mũi chân, tay trước vút thẳng lên trời, tay sau
     chống hông, đầu ngửa theo tay. */
  toe: {
    frames: 3, loop: false,
    pose(p) {
      return {
        legs: [[-0.04, 0.12 * p, p > 0.3], [0.06, 0.12 * p, p > 0.3]],
        arms: [[lerp(-0.12, -0.55, p), lerp(0.25, 1.5, p)], [lerp(0.12, 2.8, p), lerp(0.25, 0, p)]],
        tilt: -0.3 * p,
      };
    },
  },
  /* Thriller: chân dạng, hai tay giơ ra trước rũ cổ tay như móng vuốt, vai
     nhún so le, đầu lắc lư, gối nhún luân phiên. */
  thriller: {
    frames: 6, loop: true,
    pose(t) {
      const w = Math.sin(t * TAU);
      return {
        legs: [[-0.3, 0.45 * Math.max(0, w), false], [0.3, 0.45 * Math.max(0, -w), false]],
        arms: [[1.55 + 0.3 * w, -0.75], [1.85 - 0.3 * w, -0.8]],
        lean: 0.15,
        tilt: 0.3 * w,
      };
    },
  },
  /* Đá chân: chân trước hất cao mũi nhọn, tay trước đưa lên vành mũ, người
     ngả ra sau giữ thăng bằng. */
  kick: {
    frames: 5, loop: false,
    pose(t) {
      const p = Math.sin(Math.PI * t);
      return {
        legs: [[-0.08, 0, false], [0.05 + 1.25 * p, 0.3 * (1 - p) + 0.05, p > 0.3]],
        arms: [[lerp(-0.12, -0.8, p), 0.25], [lerp(0.12, 2.75, p), lerp(0.25, 1.1, p)]],
        lean: -0.18 * p,
      };
    },
  },
  /* Smooth Criminal: chân khép thẳng, tay buông dọc thân, cả người ngả tới
     trước quanh gót mà không ngã. */
  lean: {
    frames: 4, loop: false,
    pose(p) {
      return { legs: [[-0.03, 0, false], [0.03, 0, false]], arms: [[-0.05, 0.05], [0.05, 0.05]], lean: 0.55 * p };
    },
  },
  /* Xoay: kiễng, hai chân bắt chéo, tay ôm trước ngực. Vòng xoay diễn bằng
     cách bóp bề ngang ảnh theo cos góc xoay (`danceAt` trả `sx`). */
  spin: {
    frames: 1, loop: false,
    pose() {
      return { legs: [[0.12, 0.05, true], [-0.06, 0.05, true]], arms: [[0.3, 2.2], [0.35, 2.1]] };
    },
  },
};

/** Tư thế khung `k` của điệu `name`. */
export function movePose(name, k) {
  const m = MOVES[name];
  const t = m.frames === 1 ? 0 : m.loop ? k / m.frames : k / (m.frames - 1);
  return m.pose(t);
}

/* Lịch diễn một vòng, đơn vị giây. `glide` là vị trí cả hàng từ đầu tới cuối
   đoạn (+1 tận phải, -1 tận trái); `turns` số vòng xoay; `dir` hướng mặt lúc
   vào đoạn. Hai đoạn moonwalk đối xứng nên hàng trượt qua rồi trượt về. */
const SHOW = [
  { move: 'moon', d: 3.6, dir: 1, glide: [1, -1], period: 0.9 },
  { move: 'spin', d: 0.7, dir: 1, turns: 2 },
  { move: 'toe', d: 1.6, dir: 1, rise: 0.35 },
  { move: 'thriller', d: 2.4, dir: 1, period: 0.8 },
  { move: 'kick', d: 0.9, dir: 1 },
  { move: 'lean', d: 2.6, dir: 1, down: 0.6, back: 0.7 },
  { move: 'spin', d: 0.7, dir: 1, turns: 1.5 },
  { move: 'moon', d: 3.6, dir: -1, glide: [-1, 1], period: 0.9 },
  { move: 'spin', d: 0.7, dir: -1, turns: 1.5 },
];
const SHOW_LEN = SHOW.reduce((n, s) => n + s.d, 0);

/** Thời điểm đứng hình khi người chơi tắt chuyển động: đỉnh dáng Billie Jean. */
export const STILL_AT = SHOW[0].d + SHOW[1].d + 1;

/**
 * Bộ xương đang ở đâu trong vở diễn lúc `sec` giây.
 * @returns {{move:string, k:number, sx:number, glide:number}} `k` khung của
 *   điệu, `sx` hệ số bề ngang có dấu (âm là quay mặt trái), `glide` vị trí hàng.
 */
export function danceAt(sec) {
  let t = ((sec % SHOW_LEN) + SHOW_LEN) % SHOW_LEN;
  let glide = 1;
  for (const s of SHOW) {
    if (t >= s.d) {
      if (s.glide) glide = s.glide[1];
      t -= s.d;
      continue;
    }
    const u = t / s.d;
    const m = MOVES[s.move];
    let k = 0, sx = s.dir;
    if (s.glide) glide = lerp(s.glide[0], s.glide[1], u);
    if (s.period) k = Math.floor((t / s.period) * m.frames) % m.frames;
    else if (s.turns) sx = s.dir * Math.cos(u * s.turns * TAU);
    else if (s.rise) k = Math.round(Math.min(1, t / s.rise) * (m.frames - 1));
    else if (s.down) {
      const p = t < s.down ? t / s.down : t > s.d - s.back ? (s.d - t) / s.back : 1;
      k = Math.round(ease(p) * (m.frames - 1));
    } else k = Math.min(m.frames - 1, Math.floor(u * m.frames));
    return { move: s.move, k, sx, glide };
  }
  return { move: 'moon', k: 0, sx: 1, glide };
}
