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
import { drawEvent, drawEventPair, returnEvent, planEvent, autoRaise } from '../core/events.js';
import { houseImmune } from '../core/skills.js';
import { handoff } from '../ui/modal.js';
import {
  bracePromptModal, firePromptModal, snowPromptModal, zombiePromptModal, auctionBidModal, auctionResultModal,
  ghostVoteModal,
} from '../ui/eventModals.js';
import { litTiles } from '../ui/tilePicker.js';
import { audio } from '../audio/audio.js';
import { eventCase, newSeed } from '../ui/caseOpen.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Thẻ Thời Cuộc lật ra bao lâu thì mạch sự kiện chạy tiếp — đếm từ lúc mặt thẻ
 * nở ra xong (`onReveal`), chứ không từ lúc mở hộp: băng chuyền còn đang chạy
 * mà thông báo đã nổi lên thì hoá ra nói trước cả tấm thẻ.
 *
 * Hộp thẻ không chặn đường nữa: chờ người chơi bấm thì cả bàn treo theo người
 * đọc chậm nhất, mà tự đóng thì lại giật tấm thẻ khỏi tay người đang đọc. Nên
 * cắt đôi: hộp cứ đứng đó tới lúc họ bấm, còn `apply()` và mấy dòng thông báo
 * thì chạy sau bấy nhiêu đây. Hộp hỏi nào của `apply()` mở lên sẽ đẩy tấm thẻ
 * đi — xem `yieldToNext` trong `ui/modal.js`.
 */
const ALERT_MS = 2000;

/**
 * Bảng giá chốt phiên đấu giá nằm bao lâu trước khi mạch sự kiện đi tiếp.
 *
 * Dài hơn dòng thông báo cũ (900ms) vì giờ có một bảng để đọc, nhưng vẫn không
 * chờ người chơi bấm: máy cầm lái mà đứng chờ thì cả bàn chờ theo.
 */
const RESULT_MS = 3200;

export class EventRunner {
  /** @param {import('./controller.js').Game} game */
  constructor(game) {
    this.g = game;
    /** Hạn trả lời một câu hỏi của sự kiện — chỉ có nghĩa ở bản online. */
    this.askMs = 30000;
    /**
     * Hạn bỏ phiếu của hội đồng hồn ma. Ngắn hơn hạn hỏi thường: người sống
     * đang ngồi chờ một lá bài, mà hồn ma chỉ cần liếc hai mặt thẻ là chọn được.
     */
    this.ghostMs = 15000;
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
    const card = await this.pickCard();
    const plan = card ? planEvent(st, card) : null;

    // Không thẻ nào hợp cảnh (bàn chưa ai xây nhà, chưa ai cắm đất…): xả bớt
    // áp lực rồi thôi, đừng nổ một sự kiện rỗng.
    if (!card || !plan) { st.pressure = Math.floor(st.pressure / 2); this.g.sync(); return; }

    st.eventsFired += 1;
    st.eventTally = { ...st.eventTally, [card.id]: (st.eventTally?.[card.id] ?? 0) + 1 };
    st.pressure = 0;
    st.dryTurn = false;   // sự kiện chính là "có chuyện xảy ra"
    this.g.sync();

    const detail = this.detailOf(card, plan);
    /* Tiếng bóc thẻ do băng chuyền phát lúc mặt thẻ hiện ra, không phát ở đây
       nữa. Seed gửi kèm để máy ngồi xem dựng đúng dải ấy và dừng đúng ô ấy.

       Hộp thẻ không tự đóng và cũng không được chờ: `eventCase` chạy mà không
       ai `await`, mạch đi tiếp sau `ALERT_MS`. Mặt thẻ đứng đó tới lúc người
       chơi bấm — máy nào cũng vậy, mỗi máy một nhịp. */
    const seed = newSeed();
    this.g.netEmit('eventcard', { id: card.id, detail, seed });
    this.bumpClock('thời cuộc');
    let revealed;
    const shown = new Promise((r) => { revealed = r; });
    eventCase(card, { detail, seed, onReveal: revealed });
    // Hộp hỏng đường nào đó mà không lật được thì cũng đừng treo cả ván ở đây
    await Promise.race([shown, wait(12000)]);
    this.g.moment(this.voted ? 'ghostVote' : 'event', { title: card.title });
    await wait(ALERT_MS);

    await this.apply(card, plan);

    this.g.hud.refresh();
    this.g.scene.refresh(st);
    this.g.scene.placeTokens();
    this.g.sync();
  }

