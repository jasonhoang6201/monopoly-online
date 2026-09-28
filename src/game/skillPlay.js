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
  tourPassed, leftoverOffers, isOff, setSkillOn, learnSkill, switchable,
} from '../core/skills.js';
import { cardType, isKeepable, moveDest, repairBill } from '../core/cards.js';
import { cardName, cardEffect, CARD_KINDS, DECK_META } from '../data/cards.js';
import { RANKS, rankOf, shortLabel } from '../ui/caseOpen.js';
import { SKILLS, BRANCHES } from '../data/skills.js';
import { openModal } from '../ui/modal.js';
import { openSkillTree, refreshSkillTree } from '../ui/skillTree.js';
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
    /** Hộp cây kỹ năng đang mở trên máy này — chặn mở chồng hai hộp. */
    this.treeOpen = false;
    /**
     * Ô học ngoài lượt đã gửi cho máy cầm lái mà ảnh chụp chưa có.
     * @type {Array<{id:string, level:number, sent:number, t0:number}>}
     */
    this.learnPending = [];
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
    const offs = p.skills.filter((id) => isOff(p, id)).length;
    const out = [{
      label: 'Kỹ năng', key: 'k', half: true,
      cls: p.skillPoints > 0 ? 'btn-gold' : 'btn-ghost',
      icon: skillIcon('root', 'ai'),
      hint: p.skillPoints > 0 ? `${p.skillPoints} điểm chưa dùng` : `đã học ${p.skills.length}`,
      title: 'Mở cây kỹ năng: học kỹ năng mới, bật / tắt kỹ năng đã học',
      onClick: () => this.g.guard(() => this.openTree(p)),
    }];
    // Nút kho luôn đứng cạnh nút cây; chưa học kỹ năng kích hoạt nào thì tối lại
    const cells = this.kitCells(p, rolled);
    const on = cells.filter((c) => c.switch && !isOff(p, c.id)).length;
    const n = cells.filter((c) => c.ok).length;
    out.push({
      label: 'Dùng kỹ năng', key: 'u', half: true,
      cls: n && (offs || cells.some((c) => c.act)) ? 'btn-gold' : 'btn-ghost',
      disabled: !cells.length,
      icon: skillIcon('chip', 'ai'),
      hint: !cells.length ? 'chưa học kỹ năng kích hoạt'
        : `${on} bật${offs ? ` · ${offs} tắt` : ''}`,
      title: 'Mở kho kỹ năng: bật / tắt, chọn cửa cược, chọn ô',
      onClick: () => this.g.guard(() => this.openKit(p, rolled)),
    });
    return out;
  }

  /**
   * Các ô của kho kỹ năng. Ba kiểu ô:
   *
   * - bật / tắt (`switch`, không có `choose`): bấm là đổi màu trong bản nháp.
   *   Gồm kỹ năng tự hỏi đúng lúc (Tàu Tốc Hành, Quay Đầu…), Cò Quay, Xe Đạp.
   * - có bảng chọn (`choose`): bấm mở bảng, trong bảng có lựa chọn "Không"
   *   là tắt. Chọn xong về lại kho. Cược, Xổ Số, Góp Vốn giữ lựa chọn và tự
   *   làm lại mỗi lượt; Tất Tay, Mua Lại, Siết Nợ, Xuyên Việt (`once`) làm
   *   một lần ngay lúc Chốt.
   * - việc làm ngay (`act`, kỹ năng nội tại như Ngồi Yên): bấm là chốt bản
   *   nháp rồi làm luôn.
   *
   * `ok` là bấm được lúc này; không được thì `why` nói lý do. Ô đang tắt vẫn
   * phải ghi đúng tình trạng như lúc bật (còn mấy lần, chờ bao lâu), mà
   * ready / usesLeft đều đi qua has(), coi kỹ năng tắt là chưa học — nên tính
   * trên danh sách tắt rỗng rồi trả lại. Chạy đồng bộ, không ai đọc `p` ở giữa.
   */
  kitCells(p, rolled) {
    const offs = p.skillOff;
    p.skillOff = [];
    try { return this.listCells(p, rolled); } finally { p.skillOff = offs; }
  }

  listCells(p, rolled) {
    const st = this.st;
    const out = [];
    const jail = p.inJail;
    const wait = (id) => `Chờ ${p.cooldowns[id]} lần qua ô Bắt Đầu`;
    const beforeRoll = rolled ? 'Chỉ dùng trước khi lắc' : jail ? 'Không dùng khi đang ở tù' : '';
    const cell = (id, o) => { if (has(p, id)) out.push({ id, switch: switchable(skillById(id)), ok: true, ...o }); };
    const left = (id) => `còn ${usesLeft(p, id)} lần tới lần qua ô Bắt Đầu`;
    // Bật / tắt: kỹ năng có lượt dùng đang chờ hồi thì không bật được
    const toggle = (id, on, extra = '') => cell(id, ready(p, id)
      ? { on, off: 'Bấm để bật' + extra }
      : { ok: false, why: wait(id) });

    const bet = this.pending(this.bet);
    cell('dd2a', {
      on: (v) => (v ? `Tự cược ${PARITY_NAME[v.pick]} ${money(v.amount)} mỗi lượt, lúc bấm Lắc` : 'Bật nhưng chưa chọn cửa'),
      off: 'Bấm để chọn cửa và tiền cược',
      note: bet ? `Lượt này đã cược ${PARITY_NAME[bet.pick]} ${money(bet.amount)}` : '',
      val: p.betSet ?? null,
      choose: (v) => this.chooseBet(p, v),
    });
    const all = this.pending(this.allIn);
    cell('ddU', all ? { ok: false, why: `Đã tất tay cửa ${PARITY_NAME[all.pick]}` }
      : !ready(p, 'ddU') ? { ok: false, why: wait('ddU') }
        : beforeRoll ? { ok: false, why: beforeRoll }
          : { once: true, on: (v) => `Tất tay cửa ${PARITY_NAME[v]} khi Chốt`, off: 'Bấm để chọn cửa, đoán với cả bàn',
            choose: () => this.chooseAllIn(p) });
    cell('dhU', !ready(p, 'dhU') ? { ok: false, why: wait('dhU') }
      : beforeRoll ? { ok: false, why: beforeRoll }
        : { once: true, on: (v) => `Đi tới ${tileLabel(v)} khi Chốt, thay cho lượt lắc`, off: 'Bấm để chọn ô, thay cho lượt lắc',
          choose: () => this.chooseTile(p, 'dhU') });
    toggle('dhS1', () => `Tự đạp xe mỗi lần lắc, ${left('dhS1')}`, `: tự đạp xe mỗi lần lắc, ${left('dhS1')}`);
    cell('ddV', {
      on: (v) => (v != null ? `Số ${v} · trúng ${money(lottoPrize(p, v))}` : 'Bật nhưng chưa chọn số'),
      off: 'Bấm để chọn số',
      note: p.lapUses?.ddVpick ? 'Đã đổi số trong vòng này' : '',
      val: p.lotto,
      choose: (v) => this.chooseLotto(p, v),
    });
    toggle('ddS2', () => 'Lương lần tới được quay', ': lương lần tới được quay');
    const offers = leftoverOffers(st, p).length;
    cell('dcS1', usesLeft(p, 'dcS1') <= 0 ? { ok: false, why: wait('dcS1') }
      : jail ? { ok: false, why: 'Không dùng khi đang ở tù' }
        : !offers ? { ok: false, why: 'Chưa có ô nào người khác bỏ qua mà bạn đủ tiền mua' }
          : { once: true, on: (v) => `Mua ${tileLabel(v)} khi Chốt`,
            off: `${offers} ô mua được, ${Math.round(param(p, 'dcS1').price * 100)}% giá`,
            choose: () => this.chooseTile(p, 'dcS1') });
    const who = (v) => (v != null && !st.players[v]?.bankrupt ? st.players[v] : null);
    cell('dcS2', {
      on: (v) => (who(v) ? `Đang góp vốn với ${who(v).name}` : 'Bật nhưng chưa chọn người'),
      off: 'Bấm để chọn người góp vốn',
      note: p.lapUses?.dcS2pick ? 'Đã đổi người trong vòng này' : '',
      val: who(p.stake) ? p.stake : null,
      choose: (v) => this.chooseStake(p, v),
    });
    const liens = forecloseOffers(st, p).length;
    cell('dcV', usesLeft(p, 'dcV') <= 0 ? { ok: false, why: wait('dcV') }
      : jail ? { ok: false, why: 'Không dùng khi đang ở tù' }
        : !liens ? { ok: false, why: 'Chưa có đất thế chấp nào của người khác mà bạn đủ tiền mua' }
          : { once: true, on: (v) => `Siết nợ ${tileLabel(v)} khi Chốt`, off: `${liens} ô đang thế chấp`,
            choose: () => this.chooseTile(p, 'dcV') });
    cell('cnS2', this.canSit(p)
      ? { act: () => this.g.sitInJail(), on: () => `Bấm để ngồi yên, còn ${this.sitsLeft(p)} lượt` }
      : { ok: false, why: !jail ? 'Chỉ dùng khi đang ở tù' : 'Đã ngồi yên đủ số lượt lần này' });

    // Tự hỏi đúng lúc: chỉ bật / tắt
    toggle('dh2a', () => 'Tự hỏi khi bạn dừng ở bến xe / nhà ga');
    toggle('dh3', () => `Tự hỏi sau khi lắc, ${left('dh3')}`);
    toggle('dd3', () => `Tự hỏi sau khi lắc, ${left('dd3')}`);
    toggle('dc3', () => 'Tự hỏi khi bạn dừng trên đất chưa xây của người khác');
    return out;
  }

  /**
   * Kho kỹ năng. Ô có màu là bật, xám là tắt. Mọi thao tác trong hộp chỉ đổi
   * bản nháp; Chốt (hoặc Enter) mới áp dụng một lần và loan tin một lần, Huỷ
   * (hoặc Esc) đóng hộp không đổi gì. Bảng chọn mở từ một ô cũng chỉ ghi vào
   * bản nháp rồi trả về kho.
   */
  async openKit(p, rolled) {
    const cells = this.kitCells(p, rolled);
    // Bản nháp: id → { on, val }. Ô `once` luôn bắt đầu chưa chọn gì.
    const draft = new Map(cells.map((c) => [c.id, {
      on: c.switch ? !isOff(p, c.id) && !c.once : true,
      val: c.once ? null : c.val,
    }]));
    const text = (c) => {
      if (!c.ok) return c.why;
      const d = draft.get(c.id);
      const s = d.on ? (typeof c.on === 'function' ? c.on(d.val) : '') : c.off;
      return c.note ? `${s} · ${c.note}` : s;
    };
    const lit = (c) => c.ok && draft.get(c.id).on;
    let act = null;
    const v = await openModal({
      eyebrow: 'Kỹ năng kích hoạt',
      title: 'Dùng kỹ năng',
      sub: 'Ô có màu là bật, xám là tắt. Bấm Chốt để áp dụng.',
      wide: true,
      body: `<div class="kit">${cells.map((c, i) => {
        const s = skillById(c.id);
        return `<button type="button" class="kit-item${lit(c) ? '' : ' is-off'}" data-i="${i}" ${c.ok ? '' : 'disabled'}
            aria-pressed="${lit(c)}" style="--c:${SKILL_COLOR[s.branch]}">
          <span class="kit-ico">${skillIcon(s.icon)}</span>
          <span class="kit-text"><b>${s.name}</b><small>${text(c)}</small></span>
        </button>`;
      }).join('')}</div>`,
      buttons: [
        { label: 'Chốt', value: 'apply', cls: 'btn-gold' },
        { label: 'Huỷ', value: null, cls: 'btn-ghost' },
      ],
      onMount: (body, close, _m, _f, stash) => {
        let busy = false;
        body.querySelectorAll('.kit-item:not([disabled])').forEach((b) => b.addEventListener('click', async () => {
          if (busy) return;
          const c = cells[Number(b.dataset.i)];
          const d = draft.get(c.id);
          if (c.act) { act = c.act; close('apply'); return; }
          if (c.choose) {
            busy = true;
            stash(true);
            const r = await c.choose(d.val).finally(() => stash(false));
            busy = false;
            if (r === undefined) return;
            draft.set(c.id, r);
          } else {
            draft.set(c.id, { ...d, on: !d.on });
            audio.sfx('click');
          }
          b.classList.toggle('is-off', !lit(c));
          b.setAttribute('aria-pressed', String(lit(c)));
          b.querySelector('small').innerHTML = text(c);
        }));
      },
    });
    if (v !== 'apply') { this.g.restoreActions(); return; }
    await this.applyKit(p, cells, draft);
    if (this.st.current !== p || p.bankrupt || this.st.over) return;
    if (act) { await act(); return; }
    // Xuyên Việt thay cho lượt lắc: đi xong thì tự bày lại thanh nút sau-lắc
    const tele = cells.find((c) => c.id === 'dhU' && c.ok && draft.get('dhU').on && draft.get('dhU').val != null);
    if (tele) { await this.doTeleport(p, draft.get('dhU').val); return; }
    this.g.restoreActions();
  }

  /**
   * Áp dụng bản nháp của kho: công tắc, lựa chọn giữ lâu (Cược, Xổ Số, Góp
   * Vốn), rồi các việc làm một lần. Loan tin phần công tắc và lựa chọn một
   * lần; mỗi việc làm một lần tự loan tin của nó. Xuyên Việt để `openKit` chạy
   * sau cùng vì nó dời quân và có thể hết lượt.
   */
  async applyKit(p, cells, draft) {
    const st = this.st;
    const res = { on: [], off: [], notes: [] };
    const once = [];
    for (const c of cells) {
      if (!c.ok || c.act) continue;
      const { on, val } = draft.get(c.id);
      if (c.once) {
        if (on && val != null) once.push([c.id, val]);
        continue;
      }
      if (setSkillOn(p, c.id, on)) res[on ? 'on' : 'off'].push(c.id);
      if (!on) continue;
      if (c.id === 'dd2a' && val && (p.betSet?.pick !== val.pick || p.betSet?.amount !== val.amount)) {
        p.betSet = { ...val };
        res.notes.push(`Cược Chẵn Lẻ: tự cược ${PARITY_NAME[val.pick]} ${money(val.amount)} mỗi lượt.`);
      }
      if (c.id === 'ddV' && val != null && val !== p.lotto) {
        if (p.lotto != null) p.lapUses = { ...p.lapUses, ddVpick: 1 };
        p.lotto = val;
        res.notes.push(`Xổ Số: chọn số <b>${val}</b>, ai lắc ra ${val} trả <span class="up">${money(lottoPrize(p, val))}</span>.`);
      }
      if (c.id === 'dcS2' && val != null && val !== p.stake && !st.players[val]?.bankrupt) {
        if (p.stake != null && !st.players[p.stake]?.bankrupt) p.lapUses = { ...p.lapUses, dcS2pick: 1 };
        p.stake = val;
        res.notes.push(`Góp vốn với ${named(st.players[val])}.`);
      }
    }
    const changed = res.on.length || res.off.length || res.notes.length;
    if (changed) {
      audio.sfx('build');
      this.g.hud.refresh();
      this.g.scene.refresh(st);
      this.g.refreshSkillBtn();
      this.g.sync();
      const names = (ids) => ids.map((id) => `<b>${skillById(id).name}</b>`).join(', ');
      const lines = [];
      if (res.on.length) lines.push(`Bật: ${names(res.on)}.`);
      if (res.off.length) lines.push(`Tắt: ${names(res.off)}.`);
      await this.bc('KỸ NĂNG', `${named(p)}<br>${[...lines, ...res.notes].join('<br>')}`, { ms: 2200 });
    }
    for (const [id, val] of once) {
      if (st.current !== p || p.bankrupt || st.over) return;
      if (id === 'ddU') await this.doAllIn(p, val);
      if (id === 'dcS1') await this.doLeftover(p, val);
      if (id === 'dcV') await this.doForeclose(p, val);
    }
  }

  /**
   * Trước khi lắc: đặt những gì đang bật để tự làm mỗi lần lắc. Cược mỗi lượt
   * một lần (đổ đôi lắc lại không cược thêm); thiếu tiền thì bỏ lượt này,
   * không tắt. Xe Đạp đạp mỗi lượt một lần tới khi hết lượt dùng.
   */
  async beforeRoll(p) {
    const st = this.st;
    const set = p.betSet;
    if (has(p, 'dd2a') && set && p.usedTurn?.dd2a !== st.turnNo && !this.pending(this.bet)) {
      p.usedTurn = { ...p.usedTurn, dd2a: st.turnNo };
      if (p.money >= set.amount) {
        this.bet = { turnNo: st.turnNo, seat: p.id, pick: set.pick, amount: set.amount };
        this.g.sync();
        await this.bc(title('dd2a'), `${named(p)} cược <b>${money(set.amount)}</b> vào cửa <b>${PARITY_NAME[set.pick]}</b>.`, { ms: 1800 });
      } else {
        await this.bc(title('dd2a'), `${named(p)} không đủ ${money(set.amount)} để cược, lượt này bỏ qua.`, { kind: 'bad', ms: 1800 });
      }
    }
    if (has(p, 'dhS1') && usesLeft(p, 'dhS1') > 0 && !this.pending(this.bike) && p.usedTurn?.dhS1 !== st.turnNo) {
      p.usedTurn = { ...p.usedTurn, dhS1: st.turnNo };
      spend(p, 'dhS1');
      credit(p, 'dhS1');
      this.bike = { turnNo: st.turnNo, seat: p.id };
      this.g.sync();
      await this.bc(title('dhS1'), `${named(p)} đạp xe: lần lắc này chỉ đi theo viên nhỏ hơn.`, { ms: 1600 });
    }
  }

  /* ================================================================
     Bảng chọn của kho kỹ năng
     ================================================================
     Mỗi bảng có lựa chọn "Không" là tắt. Trả về { on, val } để ghi vào bản
     nháp của kho, hoặc undefined khi bấm Huỷ / Esc (bản nháp giữ nguyên). */

  /** Hàng nút chọn một; `data-v` đọc lại bằng `parse`. */
  static row(name, items, cur) {
    return `<div class="sk-bet-row" data-row="${name}">${items.map(([v, label, dis]) =>
      `<button type="button" class="btn btn-ghost${String(v) === String(cur) ? ' on' : ''}" data-v="${v}" ${dis ? 'disabled' : ''}>${label}</button>`).join('')}</div>`;
  }

  /**
   * Mở một bảng chọn. `rows` là { tên hàng: giá trị đang chọn }; bấm nút trong
   * hàng thì đổi giá trị. `onPick(sel, body)` chạy sau mỗi lần bấm, để bảng
   * làm mờ hàng không còn nghĩa (chọn "Không" thì hàng số tiền mờ đi).
   */
  async chooser(id, { title: head, body, rows, onPick }) {
    const sel = { ...rows };
    const ok = await openModal({
      eyebrow: `Kỹ năng · ${skillById(id).name}`,
      title: head,
      body: `<div class="sk-bet">${body}</div>`,
      buttons: [
        { label: 'Xong', value: true, cls: 'btn-gold' },
        { label: 'Huỷ', value: false, cls: 'btn-ghost' },
      ],
      onMount: (el) => {
        onPick?.(sel, el);
        el.querySelectorAll('[data-row] button').forEach((b) => b.addEventListener('click', () => {
          const row = b.parentElement;
          row.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
          sel[row.dataset.row] = b.dataset.v;
          onPick?.(sel, el);
        }));
      },
    });
    return ok ? sel : undefined;
  }

  /** Cược Chẵn Lẻ: chọn cửa và số tiền, hoặc Không. */
  async chooseBet(p, cur) {
    const { payout, max } = param(p, 'dd2a');
    const amounts = [50, 100, 200, 300].filter((a) => a <= max);
    const taiXiu = has(p, 'ddX1');
    const picks = [['none', 'Không'], ['even', 'Chẵn'], ['odd', 'Lẻ'],
      ...(taiXiu ? [['big', 'Tài · 8–12'], ['small', 'Xỉu · 2–6']] : [])];
    const sel = await this.chooser('dd2a', {
      title: 'Tự cược mỗi lượt',
      rows: { pick: cur?.pick ?? 'even', amount: cur?.amount ?? amounts[0] },
      body: `${SkillPlay.row('pick', picks, cur?.pick ?? 'even')}
        ${SkillPlay.row('amount', amounts.map((a) => [a, money(a)]), cur?.amount ?? amounts[0])}
        <p class="sk-bet-note">Đang bật thì mỗi lượt, lúc bấm Lắc, tự cược đúng cửa và số tiền này; chọn Không là tắt.
          Chẵn/Lẻ đúng: được thêm ${pctText(payout)} số tiền cược.${taiXiu
          ? ` Tài/Xỉu đúng: được thêm ${pctText(param(p, 'ddX1').payout)}; ra 7 thì cả hai cửa thua.` : ''}
          Sai: mất tiền cược vào Quỹ Công${has(p, 'ddX2') ? `, được hoàn ${pctText(param(p, 'ddX2').back)}` : ''}.
          Lượt nào không đủ tiền thì bỏ lượt ấy.</p>`,
      onPick: (s, el) => el.querySelector('[data-row="amount"]').classList.toggle('dim', s.pick === 'none'),
    });
    if (!sel) return undefined;
    if (sel.pick === 'none') return { on: false, val: cur };
    return { on: true, val: { pick: sel.pick, amount: Number(sel.amount) } };
  }

  /** Tất Tay: chọn cửa, hoặc Không. Làm một lần lúc Chốt. */
  async chooseAllIn(p) {
    const st = this.st;
    const { win, lose } = param(p, 'ddU');
    const others = st.alive().filter((q) => q.id !== p.id);
    const gainAt = (w) => others.reduce((n, q) => n + Math.floor(q.money * w), 0);
    const gain = Array.isArray(win) ? `${money(gainAt(win[0])).replace(/\$$/, '')}–${money(gainAt(win[1]))}` : money(gainAt(win));
    const loss = Math.floor(p.money * lose) * others.length;
    const sel = await this.chooser('ddU', {
      title: 'Đoán chẵn / lẻ với cả bàn',
      rows: { pick: 'none' },
      body: `${SkillPlay.row('pick', [['none', 'Không'], ['even', 'Chẵn'], ['odd', 'Lẻ']], 'none')}
        <p class="sk-bet-note">Đoán tổng hai viên xí ngầu lần lắc tới. Đúng: nhận khoảng <b class="up">${gain}</b>
          (${pctText(win)} tiền mặt mỗi người). Sai: trả tổng <b class="down">${money(loss)}</b>
          (${Math.round(lose * 100)}% tiền mặt của bạn cho mỗi người).</p>`,
    });
    if (!sel) return undefined;
    return sel.pick === 'none' ? { on: false, val: null } : { on: true, val: sel.pick };
  }

  /** Xổ Số: chọn một tổng xí ngầu, hoặc Không. Đổi số một lần mỗi vòng. */
  async chooseLotto(p, cur) {
    const locked = p.lotto != null && p.lapUses?.ddVpick;
    const nums = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const start = cur ?? p.lotto ?? 7;
    const sel = await this.chooser('ddV', {
      title: 'Chọn một tổng xí ngầu',
      rows: { pick: start },
      body: `${SkillPlay.row('pick', [['none', 'Không']], start)}
        <div class="sk-bet-row sk-lotto" data-row="pick">${nums.map((n) => `<button type="button"
          class="btn btn-ghost${n === start ? ' on' : ''}" data-v="${n}" ${locked && n !== p.lotto ? 'disabled' : ''}>
          <b>${n}</b> · ${money(lottoPrize(p, n))}</button>`).join('')}</div>
        <p class="sk-bet-note">Mỗi lần người khác lắc ra đúng tổng này thì họ trả bạn số tiền ghi trên nút.
          Số càng khó ra trả càng nhiều; tính trung bình số nào cũng ngang nhau.
          ${locked ? 'Bạn đã đổi số trong vòng này, qua ô Bắt Đầu mới đổi được nữa.' : 'Đổi số được một lần giữa hai lần qua ô Bắt Đầu.'}</p>`,
      // Hai hàng cùng tên `pick`: bấm bên này thì bỏ sáng bên kia
      onPick: (s, el) => el.querySelectorAll('[data-row="pick"] button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(s.pick))),
    });
    if (!sel) return undefined;
    return sel.pick === 'none' ? { on: false, val: cur } : { on: true, val: Number(sel.pick) };
  }

  /** Góp Vốn: chọn một người, hoặc Không. Đổi người một lần mỗi vòng. */
  async chooseStake(p, cur) {
    const st = this.st;
    const others = st.alive().filter((q) => q.id !== p.id);
    const had = p.stake != null && !st.players[p.stake]?.bankrupt;
    const locked = had && p.lapUses?.dcS2pick;
    const lots = (q) => st.propertiesOf(q.id).length;
    const start = cur ?? (had ? p.stake : 'none');
    const sel = await this.chooser('dcS2', {
      title: 'Góp vốn với ai?',
      rows: { pick: start },
      body: `<p class="sk-bet-note">Mỗi lần người bạn chọn thu tiền thuê, ngân hàng trả bạn <b>${pctText(param(p, 'dcS2').share)}</b> số tiền ấy. Người đó không mất gì.
          ${locked ? 'Bạn đã đổi người trong vòng này, qua ô Bắt Đầu mới đổi được nữa.' : had ? 'Đổi người thì tới lần qua ô Bắt Đầu sau mới đổi được nữa.' : ''}</p>
        ${SkillPlay.row('pick', [['none', 'Không'], ...others.map((q) => [q.id,
          `<span class="stake-dot" style="--pc:${q.token.css}"></span> ${q.name} · ${lots(q)} ô · ${money(q.money)}`,
          locked && q.id !== p.stake])], start)}`,
    });
    if (!sel) return undefined;
    return sel.pick === 'none' ? { on: false, val: cur } : { on: true, val: Number(sel.pick) };
  }

  /**
   * Mua Lại, Siết Nợ, Xuyên Việt: chọn một ô thẳng trên bàn cờ (kho đang cất
   * đi). Nút bỏ ngang của bảng chọn ô là "Không".
   */
  async chooseTile(p, id) {
    const st = this.st;
    const text = {
      dcS1: {
        ids: leftoverOffers(st, p).map((x) => x.id),
        title: 'Nhặt ô nào?',
        sub: `Các ô sáng là ô chưa có chủ mà người khác đã dừng rồi bỏ qua. Mua với ${Math.round(param(p, 'dcS1').price * 100)}% giá gốc.`,
        confirm: 'Chọn ô này',
      },
      dcV: {
        ids: forecloseOffers(st, p).map((x) => x.id),
        title: 'Siết nợ ô nào?',
        sub: `Trả ngân hàng số tiền thế chấp và trả chủ cũ thêm ${pctText(param(p, 'dcV').premium)} số đó. Chủ cũ không được từ chối.`,
        confirm: 'Chọn ô này',
      },
      dhU: {
        ids: BOARD.map((t) => t.id).filter((x) => x !== 30 && x !== p.pos),
        title: 'Đi tới ô nào?',
        sub: 'Không lắc, đi thẳng tới ô bạn chọn. Đi ngang ô Bắt Đầu vẫn nhận lương.',
        confirm: 'Chọn ô này',
      },
    }[id];
    const tile = await this.g.pickTile(text.ids, {
      eyebrow: `Kỹ năng · ${skillById(id).name}`,
      title: text.title, sub: text.sub, confirm: text.confirm, owned: false, cancel: 'Không',
    }, this.g.events.localMs);
    return text.ids.includes(tile) ? { on: true, val: tile } : { on: false, val: null };
  }

  /* ================================================================
     Việc làm một lần, chạy lúc Chốt kho
     ================================================================ */

  async doAllIn(p, pick) {
    spend(p, 'ddU');
    credit(p, 'ddU');
    this.allIn = { turnNo: this.st.turnNo, seat: p.id, pick };
    this.g.sync();
    await this.bc(title('ddU'), `${named(p)} tất tay cửa <b>${PARITY_NAME[pick]}</b> với cả bàn!`, { kind: 'trade', ms: 2600 });
  }

  /** Mua Lại ô đã chọn. Soát lại: ô có thể vừa có chủ trong lúc chọn. */
  async doLeftover(p, id) {
    const st = this.st;
    const o = leftoverOffers(st, p).find((x) => x.id === id);
    if (!o || st.owner.has(id) || p.money < o.price) return;
    const pct = Math.round(param(p, 'dcS1').price * 100);
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
  }

  /** Siết Nợ ô đã chọn. */
  async doForeclose(p, id) {
    const st = this.st;
    const o = forecloseOffers(st, p).find((x) => x.id === id);
    const owner = o && st.ownerOf(id);
    if (!o || !owner || !st.isMortgaged(id)) return;
    spend(p, 'dcV');
    credit(p, 'dcV');
    await this.bc(title('dcV'),
      `${named(p)} siết nợ <b>${tileLabel(id)}</b> của ${named(owner)}: trả ngân hàng
       <span class="down">${money(o.bank)}</span>, trả ${named(owner)} <span class="down">${money(o.owner)}</span>.`,
      { kind: 'trade', ms: 3000 });
    if (!(await this.g.payBank(p.id, o.bank))) return;
    if (o.owner > 0 && !(await this.g.payPlayer(p.id, owner.id, o.owner))) return;
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
  }

  /** Chuyến Tàu Xuyên Việt tới ô đã chọn, thay cho lượt lắc. */
  async doTeleport(p, dest) {
    spend(p, 'dhU');
    credit(p, 'dhU');
    await this.bc(title('dhU'), `${named(p)} đi thẳng tới <b>${tileLabel(dest)}</b>.`, { ms: 2200 });
    await this.g.advance(p, (dest - p.pos + 40) % 40, null);
    if (this.st.over || p.bankrupt || p.inJail) { await this.g.endTurn(); return; }
    this.g.setTurnActions(true);
  }

  /** Cược đang chờ, còn đúng lượt này của đúng người này. */
  pending(b) {
    return b && b.turnNo === this.st.turnNo && b.seat === this.st.turn ? b : null;
  }

  /**
   * Mở cây kỹ năng cho người đang đi. Đóng lại thì loan tin cho cả bàn những
   * gì đã đổi — so level và công tắc từng ô trước và sau, nên tẩy điểm rồi học
   * lại trong cùng một lần mở cũng báo đúng cả hai việc.
   */
  async openTree(p) {
    if (this.treeOpen) { this.g.restoreActions(); return; }
    const before = Object.fromEntries(SKILLS.map((s) => [s.id, levelOf(p, s.id)]));
    const wasOn = new Set(p.skills.filter((id) => has(p, id)));
    this.treeOpen = true;
    try {
      await openSkillTree(p, {
        color: p.token.css,
        onChange: () => {
          this.g.hud.refresh();
          this.g.scene.refresh(this.st);
          this.g.refreshSkillBtn();
          this.g.sync();
        },
      });
    } finally { this.treeOpen = false; }
    const wiped = SKILLS.some((s) => levelOf(p, s.id) < before[s.id]);
    const base = wiped ? {} : before;
    const gained = SKILLS
      .filter((s) => levelOf(p, s.id) > (base[s.id] ?? 0))
      .map((s) => {
        const lv = levelOf(p, s.id);
        return `<b>${s.name}</b>${lv > 1 ? ` lên level ${lv}` : ''}`;
      });
    const lines = [];
    if (wiped) {
      lines.push(`${named(p)} tẩy toàn bộ kỹ năng để học lại từ đầu${
        gained.length ? `, rồi học ${gained.join(', ')}` : ''}.`);
    } else if (gained.length) lines.push(`${named(p)} học ${gained.join(', ')}.`);
    const names = (ids) => ids.map((id) => `<b>${skillById(id).name}</b>`).join(', ');
    const on = p.skills.filter((id) => has(p, id) && !wasOn.has(id));
    const off = wiped ? [] : [...wasOn].filter((id) => !has(p, id));
    if (on.length) lines.push(`Bật: ${names(on)}.`);
    if (off.length) lines.push(`Tắt: ${names(off)}.`);
    if (lines.length) {
      await this.bc(wiped ? 'TẨY ĐIỂM' : 'KỸ NĂNG', lines.join('<br>'), { ms: 2600 });
    }
    this.g.restoreActions();
  }

  /* ================================================================
     Học ngoài lượt
     ================================================================ */

  /**
   * Nút cây kỹ năng ở hàng tiện ích: mở được bất cứ lúc nào, kể cả lúc người
   * khác đang đi.
   *
   * Tới lượt mình mà đang rảnh tay thì đi đúng đường của nút trên thanh hành
   * động — được bật / tắt, tẩy điểm. Còn lại (lượt người khác, hoặc lượt mình
   * mà đang giữa một việc) chỉ học và lên level: ô mới học nằm tắt nên không
   * đổi gì trên bàn, cho học giữa chừng không làm lệch nước đi đang chạy.
   * Tắt, bật hay tẩy điểm thì đổi tác dụng ngay, nên phải chờ tới lượt.
   */
  async openAnyTime() {
    const g = this.g;
    const st = this.st;
    const p = st.players[g.mySeat];
    if (!p || p.bankrupt || st.over || this.treeOpen) return;
    if (st.order && st.turn === p.id && g.isDriver() && !g.busy) {
      g.guard(() => this.openTree(p));
      return;
    }
    this.treeOpen = true;
    try {
      await openSkillTree(p, {
        color: p.token.css,
        manage: false,
        onLearn: (id) => this.learnedOffTurn(p, id),
        onChange: () => { g.hud.refresh(); g.refreshSkillBtn(); },
      });
    } finally { this.treeOpen = false; }
  }

  /**
   * Vừa học một ô ngoài lượt, trên bản sao ván của máy mình. Máy mình đang
   * cầm lái (trọng tài cầm thay lượt người rớt mạng) thì bản sao này là bản
   * gốc, phát luôn; không thì gửi cho máy cầm lái học hộ trên bản gốc.
   */
  learnedOffTurn(p, id) {
    const level = levelOf(p, id);
    if (this.g.isDriver()) {
      this.announceLearn(p, id, level);
      this.g.syncSoon();
      return;
    }
    const now = Date.now();
    this.learnPending.push({ id, level, sent: now, t0: now });
    this.g.netEmit('learn', { seat: p.id, id, level });
  }

  /**
   * Máy cầm lái nhận tin học ngoài lượt. `level` là level người học vừa đạt
   * trên máy họ: bản gốc phải đang đứng ngay dưới level ấy, không thì đây là
   * tin gửi lại của một lần học đã xong, hoặc tin cũ — bỏ qua, kẻo học hai lần.
   */
  onLearnMsg({ seat, id, level }) {
    const g = this.g;
    if (!g.isDriver()) return;
    const q = this.st.players[seat];
    if (!q || q.bankrupt || levelOf(q, id) !== level - 1) return;
    if (!learnSkill(q, id).ok) return;
    g.hud.refresh();
    this.announceLearn(q, id, level);
    g.syncSoon();
  }

  /** Báo cả bàn một lần học ngoài lượt. Không chờ: lượt đang chạy cứ chạy tiếp. */
  announceLearn(p, id, level) {
    this.bc('HỌC KỸ NĂNG',
      `${named(p)} học <b>${skillById(id).name}</b>${level > 1 ? ` lên level ${level}` : ''}.`, { ms: 2000 });
  }

  /**
   * Đối chiếu ô học ngoài lượt với ảnh chụp vừa về (hoặc theo nhịp canh).
   *
   * Ảnh chụp đã có level ấy thì xong. Chưa có thì học lại trên bản sao cho cây
   * khỏi nhảy lùi — ảnh ấy có thể phát trước lúc máy cầm lái nhận tin — và quá
   * 3 giây thì gửi lại, phòng tin rơi mất hay máy cầm lái vừa đổi người. Học
   * lại không được nữa (điểm đã tiêu vào việc khác) hoặc quá 20 giây thì bỏ.
   */
  reconcileLearn() {
    if (!this.learnPending.length) return;
    const p = this.st.players[this.g.mySeat];
    const now = Date.now();
    this.learnPending = this.learnPending.filter((x) => {
      if (!p || p.bankrupt || now - x.t0 > 20000) return false;
      const lv = levelOf(p, x.id);
      if (lv >= x.level) return false;
      if (lv !== x.level - 1 || !learnSkill(p, x.id).ok) return false;
      if (now - x.sent > 3000) {
        x.sent = now;
        this.g.netEmit('learn', { seat: p.id, id: x.id, level: x.level });
      }
      return true;
    });
    // Máy mình vừa thành máy cầm lái: bản sao đã là bản gốc, hết gì để chờ
    if (this.g.isDriver()) this.learnPending = [];
    refreshSkillTree();
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

  /* ================================================================
     Kỹ năng nhánh phụ (cấp 3 'c' / 'd')
     ================================================================ */

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

  /**
   * Lương vừa tính xong mà Cò Quay đang bật: quay gấp đôi hoặc một nửa.
   * @returns {{pay:number, note:string}}
   */
  spinPay(p, pay) {
    if (!has(p, 'ddS2')) return { pay, note: '' };
    const win = Math.random() < param(p, 'ddS2').win;
    const out = win ? pay * 2 : Math.round(pay / 2);
    credit(p, 'ddS2', Math.max(0, out - pay));
    return { pay: out, note: win ? ' · <b>Cò Quay trúng, lương ×2</b>' : ' · <b>Cò Quay trượt, lương còn một nửa</b>' };
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
