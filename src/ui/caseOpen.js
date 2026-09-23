/**
 * Băng chuyền bóc thẻ — Cơ Hội, Khí Vận, Thời Cuộc.
 *
 * Thẻ vẫn do `Deck.draw()` chọn như cũ: luật lọc `usable`, `gone` và việc đồng
 * bộ giữa các máy không đổi một dòng nào. Cái đổi là cách bày ra — thay vì mặt
 * thẻ hiện thẳng, ta dựng một dải thẻ giả, **đặt thẻ trúng vào đúng ô đích**
 * rồi cho dải trôi qua vạch và hãm lại ngay chỗ ấy.
 *
 * Vì kết quả có trước, mọi ngẫu nhiên còn lại chỉ là phần diễn: thứ tự dải,
 * quãng đường trôi, chỗ dừng lệch tâm. Cả ba sinh từ **một số hạt** (`seed`),
 * nên host chỉ cần gửi thêm con số ấy là mọi máy chạy ra y hệt một băng chuyền
 * và dừng cùng một chỗ.
 *
 * Chuyển động không dùng CSS transition mà tự chạy theo `requestAnimationFrame`,
 * vì mỗi khung hình còn phải biết dải đã vượt qua bao nhiêu ô để gõ đúng bấy
 * nhiêu tiếng giấy (`SFX.cardTick`).
 */
import { openModal } from './modal.js';
import { DECK_META, KEEPABLE, DECKS } from '../data/cards.js';
import { money } from '../data/board.js';
import { EVENTS } from '../data/events.js';
import { audio } from '../audio/audio.js';
import { fateCardBody } from './modals.js';
import { eventCardBody } from './eventModals.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ------------------------------------------------------------------ hạng thẻ */

/**
 * Bốn hạng, xếp theo **sức nặng của thẻ lên thế cờ** chứ không theo số tiền
 * đơn thuần: một tấm "dỡ nhà" không cho đồng nào nhưng đổi cả cục diện, còn
 * +60$ thì chỉ là tiền lẻ.
 */
export const RANKS = {
  thuong: { key: 'thuong', name: 'Thường', color: '#8C8471' },
  kha:    { key: 'kha',    name: 'Khá',    color: '#2F5E93' },
  quy:    { key: 'quy',    name: 'Quý',    color: '#6E3E96' },
  hiem:   { key: 'hiem',   name: 'Hiếm',   color: '#C8A048' },
};

/** @param {'chance'|'chest'|'event'} kind */
export function rankOf(kind, card) {
  if (kind === 'event') {
    if (card.heavy) return 'hiem';             // đụng tới nhà cửa, quyền sở hữu
    return card.kind === 'chaos' ? 'quy' : 'kha';
  }
  if (KEEPABLE.has(card.type)) return 'hiem';  // thẻ cất túi, chờ đúng lúc mới nổ
  // Thẻ dắt quân đi chỗ khác đổi thế cờ nhiều hơn một khoản tiền lẻ
  if (card.type === 'move') return card.jail ? 'hiem' : 'quy';
  if (card.type === 'repair' || card.type === 'collect') return 'quy';
  return Math.abs(card.amount ?? 0) >= 150 ? 'kha' : 'thuong';
}

/** Dòng chữ in trên ô trong dải — đọc lướt được trong một phần mười giây. */
function shortLabel(kind, card) {
  if (kind === 'event') return card.title;
  switch (card.type) {
    case 'collect':       return 'TIỀN MỪNG';
    case 'repair':        return 'THUẾ NHÀ';
    case 'jail-free':     return 'VÉ RA TÙ';
    case 'demolish':      return 'DỠ NHÀ';
    case 'seize':         return 'CƯỠNG CHẾ';
    case 'resume':
    case 'resume-random': return 'GIẢI TOẢ';
    case 'move':          return card.jail ? 'VÀO TÙ' : 'ĐỔI CHỖ';
    default:              return (card.amount > 0 ? '+' : '−') + money(Math.abs(card.amount));
  }
}