  /**
   * Hồn ma đang ngồi bàn: người đã phá sản mà còn mở máy (bản online), hoặc
   * mọi người đã phá sản (bản một máy — họ vẫn ngồi quanh cái máy ấy).
   */
  ghostSeats() {
    const g = this.g;
    return this.state.players
      .filter((p) => p.bankrupt && (!g.net || g.net.isSeatLive(p.id)))
      .map((p) => p.id);
  }

  /**
   * Lá Thời Cuộc sẽ nổ. Không có hồn ma thì rút như cũ; có thì bày hai lá cho
   * hội đồng hồn ma chọn — xem `drawEventPair`.
   */
  async pickCard() {
    const st = this.state;
    this.voted = false;
    const ghosts = this.ghostSeats();
    if (!ghosts.length) return drawEvent(st);
    const { a, b } = drawEventPair(st);
    if (!a || !b) return a;

    const id = await this.ghostVote(ghosts, a, b);
    const card = id === b.id ? b : a;
    returnEvent(st, card === a ? b : a);
    this.voted = true;
    return card;
  }

  /**
   * Hỏi cả hội đồng cùng lúc, đếm phiếu. Hoà hay không ai bỏ phiếu thì bốc
   * thăm giữa hai lá — hồn ma ngủ quên không được quyền giữ nguyên lá đầu.
   * @returns {Promise<string>} id lá thắng
   */
  async ghostVote(ghosts, a, b) {
    const st = this.state;
    const g = this.g;
    const names = ghosts.map((s) => st.players[s].name);
    this.bumpClock('hồn ma bỏ phiếu');
    await g.bc.show('HỘI ĐỒNG HỒN MA',
      `${names.map((n) => `<b>${n}</b>`).join(', ')} đang chọn lá Thời Cuộc cho người sống…`,
      { kind: 'trade', ms: 2600 });

    let votes;
    if (!g.net) {
      // Một máy: cả hội đồng ngồi chung màn hình, hỏi một lần là đủ
      votes = [await ghostVoteModal(a, b, names)];
    } else {
      votes = await Promise.all(ghosts.map((seat) => (seat === g.net.mySeat
        ? ghostVoteModal(a, b, names, this.ghostMs)
        : g.net.ask(seat, 'ev-ghost', { a: a.id, b: b.id, names },
          { fallback: null, timeout: this.ghostMs + 5000 }))));
    }
    const na = votes.filter((v) => v === a.id).length;
    const nb = votes.filter((v) => v === b.id).length;
    if (na !== nb) return na > nb ? a.id : b.id;
    return Math.random() < 0.5 ? a.id : b.id;
  }

  /** Dòng nói rõ sự kiện rơi vào khu nào, vào ai — in ngay trên mặt thẻ. */
  detailOf(card, plan) {
    const st = this.state;
    const who = (seat) => `<b style="color:${st.players[seat].token.css}">${st.players[seat].name}</b>`;
    switch (card.id) {
      /* Đếm riêng ô có nhà: cả khu cùng nằm trong vùng thiên tai, nhưng ô chưa
         cất nhà thì không mất gì — nói rõ ra để người chơi khỏi chờ một khoản
         thiệt hại không tới. */
      case 'dong-dat':
        return `Khu <b>${GROUPS[plan.group].name}</b>: ${hitCount(plan)} trong
                ${plan.tiles.length} ô có nhà để mất.`;
      case 'hoa-hoan':
        return `Khu <b>${GROUPS[plan.group].name}</b>: lửa lan cả khu,
                ${hitCount(plan)} trong ${plan.tiles.length} ô đang có nhà.`;
      case 'bao-tuyet':
        return `Khu <b>${GROUPS[plan.group].name}</b>: tuyết phủ cả khu,
                ${hitCount(plan)} trong ${plan.tiles.length} ô đang có nhà.`;
      case 'mo-duong':
        return `Khu <b>${GROUPS[plan.group].name}</b> lên giá thuê <b>+50%</b>, vĩnh viễn.`;
      case 'trung-thu':
        return `Trưng thu <b>${tileLabel(plan.tileId)}</b> của ${who(plan.seat)}, đền ${money(plan.payout)}.`;
      case 'sang-nhuong':
        return `Phát mãi <b>${tileLabel(plan.tileId)}</b> của ${who(plan.seat)}.`;
      case 'dai-ha-gia':
        return `Đem <b>${tileLabel(plan.tileId)}</b> ra bán đấu giá.`;
      case 'hoi-cho':
        return `${who(plan.seat)} nghèo nhất bàn, nhận ${money(plan.amount)}.`;
      case 'an-xa':
        return plan.seats.length
          ? `Thả ${plan.seats.map(who).join(', ')} khỏi Khám Lớn.`
          : '';
      case 'thue-dien-tho':
        return `${nthLabel(plan.nth)}${money(plan.perHouse)} mỗi nhà, ${money(plan.perHotel)} mỗi khách sạn.
                ${plan.bills.length} người phải nộp, tổng
                <b>${money(plan.bills.reduce((s, b) => s + b.amount, 0))}</b> vào Quỹ Công.`;
      case 'thue-khu':
        return `${nthLabel(plan.nth)}Khu <b>${GROUPS[plan.group].name}</b>, thuế suất
                <b>${Math.round(plan.rate * 100)}%</b>: ${plan.bills.length} chủ đất nộp tổng
                <b>${money(plan.bills.reduce((s, b) => s + b.amount, 0))}</b> vào Quỹ Công.`;
      case 'siet-tin-dung':
        return `${plan.bills.length} người đang cắm đất phải đóng lãi ngay.`;
      case 'mat-giay-to':
        return `Mỗi người chọn một ô của mình. Ô ấy ngưng thu tiền thuê.`;
      case 'hoan-doi-dia-ba':
        return plan.pairs.map((x) => `${who(x.from)} → ${who(x.to)}`).join(' · ');
      case 'quy-cong-phat-chan':
        return `Quỹ Công được bơm thêm ${money(plan.amount)}.`;
      case 'xac-song':
        return `Khu <b>${GROUPS[plan.group].name}</b>: xác sống kéo tới ${plan.tiles.length} ô đang có chủ.`;
      case 'phu-thuy':
        return `${who(plan.seatA)} giữ <b>${tileShortLabel(plan.a)}</b>, ${who(plan.seatB)} giữ
                <b>${tileShortLabel(plan.b)}</b>: hai bằng khoán bay sang nhà nhau.`;
      case 'trang-mau':
        return 'Ô có nhà thu thêm <b>50%</b>, đất trống không thu gì.';
      default:
        return '';
    }
  }

