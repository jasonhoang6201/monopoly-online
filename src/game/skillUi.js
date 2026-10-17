/**
 * Giao diện kỹ năng ở máy người chơi: nút trên thanh hành động, kho kỹ năng,
 * hộp cược, bảng chọn lá bài, cây kỹ năng.
 *
 * Không hàm nào ở đây đổi ván thật. Hộp nào cũng chỉ dựng một **bản nháp**
 * (hoặc một câu trả lời) rồi trả về cho controller gửi lên engine; engine soát
 * lại bằng đúng luật ở `engine/kit.js`, `engine/skills.js`. Cây kỹ năng chạy
 * trên bản sao của ván, ghi lại từng thao tác để gửi đi.
 */
import { money, tileLabel } from '../data/board.js';
import {
  skillById, has, param, lottoPrize, leftoverOffers, forecloseOffers, isOff, teleportTargets,
} from '../core/skills.js';
import { cardType, isKeepable, moveDest, repairBill } from '../core/cards.js';
import { cardEffect, CARD_KINDS, DECK_META, DECKS } from '../data/cards.js';
import { RANKS, rankOf, shortLabel } from '../ui/caseOpen.js';
import { BRANCHES } from '../data/skills.js';
import { openModal } from '../ui/modal.js';
import { openSkillTree } from '../ui/skillTree.js';
import { skillIcon } from '../ui/skillIcons.js';
import { pickTileOnBoard } from '../ui/tilePicker.js';
import { audio } from '../audio/audio.js';
import { snapshot, fromSnapshot } from '../core/serialize.js';
import { kitCells, draftStart, sitsLeft, pendingBet } from '../engine/kit.js';
import { betAmounts } from '../engine/skills.js';

const PARITY_NAME = { even: 'Chẵn', odd: 'Lẻ', big: 'Tài', small: 'Xỉu' };
const SKILL_COLOR = Object.fromEntries(BRANCHES.map((b) => [b.key, b.color]));
const pctText = (v) => (Array.isArray(v) ? `${Math.round(v[0] * 100)}–${Math.round(v[1] * 100)}%` : `${Math.round(v * 100)}%`);

/** Hàng nút chọn một; `data-v` đọc lại bằng `parse`. */
function row(name, items, cur) {
  return `<div class="sk-bet-row" data-row="${name}">${items.map(([v, label, dis]) =>
    `<button type="button" class="btn btn-ghost${String(v) === String(cur) ? ' on' : ''}" data-v="${v}" ${dis ? 'disabled' : ''}>${label}</button>`).join('')}</div>`;
}

/**
 * Mở một bảng chọn. `rows` là { tên hàng: giá trị đang chọn }; bấm nút trong
 * hàng thì đổi giá trị. Trả về lựa chọn, hoặc undefined khi Huỷ / Esc.
 */
async function chooser(id, { title: head, body, rows, onPick }) {
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
        const r = b.parentElement;
        r.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        sel[r.dataset.row] = b.dataset.v;
        onPick?.(sel, el);
      }));
    },
  });
  return ok ? sel : undefined;
}

export class SkillUi {
  /** @param {import('./controller.js').Game} game */
  constructor(game) {
    this.g = game;
    /** Hộp cây kỹ năng đang mở trên máy này — chặn mở chồng hai hộp. */
    this.treeOpen = false;
  }

  get st() { return this.g.state; }

  /* ================================================================
     Thanh nút
     ================================================================ */

