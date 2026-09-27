/**
 * Kỹ năng trong ván — phần phải hỏi người chơi, chuyển tiền có hoạt cảnh hoặc
 * loan tin cho cả bàn. Phần tính bằng số thuần (lương, hệ số thuê, giá xây,
 * miễn dỡ nhà) nằm ở core/skills.js và GameState, để máy nào dựng lại ván từ
 * ảnh chụp cũng tính ra cùng một con số.
 *
 * Mọi hàm ở đây chỉ chạy trên máy cầm lái, y như phần còn lại của controller:
 * hộp hỏi hiện ở máy người đang đi, kết quả đi theo ảnh chụp tới các máy khác.
 */
import { BOARD, GROUP_TILES, money, tileLabel } from '../data/board.js';
import {
  skillById, has, param, roll, rolled, ready, usesLeft, spend, onLap, levyRate, levyEach, levelOf,
  freeHouseTarget, credit, bumpFeat, rentGains, lateFee,
} from '../core/skills.js';
import { SKILLS, BROKE_LINE } from '../data/skills.js';
import { openModal } from '../ui/modal.js';
import { openSkillTree } from '../ui/skillTree.js';
import { skillIcon } from '../ui/skillIcons.js';
import { audio } from '../audio/audio.js';

const STATIONS = BOARD.filter((t) => t.type === 'station').map((t) => t.id);
const parity = (n) => (n % 2 === 0 ? 'even' : 'odd');
const PARITY_NAME = { even: 'Chẵn', odd: 'Lẻ', big: 'Tài', small: 'Xỉu' };
/** Cửa cược có trúng với tổng này không. Tài 8–12, Xỉu 2–6: ra 7 thì cả hai cửa thua. */
const hits = (pick, sum) => (pick === 'big' ? sum >= 8 : pick === 'small' ? sum <= 6 : parity(sum) === pick);
const title = (id) => `KỸ NĂNG · ${skillById(id).name.toUpperCase()}`;
const named = (p) => `<b style="color:${p.token.css}">${p.name}</b>`;
const pctText = (v) => (Array.isArray(v) ? `${Math.round(v[0] * 100)}–${Math.round(v[1] * 100)}%` : `${Math.round(v * 100)}%`);

export class SkillPlay {
  /** @param {import('./controller.js').Game} game */
  constructor(game) {
    this.g = game;
    /** Cược Chẵn Lẻ đang chờ lần lắc kế tiếp. @type {?{turnNo:number,pick:string,amount:number}} */
    this.bet = null;
    /** Tất Tay đang chờ lần lắc kế tiếp. @type {?{turnNo:number,pick:string}} */
    this.allIn = null;
    /** Đang đi nhờ Tàu Tốc Hành — tới ga kế thì không hỏi đi tiếp nữa, kẻo chạy vòng mãi. */
    this.expressing = false;
  }

  get st() { return this.g.state; }
  bc(t, html, o) { return this.g.bc.show(t, html, o); }

  /* ================================================================
     Thanh nút
     ================================================================ */

  /**
   * Nút kỹ năng cho thanh hành động. Nút cây kỹ năng luôn có; nút kỹ năng bấm
   * để dùng chỉ hiện lúc dùng được — trước khi lắc, ngoài tù.
   */
  buttons(p, rolled) {
    const st = this.st;
    const out = [{
      label: 'Kỹ năng', key: 'k',
      cls: p.skillPoints > 0 ? 'btn-gold' : 'btn-ghost',
      icon: skillIcon('root', 'ai'),
      hint: p.skillPoints > 0 ? `${p.skillPoints} điểm chưa dùng` : `đã học ${p.skills.length}`,
      title: 'Mở cây kỹ năng — học kỹ năng mới bằng điểm nhận khi qua ô Bắt Đầu',
      onClick: () => this.g.guard(() => this.openTree(p)),
    }];
    if (rolled || p.inJail) return out;

    if (has(p, 'dd2a')) {
      const placed = this.pending(this.bet);
      out.push(placed
        ? { label: `Đã cược ${PARITY_NAME[placed.pick]}`, cls: 'btn-ghost', disabled: true,
            icon: skillIcon('chip', 'ai'), hint: money(placed.amount) }
        : { label: 'Cược Chẵn Lẻ', key: 'c', cls: 'btn-ghost', icon: skillIcon('chip', 'ai'),
            disabled: p.usedTurn?.dd2a === st.turnNo || p.money < 50,
            hint: 'đoán trước khi lắc',
            onClick: () => this.g.guard(() => this.askBet(p)) });
    }
    if (ready(p, 'ddU') || this.pending(this.allIn)) {
      const placed = this.pending(this.allIn);
      out.push(placed
        ? { label: `Tất Tay · ${PARITY_NAME[placed.pick]}`, cls: 'btn-ghost', disabled: true,
            icon: skillIcon('allin', 'ai'), hint: 'chờ lần lắc này' }
        : { label: 'Tất Tay', key: 'a', cls: 'btn-ghost', icon: skillIcon('allin', 'ai'),
            hint: 'đoán chẵn/lẻ với cả bàn',
            onClick: () => this.g.guard(() => this.askAllIn(p)) });
    }
    if (ready(p, 'dhU')) {
      out.push({ label: 'Xuyên Việt', key: 'x', cls: 'btn-ghost', icon: skillIcon('teleport', 'ai'),
        hint: 'đi thẳng tới ô bất kỳ',
        onClick: () => this.g.guard(() => this.teleport(p)) });
    }
    return out;
  }

