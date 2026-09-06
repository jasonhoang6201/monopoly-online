/**
 * Hộp thoại riêng của bộ thẻ THỜI CUỘC.
 *
 * Khác với hộp thoại thường ở một chỗ: sự kiện hỏi tới **nhiều người cùng lúc**
 * (động đất hỏi mọi chủ đất trong khu, đấu giá hỏi cả bàn), nên hộp nào cũng
 * phải có đồng hồ và một câu trả lời mặc định lúc hết giờ. Không ai được phép
 * treo cả bàn chỉ vì bỏ đi pha cà phê.
 */
import { openModal } from './modal.js';
import { attachTimer } from './modals.js';
import { BOARD, money, tileShortLabel } from '../data/board.js';
import { tileCardUrl } from './deed.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Sắc thẻ theo tính chất sự kiện — đỏ là hoạ, xanh là phúc, vàng là đảo lộn. */
const TONE = {
  bad:   { accent: '#B3322A', label: 'TAI ƯƠNG' },
  good:  { accent: '#2E6B52', label: 'VẬN MAY' },
  chaos: { accent: '#C8A048', label: 'ĐẢO LỘN' },
};

/** Một dòng ô đất trong danh sách — dùng lại khắp các hộp thoại sự kiện. */
function tileRow(id, meta, extra = '') {
  return `
    <div class="arow">
      <span class="arow-thumb" style="background-image:url('${tileCardUrl(id, 30)}')"></span>
      <span class="arow-main">
        <span class="arow-name">${esc(tileShortLabel(id))}</span>
        <span class="arow-meta">${meta}</span>
      </span>
      ${extra}
    </div>`;
}

/**
 * Bày thẻ Thời Cuộc ra giữa màn hình.
 *
 * @param {object} card thẻ trong `data/events.js`
 * @param {string} detail dòng nói rõ sự kiện này rơi vào đâu, vào ai
 * @param {{ms?:number, label?:string}} [o] `ms` > 0 thì hộp tự đóng — dùng cho
 *   các máy đang ngồi xem, họ không phải bấm gì cả.
 */
export function eventCardModal(card, detail = '', o = {}) {
  const tone = TONE[card.kind] ?? TONE.chaos;
  const body = `
    <div class="fate-card event-card" style="--ev:${tone.accent}">
      <div class="event-kind">THỜI CUỘC · ${tone.label}</div>
      <div class="fate-sigil" style="color:${tone.accent}">${card.sigil}</div>
      <div class="event-title">${esc(card.title)}</div>
      <div class="fate-text">${esc(card.text.replace(/\s+/g, ' ').trim())}</div>
      ${detail ? `<div class="event-detail">${detail}</div>` : ''}
    </div>`;

  if (o.ms) {
    // Máy ngồi xem: hộp tự tắt, khỏi phải bấm — nhưng vẫn thấy đủ nội dung thẻ
    return openModal({
      eyebrow: 'BIẾN CỐ', title: 'Thời Cuộc', body,
      dismissible: false, peekable: false, buttons: [],
      onMount: (_body, close) => setTimeout(() => close(null), o.ms),
    });
  }

  return openModal({
    eyebrow: 'BIẾN CỐ', title: 'Thời Cuộc', body,
    dismissible: false,
    buttons: [{ label: o.label ?? 'Đành chịu', value: true, cls: 'btn-gold' }],
  });
}

/**
 * Động đất: chủ đất trong khu chọn bỏ tiền chống đỡ hay để nhà sập một tầng.
 *
 * @param {Array<{id:number,houses:number,brace:number}>} lots
 */
export function bracePromptModal(state, playerId, lots, ms = 0) {
  const p = state.players[playerId];
  const total = lots.reduce((s, l) => s + l.brace, 0);
  let ticker = 0;

  const pr = openModal({
    eyebrow: 'ĐỘNG ĐẤT',
    title: 'Chống đỡ nhà cửa?',
    sub: `Không chống đỡ thì mỗi ô sập một tầng, nhà về lại kho ngân hàng và
          <b>không được đền một đồng nào</b>. Bạn đang có ${money(p.money)}.`,
    body: `${lots.map((l) => tileRow(l.id,
      `Đang có ${l.houses === 5 ? 'khách sạn' : `${l.houses} nhà`} · chống đỡ ${money(l.brace)}`))
      .join('')}
      <div class="trade-summary">Chống đỡ tất cả: <b>${money(total)}</b></div>`,
    dismissible: false,
    buttons: [
      { label: `Chống đỡ ${money(total)}`, value: 'brace', cls: 'btn-gold', disabled: p.money < total },
      { label: 'Đành chịu', value: null, cls: 'btn-danger' },
    ],
    onMount: (body, close) => {
      if (ms) ticker = attachTimer(body, ms, close, null, 'để quyết định — quá hạn coi như chịu mất.');
    },
  });
  pr.finally(() => clearInterval(ticker));
  return pr;
}

