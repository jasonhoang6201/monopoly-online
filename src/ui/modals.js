/**
 * Toàn bộ hộp thoại của game: chọn người chơi, mua đất, rút thẻ,
 * quản lý tài sản (xây/bán/thế chấp/chuộc), giao dịch hai chiều,
 * phá sản và tổng kết ván.
 */
import { openModal, handoff } from './modal.js';
import {
  BOARD, GROUPS, money, tileLabel, tileShortLabel, JAIL_FINE, START_MONEY,
} from '../data/board.js';
import { TOKENS, MAX_PLAYERS } from '../core/state.js';
import { DECK_META } from '../data/cards.js';
import { deedCard, deedGrid, rentLevels, priceItems, tileCardUrl } from './deed.js';
import { tokenImage } from './hud.js';
import { buildGlyphs, buildLabel, houseSvg, hotelSvg, bankSvg, keySvg } from '../render/glyphs.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Màu chip đại diện cho một ô. */
export function chipColor(tileId) {
  const t = BOARD[tileId];
  if (t.type === 'property') return t.groupHex;
  if (t.type === 'station') return '#27418C';
  return '#2E6B52';
}

/** Màu hex kèm độ trong — để nhuộm nền thẻ theo đúng màu của ô. */
function hexA(hex, a) {
  const v = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

/* ==================================================================
   Màn hình bắt đầu
   ================================================================== */

export function setupModal() {
  let count = 2;
  const names = Array.from({ length: MAX_PLAYERS }, (_, i) => `Người chơi ${i + 1}`);
  const counts = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 2);   // 2…6

  return openModal({
    eyebrow: 'CỜ TỶ PHÚ · SÀI GÒN – GIA ĐỊNH',
    title: 'Bày bàn cờ',
    sub: `Từ 2 đến ${MAX_PLAYERS} người, mỗi người bắt đầu với ${money(START_MONEY)}.
          Chơi luân phiên trên cùng một máy.`,
    dismissible: false, // chưa bày xong bàn thì không có gì để quay về
    peekable: false,    // ván chưa mở, ngó bàn cờ cũng chẳng thấy gì
    body: '<div id="setup-inner"></div>',
    buttons: [{ label: 'Khai cuộc', value: 'go', cls: 'btn-primary' }],
    onMount: (bodyEl, close, modal, foot) => {
      const inner = bodyEl.querySelector('#setup-inner');

      const render = () => {
        inner.innerHTML = `
          <div class="setup-row">
            ${counts.map((n) => `<button class="count-btn ${n === count ? 'on' : ''}" data-n="${n}">${n}</button>`).join('')}
          </div>
          <div id="name-list"></div>
          <div class="trade-summary" style="margin-top:16px;text-align:left">
            <b style="color:var(--gold-light)">Luật rút gọn</b>
            <ul class="rules" style="margin-top:6px">
              <li>Đổ đôi được đi tiếp — <b>đổ đôi 3 lần liên tiếp thì vào tù</b>.</li>
              <li>Trong tù: nộp <b>${money(JAIL_FINE)}</b> hoặc đổ ra đôi, tối đa <b>3 lượt</b>.</li>
              <li>Đủ bộ màu mới được xây nhà. Cả bàn chỉ có <b>32 căn nhà</b>.</li>
              <li>Đủ 4 nhà mới lên khách sạn, và <b>trả lại 4 căn nhà</b> cho ngân hàng.</li>
              <li>Thế chấp lấy tiền mặt; chuộc lại chịu <b>lãi 10%</b>.</li>
            </ul>
          </div>`;

        const list = inner.querySelector('#name-list');
        list.innerHTML = names.slice(0, count).map((n, i) => `
          <div class="name-row">
            <span class="dot" style="background:${TOKENS[i].css}"></span>
            <input type="text" maxlength="14" value="${esc(n)}" data-i="${i}" />
            <span style="font-size:11px;opacity:.6">${TOKENS[i].name}</span>
          </div>`).join('');

        inner.querySelectorAll('.count-btn').forEach((b) => {
          b.addEventListener('click', () => { count = +b.dataset.n; render(); });
        });
        list.querySelectorAll('input').forEach((inp) => {
          inp.addEventListener('input', () => { names[+inp.dataset.i] = inp.value; });
        });
      };
      render();

      foot.querySelector('.btn').addEventListener('click', () => {
        close(names.slice(0, count).map((n, i) => (n.trim() || `Người chơi ${i + 1}`)));
      }, { once: true, capture: true });
    },
  }).then((v) => (Array.isArray(v) ? v : names.slice(0, count)));
}

/* ==================================================================
   Mua đất
   ================================================================== */

