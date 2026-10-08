/**
 * Cân bằng cây kỹ năng bằng số — không phải bài kiểm thử, không cần dev server.
 *
 *   node tests/balance.mjs            → bảng giá trị từng kỹ năng và từng đường đi
 *   node tests/balance.mjs --lv 3     → tính ở level 3
 *
 * Hai bước:
 *   1. Mô phỏng di chuyển (luật thật: đôi, ba đôi vào tù, ô Vào Tù, ở tù cầu
 *      đôi 3 lượt, thẻ di chuyển của hai bộ bài thật) → tần suất mỗi lượt:
 *      qua ô Bắt Đầu, dừng / đi ngang từng ô, rút thẻ, vào tù.
 *   2. Một thế cờ giữa ván cố định cho bàn 4 người (`REF` dưới đây) → mỗi kỹ
 *      năng mang về bao nhiêu tiền **mỗi lượt của mình** (gồm cả tiền thu trong
 *      lượt của 3 người kia).
 *
 * Kỹ năng đổi đường đi hay mua đất (Quay Đầu, Thâu Tóm, Sổ Hồng…) không đo ra
 * tiền trực tiếp được: script tính theo một giả định ghi ngay cạnh công thức,
 * đánh dấu `*` trong bảng. Số của chúng thô hơn, đọc để so thứ bậc.
 *
 * Đường đi: kỹ năng học lúc nào thì mang tiền về từ lúc đó tới hết ván
 * (`TURNS` lượt). Cấp 1 học ở lần qua ô Bắt Đầu thứ 1, cấp 2 ở lần 2, cấp 3 và
 * nhánh phụ ở lần 4 (2 điểm), tối thượng ở lần 7.
 */
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const B = await vite.ssrLoadModule('/src/data/board.js');
const C = await vite.ssrLoadModule('/src/data/cards.js');
const D = await vite.ssrLoadModule('/src/data/skills.js');
await vite.close();

const LV = Number(process.argv[process.argv.indexOf('--lv') + 1]) || 1;
const TURNS = 60;          // một ván tính theo lượt của mỗi người
const OPP = 3;             // bàn 4 người
const CASH = 750;          // tiền mặt tham chiếu = tiền khởi đầu
const N = 400000;          // số lượt mô phỏng

const { BOARD, STATION_RENT, UTILITY_MULT, GO_SALARY, GO_LANDING_MULT, JAIL_FINE } = B;

/* ================================================================ 1. mô phỏng di chuyển */

const die = () => 1 + Math.floor(Math.random() * 6);
// Mô hình chạy chủ đề mặc định: bỏ thẻ riêng của Halloween / Giáng Sinh
const decks = { chance: C.CHANCE.filter((c) => !c.theme), chest: C.CHEST.filter((c) => !c.theme) };
const NEAREST = { station: [5, 15, 25, 35], utility: [12, 28] };

const f = new Float64Array(40);      // dừng ở ô t, mỗi lượt
const g = new Float64Array(40);      // đi ngang ô t (không tính ô xuất phát, ô dừng), mỗi lượt
const occ = new Float64Array(40);    // chỗ đứng cuối lượt
const sums = new Float64Array(13);   // tổng xí ngầu, mỗi lượt
let passGo = 0, landGo = 0, rolls = 0, moves = 0, doubles = 0, jails = 0, jailTurns = 0;
const cardDraw = { chance: 0, chest: 0 };