  /** Cược đang chờ, còn đúng lượt này của đúng người này. */
  pending(b) {
    return b && b.turnNo === this.st.turnNo && b.seat === this.st.turn ? b : null;
  }

  /**
   * Mở cây kỹ năng cho người đang đi. Đóng lại thì loan tin cho cả bàn những
   * gì đã đổi — so level từng ô trước và sau, nên tẩy điểm rồi học lại trong
   * cùng một lần mở cũng báo đúng cả hai việc.
   */
  async openTree(p) {
    const before = Object.fromEntries(SKILLS.map((s) => [s.id, levelOf(p, s.id)]));
    await openSkillTree(p, {
      color: p.token.css,
      onChange: () => {
        this.g.hud.refresh();
        this.g.scene.refresh(this.st);
        this.g.sync();
      },
    });
    const wiped = SKILLS.some((s) => levelOf(p, s.id) < before[s.id]);
    const base = wiped ? {} : before;
    const gained = SKILLS
      .filter((s) => levelOf(p, s.id) > (base[s.id] ?? 0))
      .map((s) => {
        const lv = levelOf(p, s.id);
        return `<b>${s.name}</b>${lv > 1 ? ` lên level ${lv}` : ''}`;
      });
    if (wiped) {
      await this.bc('TẨY ĐIỂM', `${named(p)} tẩy toàn bộ kỹ năng để học lại từ đầu${
        gained.length ? `, rồi học ${gained.join(', ')}` : ''}.`, { ms: 2800 });
    } else if (gained.length) {
      await this.bc('HỌC KỸ NĂNG', `${named(p)}: ${gained.join(', ')}.`, { ms: 2600 });
    }
    this.g.restoreActions();
  }

  /* ================================================================
     Qua ô Bắt Đầu
     ================================================================ */

  /**
   * Chạy **trước** khi tính lương: Thâm Niên đếm cả lần qua này.
   * @returns {number} số điểm kỹ năng vừa nhận (2 nếu tới nhịp Lão Làng)
   */
  lapStart(p) { return onLap(p); }

  /** Lương vừa lãnh: ghi phần mỗi kỹ năng góp vào tiến độ lên level. */
  paid(p, parts) {
    for (const [id, n] of Object.entries(parts)) credit(p, id, n);
  }

  /**
   * Chạy **sau** khi lãnh lương: thu quỹ Liên Đoàn, xây nhà Phố Cổ. Điểm kỹ
   * năng mới được báo chung trong dòng lương, khỏi thêm một nhịp chờ.
   */
  async lapEnd(p) {
    const st = this.st;

    /* Liên Đoàn: tính trên tiền mặt của người có kỹ năng **sau khi** lãnh
       lương. Ai có ít hơn khoản đó thì nộp hết số đang có, hết tiền thì bỏ
       qua — không đẩy ai vào vòng xoay tiền trả nợ chỉ vì kỹ năng người khác. */
    if (has(p, 'cnU')) {
      const rate = levyRate(p);
      const each = levyEach(p);
      const payers = st.alive().filter((q) => q.id !== p.id && q.money > 0);
      if (each > 0 && payers.length) {
        await this.bc(title('cnU'),
          `Quỹ ${Math.round(rate * 100)}% tiền mặt của ${named(p)}${
            each < Math.floor(p.money * rate) ? ` (trần ${money(each)})` : ''}: mỗi người nộp
           <span class="up">${money(each)}</span>${payers.some((q) => q.money < each) ? ' (ai không đủ thì nộp hết số đang có)' : ''}.`,
          { ms: 3000 });
        for (const q of payers) {
          const n = Math.min(each, q.money);
          if (n > 0 && !q.bankrupt && await this.g.payPlayer(q.id, p.id, n)) credit(p, 'cnU', n);
        }
      }
    }

    // Phố Cổ level 3 xây 2 căn: mỗi căn chọn lại ô, vì luật xây đều tay đổi sau mỗi căn
    for (let k = has(p, 'acU') ? param(p, 'acU').houses : 0; k > 0; k--) {
      const id = freeHouseTarget(st, p.id);
      if (id != null) {
        const res = st.build(p.id, id, { free: true });
        if (res.ok) {
          credit(p, 'acU');
          if (res.isHotel) st.heritage.add(id);
          this.g.hud.refresh();
          this.g.scene.refresh(st);
          this.g.sync();
          await this.bc(title('acU'),
            res.isHotel
              ? `${named(p)} lên <b>khách sạn Di Sản</b> ở <b>${tileLabel(id)}</b> miễn phí — thuê ×${param(p, 'acU').mult}, không ai dỡ được.`
              : `${named(p)} được xây thêm 1 căn miễn phí ở <b>${tileLabel(id)}</b>.`, { ms: 3000 });
          await this.contractorNote(res.payouts);
          await this.g.spot([id], 1600);
        }
      }
    }
  }

