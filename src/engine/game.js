/**
 * Luật một ván: vòng lượt, ô đáp xuống, tiền nong, tù, thẻ, giao dịch, phá sản.
 *
 * Chuyển từ `game/controller.js` cũ, giữ nguyên thứ tự từng bước. Khác ở ba chỗ:
 *   - chờ người chơi quyết định thì `yield* this.ask(...)` (engine treo câu hỏi
 *     và chờ action trả lời), không mở hộp thoại;
 *   - hoạt cảnh, thông báo, tiếng là **sự kiện** (`this.fx`, `this.say`,
 *     `this.sfx`) cho bên diễn, không đợi chúng chạy xong;
 *   - `this.sync()` là mốc "bàn cờ đổi tới đây": bên diễn áp ảnh chụp ấy vào
 *     bàn đúng lúc diễn tới.
 *
 * Mọi hàm `*` là generator; gọi hàm khác cũng là generator thì `yield*`.
 */
import {
  BOARD, GROUPS, money, tileLabel, GO_LANDING_MULT, JAIL_FINE, JAIL_TILE, GOTO_JAIL_TILE,
  START_MONEY, MAX_JAIL_TURNS,
} from '../data/board.js';
import { rollDice, orderFromRolls, WIN_WORTH, WIN_SETS, WIN_HOTEL_SETS } from '../core/state.js';
import { addPressure, eventDue, autoRaise, PRESSURE } from '../core/events.js';
import {
  cardType, isKeepable, demolishLevels, usableCard, useReason, cardTargets, moveDest,
  demolishGroups, demolishPicks, othersOf, collectEach, repairBill, seizePrice, resumePrice, giftShares,
} from '../core/cards.js';
import { cardOf, CARD_KINDS, cardName, cardEffect, DECKS } from '../data/cards.js';
import { has, offSpent, grantLapPoint, deedHolds } from '../core/skills.js';
import { track } from '../core/telemetry.js';
import { noteRent, sampleMoney } from '../core/history.js';
import { EventRules } from './events.js';
import { SkillRules } from './skills.js';
import { GhostRules } from './ghosts.js';
import { BotRules } from './bot.js';
import { describeOffer, validOffer } from './offer.js';

/** Bao nhiêu thẻ di chuyển được nối nhau trong một nước — xem `resolveCard`. */
const MAX_CARD_CHAIN = 2;

/** Hạt giống cho dải thẻ quay: bên diễn dựng đúng dải ấy ở mọi máy. */
const seedOf = () => Math.floor(Math.random() * 2 ** 31);

const named = (p) => `<b style="color:${p.token.css}">${p.name}</b>`;

export class Rules {
  /** @param {import('./engine.js').Engine} e */
  constructor(e) {
    this.e = e;
    this.events = new EventRules(this);
    this.skills = new SkillRules(this);
    this.ghosts = new GhostRules(this);
    this.bot = new BotRules(this);
    /** Đang ở nấc thứ mấy của một dây thẻ di chuyển. */
    this.cardChain = 0;
  }

  get st() { return this.e.st; }

  /* ================================================================
     Sự kiện cho bên diễn
     ================================================================ */

  /** Một dòng thông báo cho cả bàn. `o.kind`: 'bad' | 'trade' | null. */
  say(title, html, o = {}) { this.e.emit('say', { title, html, kind: o.kind ?? null, ms: o.ms ?? 0 }); }

  /** Bàn cờ đổi tới đây — bên diễn áp ảnh chụp lúc này. */
  sync() { this.e.emit('sync'); }

  /** Hoạt cảnh trên bàn cờ. */
  fx(type, data = {}) { this.e.emit(type, data); }

  sfx(name) { this.e.emit('sfx', { name }); }

  /** Tiền bay giữa hai chỗ: số ghế, hoặc `'bank'`. */
  fly(from, to, amount, sign) {
    const text = sign === '+' ? `+${money(amount)}` : sign === '−' ? `−${money(amount)}` : money(amount);
    const color = sign === '+' ? '#7BE0A0' : sign === '−' ? '#FF8A7A' : '#E9CE85';
    this.e.emit('fly', { from, to, amount, text, color });
  }

  /** Nháy sáng mấy ô vừa bị đụng tới, trên mọi máy. */
  spot(ids, ms = 2000) {
    const list = [...new Set(ids ?? [])].filter((id) => id != null);
    if (list.length) this.e.emit('spot', { ids: list, ms });
  }

  /** Động đất / hoả hoạn / bão tuyết trên mấy ô vừa mất nhà. */
  tileFx(kind, ids, lost = true) {
    if (ids.length) this.e.emit('tilefx', { kind, ids, lost });
  }

  /** Cảnh bộ xương của chủ đề Halloween; chủ đề khác không phát. */
  skit(kind, seat, owner) {
    if (this.st.settings.theme !== 'halloween') return;
    this.e.emit('skit', { kind, seat, owner });
  }

  /* ================================================================
     Hỏi người chơi
     ================================================================ */

  /**
   * Hỏi một người. Ghế máy trả lời ngay bằng luật bot, không treo câu hỏi.
   * @returns {Generator<any, {value:any, timeout:boolean}>}
   */
  *ask(seat, kind, data = {}, o = {}) {
    if (this.e.isBot(seat)) return { value: this.bot.answer(seat, kind, data, o.fallback ?? null), timeout: false };
    return yield { list: [{ seat, kind, data, fallback: o.fallback ?? null }], ms: o.ms ?? 0 };
  }

  /**
   * Hỏi nhiều người **cùng lúc** — cả bàn đếm một hạn chờ.
   *
   * Map ghi câu trả lời theo thứ tự về tới máy chủ; đấu giá dùng thứ tự này
   * để xử hoà (ai chốt trước thắng). Bản một máy thì người ta trả lời lần lượt
   * theo đúng danh sách, nên xếp lại theo danh sách cho khớp luật cũ.
   *
   * @param {Array<{seat:number, kind:string, data:object, fallback:any}>} list
   * @returns {Generator<any, Map<number, any>>}
   */
  *askMany(list, ms = 0) {
    const out = new Map();
    if (!list.length) return out;
    const bots = list.filter((q) => this.e.isBot(q.seat));
    const humans = list.filter((q) => !this.e.isBot(q.seat));
    for (const q of bots) out.set(q.seat, this.bot.answer(q.seat, q.kind, q.data, q.fallback));
    if (humans.length) {
      const got = yield { list: humans, ms, multi: true };
      for (const [seat, v] of got) out.set(seat, v ?? humans.find((q) => q.seat === seat)?.fallback);
    }
    if (this.st.settings.clock) return out;
    return new Map(list.map((q) => [q.seat, out.get(q.seat)]));
  }

  ms(key) { return this.e.timing(key); }

  /* ================================================================
     Vòng ván
     ================================================================ */

  *main() {
    const st = this.st;
    if (!st.order) yield* this.rollOff();
    while (!st.over) yield* this.turnPoint();
  }

  /**
   * Một mốc của lượt: dọn việc tồn (gạch tên người vắng, nợ treo, người phá
   * sản), rồi bày thanh nút cho người đang đi và chờ họ chọn một nước.
   */
  *turnPoint() {
    const st = this.st;
    const f = st.flow;
    if (f.evict.length) {
      yield* this.evictPlayer(f.evict.shift());
      return;
    }
    const p = st.current;
    if (p.bankrupt) { yield* this.endTurn(); return; }

    /* Còn khoản nợ treo (người ấy nối lại giữa lúc đang xoay tiền): đòi cho
       xong rồi mới bày nút, kẻo nối lại máy là thoát được tiền thuê. */
    if (st.debt && st.debt.from === p.id) {
      const d = st.debt;
      yield* this.payPlayer(d.from, d.to, d.amount);
      if (this.checkGameOver()) { this.sync(); return; }
      if (p.bankrupt) yield* this.endTurn();
      return;
    }

    // Sang lượt khác thì lượt mới chưa bị tính vào chuỗi "để hết giờ"
    if (f.stall.turnNo !== st.turnNo) {
      f.stall.turnNo = st.turnNo;
      f.stall.counted = false;
    }

    if (this.e.isBot(p.id)) { yield* this.bot.step(p); return; }

    /* Người đang đi vắng mặt thì chỉ chờ một quãng ngắn rồi bỏ lượt — chơi hộ
       người vắng thì tiêu mất tiền của họ. */
    const away = !this.e.isLive(p.id);
    const ms = away ? this.ms('skipMs') || this.ms('turnMs') : this.ms('turnMs');
    const r = yield* this.ask(p.id, 'turn', { rolled: st.rolled }, { ms, fallback: { do: 'timeout' } });
    if (r.timeout) {
      if (!this.e.isLive(p.id)) { yield* this.skipAbandonedTurn(); return; }
      yield* this.stalled(p);
      return;
    }
    yield* this.onMenu(p, r.value ?? {});
  }

