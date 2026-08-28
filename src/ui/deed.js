/**
 * Thẻ đất dạng card — hiển thị mỗi ô đất y như một quân bài của bàn cờ.
 * Ảnh thẻ được vẽ một lần rồi lưu lại (cache) theo cặp (ô, bề ngang).
 */
import { paintTileCard } from '../render/boardArt.js';
import { isCorner } from '../render/geometry.js';
import { houseSvg, hotelSvg, HOUSE_PATH, HOTEL_PATH } from '../render/glyphs.js';
import { BOARD, money, tileShortLabel } from '../data/board.js';

const cache = new Map();

/** Ảnh thẻ của một ô, trả về dưới dạng data URL để nhúng vào HTML. */
export function tileCardUrl(tileId, w = 200) {
  const key = `${tileId}:${w}`;
  if (!cache.has(key)) {
    cache.set(key, paintTileCard(tileId, w * 2).toDataURL());   // ×2 cho màn Retina
  }
  return cache.get(key);
}

/**
 * Thẻ đất kèm huy hiệu trạng thái.
 * @param {GameState} state
 * @param {number} tileId
 * @param {object} [o]
 * @param {number} [o.w]         bề ngang thẻ (px)
 * @param {boolean}[o.clickable] gắn data-tile để bắt sự kiện bấm
 * @param {boolean}[o.selected]  đang được chọn (dùng trong giao dịch)
 * @param {string} [o.foot]      dòng chữ nhỏ dưới thẻ
 */
export function deedCard(state, tileId, o = {}) {
  const w = o.w ?? 120;
  const t = BOARD[tileId];
  const houses = state?.housesOn(tileId) ?? 0;
  const mortgaged = state?.isMortgaged(tileId) ?? false;

  const badges = [];
  if (houses === 5) badges.push(`<span class="deed-badge hotel">${hotelSvg()} Khách sạn</span>`);
  else if (houses > 0) badges.push(`<span class="deed-badge house">${houseSvg().repeat(houses)}</span>`);
  if (mortgaged) badges.push('<span class="deed-badge mort">Thế chấp</span>');

  return `<figure class="deedcard${isCorner(tileId) ? ' corner' : ''}${o.clickable ? ' clickable' : ''}${o.selected ? ' selected' : ''}${mortgaged ? ' is-mortgaged' : ''}"
        style="width:${w}px" ${o.clickable ? `data-tile="${tileId}"` : ''}
        title="${tileShortLabel(tileId).replace(/"/g, '&quot;')}">
      <span class="deedcard-img" style="background-image:url('${tileCardUrl(tileId, w)}')"></span>
      ${badges.length ? `<span class="deed-badges">${badges.join('')}</span>` : ''}
      ${o.foot ? `<figcaption class="deedcard-foot">${o.foot}</figcaption>` : ''}
    </figure>`;
}

/** Lưới thẻ đất. */
export function deedGrid(state, ids, o = {}) {
  if (!ids.length) return '<div class="empty-note">Chưa có ô đất nào.</div>';
  return `<div class="deed-grid">${ids.map((id) => deedCard(state, id, o)).join('')}</div>`;
}

/* ------------------------------------------------------------
   Hình nhỏ dùng trong bảng giá thuê — vẽ bằng SVG cho sắc nét
   ------------------------------------------------------------ */
/* Nhà và khách sạn dùng chung một bộ hình với bàn cờ và bảng quản lý tài sản */
const SVG_HOUSE = `<svg class="ico ico-house" viewBox="0 0 256 256" aria-hidden="true">
    <path d="${HOUSE_PATH}"/></svg>`;
const SVG_HOTEL = `<svg class="ico ico-hotel" viewBox="0 0 256 256" aria-hidden="true">
    <path d="${HOTEL_PATH}"/></svg>`;
const SVG_STATION = `<svg class="ico ico-station" viewBox="0 0 16 15" aria-hidden="true">
    <path d="M4 .9h8a2 2 0 0 1 2 2v6.4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2.9a2 2 0 0 1 2-2z"/>
    <rect class="win" x="4.1" y="3" width="7.8" height="3.1"/>
    <path d="M4.4 11.6 2.2 14.4h2.5l1.6-2.8zm7.2 0 2.2 2.8h-2.5l-1.6-2.8z"/></svg>`;