function sim() {
  let pos = 0, inJail = false, jt = 0;
  const move = (steps, forward = true) => {
    moves++;
    const dir = Math.sign(steps);
    for (let i = 1; i < Math.abs(steps); i++) g[((pos + dir * i) % 40 + 40) % 40]++;
    const to = ((pos + steps) % 40 + 40) % 40;
    if (forward && steps > 0 && to < pos) passGo++;
    if (forward && steps > 0 && to === 0) landGo++;
    pos = to;
    f[pos]++;
    if (pos === 30) { toJail(); return; }
    const t = BOARD[pos].type;
    if (t === 'chance' || t === 'chest') {
      cardDraw[t]++;
      const deck = decks[t];
      const card = deck[Math.floor(Math.random() * deck.length)];
      if (card.type === 'move') {
        if (card.jail) { toJail(); return; }
        if (card.ahead) { move(card.ahead); return; }
        const pool = card.nearest ? NEAREST[card.nearest] : [card.to ?? 0];
        const ahead = (id) => (((id - pos) % 40) + 40) % 40 || 40;
        const dest = pool.reduce((a, b) => (ahead(b) < ahead(a) ? b : a));
        move(ahead(dest));
      }
    }
  };
  const toJail = () => { pos = 10; inJail = true; jt = 0; jails++; };
  for (let turn = 0; turn < N; turn++) {
    if (inJail) {
      jailTurns++;
      const a = die(), b = die(); rolls++; sums[a + b]++;
      if (a === b) { inJail = false; move(a + b); }
      else if (++jt >= 3) { inJail = false; move(a + b); }
    } else {
      for (let d = 0; d < 3; d++) {
        const a = die(), b = die(); rolls++; sums[a + b]++;
        if (a === b && d === 2) { toJail(); break; }
        move(a + b);
        if (inJail || a !== b) break;
        doubles++;
      }
    }
    occ[pos]++;
  }
}
sim();
for (const arr of [f, g, occ, sums]) for (let i = 0; i < arr.length; i++) arr[i] /= N;
const per = (n) => n / N;
const P = {
  go: per(passGo), landGo: per(landGo), rolls: per(rolls), moves: per(moves),
  jail: per(jails), jailTurns: per(jailTurns), chance: per(cardDraw.chance), chest: per(cardDraw.chest),
};
const LAP = 1 / P.go;                 // số lượt cho một vòng
const pSum = (n) => (6 - Math.abs(n - 7)) / 36;

/* ================================================================ 2. thế cờ tham chiếu */

/**
 * Giữa ván, bàn 4 người. Mình: bộ cam đủ 3 ô, mỗi ô 2 nhà; 1 ô xanh nhạt, 1 ô
 * đỏ lẻ; 2 bến; 1 công ty → 3 màu đất. Ba người kia chia nhau phần còn lại,
 * có một bộ hồng 2 nhà và một bộ xanh lá 1 nhà.
 */
const REF = {
  me: { tiles: [16, 18, 19, 8, 21, 5, 15, 12], houses: { 16: 2, 18: 2, 19: 2 } },
  opps: [
    { tiles: [11, 13, 14, 1, 3, 25], houses: { 11: 2, 13: 2, 14: 2 } },
    { tiles: [31, 32, 34, 6, 9, 35, 28], houses: { 31: 1, 32: 1, 34: 1 } },
    { tiles: [37, 39, 23, 24, 26, 27, 29], houses: {} },
  ],
};
const owner = new Map();
const houses = new Map();
[REF.me, ...REF.opps].forEach((o, i) => {
  for (const t of o.tiles) owner.set(t, i);
  for (const [t, h] of Object.entries(o.houses)) houses.set(Number(t), h);
});
const count = (seat, type) => [...owner].filter(([t, s]) => s === seat && BOARD[t].type === type).length;
const fullSet = (seat, grp) => B.GROUP_TILES[grp].every((t) => owner.get(t) === seat);
function rent(t) {
  const seat = owner.get(t);
  if (seat == null) return 0;
  const T = BOARD[t];
  if (T.type === 'station') return STATION_RENT[count(seat, 'station')];
  if (T.type === 'utility') return 7 * UTILITY_MULT[count(seat, 'utility')];
  const h = houses.get(t) ?? 0;
  return h ? T.rents[h] : T.rents[0] * (fullSet(seat, T.color_group) ? 2 : 1);
}
const mine = REF.me.tiles;
const myColors = new Set(mine.map((t) => BOARD[t].color_group).filter(Boolean)).size;
const avg = (v) => (Array.isArray(v) ? (v[0] + v[1]) / 2 : v);
const prm = (id, lv = LV) => Object.fromEntries(Object.entries(D.SKILLS.find((s) => s.id === id).levels[lv - 1]).map(([k, v]) => [k, avg(v)]));
/** Tiền thu từ đất mình, mỗi lượt của mình (3 người kia mỗi người một lượt). */
const incomeOn = (tiles, fn = rent) => OPP * tiles.reduce((n, t) => n + f[t] * fn(t), 0);
const R_IN = incomeOn(mine);
/** Tiền mình trả thuê mỗi lượt. */
const R_OUT = [...owner].filter(([, s]) => s !== 0).reduce((n, [t]) => n + f[t] * rent(t), 0);
/** Tiền một đối thủ thu mỗi lượt của mình (3 người khác trả) — người giàu nhất. */
const R_OPP = Math.max(...REF.opps.map((o) => OPP * o.tiles.reduce((n, t) => n + f[t] * rent(t), 0)));
const unbuilt = mine.filter((t) => !(houses.get(t) > 0));
const built = mine.filter((t) => houses.get(t) > 0);
const LAPS_MID = 5, LAPS_LATE = 8;
/** Một điểm kỹ năng đáng bao nhiêu tiền mỗi lượt — trung bình các ô cấp 2 (điền sau). */
let POINT = 0;

