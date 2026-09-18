/**
 * Chọn một **khu màu** bằng cách bấm thẳng lên bàn cờ.
 *
 * Thẻ dỡ nhà nhắm tới mức khu: người dùng thẻ chỉ định khu, rồi bàn cờ bốc
 * thăm xem ô nào trong khu ấy lãnh đủ (`core/cards.js` → `demolishPicks`).
 * Trước đây danh sách khu bày trong một hộp thoại, đọc tên khu xong người chơi
 * vẫn phải tự dò xem khu ấy nằm cạnh nào của bàn và ai đang xây ở đó. Ở đây
 * quy trình giống hệt `pickTileOnBoard`: bàn cờ sáng đúng những ô dỡ được, bấm
 * vào ô nào thì cả khu của ô ấy sáng lên và hộp xác nhận mở ra cho khu ấy.
 *
 * Hộp xác nhận chặn cú bấm lỡ tay: bấm "Chọn khu khác" thì quay lại trạng thái
 * đang chọn chứ không mất thẻ.
 *
 * Hộp này dùng chung cho cả bản một máy lẫn bản online, nên nhận `ms` để đếm
 * ngược. Hết giờ mà thẻ **huỷ được** thì trả `null` — thẻ còn nguyên trong túi,
 * nhẹ tay hơn là tự dỡ nhà nhà người ta hộ; không huỷ được thì lấy khu đầu bảng.
 */
import { openModal } from './modal.js';
import { BOARD, GROUPS, GROUP_TILES, tileShortLabel } from '../data/board.js';
import { audio } from '../audio/audio.js';

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

/** Một dòng kể đủ ba điều để cân nhắc: khu của ai, mấy ô dỡ được, mấy cấp nhà. */
function groupMeta(state, group, ids) {
  const lots = lotsOf(state, group, ids);
  const houses = lots.reduce((n, l) => n + l.houses, 0);
  return `${lots.length} ô dỡ được · ${houses} cấp nhà · ${ownerNames(state, lots)}`;
}

/**
 * @param {import('../scenes/BoardScene.js').default} scene
 * @param {import('../core/state.js').GameState} state
 * @param {{groups:string[], ids:number[], levels:number, cancel?:string}} data
 *   khu chọn được, các ô trong tầm ngắm, số cấp nhà thẻ sẽ dỡ, và nhãn nút huỷ
 *   (bỏ trống thì không cho huỷ)
 * @param {number} [ms] hạn chọn ở bản online; 0 là không đếm ngược
 * @returns {Promise<?string>} khoá khu đã chọn, `null` nếu huỷ hoặc hết giờ
 */