const SVG_UTILITY = `<svg class="ico ico-utility" viewBox="0 0 16 15" aria-hidden="true">
    <path d="M8 .8a5 5 0 0 1 5 5c0 2-1.2 3.1-1.9 4.1-.4.6-.6 1-.6 1.6H5.5c0-.6-.2-1-.6-1.6C4.2 8.9 3 7.8 3 5.8a5 5 0 0 1 5-5z"/>
    <rect class="win" x="5.6" y="12.2" width="4.8" height="1.9" rx=".9"/></svg>`;
const SVG_DEED = `<svg class="ico ico-deed" viewBox="0 0 14 15" aria-hidden="true">
    <path d="M2 .9h10a1 1 0 0 1 1 1v11.2a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V1.9a1 1 0 0 1 1-1z"/>
    <rect class="win" x="3.1" y="3.2" width="7.8" height="1.5"/>
    <rect class="win" x="3.1" y="6.4" width="7.8" height="1.2"/>
    <rect class="win" x="3.1" y="9.1" width="5.2" height="1.2"/></svg>`;

const repeat = (svg, n) => `<span class="ico-row">${svg.repeat(n)}</span>`;

/**
 * Các mức giá thuê của một ô, kèm hình minh hoạ số nhà / khách sạn.
 * @returns {Array<{ico:string,label:string,value:string,now:boolean}>}
 */
export function rentLevels(state, tileId) {
  const t = BOARD[tileId];
  const rows = [];
  const cur = state?.housesOn(tileId) ?? 0;
  const owner = state?.ownerOf(tileId);
  const full = owner && t.type === 'property' && state.hasFullGroup(owner.id, t.color_group);

  if (t.type === 'property') {
    rows.push({ ico: repeat(SVG_DEED, 1), label: 'Đất trống', value: money(t.rents[0]), now: cur === 0 && !full });
    rows.push({ ico: '<span class="ico-row"><span class="ico-set">★</span></span>', label: 'Đủ bộ màu', value: money(t.rents[0] * 2), now: cur === 0 && !!full });
    for (let i = 1; i <= 4; i++) {
      rows.push({ ico: repeat(SVG_HOUSE, i), label: `${i} nhà`, value: money(t.rents[i]), now: cur === i });
    }
    rows.push({ ico: repeat(SVG_HOTEL, 1), label: 'Khách sạn', value: money(t.rents[5]), now: cur === 5 });
  } else if (t.type === 'station') {
    const n = owner ? state.stationCount(owner.id) : 0;
    [25, 50, 100, 200].forEach((v, i) => rows.push({
      ico: repeat(SVG_STATION, i + 1), label: `${i + 1} bến`, value: money(v), now: n === i + 1,
    }));
  } else if (t.type === 'utility') {
    const n = owner ? state.utilityCount(owner.id) : 0;
    rows.push({ ico: repeat(SVG_UTILITY, 1), label: '1 ô công ích', value: '4 × xí ngầu', now: n === 1 });
    rows.push({ ico: repeat(SVG_UTILITY, 2), label: '2 ô công ích', value: '10 × xí ngầu', now: n === 2 });
  }
  return rows;
}

/** Các khoản tiền cố định của một ô (mua, thế chấp, chuộc, giá nhà). */
export function priceItems(tileId) {
  const t = BOARD[tileId];
  if (!t.ownable) return [];
  const items = [
    { key: 'buy', label: 'Giá mua', value: money(t.price), note: 'trả cho ngân hàng' },
    { key: 'mortgage', label: 'Thế chấp', value: money(t.mortgage), note: 'nhận về khi cầm' },
    { key: 'redeem', label: 'Chuộc lại', value: money(t.redeem), note: 'gồm lãi 10%' },
  ];
  if (t.type === 'property') {
    items.push({ key: 'house', label: 'Giá 1 nhà', value: money(t.house_cost), note: 'mỗi căn / khách sạn' });
  }
  return items;
}
