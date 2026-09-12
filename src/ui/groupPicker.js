/**
 * Chọn một **khu màu**, chứ không chọn từng ô.
 *
 * Thẻ dỡ nhà nhắm tới mức khu: người dùng thẻ chỉ định khu, rồi bàn cờ bốc
 * thăm xem ô nào trong khu ấy lãnh đủ (`core/cards.js` → `demolishPicks`).
 * Mỗi dòng ở đây vì thế phải nói đủ ba điều để cân nhắc: khu ấy của ai, đang
 * có mấy ô dỡ được, và tổng cộng bao nhiêu cấp nhà đang đứng trong khu.
 *
 * Hộp này dùng chung cho cả bản một máy lẫn bản online, nên nhận `ms` để đếm
 * ngược: hết giờ thì trả `null`, bên gọi tự lấy khu mặc định.
 */
import { openModal } from './modal.js';
import { attachTimer } from './modals.js';
import { GROUPS, GROUP_TILES } from '../data/board.js';
import { PEEK_HINT } from './tilePicker.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Những ô trong khu đang nằm trong tầm ngắm, kèm số nhà và chủ đất. */
function lotsOf(state, group, ids) {
  return GROUP_TILES[group]
    .filter((id) => ids.includes(id))
    .map((id) => ({ id, houses: state.housesOn(id), seat: state.owner.get(id) }));
}

/** Tên chủ đất trong khu, mỗi người kể một lần. */
function ownerNames(state, lots) {
  const seen = [];
  for (const l of lots) {
    const p = state.players[l.seat];
    if (p && !seen.some((x) => x.id === p.id)) seen.push(p);
  }
  return seen.map((p) => `<b style="color:${p.token.css}">${esc(p.name)}</b>`).join(', ');
}

/**
 * @param {import('../core/state.js').GameState} state
 * @param {{groups:string[], ids:number[], levels:number}} data khu chọn được,
 *   các ô trong tầm ngắm, và số cấp nhà thẻ sẽ dỡ
 * @param {number} [ms] hạn chọn ở bản online; 0 là không đếm ngược
 * @returns {Promise<?string>} khoá khu đã chọn, `null` nếu hết giờ
 */
export function pickGroupModal(state, data, ms = 0) {
  const { groups, ids, levels } = data;
  let picked = null;
  let ticker = 0;

  const rows = groups.map((g) => {
    const lots = lotsOf(state, g, ids);
    const houses = lots.reduce((n, l) => n + l.houses, 0);
    return `
      <button type="button" class="grp-row" data-g="${g}">
        <span class="grp-swatch" style="background:${GROUPS[g].hex}"></span>
        <span class="grp-main">
          <span class="grp-name">${esc(GROUPS[g].name)}</span>
          <span class="grp-meta">${lots.length} ô dỡ được · ${houses} cấp nhà
            · ${ownerNames(state, lots)}</span>
        </span>
        <span class="grp-go">Chọn</span>
      </button>`;
  }).join('');

  const pr = openModal({
    eyebrow: 'DỠ NHÀ LẤN LỘ GIỚI',
    title: 'Dỡ nhà ở khu nào?',
    sub: `Bạn chỉ chọn khu. Bàn cờ sẽ <b>bốc thăm ${levels} ô</b> trong khu ấy,
          mỗi ô mất một cấp nhà — chủ đất không được đền đồng nào.`,
    body: `<div class="grp-list">${rows}</div>${PEEK_HINT}`,
    dismissible: false,
    buttons: [],
    onMount: (body, close) => {
      body.querySelectorAll('.grp-row').forEach((b) => {
        b.addEventListener('click', () => { picked = b.dataset.g; close(null); });
      });
      if (ms) ticker = attachTimer(body, ms, close, null, 'để chọn khu — quá hạn thì bàn cờ tự chọn.');
    },
  });
  return pr.then(() => { clearInterval(ticker); return picked; });
}
