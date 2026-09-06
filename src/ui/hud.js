/**
 * HUD: thẻ người đang tới lượt bên trái (bấm mũi tên để xem cả bàn),
 * thanh nút hành động trong lòng bàn cờ, và bảng thông báo giữa màn hình
 * cho cả bàn cùng đọc.
 */
import { money, TOTAL_HOUSES, tileLabel } from '../data/board.js';
import { paintToken } from '../render/pieces.js';
import {
  eventsOn, unlocked, pressureRatio, threshold, eraOpen, modLabel,
} from '../core/events.js';

const $ = (id) => document.getElementById(id);

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Ảnh quân cờ dùng làm avatar — vẽ một lần rồi cache theo loại quân. */
const tokenArt = new Map();
export function tokenImage(token) {
  if (!tokenArt.has(token.key)) {
    tokenArt.set(token.key, paintToken(token.css, 120).toDataURL());
  }
  return tokenArt.get(token.key);
}

export class Hud {
  /**
   * @param {GameState} state
   * @param {(playerId:number)=>void} [onPlayerClick] mở bảng tài sản
   * @param {{refresh:Function}} [quick] bảng xem nhanh — vẽ lại cùng nhịp với HUD
   */
  constructor(state, onPlayerClick, quick) {
    this.state = state;
    this.onPlayerClick = onPlayerClick;
    this.quick = quick ?? null;
    this.cards = new Map();
    this.chips = new Map();
    /** Người đang được rê chuột trong danh sách (null = không rê ai). */
    this.popFor = null;
    /**
     * Bản online: tình trạng đường truyền của từng ghế — `'live'`, `'away'`
     * (đang mất kết nối) hay `'out'` (đã rời bàn). Bản một máy để trống.
     * @type {string[]}
     */
    this.seatStatus = [];
    this.buildPlayers();
  }

  /** Cập nhật tình trạng đường truyền rồi vẽ lại danh sách bên cột trái. */
  setSeatStatus(list) {
    this.seatStatus = list ?? [];
    this.refresh();
  }

  /**
   * Bản online: dải cảnh báo đường truyền của **máy mình** vừa đứt.
   *
   * Khác với chữ "mất kết nối" bên cột trái — chỗ ấy nói về người khác, cái
   * này nói về chính mình, nên phải nằm giữa lòng bàn cờ cho khỏi bỏ sót.
   */
  setLinkLost(lost) {
    $('link-warn')?.classList.toggle('show', !!lost);
  }

  /**
   * Bản online: đồng hồ đếm ngược của người đang phải ra quyết định.
   *
   * Nhận **mốc hết hạn** chứ không nhận số giây còn lại: vòng cung vẽ lại theo
   * nhịp khung hình, nên tính lại từ mốc thì rớt khung hình mấy cái cũng vẫn
   * chỉ đúng giờ. Truyền `null` để cất đồng hồ đi.
   *
   * @param {?{until:number,total:number,name:string,css:string,label:string}} c
   */
  setClock(c) {
    const box = $('turn-clock');
    if (!box) return;
    cancelAnimationFrame(this.clockRaf);
    if (!c) { box.classList.remove('show', 'warn'); return; }

    const arc = box.querySelector('.tc-arc');
    const num = box.querySelector('.tc-num');
    const who = box.querySelector('.tc-who');
    const C = 2 * Math.PI * 44;   // khớp với r=44 trong index.html
    box.style.setProperty('--tc-color', c.css);
    who.textContent = c.label ? `${c.name} · ${c.label}` : c.name;
    box.classList.add('show');

    const draw = () => {
      const left = Math.max(0, c.until - Date.now());
      arc.style.strokeDashoffset = String(C * (1 - left / c.total));
      num.textContent = String(Math.ceil(left / 1000));
      box.classList.toggle('warn', left <= 10000);
      // Hết giờ thì đứng ở số 0 — người xử lý là controller, không phải HUD
      if (left > 0) this.clockRaf = requestAnimationFrame(draw);
    };
    draw();
  }