  /** Chọn tay thi hành theo id thẻ. */
  async apply(card, plan) {
    switch (card.id) {
      case 'thue-dien-tho':
      case 'thue-khu':            return this.taxToPot(plan);
      case 'siet-tin-dung':       return this.creditSqueeze(plan);
      case 'hoi-cho':             return this.fairPrize(plan);
      case 'an-xa':               return this.amnesty(plan);
      case 'quy-cong-phat-chan':  return this.fundPot(plan);
      case 'lam-phat':
      case 'mat-mua':
      case 'bao-gia':
      case 'gioi-nghiem':
      case 'duong-dong-bang':
      case 'trang-mau':
      case 'mo-duong':            return this.applyMod(card, plan);
      case 'xac-song':            return this.zombies(card, plan);
      case 'phu-thuy':            return this.witch(plan);
      case 'bao-tuyet':           return this.blizzard(card, plan);
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
    if (plan.group) await this.g.spot(GROUP_TILES[plan.group]);
    for (const b of plan.bills) {
      const p = st.players[b.seat];
      if (p.bankrupt) continue;
      const paid = await this.collect(b.seat, b.amount,
        b.note ?? `${b.houses} nhà, ${b.hotels} khách sạn`);
      if (paid) st.pot += b.amount;
    }
    this.g.sync();
    await this.g.bc.show('QUỸ CÔNG',
      `Quỹ Công có <b>${money(st.pot)}</b>. Ai ghé <b>Bến Đậu</b> trước thì ẵm trọn.`,
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
      `Ngân hàng bỏ vào Quỹ Công <span class="up">${money(plan.amount)}</span>.
       Quỹ có <b>${money(this.state.pot)}</b>, chờ người đầu tiên ghé Bến Đậu.`);
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
      ice: 'Đường <b>đóng băng</b>: mỗi lần lắc đi, quân trượt thêm 1 hoặc 2 ô',
      'blood-moon': 'Trăng máu: ô có nhà thu thêm <b>50%</b>, đất trống <b>không thu tiền thuê</b>',
      'group-rent': `Tiền thuê khu <b>${GROUPS[plan.mod.group]?.name ?? ''}</b> tăng <b>50%</b>`,
    }[plan.mod.type];
    await this.g.bc.show(card.title, `${what} ${rounds}.`,
      { kind: card.kind === 'good' ? null : 'bad', ms: 4200 });
    // Luật chỉ đổi ở một khu (mở đường) thì chỉ đúng khu ấy sáng lên
    if (plan.mod.group) await this.g.spot(GROUP_TILES[plan.mod.group]);
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
    /* Sáng trước khi hỏi, chứ không đợi lúc báo kết quả: mấy hộp "chống đỡ"
       mở tới nửa phút, cả bàn ngồi chờ mà không biết đang chờ vì ô nào. */
    await this.g.spot(plan.tiles.map((l) => l.id));

    /* Gom theo chủ đất: một người có ba ô trong khu thì chỉ hỏi một lần.
       Kế hoạch mang **cả khu**, kể cả ô chưa có nhà (`lose === 0`) — mấy ô ấy
       chỉ sáng lên cho thấy vùng thiên tai rộng tới đâu, không ai phải trả
       tiền chống đỡ cho đất trống. */
    const bySeat = lotsBySeat(st, plan);

    const answers = await this.askMany([...bySeat].map(([seat, lots]) => ({
      seat,
      name: 'ev-brace',
      data: { lots },
      local: () => litTiles(this.g.scene, lots.map((l) => l.id),
        () => bracePromptModal(st, seat, lots, this.localMs)),
      fallback: null,
      note: 'nhà cửa của họ vừa bị động đất',
    })));

    for (const [seat, lots] of bySeat) {
      const p = st.players[seat];
      const total = lots.reduce((s, l) => s + l.brace, 0);
      // Chốt lại ở máy cầm lái: câu trả lời gửi từ xa không được tin suông
      if (answers.get(seat) === 'brace' && p.money >= total) {
        /* Vẫn diễn cho cả bàn thấy đất rung, nứt: không có hình thì người chơi
           tưởng thẻ rỗng. Chỉ bỏ cảnh căn nhà văng ra vì nhà còn đứng nguyên. */
        this.g.tileFx('quake', lots.filter((l) => l.lose > 0).map((l) => l.id), false);
        await this.g.bc.show('CHỐNG ĐỠ KỊP',
          `<b>${p.name}</b> bỏ <span class="down">${money(total)}</span> gia cố ${lots.length} ô, nhà còn nguyên.`);
        await this.g.payBank(seat, total);
        continue;
      }
      const hit = lots.filter((l) => st.housesOn(l.id) > 0).map((l) => l.id);
      for (const lot of lots) this.collapse(lot.id);
      this.g.hud.refresh();
      this.g.scene.refresh(st);
      this.g.sync();
      this.g.tileFx('quake', hit);
      await this.g.bc.show('NHÀ SẬP',
        `<b>${p.name}</b> mất một tầng nhà ở ${lots.map((l) => tileShortLabel(l.id)).join(', ')}, không đền bù.`,
        { kind: 'bad', ms: 4200 });
      await this.g.spot(lots.map((l) => l.id), 1600);
    }
  }

