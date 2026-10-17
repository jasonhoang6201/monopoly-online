/**
 * Kỹ năng trong ván — phần phải hỏi người chơi, chuyển tiền hoặc loan tin.
 * Phần tính bằng số thuần nằm ở core/skills.js và GameState.
 *
 * Các bảng chọn (cược, kho kỹ năng, cây kỹ
 * năng) giờ dựng ở máy khách; engine nhận kết quả rồi soát lại.
 */
import { BOARD, money, tileLabel } from '../data/board.js';
import {
  skillById, has, param, roll, rolled, ready, usesLeft, spend, onLap, levyRate, levyEach, levelOf,
  freeHouseTarget, credit, rentGains, lateFee, lottoPrize, tollStops, forecloseOffers,
  tourPassed, leftoverOffers, isOff, setSkillOn, learnSkill, canSeize, teleportTargets, tally, respec, buyPoint,
} from '../core/skills.js';
import { cardType } from '../core/cards.js';
import { SKILLS, POINT_PRICE } from '../data/skills.js';
import { kitCells, canSit, sitsLeft, pendingBet } from './kit.js';

const STATIONS = BOARD.filter((t) => t.type === 'station').map((t) => t.id);
const parity = (n) => (n % 2 === 0 ? 'even' : 'odd');
const PARITY_NAME = { even: 'Chẵn', odd: 'Lẻ', big: 'Tài', small: 'Xỉu' };
/** Cửa cược có trúng với tổng này không. Tài 8–12, Xỉu 2–6: ra 7 thì cả hai cửa thua. */
const hits = (pick, sum) => (pick === 'big' ? sum >= 8 : pick === 'small' ? sum <= 6 : parity(sum) === pick);
const title = (id) => `KỸ NĂNG · ${skillById(id).name.toUpperCase()}`;
const named = (p) => `<b style="color:${p.token.css}">${p.name}</b>`;

/** Mức cược được phép theo kỹ năng — máy khách vẽ nút từ đây, engine soát bằng đây. */
export function betAmounts(p) {
  const { max } = param(p, 'dd2a');
  return [50, 100, 200, 300].filter((a) => a <= max);
}

export class SkillRules {
  /** @param {import('./game.js').Rules} g */
  constructor(g) {
    this.g = g;
    /**
     * Bản kê tiền của lần lắc đang xử lý — mỗi kỹ năng đọc xí ngầu ghi một
     * dòng, `flushSlip` báo một lần và chuyển một lần phần chênh. Chỉ sống
     * trong một mạch lắc, nên không cần nằm trong ảnh chụp: dựng lại ván là
     * chạy lại đúng mạch ấy.
     */
    this.slip = [];
    /** Đang đi nhờ Tàu Tốc Hành — tới ga kế thì không hỏi nữa. */
    this.expressing = false;
  }

  get st() { return this.g.st; }
  bc(t, html, o) { this.g.say(t, html, o); }

  /* ================================================================
     Kho kỹ năng và cây kỹ năng (bảng chọn dựng ở máy khách)
     ================================================================ */

  /**
   * Áp dụng bản nháp của kho: công tắc, lựa chọn giữ lâu (Xổ Số, Góp Vốn),
   * rồi các việc làm một lần. Ô lúc này không bấm được thì bỏ phần nháp của nó.
   *
   * @param {{cells?:Object<string,{on:boolean,val:any}>, act?:string}} draft
   */
  *applyKit(p, rolledNow, draft) {
    const st = this.st;
    const cells = kitCells(st, p, rolledNow);
    const want = draft && typeof draft === 'object' ? (draft.cells ?? {}) : {};
    const res = { on: [], off: [], notes: [] };
    const once = [];
    for (const c of cells) {
      if (!c.ok || c.act) continue;
      const d = want[c.id];
      if (!d || typeof d !== 'object') continue;
      const on = !!d.on;
      const val = d.val ?? null;
      if (c.once) {
        if (on && val != null) once.push([c.id, val]);
        continue;
      }
      if (setSkillOn(p, c.id, on)) res[on ? 'on' : 'off'].push(c.id);
      if (!on) continue;
      if (c.id === 'ddV' && val != null && val !== p.lotto) {
        const n = Number(val);
        // Đã đổi số trong vòng này thì không đổi nữa
        const locked = p.lotto != null && p.lapUses?.ddVpick;
        if (Number.isInteger(n) && n >= 2 && n <= 12 && !locked) {
          if (p.lotto != null) p.lapUses = { ...p.lapUses, ddVpick: 1 };
          p.lotto = n;
          res.notes.push(`Xổ Số: chọn số <b>${n}</b>, ai lắc ra ${n} trả <span class="up">${money(lottoPrize(p, n))}</span>.`);
        }
      }
      if (c.id === 'dcS2' && val != null && val !== p.stake) {
        const q = st.players[Number(val)];
        const had = p.stake != null && !st.players[p.stake]?.bankrupt;
        const locked = had && p.lapUses?.dcS2pick;
        if (q && !q.bankrupt && q.id !== p.id && !locked) {
          if (had) p.lapUses = { ...p.lapUses, dcS2pick: 1 };
          p.stake = q.id;
          res.notes.push(`Góp vốn với ${named(q)}.`);
        }
      }
    }
    if (res.on.length || res.off.length || res.notes.length) {
      this.g.sfx('build');
      this.g.sync();
      const names = (ids) => ids.map((id) => `<b>${skillById(id).name}</b>`).join(', ');
      const lines = [];
      if (res.on.length) lines.push(`Bật: ${names(res.on)}.`);
      if (res.off.length) lines.push(`Tắt: ${names(res.off)}.`);
      this.bc('KỸ NĂNG', `${named(p)}<br>${[...lines, ...res.notes].join('<br>')}`, { ms: 2200 });
    }
    let tele = null;
    for (const [id, val] of once) {
      if (st.current !== p || p.bankrupt || st.over) return;
      if (id === 'ddU' && (val === 'even' || val === 'odd')) yield* this.doAllIn(p, val);
      if (id === 'dcS1') yield* this.doLeftover(p, Number(val));
      if (id === 'dcV') yield* this.doForeclose(p, Number(val));
      if (id === 'dhU') tele = Number(val);
    }
    if (st.current !== p || p.bankrupt || st.over) return;
    if (draft?.act === 'cnS2' && cells.some((c) => c.id === 'cnS2' && c.ok)) {
      yield* this.g.sitInJail();
      return;
    }
    // Xuyên Việt thay cho lượt lắc: chạy sau cùng vì nó dời quân và có thể hết lượt
    if (tele != null && teleportTargets(st, p).includes(tele)) yield* this.doTeleport(p, tele);
  }