function sigilOf(kind, card) {
  return kind === 'event' ? (card.sigil ?? '☰') : DECK_META[kind].sigil;
}

function deckName(kind, card) {
  return kind === 'event' ? 'THỜI CUỘC' : DECK_META[kind].title;
}

/* ------------------------------------------------------- ngẫu nhiên có hạt giống */

/** mulberry32 — 32 bit, một phép nhân, đủ đều cho việc xếp dải. */
export function rngFrom(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const newSeed = () => (Math.random() * 0x7FFFFFFF) | 0;

/* ----------------------------------------------------------------- dựng dải */

/** Số ô đệm phía trước vạch lúc bắt đầu, và phía sau ô trúng lúc dừng. */
const LEAD = 4;
const TRAIL = 6;

/**
 * Xếp dải thẻ. Ô đích mang thẻ trúng, mọi ô còn lại bốc từ `pool` sao cho hai
 * ô cạnh nhau không trùng mặt — dải mà lặp lại thì mắt bắt ra ngay là giả.
 *
 * @param {object[]} pool cả bộ bài, kể cả lá đang nằm trong túi người khác:
 *   đây chỉ là hình nền chạy qua, không phải kết quả.
 */
export function buildStrip(kind, card, pool, rng, spin) {
  const target = LEAD + spin;
  const items = new Array(target + TRAIL + 1);
  let prev = -1;
  for (let i = 0; i < items.length; i++) {
    if (i === target) { items[i] = card; prev = -1; continue; }
    let j = (rng() * pool.length) | 0;
    if (j === prev) j = (j + 1) % pool.length;
    prev = j;
    items[i] = pool[j];
  }
  return { items, target };
}

function cellHtml(kind, card, i) {
  const r = RANKS[rankOf(kind, card)];
  return `
    <div class="co-cell r-${r.key}" data-i="${i}" style="--r:${r.color}">
      <div class="co-cell-top">${esc(deckName(kind, card))}</div>
      <div class="co-cell-sigil">${esc(sigilOf(kind, card))}</div>
      <div class="co-cell-label">${esc(shortLabel(kind, card))}</div>
    </div>`;
}

/* ------------------------------------------------------------- đường chuyển động */

/**
 * Ba chặng: nhấn ga, trôi đều, rồi hãm rất dài.
 *
 * `a`, `b` là hai mốc **thời gian** tính theo phần của cả pha (mặc định 0.15 và
 * 0.72 — tức 0,38 s tăng tốc, 1,43 s trôi, 0,70 s hãm trong pha 2,5 s). Vận tốc chặng
 * cuối giảm theo luỹ thừa ba nên mấy ô cuối bò từng chút một; chỗ hồi hộp nằm cả
 * ở đó chứ không phải lúc chạy nhanh.
 *
 * `v` là vận tốc chuẩn hoá, `s` là quãng đường đã đi — `s` chính là nguyên hàm
 * của `v`, chia cho tích phân toàn phần để luôn kết thúc đúng ở 1. Nhờ vậy đổi
 * `a`, `b` bao nhiêu thì dải vẫn dừng đúng ô đích, chỉ khác cảm giác.
 */
export function makeCurve(a = 0.15, b = 0.72) {
  const i1 = a / 3;
  const i2 = b - a;
  const i3 = (1 - b) / 4;
  const total = i1 + i2 + i3;
  return {
    v(u) {
      if (u < a) return (u / a) ** 2;
      if (u < b) return 1;
      const k = (u - b) / (1 - b);
      return (1 - k) ** 3;
    },
    s(u) {
      if (u <= 0) return 0;
      if (u >= 1) return 1;
      let d;
      if (u < a) d = (u ** 3) / (3 * a * a);
      else if (u < b) d = i1 + (u - a);
      else {
        const k = (u - b) / (1 - b);
        d = i1 + i2 + ((1 - b) * (1 - (1 - k) ** 4)) / 4;
      }
      return d / total;
    },
  };
}

/* ----------------------------------------------------------------- chạy dải */

/** Hai tiếng giấy cách nhau dưới ngần này thì bỏ bớt, không thì thành tiếng rè. */
const TICK_GAP = 0.028;

/**
 * @param {HTMLElement} track dải thẻ
 * @param {object} o `pos()` trả về mốc đầu và mốc cuối **đo lại ở mỗi khung
 *   hình**, nên cửa sổ có đổi cỡ giữa chừng thì đích vẫn bám đúng vạch.
 * @returns {Promise<void>}
 */
function spin(track, o) {
  return new Promise((done) => {
    let ticks = -1;
    let lastTick = -1;
    const t0 = performance.now();

    const frame = (now) => {
      const u = Math.min(1, (now - t0) / o.ms);
      const { from, to } = o.pos();
      const dist = from - to;                 // đi sang trái: `to` âm hơn `from`
      const travelled = dist * o.curve.s(u);
      track.style.transform = `translate3d(${from - travelled}px,0,0)`;

      if (o.sound) {
        const crossed = Math.floor(travelled / o.pitch());
        if (crossed > ticks) {
          const t = now / 1000;
          if (t - lastTick >= TICK_GAP) {
            audio.sfx('cardTick', { slow: 1 - o.curve.v(u) });
            lastTick = t;
          }
          ticks = crossed;
        }
      }

      if (u < 1) requestAnimationFrame(frame);
      else done();
    };
    requestAnimationFrame(frame);
  });
}

/* ------------------------------------------------------------------ hộp thoại */

/**
 * Bóc một thẻ có băng chuyền.
 *
 * @param {'chance'|'chest'|'event'} kind
 * @param {object} card thẻ trúng — đã rút xong từ trước
 * @param {object[]} pool bộ bài dùng lấp dải
 * @param {object} [o]
 *   - `faceHtml` mặt thẻ hiện ra sau khi dừng; bỏ trống thì dựng từ
 *     `fateCardBody` / `eventCardBody` như hộp thoại thường.
 *   - `seed` để mọi máy chạy ra cùng một dải; bỏ trống thì tự bốc.
 *   - `yieldToNext` hộp thoại mở sau sẽ đẩy hộp này đi — xem `openModal`.
 *   - `onReveal` gọi đúng lúc mặt thẻ vừa nở ra xong.
 *   - `closeOn` lời hứa đóng hộp từ bên ngoài, chỉ nghe từ sau khi thẻ đã lật:
 *     máy ngồi xem không có nút, hộp bên ấy tắt theo cú bấm của người đang đi.
 *   - `waitNote` dòng chữ thay chỗ thanh nút trên máy ngồi xem.
 *   - `dismissAfter` cho phép hết giờ lượt đóng hộp, tính từ lúc thẻ đã lật.
 *   - `buttons` / `label` thanh nút, dựng như `openModal`.
 *   - Nhịp: `ms` pha trôi (2500), `holdMs` đứng yên trước khi lật (460),
 *     `accel` và `cruiseEnd` hai mốc của đường chuyển động (0.15 / 0.72).
 *   - Dải: `minSpin` + `spinSpread` số ô trôi qua (42 + 0…18), `jitter` phần
 *     biên an toàn được phép lệch tâm (0.55).
 *   - Tiếng: `sound` false là im, `revealSfx` tên hiệu ứng lúc thẻ hiện ra
 *     ('card').
 * @returns {Promise<any>} giá trị nút bấm
 */
export function caseOpenModal(kind, card, pool, o = {}) {
  const seed = o.seed ?? newSeed();
  const rng = rngFrom(seed);
  const ms = o.ms ?? 2500;
  const sound = o.sound !== false;
  const rank = rankOf(kind, card);

  // Số ô trôi qua cũng ngẫu nhiên: dải ngắn dài khác nhau thì mỗi lần bóc mỗi khác
  const spinCards = (o.minSpin ?? 42) + Math.floor(rng() * (o.spinSpread ?? 18));
  const { items, target } = buildStrip(kind, card, pool, rng, spinCards);
  /* Dừng lệch tâm cho đỡ máy móc — nhưng đo theo **biên an toàn** của ô chứ
     không theo bước dải: lệch gần nửa ô thì vạch nằm sát ranh giới, mắt đọc
     ra ô bên cạnh và tưởng thẻ lật ra là thẻ khác. Biên an toàn = nửa bề ngang
     ô trừ 16 px, nên vạch luôn nằm hẳn trong lòng ô trúng. */
  const jitter = (rng() * 2 - 1) * (o.jitter ?? 0.55);

  const stage = document.createElement('div');
  stage.className = `co-stage r-${rank}`;
  stage.style.setProperty('--r', RANKS[rank].color);
  stage.innerHTML = `
    <div class="co-reel">
      <div class="co-track">${items.map((c, i) => cellHtml(kind, c, i)).join('')}</div>
      <div class="co-mark"></div>
    </div>`;

  const meta = kind === 'event'
    ? { eyebrow: 'BIẾN CỐ', title: 'Thời Cuộc' }
    : { eyebrow: 'BÓC THẺ', title: DECK_META[kind].title };

  return openModal({
    eyebrow: meta.eyebrow,
    title: meta.title,
    body: stage,
    dismissible: false,
    peekable: false,
    yieldToNext: o.yieldToNext,
    enter: false,                       // Enter chỉ mở khoá sau khi dải dừng
    buttons: o.buttons ?? [{
      label: o.label ?? 'Nhận thẻ',
      value: true,
      cls: rank === 'hiem' ? 'btn-gold' : 'btn-jade',
    }],
    onMount: async (body, close, modal, foot) => {
      /* Khung rộng ra để chứa dải. Bề ngang ấy phải đổi **ngay**, không được
         để nó chạy transition: quãng đường của dải đo theo vạch giữa khung, mà
         vạch giữa thì trôi suốt 0,42 s đầu — đo trúng lúc đang trôi thì dải
         dừng lệch gần một ô so với thẻ lát nữa lật ra. Tắt transition, ép tính
         layout một nhịp, rồi trả lại để lúc thu hẹp vẫn mượt. */
      modal.classList.add('co-modal');
      modal.style.transition = 'none';
      void modal.offsetWidth;
      modal.style.transition = '';

      foot?.classList.add('co-foot-hidden');

      const reel = stage.querySelector('.co-reel');
      const track = stage.querySelector('.co-track');
      const cells = track.children;
      const cell = cells[target];
      track.dataset.target = String(target);

      /**
       * Đo từ layout thật chứ không tin con số trong CSS: cỡ ô co lại ở màn
       * hình hẹp, và `offsetLeft` không bị transform của hộp thoại làm sai
       * như `getBoundingClientRect`.
       */
      const measure = () => {
        const pitch = cells[1].offsetLeft - cells[0].offsetLeft;
        const half = reel.clientWidth / 2;
        return {
          pitch,
          at: (i, off = 0) => half - (cells[i].offsetLeft + cells[i].offsetWidth / 2)
            - off * Math.max(0, cells[i].offsetWidth / 2 - 16),
        };
      };

      let m = measure();
      let from = m.at(LEAD);
      let to = m.at(target, jitter);
      track.style.transform = `translate3d(${from}px,0,0)`;
      stage.style.height = `${reel.offsetHeight}px`;

      // Kéo cửa sổ giữa lúc dải đang chạy thì đo lại — đích luôn bám theo vạch
      const ro = new ResizeObserver(() => {
        m = measure();
        from = m.at(LEAD);
        to = m.at(target, jitter);
      });
      ro.observe(reel);

      await new Promise((r) => requestAnimationFrame(r));     // để trình duyệt vẽ khung đầu
      const curve = makeCurve(o.accel ?? 0.15, o.cruiseEnd ?? 0.72);
      await spin(track, {
        curve, ms, sound,
        pitch: () => m.pitch,
        pos: () => ({ from, to }),
      });
      ro.disconnect();

      /* Chốt lại đúng chỗ đo được ở nhịp cuối. Bình thường sai số bằng 0, nhưng
         nếu có gì đó vừa làm đổi layout thì thà nhích một cái còn hơn để thẻ
         dưới vạch một đằng, thẻ lật ra một nẻo. */
      track.style.transform = `translate3d(${measure().at(target, jitter)}px,0,0)`;

      // Ô trúng sáng lên, mấy ô còn lại lùi xuống — hết đường đọc nhầm ô bên cạnh
      track.classList.add('done');
      cell.classList.add('won');
      // Đứng yên một nhịp: dải vừa dừng mà lật ngay thì không ai kịp thấy nó
      // dừng ở đâu, và đó chính là chỗ người ta ngờ thẻ lật ra không phải thẻ
      // dưới vạch.
      await new Promise((r) => setTimeout(r, o.holdMs ?? 460));
      await reveal(stage, reel, cell, kind, card, rank, o);
      o.onReveal?.();          // mốc để bên gọi đếm giờ từ lúc thẻ hiện ra

      foot?.classList.remove('co-foot-hidden');
      /* Không có nút thì phải nói vì sao: hộp không nút mà cũng không tắt được
         thì người ngồi xem tưởng máy treo. */
      if (o.waitNote) {
        const note = document.createElement('div');
        note.className = 'co-wait';
        note.textContent = o.waitNote;
        modal.appendChild(note);
      }
      const btn = foot?.querySelector('.btn');
      if (btn) {
        const onKey = (e) => {
          /* Hộp đóng bằng đường khác (hết giờ lượt, tin từ máy đang đi) thì nút
             rời khỏi trang mà listener còn treo trên `window`: gỡ ngay, không
             thì nó nuốt phím Enter của hộp thoại kế tiếp. */
          if (!btn.isConnected) { window.removeEventListener('keydown', onKey, true); return; }
          if (e.key !== 'Enter' || e.repeat) return;
          e.preventDefault();
          window.removeEventListener('keydown', onKey, true);
          btn.click();
        };
        window.addEventListener('keydown', onKey, true);
      }
      /* Hết giờ lượt thì `dismissTopModal` được phép đóng hộp này — nhưng chỉ
         từ lúc thẻ đã lật, chứ đang chạy dải mà bị đóng thì người chơi mất
         luôn phần đáng xem. Hộp thoại thẻ trước đây vẫn đóng được như vậy;
         khoá hẳn thì bàn đứng chờ một người đã rời máy. */
      if (o.dismissAfter) {
        const scrim = modal.parentElement;
        if (scrim) { scrim._dismissible = true; scrim._autoValue = true; }
      }
      /* Đăng ký **sau** khi thẻ đã lật, không phải lúc mở hộp: máy nào chạy dải
         chậm hơn một nhịp mà nghe ngay từ đầu thì tắt hộp trước cả lúc mặt thẻ
         hiện ra — xem dải nãy giờ để rồi không thấy thẻ. */
      if (o.closeOn) o.closeOn.then(() => close(null));
    },
  });
}

/* ------------------------------------------------------------------- lật thẻ */

/**
 * Ô trúng nở ra thành mặt thẻ.
 *
 * Dựng mặt thẻ ở đúng chỗ nó sẽ đứng, đo lấy khung, rồi cho nó chạy ngược từ
 * khung của ô nhỏ về khung ấy (FLIP). Làm cách này thì hai hình luôn khớp nhau
 * dù cỡ chữ hay bề ngang modal có đổi.
 */
async function reveal(stage, reel, cell, kind, card, rank, o) {
  const face = document.createElement('div');
  face.className = `co-face r-${rank}`;
  const body = o.faceHtml
    ?? (kind === 'event' ? eventCardBody(card, o.detail ?? '') : fateCardBody(kind, card, o));
  face.innerHTML = `<div class="co-rank">HẠNG ${RANKS[rank].name.toUpperCase()}</div>` + body;
  stage.appendChild(face);

  const a = cell.getBoundingClientRect();
  const b = face.getBoundingClientRect();
  const sx = a.width / b.width;
  const sy = a.height / b.height;
  const dx = a.left + a.width / 2 - (b.left + b.width / 2);
  const dy = a.top + a.height / 2 - (b.top + b.height / 2);

  stage.style.height = `${face.offsetHeight}px`;   // modal cao dần lên, không giật
  reel.classList.add('fade');
  if (o.sound !== false) audio.sfx(o.revealSfx ?? 'card');
  // Khung rộng là để chứa dải; còn lại một mặt thẻ thì thu về đúng cỡ hộp thoại thường
  stage.closest('.modal')?.classList.add('co-slim');


  const anim = face.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.25 },
    { transform: 'translate(0,0) scale(1,1)', opacity: 1 },
  ], { duration: 460, easing: 'cubic-bezier(.18,.89,.32,1.28)', fill: 'both' });

  await anim.finished.catch(() => {});
  face.classList.add('settled');
}