  /** Nhặt Tiền Rơi — sau mỗi lần di chuyển. */
  async pickup(p) {
    if (!has(p, 'cn1')) return;
    const { chance, amount } = rolled(p, 'cn1');
    if (Math.random() >= chance) return;
    await this.bc(title('cn1'), `${named(p)} nhặt được <span class="up">${money(amount)}</span> dọc đường.`, { ms: 1800 });
    credit(p, 'cn1', amount);
    await this.g.receiveFromBank(p.id, amount);
  }

  /* ================================================================
     Tiền nong
     ================================================================ */

  /**
   * Công Đoàn: thuế và tiền phạt từ thẻ chỉ thu một phần, level 1 rút ngẫu
   * nhiên mỗi lần. Chỉ gọi đúng lúc sắp thu tiền — số được bớt ghi luôn vào
   * tiến độ lên level.
   */
  cut(p, amount) {
    if (!has(p, 'cn2b')) return amount;
    const due = Math.round(amount * roll(param(p, 'cn2b').pay));
    credit(p, 'cn2b', amount - due);
    return due;
  }
  cutNote(p) { return has(p, 'cn2b') ? ' — đã giảm nhờ <b>Công Đoàn</b>' : ''; }

  /** Về Nhà: dừng ở Bến Đậu nhận thêm. */
  async parking(p) {
    if (!has(p, 'dh2b')) return;
    const n = roll(param(p, 'dh2b').parking);
    credit(p, 'dh2b', n);
    await this.bc(title('dh2b'), `${named(p)} nhận thêm <span class="up">${money(n)}</span> ở Bến Đậu.`, { ms: 2000 });
    await this.g.receiveFromBank(p.id, n);
  }

  /** Tiền thuê người này phải trả ở ô này, đã tính kỹ năng của cả hai bên. */
  rent(p, tileId, dice) { return this.rentBill(p, tileId, dice).total; }

  /**
   * Tiền thuê kèm phần mỗi kỹ năng góp vào, để trả xong thì ghi tiến độ lên
   * level cho cả người trả (được bớt) lẫn chủ đất (thu thêm).
   *
   * Thứ tự: hệ số của người trả (Vé Tháng, Sống Sót) bớt trước, rồi Chủ Nợ
   * so số còn lại với tiền mặt để tính phạt chậm. Tiền mặt đọc **trước khi**
   * trả, nên phải gọi hàm này ngay lúc sắp thu chứ không sau.
   * @returns {{total:number, credits:Array<[object,string,number]>, why:string[]}}
   */
  rentBill(p, tileId, dice) {
    const st = this.st;
    const owner = st.ownerOf(tileId);
    const full = st.rentFor(tileId, dice?.sum ?? 7);
    const credits = [];
    const why = [];
    let due = full;
    const cutBy = (id, k) => { credits.push([p, id, due * (1 - k)]); due *= k; why.push(skillById(id).name); };
    if (BOARD[tileId].type === 'station' && has(p, 'dh1')) cutBy('dh1', param(p, 'dh1').pay);
    if (has(p, 'acX1') && p.money < BROKE_LINE) cutBy('acX1', param(p, 'acX1').pay);
    due = Math.round(due);
    for (const [id, g] of rentGains(st, tileId, due)) credits.push([owner, id, g]);
    const late = lateFee(st, p, tileId, due);
    if (late) credits.push([owner, 'dcX1', late]);
    return { total: due + late, late, credits, why };
  }

  rentNote(p, tileId, bill) {
    const b = bill ?? this.rentBill(p, tileId, null);
    const bits = [];
    if (b.why.length) bits.push(`đã giảm nhờ <b>${b.why.join(', ')}</b>`);
    if (b.late) bits.push(`gồm <b>${money(b.late)}</b> phạt chậm của <b>Chủ Nợ</b>`);
    return bits.length ? ` (${bits.join('; ')})` : '';
  }

  /** Tiền thuê đã trả xong: ghi tiến độ lên level và thành tựu thu thuê của chủ đất. */
  rentPaid(owner, bill) {
    for (const [q, id, g] of bill.credits) credit(q, id, g);
    bumpFeat(owner, 'rentIn', bill.total);
  }

  /** Môi Giới: người khác mua đất từ ngân hàng thì ai có kỹ năng này nhận hoa hồng. */
  async brokerFees(buyerId, tileId) {
    const st = this.st;
    for (const q of st.players) {
      if (q.id === buyerId || !has(q, 'dc1')) continue;
      const fee = Math.round(BOARD[tileId].price * roll(param(q, 'dc1').rate));
      await this.bc(title('dc1'),
        `${named(q)} nhận hoa hồng <span class="up">${money(fee)}</span> từ lô <b>${tileLabel(tileId)}</b>.`, { ms: 2000 });
      credit(q, 'dc1', fee);
      await this.g.receiveFromBank(q.id, fee);
    }
  }