  /**
   * Thao tác trên cây kỹ năng trong lượt mình: học / lên level, tẩy điểm, mua điểm.
   * Đóng cây thì loan tin cho cả bàn những gì đã đổi — so level trước và sau.
   *
   * @param {Array<{op:'learn'|'respec'|'buy', id?:string}>} ops
   */
  *applyTree(p, ops) {
    const st = this.st;
    if (!Array.isArray(ops) || !ops.length) return;
    const before = Object.fromEntries(SKILLS.map((s) => [s.id, levelOf(p, s.id)]));
    const wasOn = new Set(p.skills.filter((id) => has(p, id)));
    const bought0 = p.boughtPoints ?? 0;
    let changed = 0;
    for (const o of ops.slice(0, 60)) {
      if (o?.op === 'learn' && typeof o.id === 'string') changed += learnSkill(p, o.id, st).ok ? 1 : 0;
      else if (o?.op === 'respec') changed += respec(p)?.ok === false ? 0 : 1;
      else if (o?.op === 'buy') changed += buyPoint(p).ok ? 1 : 0;
    }
    if (!changed) return;
    this.g.sync();
    const wiped = SKILLS.some((s) => levelOf(p, s.id) < before[s.id]);
    const base = wiped ? {} : before;
    const gained = SKILLS
      .filter((s) => levelOf(p, s.id) > (base[s.id] ?? 0))
      .map((s) => {
        const lv = levelOf(p, s.id);
        return `<b>${s.name}</b>${lv > 1 ? ` lên level ${lv}` : ''}`;
      });
    const lines = [];
    const bought = (p.boughtPoints ?? 0) - bought0;
    if (bought > 0) lines.push(`${named(p)} mua <b>${bought} điểm kỹ năng</b>, trả <span class="down">${money(bought * POINT_PRICE)}</span>.`);
    if (wiped) {
      lines.push(`${named(p)} tẩy toàn bộ kỹ năng để học lại từ đầu${gained.length ? `, rồi học ${gained.join(', ')}` : ''}.`);
    } else if (gained.length) lines.push(`${named(p)} học ${gained.join(', ')}.`);
    const names = (ids) => ids.map((id) => `<b>${skillById(id).name}</b>`).join(', ');
    const on = p.skills.filter((id) => has(p, id) && !wasOn.has(id) && base[id] > 0);
    const off = wiped ? [] : [...wasOn].filter((id) => !has(p, id));
    if (on.length) lines.push(`Bật: ${names(on)}.`);
    if (off.length) lines.push(`Tắt: ${names(off)}.`);
    if (lines.length) this.bc(wiped ? 'TẨY ĐIỂM' : 'KỸ NĂNG', lines.join('<br>'), { ms: 2600 });
  }

  /**
   * Học ngoài lượt (lượt người khác, hoặc giữa một việc của mình): chỉ học và
   * lên level. Ô mới học nằm tắt nên không đổi gì trên bàn — học giữa chừng
   * không làm lệch nước đi đang chạy. Không phải generator: chạy ngay lúc nhận.
   * @returns {boolean} có học được không
   */
  learnOffTurn(seat, id) {
    const st = this.st;
    const q = st.players[seat];
    if (!q || q.bankrupt || st.over || typeof id !== 'string') return false;
    const level = levelOf(q, id) + 1;
    if (!learnSkill(q, id, st, { offTurn: true }).ok) return false;
    this.g.sync();
    this.bc('HỌC KỸ NĂNG', `${named(q)} học <b>${skillById(id).name}</b>${level > 1 ? ` lên level ${level}` : ''}.`, { ms: 2000 });
    return true;
  }

  /* ================================================================
     Trước và sau khi lắc
     ================================================================ */