/** Hoả hoạn: cứu một nửa số nhà bằng tiền thuê phu chữa cháy, hoặc mất sạch. */
export function firePromptModal(state, playerId, plan, ms = 0) {
  const p = state.players[playerId];
  const keep = plan.houses === 5 ? 2 : Math.floor(plan.houses / 2);
  let ticker = 0;

  const pr = openModal({
    eyebrow: 'HOẢ HOẠN',
    title: 'Thuê phu chữa cháy?',
    sub: `Để mặc thì cháy sạch nhà trên ô này. Chữa cháy thì giữ lại được
          <b>${keep} căn</b>. Bạn đang có ${money(p.money)}.`,
    body: `${tileRow(plan.tileId,
      `Đang có ${plan.houses === 5 ? 'khách sạn' : `${plan.houses} nhà`} · chữa cháy ${money(plan.save)}`)}
      <div class="trade-summary">Không chữa thì mất trắng
        <b>${plan.houses === 5 ? 'khách sạn' : `${plan.houses} căn`}</b>.</div>`,
    dismissible: false,
    buttons: [
      { label: `Chữa cháy ${money(plan.save)}`, value: 'save', cls: 'btn-gold', disabled: p.money < plan.save },
      { label: 'Để mặc nó cháy', value: null, cls: 'btn-danger' },
    ],
    onMount: (body, close) => {
      if (ms) ticker = attachTimer(body, ms, close, null, 'để quyết định — quá hạn thì cháy sạch.');
    },
  });
  pr.finally(() => clearInterval(ticker));
  return pr;
}

/**
 * Chọn một ô đất của mình — dùng cho "mất giấy tờ" và "hoán đổi địa bạ".
 *
 * Hết giờ thì hộp tự chọn ô **rẻ nhất**: bỏ trống thì sự kiện đứng lại, mà tự
 * chọn ô đắt thì hoá ra phạt người mất kết nối nặng hơn người ngồi bấm.
 *
 * @param {{eyebrow:string,title:string,sub:string,note?:string,confirm:string}} text
 */
export function pickTileModal(state, playerId, ids, text, ms = 0) {
  const cheapest = [...ids].sort((a, b) => BOARD[a].price - BOARD[b].price)[0];
  let choice = cheapest;
  let ticker = 0;

  const pr = openModal({
    eyebrow: text.eyebrow,
    title: text.title,
    sub: text.sub,
    dismissible: false,
    body: `<div class="pick-list">${ids.map((id) => `
        <label class="arow pick-row${id === choice ? ' on' : ''}" data-id="${id}">
          <input type="radio" name="pick-tile" value="${id}" ${id === choice ? 'checked' : ''} />
          <span class="arow-thumb" style="background-image:url('${tileCardUrl(id, 30)}')"></span>
          <span class="arow-main">
            <span class="arow-name">${esc(tileShortLabel(id))}</span>
            <span class="arow-meta">Giá gốc ${money(BOARD[id].price)}
              · thuê ${money(state.rentFor(id, 7))}</span>
          </span>
        </label>`).join('')}</div>
      ${text.note ? `<div class="trade-summary">${text.note}</div>` : ''}`,
    buttons: [{ label: text.confirm, value: 'pick', cls: 'btn-gold' }],
    onMount: (body, close) => {
      body.querySelectorAll('.pick-row').forEach((row) => {
        row.addEventListener('click', () => {
          choice = +row.dataset.id;
          body.querySelectorAll('.pick-row').forEach((r) => r.classList.toggle('on', r === row));
        });
      });
      if (ms) ticker = attachTimer(body, ms, close, 'pick', 'để chọn — quá hạn thì lấy ô rẻ nhất.');
    },
  });
  return pr.finally(() => clearInterval(ticker)).then(() => choice);
}

/**
 * Đấu giá kín một vòng: mỗi người ghi một con số, cao nhất lấy đất.
 *
 * Kín và một vòng là cố ý. Đấu giá nhiều vòng kiểu nhà hàng thì vui hơn thật,
 * nhưng bản online phải chờ từng người bấm qua từng vòng — một người rớt mạng
 * là cả bàn đứng. Ghi một lần rồi mở đồng loạt thì hỏi ai cũng như hỏi ai, và
 * chỉ tốn đúng một hạn chờ.
 */
export function auctionBidModal(state, playerId, tileId, o = {}) {
  const p = state.players[playerId];
  const t = BOARD[tileId];
  const max = p.money;
  let bid = 0;
  let ticker = 0;

  const pr = openModal({
    eyebrow: o.eyebrow ?? 'ĐẤU GIÁ',
    title: `${esc(t.name.split(' (')[0])}`,
    sub: `${o.reason ?? 'Lô đất này được đem bán đấu giá.'}
          Ghi số tiền bạn trả — <b>cao nhất thì lấy đất</b>, ghi 0 là bỏ qua.
          Bạn có ${money(max)}.`,
    dismissible: false,
    body: `
      ${tileRow(tileId, `Giá gốc ${money(t.price)} · thế chấp ${money(t.mortgage)}`)}
      <div class="bid-box">
        <label for="bid-input">Giá bạn trả</label>
        <input id="bid-input" type="number" min="0" max="${max}" step="10" value="0" />
        <div class="bid-quick">
          ${[0.5, 0.75, 1].map((f) => {
            const v = Math.min(max, Math.round(t.price * f));
            return `<button type="button" class="btn btn-ghost bid-q" data-v="${v}">${money(v)}</button>`;
          }).join('')}
        </div>
      </div>
      <div class="trade-summary">Đấu giá kín — mọi người ghi cùng lúc, hoà nhau thì
        người đi trước trong vòng lượt thắng.</div>`,
    buttons: [{ label: 'Chốt giá', value: 'bid', cls: 'btn-gold' }],
    onMount: (body, close) => {
      const input = body.querySelector('#bid-input');
      const read = () => {
        bid = Math.max(0, Math.min(max, Math.floor(+input.value || 0)));
      };
      input.addEventListener('input', read);
      body.querySelectorAll('.bid-q').forEach((b) => {
        b.addEventListener('click', () => { input.value = b.dataset.v; read(); });
      });
      setTimeout(() => input.focus(), 60);
      if (o.ms) ticker = attachTimer(body, o.ms, close, 'bid', 'để ghi giá — quá hạn coi như bỏ qua.');
    },
  });
  return pr.finally(() => clearInterval(ticker)).then(() => bid);
}
