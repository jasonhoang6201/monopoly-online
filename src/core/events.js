/**
 * Luật của bộ thẻ THỜI CUỘC — thanh áp lực, cách rút thẻ, và **kế hoạch** của
 * mỗi sự kiện.
 *
 * Module này thuần dữ liệu như `state.js`: không đụng DOM, không đụng Phaser,
 * chạy được dưới Node trong bài kiểm thử. Phần diễn (hộp thoại, hoạt cảnh, hỏi
 * người chơi) nằm ở `game/controller.js`.
 *
 * ── Vì sao tách "kế hoạch" ra khỏi "thi hành" ───────────────────────────────
 * Một sự kiện như động đất phải chọn ngẫu nhiên một khu, rồi mới hỏi từng chủ
 * đất có bỏ tiền chống đỡ không. Bản online chỉ có **một máy cầm lái** được
 * phép gieo ngẫu nhiên; máy ấy lập kế hoạch trước (`planEvent`), đem đi hỏi,
 * rồi mới ra tay. Nhờ vậy mọi máy còn lại chỉ việc nhận ảnh chụp — không máy
 * nào tự gieo lại một con số khác.
 */
import { BOARD, GROUP_TILES, GROUPS } from '../data/board.js';
import {
  EVENTS, EVENT_LEVELS, UNLOCK_LAPS, PRESSURE,
} from '../data/events.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ==================================================================
   Thanh áp lực
   ================================================================== */

/** Nấc sự kiện của ván này (null khi tắt hoặc ván cũ chưa có cài đặt). */
export function levelOf(st) {
  const lv = EVENT_LEVELS[st.settings?.events];
  return lv && lv.key !== 'off' ? lv : null;
}

export function eventsOn(st) { return levelOf(st) !== null; }

/**
 * Bàn đã "bão hoà" chưa — nổ sự kiện lúc đất còn ế là phá ván, vì người chơi
 * chưa kịp có gì để mất. Bàn ế đất mãi (ít người, ai cũng dè dặt) thì mốc số
 * vòng đi mở khoá thay.
 */
export function unlocked(st) {
  const lv = levelOf(st);
  if (!lv) return false;
  const ownable = BOARD.filter((t) => t.ownable);
  const sold = ownable.filter((t) => st.owner.has(t.id)).length;
  return sold / ownable.length >= lv.saturation || st.laps >= UNLOCK_LAPS;
}

/** Ngưỡng của lần nổ kế tiếp — càng về sau càng thấp, tức càng dày. */
export function threshold(st) {
  const lv = levelOf(st);
  if (!lv) return Infinity;
  return Math.max(lv.floor, lv.base - lv.step * st.eventsFired);
}

/** Cộng áp lực. Chưa mở khoá thì đếm vòng đi thôi, chưa tích gì cả. */
export function addPressure(st, points) {
  if (!eventsOn(st) || !unlocked(st)) return;
  st.pressure += points;
}

/** Đã tới lúc nổ chưa. */
export function eventDue(st) {
  return eventsOn(st) && unlocked(st) && !st.over && st.pressure >= threshold(st);
}

/** Phần trăm đầy của thanh — HUD vẽ theo con số này. */
export function pressureRatio(st) {
  if (!eventsOn(st)) return 0;
  if (!unlocked(st)) return 0;
  return Math.max(0, Math.min(1, st.pressure / threshold(st)));
}

/* ==================================================================
   Rút thẻ
   ================================================================== */

/** Kỳ nào đang mở: Kỳ 2 (đụng nhà đất) chỉ mở sau vài lần nổ đầu. */
export function eraOpen(st) {
  const lv = levelOf(st);
  return lv && st.eventsFired >= lv.era2From ? 2 : 1;
}

/** Ô đất có chủ mà chưa cất căn nhà nào — thứ duy nhất đem sang tay được. */
function bareOwned(st, playerId = null) {
  return [...st.owner.entries()]
    .filter(([id, owner]) => st.housesOn(id) === 0 && (playerId === null || owner === playerId))
    .map(([id]) => id);
}

/** Nhóm màu đang có nhà trên đó. */
function builtGroups(st) {
  return Object.keys(GROUPS).filter((g) => GROUP_TILES[g].some((id) => st.housesOn(id) > 0));
}

/** Số cấp nhà một ô mất khi để lửa cháy: nửa số nhà đang có, làm tròn xuống. */
export function burnLoss(houses) { return Math.floor(houses / 2); }

