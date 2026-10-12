/**
 * Máy chơi thay một ghế — chỉ có ở bản một máy. Ba cấp Dễ / Vừa / Khó.
 *
 * Bot không có đường đi riêng qua luật: nó bấm đúng những nút người chơi bấm
 * (`takeRoll`, `payOutOfJail`, `endTurn`…) và trả lời đúng những câu hỏi người
 * chơi được hỏi. Nhờ vậy mọi luật, mọi kỹ năng, mọi hoạt cảnh chạy y như lượt
 * của người, không có bản luật thứ hai để lệch nhau.
 *
 * Quyết định nằm ở core/botPolicy.js (mua, xây, tù, đấu giá, giao dịch, kỹ
 * năng, xoay tiền) cùng phần dự đoán xí ngầu ở core/predict.js — thuần dữ
 * liệu, để `npm run sim:bots` chơi cả nghìn ván bằng đúng bộ luật ấy mà chỉnh
 * số. Tệp này chỉ nối luật ấy vào ván thật.
 *
 * Ba cửa bot nhận việc:
 *   1. **Thanh nút** — `Game.setTurnActions` gặp ghế máy thì gọi `schedule`,
 *      bot tự chọn nước đi (học kỹ năng, lo tài sản, hỏi mua đất, lắc…).
 *   2. **Câu hỏi có tên** — mua đất, đấu giá, chống đỡ thiên tai, duyệt giao
 *      dịch, xoay tiền: controller hỏi thẳng bot thay vì mở hộp thoại.
 *   3. **Hộp thoại còn lại** (Thâu Tóm, Tàu Tốc Hành, bóc thẻ…) — nhịp canh
 *      `tick` đóng hộ bằng lựa chọn mặc định, đúng đường hết giờ của bản online
 *      (`dismissTopModal`), sau một quãng đủ cho người ngồi xem kịp đọc.
 */
import { BOARD, tileLabel } from '../data/board.js';
import { has, skillById, levelOf, learnSkill } from '../core/skills.js';
import * as BP from '../core/botPolicy.js';
import { dismissTopModal, handoff, openModal, setHandoffSkip } from '../ui/modal.js';
import { describe, tradeReviewModal } from '../ui/modals.js';
import { litTiles } from '../ui/tilePicker.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mỗi nước của bot cách nhau chừng này — đủ cho người ngồi xem theo kịp. */
const STEP_MS = 650;
/** Hộp thoại của bot nằm chừng này mới bị đóng hộ, để người ta kịp đọc. */
const READ_MS = 1500;

export class Bot {
  /** @param {import('./controller.js').Game} game */
  constructor(game) {
    this.g = game;
    /** Ghế → cấp (`LEVELS` của core/botPolicy.js). @type {Map<number, object>} */
    this.levels = new Map();
    /** Ghế → trí nhớ dài hạn của bot (nhánh / lối học) cho `nextSkill`. */
    this.memo = new Map();
    /** Ghế → ô đã hỏi mua ở lượt nào, để không hỏi đi hỏi lại. */
    this.tried = new Map();
    /**
     * Đang hỏi một **người** giữa lượt của bot (đấu giá, thiếu tiền, duyệt đề
     * nghị bot gửi): nhịp canh không được đóng hộ hộp của họ.
     */
    this.humanAsks = 0;
    /** Lượt bot đã hẹn nước kế tiếp — chặn hẹn chồng hai lần. */
    this.queued = false;
    /** Người thật ngồi trước màn hình lúc này — xem `homeSeat`. */
    this.home = null;
    /** Ô / khu bot đã chọn cho tấm thẻ đang lôi ra — `answer` trả khi được hỏi. */
    this.aim = null;
    /** Nhịp canh, chỉ chạy khi ván có ghế máy. */
    this.pilot = null;
  }

  get st() { return this.g.state; }

