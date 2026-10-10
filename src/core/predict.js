/**
 * Dự đoán xí ngầu cho bot — tính chính xác bằng xác suất 2d6, không gieo thử,
 * nên chạy được mỗi nước đi mà không tốn gì.
 *
 * Ba thứ bot đọc được ở đây:
 *   - `nextLanding(pos)`  — cú lắc tới dừng ở ô nào với xác suất bao nhiêu
 *     (tính cả đổ đôi được lắc tiếp, đổ đôi ba lần vào tù, ô Vào Tù).
 *   - `LONG_RUN`          — tần suất một quân đứng ở mỗi ô về lâu dài (xích
 *     Markov). Ô cam, ô đỏ đông khách hơn ô xanh đậm; công ích vắng.
 *   - `payOutlook(st, p)` — phân bố số tiền chính mình phải trả ở cú lắc tới:
 *     kỳ vọng và phân vị, để giữ đúng chừng ấy tiền mặt chứ không đoán mò.
 *   - `hitChance(st, id, seat)` — xác suất ít nhất một đối thủ đáp vào ô `id`
 *     ở lượt tới của họ: xây nhà đúng chỗ người ta sắp bước vào.
 *
 * Thẻ Cơ Hội / Khí Vận dắt quân đi thì bỏ qua: bot chỉ cần so các ô với nhau,
 * không cần con số tuyệt đối.
 */
import { BOARD, GOTO_JAIL_TILE, JAIL_TILE } from '../data/board.js';
import { payerRent } from './skills.js';

/** P(tổng = s) và P(đôi | tổng = s) của hai con xí ngầu. */
const SUMS = (() => {
  const out = [];
  for (let s = 2; s <= 12; s++) {
    let n = 0, dbl = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b === s) { n++; if (a === b) dbl++; }
    out.push({ s, p: n / 36, dbl: dbl / 36 });
  }
  return out;
})();

const CACHE = new Map();
const wrap = (n) => ((n % 40) + 40) % 40;
const land = (id) => (id === GOTO_JAIL_TILE ? JAIL_TILE : id);

/**
 * Phân bố ô dừng chân trong cả lượt tới của một quân đang đứng ở `pos`.
 * Đổ đôi thì lắc tiếp (tối đa ba lần, lần ba vào tù); mỗi ô dừng chân đều
 * tính — tiền thuê trả ở từng ô dừng, không chỉ ô cuối.
 *
 * @returns {Map<number, {p:number, sums:Map<number,number>}>} ô → xác suất
 *   dừng ở đó trong lượt (có thể >1 tổng với nhiều lần dừng), kèm xác suất
 *   theo tổng xí ngầu (tiền thuê công ích tính theo tổng)
 */
export function nextLanding(pos, inJail = false) {
  // Chỉ phụ thuộc vào ô đứng nên nhớ lại — bot hỏi cùng một ô nhiều lần mỗi nước
  const key = inJail ? -1 : pos;
  if (CACHE.has(key)) return CACHE.get(key);
  const out = new Map();
  CACHE.set(key, out);
  const add = (id, s, p) => {
    const e = out.get(id) ?? { p: 0, sums: new Map() };
    e.p += p;
    e.sums.set(s, (e.sums.get(s) ?? 0) + p);
    out.set(id, e);
  };
  const go = (from, depth, w) => {
    for (const { s, p, dbl } of SUMS) {
      const pd = dbl * w;          // đổ đôi tổng s
      const pn = (p - dbl) * w;    // không đôi tổng s
      const to = land(wrap(from + s));
      if (pn) add(to, s, pn);
      if (!pd) continue;
      if (depth === 2) { add(JAIL_TILE, s, pd); continue; }   // đôi lần ba: vào tù
      add(to, s, pd);
      if (to !== JAIL_TILE) go(to, depth + 1, pd);
    }
  };
  if (inJail) {
    // Trong tù chỉ ra bằng đôi (không được lắc tiếp) — phần còn lại đứng yên
    for (const { s, dbl } of SUMS) if (dbl) add(wrap(JAIL_TILE + s), s, dbl);
    return out;
  }
  go(pos, 0, 1);
  return out;
}

/** Tần suất dài hạn mỗi ô — lặp lũy thừa trên xích Markov một lượt. */
export const LONG_RUN = (() => {
  const T = Array.from({ length: 40 }, (_, i) => nextLanding(i));
  let v = new Array(40).fill(1 / 40);
  for (let k = 0; k < 60; k++) {
    const nv = new Array(40).fill(0);
    for (let i = 0; i < 40; i++) {
      if (!v[i]) continue;
      // Quân đứng ở ô cuối của lượt; xấp xỉ bằng phân bố dừng chân chuẩn hoá
      let tot = 0;
      for (const e of T[i].values()) tot += e.p;
      for (const [j, e] of T[i]) nv[j] += v[i] * e.p / tot;
    }
    v = nv;
  }
  // Chia cho trung bình để 1 = ô "bình thường", >1 = đông khách
  const mean = v.reduce((a, b) => a + b, 0) / 40;
  return v.map((x) => x / mean);
})();

/** Số tiền phải trả khi dừng ở ô `id` với tổng xí ngầu `s`. */
function costAt(st, p, id, s) {
  const t = BOARD[id];
  if (t.type === 'tax') return t.tax_amount ?? 0;
  if (!t.ownable) return 0;
  const o = st.owner.get(id);
  if (o === undefined || o === p.id) return 0;
  return payerRent(st, p, id, st.rentFor(id, s));
}

/**
 * Phân bố tiền phải trả trong lượt tới của chính `p`.
 * @returns {{mean:number, q:(f:number)=>number, worst:number}}
 *   `q(0.85)` = số tiền đủ trả trong 85% số trường hợp
 */
export function payOutlook(st, p) {
  const rows = [];
  for (const [id, e] of nextLanding(p.pos, p.inJail)) {
    for (const [s, w] of e.sums) rows.push({ c: costAt(st, p, id, s), w });
  }
  const mean = rows.reduce((n, r) => n + r.c * r.w, 0);
  const sorted = rows.filter((r) => r.c > 0).sort((a, b) => a.c - b.c);
  const free = 1 - sorted.reduce((n, r) => n + r.w, 0);
  const q = (f) => {
    let acc = Math.max(0, free);
    if (acc >= f) return 0;
    for (const r of sorted) { acc += r.w; if (acc >= f) return r.c; }
    return sorted.length ? sorted[sorted.length - 1].c : 0;
  };
  return { mean, q, worst: sorted.length ? sorted[sorted.length - 1].c : 0 };
}

/** Xác suất ít nhất một đối thủ của `seat` dừng ở ô `id` trong lượt tới của họ. */
export function hitChance(st, id, seat) {
  let miss = 1;
  for (const q of st.players) {
    if (q.bankrupt || q.id === seat) continue;
    const e = nextLanding(q.pos, q.inJail).get(id);
    if (e) miss *= 1 - Math.min(1, e.p);
  }
  return 1 - miss;
}