/** Thẻ chủ quyền để người chơi cân nhắc trước khi mua. */
function deedHtml(tileId) {
  const t = BOARD[tileId];
  const rows = [];
  if (t.type === 'property') {
    rows.push(['Tiền thuê', money(t.rents[0])]);
    rows.push(['Đủ bộ màu (chưa nhà)', money(t.rents[0] * 2)]);
    for (let i = 1; i <= 4; i++) rows.push([`Có ${i} nhà`, money(t.rents[i])]);
    rows.push(['Khách sạn', money(t.rents[5])]);
    rows.push(['Giá mỗi căn nhà', money(t.house_cost)]);
  } else if (t.type === 'station') {
    rows.push(['Sở hữu 1 bến', money(25)]);
    rows.push(['Sở hữu 2 bến', money(50)]);
    rows.push(['Sở hữu 3 bến', money(100)]);
    rows.push(['Sở hữu 4 bến', money(200)]);
  } else {
    rows.push(['Sở hữu 1 ô', '4 × tổng xí ngầu']);
    rows.push(['Sở hữu 2 ô', '10 × tổng xí ngầu']);
  }
  rows.push(['Giá thế chấp', money(t.mortgage)]);

  const band = t.type === 'property' ? t.groupHex : chipColor(tileId);
  const bandText = t.type === 'property' ? GROUPS[t.color_group].name
    : t.type === 'station' ? 'BẾN · NHÀ GA' : 'CÔNG ÍCH';

  return `<div class="deed">
      <div class="deed-band" style="background:${band}"><span>${bandText}</span></div>
      <div class="deed-name">${esc(t.name.split(' (')[0])}</div>
      ${t.current_name ? `<div class="deed-old">${esc(t.current_name)}</div>` : '<div style="height:9px"></div>'}
      <div class="deed-rows">
        ${rows.map(([k, v], i) => `<div class="deed-row${i === 0 ? ' hl' : ''}"><span>${k}</span><b>${v}</b></div>`).join('')}
      </div>
    </div>`;
}

export function buyModal(tileId, player) {
  const t = BOARD[tileId];
  const afford = player.money >= t.price;
  return openModal({
    eyebrow: 'CƠ HỘI TẬU ĐẤT',
    title: `${esc(t.name.split(' (')[0])} — ${money(t.price)}`,
    sub: afford
      ? `Bạn đang có ${money(player.money)}. Mua xong còn ${money(player.money - t.price)}.`
      : `Bạn chỉ có ${money(player.money)} — không đủ tiền mua.`,
    body: deedHtml(tileId),
    buttons: [
      { label: `Mua ${money(t.price)}`, value: 'buy', cls: 'btn-gold', disabled: !afford },
      { label: 'Bỏ qua', value: 'skip', cls: 'btn-ghost' },
    ],
  });
}

/* ==================================================================
   Rút thẻ Cơ Hội / Khí Vận
   ================================================================== */

export function cardModal(kind, card) {
  const meta = DECK_META[kind];
  const up = card.amount > 0;
  return openModal({
    eyebrow: 'BÓC THẺ',
    title: meta.title,
    body: `<div class="fate-card">
        <div class="fate-sigil" style="color:${meta.accent}">${meta.sigil}</div>
        <div class="fate-kind">${meta.title}</div>
        <div class="fate-text">${esc(card.text)}</div>
        <div class="fate-amount ${up ? 'up' : 'down'}">${up ? '+' : '−'}${money(Math.abs(card.amount))}</div>
      </div>`,
    buttons: [{ label: up ? 'Nhận tiền' : 'Đành chịu', value: true, cls: up ? 'btn-jade' : 'btn-danger' }],
  });
}

/* ==================================================================
   Quản lý tài sản: xây / bán nhà / thế chấp / chuộc
   ================================================================== */

/**
 * @param {GameState} state
 * @param {number} playerId
 * @param {Function} onChange gọi sau mỗi thao tác để cập nhật bàn cờ + HUD
 */
export function manageModal(state, playerId, onChange) {
  const p = state.players[playerId];

  return openModal({
    eyebrow: 'QUẢN LÝ TÀI SẢN',
    title: p.name,
    sub: 'Xây nhà, bán nhà, thế chấp lấy tiền mặt hoặc chuộc lại tài sản.',
    wide: true,
    body: '<div id="mg-body"></div>',
    buttons: [{ label: 'Xong', value: true, cls: 'btn-ghost' }],
    onMount: (bodyEl, close, modal) => {
      const host = bodyEl.querySelector('#mg-body');

      const render = () => {
        const props = state.propertiesOf(playerId);
        const sub = modal.querySelector('.modal-sub');
        sub.innerHTML = `Tiền mặt <b style="color:var(--gold-light)">${money(p.money)}</b>
          · Ngân hàng còn <b style="color:var(--gold-light)">${state.bankHouses}</b> nhà,
          <b style="color:var(--gold-light)">${state.bankHotels}</b> khách sạn`;

        if (props.length === 0) {
          host.innerHTML = '<div class="empty-note">Bạn chưa sở hữu ô đất nào.</div>';
          return;
        }

        // Gom theo nhóm màu, rồi tới bến/nhà ga và công ích
        const groups = [];
        for (const [key, g] of Object.entries(GROUPS)) {
          const ids = props.filter((id) => BOARD[id].color_group === key);
          if (ids.length) groups.push({ label: g.name, hex: g.hex, ids, full: state.hasFullGroup(playerId, key) });
        }
        const stations = props.filter((id) => BOARD[id].type === 'station');
        const utils = props.filter((id) => BOARD[id].type === 'utility');
        if (stations.length) groups.push({ label: 'Bến · Nhà ga', hex: '#27418C', ids: stations });
        if (utils.length) groups.push({ label: 'Công ích', hex: '#2E6B52', ids: utils });

        /* Một lưới hai cột duy nhất cho cả bảng: tiêu đề nhóm màu chiếm trọn
           bề ngang, các ô đất trong nhóm rải thành thẻ hai cột phía dưới.
           Xếp thế thì hai nhóm liền nhau không bị so le, mà mỗi nhóm vẫn
           đứng thành một khối riêng. */
        host.innerHTML = `<div class="mg-grid">${groups.map((g) => `
            <div class="asset-group-head">
              <span class="swatch" style="background:${g.hex}"></span>${esc(g.label)}
              ${g.full ? '<span class="monopoly-tag">ĐỦ BỘ</span>' : ''}
            </div>
            ${g.ids.map((id) => assetCardHtml(state, playerId, id)).join('')}
          `).join('')}</div>`;

        host.querySelectorAll('[data-act]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = +btn.dataset.tile;
            const act = btn.dataset.act;
            let res;
            if (act === 'build') res = state.build(playerId, id);
            else if (act === 'sell') res = state.sellHouse(playerId, id);
            else if (act === 'mortgage') res = state.mortgage(playerId, id);
            else if (act === 'redeem') res = state.redeem(playerId, id);
            onChange?.(act, id, res);
            render();
          });
        });
      };

      render();
    },
  });
}