  /** Cò Đất: mọi giao dịch có đất đổi chủ, ai có kỹ năng này nhận tiền cò. */
  async tradeFees(offer) {
    const ids = [...offer.give, ...offer.get];
    if (!ids.length) return;
    const worth = ids.reduce((n, id) => n + BOARD[id].price, 0);
    for (const q of this.st.alive()) {
      if (!has(q, 'dc2a')) continue;
      const { rate, cap } = rolled(q, 'dc2a');
      const fee = Math.min(cap, Math.round(worth * rate));
      await this.bc(title('dc2a'), `${named(q)} nhận tiền cò <span class="up">${money(fee)}</span>.`, { ms: 2000 });
      credit(q, 'dc2a', fee);
      await this.g.receiveFromBank(q.id, fee);
    }
  }

  /** Thầu Vật Liệu: tiền đã cộng trong GameState, ở đây chỉ loan tin. */
  async contractorNote(payouts) {
    if (!payouts?.length) return;
    const st = this.st;
    this.g.hud.refresh();
    await this.bc(title('dc2b'),
      payouts.map((x) => `${named(st.players[x.seat])} <span class="up">+${money(x.amount)}</span>`).join(', '),
      { ms: 1800 });
  }

  /* ================================================================
     Ô đáp xuống
     ================================================================ */

  /**
   * Quân vừa dừng (trước khi xử lý ô): đếm thành tựu dừng chung ô, rồi Hai
   * Ngón móc túi người giàu nhất đang đứng ở đó. Chỉ lấy trong số tiền mặt
   * người ấy đang có, nên không bao giờ đẩy ai vào nợ.
   */
  async landed(p) {
    const others = this.st.alive().filter((q) => q.id !== p.id && q.pos === p.pos);
    if (!others.length || p.bankrupt) return;
    bumpFeat(p, 'share');
    if (!has(p, 'dhX1')) return;
    const { chance, pct, cap } = rolled(p, 'dhX1');
    if (Math.random() >= chance) return;
    const rich = others.reduce((a, b) => (b.money > a.money ? b : a));
    const n = Math.min(cap, Math.floor(rich.money * pct));
    if (n <= 0) return;
    await this.bc(title('dhX1'), `${named(p)} móc túi ${named(rich)} được <span class="up">${money(n)}</span>.`, { kind: 'trade', ms: 2200 });
    if (await this.g.payPlayer(rich.id, p.id, n)) credit(p, 'dhX1', n);
  }

  /**
   * Vừa mua xong một ô của ngân hàng: đếm cho thành tựu `buys`, rồi Khách Sộp
   * hoàn tiền. Gọi sau khi đã trừ đủ giá mua, để số hoàn không bù vào lúc
   * đang thiếu tiền mua.
   */
  async bought(p, tileId) {
    bumpFeat(p, 'buys');
    if (!has(p, 'dcX2')) return;
    const n = Math.round(BOARD[tileId].price * roll(param(p, 'dcX2').back));
    if (n <= 0) return;
    credit(p, 'dcX2', n);
    await this.bc(title('dcX2'), `Ngân hàng hoàn cho ${named(p)} <span class="up">${money(n)}</span>.`, { ms: 1900 });
    await this.g.receiveFromBank(p.id, n);
  }

  /** Dừng trên ô của chính mình: đếm cho thành tựu `home`, rồi Chủ Nhà trả tiền. */
  async atHome(p) {
    bumpFeat(p, 'home');
    if (!has(p, 'acX2')) return;
    const n = roll(param(p, 'acX2').bonus);
    credit(p, 'acX2', n);
    await this.bc(title('acX2'), `${named(p)} về đất nhà, nhận <span class="up">${money(n)}</span>.`, { ms: 1900 });
    await this.g.receiveFromBank(p.id, n);
  }

  /** Khách Quen Nhà Đá: vừa vào tù thì nhận bồi thường. */
  async jailed(p) {
    if (!has(p, 'cnX2')) return;
    const n = roll(param(p, 'cnX2').comp);
    credit(p, 'cnX2', n);
    await this.bc(title('cnX2'), `${named(p)} nhận <span class="up">${money(n)}</span> bồi thường.`, { ms: 1800 });
    await this.g.receiveFromBank(p.id, n);
  }

  /**
   * Khách Quen Nhà Đá: ra tù khỏi nộp phạt.
   * @returns {boolean} true nếu được miễn — bên gọi bỏ qua khoản phạt
   */
  freeBail(p, fine) {
    if (!has(p, 'cnX2')) return false;
    credit(p, 'cnX2', fine);
    return true;
  }

