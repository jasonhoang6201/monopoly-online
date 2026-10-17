/**
 * Ghế máy — ba cấp Dễ / Vừa / Khó, chạy ngay trong engine.
 *
 * Bot không có đường đi riêng qua luật: nó chọn đúng những nước người chơi
 * chọn ở thanh nút và trả lời đúng những câu hỏi người chơi được hỏi. Quyết
 * định nằm ở core/botPolicy.js (thuần dữ liệu). Nằm trong engine thì mọi lần
 * gieo của bot đi qua RNG của ván, nên chạy lại log vẫn ra đúng nước bot đã đi,
 * và `npm run sim:bots` chơi được bằng đúng engine này.
 *
 * Trí nhớ dài hạn của bot (lối học, ô đã hỏi mua) nằm trong `st.flow.bot` để
 * đi theo ảnh chụp.
 */
import { BOARD, tileLabel } from '../data/board.js';
import { has, skillById, levelOf, learnSkill } from '../core/skills.js';
import * as BP from '../core/botPolicy.js';
import { describeOffer } from './offer.js';

export class BotRules {
  /** @param {import('./game.js').Rules} g */
  constructor(g) { this.g = g; }

  get st() { return this.g.st; }

  lv(seat) { return BP.levelOfKey(this.st.bots?.[seat]); }

  /** Trí nhớ của một ghế máy: `memo` cho `nextSkill`, `tried` cho `proposeTrade`. */
  mem(seat) {
    const f = this.st.flow;
    f.bot ??= {};
    f.bot[seat] ??= { memo: {}, tried: {} };
    return f.bot[seat];
  }

  /** Bot thiếu tiền: xoay theo luật của cấp nó. */
  raiser(seat) {
    return (st, s, need) => BP.raise(st, st.players[s], need, this.lv(seat));
  }

  /** Nhịp nghĩ của bot, để người ngồi xem theo kịp — bên diễn đứng chờ chừng ấy. */
  pause() { this.g.fx('wait', { ms: this.st.settings.timing?.botMs ?? 650 }); }

  /* ================================================================
     Lượt của bot
     ================================================================ */

  /** Một nước của bot: học kỹ năng, dùng thẻ, lo tài sản, hỏi mua đất, rồi lắc hoặc kết thúc. */
  *step(p) {
    const st = this.st;
    const g = this.g;
    const lv = this.lv(p.id);
    this.pause();
    this.learn(p);
    if (p.inJail) {
      const how = BP.jailChoice(st, p, lv, has(p, 'cnX2'));
      if (how === 'card') { yield* g.useJailCard(); return; }
      if (how === 'pay') { yield* g.payOutOfJail(); return; }
      yield* g.rollInJail();
      return;
    }
    // Thẻ trước khi xây: cưỡng chế cần tiền mặt, mà đủ bộ rồi mới có chỗ xây
    if (!st.rolled) yield* this.playCards(p);
    if (st.over || p.bankrupt) return;
    yield* this.manage(p);
    if (!st.rolled) yield* this.propose(p);
    if (st.over || p.bankrupt) return;
    if (st.rolled) { yield* g.endTurn(); return; }
    yield* g.takeRoll(true);
  }

  /** Tiêu điểm kỹ năng theo cấp. */
  learn(p) {
    const st = this.st;
    const got = [];
    const { memo } = this.mem(p.id);
    for (let n = 0; n < 12 && p.skillPoints > 0; n++) {
      const id = BP.nextSkill(st, p, this.lv(p.id), memo);
      if (!id || !learnSkill(p, id, st).ok) break;
      const lv = levelOf(p, id);
      got.push(`<b>${skillById(id).name}</b>${lv > 1 ? ` lên level ${lv}` : ''}`);
    }
    if (!got.length) return;
    this.g.sync();
    this.g.say('HỌC KỸ NĂNG', `<b style="color:${p.token.css}">${p.name}</b> học ${got.join(', ')}.`, { ms: 2200 });
  }

  /** Chuộc, cầm đất lấy vốn, xây nhà — rồi loan tin một lần cho cả loạt. */
  *manage(p) {
    const st = this.st;
    const g = this.g;
    const acts = BP.manage(st, p, this.lv(p.id));
    if (!acts.length) return;
    const words = acts.map(({ act, id, res }) => {
      const at = `<b>${tileLabel(id)}</b>`;
      if (act === 'redeem') return `chuộc ${at}`;
      if (act === 'mortgage') return `cầm ${at} lấy vốn`;
      return res.isHotel ? `lên khách sạn ở ${at}` : `xây nhà ở ${at}`;
    });
    g.sync();
    g.say('LO TÀI SẢN', `<b style="color:${p.token.css}">${p.name}</b> ${words.join(' · ')}.`, { ms: 2600 });
    for (const { res } of acts) yield* g.skills.contractorNote(res.payouts);
    g.spot([...new Set(acts.map((a) => a.id))], 1400);
  }