  /**
   * Trước khi lắc: hỏi Cược Chẵn Lẻ. Mỗi lượt hỏi một lần, đổ đôi lắc lại
   * không hỏi nữa. `ask = false` khi bàn lắc hộ người để hết giờ: không cược,
   * vì tiêu tiền của người vắng mặt là quyết định của họ.
   */
  *beforeRoll(p, ask = true) {
    const st = this.st;
    const f = st.flow;
    if (!has(p, 'dd2a') || p.usedTurn?.dd2a === st.turnNo || pendingBet(st, f.bet)) return;
    p.usedTurn = { ...p.usedTurn, dd2a: st.turnNo };
    if (!ask) return;
    const amounts = betAmounts(p);
    if (!amounts.some((a) => a <= p.money)) return;
    const r = yield* this.g.ask(p.id, 'bet', { seat: p.id }, { ms: this.g.ms('turnMs'), fallback: null });
    const set = r.value;
    if (!set || st.current !== p || p.bankrupt || st.over) return;
    // Cửa Tài / Xỉu chỉ có khi đã học Thần Tài Xỉu
    const picks = ['even', 'odd', ...(has(p, 'ddX1') ? ['big', 'small'] : [])];
    const amount = Number(set.amount);
    if (!picks.includes(set.pick) || !amounts.includes(amount) || amount > p.money) return;
    p.betSet = { pick: set.pick, amount };
    f.bet = { turnNo: st.turnNo, seat: p.id, pick: set.pick, amount };
    this.g.sync();
    this.bc(title('dd2a'), `${named(p)} cược <b>${money(amount)}</b> vào cửa <b>${PARITY_NAME[set.pick]}</b>.`, { ms: 1800 });
  }

  /**
   * Sau khi lắc, trước khi quân đi: Xí Ngầu Gian (lắc lại một viên) và Quay
   * Đầu (đi lùi), gộp một lần hỏi.
   * @returns {Generator<any, {d:object, back:boolean}>}
   */
  *afterRoll(p, d) {
    let rerolled = false;
    for (;;) {
      const canReroll = !rerolled && ready(p, 'dd3');
      const canBack = ready(p, 'dh3');
      if (!canReroll && !canBack) return { d, back: false };
      const fwd = (p.pos + d.sum) % 40;
      const back = (p.pos - d.sum + 40) % 40;
      const left = (id) => { const n = usesLeft(p, id); return n > 1 ? ` (còn ${n} lần trước khi qua ô Bắt Đầu)` : ''; };
      const rolledText = `Lắc ra ${d.a} + ${d.b}${d.bike ? `, đạp xe ${d.sum} ô` : ` = ${d.sum}`}`;
      const fwdLine = `Đi tới: <b>${tileLabel(fwd)}</b>${this.tileInfo(p, fwd, d)}`;
      const text = {
        eyebrow: `Kỹ năng · ${[canBack && `${skillById('dh3').name}${left('dh3')}`,
          canReroll && `${skillById('dd3').name}${left('dd3')}`].filter(Boolean).join(' · ')}`,
        title: canBack
          ? `${rolledText}: đi tới hay đi lùi?`
          : `${rolledText}: đi tới ${tileLabel(fwd)} hay lắc lại một viên?`,
        sub: canBack ? `${fwdLine}<br>Đi lùi: <b>${tileLabel(back)}</b>${this.tileInfo(p, back, d)}` : fwdLine,
        note: canReroll ? 'Xí Ngầu Gian: kết quả lắc lại là kết quả cuối, kể cả khi xấu hơn.' : '',
        owned: false,
        quick: true,
        dice: canReroll ? ['a', 'b'] : undefined,
        cancel: canBack ? 'Đi tới như thường' : undefined,
        esc: true,
      };
      const ids = canBack ? [fwd, back] : [fwd];
      const r = yield* this.g.ask(p.id, 'after-roll', { ids, text, d }, { ms: this.g.ms('askMs'), fallback: null });
      const pick = r.value;
      const v = pick === back && canBack ? 'back' : (pick === 'a' || pick === 'b') && canReroll ? pick : 'go';

      if (v === 'back') {
        spend(p, 'dh3');
        credit(p, 'dh3');
        this.bc(title('dh3'), `${named(p)} quay đầu, lùi ${d.sum} ô.`, { ms: 1800 });
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
        this.g.fx('dice', { a: d.a, b: d.b, only: v === 'a' ? 0 : 1 });
        this.bc(title('dd3'), `${named(p)} lắc lại một viên, giờ là <b>${d.a} + ${d.b}</b>${
          d.bike ? `, đạp xe đi <b>${d.sum}</b> ô` : ` = <b>${d.sum}</b>`}.`, { ms: 2000 });
        continue;
      }
      return { d, back: false };
    }
  }

  /** Một dòng tóm tắt ô đích cho câu hỏi sau khi lắc: của ai, thuê bao nhiêu. */
  tileInfo(p, id, d) {
    const owner = this.st.ownerOf(id);
    if (!BOARD[id].ownable) return '';
    if (!owner) return ' · còn trống';
    if (owner.id === p.id) return ' · đất của bạn';
    return ` · của ${owner.name}, thuê ${money(this.rent(p, id, d))}`;
  }

  /** Xe Đạp: tổng là viên nhỏ hơn; level 1 không tính đôi. */
  shape(p, d) {
    if (!d.bike && !has(p, 'dhS1')) return d;
    const { doubles } = param(p, 'dhS1');
    return { ...d, sum: Math.min(d.a, d.b), isDouble: doubles && d.a === d.b, bike: true };
  }

  pedal(p, d) {
    const { gas } = param(p, 'dhS1');
    credit(p, 'dhS1', gas);
    this.slip.push({ id: 'dhS1', text: `đạp xe ${d.sum} ô`, n: gas });
  }