  /**
   * Thâu Tóm: dừng trên đất chưa có nhà của người khác thì được ép mua thay
   * vì trả thuê.
   * @returns {Promise<boolean>} true nếu đã mua (khỏi trả thuê)
   */
  async trySeize(p, tileId, rent) {
    const st = this.st;
    const t = BOARD[tileId];
    const owner = st.ownerOf(tileId);
    if (!owner || owner.id === p.id || !ready(p, 'dc3')) return false;
    const group = t.color_group ? GROUP_TILES[t.color_group] : [tileId];
    if (group.some((id) => st.housesOn(id) > 0)) return false;
    // Level 1 rút giá trước khi hỏi: số hiện trên hộp là số sẽ trả
    const premium = roll(param(p, 'dc3').premium);
    const price = Math.round(t.price * premium);
    if (p.money < price) return false;

    const v = await this.ask({
      id: 'dc3',
      body: `<p>Mua lại <b>${tileLabel(tileId)}</b> của ${named(owner)} với giá
        <b>${money(price)}</b> (${Math.round(premium * 100)}% giá gốc) — chủ đất không được từ chối.</p>
        <p>Không dùng thì trả thuê <b>${money(rent)}</b> như thường.</p>`,
      buttons: [
        { label: `Thâu Tóm · ${money(price)}`, value: true, cls: 'btn-gold' },
        { label: 'Trả thuê', value: false, cls: 'btn-ghost' },
      ],
    });
    if (!v) return false;

    spend(p, 'dc3');
    credit(p, 'dc3');
    await this.bc(title('dc3'),
      `${named(p)} ép mua <b>${tileLabel(tileId)}</b> của ${named(owner)}, trả
       <span class="down">${money(price)}</span>.`, { kind: 'trade' });
    if (!(await this.g.payPlayer(p.id, owner.id, price))) return true;
    if (st.owner.get(tileId) !== owner.id) return true;
    st.transfer(tileId, p.id);
    audio.sfx('trade');
    this.g.hud.refresh();
    this.g.scene.refresh(st);
    this.g.sync();
    await this.g.spot([tileId]);
    return true;
  }

  /**
   * Tàu Tốc Hành: đang đứng ở bến/ga thì hỏi có đi tiếp tới bến/ga kế không.
   * Hỏi bằng cách cho các bến/ga đích sáng trên bàn cờ — người chơi thấy luôn
   * ga ấy nằm đâu, của ai, khỏi đọc tên rồi tự dò. Hết giờ lượt thì là ở lại.
   */
  async express(p, dice) {
    if (!has(p, 'dh2a') || this.expressing || p.bankrupt || p.inJail) return;
    if (BOARD[p.pos].type !== 'station') return;
    const { bonus, any } = param(p, 'dh2a');
    // Level 3 chọn bến/ga nào cũng được; dưới đó chỉ bến/ga kế tiếp
    const i = STATIONS.indexOf(p.pos);
    const dests = any
      ? [1, 2, 3].map((k) => STATIONS[(i + k) % STATIONS.length])
      : [STATIONS[(i + 1) % STATIONS.length]];
    const passGo = dests.some((d) => d < p.pos);
    const dest = await this.g.pickTile(dests, {
      eyebrow: `Kỹ năng · ${skillById('dh2a').name}`,
      title: any ? 'Đi tiếp tới bến/ga nào?' : `Đi tiếp tới ${tileLabel(dests[0])}?`,
      sub: [
        bonus ? `Lên tàu nhận thêm <b class="up">${money(bonus)}</b>.` : '',
        passGo ? 'Đi ngang ô Bắt Đầu thì được nhận lương.' : '',
      ].filter(Boolean).join(' ') || 'Đi thẳng tới bến/ga đang sáng.',
      owned: false,
      quick: true,
      cancel: 'Ở lại',
    }, this.g.events.localMs);
    if (dest == null) return;
    credit(p, 'dh2a', bonus);
    await this.bc(title('dh2a'), `${named(p)} lên tàu tới <b>${tileLabel(dest)}</b>.`, { ms: 1800 });
    if (bonus) await this.g.receiveFromBank(p.id, bonus);
    if (p.bankrupt) return;
    this.expressing = true;
    try { await this.g.advance(p, (dest - p.pos + 40) % 40, dice); } finally { this.expressing = false; }
  }

  /* ================================================================
     Lắc xí ngầu
     ================================================================ */