  /** Người đang đi chọn một nước ở thanh nút. Soát lại quyền ngay ở đây. */
  *onMenu(p, v) {
    const st = this.st;
    switch (v.do) {
      case 'roll':
        if (p.inJail || st.rolled) return;
        yield* this.takeRoll();
        return;
      case 'end':
        if (!st.rolled) return;
        yield* this.endTurn();
        return;
      case 'jail-roll':
        if (!p.inJail) return;
        yield* this.rollInJail();
        return;
      case 'jail-pay':
        if (!p.inJail || (!has(p, 'cnX2') && p.money < JAIL_FINE)) return;
        yield* this.payOutOfJail();
        return;
      case 'jail-card':
        if (!p.inJail || st.jailCardAt(p.id) < 0) return;
        yield* this.useJailCard();
        return;
      case 'sit':
        yield* this.sitInJail();
        return;
      case 'manage':
        yield* this.manageAct(p.id, v.act, Number(v.id));
        return;
      case 'trade':
        yield* this.trade(v.offer);
        return;
      case 'card':
        yield* this.useHeldCard(Number(v.at));
        return;
      case 'kit':
        yield* this.skills.applyKit(p, st.rolled, v.draft);
        return;
      case 'tree':
        yield* this.skills.applyTree(p, v.ops);
        return;
      case 'bankrupt':
        yield* this.declareBankrupt(p.id);
        return;
      default:
    }
  }

  /* ================================================================
     Lắc giành quyền đi trước
     ================================================================ */

  /**
   * Ai đi trước: mỗi người lắc một lần, cao nhất đi đầu, hoà thì bốc thăm
   * giữa đúng những người hoà. Nút "Lắc" hiện ở máy từng người, còn con xí ngầu
   * gieo ở engine như mọi nước khác. Không trả lời kịp thì bàn lắc hộ.
   */
  *rollOff() {
    const st = this.st;
    this.say('GIÀNH QUYỀN ĐI TRƯỚC', 'Mỗi người lắc một lần. Ai cao nhất đi đầu, hoà thì bốc thăm.', { ms: 2800 });
    const seats = st.players.filter((p) => !p.bankrupt);
    const rolls = [];
    for (const p of seats) {
      if (!this.e.isBot(p.id)) {
        yield* this.ask(p.id, 'rolloff', { seat: p.id, rolls: rolls.map((r) => ({ ...r })) },
          { ms: this.ms('tradeMs'), fallback: true });
      }
      const d = rollDice();
      this.fx('dice', { a: d.a, b: d.b });
      rolls.push({ seat: p.id, sum: d.sum });
      this.say('LẮC GIÀNH QUYỀN', `<b>${p.name}</b> ra <b>${d.a} + ${d.b} = ${d.sum}</b>.`, { ms: 1900 });
    }
    const order = [
      ...orderFromRolls(rolls),
      ...st.players.filter((p) => p.bankrupt).map((p) => p.id),
    ];
    const sums = new Map(rolls.map((r) => [r.seat, r.sum]));
    const tied = rolls.length > 1 && sums.get(order[0]) === sums.get(order[1]);
    st.setOrder(order);
    this.fx('hideDice');
    this.sync();
    this.say('THỨ TỰ ĐI',
      `${order.filter((seat) => sums.has(seat)).map((seat, i) => `
         <b style="color:${st.players[seat].token.css}">${i + 1}. ${st.players[seat].name}</b>
         (${sums.get(seat)})`).join(' · ')}
       <br>${tied ? '<i>Hoà điểm đầu bảng, thứ tự người hoà do bốc thăm.</i>'
        : `<b>${st.players[order[0]].name}</b> đi trước.`}`,
      { ms: 4600 });
  }

  /* ================================================================
     Hết giờ, vắng mặt
     ================================================================ */

  /**
   * Đồng hồ cạn mà người ấy chưa quyết: đi hộ nước mặc định, không đuổi. Một
   * lượt chỉ tính một lần vào chuỗi; đủ `maxStalls` lượt liền mới coi là bỏ ván.
   */
  *stalled(p) {
    const s = this.st.flow.stall;
    /* Một lượt chỉ tính một lần: đổ đôi được lắc tiếp, lắc xong còn phải bấm
       kết thúc — mấy nhịp ấy vẫn là một lượt người ta không ngồi máy. */
    if (!s.counted) {
      s.counted = true;
      s.n[p.id] = (s.n[p.id] ?? 0) + 1;
    }
    if (s.n[p.id] >= this.ms('maxStalls')) { yield* this.stallBankrupt(p); return; }
    yield* this.autoMove(p);
  }

  *stallBankrupt(p) {
    this.st.flow.stall.n[p.id] = 0;
    this.say('BỎ VÁN',
      `<b>${p.name}</b> để hết giờ ${this.ms('maxStalls')} lượt liền mà không đi,
       coi như bỏ cuộc. Tài sản trả về <b>ngân hàng</b>.`, { kind: 'bad', ms: 4200 });
    yield* this.doBankrupt(p.id);
    if (this.checkGameOver()) { this.sync(); return; }
    if (this.st.turn === p.id) yield* this.endTurn();
  }

  /**
   * Nước đi mặc định khi hết giờ: lắc, hoặc kết thúc lượt nếu đã lắc. Trong
   * tù thì lắc cầu đôi chứ không nộp tiền hộ — tiêu tiền của người khác là
   * quyết định của họ.
   */
  *autoMove(p) {
    this.say('HẾT GIỜ', `<b>${p.name}</b> chưa đi, bàn lắc hộ một lượt.`, { ms: 2000 });
    if (this.st.turn !== p.id || p.bankrupt) return;
    if (p.inJail) { yield* this.rollInJail(); return; }
    if (this.st.rolled) { yield* this.endTurn(); return; }
    yield* this.takeRoll(true);
  }

  /** Lượt của người đang mất kết nối: bỏ qua, không chơi hộ. */
  *skipAbandonedTurn() {
    const p = this.st.current;
    this.say('BỎ QUA LƯỢT',
      `<b>${p.name}</b> đang mất kết nối nên mất lượt này. Tài sản vẫn giữ nguyên.`, { ms: 2600 });
    yield* this.endTurn();
  }

  /** Vắng quá hạn ân: tài sản trả hết về ngân hàng, ai cũng mua lại được. */
  *evictPlayer(seat) {
    const st = this.st;
    const p = st.players[seat];
    if (!p || p.bankrupt) return;
    const props = st.propertiesOf(seat).length;
    this.sfx('bankrupt');
    st.bankrupt(seat);
    this.sync();
    this.say('RỜI BÀN',
      `<b>${p.name}</b> mất kết nối quá lâu. ${props} ô đất và toàn bộ nhà cửa
       trả về <b>ngân hàng</b>, ai cũng mua lại được.`, { kind: 'bad', ms: 5000 });
    this.fx('bankruptFx', { seat });
    // Người này có thể đang dở một khoản phải trả; chủ nợ vẫn nhận phần gom được
    yield* this.coverDebt(seat);
    if (this.checkGameOver()) { this.sync(); return; }
    if (st.turn === seat) yield* this.endTurn();
  }

  /* ================================================================
     Lượt
     ================================================================ */

  /**
   * Kết thúc lượt — cũng là chỗ **thẻ Thời Cuộc nổ**, trước khi trao lượt.
   */
  *endTurn() {
    const st = this.st;
    this.fx('hideDice');
    if (this.checkGameOver()) { this.sync(); return; }
    if (st.dryTurn) addPressure(st, PRESSURE.dryTurn);
    offSpent(st.current);
    yield* this.expireMini(st.current);

    const fired = eventDue(st);
    if (fired) {
      yield* this.events.run();
      if (this.checkGameOver()) { this.sync(); return; }
    }
    // Hồn ma bầu thẻ cho lần nổ kế tiếp — không chờ, lượt sau vẫn bắt đầu ngay
    this.ghosts.maybeOpen(fired);
    track('turn', { seat: st.turn, turn_no: st.turnNo, round: st.round, cash: st.players.map((p) => p.money) });
    st.nextTurn();
    this.sync();
    this.fx('turn', { seat: st.turn });
  }

  /** Chung Cư Mini: hết lượt thì nhà trên đất lẻ già thêm một lượt. */
  *expireMini(p) {
    const st = this.st;
    const gone = st.ageMini(p.id);
    if (!gone.length) return;
    this.sync();
    const sold = gone.reduce((n, g) => n + g.sold, 0);
    const refund = gone.reduce((n, g) => n + g.refund, 0);
    this.say('CHUNG CƯ MINI HẾT HẠN',
      `Nhà trên đất lẻ của <b>${p.name}</b> ở ${gone.map((g) => `<b>${tileLabel(g.id)}</b>`).join(', ')}
       hết hạn: ngân hàng mua lại ${sold} căn, trả <span class="up">${money(refund)}</span>.
       Gom đủ bộ màu thì nhà không hết hạn.`, { kind: 'bad', ms: 4200 });
    this.spot(gone.map((g) => g.id));
  }

  /* ================================================================
     Lắc xí ngầu
     ================================================================ */