  /** Báo và trả bản kê của lần lắc: một thông báo, một lần chuyển phần chênh. */
  *flushSlip(p, d) {
    const lines = this.slip;
    this.slip = [];
    if (!lines.length || p.bankrupt) return;
    const net = lines.reduce((n, l) => n + l.n, 0);
    const amt = (n) => (n > 0 ? ` <span class="up">+${money(n)}</span>` : n < 0 ? ` <span class="down">−${money(-n)}</span>` : '');
    const body = lines.map((l) => `<b>${skillById(l.id).name}</b>: ${l.text}${amt(l.n)}`).join('<br>');
    const sum = lines.length > 1 && net ? `<br>Cộng lại:${amt(net)}` : '';
    this.bc(lines.length === 1 ? title(lines[0].id) : 'KỸ NĂNG',
      `Ra ${d.a} + ${d.b} · ${named(p)}<br>${body}${sum}`, { kind: net < 0 ? 'bad' : null, ms: 1600 + 500 * lines.length });
    const pot = lines.reduce((n, l) => n + (l.pot ?? 0), 0);
    if (net > 0) this.g.receiveFromBank(p.id, net);
    else if (net < 0 && !(yield* this.g.payBank(p.id, -net))) return;
    this.st.pot += pot;
  }

  /** Chẵn Lẻ, Đôi Hên, Phượt Thủ: cộng trừ theo kết quả lắc; rồi Xổ Số của người khác. */
  *rollPerks(p, d) {
    if (d.bike) this.pedal(p, d);
    yield* this.lottoHits(p, d);
    if (p.bankrupt) { this.slip = []; return; }
    if (has(p, 'dd1')) {
      const { even, odd } = rolled(p, 'dd1');
      if (d.sum % 2 === 0) {
        credit(p, 'dd1', even);
        this.slip.push({ id: 'dd1', text: `tổng ${d.sum} chẵn`, n: even });
      } else if (odd > 0) {
        tally(p, 'dd1', -odd);
        this.slip.push({ id: 'dd1', text: `tổng ${d.sum} lẻ`, n: -odd });
      }
    }
    if (d.isDouble && has(p, 'dd2b') && (p.doubles ?? 0) < 3) {
      const n = roll(param(p, 'dd2b').double);
      credit(p, 'dd2b', n);
      this.slip.push({ id: 'dd2b', text: 'ra đôi', n });
    }
    if (d.sum >= 10 && has(p, 'dhX2')) {
      const n = roll(param(p, 'dhX2').bonus);
      credit(p, 'dhX2', n);
      this.slip.push({ id: 'dhX2', text: `lắc ra ${d.sum}`, n });
    }
    yield* this.flushSlip(p, d);
  }

  /** Đôi Hên: ra đôi lần thứ ba thì nhận thưởng thay vì vào tù. */
  *jackpot(p) {
    if (!has(p, 'dd2b')) return false;
    const n = roll(param(p, 'dd2b').jackpot);
    credit(p, 'dd2b', n);
    this.bc(title('dd2b'),
      `${named(p)} ra đôi lần thứ ba, không vào tù mà trúng <span class="up">${money(n)}</span>. Hết lượt.`, { ms: 3000 });
    this.g.receiveFromBank(p.id, n);
    return true;
  }

  /** Chốt cược và Tất Tay theo cú lắc đầu tiên, trước Xí Ngầu Gian. */
  *settleBets(p, d) {
    const st = this.st;
    const f = st.flow;
    this.slip = [];
    const got = parity(d.sum);
    const bet = pendingBet(st, f.bet);
    f.bet = null;
    if (bet) {
      const txu = bet.pick === 'big' || bet.pick === 'small';
      if (hits(bet.pick, d.sum)) {
        const n = Math.round(bet.amount * roll(param(p, txu ? 'ddX1' : 'dd2a').payout));
        credit(p, 'dd2a', txu ? 0 : n);
        if (txu) credit(p, 'ddX1', n);
        this.slip.push({ id: txu ? 'ddX1' : 'dd2a', text: `đoán đúng cửa ${PARITY_NAME[bet.pick]}`, n });
      } else {
        credit(p, 'dd2a', 0, { delta: -bet.amount });
        this.slip.push({ id: 'dd2a', text: `đoán sai cửa ${PARITY_NAME[bet.pick]}, tiền cược vào Quỹ Công`, n: -bet.amount, pot: bet.amount });
        if (has(p, 'ddX2')) {
          const back = Math.round(bet.amount * roll(param(p, 'ddX2').back));
          credit(p, 'ddX2', back);
          this.slip.push({ id: 'ddX2', text: 'ngân hàng hoàn một phần tiền cược', n: back });
        }
      }
    }

    const all = pendingBet(st, f.allIn);
    f.allIn = null;
    if (all) {
      const { win, lose } = rolled(p, 'ddU');
      const others = st.alive().filter((q) => q.id !== p.id);
      if (all.pick === got) {
        this.bc(title('ddU'), `Ra ${d.sum}: ${named(p)} thắng! Mỗi người trả ${Math.round(win * 100)}% tiền mặt.`, { kind: 'trade', ms: 2800 });
        for (const q of others) {
          const n = Math.floor(q.money * win);
          if (n <= 0 || q.bankrupt) continue;
          // Ghi theo số tiền thực vào ví: con nợ vỡ nợ thì chỉ chuyển số gom được
          const before = p.money;
          yield* this.g.payPlayer(q.id, p.id, n);
          tally(p, 'ddU', p.money - before);
        }
      } else {
        const each = Math.floor(p.money * lose);
        this.bc(title('ddU'), `Ra ${d.sum}: ${named(p)} thua, trả mỗi người <span class="down">${money(each)}</span>.`, { kind: 'bad', ms: 2800 });
        for (const q of others) {
          if (each <= 0 || p.bankrupt || q.bankrupt) continue;
          yield* this.g.payPlayer(p.id, q.id, each);
          tally(p, 'ddU', -each);
        }
      }
    }
  }

  /* ================================================================
     Việc làm một lần, chạy lúc Chốt kho
     ================================================================ */

