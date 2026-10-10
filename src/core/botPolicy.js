/**
 * Luật quyết định của bot theo ba cấp Dễ / Vừa / Khó — thuần dữ liệu, không
 * đụng Phaser hay DOM, để `game/bot.js` (ván thật) và `tests/gamesim.mjs`
 * (mô phỏng cả ván, `--bots`) dùng chung đúng một bộ luật. Số trong `LEVELS`
 * chỉnh bằng mô phỏng ấy: chạy `npm run sim:bots` sau mỗi lần sửa.
 *
 * Ba cấp khác nhau ở chỗ người thật cũng khác nhau:
 *   - **Dễ** mua đất theo cảm hứng, không để ý bộ màu, xây nhà rụt rè, giữ
 *     tiền quá tay, đấu giá thấp, nhận cả giao dịch hơi thiệt, và học kỹ năng
 *     trong một nhánh bất kỳ, gặp ô nào học ô ấy.
 *   - **Vừa** là bot của gamesim: mua khi còn dư, xây ô lời nhất, gom bộ, đọc
 *     tần suất ô (`predict` 1), học trọn một nhánh mạnh.
 *   - **Khó** học lối ghép hai nhánh mạnh nhất, mua và xây hết tay, cầm đất
 *     lẻ lấy vốn xây, đọc dự đoán lượt tới (`predict` 2) để xây đúng chỗ đối
 *     thủ sắp bước vào, cầm ô ít sinh lời trước khi thiếu tiền, ngồi tù khi ra
 *     ngoài kỳ vọng mất nhiều tiền thuê; chủ động hỏi mua ô còn thiếu của bộ,
 *     không bao giờ bán ô cuối cùng người khác cần để đủ bộ.
 *
 * Mô phỏng chỉ ra hai điều trái trực giác, nên số của Khó mới như dưới đây:
 * lối học kỹ năng quyết định gần hết sức mạnh (Khó mà học như Vừa thì tụt từ
 * ~49% xuống ~25% khi đấu 3 bot Vừa), và giữ tiền mặt phòng thân — kể cả giữ
 * theo dự đoán cú lắc tới — thua đem hết tiền đi xây (`riskQ` 0.9: 45%, 0: 49%).
 */
import { BOARD, GROUP_TILES, JAIL_FINE, JAIL_TILE } from '../data/board.js';
import { SKILLS } from '../data/skills.js';
import { canLearn, levelOf } from './skills.js';
import { LONG_RUN, hitChance, payOutlook, nextLanding } from './predict.js';

/**
 * @typedef {object} Level
 * @property {string} key
 * @property {string} name tên hiện cho người chơi
 * @property {number} buyChance  xác suất chịu cân nhắc mua một ô (Dễ hay bỏ qua)
 * @property {number} buyReserve mua xong phải còn chừng này
 * @property {boolean} setAware  biết ô gom bộ / chặn bộ đáng mua hơn
 * @property {boolean} shrewd   ranh: đầu ván vét đất, chuộc ô của bộ đủ màu trước,
 *   không tháo bộ đủ màu của mình hay bán ô làm người khác đủ bộ
 * @property {number} buildReserve xây xong phải còn chừng này
 * @property {number} buildPerTurn xây tối đa bao nhiêu căn một lần
 * @property {boolean} buildSmart xây ô lời nhất; không thì xây ô bất kỳ
 * @property {boolean} mortgageToBuild cầm đất lẻ lấy vốn xây bộ
 * @property {number} redeemReserve chuộc xong phải còn chừng này
 * @property {'pay'|'basic'|'smart'} jail
 * @property {[number, number]} bid khoảng hệ số giá ghi kín so với giá gốc
 * @property {number} bidSet hệ số cộng thêm khi ô làm đủ bộ
 * @property {number} tradeMargin phần lời tối thiểu (so với phần đưa đi) mới gật
 * @property {number} tradeGuard hệ số đòi thêm khi đưa ô làm đối phương đủ bộ
 * @property {number} propose >0: chủ động hỏi mua ô thiếu của bộ với giá × hệ số
 * @property {'random'|'branch'|'path'} skills cách tiêu điểm kỹ năng
 * @property {string[][]} [paths] lối học cho `skills: 'path'` (mặc định `HARD_PATHS`)
 * @property {0|1|2} predict dùng dự đoán xí ngầu (`core/predict.js`) tới đâu:
 *   0 không, 1 tần suất dài hạn của từng ô, 2 thêm lượt tới — ai sắp bước vào
 *   ô nào, cú lắc tới của mình có thể mất bao nhiêu
 * @property {number} riskQ (predict 2) giữ thêm đủ tiền trả cú lắc tới ở phân vị
 *   này; 0 là không giữ
 */

