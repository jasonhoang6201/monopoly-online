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
import { effectLines } from '../data/events.js';
import { tileCardUrl } from './deed.js';
import { PEEK_HINT } from './tilePicker.js';

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
 * Mặt thẻ Thời Cuộc — ba tầng chữ, đọc từ trên xuống là đủ biết phải làm gì.
 *
 * Trên cùng là lời văn (`card.text`): chuyện ngoài phố, đọc cho có không khí.
 * Giữa là **luật sẽ áp dụng** (`card.effect`), gạch đầu dòng từng ý, giữ nguyên
 * con số của thẻ — trước đây phần này nằm lẫn trong lời văn nên người chơi đọc
 * xong vẫn không biết mình sắp mất bao nhiêu. Dưới cùng là `detail`: lần nổ
 * này rơi vào khu nào, vào ai — chỗ duy nhất phụ thuộc thế cờ lúc ấy.
 *
 * Tách khỏi hộp thoại vì băng chuyền bóc thẻ (`ui/caseOpen.js`) dựng lại đúng
 * mặt thẻ này sau khi dải dừng.
 *
 * @param {object} card thẻ trong `data/events.js`
 * @param {string} detail dòng nói rõ sự kiện này rơi vào đâu, vào ai (cho HTML)
 */
export function eventCardBody(card, detail = '') {
  const tone = TONE[card.kind] ?? TONE.chaos;
  const lines = effectLines(card);
  return `
    <div class="fate-card event-card" style="--ev:${tone.accent}">
      <div class="event-kind">THỜI CUỘC · ${tone.label}</div>
      <div class="fate-sigil" style="color:${tone.accent}">${card.sigil}</div>
      <div class="event-title">${esc(card.title)}</div>
      <div class="fate-text">${esc(card.text.replace(/\s+/g, ' ').trim())}</div>
      ${lines.length ? `<div class="event-effect">
        <div class="event-effect-head">Áp dụng</div>
        <ul class="event-effect-list">
          ${lines.map((l) => `<li>${esc(l)}</li>`).join('')}
        </ul>
      </div>` : ''}
      ${detail ? `<div class="event-detail">${detail}</div>` : ''}
    </div>`;
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
      <div class="trade-summary">Chống đỡ tất cả: <b>${money(total)}</b></div>
      ${PEEK_HINT}`,
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

/**
 * Hoả hoạn: trả tiền phu chữa cháy thì cả mấy ô đang cháy của mình giữ nguyên
 * nhà, để mặc thì mỗi ô mất nửa số nhà (đã tính sẵn trong `lose`).
 *
 * @param {Array<{id:number,houses:number,lose:number,save:number}>} lots
 */
export function firePromptModal(state, playerId, lots, ms = 0) {
  const p = state.players[playerId];
  const total = lots.reduce((s, l) => s + l.save, 0);
  const losing = lots.reduce((s, l) => s + l.lose, 0);
  let ticker = 0;

  const pr = openModal({
    eyebrow: 'HOẢ HOẠN',
    title: 'Thuê phu chữa cháy?',
    sub: `Dập được lửa thì nhà cửa còn nguyên. Để mặc thì mất
          <b>${losing} cấp nhà</b>, không đền bù. Bạn đang có ${money(p.money)}.`,
    body: `${lots.map((l) => tileRow(l.id,
      `Đang có ${l.houses === 5 ? 'khách sạn' : `${l.houses} nhà`} · cháy mất
       ${l.lose} cấp · chữa cháy ${money(l.save)}`)).join('')}
      <div class="trade-summary">Chữa cháy tất cả: <b>${money(total)}</b></div>
      ${PEEK_HINT}`,
    dismissible: false,
    buttons: [
      { label: `Chữa cháy ${money(total)}`, value: 'save', cls: 'btn-gold', disabled: p.money < total },
      { label: 'Để mặc nó cháy', value: null, cls: 'btn-danger' },
    ],
    onMount: (body, close) => {
      if (ms) ticker = attachTimer(body, ms, close, null, 'để quyết định — quá hạn thì cứ để cháy.');
    },
  });
  pr.finally(() => clearInterval(ticker));
  return pr;
}

/**
 * Dãy tên những người đang được hỏi giá trong phiên, kèm tiền mặt của họ.
 *
 * Giá ghi kín nên nhìn màn hình mình không biết đang tranh với ai; mà luật phát
 * mãi còn gạt chủ cũ ra ngoài, nên câu "cả bàn cùng tranh" không còn đúng cho
 * mọi phiên. Nêu thẳng hai danh sách: ai được ghi giá, ai bị gạt.
 *
 * Tiền mặt là trần giá của từng người — số này HUD vẫn bày công khai, đưa vào
 * đây chỉ đỡ phải nhớ sang bảng khác trong lúc đồng hồ đang chạy.
 *
 * @param {object} state
 * @param {number[]} bidders ghế được ghi giá
 * @param {number[]} barred ghế bị luật gạt khỏi phiên (rỗng thì bỏ dòng ấy)
 * @param {number} me ghế của máy đang xem — tô riêng cho dễ nhận
 */
function bidderRoster(state, bidders, barred, me) {
  const chip = (seat, out) => {
    const p = state.players[seat];
    if (!p) return '';
    return `
      <span class="roster-chip${seat === me ? ' me' : ''}">
        <i style="background:${p.token.css}"></i>
        <b>${esc(p.name)}${seat === me ? ' (bạn)' : ''}</b>
        <u>${out ? 'đứng ngoài' : money(p.money)}</u>
      </span>`;
  };

  return `
    <div class="bid-roster">
      <div class="roster-head">Cùng tranh lô này · ${bidders.length} người</div>
      <div class="roster-chips">${bidders.map((s) => chip(s, false)).join('')}</div>
      ${barred.length ? `
        <div class="roster-head out">Không được ghi giá</div>
        <div class="roster-chips">${barred.map((s) => chip(s, true)).join('')}</div>` : ''}
    </div>`;
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
      ${bidderRoster(state, o.bidders ?? [playerId], o.barred ?? [], playerId)}
      <div class="bid-box">
        <label for="bid-input">Giá bạn trả</label>
        <input id="bid-input" type="number" min="0" max="${max}" step="10" value="0"
               aria-describedby="bid-err" />
        <div class="field-err" id="bid-err" hidden></div>
        <div class="bid-quick">
          ${[0.5, 0.75, 1].map((f) => {
            const v = Math.min(max, Math.round(t.price * f));
            return `<button type="button" class="btn btn-ghost bid-q" data-v="${v}">${money(v)}</button>`;
          }).join('')}
        </div>
      </div>
      <div class="trade-summary">Đấu giá kín — mọi người ghi cùng lúc, hoà nhau thì
        người đi trước trong vòng lượt thắng.</div>
      ${PEEK_HINT}`,
    buttons: [{ label: 'Chốt giá', value: 'bid', cls: 'btn-gold' }],
    onMount: (body, close, modal, foot) => {
      const input = body.querySelector('#bid-input');
      const err = body.querySelector('#bid-err');
      const okBtn = foot.querySelector('.btn-gold');

      /**
       * Kiểm ngay lúc gõ chứ không đợi bấm chốt.
       *
       * Trước đây số vượt túi bị cắt lặng lẽ về `max`: ô vẫn hiện con số vừa gõ
       * mà giá gửi đi là con số khác — người chơi tưởng mình trả 1500, thua
       * phiên đấu giá rồi vẫn không hiểu vì sao. Giờ ô đỏ ngay, nút chốt tắt,
       * và `bid` giữ nguyên giá hợp lệ gần nhất.
       */
      const read = () => {
        const raw = input.value.trim();
        const n = Math.floor(+raw);
        let msg = '';
        if (raw !== '' && !Number.isFinite(n)) msg = 'Chỉ ghi bằng số.';
        else if (n < 0) msg = 'Không ghi giá âm.';
        else if (n > max) msg = `Bạn chỉ có ${money(max)} — hạ giá xuống.`;

        input.classList.toggle('bad', !!msg);
        err.hidden = !msg;
        err.innerHTML = msg;
        okBtn.disabled = !!msg;
        if (!msg) bid = Math.max(0, n || 0);
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

/**
 * Bảng giá mở ra sau khi phiên đấu giá đóng — ai ghi bao nhiêu, xếp từ cao
 * xuống thấp, hàng người thắng tô vàng.
 *
 * Trước đây chốt phiên chỉ có một dòng thông báo: tên người thắng, giá của họ,
 * và giá người kế tiếp. Giá kín nên người thua không biết mình hụt bao nhiêu,
 * mà mấy người còn lại thì không biết gì cả. Giá chỉ cần kín tới lúc tiền đã
 * trao; mở hết ra sau đó thì phiên sau ai cũng đoán được tay nào chịu chi.
 *
 * Hộp này mở ở **mọi máy** (xem `auctionend` trong `controller.onEvent`), và
 * khai `yieldToNext` để không chắn đường hộp hỏi của nước kế tiếp.
 *
 * @param {object} state
 * @param {number} tileId
 * @param {Array<{seat:number,bid:number}>} rows đã xếp sẵn, hoà thì người đi
 *   trước trong vòng lượt đứng trên
 * @param {{winner:number, sellerName?:string}} o
 */
export function auctionResultModal(state, tileId, rows, o) {
  const t = BOARD[tileId];
  /* Xếp lại lần nữa cho chắc, và `sort` của JS giữ nguyên thứ tự hai giá bằng
     nhau — tức giữ đúng luật hoà mà bên gọi đã áp: người đi trước đứng trên. */
  const list = [...rows].sort((a, b) => b.bid - a.bid);
  const win = state.players[o.winner];
  /* Giá chốt lấy từ hàng của người thắng chứ không lấy hàng đầu bảng: người trả
     cao hơn mà vỡ nợ ngay trong phiên thì bên gọi đã gạt họ khỏi `rows`, nhưng
     đọc theo hàng đầu vẫn an toàn hơn là tin vào thứ tự. */
  const paid = list.find((r) => r.seat === o.winner)?.bid ?? list[0]?.bid ?? 0;

  const line = (r, i) => {
    const p = state.players[r.seat];
    if (!p) return '';
    const won = r.seat === o.winner;
    /* Hoà giá mà thua thì phải nói rõ vì sao, không thì bảng hiện "hụt 0$" —
       người ấy tưởng máy tính sai chứ không nhớ ra luật hoà. */
    const meta = won ? 'Trả cao nhất — lấy đất'
      : r.bid === paid ? 'Bằng giá — thua vì đi sau trong vòng lượt'
      : r.bid > 0 ? `Hụt ${money(paid - r.bid)}`
      : 'Không ghi giá — bỏ qua phiên';
    return `
      <div class="arow bid-row${won ? ' win' : ''}${r.bid > 0 ? '' : ' pass'}">
        <span class="bid-rank">${won ? '★' : i + 1}</span>
        <span class="arow-chip" style="background:${p.token.css}"></span>
        <span class="arow-main">
          <span class="arow-name">${esc(p.name)}</span>
          <span class="arow-meta">${meta}</span>
        </span>
        <span class="bid-money">${r.bid > 0 ? money(r.bid) : '—'}</span>
      </div>`;
  };

  return openModal({
    eyebrow: 'CHỐT PHIÊN ĐẤU GIÁ',
    title: esc(t.name.split(' (')[0]),
    sub: `<b style="color:${win.token.css}">${esc(win.name)}</b> trả
          <b>${money(paid)}</b> — cao nhất bàn, lô đất về tay họ.`,
    scrimClose: true,
    yieldToNext: true,
    body: `
      ${tileRow(tileId, `Giá gốc ${money(t.price)} · chốt ${money(paid)}`)}
      <div class="bid-table">
        <div class="bid-head">
          <span>Hạng</span><span></span><span>Người trả giá</span><span>Giá đã ghi</span>
        </div>
        ${list.map(line).join('')}
      </div>
      <div class="trade-summary">Tiền về
        ${o.sellerName ? `tay <b>${esc(o.sellerName)}</b>` : '<b>kho ngân hàng</b>'} —
        giá kín chỉ kín tới lúc chốt, giờ cả bàn cùng thấy.</div>`,
    buttons: [{ label: 'Đã rõ', value: true, cls: 'btn-gold' }],
  });
}