  *doAllIn(p, pick) {
    spend(p, 'ddU');
    credit(p, 'ddU');
    this.st.flow.allIn = { turnNo: this.st.turnNo, seat: p.id, pick };
    this.g.sync();
    this.bc(title('ddU'), `${named(p)} tất tay cửa <b>${PARITY_NAME[pick]}</b> với cả bàn!`, { kind: 'trade', ms: 2600 });
  }

  /** Mua Lại ô đã chọn. Soát lại: ô có thể vừa có chủ trong lúc chọn. */
  *doLeftover(p, id) {
    const st = this.st;
    const o = leftoverOffers(st, p).find((x) => x.id === id);
    if (!o || st.owner.has(id) || p.money < o.price) return;
    const pct = Math.round(param(p, 'dcS1').price * 100);
    spend(p, 'dcS1');
    credit(p, 'dcS1');
    st.buyAt(p.id, id, o.price);
    this.g.sfx('buy');
    this.g.sync();
    this.bc(title('dcS1'), `${named(p)} nhặt <b>${tileLabel(id)}</b> với giá <span class="down">${money(o.price)}</span> (${pct}% giá gốc).`, { ms: 2400 });
    this.g.spot([id]);
    yield* this.brokerFees(p.id, id);
  }

  /** Siết Nợ ô đã chọn. */
  *doForeclose(p, id) {
    const st = this.st;
    const o = forecloseOffers(st, p).find((x) => x.id === id);
    const owner = o && st.ownerOf(id);
    if (!o || !owner) return;
    spend(p, 'dcV');
    credit(p, 'dcV');
    this.bc(title('dcV'),
      `${named(p)} siết nợ <b>${tileLabel(id)}</b> của ${named(owner)}: ${o.bank > 0
        ? `trả ngân hàng <span class="down">${money(o.bank)}</span>, ` : ''}trả ${named(owner)} <span class="down">${money(o.owner)}</span>.`,
      { kind: 'trade', ms: 3000 });
    if (o.bank > 0 && !(yield* this.g.payBank(p.id, o.bank))) return;
    if (o.owner > 0 && !(yield* this.g.payPlayer(p.id, owner.id, o.owner))) return;
    // Chủ cũ có thể vừa phá sản trong lúc chờ — ô đã về ngân hàng thì thôi
    if (st.owner.get(id) === owner.id) {
      st.mortgaged.delete(id);
      st.transfer(id, p.id);
      this.g.sfx('trade');
      this.g.sync();
      this.g.spot([id]);
    }
  }

  /** Chuyến Tàu Xuyên Việt tới ô đã chọn, thay cho lượt lắc. */
  *doTeleport(p, dest) {
    const st = this.st;
    credit(p, 'dhU');
    this.bc(title('dhU'), `${named(p)} đi thẳng tới <b>${tileLabel(dest)}</b>.`, { ms: 2200 });
    st.rolled = true;
    /* Bắt chờ **trước** khi đi; lần qua ô Bắt Đầu của chính chuyến tàu không
       được trừ thời gian chờ vừa đặt (`cdHold`). */
    spend(p, 'dhU');
    p.cdHold = { ...p.cdHold, dhU: st.turnNo };
    this.g.sync();
    try { yield* this.g.advance(p, (dest - p.pos + 40) % 40, null); } finally {
      const { dhU, ...rest } = p.cdHold ?? {};
      p.cdHold = rest;
    }
    if (st.over || p.bankrupt || p.inJail) yield* this.g.endTurn();
  }

  /* ================================================================
     Qua ô Bắt Đầu
     ================================================================ */

  /** Chạy **trước** khi tính lương: Thâm Niên đếm cả lần qua này. */
  lapStart(p) { return onLap(p, this.st.turnNo); }

  paid(p, parts) {
    for (const [id, n] of Object.entries(parts)) credit(p, id, n);
  }

  /** Chạy **sau** khi lãnh lương: thu quỹ Liên Đoàn, xây nhà Phố Cổ. */
  *lapEnd(p) {
    const st = this.st;
    if (has(p, 'cnU')) {
      const rate = levyRate(p);
      const each = levyEach(p);
      const payers = st.alive().filter((q) => q.id !== p.id && q.money > 0);
      if (each > 0 && payers.length) {
        this.bc(title('cnU'),
          `Quỹ ${Math.round(rate * 100)}% tiền mặt của ${named(p)}${
            each < Math.floor(p.money * rate) ? ` (trần ${money(each)})` : ''}: mỗi người nộp
           <span class="up">${money(each)}</span>${payers.some((q) => q.money < each) ? ' (ai không đủ thì nộp hết số đang có)' : ''}.`,
          { ms: 3000 });
        for (const q of payers) {
          const n = Math.min(each, q.money);
          if (n > 0 && !q.bankrupt && (yield* this.g.payPlayer(q.id, p.id, n))) credit(p, 'cnU', n);
        }
      }
    }
    // Phố Cổ level 3 xây 2 căn: mỗi căn chọn lại ô, vì luật xây đều tay đổi sau mỗi căn
    for (let k = has(p, 'acU') ? param(p, 'acU').houses : 0; k > 0; k--) {
      const id = freeHouseTarget(st, p.id);
      if (id == null) continue;
      const res = st.build(p.id, id, { free: true });
      if (!res.ok) continue;
      credit(p, 'acU');
      if (res.isHotel) st.heritage.add(id);
      this.g.sync();
      this.bc(title('acU'),
        res.isHotel
          ? `${named(p)} lên <b>khách sạn Di Sản</b> ở <b>${tileLabel(id)}</b> miễn phí, thuê ×${param(p, 'acU').mult}, không ai dỡ được.`
          : `${named(p)} được xây thêm 1 căn miễn phí ở <b>${tileLabel(id)}</b>.`, { ms: 3000 });
      yield* this.contractorNote(res.payouts);
      this.g.spot([id], 1600);
    }
  }

