/**
 * Hộp bầu của Hội Đồng Hồn Ma — ba thẻ Thời Cuộc, bấm một thẻ là bầu.
 *
 * Không đi qua `openModal`: hộp thoại thường đẩy hộp `yieldToNext` đi (mặt thẻ
 * Thời Cuộc vừa nổ còn đang mở cho người ta đọc), và phủ nền chặn cả bàn cờ.
 * Hồn ma chỉ ngồi xem, nhưng ở bản một máy họ ngồi chung màn hình với người
 * đang đi — nên hộp này là một lớp riêng, chỉ chặn cú bấm trong khung của nó.
 *
 * Hộp không trả lời ai: bấm thẻ thì gọi `onVote`, hết giờ thì tự đóng. Số
 * phiếu trên thẻ cập nhật qua `setVote` khi tin từ máy khác tới.
 */
import { effectLines } from '../data/events.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Nhãn tính chất thẻ, cùng bộ chữ với mặt thẻ Thời Cuộc (`ui/eventModals.js`). */
const TONE = {
  bad:   { accent: '#B3322A', label: 'TAI ƯƠNG' },
  good:  { accent: '#2E6B52', label: 'VẬN MAY' },
  chaos: { accent: '#C8A048', label: 'ĐẢO LỘN' },
};

/** Hình hồn ma vẽ bằng SVG một màu: emoji 👻 mỗi máy vẽ một kiểu và mang màu riêng. */
export const GHOST_SVG = `
  <svg viewBox="0 0 40 46" aria-hidden="true">
    <path d="M20 2C10.6 2 4 9.2 4 18.6V42l5.4-4.2 5.3 4.2 5.3-4.2 5.3 4.2 5.3-4.2L36 42V18.6C36 9.2 29.4 2 20 2Z"
          fill="currentColor"/>
    <ellipse cx="14.6" cy="19" rx="2.6" ry="3.6" fill="var(--gc-eye, #17110C)"/>
    <ellipse cx="25.4" cy="19" rx="2.6" ry="3.6" fill="var(--gc-eye, #17110C)"/>
    <ellipse cx="20" cy="28" rx="2.4" ry="3" fill="var(--gc-eye, #17110C)" opacity=".75"/>
  </svg>`;

/** Một hồn ma nhỏ mang màu quân của người bầu — gắn dưới thẻ họ chọn. */
function voterChip(p) {
  return `<span class="gc-voter" style="--tok:${p.token.css}" title="${esc(p.name)}">
    ${GHOST_SVG}<b>${esc(p.name)}</b></span>`;
}

function cardFace(card, i) {
  const tone = TONE[card.kind] ?? TONE.chaos;
  const lines = effectLines(card).slice(0, 2);
  return `
    <button type="button" class="gc-card" data-id="${card.id}" style="--ev:${tone.accent}; --i:${i}">
      <span class="gc-kind">${tone.label}</span>
      <span class="gc-sigil">${card.sigil ?? '☰'}</span>
      <span class="gc-title">${esc(card.title)}</span>
      <span class="gc-lines">${lines.map((l) => `<span>${esc(l)}</span>`).join('')}</span>
      <span class="gc-foot">
        <span class="gc-voters"></span>
        <span class="gc-count"></span>
      </span>
      <span class="gc-stamp">ĐÃ BẦU</span>
    </button>`;
}

/**
 * Mở hộp bầu.
 *
 * @param {object} o
 * @param {import('../core/state.js').GameState} o.state
 * @param {object[]} o.cards   ba thẻ trong `data/events.js`
 * @param {number[]} o.seats   ghế hồn ma bầu được **trên máy này** — bản online
 *   là một ghế, bản một máy là mọi người đã phá sản (có hàng chọn ai đang bầu)
 * @param {Record<number,string>} [o.votes] phiếu đã có lúc mở
 * @param {number} o.ms        hộp đứng bao lâu
 * @param {(seat:number, id:string)=>void} o.onVote
 * @returns {{ setVote:(seat:number,id:string)=>void, close:()=>void, closed:Promise<void> }}
 */
