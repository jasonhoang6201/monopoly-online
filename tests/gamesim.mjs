/**
 * Cân bằng cây kỹ năng bằng cách cho bot chơi trọn ván — không phải bài kiểm
 * thử giao diện, không cần dev server. Bổ sung cho tests/balance.mjs: bảng ấy
 * quy từng ô ra tiền mỗi lượt ở một thế cờ cố định, còn đây đo thẳng tỉ lệ
 * thắng, nên bắt được những thứ bảng tiền không thấy (né khách sạn, phá bộ
 * màu, hệ số nhân chồng nhau, cú tất tay cuỗm tiền mặt cả bàn).
 *
 *   node tests/gamesim.mjs                  → tỉ lệ thắng của từng lối học mẫu
 *   node tests/gamesim.mjs --skills 3000    → từng kỹ năng, 3000 ván mỗi ô
 *   node tests/gamesim.mjs --skills 3000 --check 4
 *                                           → như trên, thoát mã 1 nếu có tối
 *                                             thượng lệch quá 4 điểm % so với
 *                                             trung bình tầng
 *   node tests/gamesim.mjs --skills 3000 --only dhU,t4
 *                                           → chỉ vài ô (id) hoặc cả tầng (t1…t4)
 *   node tests/gamesim.mjs --games 8000     → số ván cho bảng lối học
 *   node tests/gamesim.mjs --ovr thu.json   → thử bộ số khác mà không sửa
 *                                             data/skills.js: { id: [lv1, lv2, lv3] }
 *
 * Luật thuê, xây nhà, lương, tù, phá sản, Nhặt Hàng Thừa, Thâu Tóm… chạy thẳng
 * bằng src/core. Phần nằm ở game/ (hộp hỏi, thứ tự trong lượt) được dựng lại ở
 * đây theo đúng thứ tự của `Game.takeRoll`: đặt cược → lắc → Xe Đạp → chốt
 * cược / Tất Tay → Xí Ngầu Gian / Quay Đầu → thưởng theo xí ngầu → đi.
 *
 * Bot quyết định bằng luật đơn giản ghi ngay cạnh từng chỗ. Không có: thẻ Thời
 * Cuộc, đấu giá, thẻ giữ trong túi. Giao dịch chỉ một kiểu: thiếu đúng một ô
 * của bộ màu thì hỏi mua ô ấy với giá 1.5×, chủ ô (chỉ giữ ô lẻ ấy) nhận 60%
 * số lần.
 *
 * Một kỹ năng được đo bằng một bot học đúng đường từ gốc tới ô ấy rồi nâng ô ấy
 * lên level 3, đấu với 3 bot theo lối học mẫu chọn ngẫu nhiên. Ô càng sâu càng
 * tốn điểm nên so trong cùng tầng.
 */
import { createServer } from 'vite';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : (process.argv[i + 1] ?? true); };
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const S = await vite.ssrLoadModule('/src/core/state.js');
const K = await vite.ssrLoadModule('/src/core/skills.js');
const D = await vite.ssrLoadModule('/src/data/skills.js');
const B = await vite.ssrLoadModule('/src/data/board.js');
const C = await vite.ssrLoadModule('/src/data/cards.js');
await vite.close();

const { BOARD, GROUP_TILES, GO_SALARY } = B;
const {
  has, param, roll, credit, ready, spend, onLap, levyEach, freeHouseTarget, tollStops, tourPassed,
  payerRent, rentGains, canLearn, learnSkill, lottoPrize, levelOf, usesLeft, leftoverOffers,
  forecloseOffers, canSeize, setSkillOn,
} = K;
const SK = new Map(D.SKILLS.map((s) => [s.id, s]));

if (arg('--ovr')) {
  const { readFileSync } = await import('node:fs');
  for (const [id, lv] of Object.entries(JSON.parse(readFileSync(arg('--ovr'), 'utf8')))) SK.get(id).levels = lv;
}

const decks = { chance: C.CHANCE.filter((c) => !c.theme), chest: C.CHEST.filter((c) => !c.theme) };
const NEAREST = { station: [5, 15, 25, 35], utility: [12, 28] };
const STATIONS = NEAREST.station;
const die = () => 1 + Math.floor(Math.random() * 6);
const wrap = (n) => ((n % 40) + 40) % 40;

/* ------------------------------------------------------------ lối học mẫu */