/**
 * Khu nào đem ra bốc thăm hoả hoạn được: phải có ít nhất một ô mất được một
 * cấp nhà. Khu toàn ô một căn thì cháy xong chẳng ô nào suy suyển — nổ một sự
 * kiện rỗng như thế thì thà bốc thẻ khác.
 */
function burnableGroups(st) {
  return Object.keys(GROUPS)
    .filter((g) => GROUP_TILES[g].some((id) => burnLoss(st.housesOn(id)) > 0));
}

/** Người giàu nhất bàn — thẻ trưng thu nhắm vào đây, tiêu chí ai cũng kiểm được. */
export function leaderSeat(st) {
  const alive = st.alive();
  if (alive.length === 0) return null;
  return alive.reduce((a, b) => (st.netWorth(b.id) > st.netWorth(a.id) ? b : a)).id;
}

/** Người nghèo nhất bàn — thẻ Hội Chợ nhắm vào đây. */
function poorestSeat(st) {
  const alive = st.alive();
  if (alive.length === 0) return null;
  return alive.reduce((a, b) => (st.netWorth(b.id) < st.netWorth(a.id) ? b : a)).id;
}

/**
 * Thẻ này lúc này có nghĩa lý gì không.
 *
 * Rút trúng "ân xá" khi chẳng ai ngồi tù thì cả bàn ngơ ngác — thà bỏ qua và
 * rút thẻ khác. Đây cũng là chỗ giữ cho sự kiện luôn *làm được một việc gì đó*.
 */
export function usable(st, card) {
  const alive = st.alive();
  switch (card.id) {
    case 'thue-dien-tho':
      return [...st.houses.values()].some((h) => h > 0);
    case 'siet-tin-dung':
      return st.mortgaged.size > 0;
    case 'an-xa':
      return alive.some((p) => p.inJail);
    case 'lam-phat':
    case 'mo-duong':
      return st.owner.size > 0;
    case 'dong-dat':
      return builtGroups(st).length > 0;
    case 'hoa-hoan':
      return burnableGroups(st).length > 0;
    case 'mat-giay-to':
      return alive.filter((p) => st.propertiesOf(p.id).length > 0).length >= 2;
    case 'trung-thu': {
      const seat = leaderSeat(st);
      return seat !== null && bareOwned(st, seat).length > 0;
    }
    case 'sang-nhuong':
      return alive.length >= 2 && bareOwned(st).length > 0;
    case 'hoan-doi-dia-ba':
      return alive.filter((p) => bareOwned(st, p.id).length > 0).length >= 2;
    case 'dai-ha-gia':
      return BOARD.some((t) => t.ownable && !st.owner.has(t.id));
    default:
      return true;
  }
}

/**
 * Rút một thẻ hợp cảnh.
 *
 * Mỗi kỳ giữ một chồng bài riêng, xáo hết mới lặp lại — giống Cơ Hội / Khí Vận,
 * để cùng một ván không gặp đi gặp lại một thẻ. Thẻ rút lên mà không dùng được
 * thì để riêng ra và bốc tiếp, xong mới trả cả nắm ấy về chồng: bỏ hẳn thì lần
 * sau bàn đã đổi, thẻ ấy lại dùng được mà không còn trong chồng nữa.
 */
export function drawEvent(st) {
  const era = eraOpen(st);
  const deck = EVENTS.filter((e) => e.era <= era);
  let pile = st.eventPiles[era];
  if (!pile || pile.length === 0) pile = st.eventPiles[era] = shuffledIds(deck);

  const skipped = [];
  let chosen = null;
  while (pile.length > 0) {
    const id = pile.pop();
    const card = deck.find((e) => e.id === id);
    if (card && usable(st, card)) { chosen = card; break; }
    if (card) skipped.push(id);
  }
  // Trả những thẻ chưa dùng được về chồng, xáo lẫn vào chỗ còn lại
  st.eventPiles[era] = shuffle([...pile, ...skipped]);
  return chosen;
}

function shuffledIds(deck) { return shuffle(deck.map((e) => e.id)); }

