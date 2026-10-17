/**
 * Đề nghị giao dịch: soát lại gói gửi từ máy người chơi, và diễn giải thành chữ.
 *
 * Gói dựng ở máy người đang đi (`ui/modals.js` · `tradeBuildModal`) rồi gửi
 * nguyên tới engine. Máy khách có thể gửi bất cứ gì, nên engine dựng lại một
 * gói sạch từ đúng những trường cần, soát từng món theo luật hiện hành của
 * bàn, và chỉ dùng gói sạch ấy.
 */
import { BOARD, money, tileLabel } from '../data/board.js';

const isId = (id) => Number.isInteger(id) && !!BOARD[id]?.ownable;
const cash = (n) => (Number.isFinite(Number(n)) ? Math.max(0, Math.floor(Number(n))) : -1);

/**
 * Gói đề nghị hợp lệ lúc này, hoặc `null`.
 *
 * Luật giống hộp dựng đề nghị: chỉ đổi đất của chính mỗi bên, ô có nhà thì
 * không đổi được (bán hết nhà trước), tiền không quá số đang có, và phải có
 * ít nhất một món.
 */
export function validOffer(st, fromId, raw) {
  if (!raw || typeof raw !== 'object') return null;
  const to = Number(raw.to);
  const A = st.players[fromId];
  const B = st.players[to];
  if (!A || !B || A.bankrupt || B.bankrupt || to === fromId) return null;
  const give = [...new Set((Array.isArray(raw.give) ? raw.give : []).map(Number))];
  const get = [...new Set((Array.isArray(raw.get) ? raw.get : []).map(Number))];
  const giveMoney = cash(raw.giveMoney ?? 0);
  const getMoney = cash(raw.getMoney ?? 0);
  if (giveMoney < 0 || getMoney < 0) return null;
  const ok = (ids, seat) => ids.every((id) => isId(id) && st.owner.get(id) === seat && st.housesOn(id) === 0);
  if (!ok(give, fromId) || !ok(get, to)) return null;
  if (giveMoney > A.money || getMoney > B.money) return null;
  if (!give.length && !get.length && !giveMoney && !getMoney) return null;
  return { from: fromId, to, give, get, giveMoney, getMoney };
}

/** Một vế của đề nghị thành chữ. */
export function describeSide(st, ids, amount) {
  const parts = [];
  if (amount > 0) parts.push(`<b>${money(amount)}</b>`);
  for (const id of ids) {
    const tag = st.isMortgaged(id) ? ' <i style="opacity:.7;font-size:.85em">(thế chấp)</i>' : '';
    parts.push(`<b>${tileLabel(id)}</b>${tag}`);
  }
  return parts.length ? parts.join(' · ') : '<span class="none">không có gì</span>';
}

/**
 * Hai vế của đề nghị, mỗi vế một dòng. `done` là đã chốt: đọc theo phía
 * nhận ("A nhận…") thay vì phía đưa.
 */
export function describeOffer(st, offer, done = false) {
  const A = st.players[offer.from];
  const B = st.players[offer.to];
  const a = `<b style="color:${A.token.css}">${A.name}</b>`;
  const b = `<b style="color:${B.token.css}">${B.name}</b>`;
  if (done) {
    return `${a} nhận: ${describeSide(st, offer.get, offer.getMoney)}
      <br>${b} nhận: ${describeSide(st, offer.give, offer.giveMoney)}`;
  }
  return `${a} đưa: ${describeSide(st, offer.give, offer.giveMoney)}
    <br>${b} đưa: ${describeSide(st, offer.get, offer.getMoney)}`;
}