  /**
   * Hạ một cấp nhà, trả vật liệu về kho ngân hàng.
   * Luật nằm ở `GameState.demolish` vì mấy thẻ Cơ Hội cũng dỡ nhà y hệt.
   */
  collapse(tileId) { this.state.demolish(tileId); }

  /**
   * Hoả hoạn: cả một khu bốc thăm trúng cùng cháy.
   *
   * Hỏi **theo chủ đất** chứ không theo ô, y như động đất: một người có ba ô
   * trong khu thì chỉ mở một hộp thoại, trả một khoản, giữ cả ba. Không chữa
   * thì mỗi ô mất nửa số nhà đang đứng trên đó, làm tròn xuống.
   */
  async fire(_card, plan) {
    const st = this.state;
    await this.g.spot(plan.tiles.map((l) => l.id));

    /* Gom theo chủ đất; bỏ qua ô trống, ô đã đổi chủ, hoặc chủ đã vỡ nợ từ
       lúc lập kế hoạch. */
    const bySeat = lotsBySeat(st, plan);

    const answers = await this.askMany([...bySeat].map(([seat, lots]) => ({
      seat,
      name: 'ev-fire',
      data: { lots },
      local: () => litTiles(this.g.scene, lots.map((l) => l.id),
        () => firePromptModal(st, seat, lots, this.localMs)),
      fallback: null,
      note: 'dãy phố của họ đang cháy',
    })));

    for (const [seat, lots] of bySeat) {
      const p = st.players[seat];
      const total = lots.reduce((sum, l) => sum + l.save, 0);
      // Chốt lại ở máy cầm lái: câu trả lời gửi từ xa không được tin suông
      if (answers.get(seat) === 'save' && p.money >= total) {
        // Như động đất: lửa vẫn bốc lên rồi tắt, chỉ không có căn nhà cháy rụi
        this.g.tileFx('fire', lots.filter((l) => l.lose > 0).map((l) => l.id), false);
        await this.g.bc.show('DẬP LỬA KỊP',
          `<b>${p.name}</b> trả <span class="down">${money(total)}</span> cho phu chữa cháy,
           nhà cửa ở ${lots.map((l) => tileShortLabel(l.id)).join(', ')} còn nguyên.`);
        await this.g.payBank(seat, total);
        continue;
      }

      let gone = 0;
      const burnt = [];
      for (const lot of lots) {
        const had = st.housesOn(lot.id);
        for (let i = 0; i < lot.lose && st.housesOn(lot.id) > 0; i++) {
          this.collapse(lot.id);
          gone += 1;
        }
        if (st.housesOn(lot.id) < had) burnt.push(lot.id);
      }
      audio.sfx('bankrupt');
      this.g.hud.refresh();
      this.g.scene.refresh(st);
      this.g.sync();
      this.g.tileFx('fire', burnt);
      await this.g.bc.show('CHÁY NHÀ',
        `<b>${p.name}</b> để mặc lửa cháy, mất <b>${gone} cấp nhà</b> ở
         ${lots.map((l) => tileShortLabel(l.id)).join(', ')}, không đền bù.`,
        { kind: 'bad', ms: 4600 });
      await this.g.spot(lots.map((l) => l.id), 1600);
    }
  }