/**
 * Nút thao tác trong bảng quản lý chỉ mang hình, không mang chữ — bốn nút với
 * đủ chữ "Xây nhà / Bán nhà / Thế chấp" thì thẻ nào cũng dài thượt. Tên đầy đủ
 * và số tiền nằm ở `title` + `aria-label`, nên rê chuột vẫn đọc được như cũ.
 *
 * @param {string} label tên thao tác, ghép vào đầu chú thích
 * @param {string} tip   phần còn lại của chú thích (giá tiền, hoặc lý do bị khoá)
 */
function actBtn(act, id, { cls, label, tip, icon, ok }) {
  const title = esc(tip ? `${label} — ${tip}` : label);
  return `<button class="btn btn-sm btn-ico ${cls}" data-act="${act}" data-tile="${id}"
      ${ok ? '' : 'disabled'} title="${title}" aria-label="${title}">${icon}</button>`;
}

/** Hình nhà kèm dấu cộng / trừ — xây thêm hay bán bớt một căn. */
const signed = (svg, sign) => `<span class="mg-ico">${svg}<b class="mg-sign">${sign}</b></span>`;

/**
 * Một ô đất trong bảng quản lý, dựng thành thẻ mang đúng màu của ô:
 * dải màu trên đầu, nền nhuộm nhạt cùng sắc, mức xây dựng vẽ bằng hình nhà
 * thật thay cho ký tự, rồi mới tới các khoản tiền và nút thao tác.
 */
function assetCardHtml(state, playerId, id) {
  const t = BOARD[id];
  const h = state.housesOn(id);
  const mortgaged = state.isMortgaged(id);
  const build = state.canBuild(playerId, id);
  const sell = state.canSellHouse(playerId, id);
  const mort = state.canMortgage(playerId, id);
  const red = state.canRedeem(playerId, id);
  const hex = chipColor(id);

  const kind = t.type === 'property' ? GROUPS[t.color_group].name
    : t.type === 'station' ? 'Bến · Nhà ga' : 'Công ích';

  const figs = [];
  if (t.type === 'property') {
    figs.push(['Thuê hiện tại', money(state.rentFor(id, 7))]);
    figs.push(['Giá một nhà', money(t.house_cost)]);
  } else {
    figs.push(['Thuê hiện tại', money(state.rentFor(id, 7))]);
    figs.push(['Giá gốc', money(t.price)]);
  }
  figs.push(mortgaged
    ? ['Tiền chuộc', money(t.redeem)]
    : ['Thế chấp được', money(t.mortgage)]);

  const state0 = h
    ? `<span class="mg-build ${h === 5 ? 'is-hotel' : ''}" title="${buildLabel(h)}">
         ${buildGlyphs(h)}<span class="mg-build-n">${buildLabel(h)}</span></span>`
    : '<span class="mg-build is-empty">Đất trống</span>';

  return `<article class="mg-card${mortgaged ? ' is-mortgaged' : ''}"
        style="--tile:${hex};--tile-soft:${hexA(hex, 0.14)};--tile-edge:${hexA(hex, 0.45)}">
      <span class="mg-band"></span>
      <header class="mg-head">
        <span class="mg-thumb" style="background-image:url('${tileCardUrl(id, 44)}')"></span>
        <span class="mg-id">
          <b class="mg-name">${esc(tileShortLabel(id))}</b>
          <span class="mg-kind"><i class="dot" style="background:${hex}"></i>${esc(kind)}</span>
        </span>
        ${mortgaged ? '<span class="mg-flag">THẾ CHẤP</span>' : ''}
      </header>
      <div class="mg-figs">
        ${figs.map(([k, v]) => `<span class="mg-fig"><span>${k}</span><b>${v}</b></span>`).join('')}
      </div>
      <footer class="mg-acts">
        ${state0}
        <span class="mg-btns">
          ${t.type === 'property' ? `
            ${actBtn('build', id, {
              cls: 'btn-jade', ok: build.ok,
              label: h >= 4 ? 'Lên khách sạn' : 'Xây thêm một căn nhà',
              tip: build.ok ? money(build.cost) : build.reason,
              icon: signed(h >= 4 ? hotelSvg() : houseSvg(), '+'),
            })}
            ${actBtn('sell', id, {
              cls: 'btn-ghost', ok: sell.ok,
              label: 'Bán lại một căn nhà',
              tip: sell.ok ? `nhận ${money(sell.refund)}` : sell.reason,
              icon: signed(houseSvg(), '−'),
            })}` : ''}
          ${mortgaged
            ? actBtn('redeem', id, {
              cls: 'btn-gold', ok: red.ok,
              label: 'Chuộc lại',
              tip: red.ok ? `trả ${money(red.cost)}, gồm lãi 10%` : red.reason,
              icon: keySvg(),
            })
            : actBtn('mortgage', id, {
              cls: 'btn-danger', ok: mort.ok,
              label: 'Thế chấp',
              tip: mort.ok ? `nhận ${money(mort.amount)}` : mort.reason,
              icon: bankSvg(),
            })}
        </span>
      </footer>
    </article>`;
}