  /**
   * Sau khi lắc, trước khi quân đi: Xí Ngầu Gian (lắc lại một viên) và Quay
   * Đầu (đi lùi). Gộp chung một lần hỏi để người có cả hai không phải bấm hai lần.
   *
   * Có Quay Đầu thì hỏi trên bàn cờ: ô đi tới và ô đi lùi cùng sáng, bấm ô nào
   * đi ô ấy; lắc lại viên nào là nút phụ trên bảng chọn. Chỉ có Xí Ngầu Gian thì
   * không có ô nào để chọn, vẫn hỏi bằng hộp thoại.
   * @returns {Promise<{d:object, back:boolean}>}
   */
  async afterRoll(p, d) {
    let rerolled = false;
    for (;;) {
      const canReroll = !rerolled && ready(p, 'dd3');
      const canBack = ready(p, 'dh3');
      if (!canReroll && !canBack) return { d, back: false };

      const fwd = (p.pos + d.sum) % 40;
      const back = (p.pos - d.sum + 40) % 40;
      const left = (id) => { const n = usesLeft(p, id); return n > 1 ? ` (còn ${n} lần trước khi qua ô Bắt Đầu)` : ''; };
      const rerolls = canReroll ? [
        { label: `Lắc lại viên ${d.a}`, value: 'a' },
        { label: `Lắc lại viên ${d.b}`, value: 'b' },
      ] : [];
      const rerollNote = canReroll ? `Xí Ngầu Gian${left('dd3')}: lắc lại một viên, kết quả mới là kết quả cuối.` : '';

      let v;
      if (canBack) {
        const pick = await this.g.pickTile([fwd, back], {
          eyebrow: `Kỹ năng · ${skillById('dh3').name}${left('dh3')}`,
          title: `Lắc ra ${d.a} + ${d.b} = ${d.sum} — đi tới hay đi lùi?`,
          sub: `Đi tới: <b>${tileLabel(fwd)}</b>${this.tileInfo(p, fwd, d)}<br>
            Đi lùi: <b>${tileLabel(back)}</b>${this.tileInfo(p, back, d)}`,
          note: rerollNote,
          owned: false,
          quick: true,
          extra: rerolls,
          cancel: 'Đi tới như thường',
        }, this.g.events.localMs);
        v = pick === back ? 'back' : pick === 'a' || pick === 'b' ? pick : 'go';
      } else {
        v = await this.ask({
          id: 'dd3',
          heading: 'Sau khi lắc',
          body: `<p>Lắc ra <b>${d.a} + ${d.b} = ${d.sum}</b>.</p>
            <p>Đi tới: <b>${tileLabel(fwd)}</b>${this.tileInfo(p, fwd, d)}</p>
            <p>${rerollNote}</p>`,
          buttons: [
            { label: `Đi tới · ${tileLabel(fwd)}`, value: 'go', cls: 'btn-primary' },
            ...rerolls.map((r) => ({ ...r, cls: 'btn-ghost' })),
          ],
          escValue: 'go',
        });
      }

      if (v === 'back') {
        spend(p, 'dh3');
        credit(p, 'dh3');
        await this.bc(title('dh3'), `${named(p)} quay đầu, lùi ${d.sum} ô.`, { ms: 1800 });
        return { d, back: true };
      }
      if (v === 'a' || v === 'b') {
        spend(p, 'dd3');
        credit(p, 'dd3');
        rerolled = true;
        const n = 1 + Math.floor(Math.random() * 6);
        const a = v === 'a' ? n : d.a;
        const b = v === 'b' ? n : d.b;
        d = { a, b, sum: a + b, isDouble: a === b };
        this.g.netEmit('dice', d);
        await this.g.scene.rollDiceAnim(d.a, d.b);
        await this.bc(title('dd3'), `${named(p)} lắc lại một viên — giờ là <b>${d.a} + ${d.b} = ${d.sum}</b>.`, { ms: 2000 });
        continue;
      }
      return { d, back: false };
    }
  }

  /** Một dòng tóm tắt ô đích cho hộp hỏi: của ai, thuê bao nhiêu. */
  tileInfo(p, id, d) {
    const owner = this.st.ownerOf(id);
    if (!BOARD[id].ownable) return '';
    if (!owner) return ' — còn trống';
    if (owner.id === p.id) return ' — đất của bạn';
    return ` — của ${owner.name}, thuê ${money(this.rent(p, id, d))}`;
  }

  /** Chẵn Lẻ và Đôi Hên: cộng trừ theo kết quả lắc. */
  async rollPerks(p, d) {
    if (has(p, 'dd1')) {
      const { even, odd } = rolled(p, 'dd1');
      if (d.sum % 2 === 0) {
        credit(p, 'dd1', even);
        await this.bc(title('dd1'), `Tổng chẵn — ${named(p)} <span class="up">+${money(even)}</span>.`, { ms: 1600 });
        await this.g.receiveFromBank(p.id, even);
      } else {
        if (odd > 0) {
          await this.bc(title('dd1'), `Tổng lẻ — ${named(p)} <span class="down">−${money(odd)}</span>.`, { ms: 1600 });
          await this.g.payBank(p.id, odd);
        }
      }
    }
    if (d.isDouble && has(p, 'dd2b') && (p.doubles ?? 0) < 3) {
      const n = roll(param(p, 'dd2b').double);
      credit(p, 'dd2b', n);
      await this.bc(title('dd2b'), `${named(p)} ra đôi — <span class="up">+${money(n)}</span>.`, { ms: 1600 });
      await this.g.receiveFromBank(p.id, n);
    }
    if (d.sum >= 10 && has(p, 'dhX2') && !p.bankrupt) {
      const n = roll(param(p, 'dhX2').bonus);
      credit(p, 'dhX2', n);
      await this.bc(title('dhX2'), `Lắc ra ${d.sum} — ${named(p)} <span class="up">+${money(n)}</span>.`, { ms: 1600 });
      await this.g.receiveFromBank(p.id, n);
    }
  }

