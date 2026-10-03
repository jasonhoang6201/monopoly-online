/**
 * Biểu tượng Giáng Sinh vẽ bằng canvas: cây thông, ông già Noel, hộp quà,
 * người tuyết, đống tuyết, xe trượt tuyết, chuông, Nhà thờ Đức Bà…
 *
 * Mỗi biểu tượng là một danh sách lớp `[đường SVG, màu tô, (màu viền, nét)]`
 * trong khung 64 × 64 — cùng bản vẽ với trang thử `demo/christmas.html`.
 * Canvas đọc thẳng chuỗi đường SVG qua `Path2D`, nên vẽ ở cỡ nào cũng sắc và
 * không phải tải file ảnh.
 */

const SNOW = '#FFFFFF';
const SNOW_EDGE = '#A9CBE2';
const RED = '#C8262F';
const RED_DEEP = '#A11E26';
const GREEN = '#2E6B45';
const GREEN_DEEP = '#245A39';
const GOLD = '#D6A738';
const BROWN = '#7A4B2A';

/** Đường vẽ dùng chung giữa các biểu tượng. */
const snowLip = (y, x0, x1, h = 4) => {
  let d = `M${x0} ${y} `;
  const step = (x1 - x0) / 6;
  for (let i = 0; i < 6; i++) {
    const a = x0 + i * step;
    d += `Q${a + step / 2} ${y - h} ${a + step} ${y} `;
  }
  return `${d}Z`;
};