  buildPlayers() {
    const wrap = $('players');
    wrap.innerHTML = '';
    this.cards.clear();
    // Thẻ đầy đủ dựng sẵn cho mọi người, nhưng chỉ thẻ của người tới lượt
    // được hiện (CSS lọc theo .is-shown) — đỡ phải dựng lại DOM mỗi lượt.
    for (const p of this.state.players) {
      const el = document.createElement('div');
      el.className = 'pcard' + (this.onPlayerClick ? ' clickable' : '');
      el.title = `Xem bảng tài sản của ${p.name}`;
      if (this.onPlayerClick) {
        el.addEventListener('click', () => this.onPlayerClick(p.id));
      }
      el.style.setProperty('--pc', p.token.css);
      el.innerHTML = `
        <div class="pcard-token" style="background-image:url('${tokenImage(p.token)}')"></div>
        <div class="pcard-body">
          <div class="pcard-name"><span></span></div>
          <div class="pcard-money"></div>
          <div class="pcard-meta"></div>
          <div class="pcard-where"></div>
        </div>`;
      wrap.appendChild(el);
      this.cards.set(p.id, el);
    }
    this.buildRoster();
    this.refresh();
  }

  /** Danh sách cả bàn: hàng ngang các thẻ nhỏ, luôn hiện. */
  buildRoster() {
    const rail = $('roster');
    if (!rail) return;
    rail.innerHTML = '';
    this.chips.clear();
    this.popFor = null;
    rail.classList.toggle('dense', this.state.players.length > 4);

    for (const p of this.state.players) {
      const chip = document.createElement('button');
      chip.className = 'rchip';
      chip.type = 'button';
      chip.title = `Xem bảng tài sản của ${p.name}`;
      chip.style.setProperty('--pc', p.token.css);
      chip.innerHTML = `
        <span class="rchip-token" style="background-image:url('${tokenImage(p.token)}')"></span>
        <span class="rchip-name"></span>
        <span class="rchip-money"></span>`;
      // Bấm thì mở bảng đầy đủ — bảng tóm tắt thu lại để khỏi che hộp thoại
      chip.addEventListener('click', () => {
        this.hidePop();
        this.onPlayerClick?.(p.id);
      });
      // Rê chuột (hoặc lia bàn phím) lên thẻ nhỏ → bảng tóm tắt bung ra bên cạnh
      chip.addEventListener('mouseenter', () => this.showPop(p.id));
      chip.addEventListener('focus', () => this.showPop(p.id));
      chip.addEventListener('mouseleave', () => this.hidePop(p.id));
      chip.addEventListener('blur', () => this.hidePop(p.id));
      rail.appendChild(chip);
      this.chips.set(p.id, chip);
    }
  }

  /* --------------------------------------------------- bảng tóm tắt khi rê */