/* ==================================================================
   Giao dịch (trading)
   ================================================================== */

/** Bước 1 — chọn đối tác. */
export function tradePickModal(state, playerId) {
  const others = state.players.filter((p) => !p.bankrupt && p.id !== playerId);
  return openModal({
    eyebrow: 'GIAO DỊCH',
    title: 'Chọn người để thương lượng',
    sub: 'Cả bàn sẽ thấy nội dung đề nghị và kết quả giao dịch.',
    body: `<div class="pick-grid">
        ${others.map((p) => `
          <button class="pick" data-id="${p.id}">
            <span class="dot" style="background:${p.token.css}"></span>
            <span>${esc(p.name)}
              <span class="sub">${money(p.money)} · ${state.propertiesOf(p.id).length} ô đất</span></span>
          </button>`).join('')}
      </div>`,
    buttons: [{ label: 'Thôi', value: null, cls: 'btn-ghost' }],
    onMount: (bodyEl, close) => {
      bodyEl.querySelectorAll('.pick').forEach((b) => {
        b.addEventListener('click', () => close(+b.dataset.id));
      });
    },
  });
}

/** Ô đất có nhà thì không trade được — phải bán hết nhà trước. */
function tradableIds(state, playerId) {
  return state.propertiesOf(playerId).filter((id) => state.housesOn(id) === 0);
}

/**
 * Bước 2 — dựng đề nghị. Hai bên hiện song song: tiền mặt + ô đất đang sở hữu.
 * @returns {Promise<null|{from,to,giveMoney,getMoney,give:number[],get:number[]}>}
 */
export function tradeBuildModal(state, fromId, toId) {
  const A = state.players[fromId];
  const B = state.players[toId];
  const give = new Set();
  const get = new Set();
  let giveMoney = 0, getMoney = 0;

  return openModal({
    eyebrow: 'ĐỀ NGHỊ GIAO DỊCH',
    title: `${esc(A.name)} ⇄ ${esc(B.name)}`,
    sub: 'Bấm vào ô đất để thêm hoặc bỏ khỏi đề nghị. Ô đang có nhà phải bán nhà trước mới trao đổi được.',
    wide: true,
    body: '<div id="tr-body"></div>',
    buttons: [
      { label: 'Gửi đề nghị', value: 'submit', cls: 'btn-primary' },
      { label: 'Huỷ', value: null, cls: 'btn-ghost' },
    ],
    onMount: (bodyEl, close, modal, foot) => {
      const host = bodyEl.querySelector('#tr-body');
      const submitBtn = foot.querySelector('.btn-primary');

      const sideHtml = (p, cls, sel, cash, inputId) => {
        const ids = tradableIds(state, p.id);
        const blocked = state.propertiesOf(p.id).filter((id) => state.housesOn(id) > 0);
        return `<div class="trade-side ${cls}">
            <div class="trade-side-head">
              <span class="dot" style="background:${p.token.css}"></span>
              <span class="who">${esc(p.name)}</span>
              <span class="cash">${money(p.money)}</span>
            </div>
            <div class="money-field">
              <label>Tiền mặt</label>
              <input type="number" min="0" max="${p.money}" step="10" value="${cash}" id="${inputId}" />
            </div>
            ${ids.length === 0 && blocked.length === 0
              ? '<div class="empty-note">Chưa có ô đất nào.</div>'
              : ids.map((id) => `
                  <div class="arow selectable ${sel.has(id) ? 'selected' : ''} ${state.isMortgaged(id) ? 'mortgaged' : ''}"
                       data-side="${cls}" data-tile="${id}">
                    <span class="arow-thumb" style="background-image:url('${tileCardUrl(id, 30)}')"></span>
                    <span class="arow-main">
                      <span class="arow-name">${esc(tileShortLabel(id))}
                        ${state.isMortgaged(id) ? '<span class="arow-tag">THẾ CHẤP</span>' : ''}</span>
                      <span class="arow-meta">Giá gốc ${money(BOARD[id].price)}</span>
                    </span>
                    <span class="arow-side">${sel.has(id) ? '✔' : ''}</span>
                  </div>`).join('')}
            ${blocked.length ? `<div class="empty-note" style="padding:8px">
                ${blocked.length} ô đang có nhà — không trao đổi được.</div>` : ''}
          </div>`;
      };

      const render = () => {
        host.innerHTML = `
          <div class="trade-grid">
            ${sideHtml(A, 'mine', give, giveMoney, 'give-money')}
            <div class="trade-swap">⇄</div>
            ${sideHtml(B, 'theirs', get, getMoney, 'get-money')}
          </div>
          <div class="trade-summary" id="tr-sum"></div>`;

        host.querySelectorAll('.arow.selectable').forEach((row) => {
          row.addEventListener('click', () => {
            const id = +row.dataset.tile;
            const set = row.dataset.side === 'mine' ? give : get;
            set.has(id) ? set.delete(id) : set.add(id);
            render();
          });
        });

        const gm = host.querySelector('#give-money');
        const tm = host.querySelector('#get-money');
        gm.addEventListener('input', () => {
          giveMoney = Math.max(0, Math.min(A.money, Math.floor(+gm.value || 0)));
          summary();
        });
        tm.addEventListener('input', () => {
          getMoney = Math.max(0, Math.min(B.money, Math.floor(+tm.value || 0)));
          summary();
        });

        summary();
      };

      const summary = () => {
        const el = host.querySelector('#tr-sum');
        const empty = give.size === 0 && get.size === 0 && giveMoney === 0 && getMoney === 0;
        submitBtn.disabled = empty;
        el.innerHTML = empty
          ? '<span class="none">Hãy chọn ít nhất một thứ để trao đổi.</span>'
          : `<b style="color:${A.token.css}">${esc(A.name)}</b> đưa: ${describe(state, give, giveMoney)}
             <br><b style="color:${B.token.css}">${esc(B.name)}</b> đưa: ${describe(state, get, getMoney)}`;
      };

      render();

      submitBtn.addEventListener('click', () => {
        close({
          from: fromId, to: toId,
          give: [...give], get: [...get],
          giveMoney, getMoney,
        });
      }, { capture: true, once: true });
    },
  }).then((v) => (v && v !== 'submit' ? v : null));
}