/** Mỗi lối là một danh sách id theo thứ tự học; id lặp lại là lên level. */
const BUILDS = {
  'Không kỹ năng': [],
  'CN Liên Đoàn': ['cn1', 'cn2a', 'cn3', 'cnU', 'cnU', 'cnU', 'cn3', 'cn3', 'cn2a'],
  'CN Lão Làng + BHXH': ['cn1', 'cn2b', 'cnX1', 'cnX1', 'cnX1', 'cnV', 'cnV', 'cnV', 'cn2b'],
  'CN Ở Tù + Bảo Hộ': ['cn1', 'cnX2', 'cnS2', 'cn2b', 'cnS1', 'cnS2', 'cnS2', 'cnS1', 'cnS1'],
  'DH BOT': ['dh1', 'dh2b', 'dhX1', 'dhV', 'dhV', 'dhV', 'dhX1', 'dh1'],
  'DH Xuyên Việt': ['dh1', 'dh2a', 'dh3', 'dhU', 'dhU', 'dhU', 'dh2a', 'dh2a', 'dh3'],
  'DH Xe Đạp + Tour': ['dh1', 'dh2b', 'dhS1', 'dhX2', 'dhS2', 'dhS1', 'dhS1', 'dhS2', 'dhS2'],
  'DĐ Tất Tay': ['dd1', 'dd2b', 'dd3', 'ddU', 'ddU', 'ddU', 'dd3', 'dd3'],
  'DĐ Xổ Số': ['dd1', 'dd2a', 'ddX1', 'ddV', 'ddV', 'ddV', 'ddX1', 'ddX1'],
  'DĐ Cờ Bạc': ['dd1', 'dd2a', 'ddX2', 'ddS2', 'ddS1', 'ddS2', 'ddS2', 'dd2a', 'dd2a'],
  'ĐC Cơn Sốt': ['dc1', 'dc2a', 'dc3', 'dcU', 'dcU', 'dcU', 'dc3', 'dc3'],
  'ĐC Siết Nợ': ['dc1', 'dc2b', 'dcX1', 'dcV', 'dcV', 'dcV', 'dc1', 'dc1'],
  'ĐC Môi Giới + Góp Vốn': ['dc1', 'dc2b', 'dcX2', 'dcS2', 'dc1', 'dc1', 'dcS2', 'dcS2', 'dcS1'],
  'AC Phố Cổ': ['acX2', 'ac2a', 'ac3', 'acU', 'acU', 'acU', 'ac2a', 'ac2a'],
  'AC Mặt Tiền': ['acX2', 'ac2b', 'acX1', 'acV', 'acV', 'acV', 'ac2b', 'ac2b'],
  'AC Chung Cư': ['acX2', 'ac2b', 'acS1', 'acS1', 'acS1', 'ac1', 'acS2', 'acS2'],
  'Combo Nhặt + Thâu Tóm + Chung Cư': ['dc1', 'dc2b', 'dcS1', 'acX2', 'ac2b', 'acS1', 'dc2a', 'dc3', 'acS1'],
};

/* ------------------------------------------------------------ một ván */