/** @type {Record<string, Level>} */
export const LEVELS = {
  easy: {
    key: 'easy', name: 'Dễ',
    buyChance: 0.85, buyReserve: 120, setAware: false, shrewd: false,
    buildReserve: 350, buildPerTurn: 1, buildSmart: false, mortgageToBuild: false,
    redeemReserve: 600,
    jail: 'pay',
    bid: [0.45, 0.8], bidSet: 0,
    tradeMargin: -0.1, tradeGuard: 1,
    propose: 0,
    skills: 'branch',
    predict: 0, riskQ: 0,
  },
  normal: {
    key: 'normal', name: 'Vừa',
    buyChance: 1, buyReserve: 100, setAware: true, shrewd: false,
    buildReserve: 200, buildPerTurn: 40, buildSmart: true, mortgageToBuild: false,
    redeemReserve: 400,
    jail: 'basic',
    bid: [0.75, 1.1], bidSet: 0.3,
    tradeMargin: 0.1, tradeGuard: 2,
    propose: 0,
    skills: 'path', paths: null,
    predict: 1, riskQ: 0,
  },
  hard: {
    key: 'hard', name: 'Khó',
    buyChance: 1, buyReserve: 20, setAware: true, shrewd: true,
    buildReserve: 0, buildPerTurn: 40, buildSmart: true, mortgageToBuild: true,
    redeemReserve: 300,
    jail: 'smart',
    bid: [0.9, 1.15], bidSet: 0.6,
    tradeMargin: 0.2, tradeGuard: 3,
    propose: 1.5,
    skills: 'path',
    predict: 2, riskQ: 0,
  },
};

export const LEVEL_KEYS = Object.keys(LEVELS);
export const levelOfKey = (key) => LEVELS[key] ?? LEVELS.normal;

/* ================================================================
   Đọc thế cờ
   ================================================================ */

/** Các đối thủ còn trong ván. */
const rivals = (st, seat) => st.players.filter((q) => !q.bankrupt && q.id !== seat);

/** Tiền thuê đắt nhất mình có thể phải trả lúc này — thước đo "bàn nguy hiểm cỡ nào". */
export function danger(st, seat) {
  let max = 0;
  for (const q of rivals(st, seat)) {
    for (const id of st.propertiesOf(q.id)) {
      if (st.isMortgaged(id)) continue;
      max = Math.max(max, st.rentFor(id, 7));
    }
  }
  return max;
}

/** Số ô có thể mua còn nằm ở ngân hàng — đầu ván nhiều, cuối ván cạn. */
const unowned = (st) => BOARD.filter((t) => t.price && st.owner.get(t.id) === undefined).length;

/**
 * Ô `tileId` đáng với `seat` cỡ nào xét theo bộ màu:
 * 2 = có nó là đủ bộ, 1 = chặn một người sắp đủ bộ, 0.5 = gom thêm, 0 = lẻ.
 */
export function setValue(st, seat, tileId) {
  const grp = BOARD[tileId].color_group;
  const ids = grp ? GROUP_TILES[grp] : [];
  if (!ids.length) return 0;
  const rest = ids.filter((id) => id !== tileId);
  if (rest.every((id) => st.owner.get(id) === seat)) return 2;
  const other = st.owner.get(rest[0]);
  if (other !== undefined && other !== seat && rest.every((id) => st.owner.get(id) === other)) return 1;
  return rest.some((id) => st.owner.get(id) === seat) ? 0.5 : 0;
}

/** Ô này nằm trong bộ màu mình đã đủ (xây được) — đừng đem cầm hay bán. */
const inFullSet = (st, seat, id) => {
  const grp = BOARD[id].color_group;
  return !!grp && GROUP_TILES[grp].every((x) => st.owner.get(x) === seat);
};