  /**
   * Bão tuyết: cả một khu bốc thăm trúng cùng hứng tuyết.
   *
   * Cùng khuôn với hoả hoạn — hỏi theo chủ đất, trả một khoản giữ cả mấy ô —
   * chỉ khác số cấp mất (`snowLoss`: một cấp, khách sạn hai) và hoạt cảnh.
   */
  async blizzard(_card, plan) {
    const st = this.state;
    await this.g.spot(plan.tiles.map((l) => l.id));

    const bySeat = lotsBySeat(st, plan);

    const answers = await this.askMany([...bySeat].map(([seat, lots]) => ({
      seat,
      name: 'ev-snow',
      data: { lots },
      local: () => litTiles(this.g.scene, lots.map((l) => l.id),
        () => snowPromptModal(st, seat, lots, this.localMs)),
      fallback: null,
      note: 'mái nhà của họ đang oằn dưới tuyết',
    })));

    for (const [seat, lots] of bySeat) {
      const p = st.players[seat];
      const total = lots.reduce((sum, l) => sum + l.save, 0);
      // Chốt lại ở máy cầm lái: câu trả lời gửi từ xa không được tin suông
      if (answers.get(seat) === 'save' && p.money >= total) {
        // Gió tuyết vẫn quét qua cho cả bàn thấy, chỉ không có mái nào sập
        this.g.tileFx('blizzard', lots.filter((l) => l.lose > 0).map((l) => l.id), false);
        await this.g.bc.show('XÚC TUYẾT KỊP',
          `<b>${p.name}</b> trả <span class="down">${money(total)}</span> thuê phu xúc tuyết,
           mái nhà ở ${lots.map((l) => tileShortLabel(l.id)).join(', ')} còn nguyên.`);
        await this.g.payBank(seat, total);
        continue;
      }

      let gone = 0;
      const hit = [];
      for (const lot of lots) {
        const had = st.housesOn(lot.id);
        for (let i = 0; i < lot.lose && st.housesOn(lot.id) > 0; i++) {
          this.collapse(lot.id);
          gone += 1;
        }
        if (st.housesOn(lot.id) < had) hit.push(lot.id);
      }
      this.g.hud.refresh();
      this.g.scene.refresh(st);
      this.g.sync();
      this.g.tileFx('blizzard', hit);
      await this.g.bc.show('SẬP MÁI',
        `<b>${p.name}</b> để mặc tuyết đè, mất <b>${gone} cấp nhà</b> ở
         ${lots.map((l) => tileShortLabel(l.id)).join(', ')}, không đền bù.`,
        { kind: 'bad', ms: 4600 });
      await this.g.spot(lots.map((l) => l.id), 1600);
    }
  }