  /**
   * Đôi Hên: ra đôi lần thứ ba thì nhận thưởng thay vì vào tù.
   * @returns {Promise<boolean>} true nếu đã xử lý (khỏi vào tù)
   */
  async jackpot(p) {
    if (!has(p, 'dd2b')) return false;
    const n = roll(param(p, 'dd2b').jackpot);
    credit(p, 'dd2b', n);
    await this.bc(title('dd2b'),
      `${named(p)} ra đôi lần thứ ba — không vào tù mà trúng <span class="up">${money(n)}</span>. Hết lượt.`,
      { ms: 3000 });
    await this.g.receiveFromBank(p.id, n);
    return true;
  }

  /** Cược Chẵn Lẻ: chọn cửa và số tiền trước khi lắc. */
  async askBet(p) {
    let pick = 'even';
    let amount = 50;
    const { payout, max } = param(p, 'dd2a');
    const amounts = [50, 100, 200, 300].filter((a) => a <= max);
    const taiXiu = has(p, 'ddX1');
    const v = await openModal({
      eyebrow: 'Kỹ năng · Cược Chẵn Lẻ',
      title: 'Đoán tổng hai viên xí ngầu',
      body: `<div class="sk-bet">
        <div class="sk-bet-row" data-row="pick">
          <button type="button" class="btn btn-ghost on" data-v="even">Chẵn</button>
          <button type="button" class="btn btn-ghost" data-v="odd">Lẻ</button>
          ${taiXiu ? `<button type="button" class="btn btn-ghost" data-v="big">Tài · 8–12</button>
          <button type="button" class="btn btn-ghost" data-v="small">Xỉu · 2–6</button>` : ''}
        </div>
        <div class="sk-bet-row" data-row="amount">
          ${amounts.map((a, i) => `<button type="button" class="btn btn-ghost${i ? '' : ' on'}" data-v="${a}"
            ${p.money < a ? 'disabled' : ''}>${money(a)}</button>`).join('')}
        </div>
        <p class="sk-bet-note">Chẵn/Lẻ đúng: được thêm ${pctText(payout)} số tiền cược.${taiXiu
          ? ` Tài/Xỉu đúng: được thêm ${pctText(param(p, 'ddX1').payout)} — ra 7 thì cả hai cửa thua.` : ''}
          Sai: mất tiền cược vào Quỹ Công${has(p, 'ddX2') ? `, được hoàn ${pctText(param(p, 'ddX2').back)}` : ''}.</p>
      </div>`,
      buttons: [
        { label: 'Đặt cược', value: true, cls: 'btn-gold' },
        { label: 'Thôi', value: false, cls: 'btn-ghost' },
      ],
      onMount: (body) => {
        body.querySelectorAll('[data-row] button').forEach((b) => b.addEventListener('click', () => {
          const row = b.parentElement;
          row.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
          if (row.dataset.row === 'pick') pick = b.dataset.v; else amount = Number(b.dataset.v);
        }));
      },
    });
    if (v && p.money >= amount) {
      p.usedTurn = { ...p.usedTurn, dd2a: this.st.turnNo };
      this.bet = { turnNo: this.st.turnNo, seat: p.id, pick, amount };
      this.g.sync();
      await this.bc(title('dd2a'), `${named(p)} cược <b>${money(amount)}</b> vào cửa <b>${PARITY_NAME[pick]}</b>.`, { ms: 2200 });
    }
    this.g.restoreActions();
  }

  /** Tất Tay: chọn cửa trước khi lắc. */
  async askAllIn(p) {
    const st = this.st;
    const { win, lose } = param(p, 'ddU');
    const others = st.alive().filter((q) => q.id !== p.id);
    const gainAt = (w) => others.reduce((n, q) => n + Math.floor(q.money * w), 0);
    const gain = Array.isArray(win) ? `${money(gainAt(win[0])).replace(/\$$/, '')}–${money(gainAt(win[1]))}` : money(gainAt(win));
    const loss = Math.floor(p.money * lose) * others.length;
    const v = await this.ask({
      id: 'ddU',
      body: `<p>Đoán tổng hai viên xí ngầu lần lắc tới.</p>
        <p>Đúng: nhận khoảng <b class="up">${gain}</b> (${pctText(win)} tiền mặt mỗi người).<br>
        Sai: trả tổng <b class="down">${money(loss)}</b> (${Math.round(lose * 100)}% tiền mặt của bạn cho mỗi người).</p>`,
      buttons: [
        { label: 'Đoán Chẵn', value: 'even', cls: 'btn-gold' },
        { label: 'Đoán Lẻ', value: 'odd', cls: 'btn-gold' },
        { label: 'Thôi', value: null, cls: 'btn-ghost' },
      ],
    });
    if (v) {
      spend(p, 'ddU');
      credit(p, 'ddU');
      this.allIn = { turnNo: st.turnNo, seat: p.id, pick: v };
      this.g.sync();
      await this.bc(title('ddU'), `${named(p)} tất tay cửa <b>${PARITY_NAME[v]}</b> với cả bàn!`, { kind: 'trade', ms: 2600 });
    }
    this.g.restoreActions();
  }