function game(names, builds = BUILDS) {
  const st = new S.GameState(names);
  st.settings.events = 'off';
  const P = st.players;
  const path = new Map(P.map((p, i) => [p.id, builds[names[i]]]));
  const others = (p) => st.alive().filter((q) => q.id !== p.id);
  /** Chuyển tiền mặt, không quá số đang có — kiểu "ai không đủ thì nộp hết". */
  const give = (from, to, n) => { n = Math.max(0, Math.min(Math.round(n), from.money)); from.money -= n; if (to) to.money += n; return n; };
  const bank = (p, id, n) => { n = Math.round(n); p.money += n; credit(p, id, n); return n; };

  /* ---- trả tiền: Bảo Hiểm Xã Hội, bán nhà, thế chấp, rồi mới phá sản */
  function raise(p, need) {
    for (let guard = 0; p.money < need && guard < 200; guard++) {
      const built = st.propertiesOf(p.id).filter((id) => st.canSellHouse(p.id, id).ok);
      if (built.length) { st.sellHouse(p.id, built[0]); continue; }
      const m = st.propertiesOf(p.id).filter((id) => st.canMortgage(p.id, id).ok).sort((a, b) => BOARD[a].price - BOARD[b].price);
      if (m.length) { st.mortgage(p.id, m[0]); continue; }
      break;
    }
  }
  function pay(p, amt, to = null) {
    amt = Math.round(amt);
    if (amt <= 0 || p.bankrupt) return !p.bankrupt;
    if (p.money < amt && ready(p, 'cnV')) {
      const cover = Math.min(param(p, 'cnV').cover, amt - p.money);
      p.money += cover; spend(p, 'cnV'); credit(p, 'cnV', cover);
    }
    if (p.money < amt) raise(p, amt);
    if (p.money < amt) { if (to) to.money += p.money; st.bankrupt(p.id); return false; }
    p.money -= amt; if (to) to.money += amt;
    return true;
  }

  /* ---- học theo lối: ô nào chưa đủ điều kiện lên level thì bỏ qua, học ô sau */
  function learn(p) {
    const need = new Map();
    for (const id of path.get(p.id)) {
      need.set(id, (need.get(id) ?? 0) + 1);
      if (levelOf(p, id) >= need.get(id)) continue;
      const c = canLearn(p, id, st);
      if (c.ok) { learnSkill(p, id, st); setSkillOn(p, id, true); if (p.skillPoints <= 0) return; continue; }
      if (/điểm/.test(c.reason)) return;
    }
  }

  /** Rủi ro dừng ở ô `id` với người `p` — cho mọi quyết định né. */
  const risk = (p, id) => {
    const o = st.ownerOf(id);
    if (o && o.id !== p.id) return payerRent(st, p, id, st.rentFor(id, 7));
    return id === 30 ? 150 : id === 4 ? 200 : id === 38 ? 100 : 0;
  };
  /** Rủi ro trung bình cú lắc tới từ ô `pos`, theo cách tính bước `step(a, b)`. */
  const expRisk = (p, pos, step) => {
    let n = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
      const s = step(a, b);
      n += risk(p, wrap(pos + s)) - (pos + s >= 40 ? GO_SALARY : 0);
    }
    return n / 36;
  };

  /* ---- qua ô Bắt Đầu */
  function passGo(p, landed) {
    let { total, parts } = st.payslip(landed, p);
    if (has(p, 'ddS2')) {
      // Cò Quay: luôn bật — kỳ vọng ≥ 1.25 lần lương ở mọi level
      const out = Math.random() < param(p, 'ddS2').win ? total * 2 : Math.round(total / 2);
      credit(p, 'ddS2', Math.max(0, out - total)); total = out;
    }
    p.money += total;
    for (const [id, n] of Object.entries(parts)) credit(p, id, n);
    onLap(p);
    if (has(p, 'cnU')) for (const q of others(p)) credit(p, 'cnU', give(q, p, levyEach(p)));
    if (has(p, 'acU')) {
      for (let k = 0; k < param(p, 'acU').houses; k++) {
        const t = freeHouseTarget(st, p.id);
        if (t == null) break;
        st.build(p.id, t, { free: true }); credit(p, 'acU');
        if (st.housesOn(t) === 5) st.heritage.add(t);
      }
    }
    learn(p);
  }

  function toJail(p) {
    st.sendToJail(p);
    if (has(p, 'cnX2')) bank(p, 'cnX2', roll(param(p, 'cnX2').comp));
  }

  /* ---- thẻ Cơ Hội / Khí Vận */
  const cardBad = (c) => { const t = c.type ?? 'bank'; return (t === 'bank' && c.amount < 0) || t === 'repair' || (t === 'move' && c.jail); };
  /** Giá trị một lá với người rút, để Bài Tẩy chọn lá. */
  function cardValue(p, c) {
    const t = c.type ?? 'bank';
    if (t === 'bank') return c.amount;
    if (t === 'collect') return c.amount * others(p).length;
    if (t === 'repair') return -st.propertiesOf(p.id).reduce((n, id) => n + (st.housesOn(id) === 5 ? c.perHotel : st.housesOn(id) * c.perHouse), 0);
    if (t === 'skill') return 200;
    if (t === 'move') {
      if (c.jail) return -150;
      const to = c.ahead ? wrap(p.pos + c.ahead) : moveTarget(p, c);
      return (to < p.pos ? GO_SALARY : 0) - risk(p, to);
    }
    return 0;
  }
  function moveTarget(p, c) {
    const pool = c.nearest ? NEAREST[c.nearest] : [c.to ?? 0];
    const ah = (id) => wrap(id - p.pos) || 40;
    return pool.reduce((a, b) => (ah(b) < ah(a) ? b : a));
  }
  function drawCard(p, kind) {
    const deck = decks[kind];
    const lv = has(p, 'ddS1') ? param(p, 'ddS1') : null;
    const n = lv && (kind === 'chance' || lv.chest) ? lv.draw : 1;
    const hand = [];
    while (hand.length < n) { const c = deck[Math.floor(Math.random() * deck.length)]; if (!hand.includes(c)) hand.push(c); }
    if (n > 1) credit(p, 'ddS1');
    return hand.reduce((a, b) => (cardValue(p, b) > cardValue(p, a) ? b : a));
  }
  function card(p, c) {
    if (cardBad(c) && has(p, 'cnS1') && Math.random() < param(p, 'cnS1').chance) { credit(p, 'cnS1'); return; }
    const type = c.type ?? 'bank';
    if (type === 'bank') {
      if (c.amount >= 0) { p.money += c.amount; if (has(p, 'cnS1')) bank(p, 'cnS1', c.amount * param(p, 'cnS1').bonus); }
      else {
        let n = -c.amount;
        if (has(p, 'cn2b')) { const k = roll(param(p, 'cn2b').pay); credit(p, 'cn2b', n - n * k); n *= k; }
        pay(p, n);
      }
    } else if (type === 'collect') {
      for (const q of others(p)) pay(q, c.amount, p);
    } else if (type === 'repair') {
      pay(p, -cardValue(p, c));
    } else if (type === 'move') {
      if (c.jail) return toJail(p);
      return moveBy(p, c.ahead ?? (wrap(moveTarget(p, c) - p.pos) || 40), 7);
    } else if (type === 'skill') { p.skillPoints += c.points ?? 1; learn(p); }
  }

  /* ---- dừng ở ô */
  function land(p, sum, express = true) {
    const id = p.pos, t = BOARD[id];
    if (id === 30) return toJail(p);
    // Hai Ngón: mình dừng lên ô có người, hoặc người khác dừng lên ô mình đứng
    if (has(p, 'dhX1')) {
      const here = others(p).filter((q) => q.pos === id && !q.inJail);
      if (here.length && Math.random() < param(p, 'dhX1').chance) {
        const q = here.reduce((a, b) => (b.money > a.money ? b : a));
        credit(p, 'dhX1', give(q, p, Math.min(param(p, 'dhX1').cap, q.money * roll(param(p, 'dhX1').pct))));
      }
    }
    for (const q of others(p)) {
      if (q.pos === id && has(q, 'dhX1') && !q.inJail && Math.random() < param(q, 'dhX1').chance) {
        credit(q, 'dhX1', give(p, q, Math.min(param(q, 'dhX1').cap, p.money * roll(param(q, 'dhX1').pct))));
      }
    }
    if (t.ownable) {
      ownable(p, id, sum);
      if (express && t.type === 'station' && !p.bankrupt) takeExpress(p);
      return;
    }
    if (id === 4 || id === 38) {
      let n = id === 4 ? 200 : 100;
      if (has(p, 'cn2b')) { const k = roll(param(p, 'cn2b').pay); credit(p, 'cn2b', n - n * k); n *= k; }
      return pay(p, n);
    }
    if (id === 20 && has(p, 'dh2b')) return bank(p, 'dh2b', roll(param(p, 'dh2b').parking));
    if (t.type === 'chance' || t.type === 'chest') return card(p, drawCard(p, t.type));
  }

  function ownable(p, id, sum) {
    const t = BOARD[id];
    const owner = st.ownerOf(id);
    if (!owner) {
      // Mua nếu còn dư 100$ sau khi mua
      if (p.money - t.price >= 100) {
        st.buy(p.id, id);
        if (has(p, 'dcX2')) bank(p, 'dcX2', t.price * roll(param(p, 'dcX2').back));
        for (const q of others(p)) if (has(q, 'dc1')) bank(q, 'dc1', t.price * roll(param(q, 'dc1').rate));
      }
      return;
    }
    if (owner.id === p.id) { if (has(p, 'acX2')) bank(p, 'acX2', roll(param(p, 'acX2').bonus)); return; }
    if (trySeize(p, id)) return;
    const rent = st.rentFor(id, sum);
    if (rent <= 0) return;
    const due = payerRent(st, p, id, rent);
    for (const [sid, g] of rentGains(st, id, rent)) credit(owner, sid, g);
    if (has(p, 'dh1') && t.type === 'station') credit(p, 'dh1', rent - due);
    if (has(p, 'acX1') && due < rent) credit(p, 'acX1', rent - due);
    if (has(owner, 'dcX1') && due > rent) credit(owner, 'dcX1', due - rent);
    const before = owner.money;
    pay(p, due, owner);
    const got = owner.money - before;
    for (const q of others(owner)) if (q.stake === owner.id && has(q, 'dcS2')) bank(q, 'dcS2', got * param(q, 'dcS2').share);
  }

  /** Thâu Tóm: ép mua khi ô giúp mình gom bộ, chặn bộ người khác, hoặc mình có Chung Cư Mini. */
  function trySeize(p, id) {
    if (!canSeize(st, p, id)) return false;
    const owner = st.ownerOf(id);
    const g = BOARD[id].color_group;
    const mine = g ? GROUP_TILES[g].filter((x) => st.owner.get(x) === p.id).length : 0;
    const theirs = g ? GROUP_TILES[g].filter((x) => st.owner.get(x) === owner.id).length : 0;
    const useful = mine > 0 || theirs > 1 || has(p, 'acS1') || !g;
    const price = Math.round(BOARD[id].price * roll(param(p, 'dc3').premium));
    if (!useful || p.money - price < 150) return false;
    spend(p, 'dc3'); credit(p, 'dc3');
    pay(p, price, owner);
    st.transfer(id, p.id);
    return true;
  }

  /** Tàu Tốc Hành: đi tiếp khi lời (thưởng + lương − rủi ro ô đích > 0, hoặc ô đích còn trống mua được). */
  function takeExpress(p) {
    if (!has(p, 'dh2a') || p.inJail) return;
    const { bonus, any } = param(p, 'dh2a');
    const i = STATIONS.indexOf(p.pos);
    const dests = any ? [1, 2, 3].map((k) => STATIONS[(i + k) % 4]) : [STATIONS[(i + 1) % 4]];
    const value = (d) => bonus + (d < p.pos ? GO_SALARY : 0) - risk(p, d) + (!st.owner.has(d) && p.money > BOARD[d].price + 100 ? 60 : 0);
    const best = dests.reduce((a, b) => (value(b) > value(a) ? b : a));
    if (value(best) <= 0) return;
    bank(p, 'dh2a', bonus);
    moveBy(p, wrap(best - p.pos) || 40, 7, false);
  }

  function moveBy(p, steps, sum, express = true) {
    const from = p.pos;
    for (const s of tollStops(st, p, from, steps)) credit(s.owner, 'dhV', give(p, s.owner, s.amount));
    for (const q of tourPassed(st, p, from, steps)) credit(p, 'dhS2', give(q, p, param(p, 'dhS2').fee));
    if (has(p, 'cn1') && Math.random() < param(p, 'cn1').chance) bank(p, 'cn1', roll(param(p, 'cn1').amount));
    const to = wrap(from + steps);
    p.pos = to;
    if (steps > 0 && (to < from || to === 0)) passGo(p, to === 0);
    if (!p.bankrupt) land(p, sum, express);
  }

  /* ---- quản lý tài sản: chuộc đất, xây nhà theo lời / vốn */
  function manage(p) {
    for (const id of [...st.mortgaged]) if (st.owner.get(id) === p.id && p.money - BOARD[id].redeem > 400) st.redeem(p.id, id);
    for (let guard = 0; guard < 40; guard++) {
      const opts = st.propertiesOf(p.id).map((id) => ({ id, c: st.canBuild(p.id, id) }))
        .filter((x) => x.c.ok && p.money - x.c.cost >= 200);
      if (!opts.length) break;
      const gain = (x) => (BOARD[x.id].rents[Math.min(5, st.housesOn(x.id) + 1)] - st.rentFor(x.id, 7)) / x.c.cost;
      opts.sort((a, b) => gain(b) - gain(a));
      st.build(p.id, opts[0].id);
    }
  }

  /* ---- giao dịch: thiếu đúng 1 ô của bộ thì hỏi mua ô ấy giá 1.5× */
  function trade(p) {
    for (const g of Object.keys(GROUP_TILES)) {
      const ids = GROUP_TILES[g];
      const miss = ids.filter((x) => st.owner.get(x) !== p.id);
      if (miss.length !== 1) continue;
      const id = miss[0], q = st.ownerOf(id);
      if (!q || st.housesOn(id) > 0 || st.isMortgaged(id)) continue;
      if (ids.filter((x) => st.owner.get(x) === q.id).length > 1) continue;
      const price = Math.round(BOARD[id].price * 1.5);
      if (p.money - price < 150 || Math.random() > 0.6) return;
      give(p, q, price); st.transfer(id, p.id);
      // Cò Đất: người ngoài cuộc ăn tiền cò, như `SkillPlay.tradeFees`
      for (const r of st.alive()) {
        if (!has(r, 'dc2a') || r.id === p.id || r.id === q.id) continue;
        const { rate, cap } = param(r, 'dc2a');
        bank(r, 'dc2a', Math.min(cap, BOARD[id].price * roll(rate)));
      }
      return;
    }
  }

  /* ---- kỹ năng bấm dùng đầu lượt */
  function preRoll(p) {
    trade(p);
    while (usesLeft(p, 'dcS1') > 0) {
      const offers = leftoverOffers(st, p).filter((x) => p.money - x.price >= 150);
      if (!offers.length) break;
      // Ưu tiên ô cùng màu đã có, rồi ô đắt
      const score = (x) => { const g = BOARD[x.id].color_group; return (g ? GROUP_TILES[g].filter((i) => st.owner.get(i) === p.id).length * 1000 : 0) + BOARD[x.id].price; };
      offers.sort((a, b) => score(b) - score(a));
      st.buyAt(p.id, offers[0].id, offers[0].price); spend(p, 'dcS1'); credit(p, 'dcS1');
    }
    while (usesLeft(p, 'dcV') > 0) {
      // Siết ô đang thế chấp (rẻ), hoặc ô giúp mình gom bộ; ô gom bộ trước, rồi ô rẻ so với giá gốc
      const mine = (id) => { const g = BOARD[id].color_group; return g ? GROUP_TILES[g].filter((i) => st.owner.get(i) === p.id).length : 0; };
      const o = forecloseOffers(st, p).filter((x) => p.money - x.bank - x.owner >= 200 && (st.isMortgaged(x.id) || mine(x.id) > 0));
      if (!o.length) break;
      const score = (x) => mine(x.id) * 1000 + BOARD[x.id].price - x.bank - x.owner;
      const x = o.sort((a, b) => score(b) - score(a))[0];
      p.money -= x.bank; give(p, st.ownerOf(x.id), x.owner);
      st.mortgaged.delete(x.id); st.transfer(x.id, p.id); spend(p, 'dcV'); credit(p, 'dcV');
    }
    if (has(p, 'dcS2')) {
      const best = others(p).reduce((a, b) => (st.houseCount(b.id) > st.houseCount(a.id) ? b : a), others(p)[0]);
      if (best) p.stake = best.id;
    }
    if (has(p, 'ddV') && p.lotto == null) p.lotto = 7;
  }

  /** Xuyên Việt: hồi xong là dùng, thay lượt lắc — về đúng ô Bắt Đầu lãnh lương. */
  function teleport(p) {
    if (!ready(p, 'dhU') || p.inJail || !K.teleportTargets(st, p).includes(0)) return false;
    const dest = 0;
    credit(p, 'dhU');
    moveBy(p, wrap(dest - p.pos) || 40, 7);
    spend(p, 'dhU');             // bắt chờ sau khi đi, như `SkillPlay.doTeleport`
    return true;
  }

  /** Cược Chẵn Lẻ / Tài Xỉu: cửa có kỳ vọng cao hơn, chỉ cược khi kỳ vọng dương. */
  function placeBet(p) {
    if (!has(p, 'dd2a')) return null;
    const back = has(p, 'ddX2') ? roll(param(p, 'ddX2').back) : 0;
    const par = 0.5 * roll(param(p, 'dd2a').payout) - 0.5 * (1 - back);
    const big = has(p, 'ddX1') ? (15 / 36) * roll(param(p, 'ddX1').payout) - (21 / 36) * (1 - back) : -1;
    const amount = Math.min(param(p, 'dd2a').max, p.money - 300);
    if (amount < 50 || Math.max(par, big) <= 0) return null;
    return { pick: big > par ? 'big' : 'even', amount };
  }
  const hits = (pick, sum) => (pick === 'even' ? sum % 2 === 0 : pick === 'odd' ? sum % 2 === 1 : pick === 'big' ? sum >= 8 : sum <= 6);

  /** Ở Tù Cho Lành: ngồi yên khi bàn đã nhiều nhà (cú lắc tới kỳ vọng mất hơn 60$). */
  function sit(p) {
    if (!has(p, 'cnS2') || (p.jailSits ?? 0) >= param(p, 'cnS2').stay) return false;
    if (expRisk(p, p.pos, (a, b) => a + b) < 60) return false;
    p.jailSits = (p.jailSits ?? 0) + 1;
    return true;
  }

  function turn(p) {
    learn(p);
    manage(p);
    preRoll(p);
    if (p.inJail && has(p, 'cnS2')) bank(p, 'cnS2', param(p, 'cnS2').pay);
    if (p.inJail && sit(p)) return;
    if (teleport(p)) { if (!p.bankrupt) manage(p); return; }
    // Tất Tay: dùng ngay khi hồi xong, cửa chẵn
    let allIn = null;
    if (ready(p, 'ddU') && !p.inJail) { spend(p, 'ddU'); credit(p, 'ddU'); allIn = 'even'; }
    // Xe Đạp: bật trước khi lắc nếu cú lắc kỳ vọng đỡ hơn (tính cả tiền xăng)
    let bike = false;
    if (has(p, 'dhS1') && !p.inJail) {
      bike = expRisk(p, p.pos, (a, b) => Math.min(a, b)) - param(p, 'dhS1').gas < expRisk(p, p.pos, (a, b) => a + b);
      if (bike) credit(p, 'dhS1');
    }
    for (let d = 0; d < 3 && !p.bankrupt; d++) {
      const bet = d === 0 ? placeBet(p) : null;
      let a = die(), b = die();
      const shape = () => (bike ? { sum: Math.min(a, b), dbl: param(p, 'dhS1').doubles && a === b } : { sum: a + b, dbl: a === b });
      let { sum, dbl } = shape();

      // Chốt cược và Tất Tay theo cú lắc đầu (`Game.takeRoll`)
      if (bet) {
        if (hits(bet.pick, sum)) {
          const id = bet.pick === 'big' ? 'ddX1' : 'dd2a';
          bank(p, id, bet.amount * roll(param(p, id).payout));
        } else {
          give(p, null, bet.amount); credit(p, 'dd2a');
          if (has(p, 'ddX2')) bank(p, 'ddX2', bet.amount * roll(param(p, 'ddX2').back));
        }
      }
      if (allIn) {
        const { win, lose } = param(p, 'ddU');
        if (hits(allIn, sum)) for (const q of others(p)) give(q, p, q.money * roll(win));
        else { const each = Math.floor(p.money * lose); for (const q of others(p)) give(p, q, each); }
        allIn = null;
      }

      // Xí Ngầu Gian: lắc lại viên nào cho rủi ro kỳ vọng thấp hơn, nếu đỡ được ≥ 60$
      if (usesLeft(p, 'dd3') > 0 && !p.inJail) {
        const now = risk(p, wrap(p.pos + sum));
        const keep = (k) => { let n = 0; for (let x = 1; x <= 6; x++) n += risk(p, wrap(p.pos + (bike ? Math.min(k, x) : k + x))); return n / 6; };
        const [ka, kb] = [keep(a), keep(b)];
        if (now - Math.min(ka, kb) >= 60) {
          if (ka < kb) b = die(); else a = die();
          ({ sum, dbl } = shape());
          spend(p, 'dd3'); credit(p, 'dd3');
        }
      }
      // Thưởng theo xí ngầu, Xổ Số của người khác
      for (const q of others(p)) if (has(q, 'ddV') && q.lotto === sum) credit(q, 'ddV', give(p, q, lottoPrize(q, sum)));
      if (has(p, 'dd1')) { const e = param(p, 'dd1'); if (sum % 2 === 0) bank(p, 'dd1', roll(e.even)); else give(p, null, roll(e.odd)); }
      if (dbl && has(p, 'dd2b') && d < 2) bank(p, 'dd2b', roll(param(p, 'dd2b').double));
      if (sum >= 10 && has(p, 'dhX2')) bank(p, 'dhX2', roll(param(p, 'dhX2').bonus));
      if (bike && param(p, 'dhS1').gas) bank(p, 'dhS1', param(p, 'dhS1').gas);

      if (p.inJail) {
        p.jailTurns++;
        if (dbl || p.jailTurns >= 3 || p.money > 400) {
          if (!dbl && !has(p, 'cnX2')) pay(p, 50);
          st.releaseFromJail(p);
          if (!p.bankrupt) moveBy(p, sum, sum);
        }
        return;
      }
      if (dbl && d === 2) {
        if (has(p, 'dd2b')) { bank(p, 'dd2b', roll(param(p, 'dd2b').jackpot)); return; }
        return toJail(p);
      }
      // Quay Đầu: lùi nếu né được ≥ 100$
      let steps = sum;
      if (usesLeft(p, 'dh3') > 0 && risk(p, wrap(p.pos + sum)) - risk(p, wrap(p.pos - sum)) >= 100) {
        steps = -sum; spend(p, 'dh3'); credit(p, 'dh3');
      }
      moveBy(p, steps, sum);
      if (p.inJail || !dbl) break;
    }
    if (!p.bankrupt) manage(p);
  }

  /* ---- vòng ván: thắng theo `winCheck`, chặn ở 120 vòng thì ai nhiều tài sản nhất thắng */
  let by = 'cap';
  for (let n = 0; n < 4 * 120; n++) {
    const p = st.current;
    turn(p);
    const w = st.winCheck();
    if (w) { by = w.by; break; }
    if (!st.nextTurn()) break;
  }
  const winner = st.alive().reduce((a, b) => (st.netWorth(b.id) > st.netWorth(a.id) ? b : a));
  return { winner: winner.id, by, turns: st.turnNo, worth: P.map((p) => (p.bankrupt ? 0 : st.netWorth(p.id))), out: P.map((p) => p.bankrupt) };
}