  /** Trạm Thu Phí BOT: mỗi chủ trạm thu một lần cho mọi trạm của họ bị đi ngang. */
  *tolls(p, from, steps) {
    for (const { owner, tiles, amount } of tollStops(this.st, p, from, steps)) {
      const n = Math.min(amount, p.money);
      if (n <= 0 || p.bankrupt || owner.bankrupt) continue;
      this.bc(title('dhV'),
        `${named(p)} đi ngang ${tiles.map((id) => `<b>${tileLabel(id)}</b>`).join(', ')},
         nộp phí cho ${named(owner)} <span class="down">${money(n)}</span>.`, { ms: 2000 });
      if (yield* this.g.payPlayer(p.id, owner.id, n)) credit(owner, 'dhV', n);
    }
  }

  /** Bảo Hiểm Xã Hội: thiếu tiền thì ngân hàng trả hộ phần thiếu (tối đa `cover`). */
  *insure(p, amount) {
    if (!ready(p, 'cnV') || p.money >= amount) return;
    const n = Math.min(amount - p.money, param(p, 'cnV').cover);
    spend(p, 'cnV');
    credit(p, 'cnV', n);
    this.bc(title('cnV'), `${named(p)} thiếu tiền, bảo hiểm trả hộ <span class="up">${money(n)}</span>.`, { ms: 2400 });
    this.g.receiveFromBank(p.id, n);
  }

  /** Xổ Số: người vừa lắc ra số người khác đã chọn thì trả người đó. */
  *lottoHits(p, d) {
    for (const q of this.st.alive()) {
      if (q.id === p.id || !has(q, 'ddV') || q.lotto !== d.sum) continue;
      const n = Math.min(lottoPrize(q, d.sum), p.money);
      if (n <= 0 || p.bankrupt) continue;
      this.bc(title('ddV'), `Ra ${d.sum}, trúng số của ${named(q)}: ${named(p)} trả <span class="down">${money(n)}</span>.`, { kind: 'trade', ms: 2200 });
      if (yield* this.g.payPlayer(p.id, q.id, n)) credit(q, 'ddV', n);
    }
  }

  /** Cò Quay Lương: quay gấp đôi hoặc một nửa. */
  spinPay(p, pay) {
    if (!has(p, 'ddS2')) return { pay, note: '' };
    const win = Math.random() < param(p, 'ddS2').win;
    const out = win ? pay * 2 : Math.round(pay / 2);
    credit(p, 'ddS2', Math.max(0, out - pay), { delta: out - pay });
    return { pay: out, note: win ? ' · <b>Cò Quay trúng, lương ×2</b>' : ' · <b>Cò Quay trượt, lương còn một nửa</b>' };
  }

  /** Góp Vốn: chủ đất vừa thu tiền thuê — ai góp vốn với họ nhận phần của mình. */
  *stakeShare(owner, amount) {
    for (const q of this.st.alive()) {
      if (q.id === owner.id || !has(q, 'dcS2') || q.stake !== owner.id) continue;
      const n = Math.round(amount * param(q, 'dcS2').share);
      if (n <= 0) continue;
      credit(q, 'dcS2', n);
      this.bc(title('dcS2'), `${named(q)} hưởng phần góp vốn <span class="up">${money(n)}</span>.`, { ms: 1700 });
      this.g.receiveFromBank(q.id, n);
    }
  }

  /** Dẫn Tour: mỗi người bị đi vượt qua trả phí, trong số tiền mặt họ đang có. */
  *tours(p, from, steps) {
    const passed = tourPassed(this.st, p, from, steps);
    if (!passed.length) return;
    const fee = param(p, 'dhS2').fee;
    for (const q of passed) {
      const n = Math.min(fee, q.money);
      if (n <= 0 || q.bankrupt || p.bankrupt) continue;
      this.bc(title('dhS2'), `${named(p)} dẫn tour vượt qua ${named(q)}, thu <span class="up">${money(n)}</span>.`, { ms: 1700 });
      if (yield* this.g.payPlayer(q.id, p.id, n)) credit(p, 'dhS2', n);
    }
  }

  /**
   * Rút thẻ Cơ Hội / Khí Vận. Có Bài Tẩy thì rút nhiều lá, người đang đi chọn
   * một lá; mấy lá còn lại chen về chồng ở chỗ ngẫu nhiên.
   */
  *drawCard(p, kind, usable) {
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
    const r = yield* this.g.ask(p.id, 'card-pick', { kind, hand: hand.map((h) => h.index) },
      { ms: this.g.ms('askMs'), fallback: 0 });
    const v = Number(r.value);
    const pick = hand[Number.isInteger(v) ? v : 0] ?? hand[0];
    for (const h of hand) {
      if (h !== pick) deck.pile.splice(Math.floor(Math.random() * (deck.pile.length + 1)), 0, h.index);
    }
    credit(p, 'ddS1');
    return pick;
  }

  /** Bảo Hộ Lao Động: thẻ bất lợi thì có lúc được bỏ qua. */
  *dodgeCard(p, card) {
    if (!has(p, 'cnS1')) return false;
    const t = cardType(card);
    const bad = (t === 'bank' && card.amount < 0) || t === 'repair' || t === 'curse' || (t === 'move' && card.jail);
    if (!bad || Math.random() >= param(p, 'cnS1').chance) return false;
    credit(p, 'cnS1');
    this.bc(title('cnS1'), `${named(p)} rút phải thẻ xấu, <b>Bảo Hộ Lao Động</b> cho bỏ qua: “${card.text}”.`, { ms: 2600 });
    return true;
  }

