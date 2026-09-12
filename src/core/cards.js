/**
 * Luật của bộ thẻ CƠ HỘI / KHÍ VẬN — phần thuần dữ liệu.
 *
 * Tách khỏi `data/cards.js` (chỉ có lời văn và con số) và khỏi
 * `game/controller.js` (phần diễn: bày thẻ, hỏi người chơi, cho tiền bay).
 * Module này chạy được dưới Node nên bài kiểm thử soi được luật mà không cần
 * dựng bàn cờ.
 *
 * Hai câu hỏi mà nó trả lời:
 *   1. Thẻ này lúc này có nghĩa lý gì không (`usableCard`) — rút trúng "cướp
 *      đất" khi cả bàn chưa ai có đất thì bày ra chỉ tổ hụt hẫng.
 *   2. Người rút được nhắm vào những ô nào (`cardTargets`).
 */
import { BOARD, GROUPS, GROUP_TILES } from '../data/board.js';
import { KEEPABLE, cardOf } from '../data/cards.js';

/** Tiền đền khi cưỡng chế mua đất: giá gốc cộng thêm 25%. */
export const SEIZE_RATE = 1.25;

/** Loại thẻ, mặc định là cộng/trừ tiền với ngân hàng. */
export function cardType(card) { return card.type ?? 'bank'; }

/** Thẻ này cất túi dùng sau, hay nổ ngay lúc rút? */
export function isKeepable(card) { return KEEPABLE.has(cardType(card)); }

/** Số cấp nhà một thẻ dỡ nhà lấy đi. */
export function demolishLevels(card) { return Math.max(1, card.levels ?? 1); }

/** Những người còn sống ngoài người rút — chỗ để chia tiền mừng. */
export function othersOf(st, seat) {
  return st.alive().filter((p) => p.id !== seat).map((p) => p.id);
}

/**
 * Tiền mừng chia đều: mỗi người còn lại góp bấy nhiêu.
 *
 * Chia theo **tổng** ghi trên thẻ chứ không phải mỗi người một khoản cố định:
 * con số trên mặt thẻ đã cân theo mặt bằng giá của ván, bàn hai người hay bàn
 * sáu người thì người rút cũng nhận đúng chừng ấy. Làm tròn lên để bàn lẻ
 * người không hụt mất vài đồng.
 */
export function shareEach(st, seat, amount) {
  const others = othersOf(st, seat);
  return others.length ? Math.ceil(amount / others.length) : 0;
}

/** Hoá đơn thuế nhà cửa của một người: đếm nhà, đếm khách sạn rồi nhân đơn giá. */
export function repairBill(st, seat, card) {
  const props = st.propertiesOf(seat);
  const houses = props.reduce((n, id) => n + (st.housesOn(id) === 5 ? 0 : st.housesOn(id)), 0);
  const hotels = props.filter((id) => st.housesOn(id) === 5).length;
  return {
    houses, hotels,
    amount: houses * (card.perHouse ?? 0) + hotels * (card.perHotel ?? 0),
  };
}

/**
 * Những ô người rút được nhắm tới, theo từng loại thẻ.
 *
 * Luật chung cho cả ba thẻ đụng nhà đất: **chỉ nhắm được vào người khác**, và
 * không đụng tới ô đang thế chấp — ô ấy đã nằm trong tay ngân hàng rồi, giành
 * nhau làm gì.
 */
export function cardTargets(st, card, seat) {
  const foreign = [...st.owner.entries()]
    .filter(([id, owner]) => owner !== seat && !st.players[owner].bankrupt && !st.isMortgaged(id))
    .map(([id]) => id);

  switch (cardType(card)) {
    // Có nhà mới dỡ được
    case 'demolish':
      return foreign.filter((id) => st.housesOn(id) > 0).sort((a, b) => a - b);

    /* Cưỡng chế mua: chỉ lô đất trống (nhà cửa không sang tên theo, y như luật
       giao dịch), và chỉ lô mà người rút **trả nổi tiền đền** bằng tiền mặt —
       thẻ may mắn mà đẩy chính người rút tới chỗ phá sản thì hỏng. */
    case 'seize':
      return foreign
        .filter((id) => st.housesOn(id) === 0 && st.players[seat].money >= seizePrice(id))
        .sort((a, b) => a - b);

    /* Giải toả nhắm được vào **mọi** lô đang có chủ, kể cả đất của chính người
       rút: lãnh tiền đền rồi mua rẻ lại chính lô ấy cũng là một nước cờ, mà
       thò tay vào khu người khác đang gom cũng là một nước cờ khác. */
    case 'resume':
    case 'resume-random':
      return [...st.owner.entries()]
        .filter(([id, owner]) => !st.players[owner].bankrupt
          && !st.isMortgaged(id) && st.housesOn(id) === 0)
        .map(([id]) => id)
        .sort((a, b) => a - b);

    default:
      return [];
  }
}

