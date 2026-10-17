/**
 * Thi hành một thẻ THỜI CUỘC: bày thẻ, hỏi những người liên quan, rồi ra tay.
 *
 * Chuyển từ `game/eventRunner.js`. Ba luật giữ nguyên:
 *   1. Engine lập kế hoạch (`planEvent`) một lần rồi mới hỏi — không ai gieo lại.
 *   2. Hỏi nhiều người thì hỏi **cùng lúc**, câu nào cũng có hạn và câu trả lời
 *      mặc định: một người bỏ đi không treo được cả bàn.
 *   3. Thu tiền thì ngân hàng tự cấn nợ (`autoRaise`), không hỏi từng người.
 */
import { BOARD, GROUPS, GROUP_TILES, money, tileLabel, tileShortLabel } from '../data/board.js';
import { drawEvent, planEvent, autoRaise, ghostPick, ghostTally } from '../core/events.js';
import { houseImmune, deedHolds } from '../core/skills.js';

export class EventRules {
  /** @param {import('./game.js').Rules} g */
  constructor(g) { this.g = g; }

  get st() { return this.g.st; }
  get askMs() { return this.g.ms('askMs'); }

  /* ================================================================
     Vòng đời một sự kiện
     ================================================================ */

  /** Rút và thi hành một thẻ, ở cuối lượt trước khi trao lượt. */
  *run() {
    const st = this.st;
    const g = this.g;
    // Hồn ma bầu trước: trúng phần phiếu bầu thì ra thẻ ấy, trượt thì rút chồng bài
    let card = ghostPick(st);
    let plan = card ? planEvent(st, card) : null;
    const votes = plan ? (ghostTally(st.ghostVote)[card.id] ?? 0) : 0;
    if (!plan) {
      card = drawEvent(st);
      plan = card ? planEvent(st, card) : null;
    }
    // Không thẻ nào hợp cảnh: xả bớt áp lực rồi thôi, đừng nổ một sự kiện rỗng
    if (!card || !plan) { st.pressure = Math.floor(st.pressure / 2); g.sync(); return; }

    st.eventsFired += 1;
    st.eventTally = { ...st.eventTally, [card.id]: (st.eventTally?.[card.id] ?? 0) + 1 };
    st.pressure = 0;
    st.dryTurn = false;
    st.ghostVote = null;
    g.sync();

    const detail = this.detailOf(card, plan) + (votes
      ? `<div class="ev-ghost">Hội Đồng Hồn Ma bầu thẻ này · ${votes} phiếu</div>` : '');
    /* Mặt thẻ đứng ở mọi máy tới lúc người chơi bấm; bên diễn giữ nhịp đọc
       trước khi diễn phần kế tiếp, engine không chờ. */
    g.fx('eventcard', { id: card.id, detail, seed: Math.floor(Math.random() * 2 ** 31) });
    yield* this.apply(card, plan);
    g.sync();
  }

