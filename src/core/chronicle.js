/**
 * Biên niên ván — sổ ghi những chuyện **đã xảy ra**, không phải luật chơi.
 *
 * Luật không đọc sổ này ở đâu cả: nó chỉ để kể lại ván. Bình luận viên đọc nó
 * để biết ai đang là oan gia của ai, màn hạ màn đọc nó để trao danh hiệu và vẽ
 * đường tài sản. Vì vậy thêm bớt một con số ở đây không bao giờ làm lệch cán
 * cân kỹ năng — kỹ năng chỉ nhìn tiền, đất, nhà trong `GameState`.
 *
 * Sổ nằm trong `GameState.chron` và đi theo ảnh chụp: máy cầm lái ghi, máy
 * khác nhận nguyên sổ, nên bảng danh hiệu cuối ván ở máy nào cũng như nhau.
 * Thuần dữ liệu, không đụng DOM — chạy được dưới Node trong bài kiểm thử.
 */

/**
 * Hai người trả qua trả lại cho nhau từ chừng này trở lên mới thành oan gia.
 * Thấp quá thì vòng đầu ai cũng là oan gia của ai, chẳng còn gì đáng kể.
 */
export const RIVAL_MIN = 500;

/** Một khoản thuê từ chừng này trở lên là "cú đau" — đáng quay chậm, đáng bình luận. */
export const BIG_RENT = 400;

/** Sổ trắng cho `n` ghế. */
export function blankChronicle(n) {
  return {
    /** `pay[a][b]`: tổng tiền ghế a đã trả **thẳng** cho ghế b (thuê, thẻ, kỹ năng…). */
    pay: Array.from({ length: n }, () => Array(n).fill(0)),
    /** Tiền thuê đất riêng: đã trả, đã thu, và cú trả đắt nhất. */
    rent: Array.from({ length: n }, () => ({ paid: 0, got: 0, max: 0, maxTile: null })),
    /** Đếm việc lặt vặt theo ghế: mua đất, xây, cầm cố, giao dịch, đổ đôi… */
    tally: Array.from({ length: n }, () => ({})),
    /** Tổng tài sản từng người ở đầu mỗi vòng: `{ r, w: [..] }`. */
    worth: [],
  };
}

/** Sổ của ván, dựng bù nếu ảnh chụp cũ chưa có. */
function book(st) {
  if (!st.chron) st.chron = blankChronicle(st.players.length);
  return st.chron;
}

/** Cộng một việc vào sổ của ghế. */
export function bump(st, seat, key, n = 1) {
  const t = book(st).tally[seat];
  if (t) t[key] = (t[key] ?? 0) + n;
}

/** Một khoản người trả người — mọi đường, không riêng tiền thuê. */
export function notePay(st, from, to, amount) {
  const row = book(st).pay[from];
  if (row && to in row && amount > 0) row[to] += amount;
}

/** Một khoản tiền thuê đất. */
export function noteRent(st, from, to, amount, tileId) {
  const r = book(st).rent;
  if (!r[from] || !r[to] || amount <= 0) return;
  r[from].paid += amount;
  r[to].got += amount;
  if (amount > r[from].max) { r[from].max = amount; r[from].maxTile = tileId; }
}

/**
 * Ghi tổng tài sản cả bàn ở thời điểm này. Gọi đầu mỗi vòng và lúc hạ màn;
 * cùng một vòng gọi lại thì ghi đè chứ không thêm dòng.
 */
export function sampleWorth(st) {
  const w = st.players.map((p) => (p.bankrupt ? 0 : st.netWorth(p.id)));
  const list = book(st).worth;
  const last = list[list.length - 1];
  if (last && last.r === st.round) last.w = w;
  else list.push({ r: st.round, w });
}

/**
 * Cặp oan gia: hai người tiền qua tay nhau nhiều nhất, tính cả hai chiều.
 * `null` khi chưa cặp nào vượt `RIVAL_MIN`.
 *
 * @param {object} [o] `alive`: chỉ xét người còn trụ — thanh bên chỉ treo
 *   băng rôn cho người đang chơi, còn bảng hạ màn kể cả người đã phá sản.
 * @returns {?{a:number, b:number, total:number}}
 */
export function rivalOf(st, o = {}) {
  const pay = book(st).pay;
  let best = null;
  for (let a = 0; a < pay.length; a++) {
    for (let b = a + 1; b < pay.length; b++) {
      if (o.alive && (st.players[a].bankrupt || st.players[b].bankrupt)) continue;
      const total = pay[a][b] + pay[b][a];
      if (total >= RIVAL_MIN && (!best || total > best.total)) best = { a, b, total };
    }
  }
  return best;
}

/**
 * Cặp mới phải vượt cặp đang giữ danh oan gia chừng này lần mới được thế chỗ.
 * Không có ngưỡng thì hai cặp sát nút nhau cứ thay phiên đứng đầu, mỗi lần đổi
 * lại xướng tên một lần — bàn cờ thành phim truyền hình nhiều tập.
 */
export const RIVAL_SWAP = 1.25;

/** Tổng tiền qua lại giữa hai ghế. */
const pairTotal = (st, a, b) => book(st).pay[a][b] + book(st).pay[b][a];

/**
 * Cặp oan gia **đang giữ danh** (đã được xướng tên, cả hai còn trụ), hoặc
 * `null`. Thanh bên và bình luận viên đọc cặp này chứ không đọc thẳng
 * `rivalOf`, để băng rôn không nhảy qua nhảy lại giữa hai cặp sát nút.
 */
