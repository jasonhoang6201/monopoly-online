/**
 * Máy chơi thay một ghế — chỉ có ở bản một máy.
 *
 * Bot không có đường đi riêng qua luật: nó bấm đúng những nút người chơi bấm
 * (`takeRoll`, `payOutOfJail`, `endTurn`…) và trả lời đúng những câu hỏi người
 * chơi được hỏi. Nhờ vậy mọi luật, mọi kỹ năng, mọi hoạt cảnh chạy y như lượt
 * của người, không có bản luật thứ hai để lệch nhau.
 *
 * Ba cửa bot nhận việc:
 *   1. **Thanh nút** — `Game.setTurnActions` gặp ghế máy thì gọi `schedule`,
 *      bot tự chọn nước đi (lắc, ra tù, xây nhà, kết thúc lượt).
 *   2. **Câu hỏi có tên** — mua đất, đấu giá, chống đỡ thiên tai, duyệt giao
 *      dịch, xoay tiền: controller hỏi thẳng bot thay vì mở hộp thoại.
 *   3. **Hộp thoại còn lại** (Thâu Tóm, Tàu Tốc Hành, bóc thẻ…) — nhịp canh
 *      `tick` đóng hộ bằng lựa chọn mặc định, đúng đường hết giờ của bản online
 *      (`dismissTopModal`), sau một quãng đủ cho người ngồi xem kịp đọc.
 *
 * Luật quyết định lấy theo bot của tests/gamesim.mjs — đơn giản, ghi ngay cạnh
 * từng chỗ — để ván với bot cân như ván mô phỏng dùng đo kỹ năng.
 */
import { BOARD, GROUP_TILES, JAIL_FINE, tileLabel } from '../data/board.js';
import { SKILLS } from '../data/skills.js';
import { canLearn, has, learnSkill, levelOf } from '../core/skills.js';
import { dismissTopModal, setHandoffSkip } from '../ui/modal.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mỗi nước của bot cách nhau chừng này — đủ cho người ngồi xem theo kịp. */
const STEP_MS = 650;
/** Hộp thoại của bot nằm chừng này mới bị đóng hộ, để người ta kịp đọc. */
const READ_MS = 1500;
/** Mua đất xong phải còn chừng này tiền mặt (gamesim: "mua nếu còn dư 100$"). */
const BUY_RESERVE = 100;
/** Xây nhà xong phải còn chừng này (gamesim: 200$). */
const BUILD_RESERVE = 200;
/** Chuộc đất khi chuộc xong còn hơn chừng này (gamesim: 400$). */
const REDEEM_RESERVE = 400;

const NAMES = Object.fromEntries(SKILLS.map((s) => [s.id, s.name]));
const BRANCH_KEYS = [...new Set(SKILLS.map((s) => s.branch))];

export class Bot {
  /** @param {import('./controller.js').Game} game */
  constructor(game) {
    this.g = game;
    /** Ghế giao cho máy. @type {Set<number>} */
    this.seats = new Set();
    /** Nhánh kỹ năng mỗi bot theo đuổi — chọn ngẫu nhiên lúc khai cuộc. */
    this.branch = new Map();
    /**
     * Đang hỏi một **người** giữa lượt của bot (đấu giá, thiếu tiền, chống đỡ
     * thiên tai): nhịp canh không được đóng hộ hộp của họ.
     */
    this.humanAsks = 0;
    /** Lượt bot đã hẹn nước kế tiếp — chặn hẹn chồng hai lần. */
    this.queued = false;
    /** Người thật ngồi trước màn hình lúc này — xem `homeSeat`. */
    this.home = null;
    this.pilot = setInterval(() => this.tick(), 400);
  }

  get st() { return this.g.state; }

  /** Bày ván mới. `flags[i]` true là ghế i do máy chơi. */
  reset(flags = []) {
    this.seats = new Set(flags.flatMap((on, i) => (on ? [i] : [])));
    this.branch = new Map([...this.seats].map((s) => [
      s, BRANCH_KEYS[Math.floor(Math.random() * BRANCH_KEYS.length)],
    ]));
    this.humanAsks = 0;
    this.queued = false;
    this.home = null;
    const st = this.st;
    const botNames = new Set(st.players.filter((p) => this.seats.has(p.id)).map((p) => p.name));
    const humans = st.players.length - this.seats.size;
    /* Chuyền máy chỉ có nghĩa giữa hai người thật cùng ngồi quanh máy: sang ghế
       máy thì không ai cầm, còn bàn một người thật thì chẳng có ai để chuyền. */
    setHandoffSkip(this.active ? (name) => humans <= 1 || botNames.has(name) : null);
  }