  /** @param {boolean} [auto] bàn lắc hộ người để hết giờ — không hỏi cược */
  *takeRoll(auto = false) {
    const st = this.st;
    const p = st.current;
    yield* this.skills.beforeRoll(p, !auto);
    if (st.over || p.bankrupt) { yield* this.endTurn(); return; }
    // Xe Đạp nắn kết quả trước mọi câu hỏi sau khi lắc
    const first = this.skills.shape(p, rollDice());
    this.fx('dice', { a: first.a, b: first.b });

    /* Cược và Tất Tay chốt theo cú lắc **đầu tiên**, trước Xí Ngầu Gian: chốt
       sau thì đoán sai được lắc lại một viên (tests/gamesim.mjs). */
    yield* this.skills.settleBets(p, first);
    if (st.over || p.bankrupt) { yield* this.endTurn(); return; }
    const { d, back } = yield* this.skills.afterRoll(p, first);
    if (st.over || p.bankrupt) { yield* this.endTurn(); return; }
    if (d.isDouble) p.doubles += 1;
    /* Chốt "đã lắc" ngay khi có kết quả: mốc yên kế tiếp không được cho lắc thêm. */
    else st.rolled = true;
    yield* this.skills.rollPerks(p, d);
    if (st.over || p.bankrupt) { yield* this.endTurn(); return; }

    if (d.isDouble) {
      if (p.doubles >= 3) {
        if (yield* this.skills.jackpot(p)) { yield* this.endTurn(); return; }
        this.say('ĐỔ ĐÔI LẦN THỨ BA',
          `<b>${p.name}</b> đổ đôi ba lần liên tiếp, phải vào <b>Khám Lớn</b>!`, { kind: 'bad' });
        yield* this.goToJail(p);
        yield* this.endTurn();
        return;
      }
      this.say('ĐỔ ĐÔI', `<b>${p.name}</b> ra đôi ${d.a}, được đi thêm một lượt.`, { ms: 2200 });
    }

    yield* this.advance(p, (back ? -d.sum : d.sum) + this.iceSlide(p, back), d);
    // Vào tù thì hết lượt ngay, kể cả khi vừa đổ đôi
    if (st.over || p.bankrupt || p.inJail) { yield* this.endTurn(); return; }
    this.sync();
  }

  /** Đường Đóng Băng: nước đi bằng xí ngầu trượt thêm 1–2 ô. */
  iceSlide(p, back = false) {
    if (back || !this.st.hasMod('ice')) return 0;
    const slide = Math.random() < 0.5 ? 1 : 2;
    this.say('ĐƯỜNG ĐÓNG BĂNG',
      `<b>${p.name}</b> trượt thêm <b>${slide} ô</b> trên mặt đường đóng băng.`, { ms: 1800 });
    return slide;
  }

  /** Đi `steps` ô, cộng lương nếu đi ngang BẮT ĐẦU, rồi xử lý ô đáp xuống. */
  *advance(p, steps, dice) {
    const st = this.st;
    const from = p.pos;
    // Đi ngược chiều thì bước qua ô Bắt Đầu không lãnh lương
    const passedGo = steps > 0 && from + steps >= 40;
    this.fx('move', { seat: p.id, from, steps });
    p.pos = ((from + steps) % 40 + 40) % 40;
    this.sync();
    yield* this.skills.pickup(p);

    if (passedGo) {
      const landed = p.pos === 0;
      this.sfx('go');
      // Điểm kỹ năng và bộ đếm lần qua cộng **trước** khi tính lương: Thâm Niên tính cả lần này
      const points = this.skills.lapStart(p);
      const { total, parts } = st.payslip(landed, p);
      // Cò Quay Lương chỉ quay phần lương; tiền giữ nhà Sổ Hồng đứng ngoài
      const deed = parts.ac3 ?? 0;
      const spun = this.skills.spinPay(p, total - deed);
      const pay = spun.pay + deed;
      const spinNote = spun.note + (deed ? ` · <b>Sổ Hồng</b> +${money(deed)}` : '');
      const cut = st.modMult('salary') !== 1;
      st.laps += 1;
      addPressure(st, PRESSURE.lap);
      const note = landed
        ? `, đạp trúng ô Bắt Đầu nên lương ×${GO_LANDING_MULT}${cut ? ', đã trừ mất mùa' : ''}`
        : (cut ? ', mất mùa nên chỉ còn bấy nhiêu' : '');
      this.say(landed ? 'ĐẠP Ô BẮT ĐẦU' : 'QUA Ô BẮT ĐẦU',
        `<b>${p.name}</b> lãnh lương <span class="up">${money(pay)}</span>${note}${spinNote}
         · <b>+${points} điểm kỹ năng</b>${points > 1 ? ' (có Lão Làng)' : ''} (đang có ${p.skillPoints}).`,
        { ms: landed ? 2800 : 2400 });
      this.receiveFromBank(p.id, pay);
      this.skills.paid(p, parts);
      yield* this.skills.lapEnd(p);
      if (st.over || p.bankrupt) return;
    }

    // Trạm Thu Phí BOT: tính sau lương, để người vừa lãnh lương có tiền nộp phí
    yield* this.skills.tolls(p, from, steps);
    if (st.over || p.bankrupt) return;
    yield* this.skills.tours(p, from, steps);
    if (st.over || p.bankrupt) return;
    // Dừng chung ô với người khác: Hai Ngón chạy trước khi xử lý ô
    yield* this.skills.landed(p);
    if (st.over || p.bankrupt) return;
    this.fx('highlight', { tile: p.pos, seat: p.id });
    yield* this.resolveTile(p, dice);
  }

  /* ================================================================
     Ô đáp xuống
     ================================================================ */

  *resolveTile(p, dice) {
    const st = this.st;
    const t = BOARD[p.pos];
    if (t.type === 'station') this.skit('station', p.id);
    else if (t.type === 'utility') this.skit(t.id === 28 ? 'power' : 'hydro', p.id);

    switch (t.type) {
      case 'property':
      case 'station':
      case 'utility':
        yield* this.resolveOwnable(p, t, dice);
        if (t.type === 'station') yield* this.skills.express(p, dice);
        break;
      case 'chance':
      case 'chest':
        yield* this.resolveCard(p, t.type, dice);
        break;
      case 'tax': {
        const tax = this.skills.cut(p, t.tax_amount);
        this.skit('tax', p.id);
        this.say(t.name.split(' (')[0].toUpperCase(),
          `<b>${p.name}</b> phải nộp <span class="down">${money(tax)}</span> cho ngân hàng${this.skills.cutNote(p)}.`,
          { kind: 'bad' });
        yield* this.payBank(p.id, tax);
        break;
      }
      case 'corner':
        if (t.id === GOTO_JAIL_TILE) {
          this.say('VÀO TÙ', `<b>${p.name}</b> bị giải về <b>Khám Lớn Sài Gòn</b>.`, { kind: 'bad' });
          yield* this.goToJail(p);
        } else if (t.id === JAIL_TILE) {
          this.say('GHÉ THĂM', `<b>${p.name}</b> chỉ ghé thăm Khám Lớn, vô sự.`, { ms: 2000 });
        } else if (t.id === 20) {
          // Quỹ Công chỉ có khi bật thẻ Thời Cuộc; không thì đây vẫn là ô nghỉ chân
          if (st.pot > 0) {
            const won = st.pot;
            st.pot = 0;
            this.say('QUỸ CÔNG',
              `<b>${p.name}</b> ghé Bến Đậu, ẵm trọn Quỹ Công <span class="up">${money(won)}</span>.`, { ms: 3600 });
            this.receiveFromBank(p.id, won);
          } else {
            this.say('BẾN ĐẬU', `<b>${p.name}</b> nghỉ chân miễn phí.`, { ms: 2000 });
          }
          yield* this.skills.parking(p);
        }
        break;
      default:
    }
  }