export function ghostVotePanel({ state, cards, seats, votes = {}, ms, onVote }) {
  const tally = { ...votes };
  let active = seats.find((s) => tally[s] == null) ?? seats[0];
  let done = false;
  let finish;
  const closed = new Promise((r) => { finish = r; });

  const root = document.createElement('div');
  root.id = 'ghost-council';
  root.className = 'gc-layer';
  root.innerHTML = `
    <div class="gc-veil"></div>
    <section class="gc-panel" role="dialog" aria-label="Hội Đồng Hồn Ma">
      <header class="gc-head">
        <span class="gc-ghost">${GHOST_SVG}</span>
        <span class="gc-heading">
          <span class="gc-eyebrow">HỘI ĐỒNG HỒN MA</span>
          <span class="gc-name">Bầu thẻ Thời Cuộc kế tiếp</span>
          <span class="gc-sub">Thẻ nhiều phiếu dễ ra hơn. Không bầu thì bốc như thường.</span>
        </span>
      </header>
      ${seats.length > 1 ? `<div class="gc-seats">
        <span class="gc-seats-label">Phiếu của</span>
        ${seats.map((s) => `<button type="button" class="gc-seat" data-seat="${s}"
          style="--tok:${state.players[s].token.css}">${GHOST_SVG}${esc(state.players[s].name)}</button>`).join('')}
      </div>` : ''}
      <div class="gc-cards">${cards.map(cardFace).join('')}</div>
      <div class="gc-time">
        <div class="gc-bar"><i style="animation-duration:${ms}ms"></i></div>
        <span class="gc-sec">${Math.ceil(ms / 1000)}s</span>
      </div>
    </section>`;
  document.body.appendChild(root);
  requestAnimationFrame(() => root.classList.add('show'));

  const render = () => {
    for (const el of root.querySelectorAll('.gc-card')) {
      const id = el.dataset.id;
      const who = Object.entries(tally).filter(([, v]) => v === id).map(([s]) => state.players[s]).filter(Boolean);
      el.querySelector('.gc-voters').innerHTML = who.map(voterChip).join('');
      el.querySelector('.gc-count').textContent = who.length ? `${who.length} phiếu` : '';
      el.classList.toggle('voted', who.length > 0);
      el.classList.toggle('mine', tally[active] === id);
    }
    for (const el of root.querySelectorAll('.gc-seat')) {
      const s = Number(el.dataset.seat);
      el.classList.toggle('on', s === active);
      el.classList.toggle('done', tally[s] != null);
    }
  };

  root.querySelector('.gc-cards').addEventListener('click', (e) => {
    const el = e.target.closest('.gc-card');
    if (!el || done) return;
    const id = el.dataset.id;
    tally[active] = id;
    onVote(active, id);
    // Bản một máy: bầu xong thì chuyển sang hồn ma kế tiếp chưa bầu
    const next = seats.find((s) => tally[s] == null);
    if (next != null) active = next;
    render();
  });
  root.querySelector('.gc-seats')?.addEventListener('click', (e) => {
    const el = e.target.closest('.gc-seat');
    if (!el) return;
    active = Number(el.dataset.seat);
    render();
  });

  const t0 = performance.now();
  const sec = root.querySelector('.gc-sec');
  const tick = setInterval(() => {
    const left = Math.max(0, ms - (performance.now() - t0));
    sec.textContent = `${Math.ceil(left / 1000)}s`;
    root.classList.toggle('late', left < 3000);
  }, 200);
  const timer = setTimeout(() => close(), ms);

  function close() {
    if (done) return;
    done = true;
    clearInterval(tick);
    clearTimeout(timer);
    root.classList.remove('show');
    root.classList.add('hide');
    setTimeout(() => { root.remove(); finish(); }, 420);
  }

  render();
  return {
    setVote(seat, id) { if (!done) { tally[seat] = id; render(); } },
    close,
    closed,
  };
}
