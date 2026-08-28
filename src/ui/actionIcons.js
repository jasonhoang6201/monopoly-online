/**
 * Hình cho thanh nút hành động — nơi người chơi thao tác nhiều nhất, nên mỗi
 * nút đều có một hình đi kèm để liếc qua là biết bấm cái nào.
 *
 * Hai con xí ngầu vẽ đủ khối (mặt ngà, chấm son, nghiêng mỗi con một kiểu) cho
 * nút chính; những nút còn lại dùng nét vẽ đơn ăn theo `currentColor` nên đổi
 * màu nút là hình đổi theo.
 */

/* ==================================================================
   Xí ngầu
   ================================================================== */

/** Chỗ đứng của chấm trên mặt xí ngầu, tính theo tỉ lệ 0…1 của cạnh. */
const PIPS = {
  1: [[.5, .5]],
  2: [[.3, .3], [.7, .7]],
  3: [[.27, .27], [.5, .5], [.73, .73]],
  4: [[.3, .3], [.7, .3], [.3, .7], [.7, .7]],
  5: [[.3, .3], [.7, .3], [.5, .5], [.3, .7], [.7, .7]],
  6: [[.3, .25], [.7, .25], [.3, .5], [.7, .5], [.3, .75], [.7, .75]],
};

/**
 * Một con xí ngầu nằm nghiêng.
 * @param {{x:number,y:number,s:number,rot:number,face:number,pip:string}} o
 */
function die({ x, y, s, rot, face, pip }) {
  const n = (v) => Number(v.toFixed(2));
  const cx = n(x + s / 2);
  const cy = n(y + s / 2);
  // Chấm vẽ sau vệt sáng để không bị vệt sáng làm nhạt mất
  const dots = PIPS[face].map(([px, py]) =>
    `<circle cx="${n(x + px * s)}" cy="${n(y + py * s)}" r="${n(s * .105)}" fill="${pip}"/>`).join('');
  return `<g transform="rotate(${rot} ${cx} ${cy})">
      <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${n(s * .235)}"
            fill="#F7EDD8" stroke="#63301C" stroke-width="1.5"/>
      <rect x="${n(x + 2.5)}" y="${n(y + 2.5)}" width="${n(s - 5)}" height="${n(s * .34)}"
            rx="${n(s * .15)}" fill="#FFFFFF" opacity=".42"/>
      ${dots}
    </g>`;
}

/**
 * Hai con xí ngầu — mặt 4 chấm son đỏ theo lối xí ngầu ta, mặt 3 chấm mực nho.
 * Cỡ hình do CSS quyết định (`.ai-dice { height }`).
 */
export const diceSvg = () => `<svg class="ai ai-dice" viewBox="0 0 84 54"
    xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  ${die({ x: 5, y: 10, s: 34, rot: -14, face: 3, pip: '#2A1A12' })}
  ${die({ x: 44, y: 6, s: 36, rot: 12, face: 4, pip: '#B32A1C' })}
</svg>`;

/* ==================================================================
   Nét vẽ đơn — ăn màu theo nút
   ================================================================== */

const line = (cls, inner) => `<svg class="ai ${cls}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${inner}</svg>`;

/** Hai mũi tên ngược chiều — đổi chác qua lại. */
export const tradeSvg = () => line('ai-trade',
  '<path d="M3.5 9h14"/><path d="M14 5.5 17.5 9 14 12.5"/>'
  + '<path d="M20.5 15.5h-14"/><path d="M10 12 6.5 15.5 10 19"/>');

/** Nóc nhà — bảng đất đai, nhà cửa của mình. */
export const estateSvg = () => line('ai-estate',
  '<path d="M3 20.5h18"/><path d="M5.5 20.5V9.8L12 4.5l6.5 5.3v10.7"/>'
  + '<path d="M10 20.5v-5.2h4v5.2"/>');

/** Đường tiền tụt dốc — cửa phá sản. */
export const bankruptSvg = () => line('ai-bankrupt',
  '<path d="M3.5 7.5 9.5 13.5 12.8 10.2 20.5 17.9"/><path d="M20.5 12.9v5h-5"/>');

/** Dấu tích — chốt lượt, xong việc. */
export const doneSvg = () => line('ai-done', '<path d="M4.5 12.5 9.8 17.8 19.5 6.5"/>');

/** Đồng tiền — nộp phạt ra tù. */
export const coinSvg = () => line('ai-coin',
  '<circle cx="12" cy="12" r="8.6"/><path d="M12 6.9v10.2"/>'
  + '<path d="M14.6 9.6c0-1.1-1.2-2-2.6-2s-2.6.9-2.6 2 1.2 2 2.6 2 2.6.9 2.6 2-1.2 2-2.6 2-2.6-.9-2.6-2"/>');