export const XMAS_ICONS = {
  tree: [
    ['M28 51h8v10h-8z', BROWN],
    ['M32 26 L54 52 H10 Z', GREEN], ['M32 26 L54 52 H32 Z', GREEN_DEEP],
    ['M32 15 L48 38 H16 Z', '#33774D'], ['M32 15 L48 38 H32 Z', '#285F3D'],
    ['M32 6 L43 24 H21 Z', '#3A8456'], ['M32 6 L43 24 H32 Z', GREEN],
    [snowLip(52, 10, 54), SNOW], [snowLip(38, 16, 48, 3), SNOW], [snowLip(24, 21, 43, 3), SNOW],
    ['M24 45m-2.4 0a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0', RED],
    ['M40 46m-2.4 0a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0', GOLD],
    ['M33 31m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0', GOLD],
    ['M38 19m-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0', RED],
    ['M32 1.5 L33.6 5 L37.3 5.3 L34.5 7.6 L35.4 11.2 L32 9.3 L28.6 11.2 L29.5 7.6 L26.7 5.3 L30.4 5 Z', '#F2C24A', '#B8862A', 0.6],
  ],
  santa: [
    ['M14 28 Q18 6 40 8 Q52 10 55 24 L50 29 Z', RED], ['M40 8 Q52 10 55 24 L50 29 L40 26 Z', RED_DEEP],
    ['M55 24m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0', SNOW, '#DCEBF6', 1],
    ['M32 38m-13 0a13 12 0 1 0 26 0a13 12 0 1 0 -26 0', '#F2C9A5'],
    ['M17 37 Q16 58 32 61 Q48 58 47 37 Q44 47 32 47 Q20 47 17 37 Z', SNOW, '#DCEBF6', 1],
    ['M22 44 Q27 40 32 43 Q37 40 42 44 Q37 47 32 45 Q27 47 22 44 Z', '#F4F8FB', '#C9DCEB', 0.8],
    ['M32 41m-2.6 0a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0', '#E28B76'],
    ['M26.5 35m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0', '#2A1A12'],
    ['M37.5 35m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0', '#2A1A12'],
    ['M16 25h32a4 4 0 0 1 0 8h-32a4 4 0 0 1 0-8z', SNOW, '#DCEBF6', 1],
  ],
  gift: [
    ['M12 29h40v29h-40z', RED], ['M32 29h20v29h-20z', RED_DEEP],
    ['M9 22h46v9h-46z', '#D8434A'], ['M29 22h6v36h-6z', GOLD],
    ['M32 21 Q20 8 15 15 Q13 21 32 21 Z', '#E7BC4B', '#B8862A', 1],
    ['M32 21 Q44 8 49 15 Q51 21 32 21 Z', '#E7BC4B', '#B8862A', 1],
    ['M32 20.5m-3.4 0a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0 -6.8 0', GOLD, '#B8862A', 1],
    [snowLip(58, 12, 52, 3), SNOW],
  ],
  flake: [
    ['M32 32V6M32 14L25 8.5M32 14L39 8.5M32 22L26.5 17.5M32 22L37.5 17.5', null, '#5E9CCB', 3, 6],
    ['M32 32m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0', SNOW, '#5E9CCB', 2],
  ],
  snowman: [
    ['M32 60m-20 0a20 3 0 1 0 40 0a20 3 0 1 0 -40 0', '#BCD6EA'],
    ['M32 45m-15 0a15 15 0 1 0 30 0a15 15 0 1 0 -30 0', SNOW, SNOW_EDGE, 1.2],
    ['M32 23m-10.5 0a10.5 10.5 0 1 0 21 0a10.5 10.5 0 1 0 -21 0', SNOW, SNOW_EDGE, 1.2],
    ['M22 12h20v3h-20z', '#2A2A33'], ['M25 2h14v11h-14z', '#2A2A33'], ['M25 9.5h14v2.4h-14z', RED],
    ['M21 31 Q32 36 43 31 L43 35 Q32 40 21 35 Z', RED], ['M38 34 L44 45 L39.5 45.5 L36 35.5 Z', RED_DEEP],
    ['M28 21m-1.4 0a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0', '#2A2A33'],
    ['M36 21m-1.4 0a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0', '#2A2A33'],
    ['M32 24 L41 26.5 L32 26.8 Z', '#E8812E'],
    ['M32 42m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0', '#2A2A33'],
    ['M32 49m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0', '#2A2A33'],
    ['M18 40L7 33M10 35L7 31.5M46 40L57 33M54 35L57 31.5', null, BROWN, 2],
  ],
  pile: [
    ['M3 56 Q10 40 22 43 Q30 30 42 39 Q55 36 61 56 Z', SNOW, SNOW_EDGE, 1.2],
    ['M8 56 Q20 49 32 52 Q46 48 58 56 Z', '#CFE2F0'],
    ['M36 27h2.6v17h-2.6z', BROWN],
    ['M48 26l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z', SNOW, '#8FB4D0', 0.6],
  ],
  bells: [
    ['M14 22 Q14 13 22 13 Q30 13 30 22 L31 36 Q33 39 30 40 H14 Q11 39 13 36 Z', '#E7BC4B', '#A9782A', 1.2],
    ['M34 22 Q34 13 42 13 Q50 13 50 22 L51 36 Q53 39 50 40 H34 Q31 39 33 36 Z', GOLD, '#A9782A', 1.2],
    ['M22 44m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', '#A9782A'], ['M42 44m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', '#A9782A'],
    ['M20 8 Q26 2 32 9 Q26 12 20 8 Z', GREEN], ['M44 8 Q38 2 32 9 Q38 12 44 8 Z', GREEN],
    ['M32 10m-2.6 0a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0', '#D8434A'],
  ],
  sleigh: [
    ['M6 50H52Q60 50 60 43', null, GOLD, 3], ['M14 50V44M44 50V44', null, GOLD, 2.5],
    ['M8 26 Q6 44 18 45 H48 Q56 45 56 34 Q56 28 50 28 Q46 28 46 33 V36 H22 Q20 26 8 26 Z', RED, '#7E1A20', 1.2],
    ['M22 36 Q22 20 34 20 Q46 22 44 36 Z', BROWN],
    ['M26 14h10v9h-10z', GREEN], ['M30 14h2v9h-2z', GOLD], ['M36 18h8v7h-8z', '#D8434A'],
    ['M8 26 Q14 24 20 30', null, SNOW, 2.4],
  ],
  wreath: [
    ['M32 30m-19 0a19 19 0 1 0 38 0a19 19 0 1 0 -38 0', null, GREEN, 11],
    ['M32 30m-19 0a19 19 0 1 0 38 0a19 19 0 1 0 -38 0', null, '#3A8456', 4],
    ['M32 48 Q20 38 19 46 Q20 52 32 48 Z M32 48 Q44 38 45 46 Q44 52 32 48 Z', RED],
    ['M17 20m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0M46 18m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0M50 35m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0', '#D8434A'],
  ],
  cane: [
    ['M38 60V22A10 10 0 0 0 18 22', null, SNOW, 9],
    ['M38 60V22A10 10 0 0 0 18 22', null, RED, 9, 0, [5, 6]],
  ],
  cathedral: [
    ['M9 22h13v38h-13z', '#B5543A'], ['M42 22h13v38h-13z', '#A44A32'],
    ['M9 22 L15.5 6 L22 22 Z', '#6E7F8C'], ['M42 22 L48.5 6 L55 22 Z', '#617280'],
    ['M15.5 6V1M13.5 3H17.5M48.5 6V1M46.5 3H50.5', null, '#5A4632', 1.4],
    ['M22 30h20v30h-20z', '#C2603F'], ['M20 30 L32 20 L44 30 Z', '#9B4630'],
    ['M32 38m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0', '#F2D27A', '#7E3A26', 1.2],
    ['M27 60V51Q32 45 37 51V60Z', '#5A2A1C'],
    ['M13 30h5v8h-5zM46 30h5v8h-5z', '#F2D27A'], ['M13 43h5v8h-5zM46 43h5v8h-5z', '#5A2A1C'],
    ['M10.5 18 L15.5 8 L20.5 18 Q18 16 15.5 17.5 Q13 16 10.5 18 Z', SNOW],
    ['M43.5 18 L48.5 8 L53.5 18 Q51 16 48.5 17.5 Q46 16 43.5 18 Z', SNOW],
    ['M21 30 L32 21 L43 30 Q38 28 32 29.5 Q26 28 21 30 Z', SNOW],
    ['M8 22H23V24Q15 25.5 8 24ZM41 22H56V24Q48 25.5 41 24Z', SNOW],
  ],
};