const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pct = (x) => (x * 100).toFixed(1).padStart(5) + '%';
const NAMES = Object.keys(BUILDS);
const FIELD = NAMES.filter((n) => n !== 'Không kỹ năng');

/* ------------------------------------------------------------ từng kỹ năng */

if (arg('--skills')) {
  const M = Number(arg('--skills')) || 3000;
  const chain = (id) => { const out = []; let s = SK.get(id); while (s) { out.unshift(s.id); s = s.requires?.length ? SK.get(s.requires[0]) : null; } return out; };
  const rows = [];
  const only = arg('--only') ? String(arg('--only')).split(',') : null;
  for (const s of D.SKILLS) {
    if (only && !only.includes(s.id) && !only.includes(`t${s.tier}`)) continue;
    const c = chain(s.id);
    const builds = { ...BUILDS, __T: [...c, s.id, s.id] };
    let w = 0;
    for (let i = 0; i < M; i++) {
      const names = shuffle(FIELD).slice(0, 3);
      const seat = Math.floor(Math.random() * 4);
      names.splice(seat, 0, '__T');
      if (game(names, builds).winner === seat) w++;
    }
    rows.push({ s, pts: c.reduce((n, id) => n + D.TIER_COST[SK.get(id).tier], 0) + 2 * D.LEVEL_COST, wr: w / M });
  }
  const se = Math.sqrt(0.25 * 0.75 / M) * 100;
  console.log(`\nMỗi kỹ năng ${M} ván: đường từ gốc tới ô + lên L3, đấu 3 lối mẫu ngẫu nhiên. Kỳ vọng 25%, sai số ±${(2 * se).toFixed(1)} điểm %.`);
  let worst = 0;
  for (const t of [1, 2, 3, 4]) {
    const r = rows.filter((x) => x.s.tier === t).sort((a, b) => b.wr - a.wr);
    if (!r.length) continue;
    const avg = r.reduce((n, x) => n + x.wr, 0) / r.length;
    console.log(`── ${t === 4 ? 'Tối thượng' : `Cấp ${t}`} (TB ${pct(avg).trim()})`);
    for (const x of r) {
      const dev = (x.wr - avg) * 100;
      if (t === 4) worst = Math.max(worst, Math.abs(dev));
      console.log(`  ${x.s.name.padEnd(22)} ${pct(x.wr)}  ${(dev >= 0 ? '+' : '') + dev.toFixed(1).padStart(5)}  ${x.pts} điểm  ${D.BRANCHES.find((b) => b.key === x.s.branch).name}`);
    }
  }
  const lim = Number(arg('--check', 0));
  if (lim) {
    console.log(`\nTối thượng lệch xa nhất ${worst.toFixed(1)} điểm % (ngưỡng ${lim}).`);
    process.exit(worst > lim ? 1 : 0);
  }
  process.exit(0);
}