export function pickGroupOnBoard(scene, state, data, ms = 0) {
  const { groups, ids, levels } = data;
  const cancel = data.cancel ?? null;

  return new Promise((resolve) => {
    const hud = document.getElementById('board-hud');
    const panel = document.createElement('div');
    panel.className = 'tile-pick';
    panel.innerHTML = `
      <div class="tp-eyebrow">DỠ NHÀ LẤN LỘ GIỚI</div>
      <div class="tp-title">Dỡ nhà ở khu nào?</div>
      <div class="tp-sub">Bạn chỉ chọn khu. Bàn cờ sẽ <b>bốc thăm ${levels} ô</b>
        trong khu ấy, mỗi ô mất một cấp nhà — chủ đất không được đền đồng nào.</div>
      <div class="tp-call">Bấm vào <b>ô đang sáng</b> để chọn cả khu của ô ấy —
        có <b>${groups.length}</b> khu chọn được</div>
      <div class="tp-chosen">${groups.map((g) => `<span class="tp-chip"
        style="border-color:${GROUPS[g].hex}">${esc(GROUPS[g].name)}</span>`).join('')}</div>
      <div class="tp-timer" hidden></div>
      ${cancel ? `<div class="tp-acts">
        <button type="button" class="btn btn-ghost tp-cancel">${esc(cancel)}</button>
      </div>` : ''}`;
    hud.appendChild(panel);
    // Thanh nút hành động nằm đúng chỗ này; cất đi trong lúc chọn
    hud.classList.add('picking');

    scene.markTiles(ids);

    let done = false;
    let asking = false;
    let closeAsk = null;
    let ticker = 0;
    let myClick = null;      // đặt ở dưới; `finish` chỉ gỡ đúng phiên này ra

    const finish = (key) => {
      if (done) return;
      done = true;
      clearInterval(ticker);
      closeAsk?.(false);
      scene.popTileClick(myClick);
      scene.clearMarks();
      panel.classList.add('out');
      setTimeout(() => panel.remove(), 260);
      /* Còn phiên khác đang mở thì giữ nguyên `picking`: bỏ ra ở đây là thanh
         nút hành động hiện lại đè lên bảng của phiên ấy. `panel` vẫn còn trong
         DOM tới hết hoạt cảnh nên phải trừ chính nó ra. */
      if (hud.querySelectorAll('.tile-pick:not(.out)').length === 0) {
        hud.classList.remove('picking');
      }
      resolve(key);
    };

    /** Bấm trúng ô ngoài tầm ngắm: nói rõ vì sao không ăn, đừng im lặng. */
    const refuse = () => {
      audio.sfx('click');
      panel.classList.remove('nudge');
      void panel.offsetWidth;   // ép trình duyệt chạy lại hoạt cảnh
      panel.classList.add('nudge');
    };

    myClick = scene.pushTileClick(async (id) => {
      if (done || asking) return;
      if (!ids.includes(id)) { refuse(); return; }
      const key = BOARD[id].color_group;
      if (!groups.includes(key)) { refuse(); return; }

      const lots = lotsOf(state, key, ids);
      asking = true;
      audio.sfx('buy');
      // Cả khu sáng lên cùng lúc, để thấy rõ cú bấm này kéo theo những ô nào
      scene.markTiles(ids, { sel: lots.map((l) => l.id) });
      const ok = await openModal({
        eyebrow: 'DỠ NHÀ LẤN LỘ GIỚI',
        title: `Chốt khu ${esc(GROUPS[key].name)}?`,
        sub: `Bàn cờ sẽ <b>bốc thăm ${levels} ô</b> trong khu này, mỗi ô mất
              một cấp nhà.`,
        body: `
          <div class="arow">
            <span class="grp-swatch" style="background:${GROUPS[key].hex}"></span>
            <span class="arow-main">
              <span class="arow-name">${esc(GROUPS[key].name)}</span>
              <span class="arow-meta">${groupMeta(state, key, ids)}</span>
            </span>
          </div>
          <div class="trade-summary">Trong tầm ngắm:
            ${lots.map((l) => `<b>${esc(tileShortLabel(l.id))}</b>
              (${l.houses === 5 ? 'khách sạn' : `${l.houses} nhà`})`).join(', ')}.
            Chốt rồi là không đổi lại được.</div>`,
        buttons: [
          { label: 'Dỡ khu này', value: true, cls: 'btn-gold' },
          { label: 'Chọn khu khác', value: false, cls: 'btn-ghost' },
        ],
        escValue: false,
        onMount: (_body, close) => { closeAsk = close; },
      });
      closeAsk = null;
      asking = false;
      if (done) return;
      if (ok) finish(key);
      else scene.markTiles(ids);   // quay lại chọn, tắt vệt xanh của khu vừa ngó
    });

    panel.querySelector('.tp-cancel')?.addEventListener('click', () => {
      audio.sfx('click');
      finish(null);
    });

    if (ms) {
      const timer = panel.querySelector('.tp-timer');
      timer.hidden = false;
      const until = Date.now() + ms;
      const tick = () => {
        const left = Math.max(0, until - Date.now());
        timer.innerHTML = `Còn <b>${Math.ceil(left / 1000)} giây</b> để chọn —
          quá hạn thì ${cancel ? 'thẻ ở lại trong túi' : 'bàn cờ tự chọn'}.`;
        timer.classList.toggle('warn', left <= 10000);
        if (left <= 0) finish(cancel ? null : groups[0]);
      };
      tick();
      ticker = setInterval(tick, 250);
    }
  });
}