  /**
   * Bày ván mới. `kinds[i]` là cấp của ghế i (`'easy' | 'normal' | 'hard'`),
   * null là người.
   */
  reset(kinds = []) {
    this.levels = new Map(kinds.flatMap((k, i) => (k ? [[i, BP.levelOfKey(k)]] : [])));
    this.memo = new Map([...this.levels.keys()].map((s) => [s, {}]));
    this.tried = new Map([...this.levels.keys()].map((s) => [s, new Map()]));
    this.humanAsks = 0;
    this.queued = false;
    this.home = null;
    this.aim = null;
    clearInterval(this.pilot);
    this.pilot = this.active ? setInterval(() => this.tick(), 400) : null;
    const st = this.st;
    const named = (bot) => new Set(st.players.filter((p) => this.levels.has(p.id) === bot).map((p) => p.name));
    const botNames = named(true);
    const humanNames = named(false);
    const humans = st.players.length - this.levels.size;
    /* Chuyền máy chỉ có nghĩa giữa hai người thật cùng ngồi quanh máy: sang ghế
       máy thì không ai cầm, còn bàn một người thật thì chẳng có ai để chuyền.
       `handoff` chỉ biết tên, nên tên mà người thật cũng mang thì vẫn chuyền —
       thừa một màn chuyền máy còn hơn bỏ mất màn của người thật. */
    setHandoffSkip(this.active
      ? (name) => humans <= 1 || (botNames.has(name) && !humanNames.has(name))
      : null);
  }

  /** Ván này có ghế máy không. Bản online không có bot. */
  get active() { return this.levels.size > 0 && !this.g.net; }

  is(seat) { return this.active && this.levels.has(seat); }

  /** Cấp của ghế máy. */
  lv(seat) { return this.levels.get(seat) ?? BP.LEVELS.normal; }

  /**
   * Ghế của người ngồi trước màn hình, khi ván có bot: người tới lượt nếu là
   * người, không thì người thật đi gần nhất. Cây kỹ năng mở ngoài lượt (nút ở
   * hàng tiện ích) nhắm vào ghế này — đúng như ghế của mình ở bản online.
   */
  homeSeat() {
    const st = this.st;
    if (!this.active || !st) return -1;
    if (!this.is(st.turn) && !st.current.bankrupt) this.home = st.turn;
    if (this.home == null || this.is(this.home) || st.players[this.home]?.bankrupt) {
      this.home = st.players.find((p) => !this.is(p.id) && !p.bankrupt)?.id ?? -1;
    }
    return this.home;
  }

  /** Người thật còn trong ván. */
  humans() {
    return this.st.players.filter((p) => !this.is(p.id) && !p.bankrupt);
  }

  /**
   * Ai học kỹ năng khi bấm nút cây kỹ năng giữa lượt bot. Bàn một người thật
   * thì là người ấy; nhiều người thì không biết ai đang cầm máy, nên hỏi.
   * @returns {Promise<number>} ghế, −1 nếu bỏ ngang
   */
  async pickHuman() {
    const list = this.humans();
    if (list.length <= 1) return list[0]?.id ?? -1;
    const v = await openModal({
      manual: true,   // người tự mở — bot cầm lái không đóng hộ
      eyebrow: 'CÂY KỸ NĂNG',
      title: 'Ai học kỹ năng?',
      buttons: [
        ...list.map((p) => ({ label: p.name, value: p.id, cls: 'btn-gold' })),
        { label: 'Thôi', value: -1, cls: 'btn-ghost' },
      ],
      escValue: -1,
    });
    return typeof v === 'number' ? v : -1;
  }

  /** Bot đang cầm lái và không chờ người nào trả lời. */
  piloting() {
    const st = this.st;
    // Lúc bốc thăm quyền đi trước `turn` còn đứng ở ghế 0 mà chưa phải lượt ai
    return !!st?.order && !st.over && this.is(st.turn) && this.humanAsks === 0;
  }

  /** Chạy một câu hỏi dành cho người thật giữa lượt của bot. */
  async human(fn) {
    this.humanAsks += 1;
    try { return await fn(); } finally { this.humanAsks -= 1; }
  }

  /** Nhịp canh: hộp thoại bot không có câu trả lời riêng thì đóng bằng mặc định. */
  tick() {
    if (this.piloting()) dismissTopModal({ skipManual: true, minAge: READ_MS });
  }

  /* ================================================================
     Lượt của bot
     ================================================================ */

