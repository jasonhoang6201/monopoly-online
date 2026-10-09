/**
 * Gợi ý xoay tiền cho người đang thiếu nợ: nên cầm ô nào, bán nhà ở đâu.
 *
 * Chỉ là gợi ý — chạy trên bản sao ván, không đụng ván thật. Bảng quản lý tài
 * sản đọc kết quả để làm sáng đúng mấy thẻ cần bấm.
 *
 * Thứ tự ưu tiên giữ đúng như `autoRaise` (core/events.js): thế chấp đất trước,
 * hết đất cầm được mới bán nhà, vì nhà bán ra chỉ được nửa giá xây còn đất
 * thế chấp thì chuộc lại được. Khác `autoRaise` ở chỗ chọn **tổ hợp** ô: lấy
 * tập ô có tổng tiền thế chấp vừa chạm khoản thiếu, dư ít nhất, chứ không cầm
 * lần lượt từ ô rẻ nhất — cầm ba ô rẻ trong khi một ô vừa đủ là mất thêm hai
 * ô đang thu tiền thuê.
 *
 * Trong đất cầm được lại chia hai tầng: đất lẻ trước, bến ga và thuỷ điện sau.
 * Bến ga thu tiền thuê theo số bến cùng chủ, một bến đã ăn hơn đất lẻ thường;
 * cầm một bến còn làm tụt giá thuê của mấy bến còn lại. Nên chỉ khi cầm hết
 * đất lẻ vẫn thiếu mới tính tới hai loại này.
 */

import { BOARD } from '../data/board.js';
import { snapshot, fromSnapshot } from './serialize.js';

/**
 * Tập con có tổng ≥ `need` mà tổng nhỏ nhất; bằng tổng thì ít phần tử hơn.
 * Trả `null` khi gộp hết vẫn không đủ.
 *
 * Quy hoạch động 0/1 trên tổng tiền, chặn trần ở `need + max(v)`: tập nào đã
 * vượt mức đó thì bỏ bớt một ô vẫn còn đủ, nên không bao giờ là tập tốt nhất.
 *
 * @param {{id:number, v:number}[]} items
 * @param {number} need
 * @returns {number[]|null}
 */
export function cheapestCover(items, need) {
  if (need <= 0) return [];
  const total = items.reduce((s, it) => s + it.v, 0);
  if (total < need) return null;

  const cap = need + Math.max(...items.map((it) => it.v));
  /** best[s] = danh sách id ít phần tử nhất có tổng đúng bằng s */
  const best = new Array(cap + 1).fill(null);
  best[0] = [];
  for (const it of items) {
    for (let s = cap; s >= it.v; s--) {
      const from = best[s - it.v];
      if (!from) continue;
      if (!best[s] || best[s].length > from.length + 1) best[s] = [...from, it.id];
    }
  }
  for (let s = need; s <= cap; s++) if (best[s]) return best[s];
  return null;
}

/**
 * @param {import('./state.js').GameState} st
 * @param {number} seat
 * @param {number} need số tiền mặt cần có trong túi
 * @returns {{
 *   steps: {act:'mortgage'|'sell', id:number, gain:number}[],
 *   gain: number, short: number, ok: boolean,
 * }} `short` là khoản thiếu lúc tính, `gain` tổng tiền các bước gợi ý mang về
 */
export function raisePlan(st, seat, need) {
  const short = need - st.players[seat].money;
  if (short <= 0) return { steps: [], gain: 0, short: 0, ok: true };

  const sim = fromSnapshot(snapshot(st));
  const p = sim.players[seat];
  const steps = [];

  /* Cầm đất: đủ thì lấy tổ hợp vừa khít, không đủ thì cầm hết số đang cầm
     được rồi để vòng bán nhà lo phần còn lại. */
  const pawnLand = () => {
    const left = need - p.money;
    if (left <= 0) return;
    const free = sim.propertiesOf(seat)
      .filter((id) => sim.canMortgage(seat, id).ok)
      .map((id) => ({ id, v: BOARD[id].mortgage }));
    const lots = free.filter((it) => BOARD[it.id].type === 'property');
    const rest = free.filter((it) => BOARD[it.id].type !== 'property');
    const lotsSum = lots.reduce((s, it) => s + it.v, 0);
    /* Đất lẻ đủ thì chỉ chọn trong đất lẻ; không đủ thì cầm hết đất lẻ, phần
       còn thiếu mới chọn tổ hợp bến ga / thuỷ điện. */
    const pick = lotsSum >= left
      ? cheapestCover(lots, left)
      : [...lots.map((it) => it.id),
        ...(cheapestCover(rest, left - lotsSum) ?? rest.map((it) => it.id))];
    for (const id of pick) {
      const res = sim.mortgage(seat, id);
      if (res.ok) steps.push({ act: 'mortgage', id, gain: res.amount });
    }
  };

  pawnLand();
  while (p.money < need) {
    /* Luật bán đều tay: ô cao nhất trong bộ phải hạ trước, nên chỉ những ô
       đang cao nhất mới qua được `canSellHouse`. Trong số đó lấy ô hoàn tiền
       nhiều nhất cho ít bước nhất. */
    const built = sim.propertiesOf(seat)
      .map((id) => ({ id, r: sim.canSellHouse(seat, id) }))
      .filter((x) => x.r.ok)
      .sort((a, b) => b.r.refund - a.r.refund || a.id - b.id);
    if (built.length === 0) break;
    const { id } = built[0];
    const before = p.money;
    if (!sim.sellHouse(seat, id).ok) break;
    steps.push({ act: 'sell', id, gain: p.money - before });
    // Bán sạch nhà trong bộ thì đất trong bộ lại cầm được
    pawnLand();
  }

  const gain = steps.reduce((s, x) => s + x.gain, 0);
  return { steps, gain, short, ok: p.money >= need };
}