  /**
   * Xác sống tràn phố (chủ đề Halloween): cả khu bị kéo tới, mỗi chủ đất chọn
   * trả tiền thầy pháp hay để xác sống ở lại. Hỏi theo chủ đất như động đất:
   * một người có ba ô trong khu thì một hộp thoại, một khoản tiền.
   *
   * Ô bị chiếm mang hiệu ứng `zombie` có hạn; `BoardScene` đọc hiệu ứng ấy từ
   * ảnh chụp để nhuộm xanh ô, nên máy nào vào lại giữa chừng cũng thấy.
   */
  async zombies(_card, plan) {
    const st = this.state;
    const ids = plan.tiles.map((l) => l.id);
    this.g.netEmit('zombies', { ids });
    this.g.scene.zombieMarch?.(ids);
    audio.sfx('zombie');
    await this.g.spot(ids);

    const bySeat = new Map();
    for (const lot of plan.tiles) {
      if (st.owner.get(lot.id) !== lot.seat || st.players[lot.seat].bankrupt) continue;
      if (!bySeat.has(lot.seat)) bySeat.set(lot.seat, []);
      bySeat.get(lot.seat).push(lot);
    }

    const answers = await this.askMany([...bySeat].map(([seat, lots]) => ({
      seat,
      name: 'ev-zombie',
      data: { lots, rounds: Math.ceil(plan.turns / Math.max(1, st.alive().length)) },
      local: () => litTiles(this.g.scene, lots.map((l) => l.id),
        () => zombiePromptModal(st, seat, lots, this.localMs,
          Math.ceil(plan.turns / Math.max(1, st.alive().length)))),
      fallback: null,
      note: 'xác sống đang kéo tới đất của họ',
    })));

    const taken = [];
    for (const [seat, lots] of bySeat) {
      const p = st.players[seat];
      const total = lots.reduce((sum, l) => sum + l.cost, 0);
      // Chốt lại ở máy cầm lái: câu trả lời gửi từ xa không được tin suông
      if (answers.get(seat) === 'pay' && p.money >= total) {
        await this.g.bc.show('MỜI THẦY PHÁP',
          `<b>${p.name}</b> trả <span class="down">${money(total)}</span>, xác sống rời
           ${lots.map((l) => tileShortLabel(l.id)).join(', ')}.`);
        await this.g.payBank(seat, total);
        continue;
      }
      taken.push(...lots.map((l) => l.id));
    }
    if (taken.length === 0) return;

    // Mỗi lần nổ một đợt riêng, như Mất Giấy Tờ: chung `id` thì đè mất đợt trước
    st.addMod({ id: `xac-song:${st.eventsFired}`, type: 'zombie', tiles: taken, turns: plan.turns });
    this.g.hud.refresh();
    this.g.scene.refresh(st);
    this.g.sync();
    await this.g.bc.show('XÁC SỐNG CHIẾM ĐẤT',
      `${taken.map((id) => `<b>${tileShortLabel(id)}</b>`).join(', ')} không thu được tiền thuê
       trong <b>${Math.ceil(plan.turns / Math.max(1, st.alive().length))} vòng</b>.`,
      { kind: 'bad', ms: 4600 });
    await this.g.spot(taken, 2600);
  }