  /** Hai nút kỹ năng cho thanh hành động: cây kỹ năng, và kho kỹ năng bấm để dùng. */
  buttons(p, rolled) {
    const offs = p.skills.filter((id) => isOff(p, id)).length;
    const out = [{
      label: 'Kỹ năng', key: 'k', half: true,
      cls: p.skillPoints > 0 ? 'btn-gold' : 'btn-ghost',
      icon: skillIcon('root', 'ai'),
      hint: p.skillPoints > 0 ? `${p.skillPoints} điểm chưa dùng` : `đã học ${p.skills.length}`,
      title: 'Mở cây kỹ năng: học kỹ năng mới, bật / tắt kỹ năng đã học',
      onClick: () => this.g.local(() => this.openTree(p)),
    }];
    const cells = kitCells(this.st, p, rolled);
    const on = cells.filter((c) => c.switch && !isOff(p, c.id)).length;
    const n = cells.filter((c) => c.ok).length;
    out.push({
      label: 'Dùng kỹ năng', key: 'u', half: true,
      cls: n && (offs || cells.some((c) => c.act)) ? 'btn-gold' : 'btn-ghost',
      disabled: !cells.length,
      icon: skillIcon('chip', 'ai'),
      hint: !cells.length ? 'không có kỹ năng cần bật' : `${on} bật${offs ? ` · ${offs} tắt` : ''}`,
      title: 'Mở kho kỹ năng: bật / tắt, chọn cửa cược, chọn ô',
      onClick: () => this.g.local(() => this.openKit(p, rolled)),
    });
    return out;
  }

  /* ================================================================
     Kho kỹ năng
     ================================================================ */

  /** Chữ trên một ô của kho, theo bản nháp hiện tại. */
  cellText(p, c, d) {
    const st = this.st;
    if (!c.ok) return c.why;
    const wait = (id) => `Chờ ${p.cooldowns[id]} lần qua ô Bắt Đầu`;
    let s;
    switch (c.id) {
      case 'ddU': s = d.on ? `Tất tay cửa ${PARITY_NAME[d.val]} khi Chốt` : 'Bấm để chọn cửa, đoán với cả bàn'; break;
      case 'dhU': s = d.on ? `Đi tới ${tileLabel(d.val)} khi Chốt, thay cho lượt lắc` : 'Bấm để chọn ô, thay cho lượt lắc'; break;
      case 'dhS1': s = d.on ? 'Mỗi lần lắc đi theo viên nhỏ hơn, tới khi tắt' : 'Bấm để bật: mỗi lần lắc đi theo viên nhỏ hơn'; break;
      case 'ddS2': s = d.on ? 'Lương lần tới được quay' : 'Bấm để bật: lương lần tới được quay'; break;
      case 'ddV':
        s = d.on ? (d.val != null ? `Số ${d.val} · trúng ${money(lottoPrize(p, d.val))}` : 'Bật nhưng chưa chọn số') : 'Bấm để chọn số';
        if (p.lapUses?.ddVpick) s += ' · Đã đổi số trong vòng này';
        break;
      case 'dcS1':
        s = d.on ? `Mua ${tileLabel(d.val)} khi Chốt` : `${c.offers} ô mua được, ${Math.round(param(p, 'dcS1').price * 100)}% giá`;
        break;
      case 'dcS2': {
        const q = d.val != null ? st.players[d.val] : null;
        s = d.on ? (q && !q.bankrupt ? `Đang góp vốn với ${q.name}` : 'Bật nhưng chưa chọn người') : 'Bấm để chọn người góp vốn';
        if (p.lapUses?.dcS2pick) s += ' · Đã đổi người trong vòng này';
        break;
      }
      case 'dcV': s = d.on ? `Siết nợ ${tileLabel(d.val)} khi Chốt` : `${c.offers} ô của con nợ siết được`; break;
      case 'cnS2': s = `Bấm để ngồi yên, còn ${sitsLeft(p)} lượt`; break;
      default: s = wait(c.id);
    }
    return s;
  }