  /** Dòng nói rõ sự kiện rơi vào khu nào, vào ai — in ngay trên mặt thẻ. */
  detailOf(card, plan) {
    const st = this.st;
    const who = (seat) => `<b style="color:${st.players[seat].token.css}">${st.players[seat].name}</b>`;
    switch (card.id) {
      // Đếm riêng ô có nhà: ô chưa cất nhà nằm trong vùng thiên tai mà không mất gì
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
        return plan.seats.length ? `Thả ${plan.seats.map(who).join(', ')} khỏi Khám Lớn.` : '';
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
        return 'Mỗi người chọn một ô của mình. Ô ấy ngưng thu tiền thuê.';
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

  *apply(card, plan) {
    switch (card.id) {
      case 'thue-dien-tho':
      case 'thue-khu':            yield* this.taxToPot(plan); return;
      case 'siet-tin-dung':       yield* this.creditSqueeze(plan); return;
      case 'hoi-cho':             this.fairPrize(plan); return;
      case 'an-xa':               this.amnesty(plan); return;
      case 'quy-cong-phat-chan':  this.fundPot(plan); return;
      case 'lam-phat':
      case 'mat-mua':
      case 'bao-gia':
      case 'gioi-nghiem':
      case 'duong-dong-bang':
      case 'trang-mau':
      case 'mo-duong':            this.applyMod(card, plan); return;
      case 'xac-song':            yield* this.zombies(card, plan); return;
      case 'phu-thuy':            this.witch(plan); return;
      case 'bao-tuyet':           yield* this.disaster('snow', plan); return;
      case 'dong-dat':            yield* this.disaster('quake', plan); return;
      case 'hoa-hoan':            yield* this.disaster('fire', plan); return;
      case 'mat-giay-to':         yield* this.lostDeeds(plan); return;
      case 'trung-thu':           yield* this.expropriate(plan); return;
      case 'sang-nhuong':         yield* this.forcedSale(plan); return;
      case 'hoan-doi-dia-ba':     yield* this.swapDeeds(plan); return;
      case 'dai-ha-gia':          yield* this.clearance(plan); return;
      default:
    }
  }

  /* ================================================================
     Kỳ 1 — tiền và luật tạm thời
     ================================================================ */

  *taxToPot(plan) {
    const st = this.st;
    if (plan.group) this.g.spot(GROUP_TILES[plan.group]);
    for (const b of plan.bills) {
      if (st.players[b.seat].bankrupt) continue;
      const paid = yield* this.collect(b.seat, b.amount, b.note ?? `${b.houses} nhà, ${b.hotels} khách sạn`);
      if (paid) st.pot += b.amount;
    }
    this.g.sync();
    this.g.say('QUỸ CÔNG', `Quỹ Công có <b>${money(st.pot)}</b>. Ai ghé <b>Bến Đậu</b> trước thì ẵm trọn.`, { ms: 3600 });
  }

  *creditSqueeze(plan) {
    for (const b of plan.bills) {
      if (this.st.players[b.seat].bankrupt) continue;
      yield* this.collect(b.seat, b.amount, `lãi ${b.count} ô đang thế chấp`);
    }
  }

  fairPrize(plan) {
    const p = this.st.players[plan.seat];
    this.g.say('HỘI CHỢ ĐẤU XẢO', `<b>${p.name}</b> nhận <span class="up">${money(plan.amount)}</span> tiền bán hàng.`);
    this.g.receiveFromBank(plan.seat, plan.amount);
  }

  amnesty(plan) {
    const st = this.st;
    for (const seat of plan.seats) {
      st.releaseFromJail(st.players[seat]);
      this.g.sfx('jail');
    }
    this.g.sync();
    if (plan.seats.length) {
      this.g.say('ÂN XÁ', `${plan.seats.map((s) => `<b>${st.players[s].name}</b>`).join(', ')} được thả khỏi Khám Lớn.`);
    }
  }

  fundPot(plan) {
    this.st.pot += plan.amount;
    this.g.sync();
    this.g.say('QUỸ CÔNG',
      `Ngân hàng bỏ vào Quỹ Công <span class="up">${money(plan.amount)}</span>.
       Quỹ có <b>${money(this.st.pot)}</b>, chờ người đầu tiên ghé Bến Đậu.`);
  }

  applyMod(card, plan) {
    const st = this.st;
    st.addMod(plan.mod);
    this.g.sync();
    const rounds = plan.mod.turns < 0
      ? 'từ giờ tới hết ván'
      : `trong <b>${Math.ceil(plan.mod.turns / Math.max(1, st.alive().length))} vòng</b>`;
    const what = {
      rent: 'Tiền thuê khắp bàn tăng <b>25%</b>',
      salary: 'Lương qua ô Bắt Đầu chỉ còn <b>một nửa</b>',
      build: 'Giá xây nhà tăng <b>50%</b>',
      'freeze-build': '<b>Cấm xây cất</b> trên toàn bàn',
      ice: 'Đường <b>đóng băng</b>: mỗi lần lắc đi, quân trượt thêm 1 hoặc 2 ô',
      'blood-moon': 'Trăng máu: ô có nhà thu thêm <b>50%</b>, đất trống <b>không thu tiền thuê</b>',
      'group-rent': `Tiền thuê khu <b>${GROUPS[plan.mod.group]?.name ?? ''}</b> tăng <b>50%</b>`,
    }[plan.mod.type];
    this.g.say(card.title, `${what} ${rounds}.`, { kind: card.kind === 'good' ? null : 'bad', ms: 4200 });
    if (plan.mod.group) this.g.spot(GROUP_TILES[plan.mod.group]);
  }

  /* ================================================================
     Kỳ 2 — nhà cửa và quyền sở hữu
     ================================================================ */

  /**
   * Động đất / hoả hoạn / bão tuyết: cả khu bị đánh, mỗi chủ đất chọn bỏ tiền
   * giữ nhà hay chịu mất. Hỏi **theo chủ đất**: ba ô trong khu thì một câu hỏi,
   * một khoản tiền.
   */
  *disaster(kind, plan) {
    const st = this.st;
    const g = this.g;
    const meta = DISASTER[kind];
    if (kind === 'quake') {
      g.sfx('shake');
      g.fx('quake', { strong: true });
    }
    // Sáng trước khi hỏi: cả bàn ngồi chờ thì phải biết đang chờ vì ô nào
    g.spot(plan.tiles.map((l) => l.id));
    const bySeat = lotsBySeat(st, plan);
    this.deedNotice(bySeat.held);

    const answers = yield* g.askMany([...bySeat].map(([seat, lots]) => ({
      seat, kind: meta.ask, data: { lots }, fallback: null,
    })), this.askMs);

    for (const [seat, lots] of bySeat) {
      const p = st.players[seat];
      const total = lots.reduce((s, l) => s + l[meta.cost], 0);
      // Câu trả lời gửi từ máy khách không được tin suông: soát lại tiền
      if (answers.get(seat) === meta.yes && p.money >= total && !p.bankrupt) {
        // Vẫn diễn cho cả bàn thấy, chỉ bỏ cảnh nhà văng ra vì nhà còn nguyên
        g.tileFx(meta.fx, lots.filter((l) => l.lose > 0).map((l) => l.id), false);
        g.say(meta.savedTitle, meta.saved(p, total, lots));
        yield* g.payBank(seat, total);
        continue;
      }
      if (p.bankrupt) continue;
      let gone = 0;
      const hit = [];
      for (const lot of lots) {
        const had = st.housesOn(lot.id);
        for (let i = 0; i < lot.lose && st.housesOn(lot.id) > 0; i++) {
          st.demolish(lot.id);
          gone += 1;
        }
        if (st.housesOn(lot.id) < had) hit.push(lot.id);
      }
      if (kind === 'fire') g.sfx('bankrupt');
      g.sync();
      g.tileFx(meta.fx, hit);
      g.say(meta.lostTitle, meta.lost(p, gone, lots), { kind: 'bad', ms: 4400 });
      g.spot(lots.map((l) => l.id), 1600);
    }
  }

  /** Báo những ô Sổ Hồng vừa giữ được nhà, trước khi hỏi ai chống đỡ. */
  deedNotice(held) {
    if (!held.length) return;
    const st = this.st;
    const names = [...new Set(held.map((l) => st.players[l.seat].name))];
    this.g.say('SỔ HỒNG GIỮ NHÀ',
      `Nhà của <b>${names.join(', ')}</b> ở ${held.map((l) => tileShortLabel(l.id)).join(', ')}
       đứng nguyên, khỏi chống đỡ.`, { ms: 2600 });
  }

  /** Xác sống tràn phố (Halloween): trả tiền thầy pháp hay để xác sống ở lại. */
  *zombies(_card, plan) {
    const st = this.st;
    const g = this.g;
    const ids = plan.tiles.map((l) => l.id);
    g.fx('zombies', { ids });
    g.sfx('zombie');
    g.spot(ids);
    const bySeat = new Map();
    for (const lot of plan.tiles) {
      if (st.owner.get(lot.id) !== lot.seat || st.players[lot.seat].bankrupt) continue;
      if (!bySeat.has(lot.seat)) bySeat.set(lot.seat, []);
      bySeat.get(lot.seat).push(lot);
    }
    const rounds = Math.ceil(plan.turns / Math.max(1, st.alive().length));
    const answers = yield* g.askMany([...bySeat].map(([seat, lots]) => ({
      seat, kind: 'ev-zombie', data: { lots, rounds }, fallback: null,
    })), this.askMs);

    const taken = [];
    for (const [seat, lots] of bySeat) {
      const p = st.players[seat];
      const total = lots.reduce((sum, l) => sum + l.cost, 0);
      if (answers.get(seat) === 'pay' && p.money >= total && !p.bankrupt) {
        g.say('MỜI THẦY PHÁP',
          `<b>${p.name}</b> trả <span class="down">${money(total)}</span>, xác sống rời
           ${lots.map((l) => tileShortLabel(l.id)).join(', ')}.`);
        yield* g.payBank(seat, total);
        continue;
      }
      taken.push(...lots.map((l) => l.id));
    }
    if (taken.length === 0) return;
    // Mỗi lần nổ một đợt riêng: chung `id` thì đè mất đợt trước
    st.addMod({ id: `xac-song:${st.eventsFired}`, type: 'zombie', tiles: taken, turns: plan.turns });
    g.sync();
    g.say('XÁC SỐNG CHIẾM ĐẤT',
      `${taken.map((id) => `<b>${tileShortLabel(id)}</b>`).join(', ')} không thu được tiền thuê
       trong <b>${rounds} vòng</b>.`, { kind: 'bad', ms: 4600 });
    g.spot(taken, 2600);
  }

  /** Phù thuỷ cưỡi chổi (Halloween): hai lô đất trống đổi chủ cho nhau. */
  witch(plan) {
    const st = this.st;
    const g = this.g;
    const { a, b, seatA, seatB } = plan;
    if (st.owner.get(a) !== seatA || st.owner.get(b) !== seatB) return;
    if (st.players[seatA].bankrupt || st.players[seatB].bankrupt) return;
    g.spot([a, b], 1400);
    g.fx('witch', { a, b });
    g.sfx('witch');
    st.transfer(a, seatB);
    st.transfer(b, seatA);
    g.sync();
    const name = (seat) => `<b style="color:${st.players[seat].token.css}">${st.players[seat].name}</b>`;
    g.say('PHÙ THUỶ CƯỠI CHỔI',
      `${name(seatA)} nhận <b>${tileShortLabel(b)}</b>, ${name(seatB)} nhận <b>${tileShortLabel(a)}</b>.`,
      { kind: 'trade', ms: 4600 });
    g.spot([a, b], 2200);
  }

  /** Mất giấy tờ: mỗi người tự chọn ô nào của mình chịu treo. */
  *lostDeeds(plan) {
    const st = this.st;
    const g = this.g;
    const seats = plan.seats.filter((s) => !st.players[s].bankrupt);
    const text = {
      eyebrow: 'MẤT GIẤY TỜ',
      title: 'Ô nào thất lạc giấy tờ?',
      sub: 'Ô bạn chọn sẽ <b>không thu được tiền thuê</b> cho tới khi làm lại giấy.',
      note: 'Chọn khôn ngoan: ô ít người đáp xuống thì mất cũng chẳng đau.',
      confirm: 'Chốt ô này',
    };
    const answers = yield* g.askMany(seats.map((seat) => ({
      seat,
      kind: 'ev-pick',
      data: { ids: st.propertiesOf(seat), text },
      // Không trả lời thì lấy ô rẻ nhất — phạt người vắng mặt nhẹ tay nhất có thể
      fallback: [...st.propertiesOf(seat)].sort((a, b) => BOARD[a].price - BOARD[b].price)[0],
    })), this.askMs);
    const tiles = [];
    for (const seat of seats) {
      const id = answers.get(seat);
      // Đất có thể đã đổi chủ giữa chừng — kiểm lại cho chắc
      if (id !== undefined && id !== null && st.owner.get(id) === seat) tiles.push(id);
    }
    if (tiles.length === 0) return;
    st.addMod({ id: `mat-giay-to:${st.eventsFired}`, type: 'frozen', tiles, turns: plan.turns });
    g.sync();
    g.say('GIẤY TỜ THẤT LẠC',
      `${tiles.map((id) => `<b>${tileShortLabel(id)}</b>`).join(', ')} ngưng thu tiền thuê
       trong <b>${Math.ceil(plan.turns / Math.max(1, st.alive().length))} vòng</b>.`, { kind: 'bad', ms: 4600 });
    g.spot(tiles, 2600);
  }

  /** Trưng thu: đất của người giàu nhất về tay nhà nước rồi đem bán lại. */
  *expropriate(plan) {
    const st = this.st;
    const g = this.g;
    const p = st.players[plan.seat];
    if (st.owner.get(plan.tileId) !== plan.seat) return;
    st.owner.delete(plan.tileId);
    st.mortgaged.delete(plan.tileId);
    g.sync();
    g.say('TRƯNG THU',
      `<b>${tileLabel(plan.tileId)}</b> bị trưng thu khỏi tay <b>${p.name}</b>,
       đền bù <span class="up">${money(plan.payout)}</span>.`, { kind: 'bad', ms: 4200 });
    g.spot([plan.tileId]);
    g.receiveFromBank(plan.seat, plan.payout);
    yield* this.auction(plan.tileId, {
      seller: null,
      reason: 'Đất vừa bị nhà nước trưng thu, nay đem bán lại cho ai trả cao nhất.',
    });
  }

  /** Sang nhượng bắt buộc: chủ cũ đứng ngoài phiên, tiền bán được trả cho họ. */
  *forcedSale(plan) {
    const st = this.st;
    if (st.owner.get(plan.tileId) !== plan.seat) return;
    yield* this.auction(plan.tileId, {
      seller: plan.seat,
      reason: `Toà phát mãi lô đất này của ${st.players[plan.seat].name}. Tiền bán được trả cho họ.`,
      exclude: [plan.seat],
    });
  }

  /** Đại hạ giá: đất ế trong kho ngân hàng đem bán. */
  *clearance(plan) {
    if (this.st.owner.has(plan.tileId)) return;
    yield* this.auction(plan.tileId, { seller: null, reason: 'Ngân hàng đem lô đất chưa ai mua này ra đấu giá.' });
  }

  /** Hoán đổi địa bạ: mỗi người giao một ô cho người kế tiếp trong vòng đi. */
  *swapDeeds(plan) {
    const st = this.st;
    const g = this.g;
    const pairs = plan.pairs.filter((x) => !st.players[x.from].bankrupt && !st.players[x.to].bankrupt);
    const bare = (seat) => st.propertiesOf(seat).filter((id) => st.housesOn(id) === 0);
    const text = (toName) => ({
      eyebrow: 'HOÁN ĐỔI ĐỊA BẠ',
      title: `Giao ô nào cho ${toName}?`,
      sub: 'Ô bạn chọn sang tên ngay cho họ. Đổi lại, bạn nhận một ô từ người phía trước.',
      note: 'Chỉ chọn được ô chưa xây nhà.',
      confirm: 'Giao ô này',
    });
    const answers = yield* g.askMany(pairs.map(({ from, to }) => ({
      seat: from,
      kind: 'ev-pick',
      data: { ids: bare(from), text: text(st.players[to].name) },
      fallback: [...bare(from)].sort((a, b) => BOARD[a].price - BOARD[b].price)[0],
    })), this.askMs);
    /* Chốt cả vòng một lượt: chuyển từng cặp ngay thì ô vừa nhận lại thành ô
       đem cho ở cặp sau. */
    const moves = [];
    for (const { from, to } of pairs) {
      const id = answers.get(from);
      if (id !== undefined && id !== null && st.owner.get(id) === from && st.housesOn(id) === 0) {
        moves.push({ id, from, to });
      }
    }
    if (moves.length === 0) return;
    g.sfx('trade');
    for (const m of moves) st.transfer(m.id, m.to);
    g.sync();
    g.say('HOÁN ĐỔI ĐỊA BẠ',
      moves.map((m) => `<b style="color:${st.players[m.from].token.css}">${st.players[m.from].name}</b>
         giao <b>${tileShortLabel(m.id)}</b> cho
         <b style="color:${st.players[m.to].token.css}">${st.players[m.to].name}</b>`).join('<br>'),
      { kind: 'trade', ms: 6000 });
    g.spot(moves.map((m) => m.id), 2600);
  }

  /* ================================================================
     Đấu giá kín
     ================================================================ */

  /**
   * Bán một ô cho người trả cao nhất: một vòng ghi giá kín, hoà thì ai chốt
   * giá trước thắng.
   * @param {{seller:?number, reason:string, exclude?:number[]}} o
   */
  *auction(tileId, o) {
    const st = this.st;
    const g = this.g;
    const exclude = new Set(o.exclude ?? []);
    const bidders = st.alive().map((p) => p.id).filter((seat) => !exclude.has(seat));
    if (bidders.length === 0) return;
    const barred = st.alive().map((p) => p.id).filter((seat) => exclude.has(seat));
    const named = (seat) => `<b style="color:${st.players[seat].token.css}">${st.players[seat].name}</b>`;
    g.say('MỞ PHIÊN ĐẤU GIÁ',
      `<b>${tileLabel(tileId)}</b>: ghi giá kín, cao nhất thì lấy đất.<br>
       Tham gia: ${bidders.map(named).join(', ')}
       ${barred.length ? `<br>Đứng ngoài: ${barred.map(named).join(', ')}` : ''}`,
      { kind: 'trade', ms: 3000 });
    g.spot([tileId], 2200);

    const answers = yield* g.askMany(bidders.map((seat) => ({
      seat, kind: 'ev-bid', data: { tileId, reason: o.reason, bidders, barred }, fallback: 0,
    })), this.askMs);

    const arrived = [...answers.keys()];
    const rows = bidders
      .filter((seat) => !st.players[seat].bankrupt)
      .map((seat) => {
        const n = Math.floor(Number(answers.get(seat) ?? 0));
        return { seat, bid: Math.min(Number.isFinite(n) ? Math.max(n, 0) : 0, st.players[seat].money) };
      })
      .sort((a, b) => b.bid - a.bid || arrived.indexOf(a.seat) - arrived.indexOf(b.seat));
    const bids = rows.filter((b) => b.bid > 0);

    if (bids.length === 0) {
      const noSale = o.seller === null || st.players[o.seller].bankrupt
        ? 'Đất nằm lại trong kho ngân hàng.' : 'Chủ cũ giữ nguyên đất.';
      g.say('PHIÊN ĐẤU GIÁ Ế', `Không ai trả giá cho <b>${tileLabel(tileId)}</b>. ${noSale}`, { ms: 3600 });
      g.fx('auctionend', { tileId, rows, winner: null, noSale });
      return;
    }

    const win = bids[0];
    const winner = st.players[win.seat];
    g.sfx('buy');
    if (o.seller === null || st.players[o.seller].bankrupt) {
      yield* g.payBank(win.seat, win.bid);
    } else {
      yield* g.payPlayer(win.seat, o.seller, win.bid);
    }
    // Người thắng có thể vừa phá sản vì chính khoản này — lúc ấy đất về ngân hàng
    if (winner.bankrupt) return;
    st.owner.set(tileId, win.seat);
    st.mortgaged.delete(tileId);
    g.sync();
    // Đất ngân hàng bán qua đấu giá cũng là "mua từ ngân hàng" — Môi Giới ăn hoa hồng
    if (o.seller === null) yield* g.skills.brokerFees(win.seat, tileId);
    const sellerName = o.seller === null || st.players[o.seller].bankrupt ? null : st.players[o.seller].name;
    g.fx('auctionend', { tileId, rows, winner: win.seat, sellerName });
  }

  /* ================================================================
     Thu tiền
     ================================================================ */

  /**
   * Thu một khoản. Thiếu tiền mặt thì ngân hàng cấn nợ hộ (thế chấp, bán nhà);
   * cạn sạch mới tính phá sản.
   */
  *collect(seat, amount, why) {
    const st = this.st;
    const g = this.g;
    const p = st.players[seat];
    if (amount <= 0) return true;
    while (p.money < amount) {
      const { ok, mortgaged, sold } = autoRaise(st, seat, amount);
      if (mortgaged.length || sold.length) {
        g.sync();
        g.say('CẤN NỢ',
          `<b>${p.name}</b> không đủ tiền mặt. Ngân hàng
           ${mortgaged.length ? `giữ thế chấp <b>${mortgaged.length}</b> ô` : ''}
           ${mortgaged.length && sold.length ? ' và ' : ''}
           ${sold.length ? `hạ <b>${sold.length}</b> căn nhà` : ''} để thu đủ.`, { kind: 'bad', ms: 4200 });
      }
      if (!ok) {
        g.say('VỠ NỢ', `<b>${p.name}</b> không xoay nổi ${money(amount)}, vỡ nợ.`, { kind: 'bad', ms: 4000 });
        yield* g.doBankrupt(seat);
        return false;
      }
    }
    p.money -= amount;
    g.sync();
    g.say('NỘP THUẾ', `<b>${p.name}</b> nộp <span class="down">${money(amount)}</span>: ${why}.`, { ms: 2400 });
    g.fly(seat, 'bank', amount, '−');
    return true;
  }
}

/** Ba thiên tai cùng khuôn, khác câu hỏi, khoản tiền, hoạt cảnh và lời báo. */
const DISASTER = {
  quake: {
    ask: 'ev-brace', yes: 'brace', cost: 'brace', fx: 'quake',
    savedTitle: 'CHỐNG ĐỠ KỊP',
    saved: (p, total, lots) => `<b>${p.name}</b> bỏ <span class="down">${money(total)}</span> gia cố ${lots.length} ô, nhà còn nguyên.`,
    lostTitle: 'NHÀ SẬP',
    lost: (p, _gone, lots) => `<b>${p.name}</b> mất một tầng nhà ở ${lots.map((l) => tileShortLabel(l.id)).join(', ')}, không đền bù.`,
  },
  fire: {
    ask: 'ev-fire', yes: 'save', cost: 'save', fx: 'fire',
    savedTitle: 'DẬP LỬA KỊP',
    saved: (p, total, lots) => `<b>${p.name}</b> trả <span class="down">${money(total)}</span> cho phu chữa cháy,
       nhà cửa ở ${lots.map((l) => tileShortLabel(l.id)).join(', ')} còn nguyên.`,
    lostTitle: 'CHÁY NHÀ',
    lost: (p, gone, lots) => `<b>${p.name}</b> để mặc lửa cháy, mất <b>${gone} cấp nhà</b> ở
       ${lots.map((l) => tileShortLabel(l.id)).join(', ')}, không đền bù.`,
  },
  snow: {
    ask: 'ev-snow', yes: 'save', cost: 'save', fx: 'blizzard',
    savedTitle: 'XÚC TUYẾT KỊP',
    saved: (p, total, lots) => `<b>${p.name}</b> trả <span class="down">${money(total)}</span> thuê phu xúc tuyết,
       mái nhà ở ${lots.map((l) => tileShortLabel(l.id)).join(', ')} còn nguyên.`,
    lostTitle: 'SẬP MÁI',
    lost: (p, gone, lots) => `<b>${p.name}</b> để mặc tuyết đè, mất <b>${gone} cấp nhà</b> ở
       ${lots.map((l) => tileShortLabel(l.id)).join(', ')}, không đền bù.`,
  },
};

function hitCount(plan) {
  return plan.tiles.filter((t) => t.lose > 0).length;
}

/** "Lần thứ N, " cho hai thẻ thuế dồn — lần đầu bỏ trống. */
function nthLabel(nth) {
  return nth > 1 ? `Lần thứ <b>${nth}</b>, ` : '';
}

/**
 * Gom mấy ô sắp mất nhà theo chủ đất. Bỏ ra ngoài: ô không có nhà, ô vô chủ,
 * ô đã đổi chủ hoặc chủ đã vỡ nợ kể từ lúc lập kế hoạch, ô Di Sản. Ô của chủ
 * có Sổ Hồng rút tỉ lệ giữ nhà ngay ở đây, giữ được thì nằm trong `held`.
 * @returns {Map<number, Array<object>> & {held: Array<object>}}
 */
function lotsBySeat(st, plan) {
  const bySeat = new Map();
  bySeat.held = [];
  for (const lot of plan.tiles) {
    if (lot.lose <= 0 || lot.seat === null || lot.seat === undefined) continue;
    if (st.owner.get(lot.id) !== lot.seat || st.players[lot.seat].bankrupt) continue;
    if (houseImmune(st, lot.id)) continue;
    if (deedHolds(st, lot.id, lot.lose)) { bySeat.held.push(lot); continue; }
    if (!bySeat.has(lot.seat)) bySeat.set(lot.seat, []);
    bySeat.get(lot.seat).push(lot);
  }
  return bySeat;
}