/**
 * Diễn giải một vế của đề nghị thành chữ — dùng cho cả bảng tóm tắt
 * lẫn thông báo giữa màn hình để cả bàn cùng theo dõi.
 */
export function describe(state, ids, cash) {
  const parts = [];
  if (cash > 0) parts.push(`<b>${money(cash)}</b>`);
  for (const id of ids) {
    const tag = state?.isMortgaged(id) ? ' <i style="opacity:.7;font-size:.85em">(thế chấp)</i>' : '';
    parts.push(`<b>${esc(tileLabel(id))}</b>${tag}`);
  }
  return parts.length ? parts.join(' · ') : '<span class="none">không có gì</span>';
}

/** Bước 3 — người nhận xem xét và quyết định. */
/**
 * @param {GameState} state
 * @param {object} offer
 * @param {number} [ms] bản online: hạn trả lời. Quá hạn thì hộp thoại tự đóng
 *   và trả về `'timeout'` — khác hẳn `false` (từ chối đàng hoàng), vì bên hỏi
 *   phải phân biệt được hai chuyện: một bên là quyết định, bên kia là bỏ bàn.
 */
export function tradeReviewModal(state, offer, ms = 0) {
  const A = state.players[offer.from];
  const B = state.players[offer.to];
  const mortIn = offer.give.filter((id) => state.isMortgaged(id));

  let ticker = 0;
  const p = openModal({
    eyebrow: 'XÉT DUYỆT GIAO DỊCH',
    title: `${esc(A.name)} muốn thương lượng`,
    sub: `Quyết định thuộc về ${esc(B.name)} — giao dịch chỉ thành khi cả hai đồng ý.`,
    wide: true,
    body: `
      <div class="trade-grid">
        <div class="trade-side mine">
          <div class="trade-side-head">
            <span class="dot" style="background:${A.token.css}"></span>
            <span class="who">${esc(A.name)} đưa</span>
          </div>
          ${offerListHtml(state, offer.give, offer.giveMoney)}
        </div>
        <div class="trade-swap">⇄</div>
        <div class="trade-side theirs">
          <div class="trade-side-head">
            <span class="dot" style="background:${B.token.css}"></span>
            <span class="who">${esc(B.name)} đưa</span>
          </div>
          ${offerListHtml(state, offer.get, offer.getMoney)}
        </div>
      </div>
      ${mortIn.length ? `<div class="trade-summary" style="background:rgba(179,50,42,.15);border-color:rgba(179,50,42,.45)">
          Bạn sẽ nhận <b>${mortIn.length}</b> ô đang thế chấp. Sau khi nhận, bạn được mời chuộc lại
          với phí <b>tiền thế chấp + 10%</b> (có thể chuộc sau trong mục Quản lý tài sản).
        </div>` : ''}`,
    buttons: [
      { label: 'Đồng ý giao dịch', value: true, cls: 'btn-jade' },
      { label: 'Từ chối', value: false, cls: 'btn-danger' },
    ],
    onMount: (body, close) => {
      if (!ms) return;
      const el = document.createElement('div');
      el.className = 'trade-timer';
      body.appendChild(el);
      const until = Date.now() + ms;
      const tick = () => {
        const left = Math.max(0, until - Date.now());
        el.innerHTML = `Còn <b>${Math.ceil(left / 1000)} giây</b> để trả lời —
          quá hạn coi như bỏ bàn và mất chỗ.`;
        el.classList.toggle('warn', left <= 10000);
        if (left <= 0) close('timeout');
      };
      tick();
      ticker = setInterval(tick, 250);
    },
  });
  // Bấm nút hay hết giờ đều đi qua đây, nên dọn nhịp hẹn giờ ở đúng một chỗ
  p.finally(() => clearInterval(ticker));
  return p;
}