  /** Ô có thể sở hữu: mua, trả tiền thuê, hoặc không có gì xảy ra. */
  *resolveOwnable(p, t, dice) {
    const st = this.st;
    const ownerId = st.owner.get(t.id);

    if (ownerId === undefined) {
      if (p.money < t.price) {
        this.say('KHÔNG ĐỦ TIỀN',
          `<b>${p.name}</b> dừng ở <b>${tileLabel(t.id)}</b> nhưng chỉ có ${money(p.money)}.`, { ms: 2600 });
        return;
      }
      const r = yield* this.ask(p.id, 'buy', { tileId: t.id }, { ms: this.ms('turnMs'), fallback: 'skip' });
      // Soát lại: túi tiền và chủ đất có thể đã đổi trong lúc hỏi
      if (r.value === 'buy' && !st.owner.has(t.id) && p.money >= t.price) {
        this.sfx('buy');
        st.buy(p.id, t.id);
        this.skit('buy', p.id);
        this.sync();
        this.fly(p.id, 'bank', t.price, '−');
        this.say('TẬU ĐẤT',
          `<b>${p.name}</b> mua <b>${tileLabel(t.id)}</b> giá <span class="down">${money(t.price)}</span>.`);
        yield* this.skills.brokerFees(p.id, t.id);
        yield* this.skills.bought(p, t.id);
      } else {
        this.say('BỎ QUA', `<b>${p.name}</b> không mua <b>${tileLabel(t.id)}</b>.`, { ms: 2200 });
      }
      return;
    }

    if (ownerId === p.id) { yield* this.skills.atHome(p); return; }

    if (st.isMortgaged(t.id)) {
      this.say('ĐANG THẾ CHẤP', `<b>${tileLabel(t.id)}</b> đang thế chấp, miễn tiền thuê.`, { ms: 2600 });
      return;
    }

    // Ba luật chặn tiền thuê của chủ đề Halloween: báo đúng lý do
    const block = st.rentBlock(t.id);
    if (block) {
      const ownerName = st.players[ownerId].name;
      const why = {
        zombie: ['XÁC SỐNG CHIẾM ĐẤT', `Xác sống đang ở <b>${tileLabel(t.id)}</b>, <b>${ownerName}</b> không thu được tiền thuê.`],
        curse: ['BỊ NGUYỀN', `<b>${ownerName}</b> đang bị nguyền, <b>${p.name}</b> khỏi trả tiền thuê ở <b>${tileLabel(t.id)}</b>.`],
        'blood-moon': ['ĐÊM TRĂNG MÁU', `<b>${tileLabel(t.id)}</b> là đất trống, đêm trăng máu không ai thu tiền thuê.`],
      }[block];
      this.say(why[0], why[1], { ms: 2600 });
      return;
    }

    const owner = st.players[ownerId];
    const bill = this.skills.rentBill(p, t.id, dice);
    const rent = bill.total;
    // Thâu Tóm: ép mua lô này thay vì trả thuê
    if (yield* this.skills.trySeize(p, t.id, rent)) return;
    this.skit('rent', p.id, ownerId);
    this.say('TRẢ TIỀN THUÊ',
      `<b>${p.name}</b> trả <span class="down">${money(rent)}</span> cho <b>${owner.name}</b>
       tại <b>${tileLabel(t.id)}</b>${this.skills.rentNote(p, t.id, bill)}.`, { kind: 'bad' });
    if (yield* this.payPlayer(p.id, ownerId, rent)) {
      noteRent(st, p.id, ownerId, rent, t.id);
      this.skills.rentPaid(owner, bill);
      yield* this.skills.stakeShare(owner, rent);
    }
  }

  /* ================================================================
     Thẻ Cơ Hội / Khí Vận
     ================================================================ */

  /**
   * Rút thẻ. Thẻ nổ ngay xử luôn tại chỗ, thẻ giữ được thì cất vào túi.
   * Thẻ di chuyển nối nhau quá `MAX_CARD_CHAIN` nấc thì coi như ghé ngang ô.
   */
  *resolveCard(p, kind, dice) {
    const st = this.st;
    if (this.cardChain >= MAX_CARD_CHAIN) return;
    const drawn = yield* this.skills.drawCard(p, kind, (c) => usableCard(st, c, p.id));
    if (!drawn) return;
    if (!isKeepable(drawn.card) && (yield* this.skills.dodgeCard(p, drawn.card))) return;

    const seed = seedOf();
    const title = kind === 'chance' ? 'CƠ HỘI' : 'KHÍ VẬN';
    if (isKeepable(drawn.card)) { yield* this.keepCard(p, kind, drawn, title, seed); return; }
    switch (cardType(drawn.card)) {
      case 'collect': yield* this.cardCollect(p, kind, drawn.card, title, seed); return;
      case 'gift':    yield* this.cardGift(p, kind, drawn.card, title, seed); return;
      case 'curse':   yield* this.cardCurse(p, kind, drawn.card, title, seed); return;
      case 'repair':  yield* this.cardRepair(p, kind, drawn.card, title, seed); return;
      case 'skill':   yield* this.cardSkill(p, kind, drawn.card, title, seed); return;
      case 'move':    yield* this.cardMove(p, kind, drawn.card, title, seed, dice); return;
      default:        yield* this.cardMoney(p, kind, drawn.card, title, seed);
    }
  }

  /**
   * Bày thẻ cho cả bàn, rồi chờ người đang đi bấm nút trên mặt thẻ. Máy ngồi
   * xem cũng thấy thẻ, chỉ không có nút: hộp bên ấy tắt khi câu hỏi được trả
   * lời. Ghế máy không có ai để bấm — bên diễn tự tắt sau một nhịp đọc.
   */
  *showFateCard(kind, card, o) {
    const st = this.st;
    const index = DECKS[kind]?.indexOf(card) ?? -1;
    const p = st.current;
    const view = {
      kind, index, seed: o.seed,
      amount: o.amount ?? null, note: o.note ?? '', label: o.label ?? null,
      by: p?.name ?? '', seat: p?.id ?? -1,
      // Lá không có trong bộ (bộ kiểm thử tự dựng): gửi nguyên lá
      card: index < 0 ? card : undefined,
    };
    this.fx('fatecard', view);
    if (p && !this.e.isBot(p.id)) {
      yield* this.ask(p.id, 'fate', view, { ms: this.ms('fateMs'), fallback: true });
    }
  }

  *cardSkill(p, kind, card, title, seed) {
    yield* this.showFateCard(kind, card, { seed, note: `Nhận <b>+${card.points} điểm kỹ năng</b>.`, label: 'Nhận điểm' });
    grantLapPoint(p, card.points, 'card');
    this.sync();
    this.sfx('coin');
    this.say(title, `<b>${p.name}</b>: ${card.text} <b>+${card.points} điểm kỹ năng</b> (đang có ${p.skillPoints}).`);
  }

  *cardMoney(p, kind, card, title, seed) {
    yield* this.showFateCard(kind, card, { amount: card.amount, seed });
    if (card.amount > 0) {
      const extra = this.skills.cardBonus(p, card.amount);
      this.say(title,
        `<b>${p.name}</b>: ${card.text} <span class="up">+${money(card.amount + extra)}</span>${
          extra ? ` (gồm ${money(extra)} của <b>Bảo Hộ Lao Động</b>)` : ''}`);
      this.receiveFromBank(p.id, card.amount + extra);
    } else {
      const fine = this.skills.cut(p, -card.amount);
      this.say(title,
        `<b>${p.name}</b>: ${card.text} <span class="down">−${money(fine)}</span>${this.skills.cutNote(p)}`, { kind: 'bad' });
      yield* this.payBank(p.id, fine);
    }
  }

  /** Tiền mừng: những người còn lại chia đều cùng góp, ngân hàng không bao. */
  *cardCollect(p, kind, card, title, seed) {
    const st = this.st;
    const each = collectEach(st, p.id, card);
    yield* this.showFateCard(kind, card, {
      amount: card.amount ?? each * othersOf(st, p.id).length,
      note: `Mỗi người còn lại góp <b>${money(each)}</b>.`,
      label: 'Nhận tiền mừng',
      seed,
    });
    this.say(title, `<b>${p.name}</b>: ${card.text} Mỗi người góp <span class="up">${money(each)}</span>.`);
    for (const seat of othersOf(st, p.id)) {
      if (st.players[seat].bankrupt) continue;
      yield* this.payPlayer(seat, p.id, each);
    }
  }

  /** Quà Giáng Sinh: ngân hàng phát cả bàn, người ít tiền mặt nhất nhận gấp đôi. */
  *cardGift(p, kind, card, title, seed) {
    const st = this.st;
    const shares = giftShares(st, card);
    const poor = shares.filter((s) => s.poorest).map((s) => st.players[s.seat].name);
    const allTie = poor.length === shares.length;
    const note = allTie
      ? `Cả bàn đang bằng tiền nhau nên ai cũng nhận gấp đôi: <b>${money(card.amount * 2)}</b>.`
      : `Cả bàn mỗi người <b>${money(card.amount)}</b>, ${poor.join(', ')} ít tiền mặt nhất
         nhận <b>${money(card.amount * 2)}</b>.`;
    yield* this.showFateCard(kind, card, { amount: card.amount, note, label: 'Nhận quà', seed });
    this.say(title, allTie
      ? `Ông già Noel phát quà: cả bàn mỗi người <span class="up">${money(card.amount * 2)}</span>.`
      : `Ông già Noel phát quà: mỗi người <span class="up">${money(card.amount)}</span>,
         <b>${poor.join(', ')}</b> nhận gấp đôi <span class="up">${money(card.amount * 2)}</span>.`);
    for (const s of shares) {
      if (st.players[s.seat].bankrupt) continue;
      this.receiveFromBank(s.seat, s.amount);
    }
  }

  /** Bị nguyền (Halloween): một vòng không thu được tiền thuê của ai. */
  *cardCurse(p, kind, card, title, seed) {
    const st = this.st;
    const turns = Math.max(1, st.alive().length);
    yield* this.showFateCard(kind, card, {
      note: '<b>1 vòng</b> không thu được tiền thuê nhà, đất của ai.', label: 'Đành chịu', seed,
    });
    st.addMod({ id: `bi-nguyen:${p.id}`, type: 'curse', seat: p.id, name: p.name, turns });
    this.sync();
    this.say(title,
      `<b>${p.name}</b> bị nguyền: tới lượt sau của mình, ai đáp vào đất của
       <b>${p.name}</b> cũng khỏi trả tiền thuê.`, { kind: 'bad', ms: 3200 });
  }