/* --------------------------------------------------------- hai cửa vào sẵn */

/**
 * Bóc một thẻ Cơ Hội / Khí Vận. Thay chỗ `cardModal` cũ: cùng tham số, chỉ
 * thêm `seed` để mọi máy chạy ra cùng một dải.
 *
 * @param {{amount?:?number, note?:string, label?:string, seed?:number,
 *   closeOn?:Promise, waitNote?:string}} [o]
 */
export function fateCase(kind, card, o = {}) {
  const amount = o.amount ?? null;
  const up = amount !== null && amount > 0;
  /* Thẻ Cơ Hội / Khí Vận là chuyện của riêng người vừa đáp xuống ô: nút và phím
     Enter chỉ có trên máy ấy. Máy ngồi xem nhận `closeOn` — không dựng nút nên
     `openModal` cũng không gắn Enter, và hộp tắt theo cú bấm bên kia. Bỏ luôn
     `dismissAfter`: đồng hồ lượt bên này không phải của họ, đóng hộ là cắt ngang
     giữa chừng. */
  const watching = !!o.closeOn;
  return caseOpenModal(kind, card, DECKS[kind], {
    dismissAfter: !watching,
    ...o,
    faceHtml: fateCardBody(kind, card, o),
    buttons: watching ? [] : [{
      label: o.label ?? (up ? 'Nhận tiền' : 'Đành chịu'),
      value: true,
      cls: up ? 'btn-jade' : 'btn-danger',
    }],
  });
}