/* Rủi ro tiền thuê khi dừng ô t — dùng cho kỹ năng né ô (Quay Đầu, Xe Đạp, Xí Ngầu Gian). */
const risk = (t) => (owner.get(t) > 0 ? rent(t) : 0) + (t === 30 ? 100 : 0) + (t === 4 ? 200 : 0) + (t === 38 ? 100 : 0);
/** Lợi ích trung bình một lần dùng kỹ năng né ô: lắc ra, thấy ô tới đắt thì dùng. */
function dodgeGain(alt) {
  // Duyệt mọi vị trí đứng (theo `occ`) × mọi cú lắc; dùng khi rủi ro giảm ≥ 40$
  let use = 0, gain = 0;
  for (let p = 0; p < 40; p++) for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
    const w = occ[p] / 36;
    const fwd = risk((p + a + b) % 40);
    const best = alt(p, a, b);
    if (fwd - best >= 40) { use += w; gain += w * (fwd - best); }
  }
  return { use, gain: use ? gain / use : 0 };
}
const DODGE = {
  back: dodgeGain((p, a, b) => risk((p - a - b + 40) % 40)),
  bike: dodgeGain((p, a, b) => risk((p + Math.min(a, b)) % 40)),
  reroll: dodgeGain((p, a, b) => Math.min(
    ...[a, b].map((keep) => [1, 2, 3, 4, 5, 6].reduce((n, x) => n + risk((p + keep + x) % 40), 0) / 6))),
};
/** Mỗi vòng dùng tối đa `charges` lần; lượt có cú lắc đáng dùng với xác suất `use` mỗi cú. */
const perLapDodge = (d, charges, cooldown = 1) => {
  const rollsPerLap = P.rolls * LAP * cooldown;
  const expUses = Math.min(charges, d.use * rollsPerLap);
  return (expUses * d.gain) / (LAP * cooldown);
};

/** Giá trị một lá bài với người rút ở thế cờ tham chiếu. */
function cardValue(card, from) {
  const t = card.type ?? 'bank';
  if (t === 'bank') return card.amount;
  if (t === 'collect') return card.amount;
  if (t === 'repair') return -(6 * card.perHouse);
  if (t === 'move') {
    if (card.jail) return -120;
    if (card.ahead) { const to = (from + card.ahead) % 40; return (to < from ? GO_SALARY : 0) - risk(to); }
    const pool = card.nearest ? NEAREST[card.nearest] : [card.to ?? 0];
    const ahead = (id) => (((id - from) % 40) + 40) % 40 || 40;
    const dest = pool.reduce((a, b) => (ahead(b) < ahead(a) ? b : a));
    return (dest < from || dest === 0 ? GO_SALARY : 0) - risk(dest);
  }
  return 60; // thẻ giữ trong túi
}
/** Bài Tẩy: rút `n` chọn lá tốt nhất, trừ giá trị rút một lá. */
function bestOf(deck, n, from) {
  const vals = deck.map((c) => cardValue(c, from));
  const one = vals.reduce((a, b) => a + b, 0) / vals.length;
  let tot = 0, cnt = 0;
  const K = 4000;
  for (let i = 0; i < K; i++) {
    const pick = []; const idx = new Set();
    while (pick.length < n) { const j = Math.floor(Math.random() * vals.length); if (!idx.has(j)) { idx.add(j); pick.push(vals[j]); } }
    tot += Math.max(...pick); cnt++;
  }
  return tot / cnt - one;
}
const badCost = (deck, from) => {
  const bad = deck.filter((c) => { const t = c.type ?? 'bank'; return (t === 'bank' && c.amount < 0) || t === 'repair' || (t === 'move' && c.jail); });
  return { p: bad.length / deck.length, cost: bad.reduce((n, c) => n - cardValue(c, from), 0) / Math.max(1, bad.length) };
};

