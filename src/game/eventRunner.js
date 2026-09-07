/**
 * Thi hành một thẻ THỜI CUỘC: bày thẻ ra, hỏi những người liên quan, rồi ra tay.
 *
 * Tách khỏi `controller.js` vì đây là một loại lượt khác hẳn: lượt thường chỉ
 * đụng tới **một người**, còn sự kiện đụng tới cả bàn và phải hỏi nhiều người
 * cùng lúc. Ba luật xương sống của module này:
 *
 *   1. **Một máy quyết** — máy đang cầm lái lập kế hoạch, hỏi, rồi phát ảnh
 *      chụp. Không máy nào tự gieo lại một con số khác.
 *   2. **Hỏi ai thì hộp thoại hiện ở máy người ấy**, và hộp nào cũng có đồng
 *      hồ kèm câu trả lời mặc định. Một người bỏ đi không được treo cả bàn.
 *   3. **Việc thu tiền thì máy tự cấn nợ** (`autoRaise`) chứ không hỏi. Bốn
 *      người cùng phải nộp thuế mà mỗi người một hộp thoại "bán nhà đi" là bàn
 *      cờ đứng im mười phút.
 */
import { BOARD, GROUPS, GROUP_TILES, money, tileLabel, tileShortLabel } from '../data/board.js';
import { drawEvent, planEvent, autoRaise } from '../core/events.js';
import { handoff } from '../ui/modal.js';
import {
  eventCardModal, bracePromptModal, firePromptModal, auctionBidModal,
} from '../ui/eventModals.js';
import { audio } from '../audio/audio.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class EventRunner {
  /** @param {import('./controller.js').Game} game */
  constructor(game) {
    this.g = game;
    /** Hạn trả lời một câu hỏi của sự kiện — chỉ có nghĩa ở bản online. */
    this.askMs = 30000;
  }

  get state() { return this.g.state; }

  /**
   * Hạn cho hộp thoại mở **trên máy này**.
   *
   * Bản một máy thì bằng 0 — cả bàn ngồi quanh một cái máy, không ai bỏ đi mà
   * treo được ai, mà đồng hồ chạy trong lúc người ta còn đang bàn nhau thì chỉ
   * tổ hối. Bản online mới cần hạn, vì người kia ngồi máy khác.
   */
  get localMs() { return this.g.net ? this.askMs : 0; }

  /* ================================================================
     Vòng đời một sự kiện
     ================================================================ */

  /**
   * Rút và thi hành một thẻ. Gọi từ `controller.endTurn()`, lúc máy này vẫn
   * còn đang cầm lái hợp lệ.
   */
  async run() {
    const st = this.state;
    const card = drawEvent(st);
    const plan = card ? planEvent(st, card) : null;

    // Không thẻ nào hợp cảnh (bàn chưa ai xây nhà, chưa ai cắm đất…): xả bớt
    // áp lực rồi thôi, đừng nổ một sự kiện rỗng.
    if (!card || !plan) { st.pressure = Math.floor(st.pressure / 2); this.g.sync(); return; }

    st.eventsFired += 1;
    st.pressure = 0;
    st.dryTurn = false;   // sự kiện chính là "có chuyện xảy ra"
    this.g.sync();

    const detail = this.detailOf(card, plan);
    audio.sfx('card');
    this.g.netEmit('eventcard', { id: card.id, detail });
    this.bumpClock('thời cuộc');
    await eventCardModal(card, detail);

    await this.apply(card, plan);

    this.g.hud.refresh();
    this.g.scene.refresh(st);
    this.g.scene.placeTokens();
    this.g.sync();
  }

  /** Dòng nói rõ sự kiện rơi vào khu nào, vào ai — in ngay trên mặt thẻ. */
  detailOf(card, plan) {
    const st = this.state;
    const who = (seat) => `<b style="color:${st.players[seat].token.css}">${st.players[seat].name}</b>`;
    switch (card.id) {
      case 'dong-dat':
        return `Khu <b>${GROUPS[plan.group].name}</b> — ${plan.tiles.length} ô có nhà.`;
      case 'hoa-hoan':
        return `<b>${tileLabel(plan.tileId)}</b> của ${who(plan.seat)}.`;
      case 'mo-duong':
        return `Khu <b>${GROUPS[plan.group].name}</b> lên giá thuê <b>+50%</b>, vĩnh viễn.`;
      case 'trung-thu':
        return `Trưng thu <b>${tileLabel(plan.tileId)}</b> của ${who(plan.seat)}, đền ${money(plan.payout)}.`;
      case 'sang-nhuong':
        return `Phát mãi <b>${tileLabel(plan.tileId)}</b> — đang thuộc về ${who(plan.seat)}.`;
      case 'dai-ha-gia':
        return `Đem <b>${tileLabel(plan.tileId)}</b> ra bán đấu giá.`;
      case 'hoi-cho':
        return `${who(plan.seat)} nghèo nhất bàn — nhận ${money(plan.amount)}.`;
      case 'an-xa':
        return plan.seats.length
          ? `Thả ${plan.seats.map(who).join(', ')} khỏi Khám Lớn.`
          : '';
      case 'thue-dien-tho':
        return `${plan.bills.length} người phải nộp, tổng
                <b>${money(plan.bills.reduce((s, b) => s + b.amount, 0))}</b> vào Quỹ Công.`;
      case 'siet-tin-dung':
        return `${plan.bills.length} người đang cắm đất phải đóng lãi ngay.`;
      case 'mat-giay-to':
        return `Mỗi người chọn một ô của mình — ô ấy ngưng thu tiền thuê.`;
      case 'hoan-doi-dia-ba':
        return plan.pairs.map((x) => `${who(x.from)} → ${who(x.to)}`).join(' · ');
      case 'quy-cong-phat-chan':
        return `Quỹ Công được bơm thêm ${money(plan.amount)}.`;
      default:
        return '';
    }
  }

  /** Chọn tay thi hành theo id thẻ. */
  async apply(card, plan) {
    switch (card.id) {
      case 'thue-dien-tho':       return this.taxToPot(plan);
      case 'siet-tin-dung':       return this.creditSqueeze(plan);
      case 'hoi-cho':             return this.fairPrize(plan);
      case 'an-xa':               return this.amnesty(plan);
      case 'quy-cong-phat-chan':  return this.fundPot(plan);
      case 'lam-phat':
      case 'mat-mua':
      case 'bao-gia':
      case 'gioi-nghiem':
      case 'mo-duong':            return this.applyMod(card, plan);
      case 'dong-dat':            return this.quake(card, plan);
      case 'hoa-hoan':            return this.fire(card, plan);
      case 'mat-giay-to':         return this.lostDeeds(plan);
      case 'trung-thu':           return this.expropriate(plan);
      case 'sang-nhuong':         return this.forcedSale(plan);
      case 'hoan-doi-dia-ba':     return this.swapDeeds(plan);
      case 'dai-ha-gia':          return this.clearance(plan);
      default:                    return undefined;
    }
  }

  /* ================================================================
     Kỳ 1 — tiền và luật tạm thời
     ================================================================ */

  async taxToPot(plan) {
    const st = this.state;
    for (const b of plan.bills) {
      const p = st.players[b.seat];
      if (p.bankrupt) continue;
      const paid = await this.collect(b.seat, b.amount,
        `${b.houses} nhà, ${b.hotels} khách sạn`);
      if (paid) st.pot += b.amount;
    }
    this.g.sync();
    await this.g.bc.show('QUỸ CÔNG',
      `Quỹ Công giờ có <b>${money(st.pot)}</b> — ai ghé <b>Bến Đậu</b> trước thì ẵm trọn.`,
      { ms: 3600 });
  }

  async creditSqueeze(plan) {
    for (const b of plan.bills) {
      if (this.state.players[b.seat].bankrupt) continue;
      await this.collect(b.seat, b.amount, `lãi ${b.count} ô đang thế chấp`);
    }
  }

  async fairPrize(plan) {
    const p = this.state.players[plan.seat];
    await this.g.bc.show('HỘI CHỢ ĐẤU XẢO',
      `<b>${p.name}</b> nhận <span class="up">${money(plan.amount)}</span> tiền bán hàng.`);
    await this.g.receiveFromBank(plan.seat, plan.amount);
  }

  async amnesty(plan) {
    const st = this.state;
    for (const seat of plan.seats) {
      st.releaseFromJail(st.players[seat]);
      audio.sfx('jail');
    }
    this.g.hud.refresh();
    this.g.sync();
    if (plan.seats.length) {
      await this.g.bc.show('ÂN XÁ',
        `${plan.seats.map((s) => `<b>${st.players[s].name}</b>`).join(', ')} được thả khỏi Khám Lớn.`);
    }
  }

  async fundPot(plan) {
    this.state.pot += plan.amount;
    this.g.sync();
    await this.g.bc.show('QUỸ CÔNG',
      `Ngân hàng bỏ vào Quỹ Công <span class="up">${money(plan.amount)}</span> —
       tổng còn <b>${money(this.state.pot)}</b>, chờ người đầu tiên ghé Bến Đậu.`);
  }

  async applyMod(card, plan) {
    this.state.addMod(plan.mod);
    this.g.sync();
    const rounds = plan.mod.turns < 0
      ? 'từ giờ tới hết ván'
      : `trong <b>${Math.ceil(plan.mod.turns / Math.max(1, this.state.alive().length))} vòng</b>`;
    const what = {
      rent: 'Tiền thuê khắp bàn tăng <b>25%</b>',
      salary: 'Lương qua ô Bắt Đầu chỉ còn <b>một nửa</b>',
      build: 'Giá xây nhà tăng <b>50%</b>',
      'freeze-build': '<b>Cấm xây cất</b> trên toàn bàn',
      'group-rent': `Tiền thuê khu <b>${GROUPS[plan.mod.group]?.name ?? ''}</b> tăng <b>50%</b>`,
    }[plan.mod.type];
    await this.g.bc.show(card.title, `${what} ${rounds}.`,
      { kind: card.kind === 'good' ? null : 'bad', ms: 4200 });
  }

  /* ================================================================
     Kỳ 2 — nhà cửa và quyền sở hữu
     ================================================================ */

  /** Động đất: cả khu sập một tầng, ai bỏ tiền chống đỡ thì giữ được. */
  async quake(card, plan) {
    const st = this.state;
    audio.sfx('shake');
    this.g.netEmit('quake', {});
    this.g.scene.shake(0.012, 700);
    await wait(700);

    // Gom theo chủ đất: một người có ba ô trong khu thì chỉ hỏi một lần
    const bySeat = new Map();
    for (const lot of plan.tiles) {
      if (st.players[lot.seat].bankrupt) continue;
      if (!bySeat.has(lot.seat)) bySeat.set(lot.seat, []);
      bySeat.get(lot.seat).push(lot);
    }

    const answers = await this.askMany([...bySeat].map(([seat, lots]) => ({
      seat,
      name: 'ev-brace',
      data: { lots },
      local: () => bracePromptModal(st, seat, lots, this.localMs),
      fallback: null,
      note: 'nhà cửa của họ vừa bị động đất',
    })));

    for (const [seat, lots] of bySeat) {
      const p = st.players[seat];
      const total = lots.reduce((s, l) => s + l.brace, 0);
      // Chốt lại ở máy cầm lái: câu trả lời gửi từ xa không được tin suông
      if (answers.get(seat) === 'brace' && p.money >= total) {
        await this.g.bc.show('CHỐNG ĐỠ KỊP',
          `<b>${p.name}</b> bỏ <span class="down">${money(total)}</span> gia cố ${lots.length} ô — nhà đứng nguyên.`);
        await this.g.payBank(seat, total);
        continue;
      }
      for (const lot of lots) this.collapse(lot.id);
      this.g.hud.refresh();
      this.g.scene.refresh(st);
      this.g.sync();
      await this.g.bc.show('NHÀ SẬP',
        `<b>${p.name}</b> mất một tầng nhà ở ${lots.map((l) => tileShortLabel(l.id)).join(', ')} — không đền bù.`,
        { kind: 'bad', ms: 4200 });
    }
  }

  /**
   * Hạ một cấp nhà, trả vật liệu về kho ngân hàng.
   * Luật nằm ở `GameState.demolish` vì mấy thẻ Cơ Hội cũng dỡ nhà y hệt.
   */
  collapse(tileId) { this.state.demolish(tileId); }

  /** Hoả hoạn: cháy sạch một ô, trừ khi chủ thuê phu chữa cháy. */
  async fire(card, plan) {
    const st = this.state;
    const p = st.players[plan.seat];
    const keep = plan.houses === 5 ? 2 : Math.floor(plan.houses / 2);

    const answer = await this.askOne({
      seat: plan.seat,
      name: 'ev-fire',
      data: { plan },
      local: () => firePromptModal(st, plan.seat, plan, this.localMs),
      fallback: null,
      note: 'dãy phố của họ đang cháy',
    });

    const saved = answer === 'save' && p.money >= plan.save;
    if (saved) await this.g.payBank(plan.seat, plan.save);

    // Đưa ô về đúng số nhà còn lại, phần thiếu trả hết về kho
    const target = saved ? keep : 0;
    while (st.housesOn(plan.tileId) > target) this.collapse(plan.tileId);

    audio.sfx('bankrupt');
    this.g.hud.refresh();
    this.g.scene.refresh(st);
    this.g.sync();
    await this.g.bc.show(saved ? 'CHỮA CHÁY KỊP' : 'CHÁY RỤI',
      saved
        ? `<b>${p.name}</b> trả <span class="down">${money(plan.save)}</span> cho phu chữa cháy,
           giữ lại <b>${keep} căn</b> ở ${tileShortLabel(plan.tileId)}.`
        : `<b>${tileLabel(plan.tileId)}</b> cháy rụi — <b>${p.name}</b> mất trắng toàn bộ nhà cửa trên ô này.`,
      { kind: 'bad', ms: 4600 });
  }

  /** Mất giấy tờ: mỗi người tự chọn ô nào của mình chịu treo. */
  async lostDeeds(plan) {
    const st = this.state;
    const seats = plan.seats.filter((s) => !st.players[s].bankrupt);

    const lostText = {
      eyebrow: 'MẤT GIẤY TỜ',
      title: 'Ô nào thất lạc giấy tờ?',
      sub: 'Ô bạn chọn sẽ <b>không thu được tiền thuê</b> cho tới khi làm lại giấy.',
      note: 'Chọn khôn ngoan: ô ít người đáp xuống thì mất cũng chẳng đau.',
      confirm: 'Chốt ô này',
    };

    const answers = await this.askMany(seats.map((seat) => {
      const ids = st.propertiesOf(seat);
      return {
        seat,
        name: 'ev-pick',
        data: { ids, text: lostText },
        local: () => this.g.pickTile(ids, lostText, this.localMs),
        // Không trả lời thì lấy ô rẻ nhất — phạt người vắng mặt nhẹ tay nhất có thể
        fallback: [...st.propertiesOf(seat)].sort((a, b) => BOARD[a].price - BOARD[b].price)[0],
        note: 'giấy tờ nhà đất của họ thất lạc',
      };
    }));

    const tiles = [];
    for (const seat of seats) {
      const id = answers.get(seat);
      // Đất có thể đã đổi chủ giữa chừng (người kia phá sản) — kiểm lại cho chắc
      if (id !== undefined && id !== null && st.owner.get(id) === seat) tiles.push(id);
    }
    if (tiles.length === 0) return;

    /* Mỗi lần nổ là một đợt riêng: dùng chung một `id` thì `addMod` sẽ đè lên
       đợt trước và vô tình trả lại giấy tờ cho mấy ô còn đang bị treo. */
    st.addMod({ id: `mat-giay-to:${st.eventsFired}`, type: 'frozen', tiles, turns: plan.turns });
    this.g.hud.refresh();
    this.g.sync();
    await this.g.bc.show('GIẤY TỜ THẤT LẠC',
      `${tiles.map((id) => `<b>${tileShortLabel(id)}</b>`).join(', ')} ngưng thu tiền thuê
       trong <b>${Math.ceil(plan.turns / Math.max(1, st.alive().length))} vòng</b>.`,
      { kind: 'bad', ms: 4600 });
  }

  /** Trưng thu: đất của người giàu nhất về tay nhà nước rồi đem bán lại. */
  async expropriate(plan) {
    const st = this.state;
    const p = st.players[plan.seat];
    if (st.owner.get(plan.tileId) !== plan.seat) return;

    st.owner.delete(plan.tileId);
    st.mortgaged.delete(plan.tileId);
    this.g.hud.refresh();
    this.g.scene.refresh(st);
    this.g.sync();

    await this.g.bc.show('TRƯNG THU',
      `<b>${tileLabel(plan.tileId)}</b> bị trưng thu khỏi tay <b>${p.name}</b>,
       đền bù <span class="up">${money(plan.payout)}</span>.`, { kind: 'bad', ms: 4200 });
    await this.g.receiveFromBank(plan.seat, plan.payout);

    await this.auction(plan.tileId, {
      seller: null,
      reason: 'Đất vừa bị nhà nước trưng thu, nay đem bán lại cho ai trả cao nhất.',
    });
  }

  /** Sang nhượng bắt buộc: đất đổi chủ mà không cần chủ cũ gật đầu. */
  async forcedSale(plan) {
    const st = this.state;
    if (st.owner.get(plan.tileId) !== plan.seat) return;
    await this.auction(plan.tileId, {
      seller: plan.seat,
      reason: `Toà phát mãi lô đất này của ${st.players[plan.seat].name} — tiền bán trả về cho họ.`,
      // Chủ cũ đứng ngoài: cho họ tự mua lại thì hoá ra chỉ chuyền tiền từ túi
      // này sang túi kia, đất chẳng đi đâu, mà thẻ này sinh ra để đất đổi chủ.
      exclude: [plan.seat],
    });
  }

  /** Đại hạ giá: đất ế trong kho ngân hàng đem bán, khỏi chờ ai đáp trúng. */
  async clearance(plan) {
    if (this.state.owner.has(plan.tileId)) return;
    await this.auction(plan.tileId, {
      seller: null,
      reason: 'Ngân hàng dọn kho — lô đất chưa ai mua này đem bán đấu giá.',
    });
  }

  /** Hoán đổi địa bạ: mỗi người giao một ô cho người kế tiếp trong vòng đi. */
  async swapDeeds(plan) {
    const st = this.state;
    const pairs = plan.pairs.filter((x) => !st.players[x.from].bankrupt && !st.players[x.to].bankrupt);

    const bare = (seat) => st.propertiesOf(seat).filter((id) => st.housesOn(id) === 0);
    const text = (toName) => ({
      eyebrow: 'HOÁN ĐỔI ĐỊA BẠ',
      title: `Giao ô nào cho ${toName}?`,
      sub: 'Ô bạn chọn sang tên ngay cho họ. Đổi lại, bạn nhận một ô từ người phía trước.',
      note: 'Chỉ chọn được ô chưa xây nhà — nhà cửa không sang tên theo.',
      confirm: 'Giao ô này',
    });

    const answers = await this.askMany(pairs.map(({ from, to }) => ({
      seat: from,
      name: 'ev-pick',
      data: { ids: bare(from), text: text(st.players[to].name) },
      local: () => this.g.pickTile(bare(from), text(st.players[to].name), this.localMs),
      fallback: [...bare(from)].sort((a, b) => BOARD[a].price - BOARD[b].price)[0],
      note: 'họ phải giao một lô đất cho người kế tiếp',
    })));

    /* Chốt cả vòng một lượt. Chuyển từng cặp ngay khi có câu trả lời thì ô vừa
       nhận lại thành ô đem cho ở cặp sau — địa bạ rối thêm chứ không đổi được
       cho ai. */
    const moves = [];
    for (const { from, to } of pairs) {
      const id = answers.get(from);
      if (id !== undefined && id !== null && st.owner.get(id) === from) moves.push({ id, from, to });
    }
    if (moves.length === 0) return;

    audio.sfx('trade');
    for (const m of moves) st.transfer(m.id, m.to);
    this.g.hud.refresh();
    this.g.scene.refresh(st);
    this.g.sync();

    await this.g.bc.show('HOÁN ĐỔI ĐỊA BẠ',
      moves.map((m) => `<b style="color:${st.players[m.from].token.css}">${st.players[m.from].name}</b>
         giao <b>${tileShortLabel(m.id)}</b> cho
         <b style="color:${st.players[m.to].token.css}">${st.players[m.to].name}</b>`).join('<br>'),
      { kind: 'trade', ms: 6000 });
  }

  /* ================================================================
     Đấu giá kín
     ================================================================ */

  /**
   * Bán một ô cho người trả cao nhất.
   *
   * @param {number} tileId
   * @param {{seller:?number, reason:string, exclude?:number[]}} o
   *   `seller` là người nhận tiền (null = ngân hàng thu).
   */
  async auction(tileId, o) {
    const st = this.state;
    const exclude = new Set(o.exclude ?? []);
    const bidders = st.alive().map((p) => p.id).filter((seat) => !exclude.has(seat));
    if (bidders.length === 0) return;

    await this.g.bc.show('MỞ PHIÊN ĐẤU GIÁ',
      `<b>${tileLabel(tileId)}</b> — mọi người ghi giá kín, cao nhất thì lấy đất.`,
      { kind: 'trade', ms: 3000 });

    const answers = await this.askMany(bidders.map((seat) => ({
      seat,
      name: 'ev-bid',
      data: { tileId, reason: o.reason },
      local: () => auctionBidModal(st, seat, tileId, { reason: o.reason, ms: this.localMs }),
      fallback: 0,
      note: 'đang có phiên đấu giá',
    })));

    /* Xếp theo giá, hoà thì người đi trước trong vòng lượt thắng — một luật rõ
       ràng, khỏi phải mở thêm một vòng đấu nữa giữa hai người bằng điểm. */
    const order = st.playOrder;
    const bids = bidders
      .map((seat) => ({ seat, bid: Math.min(Math.floor(answers.get(seat) ?? 0), st.players[seat].money) }))
      .filter((b) => b.bid > 0 && !st.players[b.seat].bankrupt)
      .sort((a, b) => b.bid - a.bid || order.indexOf(a.seat) - order.indexOf(b.seat));

    if (bids.length === 0) {
      await this.g.bc.show('PHIÊN ĐẤU GIÁ Ế',
        `Không ai trả giá cho <b>${tileLabel(tileId)}</b> —
         ${o.seller === null ? 'đất nằm lại trong kho ngân hàng' : 'chủ cũ giữ nguyên đất'}.`,
        { ms: 3600 });
      return;
    }

    const win = bids[0];
    const winner = st.players[win.seat];
    audio.sfx('buy');

    if (o.seller === null || st.players[o.seller].bankrupt) {
      await this.g.payBank(win.seat, win.bid);
    } else {
      await this.g.payPlayer(win.seat, o.seller, win.bid);
    }
    // Người thắng có thể vừa phá sản vì chính khoản này — lúc ấy đất về ngân hàng
    if (winner.bankrupt) return;

    st.owner.set(tileId, win.seat);
    st.mortgaged.delete(tileId);
    this.g.hud.refresh();
    this.g.scene.refresh(st);
    this.g.sync();

    const runnerUp = bids[1] ? ` (người trả kế tiếp: ${money(bids[1].bid)})` : '';
    await this.g.bc.show('CHỐT GIÁ',
      `<b style="color:${winner.token.css}">${winner.name}</b> lấy <b>${tileLabel(tileId)}</b>
       với <span class="down">${money(win.bid)}</span>${runnerUp}.`,
      { kind: 'trade', ms: 5200 });
  }

  /* ================================================================
     Thu tiền và hỏi han
     ================================================================ */

  /**
   * Thu một khoản của người chơi. Thiếu tiền mặt thì máy cấn nợ hộ (thế chấp,
   * bán nhà); cạn sạch mới tính phá sản.
   */
  async collect(seat, amount, why) {
    const st = this.state;
    const p = st.players[seat];
    if (amount <= 0) return true;

    if (p.money < amount) {
      const { ok, mortgaged, sold } = autoRaise(st, seat, amount);
      if (mortgaged.length || sold.length) {
        this.g.hud.refresh();
        this.g.scene.refresh(st);
        this.g.sync();
        await this.g.bc.show('CẤN NỢ',
          `<b>${p.name}</b> không đủ tiền mặt — ngân hàng
           ${mortgaged.length ? `giữ thế chấp <b>${mortgaged.length}</b> ô` : ''}
           ${mortgaged.length && sold.length ? ' và ' : ''}
           ${sold.length ? `hạ <b>${sold.length}</b> căn nhà` : ''} để thu đủ.`,
          { kind: 'bad', ms: 4200 });
      }
      if (!ok) {
        await this.g.bc.show('VỠ NỢ',
          `<b>${p.name}</b> không xoay nổi ${money(amount)} — vỡ nợ.`, { kind: 'bad', ms: 4000 });
        await this.g.doBankrupt(seat);
        return false;
      }
    }

    p.money -= amount;
    this.g.hud.refresh();
    this.g.sync();
    this.g.hud.flashMoney(seat, false);
    await this.g.bc.show('NỘP THUẾ',
      `<b>${p.name}</b> nộp <span class="down">${money(amount)}</span> — ${why}.`, { ms: 2400 });
    await this.g.scene.flyMoney(this.g.hud.cardEl(seat), this.g.hud.bankEl(), amount,
      { text: `−${money(amount)}`, color: '#FF8A7A' });
    return true;
  }

  /**
   * Hỏi một người. Người ấy ngồi máy khác thì gửi câu hỏi sang đó; ngồi cùng
   * máy (bản một máy) thì chuyền máy cho họ rồi trả lại.
   */
  async askOne(q) {
    const st = this.state;
    const g = this.g;
    this.bumpClock('thời cuộc');

    if (!g.net) {
      if (q.seat !== st.turn) {
        await handoff(st.players[q.seat].name, st.players[q.seat].token.css,
          `${st.players[q.seat].name} — ${q.note}. Chuyền máy cho họ quyết định.`);
      }
      const v = await q.local();
      if (q.seat !== st.turn) {
        const cur = st.players[st.turn];
        await handoff(cur.name, cur.token.css, `Xong. Chuyền máy lại cho ${cur.name}.`);
      }
      return v;
    }

    if (q.seat === g.net.mySeat) return q.local();
    return g.net.ask(q.seat, q.name, q.data,
      { fallback: q.fallback, timeout: this.askMs + 8000 });
  }

  /**
   * Hỏi nhiều người **cùng lúc** ở bản online — cả bàn cùng đếm một hạn chờ,
   * chứ không xếp hàng từng người một. Bản một máy thì đành lần lượt, vì chỉ
   * có một cái máy để chuyền.
   *
   * @returns {Promise<Map<number, any>>} ghế → câu trả lời
   */
  async askMany(list) {
    const out = new Map();
    if (list.length === 0) return out;

    if (!this.g.net) {
      for (const q of list) out.set(q.seat, await this.askOne(q));
      return out;
    }

    this.bumpClock('thời cuộc');
    const mine = list.filter((q) => q.seat === this.g.net.mySeat);
    const others = list.filter((q) => q.seat !== this.g.net.mySeat);

    if (others.length) {
      await this.g.bc.show('CHỜ CẢ BÀN',
        `Đang chờ ${others.map((q) => `<b>${this.state.players[q.seat].name}</b>`).join(', ')}
         trả lời…`, { kind: 'trade', ms: 2400 });
    }

    const answers = await Promise.all([
      ...mine.map((q) => q.local().then((v) => [q.seat, v])),
      ...others.map((q) => this.g.net
        .ask(q.seat, q.name, q.data, { fallback: q.fallback, timeout: this.askMs + 8000 })
        .then((v) => [q.seat, v ?? q.fallback])),
    ]);
    for (const [seat, v] of answers) out.set(seat, v);
    return out;
  }

  /**
   * Vặn lại đồng hồ của người đang cầm lái.
   *
   * Một sự kiện có thể kéo dài hơn hạn một nước đi (bày thẻ, hỏi cả bàn, đấu
   * giá). Không vặn lại thì mấy máy đang ngồi xem thấy đồng hồ cạn và gạch tên
   * chính người đang chạy sự kiện.
   */
  bumpClock(label) {
    const g = this.g;
    if (!g.net || g.state.over) return;
    g.clock = null;   // phá cửa "vẫn đúng người đúng việc" của armClock
    g.armClock(g.state.turn, this.askMs + 20000, label);
  }
}