  /**
   * Thanh nút vừa bày cho ghế máy. Thường gọi từ trong `guard` (lắc xong, trả
   * nợ xong), nên chờ cho hết bận rồi mới tự `guard` nước kế tiếp.
   */
  schedule() {
    if (this.queued) return;
    this.queued = true;
    const go = async () => {
      await wait(STEP_MS);
      while (this.g.busy) await wait(120);
      this.queued = false;
      const st = this.st;
      if (!st || st.over || !this.is(st.turn)) return;
      this.g.guard(() => this.step(st.current));
    };
    go();
  }

  /** Một nước của bot: học kỹ năng, lo tài sản, hỏi mua đất, rồi lắc hoặc kết thúc lượt. */
  async step(p) {
    const st = this.st;
    const g = this.g;
    const lv = this.lv(p.id);
    await this.learn(p);

    if (p.inJail) {
      // Khách Quen Nhà Đá ra tù không mất tiền
      const how = BP.jailChoice(st, p, lv, has(p, 'cnX2'));
      if (how === 'card') return g.useJailCard();
      if (how === 'pay') return g.payOutOfJail();
      return g.rollInJail();
    }

    // Thẻ trước khi xây: cưỡng chế cần tiền mặt, mà đủ bộ rồi mới có chỗ xây
    if (!st.rolled) await this.playCards(p);
    if (st.over || p.bankrupt) return;
    await this.manage(p);
    if (!st.rolled) await this.propose(p);
    if (st.over || p.bankrupt) return;
    if (st.rolled) return g.endTurn();
    return g.takeRoll(true);
  }

  /** Tiêu điểm kỹ năng theo cấp — xem `nextSkill` trong core/botPolicy.js. */
  async learn(p) {
    const st = this.st;
    const got = [];
    for (let n = 0; n < 12 && p.skillPoints > 0; n++) {
      const id = BP.nextSkill(st, p, this.lv(p.id), this.memo.get(p.id));
      if (!id || !learnSkill(p, id, st).ok) break;
      const lv = levelOf(p, id);
      got.push(`<b>${skillById(id).name}</b>${lv > 1 ? ` lên level ${lv}` : ''}`);
    }
    if (!got.length) return;
    this.g.hud.refresh();
    await this.g.bc.show('HỌC KỸ NĂNG',
      `<b style="color:${p.token.css}">${p.name}</b> học ${got.join(', ')}.`, { ms: 2200 });
  }

  /** Chuộc, cầm đất lấy vốn, xây nhà — rồi loan tin một lần cho cả loạt. */
  async manage(p) {
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
    g.hud.refresh();
    g.scene.refresh(st);
    g.hud.flashMoney(p.id, false);
    await g.bc.show('LO TÀI SẢN', `<b style="color:${p.token.css}">${p.name}</b> ${words.join(' · ')}.`, { ms: 2600 });
    for (const { res } of acts) await g.skills.contractorNote(res.payouts);
    await g.spot([...new Set(acts.map((a) => a.id))], 1400);
  }

  /**
   * Lôi thẻ trong túi ra dùng theo `cardPlay` (core/botPolicy.js). Đi đúng
   * đường nút "Túi thẻ" của người: `useHeldCard` hỏi mục tiêu qua
   * `events.askOne`, `answer` trả về đúng ô / khu đã chọn ở `aim`.
   */
  async playCards(p) {
    const st = this.st;
    for (let n = 0; n < 3 && !st.over && !p.bankrupt; n++) {
      const play = BP.cardPlay(st, p, this.lv(p.id));
      if (!play) return;
      const before = p.cards.length;
      this.aim = { seat: p.id, target: play.target };
      try { await this.g.useHeldCard(play.at); } finally { this.aim = null; }
      // Thẻ không rời túi (mục tiêu vừa hết hợp lệ) thì thôi, kẻo lặp lại mãi
      if (p.cards.length >= before) return;
    }
  }