/**
 * Bóc một thẻ Thời Cuộc. Thay chỗ `eventCardModal` cũ.
 *
 * Hộp **không tự đóng**: thẻ đổi luật của cả bàn, mặt thẻ có mấy dòng áp dụng,
 * đọc chưa xong mà nó biến mất thì người chơi không biết vừa dính chuyện gì.
 * Máy nào cũng có nút, mỗi máy đóng theo nhịp của mình.
 *
 * Hai đường đóng khác, cho hộp khỏi thành tấm bảng chắn:
 * `yieldToNext` — mạch sự kiện mở hộp hỏi (đấu giá, chọn khu) thì tấm thẻ nhường
 * chỗ, chứ chồng lên nhau thì người chơi phải dọn hai lớp mới thấy bàn cờ;
 * `dismissAfter` — đồng hồ lượt đóng hộ ở máy người bỏ đi giữa chừng.
 *
 * @param {{detail?:string, label?:string, seed?:number}} [o]
 */
export function eventCase(card, o = {}) {
  return caseOpenModal('event', card, EVENTS, {
    yieldToNext: true,
    dismissAfter: true,
    ...o,
    faceHtml: eventCardBody(card, o.detail ?? ''),
    buttons: [{ label: o.label ?? 'Đã rõ', value: true, cls: 'btn-gold' }],
  });
}