const pathCache = new Map();
const path = (d) => {
  if (!pathCache.has(d)) pathCache.set(d, new Path2D(d));
  return pathCache.get(d);
};

/**
 * Vẽ một biểu tượng, tâm tại (cx, cy), cạnh `size`.
 *
 * Lớp có phần tử thứ năm `n` thì vẽ lặp n lần quanh tâm (bông tuyết sáu
 * cánh), phần tử thứ sáu là mẫu nét đứt (kẹo gậy sọc).
 */
export function drawXmasIcon(ctx, name, cx, cy, size, o = {}) {
  const layers = XMAS_ICONS[name];
  if (!layers) return;
  const k = size / 64;
  ctx.save();
  ctx.translate(cx, cy);
  if (o.rot) ctx.rotate(o.rot);
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  ctx.scale(o.flip ? -k : k, k);
  ctx.translate(-32, -32);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [d, fill, stroke, width, repeat, dash] of layers) {
    const p = path(d);
    const times = repeat || 1;
    for (let r = 0; r < times; r++) {
      if (times > 1) { ctx.save(); ctx.translate(32, 32); ctx.rotate((r * Math.PI * 2) / times); ctx.translate(-32, -32); }
      if (fill) { ctx.fillStyle = fill; ctx.fill(p); }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width ?? 1;
        if (dash) { ctx.save(); ctx.lineCap = 'butt'; ctx.setLineDash(dash); }
        ctx.stroke(p);
        if (dash) ctx.restore();
      }
      if (times > 1) ctx.restore();
    }
  }
  ctx.restore();
}