  /** Khung bảng tóm tắt — dựng một lần rồi dùng lại cho mọi ván. */
  popEl() {
    let el = $('pop-card');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pop-card';
      el.setAttribute('role', 'tooltip');
      document.body.appendChild(el);
    }
    return el;
  }

  showPop(playerId) {
    this.popFor = playerId;
    const el = this.popEl();
    el.innerHTML = this.popHtml(playerId);
    el.classList.add('show');
    this.placePop(playerId);
  }

  hidePop(playerId) {
    if (playerId != null && this.popFor !== playerId) return;
    this.popFor = null;
    this.popEl().classList.remove('show');
  }

  /** Neo bảng ngay dưới thẻ nhỏ, không để tràn ra ngoài màn hình. */
  placePop(playerId) {
    const chip = this.chips.get(playerId);
    const el = this.popEl();
    if (!chip) return;
    const c = chip.getBoundingClientRect();
    const w = el.offsetWidth;
    const pad = 8;
    const left = Math.min(
      Math.max(pad, c.left + c.width / 2 - w / 2),
      window.innerWidth - w - pad,
    );
    const top = Math.min(c.bottom + 8, window.innerHeight - el.offsetHeight - pad);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    // Mũi nhọn chỉ đúng vào thẻ nhỏ dù bảng đã bị đẩy ngang cho khỏi tràn
    el.style.setProperty('--pop-arrow', `${Math.round(c.left + c.width / 2 - left)}px`);
  }

  popHtml(playerId) {
    const st = this.state;
    const p = st.players.find((x) => x.id === playerId);
    if (!p) return '';
    const props = st.propertiesOf(p.id);
    const houses = props.reduce((n, id) => n + (st.housesOn(id) === 5 ? 0 : st.housesOn(id)), 0);
    const hotels = props.filter((id) => st.housesOn(id) === 5).length;
    const mort = props.filter((id) => st.isMortgaged(id)).length;

    const rows = [
      ['Ô đất', props.length],
      ['Nhà', houses],
      ['Khách sạn', hotels],
      ['Thế chấp', mort],
    ];
    const tags = [];
    if (p.bankrupt) tags.push('<span class="pop-tag bad">Đã phá sản</span>');
    else if (p.inJail) tags.push(`<span class="pop-tag bad">Đang ở tù ${p.jailTurns}/3</span>`);
    if (st.turn === p.id && !st.over) tags.push('<span class="pop-tag turn">Đang tới lượt</span>');

    return `
      <div class="pop-head">
        <span class="pop-token" style="background-image:url('${tokenImage(p.token)}')"></span>
        <span class="pop-who">
          <b>${escapeHtml(p.name)}</b>
          <i>${p.bankrupt ? 'Đã phá sản' : money(p.money)}</i>
        </span>
      </div>
      <div class="pop-rows">
        ${rows.map(([k, v]) => `
          <div class="pop-row ${v ? '' : 'zero'}"><span>${k}</span><b>${v}</b></div>`).join('')}
      </div>
      ${tags.length ? `<div class="pop-tags">${tags.join('')}</div>` : ''}
      <div class="pop-foot">Bấm để xem bảng tài sản</div>`;
  }

  /**
   * Điểm neo cho hiệu ứng tiền bay: người đang tới lượt thì bay vào thẻ lớn,
   * những người còn lại bay vào thẻ nhỏ của họ trong danh sách.
   */
  cardEl(playerId) {
    if (this.state.turn === playerId) return this.cards.get(playerId);
    return this.chips.get(playerId) ?? this.cards.get(playerId);
  }
  bankEl() { return $('bank-plate'); }

  refresh() {
    const st = this.state;
    for (const p of st.players) {
      const el = this.cards.get(p.id);
      if (!el) continue;
      // Chỉ thẻ của người đang tới lượt được hiện; hết ván thì giữ nguyên
      // thẻ cuối cùng nhưng bỏ nhãn "đang đi".
      const active = st.turn === p.id && !st.over;
      el.classList.toggle('is-shown', st.turn === p.id);
      el.classList.toggle('is-active', active);
      el.classList.toggle('is-bankrupt', p.bankrupt);

      const name = el.querySelector('.pcard-name');
      name.firstElementChild.textContent = p.name;
      const chip = name.querySelector('.pcard-turn');
      if (active && !chip) {
        name.insertAdjacentHTML('beforeend', '<span class="pcard-turn">ĐANG ĐI</span>');
      } else if (!active && chip) {
        chip.remove();
      }

      el.querySelector('.pcard-money').textContent = p.bankrupt ? 'Đã phá sản' : money(p.money);

      const props = st.propertiesOf(p.id);
      const houses = props.reduce((n, id) => n + (st.housesOn(id) === 5 ? 0 : st.housesOn(id)), 0);
      const hotels = props.filter((id) => st.housesOn(id) === 5).length;
      const mort = props.filter((id) => st.isMortgaged(id)).length;
      const bits = [`${props.length} ô đất`];
      if (houses) bits.push(`${houses} nhà`);
      if (hotels) bits.push(`${hotels} k.sạn`);
      if (mort) bits.push(`${mort} thế chấp`);
      const away = this.seatStatus[p.id] === 'away';
      const meta = el.querySelector('.pcard-meta');
      meta.innerHTML = bits.join(' · ')
        + (p.inJail ? ` <span class="pcard-jail">TÙ ${p.jailTurns}/3</span>` : '')
        + (away ? ' <span class="pcard-off">MẤT KẾT NỐI</span>' : '');

      // Chỗ đang đứng — chỉ hiện cho người tới lượt cho đỡ rối mắt
      // (đang ngồi tù thì nhãn TÙ ở dòng trên đã nói rồi)
      const where = el.querySelector('.pcard-where');
      where.textContent = active && !p.bankrupt ? tileLabel(p.pos) : '';

      // Thẻ nhỏ trong danh sách cả bàn
      const rchip = this.chips.get(p.id);
      if (rchip) {
        rchip.classList.toggle('is-active', active);
        rchip.classList.toggle('is-bankrupt', p.bankrupt);
        // Mất kết nối: thẻ mờ đi và số tiền nhường chỗ cho chữ "mất kết nối",
        // để nhìn cột trái là biết ngay ai đang không ngồi máy.
        rchip.classList.toggle('is-away', away);
        rchip.querySelector('.rchip-name').textContent = p.name;
        rchip.querySelector('.rchip-money').textContent =
          p.bankrupt ? '—' : (away ? 'mất kết nối' : money(p.money));
        rchip.title = away
          ? `${p.name} đang mất kết nối`
          : `Xem bảng tài sản của ${p.name}`;
      }
    }

    $('bank-houses').textContent =
      `${st.bankHouses}/${TOTAL_HOUSES} nhà · ${st.bankHotels} k.sạn`;

    this.paintFate();

    // Bảng tóm tắt đang bung ra thì cập nhật theo luôn (tiền vừa đổi chủ…)
    if (this.popFor != null) this.showPop(this.popFor);

    // Bảng xem nhanh ăn theo cùng dữ liệu (chủ mới, nhà mới xây, thế chấp…)
    this.quick?.refresh();
  }

  /**
   * Thanh Thời Cuộc — cho cả bàn thấy sự kiện còn xa hay sắp tới.
   *
   * Báo trước là cố ý. Sự kiện ập xuống không một lời nào thì người thua sẽ
   * thấy mình bị xử ép; thấy thanh gần đầy thì đó lại thành một bài toán —
   * bán bớt nhà đi hay liều giữ, đổi đất ngay hay chờ.
   */
  paintFate() {
    const st = this.state;
    const box = $('fate-meter');
    if (!box) return;
    if (!eventsOn(st) || st.over) { box.hidden = true; return; }
    box.hidden = false;

    const ready = unlocked(st);
    const r = ready ? pressureRatio(st) : 0;
    const near = r >= 0.75;
    box.classList.toggle('warn', near);
    box.classList.toggle('idle', !ready);

    box.querySelector('.fm-state').textContent = !ready
      ? 'chưa tới lúc'
      : (near ? 'SẮP CÓ BIẾN' : `${Math.round(r * 100)}%`);
    box.querySelector('.fm-bar i').style.width = `${Math.round(r * 100)}%`;

    const bits = [];
    if (eraOpen(st) === 2) bits.push('Kỳ 2 · nhà đất');
    if (st.pot > 0) bits.push(`Quỹ Công ${money(st.pot)}`);
    for (const m of st.mods) {
      const l = modLabel(m);
      if (l) bits.push(l);
    }
    const note = box.querySelector('.fm-note');
    note.textContent = bits.join(' · ');
    note.hidden = bits.length === 0;
    box.title = ready
      ? `Áp lực ${st.pressure}/${threshold(st)} — đầy thì nổ một thẻ Thời Cuộc.`
      : 'Sự kiện chỉ bắt đầu khi bàn đã bán gần hết đất.';
  }

  /** Nhấp nháy số tiền khi tăng/giảm — cả thẻ lớn lẫn thẻ nhỏ trong danh sách. */
  flashMoney(playerId, up) {
    const cls = up ? 'flash-up' : 'flash-down';
    const targets = [
      this.cards.get(playerId)?.querySelector('.pcard-money'),
      this.chips.get(playerId)?.querySelector('.rchip-money'),
    ].filter(Boolean);
    for (const el of targets) {
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 700);
    }
  }

  /**
   * Dựng lại thanh nút hành động.
   * @param {Array<{label:string, key?:string, cls?:string, pulse?:boolean,
   *                disabled?:boolean, title?:string, icon?:string, hint?:string,
   *                onClick?:Function}>} buttons
   *   `key`  là phím tắt (một chữ cái) — hiện thành con dấu nhỏ trong nút.
   *   `icon` là chuỗi SVG dựng sẵn trong ui/actionIcons.js (không có chữ của người chơi).
   *   `hint` là dòng chú thích nhỏ nằm dưới nhãn.
   */
  setActions(buttons) {
    const bar = $('actions');
    bar.innerHTML = '';
    for (const b of buttons) {
      if (!b) continue;
      const btn = document.createElement('button');
      btn.className = `btn ${b.cls ?? ''}${b.pulse ? ' pulse' : ''}`;
      btn.disabled = !!b.disabled;
      const hint = b.key ? `Phím tắt: ${b.key.toUpperCase()}` : '';
      btn.title = b.title ? (hint ? `${b.title} · ${hint}` : b.title) : hint;

      // Hình bên trái, chữ bên phải — gói chung một khối để căn giữa cả cụm
      const face = document.createElement('span');
      face.className = 'btn-face';
      if (b.icon) {
        const ico = document.createElement('span');
        ico.className = 'btn-icon';
        ico.setAttribute('aria-hidden', 'true');
        ico.innerHTML = b.icon;
        face.appendChild(ico);
      }
      const text = document.createElement('span');
      text.className = 'btn-text';
      const label = document.createElement('span');
      label.className = 'btn-label';
      label.textContent = b.label;
      text.appendChild(label);
      if (b.hint) {
        const sub = document.createElement('span');
        sub.className = 'btn-hint';
        sub.textContent = b.hint;
        text.appendChild(sub);
      }
      face.appendChild(text);
      btn.appendChild(face);

      // Nhãn cho trình đọc màn hình giữ nguyên chữ, không đọc kèm chú thích lẫn con dấu phím
      btn.setAttribute('aria-label', b.label);
      if (b.key) {
        btn.dataset.key = b.key.toLowerCase();
        btn.setAttribute('aria-keyshortcuts', b.key.toUpperCase());
        const kbd = document.createElement('kbd');
        kbd.className = 'btn-key';
        kbd.textContent = b.key.toUpperCase();
        kbd.setAttribute('aria-hidden', 'true');
        btn.appendChild(kbd);
      }
      btn.addEventListener('click', () => b.onClick?.());
      bar.appendChild(btn);
    }
  }

  clearActions() { $('actions').innerHTML = ''; }
}