/**
 * Dự trữ tiền mặt: mức cố định của cấp, cộng (khi `riskQ` > 0) đủ trả cú lắc
 * tới ở phân vị ấy theo dự đoán — đứng ngay trước dãy khách sạn thì giữ
 * nhiều, vừa qua khỏi thì tiêu mạnh tay. Mô phỏng hiện cho thấy không giữ
 * thêm mới mạnh nhất, nên cả ba cấp đặt 0; để lại cửa này cho lúc luật đổi.
 */
function reserveFor(st, p, lv, base) {
  if (lv.predict >= 2 && lv.riskQ > 0) return Math.min(600, base + payOutlook(st, p).q(lv.riskQ));
  return base;
}

/**
 * Ô này đáng tiền cỡ nào theo dự đoán: 1 là ô bình thường. Cấp 1 nhìn tần
 * suất dài hạn (ô cam đông khách hơn ô xanh đậm); cấp 2 cộng thêm xác suất
 * đối thủ bước vào ngay lượt tới.
 */
export function traffic(st, seat, id, lv) {
  if (!lv.predict) return 1;
  let k = LONG_RUN[id];
  if (lv.predict >= 2) k *= 1 + 1.5 * hitChance(st, id, seat);
  return k;
}

/* ================================================================
   Mua đất
   ================================================================ */

/** Dừng ở đất trống: mua không? */
export function wantBuy(st, p, tileId, lv, rand = Math.random) {
  const t = BOARD[tileId];
  if (p.money < t.price) return false;
  const v = lv.setAware ? setValue(st, p.id, tileId) : 0;
  if (v < 1 && rand() > lv.buyChance) return false;
  // Đầu ván đất là thứ hiếm nhất — Khó vét sạch tiền mua
  let reserve = lv.shrewd && unowned(st) >= 12 ? 0 : reserveFor(st, p, lv, lv.buyReserve);
  if (v >= 2) reserve = 0;
  else if (v >= 1) reserve = Math.min(reserve, 40);
  return p.money - t.price >= reserve;
}

/** Giá ghi kín cho phiên đấu giá. */
export function bidFor(st, p, tileId, lv, rand = Math.random) {
  const t = BOARD[tileId];
  const v = lv.setAware ? setValue(st, p.id, tileId) : 0;
  const [lo, hi] = lv.bid;
  const mult = (lo + rand() * (hi - lo)) + (v >= 1 ? lv.bidSet * (v >= 2 ? 1 : 0.6) : 0);
  const cap = p.money - reserveFor(st, p, lv, lv.buyReserve);
  return Math.max(0, Math.floor(Math.min(cap, t.price * mult) / 5) * 5);
}

/* ================================================================
   Lo tài sản: chuộc, cầm lấy vốn, xây
   ================================================================ */

/**
 * Làm thẳng trên `st` những việc bot muốn trong lượt — chuộc đất, (Khó) cầm
 * đất lẻ lấy vốn, xây nhà — rồi trả về danh sách để bên gọi loan tin.
 *
 * @returns {Array<{act:'redeem'|'mortgage'|'build', id:number, res:object}>}
 */
export function manage(st, p, lv, rand = Math.random) {
  const acts = [];
  const keep = reserveFor(st, p, lv, lv.buildReserve);

  // Chuộc trước: ô trong bộ đủ màu chuộc xong là xây được, nên Khó chuộc chúng trước tiên
  const mort = st.propertiesOf(p.id).filter((id) => st.isMortgaged(id))
    .sort((a, b) => Number(inFullSet(st, p.id, b)) - Number(inFullSet(st, p.id, a)));
  for (const id of mort) {
    const need = lv.shrewd && inFullSet(st, p.id, id) ? keep : lv.redeemReserve;
    if (p.money - BOARD[id].redeem < need) continue;
    const res = st.redeem(p.id, id);
    if (res.ok) acts.push({ act: 'redeem', id, res });
  }

  /* Mỗi ô chấm theo tiền thuê tăng thêm trên mỗi đồng bỏ ra, nhân độ đông
     khách theo dự đoán — xây ở ô đối thủ sắp bước vào trước. */
  const gain = (id, cost) => {
    const h = st.housesOn(id);
    const r = BOARD[id].rents;
    return (r[Math.min(5, h + 1)] - (h ? r[h] : r[0] * 2)) / Math.max(1, cost) * traffic(st, p.id, id, lv);
  };
  const options = () => st.propertiesOf(p.id)
    .map((id) => ({ id, c: st.canBuild(p.id, id) }))
    .filter((x) => x.c.ok && p.money - x.c.cost >= keep);

  for (let n = 0; n < lv.buildPerTurn; n++) {
    let opts = options();
    if (!opts.length && lv.mortgageToBuild && fundBuild(st, p, keep, acts)) opts = options();
    if (!opts.length) break;
    if (lv.buildSmart) opts.sort((a, b) => gain(b.id, b.c.cost) - gain(a.id, a.c.cost));
    else if (rand() < 0.5) break;   // Dễ: lượt xây lượt không
    const pick = lv.buildSmart ? opts[0] : opts[Math.floor(rand() * opts.length)];
    const res = st.build(p.id, pick.id);
    if (!res.ok) break;
    acts.push({ act: 'build', id: pick.id, res });
  }
  return acts;
}