/* ================================================================ 3. giá trị từng kỹ năng (tiền mỗi lượt) */

/** `*` = có giả định, ghi ngay trong hàm. */
const EV = {
  /* ---- Công Nhân */
  cn1: () => P.moves * prm('cn1').chance * prm('cn1').amount,
  cn2a: () => P.go * prm('cn2a').bonus,
  cn2b: () => {
    const tax = f[4] * 200 + f[38] * 100;
    const cards = P.chance * badCost(C.CHANCE, 7).p * badCost(C.CHANCE, 7).cost * 0.6 + P.chest * badCost(C.CHEST, 17).p * badCost(C.CHEST, 17).cost * 0.6;
    return (tax + cards) * (1 - prm('cn2b').pay);
  },
  cn3: () => P.go * Math.min(prm('cn3').cap, prm('cn3').perLap * LAPS_MID),
  cnX2: () => P.jail * (prm('cnX2').comp + JAIL_FINE * 0.5),
  cnX1: () => (P.go / prm('cnX1').every) * POINT * (TURNS / 2),   // * một điểm dùng trong nửa ván còn lại
  cnS1: () => {
    const good = (deck) => deck.filter((c) => (c.type ?? 'bank') === 'bank' && c.amount > 0);
    const gv = (deck) => good(deck).reduce((n, c) => n + c.amount, 0) / deck.length;
    return prm('cnS1').chance * (P.chance * badCost(C.CHANCE, 7).p * badCost(C.CHANCE, 7).cost + P.chest * badCost(C.CHEST, 17).p * badCost(C.CHEST, 17).cost)
      + prm('cnS1').bonus * (P.chance * gv(C.CHANCE) + P.chest * gv(C.CHEST));
  },
  cnS2: () => {  // * mỗi lượt ngồi yên cuối ván né được R_OUT, mất phần lương tương ứng
    const q = prm('cnS2');
    const sitGain = Math.max(0, R_OUT - GO_SALARY * P.go) * q.stay;
    return P.jail * (q.pay * (2 + q.stay) + sitGain * 0.5);
  },
  cnU: () => {
    const q = prm('cnU'); const L = LAPS_LATE;
    const rate = Math.min(q.cap, q.base + q.perLap * L - q.jail * P.jail * LAP * L);
    return (P.go * OPP * Math.min(CASH * rate, q.each * L));
  },
  cnV: () => (prm('cnV').cover * 0.6) / (prm('cnV').cooldown * LAP),   // * thiếu tiền đủ nặng 60% số lần hồi xong

  /* ---- Du Hành */
  dh1: () => {
    const pay = [25, 35].reduce((n, t) => n + f[t] * rent(t), 0) * (1 - prm('dh1').pay);
    const own = OPP * [5, 15].reduce((n, t) => n + f[t], 0) * prm('dh1').own * count(0, 'station');
    return pay + own;
  },
  dh2a: () => [5, 15, 25, 35].reduce((n, t) => n + f[t], 0) * (GO_SALARY * 10 / 40 + prm('dh2a').bonus),  // * đi thêm 10 ô = 1/4 vòng lương
  dh2b: () => P.landGo * GO_SALARY * (prm('dh2b').goMult - GO_LANDING_MULT) + f[20] * prm('dh2b').parking,
  dh3: () => perLapDodge(DODGE.back, prm('dh3').charges, prm('dh3').cooldown),
  dhX2: () => P.rolls * (6 / 36) * prm('dhX2').bonus,
  dhX1: () => { const q = prm('dhX1'); const share = 2 * OPP * f.reduce((n, x, t) => n + x * occ[t], 0); return share * q.chance * Math.min(q.cap, CASH * q.pct); },   // mình dừng lên người khác + người khác dừng lên mình
  // * bật suốt: mỗi cú lắc đáng né thì né được, cộng tiền xăng level 3; chưa trừ phần lương mất vì đi chậm
  dhS1: () => P.rolls * (DODGE.bike.use * DODGE.bike.gain + prm('dhS1').gas),
  dhS2: () => OPP * P.moves * g.reduce((n, x, t) => n + (x / P.moves) * occ[t], 0) * prm('dhS2').fee,
  dhU: () => (GO_SALARY * GO_LANDING_MULT + R_OUT * 3) / (prm('dhU').cooldown * LAP),  // * về thẳng ô Bắt Đầu + né 3 lượt tiền thuê
  dhV: () => OPP * [5, 15, 12].reduce((n, t) => n + g[t], 0) * prm('dhV').toll,

  /* ---- Đỏ Đen */
  dd1: () => P.rolls * (prm('dd1').even / 2 - prm('dd1').odd / 2),
  dd2a: () => 0.5 * 100 * prm('dd2a').payout - 0.5 * 100,                      // * cược 100$ mỗi lượt
  dd2b: () => P.rolls * (1 / 6) * prm('dd2b').double,
  dd3: () => perLapDodge(DODGE.reroll, prm('dd3').charges, prm('dd3').cooldown),
  ddX2: () => 0.5 * 100 * prm('ddX2').back,
  ddX1: () => Math.max(0, (15 / 36) * 100 * prm('ddX1').payout - (21 / 36) * 100 - (0.5 * 100 * prm('dd2a').payout - 50)),
  ddS1: () => { const q = prm('ddS1'); return P.chance * bestOf(C.CHANCE, q.draw, 7) + (q.chest ? P.chest * bestOf(C.CHEST, q.draw, 17) : 0); },
  ddS2: () => P.go * GO_SALARY * (prm('ddS2').win * 2 + (1 - prm('ddS2').win) * 0.5 - 1),
  ddU: () => { const q = prm('ddU'); return (0.5 * OPP * CASH * q.win - 0.5 * OPP * CASH * q.lose) / (q.cooldown * LAP); },
  ddV: () => OPP * P.rolls * prm('ddV').ev,

  /* ---- Đầu Cơ */
  dc1: () => (21 * 180 * prm('dc1').rate) / TURNS,         // * người khác mua ~21 ô, giá trung bình 180$, cả ván
  dc2a: () => Math.min(prm('dc2a').cap, 300 * prm('dc2a').rate) * 3 / TURNS,   // * 3 giao dịch mỗi ván
  dc2b: () => (24 * prm('dc2b').build + 6 * prm('dc2b').sell) / TURNS,         // * người khác xây 24 căn, bán 6
  dc3: () => 100 / (prm('dc3').cooldown * LAP),            // * mỗi lần ép mua lời ~100$ (ô ghép bộ màu)
  dcX2: () => (7 * 180 * prm('dcX2').back) / TURNS,        // * mình mua 7 ô
  dcX1: () => R_IN * 0.5 * prm('dcX1').late,               // * nửa số lần thu thuê người trả đang có ô thế chấp
  dcS1: () => (0.5 * 200 * (1 - prm('dcS1').price) * prm('dcS1').charges) / LAP,   // * nửa số vòng có ô để nhặt
  dcS2: () => R_OPP * prm('dcS2').share,
  dcU: () => incomeOn(unbuilt) * (prm('dcU').mult - 1),
  dcV: () => (0.5 * 200 * (1 - (0.5 + 0.5 * prm('dcV').premium)) * prm('dcV').charges) / LAP + 30 / LAP,   // * nửa số vòng có ô thế chấp; +30$ mỗi vòng giá trị ô về tay (ghép bộ)

  /* ---- An Cư */
  ac1: () => (10 * 120 * prm('ac1').cut) / TURNS,          // * mình xây 10 căn, giá 120$
  ac2a: () => incomeOn(built) * Math.min(prm('ac2a').cap, prm('ac2a').perLap * LAPS_MID),
  ac2b: () => R_IN * prm('ac2b').perColor * myColors,
  ac3: () => (8 * prm('ac3').perHouse) / LAP,              // * giữ 8 căn nhà, nhận mỗi lần qua ô Bắt Đầu
  acX2: () => mine.reduce((n, t) => n + f[t], 0) * prm('acX2').bonus,
  acX1: () => R_OUT * (prm('acX1').under >= 250 ? 0.35 : 0.3) * (1 - prm('acX1').pay),   // * 30% số lượt tiền mặt dưới 200$ (35% dưới 250$)
  acS1: () => OPP * [8, 21].reduce((n, t) => n + f[t] * (BOARD[t].rents[1] * (1) - rent(t)), 0) - (2 * BOARD[8].house_cost * (prm('acS1').mult)) / TURNS,
  acS2: () => incomeOn(mine.filter((t) => owner.get((t + 39) % 40) === 0 || owner.get((t + 1) % 40) === 0)) * prm('acS2').bonus,
  acU: () => prm('acU').houses * (100 / LAP + OPP * 0.027 * 60),    // * mỗi vòng 1 căn: tiết kiệm 100$ + thuê tăng ~60$ mỗi lần dừng
  acV: () => OPP * mine.reduce((n, t) => n + f[t], 0) * prm('acV').per * myColors,
};
const ASSUMED = new Set(['dhX1', 'cnS1', 'cnX1', 'cnS2', 'cnV', 'dh2a', 'dhU', 'dd2a', 'dd3', 'dc1', 'dc2a', 'dc2b', 'dc3', 'dcX2', 'dcX1', 'dcS1', 'dcV', 'ac1', 'ac3', 'acX1', 'acU', 'dh3', 'dhS1']);