/* ==================================================================
   Phím tắt cho thanh nút hành động
   Phím nằm ngay trên nút (data-key) nên chỉ cần một người nghe duy nhất
   cho cả ván này lẫn các ván chơi lại sau — bấm phím đúng bằng bấm nút
   đang hiện, kể cả khi nút vừa được dựng lại.
   ================================================================== */

const isTyping = (el) => el instanceof HTMLInputElement
  || el instanceof HTMLTextAreaElement
  || (el instanceof HTMLElement && el.isContentEditable);

/** Nút hành động ứng với phím vừa bấm — null nếu lúc này không nên nhận phím. */
function actionForKey(e) {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (isTyping(e.target)) return null;
  // Đang có hộp thoại mở thì nhường phím cho hộp thoại (Esc, Space ngó bàn cờ…)
  if (document.querySelector('#modal-root .scrim:not(.hide)')) return null;
  const k = e.key.toLowerCase();
  if (!/^[a-z]$/.test(k)) return null;
  return document.querySelector(`#actions button[data-key="${k}"]`);
}

window.addEventListener('keydown', (e) => {
  const btn = actionForKey(e);
  if (!btn || btn.disabled) return;
  e.preventDefault();
  // Nháy nút một cái cho người chơi thấy phím vừa ăn vào đâu
  btn.classList.add('key-hit');
  setTimeout(() => btn.classList.remove('key-hit'), 200);
  btn.click();
});