  cardBonus(p, amount) {
    if (!has(p, 'cnS1') || amount <= 0) return 0;
    const n = Math.round(amount * param(p, 'cnS1').bonus);
    credit(p, 'cnS1', n);
    return n;
  }

  /** Ở Tù Cho Lành: lương mỗi lượt ở trong tù, trả một lần mỗi lượt. */
  *jailWage(p) {
    this.slip = [];
    if (!has(p, 'cnS2') || !p.inJail || p.usedTurn?.cnS2 === this.st.turnNo) return;
    p.usedTurn = { ...p.usedTurn, cnS2: this.st.turnNo };
    const n = param(p, 'cnS2').pay;
    credit(p, 'cnS2', n);
    this.bc(title('cnS2'), `${named(p)} lãnh <span class="up">${money(n)}</span> tiền công trong tù.`, { ms: 1600 });
    this.g.receiveFromBank(p.id, n);
  }

  canSit(p) { return canSit(p); }
  sitsLeft(p) { return sitsLeft(p); }

  /** Nhặt Tiền Rơi — sau mỗi lần di chuyển. */
  *pickup(p) {
    if (!has(p, 'cn1')) return;
    const { chance, amount } = rolled(p, 'cn1');
    if (Math.random() >= chance) return;
    this.bc(title('cn1'), `${named(p)} nhặt được <span class="up">${money(amount)}</span> dọc đường.`, { ms: 1800 });
    credit(p, 'cn1', amount);
    this.g.receiveFromBank(p.id, amount);
  }

  /* ================================================================
     Tiền nong
     ================================================================ */

  /** Công Đoàn: thuế và tiền phạt từ thẻ chỉ thu một phần. */
  cut(p, amount) {
    if (!has(p, 'cn2b')) return amount;
    const due = Math.round(amount * roll(param(p, 'cn2b').pay));
    credit(p, 'cn2b', amount - due);
    return due;
  }
  cutNote(p) { return has(p, 'cn2b') ? ', đã giảm nhờ <b>Công Đoàn</b>' : ''; }

  /** Về Nhà: dừng ở Bến Đậu nhận thêm. */
  *parking(p) {
    if (!has(p, 'dh2b')) return;
    const n = roll(param(p, 'dh2b').parking);
    credit(p, 'dh2b', n);
    this.bc(title('dh2b'), `${named(p)} nhận thêm <span class="up">${money(n)}</span> ở Bến Đậu.`, { ms: 2000 });
    this.g.receiveFromBank(p.id, n);
  }

  rent(p, tileId, dice) { return this.rentBill(p, tileId, dice).total; }

  /**
   * Tiền thuê kèm phần mỗi kỹ năng góp vào. Tiền mặt đọc **trước khi** trả,
   * nên gọi ngay lúc sắp thu.
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

  rentPaid(_owner, bill) {
    for (const [q, id, g] of bill.credits) credit(q, id, g);
  }

  /** Môi Giới: người khác mua đất từ ngân hàng thì ai có kỹ năng này nhận hoa hồng. */
  *brokerFees(buyerId, tileId) {
    for (const q of this.st.players) {
      if (q.id === buyerId || !has(q, 'dc1')) continue;
      const fee = Math.round(BOARD[tileId].price * roll(param(q, 'dc1').rate));
      this.bc(title('dc1'), `${named(q)} nhận hoa hồng <span class="up">${money(fee)}</span> từ lô <b>${tileLabel(tileId)}</b>.`, { ms: 2000 });
      credit(q, 'dc1', fee);
      this.g.receiveFromBank(q.id, fee);
    }
  }

  /** Cò Đất: giao dịch có đất đổi chủ **giữa hai người khác**, ai có kỹ năng này nhận tiền cò. */
  *tradeFees(offer, A, B) {
    const ids = [...offer.give, ...offer.get];
    if (!ids.length) return;
    const worth = ids.reduce((n, id) => n + BOARD[id].price, 0);
    for (const q of this.st.alive()) {
      if (!has(q, 'dc2a') || q.id === A.id || q.id === B.id) continue;
      const { rate, cap } = rolled(q, 'dc2a');
      const fee = Math.min(cap, Math.round(worth * rate));
      this.bc(title('dc2a'), `${named(q)} nhận tiền cò <span class="up">${money(fee)}</span>.`, { ms: 2000 });
      credit(q, 'dc2a', fee);
      this.g.receiveFromBank(q.id, fee);
    }
  }

  /** Thầu Vật Liệu: tiền đã cộng trong GameState, ở đây chỉ loan tin. */
  *contractorNote(payouts) {
    if (!payouts?.length) return;
    const st = this.st;
    this.bc(title('dc2b'),
      payouts.map((x) => `${named(st.players[x.seat])} <span class="up">+${money(x.amount)}</span>`).join(', '), { ms: 1800 });
  }

  /* ================================================================
     Ô đáp xuống
     ================================================================ */

  /** Quân vừa dừng: Hai Ngón móc túi người giàu nhất đang đứng ở đó. */
  *landed(p) {
    const others = this.st.alive().filter((q) => q.id !== p.id && q.pos === p.pos);
    if (!others.length || p.bankrupt) return;
    if (has(p, 'dhX1')) {
      const rich = others.reduce((a, b) => (b.money > a.money ? b : a));
      yield* this.pickpocket(p, rich);
    }
    for (const q of others) {
      if (!p.bankrupt && has(q, 'dhX1')) yield* this.pickpocket(q, p);
    }
  }