function offerListHtml(state, ids, cash) {
  const bits = [];
  if (cash > 0) {
    bits.push(`<div class="arow"><span class="arow-chip" style="background:#C8A048"></span>
        <span class="arow-main"><span class="arow-name">Tiền mặt</span></span>
        <span class="arow-side" style="color:var(--gold-light);font-family:var(--serif)">${money(cash)}</span></div>`);
  }
  for (const id of ids) {
    bits.push(`<div class="arow ${state.isMortgaged(id) ? 'mortgaged' : ''}">
        <span class="arow-thumb" style="background-image:url('${tileCardUrl(id, 30)}')"></span>
        <span class="arow-main"><span class="arow-name">${esc(tileShortLabel(id))}
          ${state.isMortgaged(id) ? '<span class="arow-tag">THẾ CHẤP</span>' : ''}</span>
          <span class="arow-meta">Giá gốc ${money(BOARD[id].price)}</span></span>
      </div>`);
  }
  return bits.length ? bits.join('') : '<div class="empty-note">Không có gì</div>';
}

/** Sau khi nhận đất thế chấp — mời chủ mới chuộc lại ngay. */
export function redeemPromptModal(state, playerId, tileIds) {
  const p = state.players[playerId];
  const total = tileIds.reduce((s, id) => s + BOARD[id].redeem, 0);
  return openModal({
    eyebrow: 'TÀI SẢN ĐANG THẾ CHẤP',
    title: 'Chuộc lại với ngân hàng?',
    sub: `Phí chuộc = tiền thế chấp + lãi 10%. Bạn đang có ${money(p.money)}.`,
    body: `${tileIds.map((id) => `
        <div class="arow">
          <span class="arow-thumb" style="background-image:url('${tileCardUrl(id, 30)}')"></span>
          <span class="arow-main"><span class="arow-name">${esc(tileShortLabel(id))}</span>
            <span class="arow-meta">Thế chấp ${money(BOARD[id].mortgage)} → chuộc ${money(BOARD[id].redeem)}</span></span>
        </div>`).join('')}
      <div class="trade-summary">Tổng phí chuộc tất cả: <b>${money(total)}</b></div>`,
    buttons: [
      { label: `Chuộc hết ${money(total)}`, value: 'all', cls: 'btn-gold', disabled: p.money < total },
      { label: 'Để sau', value: null, cls: 'btn-ghost' },
    ],
  });
}

/* ==================================================================
   Chi tiết một ô cờ  (bấm vào ô trên bàn cờ)
   ================================================================== */

const TYPE_LABEL = {
  property: 'Ô đất', station: 'Bến · Nhà ga', utility: 'Công ích',
  chance: 'Thẻ Cơ Hội', chest: 'Thẻ Khí Vận', tax: 'Ô thuế', corner: 'Ô góc',
};

const CORNER_NOTE = {
  0:  'Mỗi lần đi ngang hoặc dừng lại đây, ngân hàng trả lương 200$.',
  10: 'Chỉ ghé thăm thì vô sự. Bị giải vào đây thì phải nộp 50$, đổ ra đôi, hoặc ngồi đủ 3 lượt.',
  20: 'Nghỉ chân, không mất tiền cũng không được tiền.',
  30: 'Về thẳng Khám Lớn Sài Gòn, không được lãnh lương dọc đường.',
};

/**
 * Hộp thoại thông tin chi tiết của một ô: thẻ đất, chủ sở hữu,
 * bảng giá thuê đầy đủ có đánh dấu mức đang áp dụng.
 */