  /** Thuế nhà cửa: tính đầu nhà, đầu khách sạn trên toàn bộ đất của mình. */
  *cardRepair(p, kind, card, title, seed) {
    const bill = repairBill(this.st, p.id, card);
    const parts = [];
    if (bill.houses) parts.push(`${bill.houses} nhà × ${money(card.perHouse)}`);
    if (bill.hotels) parts.push(`${bill.hotels} khách sạn × ${money(card.perHotel)}`);
    yield* this.showFateCard(kind, card, { amount: -bill.amount, note: parts.join(' · '), seed });
    const due = this.skills.cut(p, bill.amount);
    this.say(title,
      `<b>${p.name}</b> nộp thuế nhà cửa <span class="down">${money(due)}</span>
       (${parts.join(', ')})${this.skills.cutNote(p)}.`, { kind: 'bad' });
    yield* this.payBank(p.id, due);
  }

  /**
   * Thẻ di chuyển: dắt quân tới ô khác rồi xử ô ấy như vừa lắc tới. Xí ngầu
   * vừa lắc đi theo: đáp xuống ô dịch vụ thì tiền thuê tính theo số ấy.
   */
  *cardMove(p, kind, card, title, seed, dice) {
    const dest = moveDest(card, p.pos, this.st);
    yield* this.showFateCard(kind, card, { note: `Đi tới <b>${tileLabel(dest.tile)}</b>.`, label: 'Lên đường', seed });
    this.say(title, `<b>${p.name}</b>: ${card.text}`, { kind: card.jail ? 'bad' : null, ms: 2600 });
    if (card.jail) { yield* this.goToJail(p); return; }
    this.cardChain += 1;
    try {
      yield* this.advance(p, dest.steps, dice);
    } finally {
      this.cardChain -= 1;
    }
  }

  /* ================================================================
     Túi thẻ
     ================================================================ */

  /** Cất một lá vào túi; lá ấy rời bộ bài cho tới khi có người xài. */
  *keepCard(p, kind, drawn, title, seed) {
    const st = this.st;
    const meta = CARD_KINDS[cardType(drawn.card)];
    const name = cardName(drawn.card);
    yield* this.showFateCard(kind, drawn.card, {
      note: `<b>${meta.sigil} ${name}</b>: ${cardEffect(drawn.card)}`, label: 'Cất vào túi', seed,
    });
    st.takeCard(p.id, kind, drawn.index);
    this.sync();
    this.say(title, `<b>${p.name}</b> cất được <b>${name}</b> vào túi.`);
  }

  /**
   * Dùng một tấm trong túi. Ba thẻ nhắm vào nhà đất **hỏi mục tiêu trước, rút
   * thẻ khỏi túi sau**: nhìn lại bàn rồi đổi ý là chuyện thường, rút trước thì
   * thẻ mất trắng. Quyền dùng soát lại ở đây chứ không tin nút bấm suông.
   */
  *useHeldCard(at) {
    const st = this.st;
    const p = st.current;
    const ref = p.cards[at];
    const card = cardOf(ref);
    if (!card) return;
    const check = useReason(st, card, p.id);
    if (!check.ok) {
      this.say('CHƯA DÙNG ĐƯỢC', check.reason, { kind: 'bad', ms: 3000 });
      return;
    }
    const title = cardName(card);
    const type = cardType(card);
    let target;
    if (type === 'demolish' || type === 'seize' || type === 'resume') {
      target = type === 'demolish'
        ? yield* this.askDemolishGroup(p, card)
        : yield* this.askStrikeTile(p, card, type);
      if (target == null) return;
    }
    if (!this.spendCard(p, at, ref)) return;
    switch (type) {
      case 'jail-free':     yield* this.useJailCard(false); return;
      case 'resume-random': yield* this.resumeRandom(p, card, title); return;
      case 'demolish':      yield* this.demolishInGroup(p, card, title, target); return;
      default:              yield* this.strikeWithPick(p, card, title, target);
    }
  }

  /** Rút đúng tấm vừa chọn khỏi túi — bám theo chính tấm thẻ, không theo chỉ số. */
  spendCard(p, at, ref) {
    const i = p.cards[at] === ref ? at : p.cards.indexOf(ref);
    if (i < 0) return false;
    this.st.dropCard(p.id, i);
    this.sfx('card');
    this.sync();
    return true;
  }

  /** Hỏi mục tiêu cho cưỡng chế mua / giải toả chỉ định — một ô. */
  *askStrikeTile(p, card, type) {
    const ids = cardTargets(this.st, card, p.id);
    if (ids.length === 0) return null;
    const text = {
      seize: {
        eyebrow: 'CƯỠNG CHẾ MUA ĐẤT',
        title: 'Lấy lô đất nào?',
        sub: 'Lô bạn chọn <b>sang tên cho bạn</b> ngay, chủ cũ nhận <b>giá gốc +25%</b>.',
        note: 'Chỉ lô chưa thế chấp, nằm trong khu chưa có căn nhà nào, và bạn phải đủ tiền mặt trả tiền đền.',
        confirm: 'Lấy lô này',
      },
      resume: {
        eyebrow: 'GIẢI TOẢ',
        title: 'Cắm mốc giải toả lô nào?',
        sub: `Chủ lô nhận tiền đền <b>giá gốc +20%</b>, rồi lô ấy đem
              <b>đấu giá kín</b>, ai trả cao nhất thì lấy.`,
        note: 'Chọn được cả đất của mình: lãnh tiền đền rồi tranh mua lại cũng là một nước cờ.',
        confirm: 'Cắm mốc lô này',
      },
    }[type];
    text.owned = false;
    text.cancel = 'Thôi, cất thẻ lại';
    const r = yield* this.ask(p.id, 'ev-pick', { ids, text }, { ms: this.ms('askMs'), fallback: null });
    return ids.includes(r.value) ? r.value : null;
  }

  *strikeWithPick(p, card, title, tileId) {
    // Đất có thể vừa đổi chủ trong lúc hỏi — soát lại
    if (!cardTargets(this.st, card, p.id).includes(tileId)) return;
    if (cardType(card) === 'resume') { yield* this.resumeTile(p, tileId, card, title); return; }
    yield* this.seizeTile(p, tileId, title);
  }

  /**
   * Thẻ dỡ nhà: người dùng chọn **khu màu**, bàn cờ bốc thăm ô. Cả bàn chỉ
   * một khu có nhà thì khỏi hỏi.
   */
  *askDemolishGroup(p, card) {
    const st = this.st;
    const groups = demolishGroups(st, card, p.id);
    if (groups.length === 0) return null;
    if (groups.length === 1) return groups[0];
    const data = {
      groups,
      ids: cardTargets(st, card, p.id),
      levels: demolishLevels(card),
      cancel: 'Thôi, cất thẻ lại',
    };
    const r = yield* this.ask(p.id, 'ev-group', data, { ms: this.ms('askMs'), fallback: null });
    return groups.includes(r.value) ? r.value : null;
  }

  /** Thi hành thẻ dỡ nhà lên khu đã chốt: bốc thăm từng ô, quay xong ô nào dỡ ô ấy. */
  *demolishInGroup(p, card, title, key) {
    const st = this.st;
    if (!demolishGroups(st, card, p.id).includes(key)) return;
    const { candidates, hits } = demolishPicks(st, card, p.id, key);
    if (hits.length === 0) return;
    this.say(title, candidates.length > 1
      ? `<b>${p.name}</b> nhắm vào khu <b>${GROUPS[key].name}</b>.
         Bàn cờ đang bốc thăm giữa <b>${candidates.length}</b> ô.`
      : `<b>${p.name}</b> nhắm vào khu <b>${GROUPS[key].name}</b>.
         Khu chỉ có <b>${tileLabel(candidates[0])}</b> có nhà, ô ấy lãnh đủ.`, { kind: 'bad', ms: 2200 });
    let wheel = [...candidates];
    for (const hit of hits) {
      if (wheel.length > 1) this.fx('spin', { ids: wheel, tileId: hit.id });
      wheel = wheel.filter((id) => id !== hit.id);
      if (st.housesOn(hit.id) === 0) continue;
      this.demolishHouse(p, hit.id, hit.levels, title);
    }
    this.fx('highlight', { tile: p.pos, seat: p.id });
  }

  /** Giải toả bốc thăm: engine gieo một lần, mọi máy quay đúng vòng ấy. */
  *resumeRandom(p, card, title) {
    const ids = cardTargets(this.st, card, p.id);
    if (ids.length === 0) return;
    const tileId = ids[Math.floor(Math.random() * ids.length)];
    this.say(title,
      `<b>${p.name}</b> bốc thăm giữa <b>${ids.length}</b> lô đất trống trên bàn.
       Bàn cờ đang quay.`, { kind: 'trade', ms: 2200 });
    this.fx('spin', { ids, tileId });
    this.fx('highlight', { tile: p.pos, seat: p.id });
    yield* this.resumeTile(p, tileId, card, title);
  }