  /** Ván này có ghế máy không. Bản online không có bot. */
  get active() { return this.seats.size > 0 && !this.g.net; }

  is(seat) { return this.active && this.seats.has(seat); }

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

  /** Một nước của bot: học kỹ năng, lo tài sản, rồi lắc hoặc kết thúc lượt. */
  async step(p) {
    const st = this.st;
    const g = this.g;
    await this.learn(p);

    if (p.inJail) {
      if (st.jailCardAt(p.id) >= 0) return g.useJailCard();
      /* Đầu ván đất còn trống nhiều, ra sớm để mua; tiền dư thì nộp luôn cho
         khỏi kẹt. Cuối ván bàn dày nhà thì ngồi tù lại là chỗ an toàn nhất. */
      const crowded = [...st.houses.values()].reduce((n, h) => n + h, 0) >= 8;
      // Khách Quen Nhà Đá ra tù không mất tiền thì chẳng có gì phải tính
      const pay = has(p, 'cnX2') || (!crowded && p.money >= JAIL_FINE + 250);
      return pay ? g.payOutOfJail() : g.rollInJail();
    }

    await this.manage(p);
    if (st.rolled) return g.endTurn();
    return g.takeRoll(true);
  }

  /**
   * Tiêu điểm kỹ năng. Bot chỉ học kỹ năng tự động (`passive`): kỹ năng bấm
   * để dùng cần người chọn đúng lúc, bot học vào là phí điểm. Ưu tiên nhánh đã
   * chọn, mở ô mới trước khi nâng level.
   */
  async learn(p) {
    const st = this.st;
    const pref = this.branch.get(p.id);
    const got = [];
    for (let n = 0; n < 12 && p.skillPoints > 0; n++) {
      const pick = SKILLS
        .filter((s) => s.kind === 'passive' && canLearn(p, s.id, st).ok)
        .sort((a, b) => score(a) - score(b))[0];
      if (!pick || !learnSkill(p, pick.id, st).ok) break;
      const lv = levelOf(p, pick.id);
      got.push(`<b>${NAMES[pick.id]}</b>${lv > 1 ? ` lên level ${lv}` : ''}`);
    }
    function score(s) {
      return (s.branch === pref ? 0 : 100) + (levelOf(p, s.id) ? 10 : 0) + s.tier;
    }
    if (!got.length) return;
    this.g.hud.refresh();
    await this.g.bc.show('HỌC KỸ NĂNG',
      `<b style="color:${p.token.css}">${p.name}</b> học ${got.join(', ')}.`, { ms: 2200 });
  }

  /** Chuộc đất, rồi xây nhà ở ô lời nhất trên mỗi đồng bỏ ra (gamesim `manage`). */
  async manage(p) {
    const st = this.st;
    const g = this.g;
    const words = [];
    const touched = [];

    for (const id of st.propertiesOf(p.id)) {
      if (!st.isMortgaged(id) || p.money - BOARD[id].redeem <= REDEEM_RESERVE) continue;
      if (!st.redeem(p.id, id).ok) continue;
      words.push(`chuộc <b>${tileLabel(id)}</b>`);
      touched.push(id);
    }

    for (let n = 0; n < 40; n++) {
      const opts = st.propertiesOf(p.id)
        .map((id) => ({ id, c: st.canBuild(p.id, id) }))
        .filter((x) => x.c.ok && p.money - x.c.cost >= BUILD_RESERVE);
      if (!opts.length) break;
      const gain = (x) => (BOARD[x.id].rents[Math.min(5, st.housesOn(x.id) + 1)] - st.rentFor(x.id, 7)) / Math.max(1, x.c.cost);
      opts.sort((a, b) => gain(b) - gain(a));
      const res = st.build(p.id, opts[0].id);
      if (!res.ok) break;
      words.push(res.isHotel ? `lên khách sạn ở <b>${tileLabel(opts[0].id)}</b>` : `xây nhà ở <b>${tileLabel(opts[0].id)}</b>`);
      touched.push(opts[0].id);
      await g.skills.contractorNote(res.payouts);
    }

    if (!touched.length) return;
    g.hud.refresh();
    g.scene.refresh(st);
    g.hud.flashMoney(p.id, false);
    await g.bc.show('LO TÀI SẢN', `<b style="color:${p.token.css}">${p.name}</b> ${words.join(' · ')}.`, { ms: 2600 });
    await g.spot([...new Set(touched)], 1400);
  }

  /* ================================================================
     Trả lời câu hỏi
     ================================================================ */