export function tileModal(state, tileId) {
  const t = BOARD[tileId];
  const owner = state.ownerOf(tileId);
  const houses = state.housesOn(tileId);
  const mortgaged = state.isMortgaged(tileId);
  const rents = rentLevels(state, tileId);
  const prices = priceItems(tileId);

  let status = '';
  if (t.ownable) {
    status = owner
      ? `<div class="owner-line">
           <span class="dot" style="background:${owner.token.css}"></span>
           <span>Chủ sở hữu: <b style="color:${owner.token.css}">${esc(owner.name)}</b>
             ${houses === 5 ? ' · <b>khách sạn</b>'
               : houses > 0 ? ` · <b>${houses} căn nhà</b>` : ''}
             ${mortgaged ? ' · <b style="color:#FF8A7A">đang thế chấp</b>' : ''}</span>
         </div>`
      : `<div class="owner-line"><span class="dot" style="background:#5A4632"></span>
           <span>Chưa có chủ — ai dừng lại đây cũng được quyền mua với giá
             <b style="color:var(--gold-light)">${money(t.price)}</b>.</span></div>`;
  }

  const here = state.players.filter((p) => !p.bankrupt && p.pos === tileId);

  // Mức thuê đang áp dụng — hiện luôn trên đầu thẻ để khỏi phải dò cả bảng
  const nowRent = rents.find((r) => r.now);
  const rentCard = `
    <section class="info-card">
      <div class="info-card-head">
        <span>Giá thuê theo mức xây dựng</span>
        ${nowRent && owner && !mortgaged
          ? `<span class="now-tag">Đang áp dụng · ${nowRent.value}</span>`
          : mortgaged ? '<span class="now-tag warn">Đang thế chấp · miễn thuê</span>' : ''}
      </div>
      <div class="rent-table">
        ${rents.map((r) => `
          <div class="rr${r.now ? ' now' : ''}">
            <span class="rr-ico">${r.ico}</span>
            <span class="rr-name">${r.label}</span>
            <b>${r.value}</b>
          </div>`).join('')}
      </div>
    </section>`;

  const costCard = `
    <section class="info-card">
      <div class="info-card-head"><span>Chi phí &amp; thế chấp</span></div>
      <div class="cost-grid">
        ${prices.map((c) => `
          <div class="cost-chip c-${c.key}${c.key === 'redeem' && mortgaged ? ' hl' : ''}">
            <span class="cost-label">${c.label}</span>
            <b>${c.value}</b>
            <span class="cost-note">${c.note}</span>
          </div>`).join('')}
      </div>
    </section>`;

  const notes = `
    ${t.type === 'tax' ? `<div class="owner-line"><span class="dot" style="background:#B3322A"></span>
        <span>Dừng ở đây phải nộp <b style="color:#FF8A7A">${money(t.tax_amount)}</b> cho ngân hàng.</span></div>` : ''}
    ${t.type === 'chance' || t.type === 'chest' ? `<div class="owner-line">
        <span class="dot" style="background:${t.type === 'chance' ? '#7C1E14' : '#2E6B52'}"></span>
        <span>Bóc một thẻ ngẫu nhiên: được thưởng hoặc phải chi tiền tuỳ vận may.</span></div>` : ''}
    ${t.type === 'corner' ? `<div class="owner-line"><span class="dot" style="background:#C8A048"></span>
        <span>${CORNER_NOTE[tileId]}</span></div>` : ''}
    ${here.length ? `<div class="owner-line">
        <span class="dot" style="background:${here[0].token.css}"></span>
        <span>Đang đứng tại ô này: <b>${here.map((p) => esc(p.name)).join(', ')}</b></span>
      </div>` : ''}`;

  // Ô không mua được chỉ có vài dòng chú thích — thu hộp thoại lại cho vừa
  const slim = !rents.length && !prices.length;

  // Giá thuê và chi phí cùng nằm trên một màn — không phải bấm qua lại
  const body = `
    <div class="tile-detail${slim ? ' slim' : ''}">
      <div class="tile-deed">${deedCard(state, tileId, { w: slim ? 190 : 220 })}</div>
      <div class="tile-info">
        ${status}
        ${rents.length ? rentCard : ''}
        ${prices.length ? costCard : ''}
        ${notes}
      </div>
    </div>`;

  return openModal({
    eyebrow: `Ô SỐ ${tileId} · ${TYPE_LABEL[t.type].toUpperCase()}`,
    title: esc(t.name.split(' (')[0]),
    sub: t.current_name ? esc(t.current_name) : null,
    wide: !slim,
    body,
    scrimClose: true,   // chỉ để xem — bấm ra ngoài là đóng
    buttons: [{ label: 'Đóng', value: true, cls: 'btn-ghost' }],
  });
}

/* ==================================================================
   Thông tin người chơi  (bấm vào thẻ người chơi bên trái)
   ================================================================== */

/**
 * Bảng tài sản đầy đủ của một người chơi: tiền mặt, tổng giá trị,
 * các ô đất dưới dạng thẻ, số nhà, ô đang thế chấp.
 * Bấm vào một thẻ sẽ mở chi tiết ô đó.
 */