function shuffle(a) {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ==================================================================
   Kế hoạch của từng thẻ
   ================================================================== */

/**
 * Lập kế hoạch cho một thẻ: chọn sẵn khu nào, ô nào, ai phải trả bao nhiêu.
 * Toàn bộ ngẫu nhiên của sự kiện gói gọn ở đây, chạy đúng một lần trên máy
 * cầm lái.
 *
 * @returns {object} kế hoạch thuần dữ liệu, `null` nếu phút chót thẻ hết dùng được
 */
export function planEvent(st, card) {
  if (!usable(st, card)) return null;
  const alive = st.alive();

  switch (card.id) {
    case 'thue-dien-tho': {
      const bills = alive.map((p) => {
        const props = st.propertiesOf(p.id);
        const houses = props.reduce((n, id) => n + (st.housesOn(id) === 5 ? 0 : st.housesOn(id)), 0);
        const hotels = props.filter((id) => st.housesOn(id) === 5).length;
        return { seat: p.id, houses, hotels, amount: houses * card.perHouse + hotels * card.perHotel };
      }).filter((b) => b.amount > 0);
      return bills.length ? { bills } : null;
    }

    case 'siet-tin-dung': {
      const bills = alive.map((p) => {
        const cut = st.propertiesOf(p.id).filter((id) => st.isMortgaged(id));
        const owed = cut.reduce((s, id) => s + BOARD[id].mortgage, 0);
        return { seat: p.id, count: cut.length, amount: Math.ceil(owed * card.rate) };
      }).filter((b) => b.amount > 0);
      return bills.length ? { bills } : null;
    }

    case 'hoi-cho': {
      const seat = poorestSeat(st);
      return seat === null ? null : { seat, amount: card.amount };
    }

    case 'an-xa':
      return { seats: alive.filter((p) => p.inJail).map((p) => p.id) };

    case 'quy-cong-phat-chan':
      return { amount: card.bonus };

    case 'lam-phat':
      return { mod: { id: card.id, type: 'rent', mult: card.mult, turns: rounds(st, card.rounds) } };
    case 'mat-mua':
      return { mod: { id: card.id, type: 'salary', mult: card.mult, turns: rounds(st, card.rounds) } };
    case 'bao-gia':
      return { mod: { id: card.id, type: 'build', mult: card.mult, turns: rounds(st, card.rounds) } };
    case 'gioi-nghiem':
      return { mod: { id: card.id, type: 'freeze-build', turns: rounds(st, card.rounds) } };

    case 'mo-duong': {
      // Chỉ tăng giá khu đã có chủ — tăng giá cho đất ế thì chẳng ai được gì
      const owned = Object.keys(GROUPS).filter((g) => GROUP_TILES[g].some((id) => st.owner.has(id)));
      const group = pick(owned.length ? owned : Object.keys(GROUPS));
      return { group, mod: { id: `${card.id}:${group}`, type: 'group-rent', group, mult: card.mult, turns: -1 } };
    }

    case 'dong-dat': {
      const group = pick(builtGroups(st));
      const tiles = GROUP_TILES[group]
        .filter((id) => st.housesOn(id) > 0)
        .map((id) => ({
          id,
          seat: st.owner.get(id),
          houses: st.housesOn(id),
          brace: Math.ceil(BOARD[id].house_cost * card.braceRate),
        }));
      return { group, tiles };
    }

    case 'hoa-hoan': {
      /* Bốc thăm một khu màu, cả khu cùng cháy.
         Trước đây lửa luôn rơi đúng ô đông nhà nhất bàn, tức luôn rơi vào
         người đang dẫn — đoán trước được thì chẳng còn là tai hoạ, chỉ còn là
         một khoản thuế người dẫn đầu biết trước mà chừa tiền ra. Bốc thăm khu
         thì ai xây cũng có phần rủi, và cháy cả khu mới ra cái nghĩa "cháy lan
         cả dãy phố". */
      const groups = burnableGroups(st);
      if (groups.length === 0) return null;
      const group = pick(groups);
      const tiles = GROUP_TILES[group]
        .map((id) => ({ id, houses: st.housesOn(id), lose: burnLoss(st.housesOn(id)) }))
        .filter((t) => t.lose > 0)
        .map((t) => ({
          ...t,
          seat: st.owner.get(t.id),
          save: Math.ceil(BOARD[t.id].house_cost * t.lose * card.saveRate),
        }));
      return tiles.length ? { group, tiles } : null;
    }

    case 'mat-giay-to': {
      const seats = alive.filter((p) => st.propertiesOf(p.id).length > 0).map((p) => p.id);
      return { seats, turns: rounds(st, card.rounds) };
    }

    case 'trung-thu': {
      const seat = leaderSeat(st);
      const mine = bareOwned(st, seat);
      if (!mine.length) return null;
      // Lô đắt nhất — trưng thu cái ao cá sau nhà thì chẳng ai buồn để ý
      const tileId = mine.reduce((a, b) => (BOARD[b].price > BOARD[a].price ? b : a));
      return { seat, tileId, payout: BOARD[tileId].mortgage };
    }

    case 'sang-nhuong': {
      const tileId = pick(bareOwned(st));
      return { tileId, seat: st.owner.get(tileId) };
    }

    case 'hoan-doi-dia-ba': {
      /* Đi theo đúng thứ tự lượt: mỗi người giao cho người kế tiếp còn sống,
         thành một vòng khép kín — không ai bị hai lần, không ai trắng tay. */
      const ring = st.playOrder.filter((seat) => !st.players[seat].bankrupt);
      const givers = ring.filter((seat) => bareOwned(st, seat).length > 0);
      if (givers.length < 2) return null;
      const pairs = givers.map((seat, i) => ({ from: seat, to: givers[(i + 1) % givers.length] }));
      return { pairs };
    }

    case 'dai-ha-gia': {
      const free = BOARD.filter((t) => t.ownable && !st.owner.has(t.id)).map((t) => t.id);
      return free.length ? { tileId: pick(free) } : null;
    }

    default:
      return {};
  }
}

/**
 * Một dòng ngắn mô tả hiệu ứng đang chạy — HUD in ra để cả bàn biết luật lúc
 * này đang méo đi chỗ nào.
 */
export function modLabel(m) {
  const left = m.turns < 0 ? '' : ` (${m.turns} lượt)`;
  switch (m.type) {
    case 'rent':         return `Thuê +${Math.round((m.mult - 1) * 100)}%${left}`;
    case 'salary':       return `Lương ×${m.mult}${left}`;
    case 'build':        return `Giá xây +${Math.round((m.mult - 1) * 100)}%${left}`;
    case 'freeze-build': return `Cấm xây${left}`;
    case 'group-rent':   return `${GROUPS[m.group]?.name ?? 'Một khu'} +${Math.round((m.mult - 1) * 100)}%`;
    case 'frozen':       return `${m.tiles.length} ô mất giấy tờ${left}`;
    default:             return '';
  }
}

/* ==================================================================
   Xoay tiền tự động
   ================================================================== */

/**
 * Cấn nợ hộ người chơi cho đủ `need` tiền mặt: thế chấp trước, hết đường mới
 * bán nhà.
 *
 * Vì sao máy làm thay chứ không hỏi? Sự kiện thu tiền **cả bàn cùng lúc**, mà
 * người bị thu phần lớn không phải người đang cầm lái — có người đang mở hộp
 * thoại khác, có người vừa rớt mạng. Dựng một hàng hộp thoại "bán nhà đi" cho
 * bốn người một lúc là treo bàn. Cách cấn nợ ở đây tất định: máy nào tính cũng
 * ra đúng một kết quả, và người chơi đọc thông báo là biết mình vừa mất gì.
 *
 * Thứ tự cố ý: thế chấp ô rẻ nhất trước (mất ít tiền thuê nhất), giữ nhà cửa
 * lại tới cùng vì nhà bán ra chỉ được nửa giá xây.
 *
 * @returns {{ok:boolean, mortgaged:number[], sold:number[]}}
 */
export function autoRaise(st, seat, need) {
  const p = st.players[seat];
  const mortgaged = [];
  const sold = [];

  const cheapFirst = () => st.propertiesOf(seat)
    .filter((id) => st.canMortgage(seat, id).ok)
    .sort((a, b) => BOARD[a].mortgage - BOARD[b].mortgage);

  while (p.money < need) {
    const next = cheapFirst()[0];
    if (next === undefined) break;
    st.mortgage(seat, next);
    mortgaged.push(next);
  }

  // Vẫn thiếu: hạ nhà xuống, ô nào đang cao nhất thì hạ trước cho đúng luật đều tay
  while (p.money < need) {
    const built = st.propertiesOf(seat)
      .filter((id) => st.canSellHouse(seat, id).ok)
      .sort((a, b) => st.housesOn(b) - st.housesOn(a));
    if (built.length === 0) break;
    st.sellHouse(seat, built[0]);
    sold.push(built[0]);
    // Bán hết nhà trong bộ thì ô ấy lại thế chấp được
    for (const id of cheapFirst()) {
      if (p.money >= need) break;
      st.mortgage(seat, id);
      mortgaged.push(id);
    }
  }

  return { ok: p.money >= need, mortgaged, sold };
}

/** "Mấy vòng" quy ra số lượt: một vòng là mỗi người còn sống đi một lượt. */
function rounds(st, n) { return Math.max(1, n * Math.max(1, st.alive().length)); }

/* ==================================================================
   Cộng điểm áp lực — gọi từ controller
   ================================================================== */

export { PRESSURE };