/**
 * Khó: có bộ đủ màu mà chưa lên 3 nhà, thiếu vốn → cầm một ô lẻ (không thuộc
 * bộ nào mình sắp đủ, không chặn bộ ai) để xây. Ô đem cầm phải đủ bù phần
 * thiếu cho một căn, kẻo cầm xong vẫn không xây được.
 */
function fundBuild(st, p, keep, acts) {
  const wants = st.propertiesOf(p.id).filter((id) => {
    if (BOARD[id].type !== 'property' || !inFullSet(st, p.id, id) || st.housesOn(id) >= 3) return false;
    const c = st.canBuild(p.id, id);
    return c.ok || c.reason === 'Không đủ tiền.';
  });
  if (!wants.length) return false;
  const cost = Math.min(...wants.map((id) => st.buildCost(id)));
  const short = cost + keep - p.money;
  if (short <= 0) return false;
  const lone = st.propertiesOf(p.id)
    .filter((id) => !inFullSet(st, p.id, id) && st.canMortgage(p.id, id).ok && setValue(st, p.id, id) < 1)
    .sort((a, b) => BOARD[a].mortgage - BOARD[b].mortgage);
  const pick = lone.find((id) => BOARD[id].mortgage >= short) ?? null;
  if (pick == null) return false;
  const res = st.mortgage(p.id, pick);
  if (!res.ok) return false;
  acts.push({ act: 'mortgage', id: pick, res });
  return true;
}

/* ================================================================
   Tù
   ================================================================ */

/** @returns {'card'|'pay'|'roll'} */
export function jailChoice(st, p, lv, free = false) {
  const card = st.jailCardAt(p.id) >= 0;
  if (lv.jail === 'pay') return card ? 'card' : (free || p.money >= JAIL_FINE ? 'pay' : 'roll');
  const houses = [...st.houses.values()].reduce((n, h) => n + h, 0);
  if (lv.jail === 'basic') {
    if (card) return 'card';
    return free || (houses < 8 && p.money >= JAIL_FINE + 250) ? 'pay' : 'roll';
  }
  /* Khó: bàn còn nhiều đất trống thì ra ngay để mua; bàn đã dày nhà thì ngồi
     lì trong tù — mỗi lượt ngồi là một lượt khỏi lo đáp vào khách sạn. "Dày"
     đo bằng dự đoán: ra tù đi một lượt kỳ vọng mất bao nhiêu tiền thuê. Vé ra
     tù giữ lại cho lúc cần. */
  const out = lv.predict >= 2 ? expectedRent(st, p, JAIL_TILE) : 0;
  const hot = lv.predict >= 2 ? out >= 45 : danger(st, p.id) >= 250 || houses >= 10;
  if (hot && unowned(st) < 6) return 'roll';
  if (card) return 'card';
  return free || p.money >= JAIL_FINE + 60 ? 'pay' : 'roll';
}

/** Kỳ vọng tiền thuê một lượt đi từ ô `pos` (không tính đang ở tù). */
function expectedRent(st, p, pos) {
  let n = 0;
  for (const [id, e] of nextLanding(pos)) {
    const o = st.owner.get(id);
    if (o === undefined || o === p.id) continue;
    for (const [s, w] of e.sums) n += st.rentFor(id, s) * w;
  }
  return n;
}