  /** Dỡ nhà một ô: mất mấy cấp, không đền bù đồng nào. */
  demolishHouse(p, tileId, levels, title) {
    const st = this.st;
    const owner = st.ownerOf(tileId);
    const before = st.housesOn(tileId);
    if (deedHolds(st, tileId, levels)) {
      this.sfx('shake');
      this.fx('quake', { strong: false });
      this.sync();
      this.say(title,
        `<b>${p.name}</b> cho thợ tới dỡ nhà của <b>${owner.name}</b> ở <b>${tileLabel(tileId)}</b>,
         nhưng <b>Sổ Hồng</b> hợp lệ: nhà đứng nguyên.`);
      this.spot([tileId]);
      return;
    }
    let gone = 0;
    for (let i = 0; i < levels && st.housesOn(tileId) > 0; i++) {
      st.demolish(tileId);
      gone += 1;
    }
    this.sfx('shake');
    this.fx('quake', { strong: false });
    if (gone) this.tileFx('quake', [tileId]);
    this.sync();
    this.say(title,
      `<b>${p.name}</b> cho dỡ <b>${before === 5 && gone === 1 ? 'khách sạn' : `${gone} cấp nhà`}</b>
       của <b>${owner.name}</b> ở <b>${tileLabel(tileId)}</b>,
       <span class="down">không đền đồng nào</span>.`, { kind: 'bad' });
    this.spot([tileId]);
  }

  /** Giải toả: chủ cũ lãnh tiền đền (giá gốc +20%), rồi lô ấy đem đấu giá kín. */
  *resumeTile(p, tileId, card, title) {
    const st = this.st;
    const owner = st.ownerOf(tileId);
    const payout = resumePrice(tileId, card);
    st.owner.delete(tileId);
    st.mortgaged.delete(tileId);
    this.sync();
    this.say(title,
      `<b>${p.name}</b> cắm mốc giải toả <b>${tileLabel(tileId)}</b>.
       <b>${owner.name}</b> lãnh tiền đền <span class="up">${money(payout)}</span>
       (giá gốc +20%).`, { kind: 'trade' });
    this.spot([tileId]);
    this.receiveFromBank(owner.id, payout);
    yield* this.events.auction(tileId, {
      seller: null,
      reason: `Lô đất vừa giải toả khỏi tay ${owner.name}. Toà Đô Chánh bán lại cho ai trả cao nhất.`,
    });
  }

  /** Cưỡng chế mua: lô đất sang tên, chủ cũ nhận giá gốc +25%. */
  *seizeTile(p, tileId, title) {
    const st = this.st;
    const owner = st.ownerOf(tileId);
    const price = seizePrice(tileId);
    this.say(title,
      `<b>${p.name}</b> cưỡng chế mua <b>${tileLabel(tileId)}</b> của <b>${owner.name}</b>,
       trả <span class="down">${money(price)}</span> (giá gốc +25%).`, { kind: 'trade' });
    this.spot([tileId]);
    // Trả tiền đền trước: người dùng thẻ vỡ nợ ngay tại đây thì đất không đi đâu cả
    if (!(yield* this.payPlayer(p.id, owner.id, price))) return;
    if (st.owner.get(tileId) !== owner.id) return;
    st.transfer(tileId, p.id);
    this.sfx('trade');
    this.sync();
    this.say('SANG TÊN', `<b>${tileLabel(tileId)}</b> nay thuộc về ${named(p)}.`, { kind: 'trade' });
  }

  /* ================================================================
     Tiền nong
     ================================================================ */

  /** Ngân hàng chi tiền cho người chơi. Không hỏi ai nên không phải generator. */
  receiveFromBank(playerId, amount) {
    const p = this.st.players[playerId];
    this.st.dryTurn = false;
    p.money += amount;
    this.sync();
    this.fly('bank', playerId, amount, '+');
  }

  /**
   * Người chơi trả tiền cho ngân hàng; thiếu thì xoay tiền hoặc vỡ nợ.
   * @returns {Generator<any, boolean>} false nếu người chơi phá sản
   */
  *payBank(playerId, amount) {
    if (!(yield* this.ensureFunds(playerId, amount))) return false;
    const p = this.st.players[playerId];
    this.st.dryTurn = false;
    p.money -= amount;
    this.sync();
    this.fly(playerId, 'bank', amount, '−');
    return true;
  }

  /**
   * Người chơi trả tiền cho người chơi khác. Khoản nợ ghi vào trạng thái
   * **trước khi** hỏi han, để ván dựng lại giữa chừng vẫn biết chủ đất chưa được trả.
   */
  *payPlayer(fromId, toId, amount) {
    const st = this.st;
    st.debt = { from: fromId, to: toId, amount };
    if (!(yield* this.ensureFunds(fromId, amount))) {
      yield* this.coverDebt(fromId);
      return false;
    }
    const from = st.players[fromId];
    const to = st.players[toId];
    st.dryTurn = false;
    from.money -= amount;
    to.money += amount;
    st.debt = null;
    this.sync();
    this.fly(fromId, toId, amount, '−');
    return true;
  }

  /**
   * Con nợ vỡ nợ thì chủ nợ nhận **số con nợ gom được**, ngân hàng không bù
   * phần thiếu. Khoản nợ đọc từ `state.debt`.
   */
  *coverDebt(seat) {
    const st = this.st;
    const d = st.debt;
    if (!d || d.from !== seat) return 0;
    st.debt = null;
    const to = st.players[d.to];
    const from = st.players[d.from];
    if (!to || to.bankrupt) { this.sync(); return 0; }
    const left = d.left ?? 0;
    if (left <= 0) {
      this.sync();
      this.say('MẤT TRẮNG',
        `<b>${from.name}</b> vỡ nợ, bán sạch nhà đất vẫn không còn đồng nào trả <b>${to.name}</b>.`,
        { kind: 'bad', ms: 3200 });
      return 0;
    }
    st.dryTurn = false;
    to.money += left;
    this.sync();
    this.say('TRẢ PHẦN CÒN LẠI',
      `<b>${from.name}</b> vỡ nợ, bán sạch nhà đất trả được
       <span class="up">${money(left)}</span> trên ${money(d.amount)} cho <b>${to.name}</b>.`, { ms: 3200 });
    this.fly(d.from, d.to, left, '+');
    return left;
  }

  /**
   * Bảo đảm người chơi có đủ `amount`. Thiếu thì Bảo Hiểm Xã Hội trả hộ trước,
   * rồi hỏi **chính con nợ** bán nhà / thế chấp — câu hỏi hiện ở máy họ, kể cả
   * khi người đang đi là người khác (thẻ góp tiền mừng, đấu giá, cưỡng chiếm).
   * Engine làm lại các thao tác họ gửi về qua đúng cửa luật của `GameState`.
   *
   * @returns {Generator<any, boolean>} false nếu đã phá sản
   */
  *ensureFunds(playerId, amount) {
    const st = this.st;
    const p = st.players[playerId];
    if (p.money >= amount) return true;
    yield* this.skills.insure(p, amount);
    if (p.money >= amount) return true;

    // Bot xoay theo luật của cấp nó, giữ nhà, cầm đất ít sinh lời trước
    if (this.e.isBot(playerId)) return yield* this.autoCover(playerId, amount, this.bot.raiser(playerId));

    while (p.money < amount) {
      // Máy con nợ đã rớt: đừng hỏi một câu không ai nghe, cấn nợ hộ luôn
      if (!this.e.isLive(playerId)) {
        if (!(yield* this.autoCover(playerId, amount))) return false;
        continue;
      }
      this.sync();
      if (this.st.settings.clock) {
        this.say('CHỜ XOAY TIỀN',
          `<b>${p.name}</b> còn thiếu <span class="down">${money(amount - p.money)}</span>,
           đang chờ họ bán nhà hoặc thế chấp…`, { kind: 'bad', ms: 2600 });
      }
      const r = yield* this.ask(playerId, 'raise', { seat: playerId, amount },
        { ms: this.ms('raiseMs'), fallback: null });
      const ans = r.value;
      if (!ans || typeof ans !== 'object') {
        if (!(yield* this.autoCover(playerId, amount))) return false;
        continue;
      }
      // Thao tác họ kịp bấm vẫn tính, kể cả khi sau đó mới hết giờ
      const done = this.applyRaiseActs(playerId, ans.acts);
      // Tuyên bố phá sản là quyền của chính con nợ, kể cả khi còn xoay được
      if (ans.bankrupt) { yield* this.doBankrupt(playerId); return false; }
      if (p.money >= amount) break;
      /* Hết giờ, hoặc trả lời về mà ván không nhúc nhích: hỏi lại nữa thì
         thành vòng lặp không lối ra, nên cấn nợ hộ cho xong khoản này. */
      if (r.timeout || ans.timeout || done === 0) {
        if (!(yield* this.autoCover(playerId, amount))) return false;
      }
    }
    return true;
  }