  /**
   * Bot hỏi mua ô còn thiếu của bộ (cấp có `propose`). Người thật nhận hộp
   * duyệt y như đề nghị của người khác; bot khác duyệt bằng luật của nó.
   */
  async propose(p) {
    const st = this.st;
    const g = this.g;
    const o = BP.proposeTrade(st, p, this.lv(p.id), this.tried.get(p.id));
    if (!o) return;
    const B = st.players[o.to];
    const offer = { from: p.id, to: o.to, give: o.give, giveMoney: o.giveMoney, get: o.get, getMoney: o.getMoney };
    await g.bc.show('ĐỀ NGHỊ GIAO DỊCH',
      `<b style="color:${p.token.css}">${p.name}</b> đưa: ${describe(st, offer.give, offer.giveMoney)}
       <br><b style="color:${B.token.css}">${B.name}</b> đưa: ${describe(st, offer.get, offer.getMoney)}`,
      { kind: 'trade', ms: 3600 });
    const accepted = this.is(B.id)
      ? await this.reviewTrade(offer, B.id, p.id)
      : await this.human(async () => {
        // Bàn nhiều người thật: chuyền máy cho người được hỏi (một người thì `handoff` tự bỏ qua)
        await handoff(B.name, B.token.css, `${p.name} gửi một đề nghị giao dịch. Chuyền máy cho ${B.name} xem xét.`);
        return litTiles(g.scene, offer.get, () => tradeReviewModal(st, offer));
      });
    // Soát lại trước khi chốt: hộp duyệt có thể nằm đó khá lâu
    if (!accepted || p.bankrupt || B.bankrupt || p.money < offer.giveMoney
      || offer.get.some((id) => st.owner.get(id) !== B.id)) {
      await g.bc.show('TỪ CHỐI GIAO DỊCH',
        `<b>${B.name}</b> không bán <b>${offer.get.map((id) => tileLabel(id)).join(', ')}</b> cho <b>${p.name}</b>.`,
        { kind: 'bad', ms: 2600 });
      return;
    }
    await g.executeTrade(offer, p, B);
  }

  /* ================================================================
     Trả lời câu hỏi
     ================================================================ */

  /** Dừng ở đất trống: mua không? */
  async buyChoice(p, tileId) {
    await wait(STEP_MS);
    return BP.wantBuy(this.st, p, tileId, this.lv(p.id)) ? 'buy' : 'skip';
  }

  /** Duyệt đề nghị gửi tới bot. `fromSeat` là người gửi. */
  async reviewTrade(offer, seat, fromSeat) {
    const st = this.st;
    const me = st.players[seat];
    await this.g.bc.show('CÂN NHẮC',
      `<b style="color:${me.token.css}">${me.name}</b> đang tính toán đề nghị…`, { kind: 'trade', ms: 1600 });
    return BP.acceptTrade(st, offer, seat, fromSeat, this.lv(seat));
  }

  /** Nhận đất đang thế chấp sau giao dịch: chuộc luôn nếu dư dả. */
  redeemChoice(seat, ids) {
    const p = this.st.players[seat];
    const total = ids.reduce((s, id) => s + BOARD[id].redeem, 0);
    return p.money - total > this.lv(seat).redeemReserve ? 'all' : null;
  }

  /** Thiếu tiền: xoay theo luật của cấp (cấp có dự đoán giữ lại ô đang sinh lời). */
  raiser(seat) {
    return (st, s, need) => BP.raise(st, st.players[s], need, this.lv(seat));
  }

  /**
   * Câu hỏi của thẻ Thời Cuộc (`EventRunner.askOne`). Câu nào không có luật
   * riêng thì trả lời mặc định — chính câu trả lời dành cho người vắng mặt.
   */
  async answer(q) {
    const st = this.st;
    const p = st.players[q.seat];
    const lv = this.lv(q.seat);
    await wait(STEP_MS);
    const lots = q.data?.lots ?? [];
    // Chi tiền cứu nhà khi còn dư sau đó — Dễ giữ tiền chặt tay hơn
    const spare = (key) => p.money - lots.reduce((s, l) => s + (l[key] ?? 0), 0) >= lv.buyReserve + 50;
    // Mục tiêu cho tấm thẻ bot vừa lôi ra (`playCards`)
    if (this.aim?.seat === q.seat && (q.name === 'ev-pick' || q.name === 'ev-group')) {
      return this.aim.target;
    }
    switch (q.name) {
      case 'ev-brace': return spare('brace') ? 'brace' : null;
      case 'ev-fire':
      case 'ev-snow': return spare('save') ? 'save' : null;
      case 'ev-zombie': return spare('cost') ? 'pay' : null;
      case 'ev-bid': return BP.bidFor(st, p, q.data.tileId, lv);
      default: return q.fallback;
    }
  }
}