  *pickpocket(thief, mark) {
    const { chance, pct, cap } = rolled(thief, 'dhX1');
    if (Math.random() >= chance) return;
    const n = Math.min(cap, Math.floor(mark.money * pct));
    if (n <= 0) return;
    this.bc(title('dhX1'), `${named(thief)} móc túi ${named(mark)} được <span class="up">${money(n)}</span>.`, { kind: 'trade', ms: 2200 });
    if (yield* this.g.payPlayer(mark.id, thief.id, n)) credit(thief, 'dhX1', n);
  }

  /** Khách Sộp: vừa mua xong một ô của ngân hàng thì được hoàn tiền. */
  *bought(p, tileId) {
    if (!has(p, 'dcX2')) return;
    const n = Math.round(BOARD[tileId].price * roll(param(p, 'dcX2').back));
    if (n <= 0) return;
    credit(p, 'dcX2', n);
    this.bc(title('dcX2'), `Ngân hàng hoàn cho ${named(p)} <span class="up">${money(n)}</span>.`, { ms: 1900 });
    this.g.receiveFromBank(p.id, n);
  }

  /** Chủ Nhà: dừng trên ô của chính mình thì nhận tiền. */
  *atHome(p) {
    if (!has(p, 'acX2')) return;
    const n = roll(param(p, 'acX2').bonus);
    credit(p, 'acX2', n);
    this.bc(title('acX2'), `${named(p)} về đất nhà, nhận <span class="up">${money(n)}</span>.`, { ms: 1900 });
    this.g.receiveFromBank(p.id, n);
  }

  /** Khách Quen Nhà Đá: vừa vào tù thì nhận bồi thường. */
  *jailed(p) {
    if (!has(p, 'cnX2')) return;
    const n = roll(param(p, 'cnX2').comp);
    credit(p, 'cnX2', n);
    this.bc(title('cnX2'), `${named(p)} nhận <span class="up">${money(n)}</span> bồi thường.`, { ms: 1800 });
    this.g.receiveFromBank(p.id, n);
  }

  /** Khách Quen Nhà Đá: ra tù khỏi nộp phạt. */
  freeBail(p, fine) {
    if (!has(p, 'cnX2')) return false;
    credit(p, 'cnX2', fine);
    return true;
  }

  /**
   * Thâu Tóm: dừng trên đất chưa có nhà của người khác thì được ép mua thay
   * vì trả thuê. Level 1 rút giá trước khi hỏi: số hiện trên hộp là số sẽ trả.
   */
  *trySeize(p, tileId, rent) {
    const st = this.st;
    const t = BOARD[tileId];
    const owner = st.ownerOf(tileId);
    if (!canSeize(st, p, tileId)) return false;
    const premium = roll(param(p, 'dc3').premium);
    const price = Math.round(t.price * premium);
    if (p.money < price) return false;
    const r = yield* this.g.ask(p.id, 'seize', { tileId, price, premium, rent, owner: owner.id },
      { ms: this.g.ms('askMs'), fallback: false });
    if (r.value !== true) return false;
    spend(p, 'dc3');
    credit(p, 'dc3');
    this.bc(title('dc3'),
      `${named(p)} ép mua <b>${tileLabel(tileId)}</b> của ${named(owner)}, trả
       <span class="down">${money(price)}</span>.`, { kind: 'trade' });
    if (!(yield* this.g.payPlayer(p.id, owner.id, price))) return true;
    if (st.owner.get(tileId) !== owner.id) return true;
    st.transfer(tileId, p.id);
    this.g.sfx('trade');
    this.g.sync();
    this.g.spot([tileId]);
    return true;
  }

  /** Tàu Tốc Hành: đang đứng ở bến/ga thì hỏi có đi tiếp tới bến/ga kế không. */
  *express(p, dice) {
    if (!has(p, 'dh2a') || this.expressing || p.bankrupt || p.inJail) return;
    if (BOARD[p.pos].type !== 'station') return;
    const { bonus, any } = param(p, 'dh2a');
    const i = STATIONS.indexOf(p.pos);
    const dests = any
      ? [1, 2, 3].map((k) => STATIONS[(i + k) % STATIONS.length])
      : [STATIONS[(i + 1) % STATIONS.length]];
    const passGo = dests.some((d) => d < p.pos);
    const text = {
      eyebrow: `Kỹ năng · ${skillById('dh2a').name}`,
      title: any ? 'Đi tiếp tới bến/ga nào?' : `Đi tiếp tới ${tileLabel(dests[0])}?`,
      sub: [
        bonus ? `Lên tàu nhận thêm <b class="up">${money(bonus)}</b>.` : '',
        passGo ? 'Đi ngang ô Bắt Đầu thì được nhận lương.' : '',
      ].filter(Boolean).join(' ') || 'Đi thẳng tới bến/ga đang sáng.',
      owned: false,
      quick: true,
      cancel: 'Ở lại',
    };
    const r = yield* this.g.ask(p.id, 'express', { ids: dests, text }, { ms: this.g.ms('askMs'), fallback: null });
    const dest = r.value;
    if (!dests.includes(dest)) return;
    credit(p, 'dh2a', bonus);
    this.bc(title('dh2a'), `${named(p)} lên tàu tới <b>${tileLabel(dest)}</b>.`, { ms: 1800 });
    if (bonus) this.g.receiveFromBank(p.id, bonus);
    if (p.bankrupt) return;
    this.expressing = true;
    try { yield* this.g.advance(p, (dest - p.pos + 40) % 40, dice); } finally { this.expressing = false; }
  }
}

export { isOff };