  /**
   * Phù thuỷ cưỡi chổi (chủ đề Halloween): hai lô đất trống của hai người đổi
   * chủ cho nhau, không ai phải bấm gì. Thế chấp đi theo ô: `mortgaged` ghi
   * theo ô chứ không theo chủ, nên chỉ cần đổi `owner`.
   */
  async witch(plan) {
    const st = this.state;
    const { a, b, seatA, seatB } = plan;
    if (st.owner.get(a) !== seatA || st.owner.get(b) !== seatB) return;
    if (st.players[seatA].bankrupt || st.players[seatB].bankrupt) return;

    await this.g.spot([a, b], 1400);
    this.g.netEmit('witch', { a, b });
    audio.sfx('witch');
    await this.g.scene.witchFly?.(a, b);

    st.transfer(a, seatB);
    st.transfer(b, seatA);
    this.g.hud.refresh();
    this.g.scene.refresh(st);
    this.g.sync();
    const name = (seat) => `<b style="color:${st.players[seat].token.css}">${st.players[seat].name}</b>`;
    await this.g.bc.show('PHÙ THUỶ CƯỠI CHỔI',
      `${name(seatA)} nhận <b>${tileShortLabel(b)}</b>, ${name(seatB)} nhận <b>${tileShortLabel(a)}</b>.`,
      { kind: 'trade', ms: 4600 });
    await this.g.spot([a, b], 2200);
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
    await this.g.spot(tiles, 2600);
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
    await this.g.spot([plan.tileId]);
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
      reason: `Toà phát mãi lô đất này của ${st.players[plan.seat].name}. Tiền bán được trả cho họ.`,
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
      reason: 'Ngân hàng đem lô đất chưa ai mua này ra đấu giá.',
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
      note: 'Chỉ chọn được ô chưa xây nhà.',
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
    await this.g.spot(moves.map((m) => m.id), 2600);
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
    /* Người bị luật gạt khỏi phiên (chủ cũ lúc phát mãi) không nhận hộp ghi giá,
       nên chỉ còn băng thông báo này nói cho họ biết vì sao mình không được hỏi. */
    const barred = st.alive().map((p) => p.id).filter((seat) => exclude.has(seat));
    const named = (seat) =>
      `<b style="color:${st.players[seat].token.css}">${st.players[seat].name}</b>`;

    await this.g.bc.show('MỞ PHIÊN ĐẤU GIÁ',
      `<b>${tileLabel(tileId)}</b>: ghi giá kín, cao nhất thì lấy đất.<br>
       Tham gia: ${bidders.map(named).join(', ')}
       ${barred.length ? `<br>Đứng ngoài: ${barred.map(named).join(', ')}` : ''}`,
      { kind: 'trade', ms: 3000 });
    /* Ghi giá kín là lúc ai cũng phải biết mình đang trả giá cho lô nào — hộp
       ghi giá chỉ hiện tên lô, mà giá trị của nó nằm ở chỗ nó đứng trên bàn. */
    await this.g.spot([tileId], 2200);

    const answers = await this.askMany(bidders.map((seat) => ({
      seat,
      name: 'ev-bid',
      data: { tileId, reason: o.reason, bidders, barred },
      local: () => litTiles(this.g.scene, [tileId],
        () => auctionBidModal(st, seat, tileId,
          { reason: o.reason, ms: this.localMs, bidders, barred })),
      fallback: 0,
      note: 'đang có phiên đấu giá',
    })));
    /* Chờ giá ăn gần hết hạn mà `askMany` vặn lúc mở phiên — máy ai đáp trễ
       (hạn hỏi + 8 giây) thì vòng cung ở mọi máy đã chạm 0 từ trước khi bảng
       giá kịp mở, cả bàn tưởng ván đã treo. Còn trả tiền và bảng giá nên vặn
       lại một lần. */
    this.bumpClock('đấu giá');

    /* Xếp theo giá, hoà thì ai chốt giá trước thắng (thứ tự câu trả lời về
       tới máy này, xem `askMany`) — khỏi phải mở thêm một vòng đấu giữa hai
       người bằng điểm, và ai quyết nhanh thì được thưởng.

       Giữ cả người ghi 0 lại trong `rows`: bảng giá lúc chốt phiên có tên đủ
       mặt người được hỏi thì mới đọc ra được ai bỏ qua, ai đua tới cùng. */
    const arrived = [...answers.keys()];
    const rows = bidders
      .filter((seat) => !st.players[seat].bankrupt)
      .map((seat) => {
        const n = Math.floor(answers.get(seat) ?? 0);
        return { seat, bid: Math.min(Number.isFinite(n) ? Math.max(n, 0) : 0, st.players[seat].money) };
      })
      .sort((a, b) => b.bid - a.bid || arrived.indexOf(a.seat) - arrived.indexOf(b.seat));
    const bids = rows.filter((b) => b.bid > 0);

    if (bids.length === 0) {
      /* Phiên ế cũng mở bảng giá ở mọi máy. Trước đây chỉ có một dòng thông
         báo, mà lúc cả bàn để hết giờ thì ai cũng đang nhìn hộp ghi giá vừa
         tắt — dòng chữ trôi qua góc màn hình không ai đọc, rồi bàn cờ đứng im
         chờ một bảng kết quả không bao giờ tới. */
      const noSale = o.seller === null || st.players[o.seller].bankrupt
        ? 'Đất nằm lại trong kho ngân hàng.' : 'Chủ cũ giữ nguyên đất.';
      this.g.bc.show('PHIÊN ĐẤU GIÁ Ế',
        `Không ai trả giá cho <b>${tileLabel(tileId)}</b>. ${noSale}`, { ms: 3600 });
      this.g.netEmit('auctionend', { tileId, rows, winner: null, noSale });
      auctionResultModal(st, tileId, rows, { winner: null, noSale });
      await wait(RESULT_MS);
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
    // Đất ngân hàng bán qua đấu giá cũng là một lần "mua từ ngân hàng" — Môi Giới ăn hoa hồng
    if (o.seller === null) await this.g.skills.brokerFees(win.seat, tileId);

    /* Bảng giá thay cho dòng thông báo cũ, và mở ở mọi máy chứ không riêng máy
       cầm lái. Không `await`: hộp cứ đứng đó tới lúc người chơi bấm, mỗi máy
       một nhịp, còn mạch sự kiện đi tiếp sau `RESULT_MS` — y như tấm thẻ Thời
       Cuộc. Hộp hỏi của nước kế tiếp sẽ đẩy nó đi (`yieldToNext`). */
    const sellerName = o.seller === null || st.players[o.seller].bankrupt
      ? null : st.players[o.seller].name;
    this.g.netEmit('auctionend', { tileId, rows, winner: win.seat, sellerName });
    auctionResultModal(st, tileId, rows, { winner: win.seat, sellerName });
    await wait(RESULT_MS);
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

    /* Vòng lặp chứ không phải một lần xét: băng "CẤN NỢ" đứng chờ vài giây,
       mà trong lúc ấy ván có thể nhận ảnh chụp từ máy khác. Xét lại ngay trước
       khi trừ thì số dư không bao giờ xuống dưới 0. */
    while (p.money < amount) {
      const { ok, mortgaged, sold } = autoRaise(st, seat, amount);
      if (mortgaged.length || sold.length) {
        this.g.hud.refresh();
        this.g.scene.refresh(st);
        this.g.sync();
        await this.g.bc.show('CẤN NỢ',
          `<b>${p.name}</b> không đủ tiền mặt. Ngân hàng
           ${mortgaged.length ? `giữ thế chấp <b>${mortgaged.length}</b> ô` : ''}
           ${mortgaged.length && sold.length ? ' và ' : ''}
           ${sold.length ? `hạ <b>${sold.length}</b> căn nhà` : ''} để thu đủ.`,
          { kind: 'bad', ms: 4200 });
      }
      if (!ok) {
        await this.g.bc.show('VỠ NỢ',
          `<b>${p.name}</b> không xoay nổi ${money(amount)}, vỡ nợ.`, { kind: 'bad', ms: 4000 });
        await this.g.doBankrupt(seat);
        return false;
      }
    }

    p.money -= amount;
    this.g.hud.refresh();
    this.g.sync();
    this.g.hud.flashMoney(seat, false);
    await this.g.bc.show('NỘP THUẾ',
      `<b>${p.name}</b> nộp <span class="down">${money(amount)}</span>: ${why}.`, { ms: 2400 });
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
          `${st.players[q.seat].name}: ${q.note}. Chuyền máy cho họ quyết định.`);
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
   * Map ghi câu trả lời theo **thứ tự về tới máy hỏi**, nên duyệt Map là ra ai
   * chốt trước — đấu giá dùng thứ tự này để xử hoà. Ở bản online, thứ tự tới
   * máy trọng tài là mốc chung duy nhất; đồng hồ của từng máy lệch nhau nên
   * không dùng giờ gửi được.
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

    await Promise.all([
      ...mine.map((q) => q.local().then((v) => out.set(q.seat, v))),
      ...others.map((q) => this.g.net
        .ask(q.seat, q.name, q.data, { fallback: q.fallback, timeout: this.askMs + 8000 })
        .then((v) => out.set(q.seat, v ?? q.fallback))),
    ]);
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

/**
 * Ô nào trong kế hoạch thiên tai thật sự mất nhà — kế hoạch mang cả khu, kể cả
 * ô đất trống.
 */
function hitCount(plan) {
  return plan.tiles.filter((t) => t.lose > 0).length;
}

/**
 * "Lần thứ N, " cho hai thẻ thuế dồn — lần đầu thì bỏ trống, khỏi in thừa.
 * Người chơi cần thấy con số đã dồn lên vì đâu, không thì tưởng tính sai.
 */
function nthLabel(nth) {
  return nth > 1 ? `Lần thứ <b>${nth}</b>, ` : '';
}

/**
 * Gom mấy ô sắp mất nhà theo chủ đất, để một người có ba ô trong khu chỉ phải
 * trả lời một lần.
 *
 * Bỏ ra ngoài: ô không có nhà (`lose === 0`), ô vô chủ, ô đã đổi chủ hoặc chủ
 * đã vỡ nợ kể từ lúc lập kế hoạch — sự kiện có thể chạy qua vài hộp thoại
 * trước khi tới đây.
 *
 * @returns {Map<number, Array<object>>} ghế → mấy ô của họ
 */
function lotsBySeat(st, plan) {
  const bySeat = new Map();
  for (const lot of plan.tiles) {
    if (lot.lose <= 0 || lot.seat === null || lot.seat === undefined) continue;
    if (st.owner.get(lot.id) !== lot.seat || st.players[lot.seat].bankrupt) continue;
    // Sổ Hồng / Di Sản: nhà không sập, khỏi hỏi chủ đất có chống đỡ không
    if (houseImmune(st, lot.id)) continue;
    if (!bySeat.has(lot.seat)) bySeat.set(lot.seat, []);
    bySeat.get(lot.seat).push(lot);
  }
  return bySeat;
}