/* ------------------------------------------------------------ từng lối học */

const N = Number(arg('--games', 6000));
const stat = Object.fromEntries(NAMES.map((n) => [n, { g: 0, w: 0, worth: 0, out: 0 }]));
const how = {};
let turns = 0;
for (let i = 0; i < N; i++) {
  const pick = shuffle(NAMES).slice(0, 4);
  const r = game(pick);
  turns += r.turns; how[r.by] = (how[r.by] ?? 0) + 1;
  pick.forEach((n, k) => { const s = stat[n]; s.g++; s.worth += r.worth[k]; if (r.out[k]) s.out++; if (r.winner === k) s.w++; });
}
console.log(`\n${N} ván 4 người · TB ${(turns / N / 4).toFixed(0)} lượt mỗi người · thắng bằng: ${Object.entries(how).map(([k, v]) => `${k} ${pct(v / N).trim()}`).join(', ')}`);
console.log(`${'Lối học'.padEnd(34)} thắng  (kỳ vọng 25%)  phá sản  tài sản TB`);
for (const [n, s] of Object.entries(stat).sort((a, b) => b[1].w / b[1].g - a[1].w / a[1].g)) {
  console.log(`${n.padEnd(34)} ${pct(s.w / s.g)}               ${pct(s.out / s.g)}  ${(s.worth / s.g).toFixed(0).padStart(9)}`);
}