// Một điểm = trung bình tiền mỗi lượt của ô cấp 2 (mỗi ô 1 điểm)
const tier2 = D.SKILLS.filter((s) => s.tier === 2);
POINT = tier2.reduce((n, s) => n + EV[s.id](), 0) / tier2.length;

/* ================================================================ 4. in bảng */

const cost = (s) => D.TIER_COST[s.tier];
const LEARN_LAP = (s) => (s.tier === 1 ? 1 : s.tier === 2 ? 2 : s.tier === 3 ? 4 : 7);
const life = (s) => Math.max(0, TURNS - LEARN_LAP(s) * LAP);
const row = (s) => ({ s, ev: EV[s.id](), perPt: EV[s.id]() / cost(s), total: EV[s.id]() * life(s) });

console.log(`\nMô phỏng ${N} lượt: qua ô Bắt Đầu ${P.go.toFixed(3)}/lượt (1 vòng ≈ ${LAP.toFixed(1)} lượt), lắc ${P.rolls.toFixed(2)} lần/lượt,`);
console.log(`vào tù ${P.jail.toFixed(3)}/lượt, Cơ Hội ${P.chance.toFixed(3)}, Khí Vận ${P.chest.toFixed(3)}. Thế cờ tham chiếu: thu thuê ${R_IN.toFixed(1)}$/lượt, trả ${R_OUT.toFixed(1)}$/lượt.`);
console.log(`Level ${LV}. Ván ${TURNS} lượt. Một điểm ≈ ${POINT.toFixed(1)}$/lượt.\n`);

