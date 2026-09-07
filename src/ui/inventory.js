/**
 * Bảng TÚI THẺ: những lá Cơ Hội / Khí Vận người chơi đang giữ để dùng sau.
 *
 * Thẻ trong túi khác thẻ vừa bóc ở chỗ nó **chờ đúng lúc** — dỡ nhà ngay sau
 * khi đối phương cất khách sạn, cưỡng chiếm đúng lô còn thiếu để đủ bộ. Vì thế
 * mỗi dòng ở đây phải nói rõ hai điều: thẻ này làm gì, và *lúc này* có lôi ra
 * dùng được chưa (kèm lý do nếu chưa).
 */
import { openModal } from './modal.js';
import { CARD_KINDS, DECK_META } from '../data/cards.js';
import { inventoryOf } from '../core/cards.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Một dòng thẻ trong túi. */
function cardRow(item) {
  const meta = CARD_KINDS[item.card.type] ?? { name: 'Thẻ', sigil: '✦' };
  const deck = DECK_META[item.ref.kind];
  return `
    <div class="bag-row${item.ok ? '' : ' off'}">
      <span class="bag-sigil" style="color:${deck.accent}">${meta.sigil}</span>
      <span class="bag-main">
        <span class="bag-name">${esc(meta.name)}
          <i style="color:${deck.accent}">${deck.title}</i></span>
        <span class="bag-text">${esc(item.card.text.replace(/\s+/g, ' ').trim())}</span>
        ${item.ok ? '' : `<span class="bag-why">${esc(item.reason)}</span>`}
      </span>
      <button type="button" class="btn ${item.ok ? 'btn-gold' : 'btn-ghost'} bag-use"
        data-i="${item.i}" ${item.ok ? '' : 'disabled'}>Dùng</button>
    </div>`;
}

/**
 * Mở túi thẻ của một người.
 *
 * @param {import('../core/state.js').GameState} state
 * @param {number} playerId
 * @returns {Promise<?number>} vị trí thẻ muốn dùng, `null` nếu chỉ ngó rồi đóng
 */
export function inventoryModal(state, playerId) {
  const items = inventoryOf(state, playerId);
  const p = state.players[playerId];
  let pick = null;

  const pr = openModal({
    eyebrow: 'TÚI THẺ',
    title: p.name,
    sub: items.length
      ? `Đang giữ <b>${items.length}</b> thẻ. Thẻ đã dùng sẽ được trả về bộ bài.`
      : 'Túi trống — bóc trúng thẻ giữ được thì nó nằm ở đây.',
    wide: true,
    body: items.length
      ? `<div class="bag-list">${items.map(cardRow).join('')}</div>`
      : `<div class="trade-summary">Vé ra tù, lệnh dỡ nhà, cưỡng chiếm, giải toả —
           mấy thẻ ấy không nổ ngay lúc bóc mà nằm chờ trong túi cho tới khi bạn
           thấy đúng lúc.</div>`,
    buttons: [{ label: 'Đóng', value: null, cls: 'btn-ghost' }],
    onMount: (body, close) => {
      body.querySelectorAll('.bag-use').forEach((b) => {
        b.addEventListener('click', () => { pick = +b.dataset.i; close(null); });
      });
    },
  });
  return pr.then(() => pick);
}