  /** Chốt cược và Tất Tay theo kết quả lắc cuối cùng (sau Xí Ngầu Gian). */
  async settleBets(p, d) {
    const st = this.st;
    const got = parity(d.sum);
    const bet = this.pending(this.bet);
    this.bet = null;
    if (bet) {
      const txu = bet.pick === 'big' || bet.pick === 'small';
      if (hits(bet.pick, d.sum)) {
        const n = Math.round(bet.amount * roll(param(p, txu ? 'ddX1' : 'dd2a').payout));
        credit(p, 'dd2a', txu ? 0 : n);
        if (txu) credit(p, 'ddX1', n);
        bumpFeat(p, 'betWin', n);
        await this.bc(title(txu ? 'ddX1' : 'dd2a'), `Ra ${d.sum} — ${named(p)} đoán đúng cửa ${PARITY_NAME[bet.pick]}, <span class="up">+${money(n)}</span>.`, { ms: 2200 });
        await this.g.receiveFromBank(p.id, n);
      } else {
        credit(p, 'dd2a');
        bumpFeat(p, 'betLose', bet.amount);
        await this.bc(title('dd2a'), `Ra ${d.sum} — ${named(p)} đoán sai cửa ${PARITY_NAME[bet.pick]}, mất <span class="down">${money(bet.amount)}</span> vào Quỹ Công.`, { kind: 'bad', ms: 2200 });
        if (await this.g.payBank(p.id, bet.amount)) {
          st.pot += bet.amount;
          if (has(p, 'ddX2')) {
            const back = Math.round(bet.amount * roll(param(p, 'ddX2').back));
            credit(p, 'ddX2', back);
            await this.bc(title('ddX2'), `${named(p)} được ngân hàng hoàn <span class="up">${money(back)}</span> tiền cược.`, { ms: 1800 });
            await this.g.receiveFromBank(p.id, back);
          }
        }
      }
    }

    const all = this.pending(this.allIn);
    this.allIn = null;
    if (all) {
      const { win, lose } = rolled(p, 'ddU');
      const others = st.alive().filter((q) => q.id !== p.id);
      if (all.pick === got) {
        await this.bc(title('ddU'), `Ra ${d.sum} — ${named(p)} thắng! Mỗi người trả ${Math.round(win * 100)}% tiền mặt.`, { kind: 'trade', ms: 2800 });
        for (const q of others) {
          const n = Math.floor(q.money * win);
          if (n > 0 && !q.bankrupt) await this.g.payPlayer(q.id, p.id, n);
        }
      } else {
        const each = Math.floor(p.money * lose);
        await this.bc(title('ddU'), `Ra ${d.sum} — ${named(p)} thua, trả mỗi người <span class="down">${money(each)}</span>.`, { kind: 'bad', ms: 2800 });
        for (const q of others) {
          if (each > 0 && !p.bankrupt && !q.bankrupt) await this.g.payPlayer(p.id, q.id, each);
        }
      }
    }
  }

  /** Chuyến Tàu Xuyên Việt: thay cho lượt lắc, chọn ô bất kỳ rồi đi thẳng tới đó. */
  async teleport(p) {
    const ids = BOARD.map((t) => t.id).filter((id) => id !== 30 && id !== p.pos);
    /* Cùng một bảng chọn ô với thẻ cưỡng chế: có nút bỏ ngang (chưa dùng kỹ
       năng thì bỏ ngang không mất gì), và bản online có hạn chọn như thẻ. */
    const dest = await this.g.pickTile(ids, {
      eyebrow: 'CHUYẾN TÀU XUYÊN VIỆT',
      title: 'Đi tới ô nào?',
      sub: 'Không lắc, đi thẳng tới ô bạn chọn. Đi ngang ô Bắt Đầu vẫn nhận lương.',
      confirm: 'Đi tới ô này',
      owned: false,
      cancel: 'Thôi, để lượt sau',
    }, this.g.events.localMs);
    if (dest == null || this.st.current !== p) { this.g.restoreActions(); return; }
    spend(p, 'dhU');
    credit(p, 'dhU');
    await this.bc(title('dhU'), `${named(p)} đi thẳng tới <b>${tileLabel(dest)}</b>.`, { ms: 2200 });
    await this.g.advance(p, (dest - p.pos + 40) % 40, null);
    if (this.st.over || p.bankrupt || p.inJail) { await this.g.endTurn(); return; }
    this.g.setTurnActions(true);
  }

  /* ================================================================
     Hộp hỏi dùng chung
     ================================================================ */

  /**
   * Hỏi người đang đi có dùng kỹ năng không. Nút cuối là "thôi" — Esc và hết
   * giờ lượt (`dismissTopModal`) đều rơi vào đó, trừ khi khai `escValue`.
   */
  ask({ id, heading, body, buttons, escValue }) {
    const s = skillById(id);
    return openModal({
      eyebrow: `Kỹ năng · ${s.name}`,
      title: heading ?? s.name,
      body: `<div class="sk-ask">${body}</div>`,
      buttons,
      ...(escValue !== undefined ? { escValue } : {}),
    });
  }
}