const fmt = (n) => (n >= 0 ? ' ' : '') + n.toFixed(1);
for (const b of D.BRANCHES) {
  console.log(`── ${b.name}`);
  for (const s of D.SKILLS.filter((x) => x.branch === b.key).sort((x, y) => x.tier - y.tier || String(x.slot).localeCompare(String(y.slot)))) {
    const r = row(s);
    const tag = s.tier === 4 ? `TT ${s.slot}` : s.tier === 3 && (s.slot === 'c' || s.slot === 'd') ? `P${s.slot}  ` : `C${s.tier}${s.slot ?? ' '}  `;
    console.log(`  ${tag} ${(s.name + (ASSUMED.has(s.id) ? ' *' : '')).padEnd(24)} ${fmt(r.ev).padStart(7)}$/lượt  ${fmt(r.perPt).padStart(7)}$/lượt/điểm  cả ván ${r.total.toFixed(0).padStart(6)}$`);
  }
}

// Đường đi: từ gốc tới mỗi lá (tối thượng, nhánh phụ)
const byId = new Map(D.SKILLS.map((s) => [s.id, s]));
const chain = (id) => { const out = []; let s = byId.get(id); while (s) { out.unshift(s); s = s.requires?.length ? byId.get(s.requires[0]) : null; } return out; };
console.log('\n── Đường đi (tổng tiền cả ván của mọi ô trên đường)');
const paths = D.SKILLS.filter((s) => s.tier === 4 || (s.tier === 3 && (s.slot === 'c' || s.slot === 'd')));
const rows = paths.map((leaf) => {
  const c = chain(leaf.id);
  const pts = c.reduce((n, s) => n + cost(s), 0);
  const total = c.reduce((n, s) => n + row(s).total, 0);
  return { leaf, c, pts, total };
}).sort((a, b) => b.total / b.pts - a.total / a.pts);
for (const r of rows) {
  console.log(`  ${r.leaf.name.padEnd(22)} ${String(r.pts).padStart(2)} điểm  ${r.total.toFixed(0).padStart(6)}$  (${(r.total / r.pts).toFixed(0).padStart(5)}$/điểm)  ${r.c.map((s) => s.name).join(' → ')}`);
}