export function playerModal(state, playerId) {
  const p = state.players[playerId];
  const props = state.propertiesOf(playerId);
  const houses = props.reduce((n, id) => n + (state.housesOn(id) === 5 ? 0 : state.housesOn(id)), 0);
  const hotels = props.filter((id) => state.housesOn(id) === 5).length;
  const mortgaged = props.filter((id) => state.isMortgaged(id));
  const worth = state.netWorth(playerId);

  // Gom theo nhóm màu rồi tới bến/nhà ga và công ích
  const groups = [];
  for (const [key, g] of Object.entries(GROUPS)) {
    const ids = props.filter((id) => BOARD[id].color_group === key);
    if (ids.length) {
      groups.push({ label: g.name, hex: g.hex, ids, full: state.hasFullGroup(playerId, key) });
    }
  }
  const stations = props.filter((id) => BOARD[id].type === 'station');
  const utils = props.filter((id) => BOARD[id].type === 'utility');
  if (stations.length) groups.push({ label: 'Bến · Nhà ga', hex: '#27418C', ids: stations });
  if (utils.length) groups.push({ label: 'Công ích', hex: '#2E6B52', ids: utils });

  const stat = (v, label, cls = '') => `<div class="pstat ${cls}"><b>${v}</b><span>${label}</span></div>`;

  const body = `
    <div class="phead">
      <span class="phead-token" style="background-image:url('${tokenImage(p.token)}')"></span>
      <span class="phead-main">
        <span class="phead-name">${esc(p.name)}</span>
        <span class="phead-sub">Quân ${p.token.name} ·
          ${p.bankrupt ? 'đã phá sản'
            : p.inJail ? `đang ở Khám Lớn (lượt ${p.jailTurns}/3)`
            : `đang ở ${esc(tileLabel(p.pos))}`}</span>
      </span>
    </div>

    <div class="pstat-row">
      ${stat(money(p.money), 'Tiền mặt', 'hl')}
      ${stat(money(worth), 'Tổng tài sản', 'hl')}
      ${stat(props.length, 'Ô đất')}
      ${stat(houses, 'Căn nhà')}
      ${stat(hotels, 'Khách sạn')}
      ${stat(mortgaged.length, 'Đang thế chấp')}
    </div>

    ${groups.length === 0
      ? '<div class="empty-note">Chưa sở hữu ô đất nào.</div>'
      : `<div class="asset-cols">${groups.map((g) => `
          <div class="asset-group">
            <div class="asset-group-head">
              <span class="swatch" style="background:${g.hex}"></span>${esc(g.label)}
              ${g.full ? '<span class="monopoly-tag">ĐỦ BỘ</span>' : ''}
            </div>
            ${deedGrid(state, g.ids, {
              w: 104,
              clickable: true,
              foot: null,
            })}
          </div>`).join('')}</div>`}

    ${mortgaged.length ? `<div class="trade-summary" style="text-align:left">
        <b style="color:#FF8A7A">Đang thế chấp</b> — tổng tiền chuộc lại
        <b>${money(mortgaged.reduce((s, id) => s + BOARD[id].redeem, 0))}</b>
        (đã gồm lãi 10%): ${mortgaged.map((id) => esc(tileLabel(id))).join(' · ')}
      </div>` : ''}`;

  return openModal({
    eyebrow: 'BẢNG TÀI SẢN',
    title: esc(p.name),
    sub: 'Bấm vào một thẻ đất để xem chi tiết ô đó.',
    wide: true,
    body,
    scrimClose: true,   // chỉ để xem — bấm ra ngoài là đóng
    buttons: [{ label: 'Đóng', value: null, cls: 'btn-ghost' }],
    onMount: (bodyEl, close) => {
      bodyEl.querySelectorAll('.deedcard.clickable').forEach((el) => {
        el.addEventListener('click', () => close({ openTile: +el.dataset.tile }));
      });
    },
  });
}

/* ==================================================================
   Phá sản & kết thúc
   ================================================================== */

/**
 * @param {number} [raisable] Tổng tiền tối đa xoay được (tiền mặt + bán nhà +
 *   thế chấp). Truyền vào khi vỡ nợ vì cả gia sản vẫn không đủ trả.
 */
export function bankruptModal(state, playerId, forced, owed, raisable) {
  const p = state.players[playerId];
  const props = state.propertiesOf(playerId);
  return openModal({
    eyebrow: forced ? 'KHÔNG CÒN KHẢ NĂNG CHI TRẢ' : 'TUYÊN BỐ PHÁ SẢN',
    title: forced ? `${esc(p.name)} vỡ nợ` : 'Bạn muốn phá sản?',
    sub: forced
      ? (raisable != null
          ? `Còn thiếu ${money(owed)}. Bán sạch nhà và thế chấp toàn bộ đất cũng chỉ được ${money(raisable)} — vỡ nợ ngay.`
          : `Còn thiếu ${money(owed)} mà tài sản đã cạn.`)
      : 'Toàn bộ tài sản sẽ được trả về ngân hàng và bạn rời khỏi ván đấu.',
    body: `<div class="trade-summary" style="background:rgba(179,50,42,.14);border-color:rgba(179,50,42,.45)">
        Trả về ngân hàng: <b>${props.length}</b> ô đất,
        <b>${props.reduce((n, id) => n + (state.housesOn(id) === 5 ? 0 : state.housesOn(id)), 0)}</b> căn nhà,
        <b>${props.filter((id) => state.housesOn(id) === 5).length}</b> khách sạn.
        <br>Nhà cửa nhập lại kho chung để người chơi khác mua tiếp.
      </div>`,
    buttons: forced
      ? [{ label: 'Chấp nhận', value: true, cls: 'btn-danger' }]
      : [
          { label: 'Phá sản', value: true, cls: 'btn-danger' },
          { label: 'Chơi tiếp', value: false, cls: 'btn-ghost' },
        ],
  });
}

export function winnerModal(state, winner) {
  const rank = [...state.players].sort((a, b) => {
    if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1;
    return state.netWorth(b.id) - state.netWorth(a.id);
  });
  return openModal({
    eyebrow: 'HẠ MÀN',
    title: `${esc(winner.name)} thắng ván này!`,
    sub: 'Bảng tổng kết gia sản',
    dismissible: false, // Esc lỡ tay không nên khởi động ván mới
    body: `<div class="crown">👑</div>
      ${rank.map((p, i) => `
        <div class="arow" style="${p.id === winner.id ? 'border-color:var(--gold-light);background:rgba(200,160,72,.14)' : ''}">
          <span class="arow-chip" style="background:${p.token.css}"></span>
          <span class="arow-main">
            <span class="arow-name">${i + 1}. ${esc(p.name)} · ${p.token.name}</span>
            <span class="arow-meta">${p.bankrupt ? 'Đã phá sản' : `${state.propertiesOf(p.id).length} ô đất · tiền mặt ${money(p.money)}`}</span>
          </span>
          <span class="arow-side" style="font-family:var(--serif);color:var(--gold-light)">${money(state.netWorth(p.id))}</span>
        </div>`).join('')}`,
    buttons: [{ label: 'Chơi ván mới', value: 'again', cls: 'btn-primary' }],
  });
}

export { handoff };