  /** Ô này giúp `seat` gom thêm vào bộ màu (hoặc chặn bộ của người khác). */
  setValue(seat, tileId) {
    const st = this.st;
    const grp = BOARD[tileId].color_group;
    const ids = grp ? GROUP_TILES[grp] : [];
    if (!ids.length) return 0;
    const mine = ids.filter((id) => st.owner.get(id) === seat).length;
    const owners = new Set(ids.map((id) => st.owner.get(id)).filter((o) => o !== undefined && o !== seat));
    if (mine === ids.length - 1) return 2;                      // mua là đủ bộ
    if (owners.size === 1 && ids.filter((id) => st.owner.get(id) !== undefined && st.owner.get(id) !== seat).length === ids.length - 1) return 1;   // chặn bộ người khác
    return mine ? 0.5 : 0;
  }

  /** Dừng ở đất trống: mua không? */
  async buyChoice(p, tileId) {
    await wait(STEP_MS);
    const price = BOARD[tileId].price;
    const v = this.setValue(p.id, tileId);
    const reserve = v >= 2 ? 0 : v >= 1 ? BUY_RESERVE / 2 : BUY_RESERVE;
    return p.money - price >= reserve ? 'buy' : 'skip';
  }

  /** Giá trị một ô, để cân giao dịch: giá gốc trừ nợ chuộc, nhà tính nửa giá xây. */
  worth(id) {
    const st = this.st;
    const t = BOARD[id];
    const base = st.isMortgaged(id) ? t.price - t.redeem : t.price;
    const houses = st.housesOn(id) * (t.house_cost ?? 0) * 0.5;
    return base + houses;
  }

  /**
   * Duyệt đề nghị người khác gửi. `give` / `giveMoney` là phần bot nhận,
   * `get` / `getMoney` là phần bot đưa. Chịu khi lời ít nhất 10% phần đưa đi,
   * và không bao giờ đưa ô làm đối phương đủ bộ nếu không được trả thật đậm.
   */
  async reviewTrade(offer, seat, fromSeat) {
    const st = this.st;
    const g = this.g;
    const me = st.players[seat];
    await g.bc.show('CÂN NHẮC', `<b style="color:${me.token.css}">${me.name}</b> đang tính toán đề nghị…`, { kind: 'trade', ms: 1600 });
    if (me.money < offer.getMoney) return false;
    let gain = offer.giveMoney - offer.getMoney;
    // Ô giúp mình đủ bộ đáng hơn giá gốc
    for (const id of offer.give) gain += this.worth(id) * (this.setValue(seat, id) >= 2 ? 1.8 : 1);
    let cost = 0;
    for (const id of offer.get) {
      // Ô cuối cùng đối phương cần để đủ bộ: đòi gấp đôi
      cost += this.worth(id) * (this.setValue(fromSeat, id) >= 2 ? 2 : 1);
    }
    gain -= cost;
    return gain >= Math.max(20, cost * 0.1);
  }

  /** Nhận đất đang thế chấp sau giao dịch: chuộc luôn nếu dư dả. */
  redeemChoice(seat, ids) {
    const p = this.st.players[seat];
    const total = ids.reduce((s, id) => s + BOARD[id].redeem, 0);
    return p.money - total > 300 ? 'all' : null;
  }

  /**
   * Câu hỏi của thẻ Thời Cuộc (`EventRunner.askOne`). Câu nào không có luật
   * riêng thì trả lời mặc định — chính câu trả lời dành cho người vắng mặt.
   */
  async answer(q) {
    const st = this.st;
    const p = st.players[q.seat];
    await wait(STEP_MS);
    const lots = q.data?.lots ?? [];
    const spare = (key) => {
      const total = lots.reduce((s, l) => s + (l[key] ?? 0), 0);
      return p.money - total >= 150;
    };
    switch (q.name) {
      case 'ev-brace': return spare('brace') ? 'brace' : null;
      case 'ev-fire':
      case 'ev-snow': return spare('save') ? 'save' : null;
      case 'ev-zombie': return spare('cost') ? 'pay' : null;
      case 'ev-bid': return this.bid(p, q.data.tileId);
      default: return q.fallback;
    }
  }

  /** Giá ghi kín cho một phiên đấu giá: quanh giá gốc, đẩy cao khi ô gom bộ. */
  bid(p, tileId) {
    const price = BOARD[tileId].price;
    const v = this.setValue(p.id, tileId);
    const mult = (v >= 2 ? 1.25 : v >= 1 ? 1 : 0.7) * (0.85 + Math.random() * 0.3);
    const cap = p.money - BUY_RESERVE;
    const n = Math.floor(Math.min(cap, price * mult) / 5) * 5;
    return Math.max(0, n);
  }
}