/* ================================================================
   Giao dịch
   ================================================================ */

/** Giá trị một ô để cân giao dịch: giá gốc trừ nợ chuộc, nhà tính nửa giá xây. */
export function worth(st, id) {
  const t = BOARD[id];
  const base = st.isMortgaged(id) ? t.price - t.redeem : t.price;
  return base + st.housesOn(id) * (t.house_cost ?? 0) * 0.5;
}

/**
 * Duyệt đề nghị: `give` / `giveMoney` là phần bot nhận, `get` / `getMoney`
 * là phần bot đưa. `from` là ghế đưa đề nghị.
 */
export function acceptTrade(st, offer, seat, from, lv) {
  const me = st.players[seat];
  if (me.money < offer.getMoney) return false;
  let gain = offer.giveMoney - offer.getMoney;
  for (const id of offer.give) {
    const v = lv.setAware ? setValue(st, seat, id) : 0;
    gain += worth(st, id) * (v >= 2 ? 1.8 : 1);
  }
  let cost = 0;
  for (const id of offer.get) {
    // Ô cuối cùng đối phương cần để đủ bộ: đòi gấp `tradeGuard`
    const completes = setValue(st, from, id) >= 2;
    cost += worth(st, id) * (completes ? lv.tradeGuard : 1);
    // Khó không bao giờ tháo bộ đã đủ của mình
    if (lv.shrewd && inFullSet(st, seat, id)) return false;
  }
  gain -= cost;
  return gain >= Math.max(lv.tradeMargin >= 0 ? 10 : -Infinity, cost * lv.tradeMargin);
}

/**
 * Khó: thiếu đúng một ô của bộ, ô ấy nằm lẻ trong tay người khác (họ không
 * gom bộ ấy, chưa xây, chưa cầm) → hỏi mua bằng tiền. `tried` ghi lần hỏi
 * cuối theo ô để không hỏi đi hỏi lại mỗi lượt.
 *
 * @returns {?{to:number, give:number[], giveMoney:number, get:number[], getMoney:number}}
 */
export function proposeTrade(st, p, lv, tried = new Map()) {
  if (!lv.propose) return null;
  for (const ids of Object.values(GROUP_TILES)) {
    const miss = ids.filter((x) => st.owner.get(x) !== p.id);
    if (miss.length !== 1 || ids.length < 2) continue;
    const id = miss[0];
    const q = st.owner.get(id);
    if (q === undefined || st.players[q].bankrupt) continue;
    if (st.housesOn(id) > 0 || st.isMortgaged(id)) continue;
    if (ids.filter((x) => st.owner.get(x) === q).length > 1) continue;
    if ((tried.get(id) ?? -99) > st.turnNo - 8 * st.players.length) continue;
    const price = Math.round(BOARD[id].price * lv.propose / 5) * 5;
    if (p.money - price < 120) continue;
    tried.set(id, st.turnNo);
    return { to: q, give: [], giveMoney: price, get: [id], getMoney: 0 };
  }
  return null;
}

/* ================================================================
   Kỹ năng
   ================================================================ */

/**
 * Lối học của Khó: chỉ kỹ năng tự động (bot không bấm kỹ năng chủ động), lấy
 * theo lối mạnh nhất trong mô phỏng (`npm run sim:bots -- --vary …`): ghép
 * hai nhánh mạnh hơn hẳn đi trọn một nhánh. Liên Đoàn thu tiền cả bàn mỗi
 * vòng nuôi vốn, Chung Cư Mini xây được trên đất lẻ nên không phải chờ đủ
 * bộ, Mặt Tiền đẩy tiền thuê lên. Đo 6000 ván đấu 3 bot Vừa: 64.8%; lối một
 * nhánh tốt nhất chỉ 47–50%.
 */
export const HARD_PATHS = [
  ['cn1', 'cn2a', 'cn3', 'cnU', 'cnU', 'cnU', 'acX2', 'ac2b', 'acS1', 'acS1', 'acS1', 'acX1', 'acV', 'acV', 'acV'],
];

/**
 * Lối của Vừa: một nhánh trọn vẹn, chọn ngẫu nhiên trong ba nhánh tự động
 * mạnh nhất — chơi có bài bản nhưng không biết ghép nhánh như Khó.
 */