  /**
   * Lôi thẻ trong túi ra dùng. Đi đúng đường nút "Túi thẻ" của người: câu hỏi
   * mục tiêu tới ghế bot thì `answer` trả về đúng ô / khu đã chọn ở `aim`.
   */
  *playCards(p) {
    const st = this.st;
    for (let n = 0; n < 3 && !st.over && !p.bankrupt; n++) {
      const play = BP.cardPlay(st, p, this.lv(p.id));
      if (!play) return;
      const before = p.cards.length;
      this.aim = { seat: p.id, target: play.target };
      try { yield* this.g.useHeldCard(play.at); } finally { this.aim = null; }
      // Thẻ không rời túi (mục tiêu vừa hết hợp lệ) thì thôi, kẻo lặp lại mãi
      if (p.cards.length >= before) return;
    }
  }

  /** Hỏi mua ô còn thiếu của bộ. Người thật nhận câu hỏi duyệt như đề nghị của người khác. */
  *propose(p) {
    const st = this.st;
    const g = this.g;
    const mem = this.mem(p.id);
    const tried = new Map(Object.entries(mem.tried).map(([k, v]) => [Number(k), v]));
    const o = BP.proposeTrade(st, p, this.lv(p.id), tried);
    mem.tried = Object.fromEntries(tried);
    if (!o) return;
    const B = st.players[o.to];
    const offer = { from: p.id, to: o.to, give: o.give, giveMoney: o.giveMoney, get: o.get, getMoney: o.getMoney };
    g.say('ĐỀ NGHỊ GIAO DỊCH', describeOffer(st, offer), { kind: 'trade', ms: 3600 });
    let accepted;
    if (g.e.isBot(B.id)) accepted = this.reviewTrade(offer, B.id, p.id);
    else {
      const r = yield* g.ask(B.id, 'trade-review', { offer }, { ms: g.ms('tradeMs'), fallback: false });
      accepted = r.value === true;
    }
    // Soát lại trước khi chốt: câu hỏi có thể treo khá lâu
    if (!accepted || p.bankrupt || B.bankrupt || p.money < offer.giveMoney
      || offer.get.some((id) => st.owner.get(id) !== B.id || st.housesOn(id) > 0)) {
      g.say('TỪ CHỐI GIAO DỊCH',
        `<b>${B.name}</b> không bán <b>${offer.get.map((id) => tileLabel(id)).join(', ')}</b> cho <b>${p.name}</b>.`,
        { kind: 'bad', ms: 2600 });
      return;
    }
    yield* g.executeTrade(offer, p, B);
  }

  /* ================================================================
     Trả lời câu hỏi
     ================================================================ */

  /** Duyệt đề nghị gửi tới bot. */
  reviewTrade(offer, seat, fromSeat) {
    const me = this.st.players[seat];
    this.g.say('CÂN NHẮC', `<b style="color:${me.token.css}">${me.name}</b> đang tính toán đề nghị…`, { kind: 'trade', ms: 1600 });
    return BP.acceptTrade(this.st, offer, seat, fromSeat, this.lv(seat));
  }

  /**
   * Câu hỏi tới ghế máy. Câu nào không có luật riêng thì trả lời mặc định —
   * chính câu trả lời dành cho người vắng mặt.
   */
  answer(seat, kind, data, fallback) {
    const st = this.st;
    const p = st.players[seat];
    const lv = this.lv(seat);
    this.pause();
    const lots = data?.lots ?? [];
    const spare = (key) => p.money - lots.reduce((s, l) => s + (l[key] ?? 0), 0) >= lv.buyReserve + 50;
    if (this.aim?.seat === seat && (kind === 'ev-pick' || kind === 'ev-group')) return this.aim.target;
    switch (kind) {
      case 'buy': return BP.wantBuy(st, p, data.tileId, lv) ? 'buy' : 'skip';
      case 'trade-review': return this.reviewTrade(data.offer, seat, data.offer.from);
      case 'redeem': {
        const total = data.ids.reduce((s, id) => s + BOARD[id].redeem, 0);
        return p.money - total > lv.redeemReserve ? 'all' : null;
      }
      case 'ev-brace': return spare('brace') ? 'brace' : null;
      case 'ev-fire':
      case 'ev-snow': return spare('save') ? 'save' : null;
      case 'ev-zombie': return spare('cost') ? 'pay' : null;
      case 'ev-bid': return BP.bidFor(st, p, data.tileId, lv);
      default: return fallback;
    }
  }
}