export function currentRival(st) {
  const key = book(st).rival;
  if (!key) return null;
  const [a, b] = key.split('-').map(Number);
  if (!st.players[a] || !st.players[b] || st.players[a].bankrupt || st.players[b].bankrupt) return null;
  return { a, b, total: pairTotal(st, a, b) };
}

/**
 * Cặp oan gia vừa **đổi** chưa: ghi cặp mới vào sổ và trả nó về, `null` là
 * vẫn cặp cũ (hoặc chưa có cặp nào). Ghi trong sổ chứ không ở controller vì
 * máy cầm lái đổi theo lượt — máy nào cầm lái cũng phải biết cặp này đã được
 * xướng tên rồi.
 */
export function checkRival(st) {
  const best = rivalOf(st, { alive: true });
  if (!best) return null;
  const cur = currentRival(st);
  if (cur && (cur.a === best.a && cur.b === best.b)) return null;
  if (cur && best.total < cur.total * RIVAL_SWAP) return null;
  book(st).rival = `${best.a}-${best.b}`;
  return best;
}

/** Người kia trong cặp oan gia của `seat`, hoặc `null`. */
export function rivalFor(st, seat) {
  const r = currentRival(st);
  if (!r) return null;
  if (r.a === seat) return r.b;
  if (r.b === seat) return r.a;
  return null;
}

/* ==================================================================
   Danh hiệu cuối ván
   ================================================================== */

/**
 * Danh hiệu nào cũng là "nhiều nhất bàn" theo một con số. Hoà nhau thì không
 * trao — danh hiệu chia đôi đọc lên chẳng còn buồn cười.
 */
function topOf(values, min = 1) {
  let best = -1, val = -Infinity, tie = false;
  values.forEach((v, i) => {
    if (v > val) { best = i; val = v; tie = false; } else if (v === val) tie = true;
  });
  return best >= 0 && !tie && val >= min ? { seat: best, value: val } : null;
}

/**
 * Bảng danh hiệu hài hước, mỗi danh hiệu kèm con số thật.
 *
 * @returns {Array<{id:string, icon:string, title:string, seat:number, seats?:number[], note:string}>}
 */
export function awards(st) {
  const c = book(st);
  const n = st.players.length;
  const tally = (key) => Array.from({ length: n }, (_, i) => c.tally[i]?.[key] ?? 0);
  const money = (v) => `${Math.round(v).toLocaleString('vi-VN')}$`;
  const out = [];
  const add = (id, icon, title, hit, note) => { if (hit) out.push({ id, icon, title, seat: hit.seat, note: note(hit.value) }); };

  add('generous', '💸', 'Mạnh Thường Quân', topOf(c.rent.map((r) => r.paid), 200),
    (v) => `trả ${money(v)} tiền thuê cho thiên hạ`);
  add('landlord', '🏯', 'Địa Chủ Thu Tô', topOf(c.rent.map((r) => r.got), 200),
    (v) => `thu ${money(v)} tiền thuê`);
  const hurt = topOf(c.rent.map((r) => r.max), BIG_RENT);
  add('ouch', '🎯', 'Thánh Đen', hurt, (v) => `một cú trả ${money(v)}`);
  add('jail', '🚔', 'Hộ Khẩu Chí Hoà', topOf(st.players.map((p) => p.jails ?? 0), 2),
    (v) => `vào tù ${v} lần`);
  add('debtor', '🏚️', 'Con Nợ Chuyên Nghiệp', topOf(tally('morts'), 2),
    (v) => `cầm cố ${v} lần`);
  add('dealer', '🤝', 'Thương Lái Chợ Lớn', topOf(tally('trades'), 2),
    (v) => `chốt ${v} giao dịch`);
  add('buyer', '🛒', 'Tay Chơi Bất Động Sản', topOf(tally('buys'), 4),
    (v) => `tậu ${v} ô`);
  add('builder', '🏗️', 'Thợ Xây Không Ngủ', topOf(tally('builds'), 4),
    (v) => `cất ${v} căn`);
  add('doubles', '🎲', 'Vua Đổ Đôi', topOf(tally('doubles'), 3),
    (v) => `đổ đôi ${v} lần`);

  /* Rơi tự do và lội ngược dòng đọc trên đường tài sản: đỉnh cao nhất trừ
     chỗ đứng cuối, và đáy thấp nhất tới chỗ đứng cuối. */
  if (c.worth.length >= 3) {
    const series = (i) => c.worth.map((row) => row.w[i] ?? 0);
    const last = (i) => { const s = series(i); return s[s.length - 1]; };
    add('fall', '📉', 'Rơi Tự Do', topOf(st.players.map((_, i) => Math.max(...series(i)) - last(i)), 800),
      (v) => `mất ${money(v)} từ lúc đỉnh cao`);
    add('comeback', '🚀', 'Lội Ngược Dòng', topOf(st.players.map((p, i) => (p.bankrupt ? 0 : last(i) - Math.min(...series(i)))), 800),
      (v) => `bò lên ${money(v)} từ đáy`);
  }

  // Thiền Sư: người duy nhất cả ván không giao dịch lần nào, giữa một bàn có buôn bán
  const trades = tally('trades');
  const idle = trades.map((t, i) => (t === 0 ? i : -1)).filter((i) => i >= 0);
  if (idle.length === 1 && trades.some((t) => t > 0)) {
    out.push({ id: 'monk', icon: '🧘', title: 'Thiền Sư', seat: idle[0], note: 'không đổi chác với ai một lần nào' });
  }

  const rv = rivalOf(st);
  if (rv) {
    out.push({
      id: 'rival', icon: '⚔️', title: 'Oan Gia Ngõ Hẹp', seat: rv.a, seats: [rv.a, rv.b],
      note: `${money(rv.total)} qua lại giữa hai người`,
    });
  }
  return out;
}
