/**
 * Chọn một ô **ngay trên bàn cờ**, rồi hỏi lại cho chắc.
 *
 * Trước đây mấy thẻ nhắm vào nhà đất (dỡ nhà, ép bán, cưỡng chiếm, giải toả)
 * bày một danh sách trong hộp thoại. Đọc tên ô trong danh sách thì người chơi
 * vẫn phải tự dò xem ô ấy nằm góc nào của bàn — chọn nhầm là chuyện thường.
 * Ở đây quy trình đảo lại: bàn cờ sáng đúng những ô chọn được, bấm vào ô nào
 * thì hộp xác nhận mở ra cho ô ấy, đồng ý mới tính.
 *
 * Hộp xác nhận là chỗ chặn cú bấm lỡ tay: bấm nhầm ô thì bấm "Chọn ô khác",
 * bàn cờ trở lại trạng thái đang chọn chứ không mất lượt.
 */
import { openModal } from './modal.js';
import { BOARD, money, tileShortLabel } from '../data/board.js';
import { tileCardUrl } from './deed.js';
import { audio } from '../audio/audio.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Dòng phụ dưới tên ô: đất mình thì xem tiền thuê, đất người thì xem chủ. */
function tileMeta(state, id, owned) {
  const houses = state.housesOn(id);
  const built = houses === 5 ? 'khách sạn' : `${houses} nhà`;
  if (owned) {
    return `Giá gốc ${money(BOARD[id].price)} · thuê ${money(state.rentFor(id, 7))}`;
  }
  const owner = state.ownerOf(id);
  return `${owner ? `<b style="color:${owner.token.css}">${esc(owner.name)}</b> · ` : ''}
          ${houses ? `${built} · ` : ''}thuê ${money(state.rentFor(id, 7))}`;
}

/**
 * Chọn ô trên bàn cờ.
 *
 * @param {import('../scenes/BoardScene.js').default} scene
 * @param {import('../core/state.js').GameState} state
 * @param {number[]} ids các ô chọn được
 * @param {{eyebrow:string,title:string,sub:string,note?:string,confirm:string,
 *          owned?:boolean}} text
 * @param {number} [ms] bản online: hạn chọn. Hết giờ thì lấy ô **rẻ nhất** —
 *   bỏ trống thì sự kiện đứng lại, mà tự lấy ô đắt thì hoá ra phạt người mất
 *   kết nối nặng hơn người ngồi bấm.
 * @returns {Promise<number>} ô đã chốt
 */