  /**
   * Làm lại trên ván những thao tác con nợ vừa bấm. Không tin lời suông: mỗi
   * thao tác đi qua cửa luật của `GameState`, chỉ nhắm vào đất của chính họ.
   * @returns {number} số thao tác có hiệu lực
   */
  applyRaiseActs(playerId, acts) {
    const st = this.st;
    const p = st.players[playerId];
    const touched = [];
    const words = [];
    let gained = 0;
    for (const a of Array.isArray(acts) ? acts.slice(0, 200) : []) {
      const id = Number(a?.id);
      if (!Number.isInteger(id) || !BOARD[id] || st.owner.get(id) !== playerId) continue;
      let res = null;
      if (a.act === 'sell') res = st.sellHouse(playerId, id);
      else if (a.act === 'mortgage') res = st.mortgage(playerId, id);
      else if (a.act === 'redeem') res = st.redeem(playerId, id);
      else if (a.act === 'build') res = st.build(playerId, id);
      if (!res?.ok) continue;
      touched.push(id);
      const label = tileLabel(id);
      if (a.act === 'sell') { gained += res.refund; words.push(`bán một căn ở <b>${label}</b>`); }
      else if (a.act === 'mortgage') {
        gained += res.amount;
        addPressure(st, PRESSURE.mortgage);
        words.push(`cầm cố <b>${label}</b>`);
      } else if (a.act === 'redeem') { gained -= res.cost; words.push(`chuộc <b>${label}</b>`); }
      else { gained -= res.cost; words.push(`xây ở <b>${label}</b>`); }
    }
    if (touched.length === 0) return 0;
    this.sfx('coin');
    this.sync();
    // Một dòng cho cả loạt: cả bàn chỉ cần biết họ xoay được bao nhiêu
    this.say('XOAY TIỀN',
      `<b>${p.name}</b> ${words.join(' · ')},
       ${gained >= 0 ? `nhận <span class="up">${money(gained)}</span>` : `chi <span class="down">${money(-gained)}</span>`}.`,
      { ms: 3600 });
    this.spot(touched);
    return touched.length;
  }

  /**
   * Ngân hàng cấn nợ hộ (hết giờ, rớt mạng): thế chấp ô rẻ nhất trước, giữ
   * nhà tới cùng. Bot truyền `raiser` của nó vào để xoay theo luật riêng.
   * @returns {Generator<any, boolean>} false nếu đã phá sản
   */
  *autoCover(playerId, amount, raiser = null) {
    const st = this.st;
    const p = st.players[playerId];
    const bot = !!raiser;
    const { ok, mortgaged, sold } = (raiser ?? autoRaise)(st, playerId, amount);
    this.sync();
    if (mortgaged.length || sold.length) {
      const gone = [...mortgaged, ...sold].map((id) => tileLabel(id));
      this.say(bot ? 'XOAY TIỀN' : 'CẤN NỢ',
        bot
          ? `<b>${p.name}</b> xoay cho đủ <span class="down">${money(amount)}</span>: ${gone.join(' · ')}.`
          : `<b>${p.name}</b> chưa xoay tiền. Ngân hàng cấn nợ hộ cho đủ
             <span class="down">${money(amount)}</span>: ${gone.join(' · ')}.`,
        { kind: 'bad', ms: 3600 });
      this.spot([...mortgaged, ...sold]);
    }
    if (ok) return true;
    this.say('VỠ NỢ', `<b>${p.name}</b> không xoay nổi <span class="down">${money(amount)}</span>, vỡ nợ.`,
      { kind: 'bad', ms: 4000 });
    yield* this.doBankrupt(playerId);
    return false;
  }

  /* ================================================================
     Tù
     ================================================================ */

  *goToJail(p) {
    const st = this.st;
    st.sendToJail(p);
    this.sfx('jail');
    this.fx('jail', { seat: p.id });
    this.sync();
    this.fx('highlight', { tile: JAIL_TILE, seat: p.id });
    yield* this.skills.jailed(p);
  }

  /** Vé ra tù: thả ngay, không tốn đồng nào, rồi lắc đi như thường. */
  *useJailCard(pull = true) {
    const st = this.st;
    const p = st.current;
    yield* this.skills.jailWage(p);
    if (pull) {
      const at = st.jailCardAt(p.id);
      if (at < 0 || !st.dropCard(p.id, at)) return;
    }
    st.releaseFromJail(p);
    this.sfx('jail');
    this.sync();
    this.say('DÙNG VÉ RA TÙ', `<b>${p.name}</b> dùng giấy bãi nại, ra khỏi Khám Lớn không tốn đồng nào.`);
    yield* this.takeRoll();
  }

  /** Ở Tù Cho Lành: ngồi yên trong tù, hết lượt ngay. */
  *sitInJail() {
    const p = this.st.current;
    yield* this.skills.jailWage(p);
    if (!this.skills.canSit(p)) return;
    p.jailSits = (p.jailSits ?? 0) + 1;
    this.sync();
    this.say('NGỒI YÊN', `<b>${p.name}</b> ở lại Khám Lớn. Lượt này không tính vào hạn 3 lượt.`, { ms: 2200 });
    yield* this.endTurn();
  }

  *payOutOfJail() {
    const st = this.st;
    const p = st.current;
    yield* this.skills.jailWage(p);
    if (this.skills.freeBail(p, JAIL_FINE)) {
      this.say('RA TÙ MIỄN PHÍ', `<b>${p.name}</b> là <b>Khách Quen Nhà Đá</b>, ra tù không mất đồng nào.`);
    } else {
      this.say('NỘP TIỀN RA TÙ', `<b>${p.name}</b> nộp <span class="down">${money(JAIL_FINE)}</span> để được tự do.`);
      if (!(yield* this.payBank(p.id, JAIL_FINE))) { yield* this.endTurn(); return; }
    }
    st.releaseFromJail(p);
    this.sync();
    yield* this.takeRoll();
  }

  /**
   * Lắc trong tù: mỗi lượt cầu đôi một lần. Trượt thì hết lượt; lần thứ ba
   * vẫn trượt thì nộp phạt rồi đi theo số vừa lắc.
   */
  *rollInJail() {
    const st = this.st;
    const p = st.current;
    yield* this.skills.jailWage(p);
    const d = rollDice();
    this.fx('dice', { a: d.a, b: d.b });
    yield* this.skills.rollPerks(p, d);
    if (st.over || p.bankrupt) { yield* this.endTurn(); return; }

    if (d.isDouble) {
      st.releaseFromJail(p);
      st.rolled = true;
      this.sync();
      this.say('RA ĐÔI, ĐƯỢC THA', `<b>${p.name}</b> đổ đôi ${d.a}, rời Khám Lớn và đi ${d.sum} ô.`);
      yield* this.advance(p, d.sum + this.iceSlide(p), d);
      // Ra đôi để thoát tù không cho thêm lượt lắc
      if (st.over || p.bankrupt || p.inJail) yield* this.endTurn();
      return;
    }

    p.jailTurns += 1;
    if (p.jailTurns >= MAX_JAIL_TURNS) {
      const free = this.skills.freeBail(p, JAIL_FINE);
      this.say('HẾT HẠN 3 LƯỢT',
        free
          ? `<b>${p.name}</b> cầu đôi hụt lần thứ ${MAX_JAIL_TURNS}, là <b>Khách Quen Nhà Đá</b> nên khỏi nộp phạt, đi ${d.sum} ô.`
          : `<b>${p.name}</b> cầu đôi hụt lần thứ ${MAX_JAIL_TURNS}, phải nộp
             <span class="down">${money(JAIL_FINE)}</span> rồi đi ${d.sum} ô.`,
        { kind: 'bad' });
      if (!free && !(yield* this.payBank(p.id, JAIL_FINE))) { yield* this.endTurn(); return; }
      st.releaseFromJail(p);
      st.rolled = true;
      this.sync();
      yield* this.advance(p, d.sum + this.iceSlide(p), d);
      if (st.over || p.bankrupt || p.inJail) yield* this.endTurn();
      return;
    }

    this.sync();
    this.say('CHƯA RA ĐÔI',
      `<b>${p.name}</b> ngồi tiếp, đã cầu đôi hụt <b>${p.jailTurns}/${MAX_JAIL_TURNS}</b> lượt.`, { kind: 'bad' });
    yield* this.endTurn();
  }

  /* ================================================================
     Quản lý tài sản
     ================================================================ */

