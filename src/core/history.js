/**
 * Sổ tiền của ván — ghi lại tiền từng người sau mỗi lượt và các khoản tiền
 * thuê, để cuối ván vẽ biểu đồ thống kê (`ui/statsModal.js`).
 *
 * Luật không đọc sổ này: thêm bớt một con số ở đây không đổi kết quả ván.
 * Sổ nằm trong `GameState.hist` và đi theo ảnh chụp (`serialize.js`): máy cầm
 * lái ghi, máy khác nhận nguyên sổ, nên biểu đồ ở máy nào cũng như nhau.
 * Thuần dữ liệu, chạy được dưới Node.
 */

/**
 * Sổ giữ nhiều nhất chừng này mốc. Sổ đi theo mọi ảnh chụp phát qua mạng, nên
 * ván dài phải co lại: vượt trần thì bỏ một mốc cũ cách một mốc. Trục ngang
 * của biểu đồ đọc `k` chứ không đọc thứ tự mốc, nên co rồi vẫn đúng tỉ lệ.
 */
export const HIST_MAX = 240;

/** Sổ trắng cho `n` ghế. */
export function blankHistory(n) {
  return {
    /**
     * Mốc tiền cả bàn: `{ k, r, w: [..], m: [..] }` — `k` số lượt đã xong,
     * `r` vòng, `w` tổng tài sản, `m` tiền mặt. Người đã phá sản ghi `null`
     * để đường của họ dừng đúng chỗ ngã.
     */
    pts: [],
    /** Tiền thuê đất theo ghế: đã trả, đã thu, cú trả đắt nhất và ô của nó. */
    rent: Array.from({ length: n }, () => ({ paid: 0, got: 0, max: 0, maxTile: null })),
  };
}

/** Sổ của ván, dựng bù nếu ảnh chụp cũ chưa có. */
function book(st) {
  if (!st.hist) st.hist = blankHistory(st.players.length);
  return st.hist;
}

/**
 * Ghi tiền cả bàn ở thời điểm này. `nextTurn` gọi sau mỗi lượt, lúc hết ván
 * gọi thêm một lần cho lượt cuối đang dở (`done = turnNo + 1`). Gọi lại với
 * cùng `done` thì ghi đè chứ không thêm dòng.
 */
export function sampleMoney(st, done = st.turnNo ?? 0) {
  const w = st.players.map((p) => (p.bankrupt ? null : st.netWorth(p.id)));
  const m = st.players.map((p) => (p.bankrupt ? null : p.money));
  const h = book(st);
  const last = h.pts[h.pts.length - 1];
  if (last && last.k === done) Object.assign(last, { r: st.round, w, m });
  else h.pts.push({ k: done, r: st.round, w, m });
  if (h.pts.length > HIST_MAX) {
    h.pts = h.pts.filter((_, i) => i % 2 === 0 || i === h.pts.length - 1);
  }
}

/** Một khoản tiền thuê đất đã trả xong. */
export function noteRent(st, from, to, amount, tileId) {
  const r = book(st).rent;
  if (!r[from] || !r[to] || !(amount > 0)) return;
  r[from].paid += amount;
  r[to].got += amount;
  if (amount > r[from].max) { r[from].max = amount; r[from].maxTile = tileId; }
}

/**
 * Đọc sổ thành chuỗi cho biểu đồ: mỗi người một chuỗi, kèm đỉnh, đáy, người
 * dẫn đầu từng mốc và số lần đổi ngôi.
 *
 * @param {'w'|'m'} key `w` tổng tài sản, `m` tiền mặt.
 */
export function moneySeries(st, key = 'w') {
  const rows = book(st).pts;
  const pts = rows.map((row) => ({ k: row.k, r: row.r }));
  const series = st.players.map((_, s) => rows.map((row) => row[key][s] ?? null));
  const extreme = (pick) => series.map((vals) => {
    let at = -1;
    vals.forEach((v, i) => { if (v != null && (at < 0 || pick(v, vals[at]))) at = i; });
    return at < 0 ? null : { i: at, v: vals[at], r: pts[at].r };
  });
  /* Người dẫn đầu luôn tính theo tổng tài sản, kể cả khi đang xem tiền mặt:
     ôm nhiều tiền mặt nhất mà không có đất thì chưa phải người đang thắng. */
  const lead = rows.map((row) => {
    let best = -1;
    row.w.forEach((v, s) => { if (v != null && (best < 0 || v > row.w[best])) best = s; });
    return best;
  });
  let swaps = 0;
  for (let i = 1; i < lead.length; i++) if (lead[i] !== lead[i - 1]) swaps += 1;
  const leadCount = st.players.map((_, s) => lead.filter((x) => x === s).length);
  return {
    pts, series, lead, swaps, leadCount,
    peak: extreme((a, b) => a > b),
    low: extreme((a, b) => a < b),
  };
}