export function pickTileOnBoard(scene, state, ids, text, ms = 0) {
  const cheapest = [...ids].sort((a, b) => BOARD[a].price - BOARD[b].price)[0];
  const owned = text.owned !== false;

  return new Promise((resolve) => {
    const hud = document.getElementById('board-hud');
    const panel = document.createElement('div');
    panel.className = 'tile-pick';
    panel.innerHTML = `
      <div class="tp-eyebrow">${text.eyebrow}</div>
      <div class="tp-title">${text.title}</div>
      <div class="tp-sub">${text.sub}</div>
      <div class="tp-call">Bấm vào <b>ô đang sáng</b> trên bàn cờ —
        có <b>${ids.length}</b> ô chọn được</div>
      ${text.note ? `<div class="tp-note">${text.note}</div>` : ''}
      <div class="tp-timer" hidden></div>`;
    hud.appendChild(panel);
    // Thanh nút hành động nằm đúng chỗ này; cất đi trong lúc chọn
    hud.classList.add('picking');

    const prevClick = scene.onTileClick;
    scene.markTiles(ids);

    let done = false;
    let asking = false;
    let closeAsk = null;
    let ticker = 0;

    const finish = (id) => {
      if (done) return;
      done = true;
      clearInterval(ticker);
      closeAsk?.(false);
      scene.onTileClick = prevClick;
      scene.clearMarks();
      hud.classList.remove('picking');
      panel.classList.add('out');
      setTimeout(() => panel.remove(), 260);
      resolve(id);
    };

    /** Bấm trúng ô ngoài danh sách: nói rõ vì sao không ăn, đừng im lặng. */
    const refuse = () => {
      audio.sfx('click');
      panel.classList.remove('nudge');
      void panel.offsetWidth;   // ép trình duyệt chạy lại hoạt cảnh
      panel.classList.add('nudge');
    };

    scene.onTileClick = async (id) => {
      if (done || asking) return;
      if (!ids.includes(id)) { refuse(); return; }

      asking = true;
      audio.sfx('buy');
      scene.markTiles(ids, { focus: id });
      const ok = await openModal({
        eyebrow: text.eyebrow,
        title: `Chốt ${esc(tileShortLabel(id))}?`,
        sub: text.sub,
        body: `
          <div class="arow">
            <span class="arow-thumb" style="background-image:url('${tileCardUrl(id, 30)}')"></span>
            <span class="arow-main">
              <span class="arow-name">${esc(tileShortLabel(id))}</span>
              <span class="arow-meta">${tileMeta(state, id, owned)}</span>
            </span>
          </div>
          <div class="trade-summary">Chốt rồi là không đổi lại được.</div>`,
        buttons: [
          { label: text.confirm, value: true, cls: 'btn-gold' },
          { label: 'Chọn ô khác', value: false, cls: 'btn-ghost' },
        ],
        escValue: false,
        onMount: (_body, close) => { closeAsk = close; },
      });
      closeAsk = null;
      asking = false;
      if (done) return;
      if (ok) finish(id);
      else scene.markTiles(ids);   // quay lại chọn, bỏ vệt sáng gắt của ô cũ
    };

    if (ms) {
      const timer = panel.querySelector('.tp-timer');
      timer.hidden = false;
      const until = Date.now() + ms;
      const tick = () => {
        const left = Math.max(0, until - Date.now());
        timer.innerHTML = `Còn <b>${Math.ceil(left / 1000)} giây</b>
          để chọn — quá hạn thì lấy ô rẻ nhất.`;
        timer.classList.toggle('warn', left <= 10000);
        if (left <= 0) finish(cheapest);
      };
      tick();
      ticker = setInterval(tick, 250);
    }
  });
}

/**
 * Dòng nhắc dán dưới thân mấy hộp thoại có `litTiles` bọc ngoài — nói cho người
 * chơi biết ô đang được nói tới đã sáng sẵn dưới bàn, và ngó bằng cách nào.
 */
export const PEEK_HINT = `<div class="peek-hint">Ô đang nói tới
  <b>đã sáng trên bàn cờ</b> — giữ <b>Space</b> hoặc bấm 👁 để ngó qua.</div>`;

/**
 * Sáng mấy ô mà một hộp thoại đang nói tới, tắt lúc hộp đóng.
 *
 * Động đất, hoả hoạn, đấu giá, chuộc đất không bắt chọn ô — lá thẻ đã định sẵn
 * ô nào. Nhưng đọc mỗi cái tên trong hộp thoại thì người chơi vẫn phải dò xem ô
 * ấy nằm cạnh nào của bàn. Đánh dấu sẵn thì giữ **Space** (hoặc bấm con mắt)
 * là hộp tạm ẩn, ô đang sáng hiện ra ngay dưới đó.
 *
 * Đánh dấu kiểu `pick: false`: không đổi con trỏ chuột, bấm vào ô vẫn ra bảng
 * xem nhanh như thường — đây là chỉ trỏ, không phải lời mời bấm.
 *
 * @template T
 * @param {import('../scenes/BoardScene.js').default} scene
 * @param {number[]} ids
 * @param {() => Promise<T>} run mở hộp thoại rồi chờ câu trả lời
 * @returns {Promise<T>}
 */
export async function litTiles(scene, ids, run) {
  const list = [...new Set(ids ?? [])].filter((id) => id != null);
  if (!scene?.markTiles || list.length === 0) return run();

  /* Đang có phiên chọn ô dở dang thì trả lại đúng vệt sáng cũ, đừng xoá trắng.
     Chỉ giữ lại phiên bắt chọn (`pick`) thôi: mấy vệt chỉ trỏ khác đều có hạn
     — của `spotTiles` thì đang đếm ngược, của một `litTiles` lồng ngoài thì
     chính nó sẽ tự dựng lại — trả lại thì hoá ra ghim luôn một vệt lẽ ra đã tắt. */
  const prev = scene.marked?.pick ? scene.marked : null;
  scene.markTiles(list, { pick: false });
  try {
    return await run();
  } finally {
    if (prev) scene.markTiles(prev.ids, prev);
    else scene.clearMarks();
  }
}