/* ================================================================ 5. Đỏ Đen: hên xui cả ván */

/**
 * Nhánh cờ bạc phải "rủi ro cao, thưởng cao": may rủi trung bình (P50) thì
 * ngang các đường khác, hên (P90) thì lời hẳn, xui (P10) thì thiệt nhưng không
 * mất trắng. Chơi lại từng lượt với xí ngầu và kết quả cược thật; kỹ năng là
 * lựa chọn chứ không phải may rủi (Xí Ngầu Gian, Bài Tẩy) cộng theo giá trị
 * trung bình như bảng trên.
 */
const pick = (v) => (Array.isArray(v) ? (Number.isInteger(v[0]) ? v[0] + Math.round(Math.random() * (v[1] - v[0]) / 5) * 5 : v[0] + Math.random() * (v[1] - v[0])) : v);
const raw = (id, lv = LV) => D.SKILLS.find((s) => s.id === id).levels[lv - 1];
function gambleGame(c) {
  const at = Object.fromEntries(c.map((s) => [s.id, LEARN_LAP(s) * LAP]));
  const on = (id, t) => at[id] != null && t >= at[id];
  let tot = 0;
  const LOTTO = 9;
  for (let t = 0; t < TURNS; t++) {
    // lượt của mình: 1–3 lần lắc
    const rs = [];
    for (let d = 0; d < 3; d++) { const a = die(), b = die(); rs.push([a, b]); if (a !== b) break; }
    for (const [a, b] of rs) {
      if (on('dd1', t)) tot += (a + b) % 2 === 0 ? pick(raw('dd1').even) : -pick(raw('dd1').odd);
      if (on('dd2b', t) && a === b) tot += pick(raw('dd2b').double);
    }
    const [a, b] = rs[0];
    if (on('dd2a', t)) {
      const txu = on('ddX1', t);
      const win = txu ? a + b >= 8 : (a + b) % 2 === 0;
      if (win) tot += 100 * pick(raw(txu ? 'ddX1' : 'dd2a').payout);
      else tot += -100 + (on('ddX2', t) ? 100 * pick(raw('ddX2').back) : 0);
    }
    if (on('ddS2', t) && Math.random() < P.go) tot += Math.random() < raw('ddS2').win ? GO_SALARY : -GO_SALARY / 2;
    if (on('ddU', t) && Math.random() < 1 / (raw('ddU').cooldown * LAP)) {
      tot += Math.random() < 0.5 ? OPP * CASH * pick(raw('ddU').win) : -OPP * CASH * raw('ddU').lose;
    }
    if (on('ddV', t)) {
      for (let k = 0; k < OPP; k++) {
        for (let d = 0; d < 3; d++) { const x = die(), y = die(); if (x + y === LOTTO) tot += Math.round((raw('ddV').ev * 36) / D.WAYS(LOTTO) / 5) * 5; if (x !== y) break; }
      }
    }
    for (const id of ['dd3', 'ddS1']) if (on(id, t)) tot += EV[id]();
  }
  // Ô không phải Đỏ Đen trên đường (không có) — ô Đỏ Đen tất định cũng đã cộng ở trên
  return tot;
}
const allPerPt = rows.map((r) => r.total / r.pts).sort((x, y) => x - y);
const MED = allPerPt[Math.floor(allPerPt.length / 2)];
console.log(`\n── Đỏ Đen: hên xui cả ván (3000 ván mỗi đường), so với trung vị mọi đường ${MED.toFixed(0)}$/điểm`);
for (const r of rows.filter((x) => x.leaf.branch === 'doden')) {
  const out = Array.from({ length: 3000 }, () => gambleGame(r.c)).sort((x, y) => x - y);
  const q = (p) => out[Math.floor(p * out.length)] / r.pts;
  console.log(`  ${r.leaf.name.padEnd(22)} xui P10 ${q(0.1).toFixed(0).padStart(5)}  P50 ${q(0.5).toFixed(0).padStart(5)}  hên P90 ${q(0.9).toFixed(0).padStart(5)} $/điểm   (P50 = ${(q(0.5) / MED * 100).toFixed(0)}% trung vị, P90 = ${(q(0.9) / MED * 100).toFixed(0)}%)`);
}