/**
 * Những **khu màu** thẻ dỡ nhà nhắm được: khu nào có ít nhất một ô của người
 * khác đang có nhà.
 *
 * Người dùng thẻ chỉ chọn tới mức khu, còn ô nào lãnh đủ thì bàn cờ bốc thăm.
 * Cho chọn thẳng một ô thì lần nào thẻ cũng rơi đúng lô đắt nhất của người dẫn
 * đầu — đoán trước được thì hết còn là rủi ro. Chọn khu rồi bốc thăm thì vẫn
 * nhắm được vào ai, nhưng trúng ô nào là chuyện hên xui, và người bị dỡ có cớ
 * để rải nhà ra nhiều ô thay vì dồn hết vào một lô.
 *
 * @returns {string[]} khoá khu màu, theo đúng thứ tự trong `GROUPS`
 */
export function demolishGroups(st, card, seat) {
  const ids = new Set(cardTargets(st, card, seat));
  return Object.keys(GROUPS).filter((g) => GROUP_TILES[g].some((id) => ids.has(id)));
}

/**
 * Bốc thăm xem trong khu ấy ô nào bị dỡ, mỗi ô mấy cấp.
 *
 * Thẻ dỡ 2 nhà rải vào **hai ô khác nhau** khi khu còn đủ ô có nhà — dỡ hai
 * cấp cùng một ô thì gần như san phẳng một lô, mà thẻ này sinh ra để chặn đà
 * xây chứ không phải để xoá sổ. Khu chỉ còn một ô có nhà thì ô ấy chịu cả hai
 * cấp, vì không còn chỗ nào khác để rải.
 *
 * @param {?()=>number} rand nguồn ngẫu nhiên — máy cầm lái gieo đúng một lần
 * @returns {{candidates:number[], hits:Array<{id:number, levels:number}>}}
 */
export function demolishPicks(st, card, seat, group, rand = Math.random) {
  const ids = new Set(cardTargets(st, card, seat));
  const candidates = GROUP_TILES[group].filter((id) => ids.has(id));
  const want = demolishLevels(card);
  const hits = [];
  const pool = [...candidates];

  for (let left = want; left > 0 && pool.length; left--) {
    const at = Math.floor(rand() * pool.length);
    const [id] = pool.splice(at, 1);
    hits.push({ id, levels: 1 });
  }
  // Hết ô để rải: dồn số cấp còn thiếu vào ô đã bốc, nhiều nhất là số nhà đang có
  if (hits.length && hits.length < want) {
    const extra = want - hits.length;
    hits[hits.length - 1].levels = Math.min(1 + extra, st.housesOn(hits[hits.length - 1].id));
  }
  return { candidates, hits };
}

/** Tiền đền giải toả — giá gốc cộng thêm phần thiệt hại (mặc định +20%). */
export function resumePrice(tileId, card) {
  return Math.round(BOARD[tileId].price * (card.rate ?? 1.2));
}

/**
 * Tiền đền khi cưỡng chế mua — giá gốc +25%.
 *
 * Trước đây chỉ trả đúng giá thế chấp (nửa giá gốc), nên tấm thẻ này gần như
 * là cướp không: người bị lấy đất mất cả lô lẫn nửa số vốn đã bỏ ra. Trả trên
 * giá gốc thì đổi chủ vẫn ép được, nhưng người dùng thẻ phải gom đủ tiền mặt,
 * và người mất đất cầm về nhiều hơn tiền họ đã mua.
 */
export function seizePrice(tileId) {
  return Math.round(BOARD[tileId].price * SEIZE_RATE);
}

/**
 * Rút lá này lên lúc này có nghĩa lý gì không.
 *
 * Chỉ xét mấy thẻ **nổ ngay**: thuế nhà khi chưa cất căn nào, tiền mừng khi
 * còn một mình — bày ra chỉ tổ hụt hẫng, nên `Deck.draw` bỏ qua và bốc lá
 * khác. Thẻ giữ túi thì lúc nào rút cũng được: chưa có mục tiêu thì cất đó
 * chờ, đúng như cách chơi của chúng.
 */
export function usableCard(st, card, seat) {
  switch (cardType(card)) {
    case 'collect':
      return othersOf(st, seat).length > 0;
    case 'repair':
      return repairBill(st, seat, card).amount > 0;
    default:
      return true;
  }
}

/**
 * Tấm thẻ trong túi lúc này lôi ra dùng được chưa — bảng túi thẻ in lý do
 * ngay dưới tên thẻ, để người chơi biết mình đang chờ điều gì.
 *
 * @returns {{ok:boolean, reason?:string}}
 */
export function useReason(st, card, seat) {
  const noTarget = (reason) => (cardTargets(st, card, seat).length > 0
    ? { ok: true } : { ok: false, reason });

  switch (cardType(card)) {
    case 'jail-free':
      return st.players[seat].inJail
        ? { ok: true }
        : { ok: false, reason: 'Chỉ chìa ra được khi đang ngồi Khám Lớn.' };
    case 'demolish':
      return noTarget('Chưa có khu nào của người khác có nhà để dỡ.');
    case 'seize':
      return noTarget('Không có lô đất trống nào bạn đủ tiền mặt trả giá gốc +25%.');
    case 'resume':
    case 'resume-random':
      return noTarget('Trên bàn chưa có lô đất trống nào có chủ.');
    default:
      return { ok: true };
  }
}

/** Danh sách thẻ trong túi kèm tình trạng dùng được — dựng bảng túi thẻ. */
export function inventoryOf(st, seat) {
  return st.players[seat].cards.map((ref, i) => {
    const card = cardOf(ref);
    return { i, ref, card, ...useReason(st, card, seat) };
  });
}
