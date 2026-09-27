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
  freeHouseTarget, credit, bumpFeat, rentGains, lateFee, lottoPrize, tollStops, forecloseOffers,
  tourPassed, leftoverOffers,
} from '../core/skills.js';
import { cardType, isKeepable, moveDest, repairBill } from '../core/cards.js';
import { cardName, cardEffect, CARD_KINDS, DECK_META } from '../data/cards.js';
import { RANKS, rankOf, shortLabel } from '../ui/caseOpen.js';
import { SKILLS, BRANCHES } from '../data/skills.js';
import { openModal } from '../ui/modal.js';
import { openSkillTree } from '../ui/skillTree.js';
import { skillIcon } from '../ui/skillIcons.js';
import { audio } from '../audio/audio.js';

const STATIONS = BOARD.filter((t) => t.type === 'station').map((t) => t.id);
const parity = (n) => (n % 2 === 0 ? 'even' : 'odd');
const PARITY_NAME = { even: 'Chẵn', odd: 'Lẻ', big: 'Tài', small: 'Xỉu' };
/** Cửa cược có trúng với tổng này không. Tài 8–12, Xỉu 2–6: ra 7 thì cả hai cửa thua. */
const hits = (pick, sum) => (pick === 'big' ? sum >= 8 : pick === 'small' ? sum <= 6 : parity(sum) === pick);
/** Màu nhánh theo key — viền ô trong kho kỹ năng. */
const SKILL_COLOR = Object.fromEntries(BRANCHES.map((b) => [b.key, b.color]));
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
    /** Xe Đạp đã bấm, chờ lần lắc kế tiếp. @type {?{turnNo:number,seat:number}} */
    this.bike = null;
  }

  get st() { return this.g.state; }
  bc(t, html, o) { return this.g.bc.show(t, html, o); }

  /* ================================================================
     Thanh nút
     ================================================================ */

  /**
   * Hai nút kỹ năng cho thanh hành động: cây kỹ năng, và kho kỹ năng bấm để
   * dùng. Mọi kỹ năng kích hoạt gom vào kho chứ không bày từng nút ra thanh
   * hành động — học năm sáu kỹ năng là thanh nút tràn khỏi màn điện thoại.
   */
  buttons(p, rolled) {
    const out = [{
      label: 'Kỹ năng', key: 'k', half: true,
      cls: p.skillPoints > 0 ? 'btn-gold' : 'btn-ghost',
      icon: skillIcon('root', 'ai'),
      hint: p.skillPoints > 0 ? `${p.skillPoints} điểm chưa dùng` : `đã học ${p.skills.length}`,
      title: 'Mở cây kỹ năng: học kỹ năng mới bằng điểm nhận khi qua ô Bắt Đầu',
      onClick: () => this.g.guard(() => this.openTree(p)),
    }];
    // Nút kho luôn đứng cạnh nút cây; chưa học kỹ năng kích hoạt nào thì tối lại
    const acts = this.actives(p, rolled);
    const n = acts.filter((a) => a.ready).length;
    out.push({
      label: 'Dùng kỹ năng', key: 'u', half: true,
      cls: n ? 'btn-gold' : 'btn-ghost',
      disabled: !acts.length,
      icon: skillIcon('chip', 'ai'),
      hint: !acts.length ? 'chưa học kỹ năng kích hoạt' : n ? `${n} kỹ năng dùng được` : 'chưa có kỹ năng dùng được',
      title: 'Mở kho kỹ năng bấm để dùng',
      onClick: () => this.g.guard(() => this.openKit(p, rolled)),
    });
    return out;
  }

  /**
   * Kỹ năng kích hoạt người này đã học, kèm tình trạng lúc này. `ready` là
   * bấm được ngay; `status` nói vì sao chưa, hoặc đang ở trạng thái nào.
   * Kỹ năng tự hỏi đúng lúc (Tàu Tốc Hành, Quay Đầu, Xí Ngầu Gian, Thâu Tóm)
   * cũng liệt kê — không bấm được, nhưng người chơi thấy còn mấy lần, chờ bao lâu.
   * @returns {Array<{id:string, ready:boolean, status:string, run?:Function}>}
   */
  actives(p, rolled) {
    const st = this.st;
    const out = [];
    const jail = p.inJail;
    const wait = (id) => `Chờ ${p.cooldowns[id]} lần qua ô Bắt Đầu`;
    const beforeRoll = rolled ? 'Chỉ dùng trước khi lắc' : jail ? 'Không dùng khi đang ở tù' : '';
    const add = (id, ready, status, run, extra = {}) => { if (has(p, id)) out.push({ id, ready: !!ready, status, run, ...extra }); };

    const bet = this.pending(this.bet);
    add('dd2a', !beforeRoll && !bet && p.usedTurn?.dd2a !== st.turnNo && p.money >= 50,
      bet ? `Đã cược ${PARITY_NAME[bet.pick]} ${money(bet.amount)}`
        : beforeRoll || (p.usedTurn?.dd2a === st.turnNo ? 'Đã cược lượt này'
          : p.money < 50 ? 'Cần ít nhất 50$' : 'Đoán tổng xí ngầu trước khi lắc'),
      () => this.askBet(p));
    const all = this.pending(this.allIn);
    add('ddU', !beforeRoll && !all && ready(p, 'ddU'),
      all ? `Đã tất tay cửa ${PARITY_NAME[all.pick]}` : !ready(p, 'ddU') ? wait('ddU')
        : beforeRoll || 'Đoán chẵn/lẻ với cả bàn',
      () => this.askAllIn(p));
    add('dhU', !beforeRoll && ready(p, 'dhU'),
      !ready(p, 'dhU') ? wait('dhU') : beforeRoll || 'Thay cho lượt lắc',
      () => this.teleport(p));
    const bike = this.pending(this.bike);
    add('dhS1', !beforeRoll && !bike && usesLeft(p, 'dhS1') > 0,
      bike ? 'Đang đạp xe: lần lắc này đi theo viên nhỏ hơn'
        : usesLeft(p, 'dhS1') <= 0 ? wait('dhS1') : beforeRoll || `Còn ${usesLeft(p, 'dhS1')} lần tới lần qua ô Bắt Đầu`,
      () => this.rideBike(p));
    add('ddV', !jail && (p.lotto == null || !p.lapUses?.ddVpick),
      p.lotto == null ? 'Chưa chọn số' : p.lapUses?.ddVpick ? `Số ${p.lotto} · đã đổi trong vòng này` : `Số ${p.lotto} · đổi được 1 lần mỗi vòng`,
      async () => { await this.pickLotto(p); this.g.restoreActions(); });
    // Kỹ năng bật / tắt: đang tắt thì ô trong kho nền xám (vẫn bấm được để bật)
    add('ddS2', !jail, p.spin ? 'Đang bật: lương lần tới được quay' : 'Đang tắt: bấm để bật, lương lần tới được quay',
      () => this.toggleSpin(p), { off: !p.spin });
    const left = leftoverOffers(st, p).length;
    add('dcS1', !jail && usesLeft(p, 'dcS1') > 0 && left,
      usesLeft(p, 'dcS1') <= 0 ? wait('dcS1') : !left ? 'Chưa có ô nào người khác bỏ qua mà bạn đủ tiền mua'
        : `${left} ô mua được, ${Math.round(param(p, 'dcS1').price * 100)}% giá`,
      () => this.pickLeftover(p));
    const who = p.stake != null && !st.players[p.stake]?.bankrupt ? st.players[p.stake] : null;
    add('dcS2', !jail && (!who || !p.lapUses?.dcS2pick),
      !who ? 'Chưa góp vốn ai' : p.lapUses?.dcS2pick ? `Đang góp vốn với ${who.name} · đã đổi trong vòng này` : `Đang góp vốn với ${who.name}`,
      () => this.pickStake(p));
    const liens = forecloseOffers(st, p).length;
    add('dcV', !jail && usesLeft(p, 'dcV') > 0 && liens,
      usesLeft(p, 'dcV') <= 0 ? wait('dcV') : !liens ? 'Chưa có đất thế chấp nào của người khác mà bạn đủ tiền mua' : `${liens} ô đang thế chấp`,
      () => this.foreclose(p));
    add('cnS2', this.canSit(p),
      !jail ? 'Chỉ dùng khi đang ở tù' : this.canSit(p) ? `Ngồi Yên: còn ${this.sitsLeft(p)} lượt` : 'Đã ngồi yên đủ số lượt lần này',
      () => this.g.sitInJail());

    // Tự hỏi đúng lúc — chỉ để xem
    const auto = (id, text) => add(id, false, text);
    auto('dh2a', 'Tự hỏi khi bạn dừng ở bến xe / nhà ga');
    auto('dh3', usesLeft(p, 'dh3') > 0 ? `Tự hỏi sau khi lắc · còn ${usesLeft(p, 'dh3')} lần` : wait('dh3'));
    auto('dd3', usesLeft(p, 'dd3') > 0 ? `Tự hỏi sau khi lắc · còn ${usesLeft(p, 'dd3')} lần` : wait('dd3'));
    auto('dc3', ready(p, 'dc3') ? 'Tự hỏi khi bạn dừng trên đất chưa xây của người khác' : wait('dc3'));
    return out;
  }

  /** Kho kỹ năng: bấm một ô dùng được là chạy kỹ năng đó. */
  async openKit(p, rolled) {
    const acts = this.actives(p, rolled);
    const v = await openModal({
      eyebrow: 'Kỹ năng bấm để dùng',
      title: 'Dùng kỹ năng',
      wide: true,
      body: `<div class="kit">${acts.map((a, i) => {
        const s = skillById(a.id);
        return `<button type="button" class="kit-item${a.ready ? '' : ' off'}${a.off ? ' is-off' : ''}" data-i="${i}" ${a.ready ? '' : 'disabled'}
            style="--c:${SKILL_COLOR[s.branch]}">
          <span class="kit-ico">${skillIcon(s.icon)}</span>
          <span class="kit-text"><b>${s.name}</b><small>${a.status}</small></span>
        </button>`;
      }).join('')}</div>`,
      buttons: [{ label: 'Đóng', value: null, cls: 'btn-ghost' }],
      onMount: (body, close) => {
        body.querySelectorAll('.kit-item:not([disabled])').forEach((b) => b.addEventListener('click', () => close(Number(b.dataset.i))));
      },
    });
    const a = acts[v];
    if (a?.ready && a.run) await a.run();
    else this.g.restoreActions();
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
              ? `${named(p)} lên <b>khách sạn Di Sản</b> ở <b>${tileLabel(id)}</b> miễn phí, thuê ×${param(p, 'acU').mult}, không ai dỡ được.`
              : `${named(p)} được xây thêm 1 căn miễn phí ở <b>${tileLabel(id)}</b>.`, { ms: 3000 });
          await this.contractorNote(res.payouts);
          await this.g.spot([id], 1600);
        }
      }
    }
  }

  /**
   * Trạm Thu Phí BOT: vừa đi xong chuyến `from` → `from + steps`, mỗi chủ trạm
   * thu một lần cho mọi trạm của họ bị đi ngang. Chỉ thu trong số tiền mặt
   * đang có — xem ghi chú ở `dhV` trong data/skills.js.
   */
  async tolls(p, from, steps) {
    for (const { owner, tiles, amount } of tollStops(this.st, p, from, steps)) {
      const n = Math.min(amount, p.money);
      if (n <= 0 || p.bankrupt || owner.bankrupt) continue;
      await this.bc(title('dhV'),
        `${named(p)} đi ngang ${tiles.map((id) => `<b>${tileLabel(id)}</b>`).join(', ')},
         nộp phí cho ${named(owner)} <span class="down">${money(n)}</span>.`, { ms: 2000 });
      if (await this.g.payPlayer(p.id, owner.id, n)) credit(owner, 'dhV', n);
    }
  }

  /**
   * Bảo Hiểm Xã Hội: sắp phải trả `amount` mà tiền mặt không đủ thì ngân hàng
   * trả hộ phần thiếu (tối đa `cover`). Chạy trước hộp xoay tiền — bên gọi đọc
   * lại tiền mặt sau khi hàm này xong.
   */
  async insure(p, amount) {
    if (!ready(p, 'cnV') || p.money >= amount) return;
    const n = Math.min(amount - p.money, param(p, 'cnV').cover);
    spend(p, 'cnV');
    credit(p, 'cnV', n);
    await this.bc(title('cnV'), `${named(p)} thiếu tiền, bảo hiểm trả hộ <span class="up">${money(n)}</span>.`, { ms: 2400 });
    await this.g.receiveFromBank(p.id, n);
  }

  /**
   * Xổ Số Kiến Thiết: chọn một tổng 2–12. Mỗi nút ghi luôn tiền thưởng của số
   * đó để người chơi thấy số khó ra trả nhiều hơn. Esc hay hết giờ lượt thì
   * lấy 7 — số hay ra nhất, người không kịp chọn vẫn có tiền đều.
   */
  async pickLotto(p) {
    const change = p.lotto != null;
    let pick = p.lotto ?? 7;
    const nums = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const v = await openModal({
      eyebrow: `Kỹ năng · ${skillById('ddV').name}`,
      title: 'Chọn một tổng xí ngầu',
      body: `<div class="sk-bet">
        <div class="sk-bet-row sk-lotto" data-row="pick">
          ${nums.map((n) => `<button type="button" class="btn btn-ghost${n === pick ? ' on' : ''}" data-v="${n}">
            <b>${n}</b> · ${money(lottoPrize(p, n))}</button>`).join('')}
        </div>
        <p class="sk-bet-note">Mỗi lần người khác lắc ra đúng tổng này thì họ trả bạn số tiền ghi trên nút.
          Số càng khó ra trả càng nhiều; tính trung bình số nào cũng ngang nhau. Đổi số được một lần giữa hai lần qua ô Bắt Đầu.</p>
      </div>`,
      buttons: [
        { label: 'Chọn số này', value: true, cls: 'btn-gold' },
        ...(change ? [{ label: 'Giữ số cũ', value: false, cls: 'btn-ghost' }] : []),
      ],
      escValue: !change,
      onMount: (body) => {
        body.querySelectorAll('[data-row] button').forEach((b) => b.addEventListener('click', () => {
          body.querySelectorAll('[data-row] button').forEach((x) => x.classList.toggle('on', x === b));
          pick = Number(b.dataset.v);
        }));
      },
    });
    if (v === false) return;
    if (change && pick === p.lotto) return;
    p.lotto = pick;
    if (change) p.lapUses = { ...p.lapUses, ddVpick: 1 };
    this.g.sync();
    await this.bc(title('ddV'), `${named(p)} chọn số <b>${pick}</b>: ai lắc ra ${pick} trả <span class="up">${money(lottoPrize(p, pick))}</span>.`, { ms: 2200 });
  }

  /** Xổ Số: người vừa lắc ra số người khác đã chọn thì trả người đó. */
  async lottoHits(p, d) {
    for (const q of this.st.alive()) {
      if (q.id === p.id || !has(q, 'ddV') || q.lotto !== d.sum) continue;
      const n = Math.min(lottoPrize(q, d.sum), p.money);
      if (n <= 0 || p.bankrupt) continue;
      await this.bc(title('ddV'), `Ra ${d.sum}, trúng số của ${named(q)}: ${named(p)} trả <span class="down">${money(n)}</span>.`, { kind: 'trade', ms: 2200 });
      if (await this.g.payPlayer(p.id, q.id, n)) credit(q, 'ddV', n);
    }
  }

  /**
   * Siết Nợ: chọn một ô đang thế chấp của người khác trên bàn cờ, trả ngân
   * hàng số thế chấp và trả chủ cũ phần `premium`, rồi ô về tay mình, hết
   * thế chấp. Chưa trả đồng nào thì bỏ ngang không mất lượt dùng.
   */
  async foreclose(p) {
    const st = this.st;
    const offers = forecloseOffers(st, p);
    const byId = new Map(offers.map((x) => [x.id, x]));
    const id = await this.g.pickTile(offers.map((x) => x.id), {
      eyebrow: `Kỹ năng · ${skillById('dcV').name}`,
      title: 'Siết nợ ô nào?',
      sub: `Trả ngân hàng số tiền thế chấp và trả chủ cũ thêm ${pctText(param(p, 'dcV').premium)} số đó. Chủ cũ không được từ chối.`,
      confirm: 'Siết nợ ô này',
      owned: false,
      cancel: 'Thôi',
    }, this.g.events.localMs);
    const o = byId.get(id);
    const owner = o && st.ownerOf(id);
    if (!o || !owner || !st.isMortgaged(id) || st.current !== p) { this.g.restoreActions(); return; }
    spend(p, 'dcV');
    credit(p, 'dcV');
    await this.bc(title('dcV'),
      `${named(p)} siết nợ <b>${tileLabel(id)}</b> của ${named(owner)}: trả ngân hàng
       <span class="down">${money(o.bank)}</span>, trả ${named(owner)} <span class="down">${money(o.owner)}</span>.`,
      { kind: 'trade', ms: 3000 });
    if (!(await this.g.payBank(p.id, o.bank))) { this.g.restoreActions(); return; }
    if (o.owner > 0 && !(await this.g.payPlayer(p.id, owner.id, o.owner))) { this.g.restoreActions(); return; }
    // Chủ cũ có thể vừa phá sản trong lúc chờ — ô đã về ngân hàng thì thôi
    if (st.owner.get(id) === owner.id) {
      st.mortgaged.delete(id);
      st.transfer(id, p.id);
      audio.sfx('trade');
      this.g.hud.refresh();
      this.g.scene.refresh(st);
      this.g.sync();
      await this.g.spot([id]);
    }
    this.g.restoreActions();
  }

  /* ================================================================
     Kỹ năng nhánh phụ (cấp 3 'c' / 'd')
     ================================================================ */

  /** Xe Đạp: bấm trước khi lắc — tốn lượt dùng ngay lúc bấm, như Tất Tay. */
  async rideBike(p) {
    spend(p, 'dhS1');
    credit(p, 'dhS1');
    this.bike = { turnNo: this.st.turnNo, seat: p.id };
    this.g.sync();
    await this.bc(title('dhS1'), `${named(p)} đạp xe: lần lắc này chỉ đi theo viên nhỏ hơn.`, { ms: 1800 });
    this.g.restoreActions();
  }

  /**
   * Kết quả lắc sau Xe Đạp: tổng là viên nhỏ hơn, không tính đôi. Gọi ngay
   * sau khi lắc, trước mọi hộp hỏi khác, để Quay Đầu và bảng giá thuê đọc
   * đúng số ô sẽ đi. `d.bike` giữ lại dấu để lần lắc lại một viên (Xí Ngầu
   * Gian) vẫn tính theo viên nhỏ.
   */
  shape(p, d) {
    if (d.bike) return { ...d, sum: Math.min(d.a, d.b), isDouble: false };
    if (!this.pending(this.bike)) return d;
    this.bike = null;
    return { ...d, sum: Math.min(d.a, d.b), isDouble: false, bike: true };
  }

  /** Cò Quay Lương: bật / tắt, giữ tới khi tắt. */
  async toggleSpin(p) {
    p.spin = !p.spin;
    this.g.sync();
    await this.bc(title('ddS2'), `${named(p)} ${p.spin ? 'bật' : 'tắt'} Cò Quay Lương.`, { ms: 1500 });
    this.g.restoreActions();
  }

  /**
   * Lương vừa tính xong mà Cò Quay đang bật: quay gấp đôi hoặc một nửa.
   * @returns {{pay:number, note:string}}
   */
  spinPay(p, pay) {
    if (!has(p, 'ddS2') || !p.spin) return { pay, note: '' };
    const win = Math.random() < param(p, 'ddS2').win;
    const out = win ? pay * 2 : Math.round(pay / 2);
    credit(p, 'ddS2', Math.max(0, out - pay));
    return { pay: out, note: win ? ' · <b>Cò Quay trúng, lương ×2</b>' : ' · <b>Cò Quay trượt, lương còn một nửa</b>' };
  }

  /** Nhặt Hàng Thừa: sáng các ô người khác bỏ qua, chọn một ô để mua. */
  async pickLeftover(p) {
    const st = this.st;
    const offers = new Map(leftoverOffers(st, p).map((x) => [x.id, x]));
    const pct = Math.round(param(p, 'dcS1').price * 100);
    const id = await this.g.pickTile([...offers.keys()], {
      eyebrow: `Kỹ năng · ${skillById('dcS1').name}`,
      title: 'Nhặt ô nào?',
      sub: `Các ô sáng là ô chưa có chủ mà người khác đã dừng rồi bỏ qua. Mua với ${pct}% giá gốc.`,
      confirm: 'Mua ô này',
      owned: false,
      cancel: 'Thôi',
    }, this.g.events.localMs);
    const o = offers.get(id);
    if (!o || st.owner.has(id) || st.current !== p || p.money < o.price) { this.g.restoreActions(); return; }
    spend(p, 'dcS1');
    credit(p, 'dcS1');
    st.buyAt(p.id, id, o.price);
    audio.sfx('buy');
    this.g.hud.refresh();
    this.g.scene.refresh(st);
    this.g.sync();
    await this.bc(title('dcS1'), `${named(p)} nhặt <b>${tileLabel(id)}</b> với giá <span class="down">${money(o.price)}</span> (${pct}% giá gốc).`, { ms: 2400 });
    await this.g.spot([id]);
    await this.brokerFees(p.id, id);
    this.g.restoreActions();
  }

  /**
   * Góp Vốn: chọn người để hưởng một phần tiền thuê họ thu. Danh sách chip
   * màu quân, chọn một người thì những người còn lại xám đi; phải bấm Chốt
   * mới đổi, nên lỡ tay chọn nhầm vẫn huỷ được.
   */
  async pickStake(p) {
    const st = this.st;
    const others = st.alive().filter((q) => q.id !== p.id);
    const change = p.stake != null && !st.players[p.stake]?.bankrupt;
    let pick = change ? p.stake : null;
    const lots = (q) => st.propertiesOf(q.id).length;
    const v = await openModal({
      eyebrow: `Kỹ năng · ${skillById('dcS2').name}`,
      title: 'Góp vốn với ai?',
      body: `<div class="sk-ask">
        <p>Mỗi lần người bạn chọn thu tiền thuê, ngân hàng trả bạn <b>${pctText(param(p, 'dcS2').share)}</b> số tiền ấy. Người đó không mất gì.</p>
        ${change ? '<p>Đổi người thì tới lần qua ô Bắt Đầu sau mới đổi được nữa.</p>' : ''}
        <div class="stake-list${pick != null ? ' has-pick' : ''}" role="radiogroup">
          ${others.map((q) => `<label class="stake-chip${q.id === pick ? ' on' : ''}" style="--pc:${q.token.css}">
            <input type="radio" name="stake" value="${q.id}" ${q.id === pick ? 'checked' : ''}>
            <span class="stake-dot"></span>
            <span class="stake-name">${q.name}</span>
            <span class="stake-meta">${lots(q)} ô · ${money(q.money)}</span>
          </label>`).join('')}
        </div>
      </div>`,
      buttons: [
        { label: 'Chốt', value: true, cls: 'btn-gold' },
        { label: 'Huỷ', value: false, cls: 'btn-ghost' },
      ],
      escValue: false,
      onMount: (body) => {
        const list = body.querySelector('.stake-list');
        const ok = body.closest('.modal')?.querySelector('.modal-foot .btn-gold');
        if (ok) ok.disabled = pick == null;
        list.querySelectorAll('input').forEach((r) => r.addEventListener('change', () => {
          pick = Number(r.value);
          list.classList.add('has-pick');
          list.querySelectorAll('.stake-chip').forEach((c) => c.classList.toggle('on', c.contains(r)));
          if (ok) ok.disabled = false;
        }));
      },
    });
    if (v && pick != null && pick !== p.stake && !st.players[pick]?.bankrupt) {
      p.stake = pick;
      if (change) p.lapUses = { ...p.lapUses, dcS2pick: 1 };
      this.g.sync();
      await this.bc(title('dcS2'), `${named(p)} góp vốn với ${named(st.players[pick])}.`, { ms: 2000 });
    }
    this.g.restoreActions();
  }

  /** Góp Vốn: chủ đất vừa thu `amount` tiền thuê — ai góp vốn với họ nhận phần của mình. */
  async stakeShare(owner, amount) {
    for (const q of this.st.alive()) {
      if (q.id === owner.id || !has(q, 'dcS2') || q.stake !== owner.id) continue;
      const n = Math.round(amount * param(q, 'dcS2').share);
      if (n <= 0) continue;
      credit(q, 'dcS2', n);
      await this.bc(title('dcS2'), `${named(q)} hưởng phần góp vốn <span class="up">${money(n)}</span>.`, { ms: 1700 });
      await this.g.receiveFromBank(q.id, n);
    }
  }

  /** Dẫn Tour: mỗi người bị đi vượt qua trả phí, trong số tiền mặt họ đang có. */
  async tours(p, from, steps) {
    const passed = tourPassed(this.st, p, from, steps);
    if (!passed.length) return;
    const fee = param(p, 'dhS2').fee;
    for (const q of passed) {
      const n = Math.min(fee, q.money);
      if (n <= 0 || q.bankrupt || p.bankrupt) continue;
      await this.bc(title('dhS2'), `${named(p)} dẫn tour vượt qua ${named(q)}, thu <span class="up">${money(n)}</span>.`, { ms: 1700 });
      if (await this.g.payPlayer(q.id, p.id, n)) credit(p, 'dhS2', n);
    }
  }

  /**
   * Rút thẻ Cơ Hội / Khí Vận. Có Bài Tẩy thì rút nhiều lá, người đang đi chọn
   * một lá; mấy lá còn lại chen về chồng ở chỗ ngẫu nhiên. Hộp chọn chỉ hiện
   * cho chính người đang đi, trong lượt của họ.
   * @returns {Promise<?{index:number, card:object}>}
   */
  async drawCard(p, kind, usable) {
    const deck = this.st.decks[kind];
    const lv = has(p, 'ddS1') ? param(p, 'ddS1') : null;
    const n = lv && (kind === 'chance' || lv.chest) ? lv.draw : 1;
    const hand = [];
    for (let i = 0; i < n; i++) {
      const d = deck.draw(usable);
      if (!d || hand.some((h) => h.index === d.index)) break;
      hand.push(d);
    }
    if (hand.length < 2) return hand[0] ?? null;
    const v = await this.chooseCard(p, kind, hand.map((h) => h.card));
    const pick = hand[v] ?? hand[0];
    for (const h of hand) {
      if (h !== pick) deck.pile.splice(Math.floor(Math.random() * (deck.pile.length + 1)), 0, h.index);
    }
    credit(p, 'ddS1');
    return pick;
  }

  /**
   * Bài Tẩy: bày các lá rút được thành hàng ngang, mỗi lá một khung viền màu
   * theo hạng (cùng bảng hạng với băng chuyền bóc thẻ), bấm lá nào là chọn lá
   * đó. Esc hay hết giờ lượt thì lấy lá đầu.
   * @returns {Promise<number>} chỉ số lá đã chọn
   */
  chooseCard(p, kind, cards) {
    const deck = DECK_META[kind];
    const face = (c, i) => {
      const r = RANKS[rankOf(kind, c)];
      const sigil = CARD_KINDS[c.type]?.sigil ?? deck.sigil;
      const flavor = isKeepable(c) ? cardEffect(c) : c.text;
      // Thẻ tiền: nhãn đã ghi số tiền, dòng dưới chỉ nói ai trả; nhãn xanh là nhận, đỏ là nộp
      const bank = (c.type ?? 'bank') === 'bank';
      const does = bank ? (c.amount > 0 ? 'Ngân hàng trả bạn' : 'Nộp cho ngân hàng') : this.cardDoes(p, c);
      const tone = bank ? (c.amount > 0 ? ' up' : ' down') : '';
      return `<button type="button" class="hand-card" data-i="${i}" style="--r:${r.color};--d:${deck.accent}">
        <span class="hand-deck">${deck.sigil} ${deck.title}</span>
        <span class="hand-sigil">${sigil}</span>
        <b class="hand-label${tone}">${shortLabel(kind, c)}</b>
        <span class="hand-does">${does}</span>
        <span class="hand-flavor">${flavor}</span>
        <span class="hand-rank">Hạng ${r.name}</span>
      </button>`;
    };
    return openModal({
      eyebrow: `Kỹ năng · ${skillById('ddS1').name}`,
      title: `Chọn một lá ${kind === 'chance' ? 'Cơ Hội' : 'Khí Vận'}`,
      sub: 'Bấm vào lá muốn dùng. Lá không chọn được xáo về bộ.',
      wide: true,
      body: `<div class="hand">${cards.map(face).join('')}</div>`,
      buttons: [],
      escValue: 0,
      onMount: (body, close) => {
        body.querySelectorAll('.hand-card').forEach((b) => b.addEventListener('click', () => close(Number(b.dataset.i))));
      },
    });
  }

  /**
   * Một dòng nói lá bài làm gì **với người này, ở chỗ này** — câu văn trên mặt
   * thẻ chỉ là bối cảnh, chọn bài phải nhìn được số tiền và ô đích.
   */
  cardDoes(p, card) {
    if (isKeepable(card)) return 'Cất vào túi, dùng sau';
    switch (cardType(card)) {
      case 'collect': return `Tiền mừng ${money(card.amount)}, cả bàn chia nhau góp`;
      case 'repair': return `Thuế nhà cửa: bạn nộp ${money(repairBill(this.st, p.id, card).amount)}`;
      case 'move': {
        if (card.jail) return 'Vào tù';
        const dest = moveDest(card, p.pos);
        return card.back ? `Lùi ${-dest.steps} ô tới ${tileLabel(dest.tile)}` : `Đi tới ${tileLabel(dest.tile)}`;
      }
      default: return card.amount > 0 ? `Nhận ${money(card.amount)}` : `Nộp ${money(-card.amount)}`;
    }
  }

  /**
   * Bảo Hộ Lao Động: thẻ bất lợi thì có lúc được bỏ qua.
   * @returns {Promise<boolean>} true nếu bỏ qua — bên gọi không chạy thẻ
   */
  async dodgeCard(p, card) {
    if (!has(p, 'cnS1')) return false;
    const t = cardType(card);
    const bad = (t === 'bank' && card.amount < 0) || t === 'repair' || (t === 'move' && (card.jail || card.back));
    if (!bad || Math.random() >= param(p, 'cnS1').chance) return false;
    credit(p, 'cnS1');
    await this.bc(title('cnS1'), `${named(p)} rút phải thẻ xấu, <b>Bảo Hộ Lao Động</b> cho bỏ qua: “${card.text}”.`, { ms: 2600 });
    return true;
  }

  /**
   * Bảo Hộ Lao Động: thẻ ngân hàng trả tiền thì nhận thêm.
   * @returns {number} số tiền thêm (0 nếu không có kỹ năng)
   */
  cardBonus(p, amount) {
    if (!has(p, 'cnS1') || amount <= 0) return 0;
    const n = Math.round(amount * param(p, 'cnS1').bonus);
    credit(p, 'cnS1', n);
    return n;
  }

  /** Ở Tù Cho Lành: lương mỗi lượt ở trong tù, trả một lần mỗi lượt. */
  async jailWage(p) {
    if (!has(p, 'cnS2') || !p.inJail || p.usedTurn?.cnS2 === this.st.turnNo) return;
    p.usedTurn = { ...p.usedTurn, cnS2: this.st.turnNo };
    const n = param(p, 'cnS2').pay;
    credit(p, 'cnS2', n);
    await this.bc(title('cnS2'), `${named(p)} lãnh <span class="up">${money(n)}</span> tiền công trong tù.`, { ms: 1600 });
    await this.g.receiveFromBank(p.id, n);
  }

  /** Còn ngồi yên được không (nút Ngồi Yên trong tù). */
  canSit(p) { return has(p, 'cnS2') && p.inJail && (p.jailSits ?? 0) < param(p, 'cnS2').stay; }
  sitsLeft(p) { return param(p, 'cnS2').stay - (p.jailSits ?? 0); }
  icon(name) { return skillIcon(name, 'ai'); }

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
  cutNote(p) { return has(p, 'cn2b') ? ', đã giảm nhờ <b>Công Đoàn</b>' : ''; }

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
    if (has(p, 'acX1') && p.money < param(p, 'acX1').under) cutBy('acX1', param(p, 'acX1').pay);
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
    if (b.late) bits.push(`gồm <b>${money(b.late)}</b> tiền thêm của <b>Chủ Nợ</b> vì đang có ô thế chấp`);
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
    if (has(p, 'dhX1')) {
      const rich = others.reduce((a, b) => (b.money > a.money ? b : a));
      await this.pickpocket(p, rich);
    }
    // Người đang đứng ở ô này có Hai Ngón: móc túi người vừa dừng lên
    for (const q of others) {
      if (!p.bankrupt && has(q, 'dhX1')) await this.pickpocket(q, p);
    }
  }

  /** Hai Ngón: `thief` có lúc lấy một phần tiền mặt của `mark`, trong số tiền họ đang có. */
  async pickpocket(thief, mark) {
    const { chance, pct, cap } = rolled(thief, 'dhX1');
    if (Math.random() >= chance) return;
    const n = Math.min(cap, Math.floor(mark.money * pct));
    if (n <= 0) return;
    await this.bc(title('dhX1'), `${named(thief)} móc túi ${named(mark)} được <span class="up">${money(n)}</span>.`, { kind: 'trade', ms: 2200 });
    if (await this.g.payPlayer(mark.id, thief.id, n)) credit(thief, 'dhX1', n);
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
          title: `Lắc ra ${d.a} + ${d.b}${d.bike ? `, đạp xe ${d.sum} ô` : ` = ${d.sum}`}: đi tới hay đi lùi?`,
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
          body: `<p>Lắc ra <b>${d.a} + ${d.b}</b>${d.bike ? `, đạp xe đi <b>${d.sum}</b> ô` : ` = <b>${d.sum}</b>`}.</p>
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
        d = this.shape(p, { a, b, sum: a + b, isDouble: a === b, bike: d.bike });
        this.g.netEmit('dice', d);
        await this.g.scene.rollDiceAnim(d.a, d.b);
        await this.bc(title('dd3'), `${named(p)} lắc lại một viên, giờ là <b>${d.a} + ${d.b}</b>${
          d.bike ? `, đạp xe đi <b>${d.sum}</b> ô` : ` = <b>${d.sum}</b>`}.`, { ms: 2000 });
        continue;
      }
      return { d, back: false };
    }
  }

  /** Một dòng tóm tắt ô đích cho hộp hỏi: của ai, thuê bao nhiêu. */
  tileInfo(p, id, d) {
    const owner = this.st.ownerOf(id);
    if (!BOARD[id].ownable) return '';
    if (!owner) return ' · còn trống';
    if (owner.id === p.id) return ' · đất của bạn';
    return ` · của ${owner.name}, thuê ${money(this.rent(p, id, d))}`;
  }

  /** Chẵn Lẻ, Đôi Hên, Phượt Thủ: cộng trừ theo kết quả lắc; rồi Xổ Số của người khác. */
  async rollPerks(p, d) {
    await this.lottoHits(p, d);
    if (p.bankrupt) return;
    if (has(p, 'dd1')) {
      const { even, odd } = rolled(p, 'dd1');
      if (d.sum % 2 === 0) {
        credit(p, 'dd1', even);
        await this.bc(title('dd1'), `Tổng chẵn: ${named(p)} <span class="up">+${money(even)}</span>.`, { ms: 1600 });
        await this.g.receiveFromBank(p.id, even);
      } else {
        if (odd > 0) {
          await this.bc(title('dd1'), `Tổng lẻ: ${named(p)} <span class="down">−${money(odd)}</span>.`, { ms: 1600 });
          await this.g.payBank(p.id, odd);
        }
      }
    }
    if (d.isDouble && has(p, 'dd2b') && (p.doubles ?? 0) < 3) {
      const n = roll(param(p, 'dd2b').double);
      credit(p, 'dd2b', n);
      await this.bc(title('dd2b'), `${named(p)} ra đôi: <span class="up">+${money(n)}</span>.`, { ms: 1600 });
      await this.g.receiveFromBank(p.id, n);
    }
    if (d.sum >= 10 && has(p, 'dhX2') && !p.bankrupt) {
      const n = roll(param(p, 'dhX2').bonus);
      credit(p, 'dhX2', n);
      await this.bc(title('dhX2'), `Lắc ra ${d.sum}: ${named(p)} <span class="up">+${money(n)}</span>.`, { ms: 1600 });
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
      `${named(p)} ra đôi lần thứ ba, không vào tù mà trúng <span class="up">${money(n)}</span>. Hết lượt.`,
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
          ? ` Tài/Xỉu đúng: được thêm ${pctText(param(p, 'ddX1').payout)}; ra 7 thì cả hai cửa thua.` : ''}
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
        await this.bc(title(txu ? 'ddX1' : 'dd2a'), `Ra ${d.sum}: ${named(p)} đoán đúng cửa ${PARITY_NAME[bet.pick]}, <span class="up">+${money(n)}</span>.`, { ms: 2200 });
        await this.g.receiveFromBank(p.id, n);
      } else {
        credit(p, 'dd2a');
        bumpFeat(p, 'betLose', bet.amount);
        await this.bc(title('dd2a'), `Ra ${d.sum}: ${named(p)} đoán sai cửa ${PARITY_NAME[bet.pick]}, mất <span class="down">${money(bet.amount)}</span> vào Quỹ Công.`, { kind: 'bad', ms: 2200 });
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
        await this.bc(title('ddU'), `Ra ${d.sum}: ${named(p)} thắng! Mỗi người trả ${Math.round(win * 100)}% tiền mặt.`, { kind: 'trade', ms: 2800 });
        for (const q of others) {
          const n = Math.floor(q.money * win);
          if (n > 0 && !q.bankrupt) await this.g.payPlayer(q.id, p.id, n);
        }
      } else {
        const each = Math.floor(p.money * lose);
        await this.bc(title('ddU'), `Ra ${d.sum}: ${named(p)} thua, trả mỗi người <span class="down">${money(each)}</span>.`, { kind: 'bad', ms: 2800 });
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