  /**
   * Một thao tác ở bảng quản lý tài sản. Bảng mở ở máy người chơi, mỗi cú bấm
   * gửi một action; engine làm thật rồi loan tin ngay, để máy khác đọc dòng
   * "đã xây nhà" thì số tiền và căn nhà trên bàn cũng đã đổi theo.
   */
  *manageAct(seat, act, id) {
    const st = this.st;
    if (!Number.isInteger(id) || !BOARD[id] || st.owner.get(id) !== seat) return;
    const fn = { build: 'build', sell: 'sellHouse', mortgage: 'mortgage', redeem: 'redeem' }[act];
    if (!fn) return;
    const res = st[fn](seat, id);
    if (!res?.ok) { this.e.emit('rejected', { action: 'manage', seat, reason: res?.reason ?? '' }); return; }
    const p = st.players[seat];
    const label = tileLabel(id);
    this.sync();
    this.spot([id]);
    if (act === 'build') {
      this.say(res.isHotel ? 'LÊN KHÁCH SẠN' : 'XÂY NHÀ',
        res.isHotel
          ? `<b>${p.name}</b> xây <b>khách sạn</b> ở <b>${label}</b>, trả lại 4 căn nhà cho ngân hàng.`
          : `<b>${p.name}</b> xây thêm một căn nhà ở <b>${label}</b> (<span class="down">−${money(res.cost)}</span>).`);
      yield* this.skills.contractorNote(res.payouts);
    } else if (act === 'sell') {
      this.say('BÁN NHÀ', `<b>${p.name}</b> bán lại một căn ở <b>${label}</b> (<span class="up">+${money(res.refund)}</span>).`);
      yield* this.skills.contractorNote(res.payouts);
    } else if (act === 'mortgage') {
      addPressure(st, PRESSURE.mortgage);
      this.say('THẾ CHẤP', `<b>${p.name}</b> cầm cố <b>${label}</b>, nhận <span class="up">${money(res.amount)}</span>.`);
    } else {
      this.say('CHUỘC TÀI SẢN', `<b>${p.name}</b> chuộc <b>${label}</b> với <span class="down">${money(res.cost)}</span> (đã gồm lãi 10%).`);
    }
  }

  /* ================================================================
     Giao dịch
     ================================================================ */

  /**
   * Đề nghị giao dịch dựng ở máy người đang đi, gửi tới đây nguyên gói. Soát
   * lại từng món, hỏi bên kia, soát lần nữa trước khi chốt.
   */
  *trade(raw) {
    const st = this.st;
    const A = st.current;
    const offer = validOffer(st, A.id, raw);
    if (!offer) { this.e.emit('rejected', { action: 'trade', seat: A.id }); return; }
    const B = st.players[offer.to];

    this.say('ĐỀ NGHỊ GIAO DỊCH', describeOffer(st, offer), { kind: 'trade', ms: 5200 });
    this.spot([...offer.give, ...offer.get], 2200);

    let accepted;
    if (this.e.isBot(B.id)) {
      accepted = this.bot.reviewTrade(offer, B.id, A.id);
    } else {
      if (st.settings.clock) {
        this.say('CHỜ TRẢ LỜI', `Đang chờ <b>${B.name}</b> xem xét đề nghị…`, { kind: 'trade', ms: 3000 });
      }
      const r = yield* this.ask(B.id, 'trade-review', { offer }, { ms: this.ms('tradeMs'), fallback: false });
      accepted = r.value === true;
      if (r.timeout) {
        this.say('HẾT GIỜ', `<b>${B.name}</b> không trả lời kịp, đề nghị coi như bị từ chối.`, { kind: 'bad', ms: 3200 });
      }
    }

    if (!accepted) {
      // Không ai chịu đổi chác chính là lúc bàn cần một cơn biến động
      addPressure(st, PRESSURE.tradeRefused);
      this.say('TỪ CHỐI GIAO DỊCH',
        `<b>${B.name}</b> không đồng ý với đề nghị của <b>${A.name}</b>.`, { kind: 'bad', ms: 4200 });
      return;
    }
    if (A.bankrupt || B.bankrupt) {
      this.say('GIAO DỊCH HỎNG', 'Một bên đã rời bàn trước khi chốt.', { kind: 'bad' });
      return;
    }
    // Soát lần nữa: thương lượng kéo dài, tiền và đất có thể đã đổi
    if (!validOffer(st, A.id, offer)) {
      this.say('GIAO DỊCH HỎNG', 'Một bên không còn đủ tiền mặt hoặc đất như đã đề nghị.', { kind: 'bad' });
      return;
    }
    yield* this.executeTrade(offer, A, B);
  }

  /** Chuyển tài sản + tiền giữa hai bên. */
  *executeTrade(offer, A, B) {
    const st = this.st;
    // Hai bên là A và B; gói đề nghị có thể không ghi `from` / `to` (bot, bộ kiểm thử)
    offer = { ...offer, from: A.id, to: B.id };
    this.sfx('trade');
    for (const id of offer.give) st.transfer(id, B.id);
    for (const id of offer.get) st.transfer(id, A.id);
    const net = offer.giveMoney - offer.getMoney;
    A.money -= offer.giveMoney; A.money += offer.getMoney;
    B.money -= offer.getMoney; B.money += offer.giveMoney;
    this.sync();
    if (net !== 0) {
      const [srcId, dstId, amt] = net > 0 ? [A.id, B.id, net] : [B.id, A.id, -net];
      this.fly(srcId, dstId, amt, '');
    }
    this.say('GIAO DỊCH THÀNH CÔNG', describeOffer(st, offer, true), { kind: 'trade', ms: 6000 });
    this.spot([...offer.give, ...offer.get], 2600);
    yield* this.skills.tradeFees(offer, A, B);
    // Chủ mới của đất đang thế chấp được mời chuộc lại (phí = thế chấp + 10%)
    yield* this.offerRedeem(B.id, offer.give.filter((id) => st.isMortgaged(id)));
    yield* this.offerRedeem(A.id, offer.get.filter((id) => st.isMortgaged(id)));
  }

  /** Mời **chủ mới** chuộc các ô vừa nhận đang bị thế chấp — tiền của họ, quyết định của họ. */
  *offerRedeem(playerId, ids) {
    if (ids.length === 0) return;
    const st = this.st;
    const p = st.players[playerId];
    if (st.settings.clock && !this.e.isBot(playerId)) {
      this.say('CHỜ TRẢ LỜI',
        `Đang chờ <b>${p.name}</b> quyết định có chuộc ${ids.length} ô vừa nhận không…`, { kind: 'trade', ms: 2600 });
    }
    const r = yield* this.ask(playerId, 'redeem', { seat: playerId, ids }, { ms: this.ms('tradeMs'), fallback: null });
    const total = ids.reduce((s, id) => s + BOARD[id].redeem, 0);
    // Túi tiền có thể đã vơi đi từ lúc hỏi tới lúc trả lời — không tin câu trả lời suông
    if (r.value !== 'all' || p.money < total || ids.some((id) => st.owner.get(id) !== playerId || !st.isMortgaged(id))) {
      this.say('CÒN NỢ NGÂN HÀNG',
        `<b>${p.name}</b> giữ ${ids.length} ô đang thế chấp, chuộc sau ở mục Quản lý tài sản.`, { ms: 3600 });
      return;
    }
    for (const id of ids) st.redeem(playerId, id);
    this.sync();
    this.fly(playerId, 'bank', total, '−');
    this.say('CHUỘC TÀI SẢN',
      `<b>${p.name}</b> trả ngân hàng <span class="down">${money(total)}</span> để chuộc ${ids.length} ô (đã gồm lãi 10%).`);
    this.spot(ids);
  }

  /* ================================================================
     Phá sản, hạ màn
     ================================================================ */

  /** Nút "Phá sản" ở thanh nút — hộp xác nhận đã mở ở máy người chơi. */
  *declareBankrupt(seat) {
    yield* this.doBankrupt(seat);
    if (this.checkGameOver()) { this.sync(); return; }
    yield* this.endTurn();
  }

  /** Giải thể tài sản về ngân hàng, chủ nợ nhận phần gom được. */
  *doBankrupt(playerId) {
    const st = this.st;
    const p = st.players[playerId];
    const props = st.propertiesOf(playerId).length;
    this.sfx('bankrupt');
    st.bankrupt(playerId);
    this.sync();
    this.say('PHÁ SẢN',
      `<b>${p.name}</b> vỡ nợ! ${props} ô đất cùng toàn bộ nhà cửa được trả về <b>ngân hàng</b>.`,
      { kind: 'bad', ms: 5000 });
    this.fx('bankruptFx', { seat: playerId });
    yield* this.coverDebt(playerId);
    this.fx('fireworks', { seat: playerId });
  }

  /** Ván đã ngã ngũ chưa; ngã ngũ thì chốt và báo bên diễn. */
  checkGameOver() {
    const st = this.st;
    if (st.over) return true;
    const w = st.winCheck();
    if (!w) return false;
    st.over = true;
    st.endedAt = this.e.now;
    sampleMoney(st, st.turnNo + 1);
    this.fx('hideDice');
    this.fx('gameover', { seat: w.player.id, by: w.by });
    return true;
  }
}

/** Dòng giới thiệu ván cho bên diễn hiện lúc khai cuộc. */
export function openingLine(st) {
  return `Ván cờ bắt đầu, mỗi người ${money(START_MONEY)} vốn liếng. Thắng khi còn trụ lại một mình,
    giữ ${WIN_SETS} bộ màu với ${WIN_HOTEL_SETS} bộ phủ kín khách sạn, hoặc gom đủ ${money(WIN_WORTH)} tổng tài sản.`;
}