/**
 * Thông báo giữa màn hình — mọi người quanh bàn đều đọc được,
 * dùng để theo dõi diễn biến ván đấu (đặc biệt là các thương vụ trade).
 */
export class Broadcast {
  constructor() {
    this.el = $('broadcast');
    this.queue = [];
    /**
     * Móc cho bản online: mỗi dòng thông báo được gửi luôn sang các máy khác,
     * để cả bàn đọc cùng một diễn biến chứ không riêng người đang đi.
     * @type {?(title:string, html:string, o:object)=>void}
     */
    this.onShow = null;
  }

  /**
   * @param {string} title  nhãn nhỏ in hoa
   * @param {string} html   nội dung (cho phép thẻ <b>, <span class="up|down">)
   * @param {object} [o]    { kind: 'trade'|'bad'|null, ms }
   */
  show(title, html, o = {}) {
    this.onShow?.(title, html, o);
    const div = document.createElement('div');
    div.className = `bcast${o.kind ? ` kind-${o.kind}` : ''}`;
    div.innerHTML = `<div class="bcast-title">${title}</div><div class="bcast-text">${html}</div>`;
    this.el.appendChild(div);

    // Giữ tối đa 3 thông báo cùng lúc
    while (this.el.children.length > 3) this.el.firstElementChild.remove();

    const ms = o.ms ?? 3400;
    setTimeout(() => {
      div.classList.add('out');
      setTimeout(() => div.remove(), 340);
    }, ms);
    return new Promise((r) => setTimeout(r, Math.min(ms, 900)));
  }

  clear() { this.el.innerHTML = ''; }
}