  /**
   * Kho kỹ năng. Mọi thao tác trong hộp chỉ đổi bản nháp; Chốt mới gửi lên.
   * @returns {Promise<?object>} action cho thanh nút, hoặc null khi Huỷ
   */
  async openKit(p, rolled) {
    const cells = kitCells(this.st, p, rolled);
    const draft = new Map(cells.map((c) => [c.id, draftStart(p, c)]));
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
          <span class="kit-text"><b>${s.name}</b><small>${this.cellText(p, c, draft.get(c.id))}</small></span>
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
          if (c.act) { act = c.id; close('apply'); return; }
          const choose = this.chooserFor(p, c);
          if (choose) {
            busy = true;
            stash(true);
            const r = await choose(d.val).finally(() => stash(false));
            busy = false;
            if (r === undefined) return;
            draft.set(c.id, r);
          } else {
            draft.set(c.id, { ...d, on: !d.on });
            audio.sfx('click');
          }
          b.classList.toggle('is-off', !lit(c));
          b.setAttribute('aria-pressed', String(lit(c)));
          b.querySelector('small').innerHTML = this.cellText(p, c, draft.get(c.id));
        }));
      },
    });
    if (v !== 'apply') return null;
    return { do: 'kit', draft: { cells: Object.fromEntries(draft), act } };
  }

  /** Bảng chọn của một ô trong kho, hoặc null với ô bật / tắt thường. */
  chooserFor(p, c) {
    switch (c.id) {
      case 'ddU': return () => this.chooseAllIn(p);
      case 'ddV': return (v) => this.chooseLotto(p, v);
      case 'dcS2': return (v) => this.chooseStake(p, v);
      case 'dhU':
      case 'dcS1':
      case 'dcV': return () => this.chooseTile(p, c.id);
      default: return null;
    }
  }

  async chooseAllIn(p) {
    const st = this.st;
    const { win, lose } = param(p, 'ddU');
    const others = st.alive().filter((q) => q.id !== p.id);
    const gainAt = (w) => others.reduce((n, q) => n + Math.floor(q.money * w), 0);
    const gain = Array.isArray(win) ? `${money(gainAt(win[0])).replace(/\$$/, '')}–${money(gainAt(win[1]))}` : money(gainAt(win));
    const loss = Math.floor(p.money * lose) * others.length;
    const sel = await chooser('ddU', {
      title: 'Đoán chẵn / lẻ với cả bàn',
      rows: { pick: 'none' },
      body: `${row('pick', [['none', 'Không'], ['even', 'Chẵn'], ['odd', 'Lẻ']], 'none')}
        <p class="sk-bet-note">Đoán tổng hai viên xí ngầu lần lắc tới. Đúng: nhận khoảng <b class="up">${gain}</b>
          (${pctText(win)} tiền mặt mỗi người). Sai: trả tổng <b class="down">${money(loss)}</b>
          (${Math.round(lose * 100)}% tiền mặt của bạn cho mỗi người).</p>`,
    });
    if (!sel) return undefined;
    return sel.pick === 'none' ? { on: false, val: null } : { on: true, val: sel.pick };
  }

  async chooseLotto(p, cur) {
    const locked = p.lotto != null && p.lapUses?.ddVpick;
    const nums = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const start = cur ?? p.lotto ?? 7;
    const sel = await chooser('ddV', {
      title: 'Chọn một tổng xí ngầu',
      rows: { pick: start },
      body: `${row('pick', [['none', 'Không']], start)}
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

  async chooseStake(p, cur) {
    const st = this.st;
    const others = st.alive().filter((q) => q.id !== p.id);
    const had = p.stake != null && !st.players[p.stake]?.bankrupt;
    const locked = had && p.lapUses?.dcS2pick;
    const lots = (q) => st.propertiesOf(q.id).length;
    const start = cur ?? (had ? p.stake : 'none');
    const sel = await chooser('dcS2', {
      title: 'Góp vốn với ai?',
      rows: { pick: start },
      body: `<p class="sk-bet-note">Mỗi lần người bạn chọn thu tiền thuê, ngân hàng trả bạn <b>${pctText(param(p, 'dcS2').share)}</b> số tiền ấy. Người đó không mất gì.
          ${locked ? 'Bạn đã đổi người trong vòng này, qua ô Bắt Đầu mới đổi được nữa.' : had ? 'Đổi người thì tới lần qua ô Bắt Đầu sau mới đổi được nữa.' : ''}</p>
        ${row('pick', [['none', 'Không'], ...others.map((q) => [q.id,
          `<span class="stake-dot" style="--pc:${q.token.css}"></span> ${q.name} · ${lots(q)} ô · ${money(q.money)}`,
          locked && q.id !== p.stake])], start)}`,
    });
    if (!sel) return undefined;
    return sel.pick === 'none' ? { on: false, val: cur } : { on: true, val: Number(sel.pick) };
  }

  /** Mua Lại, Siết Nợ, Xuyên Việt: chọn một ô thẳng trên bàn cờ. */
  async chooseTile(p, id) {
    const st = this.st;
    const text = {
      dcS1: {
        ids: leftoverOffers(st, p).map((x) => x.id),
        title: 'Nhặt ô nào?',
        sub: `Các ô sáng là ô chưa có chủ mà người khác đang đứng. Mua với ${Math.round(param(p, 'dcS1').price * 100)}% giá gốc.`,
      },
      dcV: {
        ids: forecloseOffers(st, p).map((x) => x.id),
        title: 'Siết nợ ô nào?',
        sub: `Ô sáng là đất của người đang có ô thế chấp hoặc tiền mặt dưới ${money(param(p, 'dcV').poor)}. Ô đang thế chấp: trả ngân hàng ${pctText(param(p, 'dcV').bank)} số thế chấp${param(p, 'dcV').premium ? `, trả chủ cũ thêm ${pctText(param(p, 'dcV').premium)} số đó` : ''}. Ô chưa thế chấp: trả chủ cũ ${pctText(param(p, 'dcV').debt)} giá gốc. Chủ cũ không được từ chối.`,
      },
      dhU: {
        ids: teleportTargets(st, p),
        title: 'Đi tới ô nào?',
        sub: 'Không lắc, đi thẳng tới ô bạn chọn. Đi ngang ô Bắt Đầu vẫn nhận lương.',
      },
    }[id];
    const tile = await pickTileOnBoard(this.g.scene, st, text.ids, {
      eyebrow: `Kỹ năng · ${skillById(id).name}`,
      title: text.title, sub: text.sub, confirm: 'Chọn ô này', owned: false, cancel: 'Không',
    }, 0);
    return text.ids.includes(tile) ? { on: true, val: tile } : { on: false, val: null };
  }

  /* ================================================================
     Câu hỏi của engine
     ================================================================ */

  /**
   * Hộp hỏi cược lúc bấm Lắc. Trả `{pick, amount}`, hoặc `null` khi không cược.
   * Cửa và tiền lần trước được chọn sẵn.
   */
  async askBet(p, ms = 0) {
    const { payout } = param(p, 'dd2a');
    const amounts = betAmounts(p);
    const afford = amounts.filter((a) => a <= p.money);
    if (!afford.length) return null;
    const taiXiu = has(p, 'ddX1');
    const picks = [['even', 'Chẵn'], ['odd', 'Lẻ'],
      ...(taiXiu ? [['big', 'Tài · 8–12'], ['small', 'Xỉu · 2–6']] : [])];
    const last = p.betSet;
    const sel = {
      pick: picks.some(([v]) => v === last?.pick) ? last.pick : 'even',
      amount: afford.includes(last?.amount) ? last.amount : afford[afford.length - 1],
    };
    const summary = () => `Cược <b>${money(sel.amount)}</b> vào cửa <b>${PARITY_NAME[sel.pick]}</b>`;
    const ok = await openModal({
      eyebrow: `Kỹ năng · ${skillById('dd2a').name}`,
      title: 'Cược lần lắc này?',
      body: `<div class="sk-bet">
        ${row('pick', picks, sel.pick)}
        ${row('amount', amounts.map((a) => [a, money(a), a > p.money]), sel.amount)}
        <p class="sk-bet-note sk-bet-sum">${summary()}</p>
        <p class="sk-bet-note">Chẵn/Lẻ đúng: được thêm ${pctText(payout)} số tiền cược.${taiXiu
          ? ` Tài/Xỉu đúng: được thêm ${pctText(param(p, 'ddX1').payout)}; ra 7 thì cả hai cửa thua.` : ''}
          Sai: mất tiền cược vào Quỹ Công${has(p, 'ddX2') ? `, được hoàn ${pctText(param(p, 'ddX2').back)}` : ''}.</p>
      </div>`,
      buttons: [
        { label: 'Cược', value: true, cls: 'btn-gold' },
        { label: 'Không cược', value: false, cls: 'btn-ghost' },
      ],
      onMount: (el) => {
        el.querySelectorAll('[data-row] button').forEach((b) => b.addEventListener('click', () => {
          const r = b.parentElement;
          r.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
          sel[r.dataset.row] = r.dataset.row === 'amount' ? Number(b.dataset.v) : b.dataset.v;
          el.querySelector('.sk-bet-sum').innerHTML = summary();
          audio.sfx('click');
        }));
      },
    });
    return ok ? { ...sel } : null;
  }

  /**
   * Bài Tẩy: bày các lá rút được thành hàng ngang, bấm lá nào chọn lá đó.
   * Esc lấy lá đầu.
   */
  chooseCard(p, kind, hand) {
    const deck = DECK_META[kind];
    const cards = hand.map((i) => DECKS[kind][i]);
    const face = (c, i) => {
      const r = RANKS[rankOf(kind, c)];
      const sigil = CARD_KINDS[c.type]?.sigil ?? deck.sigil;
      const flavor = isKeepable(c) ? cardEffect(c) : c.text;
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

  /** Lá bài làm gì **với người này, ở chỗ này**. */
  cardDoes(p, card) {
    if (isKeepable(card)) return 'Cất vào túi, dùng sau';
    switch (cardType(card)) {
      case 'collect': return card.each
        ? `Mỗi người còn lại đưa bạn ${money(card.each)}`
        : `Tiền mừng ${money(card.amount)}, cả bàn chia nhau góp`;
      case 'curse': return 'Bị nguyền: 1 vòng không thu được tiền thuê';
      case 'repair': return `Thuế nhà cửa: bạn nộp ${money(repairBill(this.st, p.id, card).amount)}`;
      case 'skill': return `Nhận ${card.points} điểm kỹ năng`;
      case 'move': {
        if (card.jail) return 'Vào tù';
        const dest = moveDest(card, p.pos, this.st);
        return card.ahead ? `Tiến ${dest.steps} ô tới ${tileLabel(dest.tile)}` : `Đi tới ${tileLabel(dest.tile)}`;
      }
      default: return card.amount > 0 ? `Nhận ${money(card.amount)}` : `Nộp ${money(-card.amount)}`;
    }
  }

  /** Thâu Tóm: dùng hay trả thuê như thường. */
  askSeize(data) {
    const st = this.st;
    const owner = st.players[data.owner];
    return openModal({
      eyebrow: `Kỹ năng · ${skillById('dc3').name}`,
      title: skillById('dc3').name,
      body: `<div class="sk-ask"><p>Mua lại <b>${tileLabel(data.tileId)}</b> của <b style="color:${owner.token.css}">${owner.name}</b> với giá
        <b>${money(data.price)}</b> (${Math.round(data.premium * 100)}% giá gốc). Chủ đất không được từ chối.</p>
        <p>Không dùng thì trả thuê <b>${money(data.rent)}</b> như thường.</p></div>`,
      buttons: [
        { label: `Thâu Tóm · ${money(data.price)}`, value: true, cls: 'btn-gold' },
        { label: 'Trả thuê', value: false, cls: 'btn-ghost' },
      ],
    });
  }

  /* ================================================================
     Cây kỹ năng
     ================================================================ */

  /**
   * Mở cây kỹ năng trên **bản sao** của ván. Mỗi lần học hay tẩy điểm gửi
   * ngay một action, để máy khác thấy ngay trong lúc cây còn mở; ván đang vẽ
   * đổi theo ảnh chụp engine gửi về.
   *
   * Trong lượt mình (`manage`) được tẩy điểm, thao tác đi qua thanh nút
   * (`tree`). Ngoài lượt chỉ học / lên level qua action `learn` — lượt người
   * khác vẫn chạy.
   *
   * @returns {Promise<null>} không có action nào chờ gửi lúc đóng
   */
  async openTree(p, o = {}) {
    if (this.treeOpen) return null;
    const manage = o.manage !== false;
    let learned = false;
    this.treeOpen = true;
    // Bộ kiểm thử vừa sửa tay ván: đẩy vào engine trước khi cây đổi ván đang vẽ
    if (manage) this.g.testSync(null);
    /* Cây chạy thẳng trên ván đang vẽ: học xong là cây và HUD đổi ngay, khỏi
       chờ một vòng mạng. Engine làm lại đúng thao tác ấy rồi gửi ảnh chụp về,
       ghi đè bằng chính con số này. */
    const keep = { raw: true };
    try {
      await openSkillTree(p, {
        color: p.token.css,
        state: () => this.st,
        manage,
        onLearn: (id) => {
          learned = true;
          if (manage) this.g.act({ do: 'tree', ops: [{ op: 'learn', id }] }, keep);
          else o.onLearn?.(id);
        },
        onChange: () => {
          // Lần đổi không đi kèm lần học là một lần tẩy điểm
          if (!learned && manage) this.g.act({ do: 'tree', ops: [{ op: 'respec' }] }, keep);
          learned = false;
          this.g.hud.refresh();
          this.g.refreshSkillBtn();
        },
      });
    } finally { this.treeOpen = false; }
    return null;
  }

  /** Cược / Tất Tay của lượt này đã đặt chưa — cho nút thanh hành động. */
  pending(b) { return pendingBet(this.st, b); }

  /* ---------------------------------------------------- cho bộ kiểm thử */

  get bet() { return this.st?.flow?.bet ?? null; }
  set bet(v) { if (this.st?.flow) this.st.flow.bet = v; }
  get allIn() { return this.st?.flow?.allIn ?? null; }
  set allIn(v) { if (this.st?.flow) this.st.flow.allIn = v; }
}

/* Mạch kỹ năng bộ kiểm thử gọi thẳng (`c.skills.beforeRoll(p)`): chạy trên engine. */
for (const name of [
  'beforeRoll', 'afterRoll', 'settleBets', 'rollPerks', 'flushSlip', 'lapEnd', 'express', 'tolls',
  'landed', 'trySeize', 'tours', 'pickup', 'insure', 'lottoHits', 'jackpot', 'parking', 'brokerFees',
  'bought', 'atHome', 'jailed', 'jailWage', 'stakeShare', 'tradeFees', 'drawCard', 'dodgeCard',
  'doAllIn', 'doLeftover', 'doForeclose', 'doTeleport', 'applyKit', 'applyTree',
]) {
  SkillUi.prototype[name] = function rule(...a) { return this.g.debug(`skills.${name}`, ...a); };
}
for (const name of ['shape', 'rentBill', 'rent', 'spinPay', 'rentNote', 'pedal', 'rentPaid', 'cut', 'cardBonus', 'freeBail', 'lapStart', 'paid', 'learnOffTurn']) {
  SkillUi.prototype[name] = function rule(...a) { return this.g.rulesCall(`skills.${name}`, ...a); };
}