export const NORMAL_PATHS = [
  ['cn1', 'cn2a', 'cn3', 'cnU', 'cnU', 'cnU', 'cn3', 'cn3', 'cn2a'],
  ['acX2', 'ac2b', 'acS1', 'acS1', 'acS1', 'acX1', 'acV', 'acV', 'acV'],
  ['dh1', 'dh2b', 'dhX1', 'dhV', 'dhV', 'dhV', 'dhX1', 'dh1'],
];

const PASSIVE = SKILLS.filter((s) => s.kind === 'passive');
const BRANCHES = [...new Set(SKILLS.map((s) => s.branch))];

/**
 * Chọn ô kỹ năng kế tiếp để học, hoặc null. `memo` giữ lựa chọn lâu dài của
 * từng bot (nhánh / lối học) — bên gọi giữ hộ, mỗi ghế một cái.
 */
export function nextSkill(st, p, lv, memo, rand = Math.random) {
  const ok = (id) => canLearn(p, id, st).ok;
  if (lv.skills === 'path') {
    const paths = lv.paths ?? (lv.key === 'normal' ? NORMAL_PATHS : HARD_PATHS);
    memo.path ??= paths[Math.floor(rand() * paths.length)];
    const need = new Map();
    for (const id of memo.path) {
      need.set(id, (need.get(id) ?? 0) + 1);
      if (levelOf(p, id) >= need.get(id)) continue;
      if (ok(id)) return id;
      // Ô kế trên lối chưa đủ điểm thì để dành, đừng tiêu lạc sang ô khác
      if (!canLearn(p, id, st).reason?.includes('điểm')) continue;
      return null;
    }
  }
  const open = PASSIVE.filter((s) => ok(s.id));
  if (!open.length) return null;
  if (lv.skills === 'random') return open[Math.floor(rand() * open.length)].id;
  memo.branch ??= BRANCHES[Math.floor(rand() * BRANCHES.length)];
  const score = (s) => (s.branch === memo.branch ? 0 : 100) + (levelOf(p, s.id) ? 10 : 0) + s.tier;
  return open.sort((a, b) => score(a) - score(b))[0].id;
}

/* ================================================================
   Xoay tiền
   ================================================================ */

/**
 * Thiếu tiền: cầm đất rồi mới bán nhà (nhà bán ra chỉ được nửa giá xây).
 * Không dự đoán thì cầm ô rẻ nhất trước, y như ngân hàng cấn nợ hộ
 * (`autoRaise` trong core/events.js). Có dự đoán thì cầm ô **ít sinh lời
 * nhất** trước — tiền thuê nhân tần suất người ghé — và bán nhà ở ô vắng
 * khách nhất, giữ lại ô đang chờ người bước vào.
 *
 * @returns {{ok:boolean, mortgaged:number[], sold:number[]}}
 */
export function raise(st, p, need, lv) {
  const seat = p.id;
  const mortgaged = [];
  const sold = [];
  const income = (id) => st.rentFor(id, 7) * traffic(st, seat, id, lv);
  const order = (a, b) => (lv.predict
    ? Number(inFullSet(st, seat, a)) - Number(inFullSet(st, seat, b)) || income(a) - income(b)
    : (BOARD[a].type !== 'property') - (BOARD[b].type !== 'property') || BOARD[a].mortgage - BOARD[b].mortgage);
  const pawnable = () => st.propertiesOf(seat).filter((id) => st.canMortgage(seat, id).ok).sort(order);

  while (p.money < need) {
    const id = pawnable()[0];
    if (id === undefined) break;
    st.mortgage(seat, id);
    mortgaged.push(id);
  }
  while (p.money < need) {
    const built = st.propertiesOf(seat).filter((id) => st.canSellHouse(seat, id).ok)
      .sort((a, b) => st.housesOn(b) - st.housesOn(a) || (lv.predict ? traffic(st, seat, a, lv) - traffic(st, seat, b, lv) : 0));
    if (!built.length) break;
    st.sellHouse(seat, built[0]);
    sold.push(built[0]);
    for (const id of pawnable()) {
      if (p.money >= need) break;
      st.mortgage(seat, id);
      mortgaged.push(id);
    }
  }
  return { ok: p.money >= need, mortgaged, sold };
}
