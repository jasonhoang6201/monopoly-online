/**
 * Modal dùng chung — có hiệu ứng ẩn/hiện (mờ nền + trượt lên + bung nhẹ).
 */

const root = () => document.getElementById('modal-root');

/* ==================================================================
   Tạm ẩn hộp thoại để ngó bàn cờ
   Giữ phím Space (hoặc bấm con mắt ở góc modal) → modal mờ đi,
   thả phím / bấm vào đâu đó là hiện lại. Không modal nào bị đóng.
   ================================================================== */

let peeking = false;
let peekPill = null;

/** Có modal nào đang mở mà cho phép ngó bàn cờ không? */
const peekableOpen = () => root()?.querySelector('.scrim:not(.hide):not(.no-peek):not(.stashed)');

const isTyping = (el) => el instanceof HTMLInputElement
  || el instanceof HTMLTextAreaElement
  || (el instanceof HTMLElement && el.isContentEditable);

/** Bấm ra ngoài khi đang ngó → hiện lại hộp thoại. */
function onPeekPointer(e) {
  if (peekPill?.contains(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
  setPeek(false);
}

/** Bật/tắt chế độ ngó bàn cờ (áp dụng cho mọi modal đang xếp chồng). */
export function setPeek(on) {
  const r = root();
  if (!r) return;
  on = !!on && !!peekableOpen();
  if (on === peeking) return;
  peeking = on;
  r.classList.toggle('peeking', on);

  if (on) {
    if (!peekPill) {
      peekPill = document.createElement('button');
      peekPill.type = 'button';
      peekPill.className = 'peek-pill';
      peekPill.title = 'Hộp thoại đang tạm ẩn để bạn ngó bàn cờ';
      peekPill.innerHTML = '<span class="peek-eye">👁</span> Hiện lại hộp thoại';
      peekPill.addEventListener('click', () => setPeek(false));
    }
    r.appendChild(peekPill);
    window.addEventListener('pointerdown', onPeekPointer, true);
  } else {
    peekPill?.remove();
    window.removeEventListener('pointerdown', onPeekPointer, true);
  }
}

window.addEventListener('keydown', (e) => {
  if (peeking && e.key === 'Escape') {
    // Đang ngó thì Esc chỉ kéo hộp thoại về, không đóng nó
    e.preventDefault();
    e.stopImmediatePropagation();
    setPeek(false);
    return;
  }
  if (e.code !== 'Space' || e.repeat || peeking) return;
  if (isTyping(e.target) || !peekableOpen()) return;
  e.preventDefault();       // đừng để Space bấm nhầm nút đang focus
  e.stopImmediatePropagation();
  setPeek(true);
}, true);

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && peeking) {
    e.preventDefault();
    setPeek(false);
  }
}, true);

// Mất focus (alt-tab) giữa lúc đang giữ phím thì không kẹt ở trạng thái ẩn
window.addEventListener('blur', () => setPeek(false));

/**
 * Mở một modal.
 * @param {object} o
 * @param {string} [o.eyebrow]  dòng chữ nhỏ phía trên tiêu đề
 * @param {string} o.title      tiêu đề
 * @param {string} [o.sub]      dòng phụ dưới tiêu đề
 * @param {string|Node} [o.body] nội dung thân modal
 * @param {Array}  [o.buttons]  [{ label, value, cls, disabled }]
 * @param {boolean}[o.wide]     dùng khung rộng (trading)
 * @param {boolean}[o.dismissible] false = không cho đóng bằng phím Esc
 * @param {boolean}[o.scrimClose] true = hộp thoại chỉ để xem, bấm ra nền là đóng
 * @param {boolean}[o.peekable] false = không cho tạm ẩn để ngó bàn cờ
 * @param {any}    [o.escValue] giá trị khi đóng bằng Esc (mặc định: nút cuối cùng)
 * @param {any}    [o.timeoutValue] giá trị khi hết giờ lượt tự đóng hộp
 *   (mặc định: như `escValue`) — xem `dismissTopModal`
 * @param {boolean}[o.enter]    false = không cho Enter bấm nút đầu tiên
 * @param {Function}[o.onMount] (bodyEl, close, modalEl, footEl, stash) — gắn sự
 *   kiện động. `stash(true/false)` cất hộp thoại đi rồi gọi nó về, dùng khi
 *   người chơi cần thao tác thẳng trên bàn cờ.
 * @returns {Promise<any>} giá trị của nút được bấm
 */
export function openModal(o) {
  const peekable = o.peekable !== false;
  setPeek(false); // modal mới mở thì luôn hiện ra đàng hoàng
  const scrim = document.createElement('div');
  scrim.className = 'scrim' + (peekable ? '' : ' no-peek');

  const modal = document.createElement('div');
  modal.className = 'modal' + (o.wide ? ' wide' : '');
  scrim.appendChild(modal);

  const head = document.createElement('div');
  head.className = 'modal-head';
  head.innerHTML = `
    ${o.eyebrow ? `<div class="modal-eyebrow">${o.eyebrow}</div>` : ''}
    <div class="modal-title">${o.title ?? ''}</div>
    ${o.sub ? `<div class="modal-sub">${o.sub}</div>` : ''}`;
  modal.appendChild(head);

  if (peekable) {
    const peekBtn = document.createElement('button');
    peekBtn.type = 'button';
    peekBtn.className = 'modal-peek';
    peekBtn.textContent = '👁';
    peekBtn.title = 'Tạm ẩn để ngó bàn cờ (hoặc giữ phím Space)';
    peekBtn.setAttribute('aria-label', 'Tạm ẩn hộp thoại để ngó bàn cờ');
    peekBtn.addEventListener('click', () => setPeek(true));
    modal.appendChild(peekBtn);
  }

  const body = document.createElement('div');
  body.className = 'modal-body';
  if (typeof o.body === 'string') body.innerHTML = o.body;
  else if (o.body) body.appendChild(o.body);
  modal.appendChild(body);

  const foot = document.createElement('div');
  foot.className = 'modal-foot';
  modal.appendChild(foot);

  let settled = false;
  let resolveFn;
  const promise = new Promise((res) => { resolveFn = res; });

  const close = (value) => {
    if (settled) return;
    settled = true;
    window.removeEventListener('keydown', onKey, true);
    scrim.classList.remove('show');
    scrim.classList.add('hide');
    setTimeout(() => scrim.remove(), 320);
    if (peeking && !peekableOpen()) setPeek(false);
    resolveFn(value);
  };

  /* Chỉ những nút do caller khai báo mới nhận phím tắt. Có hộp thoại tự dựng
     thêm nút trong `onMount` (phòng chờ) — bắt nhầm cái đó thì Enter hoá ra
     bấm "Rời phòng". */
  const btnEls = [];
  for (const b of o.buttons ?? []) {
    const btn = document.createElement('button');
    btn.className = `btn ${b.cls ?? ''}`;
    btn.textContent = b.label;
    btn.disabled = !!b.disabled;
    btn.addEventListener('click', () => close(b.value));
    foot.appendChild(btn);
    btnEls.push(btn);
  }
  if (!o.buttons?.length) foot.remove();

  /* Esc đóng modal — mặc định trả về giá trị của nút cuối cùng
     (thường là nút "Bỏ qua / Huỷ / Đóng"), trừ khi caller chỉ định escValue. */
  const escValue = 'escValue' in o
    ? o.escValue
    : (o.buttons?.length ? o.buttons[o.buttons.length - 1].value : undefined);

  /* Hộp thoại có/không nào cũng bấm được bằng bàn phím: **Enter là đồng ý**
     (nút đầu tiên còn bấm được), **Esc là thôi** (đường sẵn có ở trên). Đọc
     trạng thái `disabled` ngay lúc bấm chứ không lúc dựng, vì có hộp thoại bật
     tắt nút theo thao tác của người chơi (chọn đất để đổi, đủ tiền hay chưa). */
  const enterBtn = () => (o.enter === false ? null : btnEls.find((b) => !b.disabled) ?? null);

  /** Con dấu phím in trên nút, để người chơi biết mà dùng. */
  const stamp = (btn, text) => {
    if (!btn) return;
    const kbd = document.createElement('kbd');
    kbd.className = 'btn-key';
    kbd.textContent = text;
    kbd.setAttribute('aria-hidden', 'true');
    btn.appendChild(kbd);
  };
  const yes = enterBtn();
  stamp(yes, '⏎');
  // Nút "thôi" chỉ đóng dấu Esc khi Esc thật sự rơi đúng vào nó
  const no = btnEls[btnEls.length - 1];
  if (o.dismissible !== false && !('escValue' in o) && no && no !== yes) stamp(no, 'Esc');

  /** Nháy nút một cái cho thấy phím vừa ăn vào đâu — giống thanh nút hành động. */
  const hit = (btn) => {
    btn.classList.add('key-hit');
    setTimeout(() => btn.classList.remove('key-hit'), 200);
    btn.click();
  };

  function onKey(e) {
    if (settled || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    /* Chỉ modal trên cùng mới nhận phím — bỏ qua modal đang chạy hiệu ứng đóng,
       và cả modal đang nấp sau bàn cờ (`stash`): lúc ấy phím thuộc về phiên
       chọn ô, Esc mà rơi vào đây thì huỷ luôn cả đề nghị đang dựng dở. */
    const open = root().querySelectorAll('.scrim:not(.hide):not(.stashed)');
    if (open[open.length - 1] !== scrim) return;

    if (e.key === 'Escape') {
      if (o.dismissible === false) return;
      e.preventDefault();
      e.stopPropagation();
      close(escValue);
      return;
    }
    if (e.key !== 'Enter') return;
    // Đang gõ nhiều dòng thì Enter là xuống dòng, không phải "đồng ý"
    if (e.target instanceof HTMLTextAreaElement
      || (e.target instanceof HTMLElement && e.target.isContentEditable)) return;
    const btn = enterBtn();
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    hit(btn);
  }
  window.addEventListener('keydown', onKey, true);

  /* Hộp thoại chỉ để xem: bấm ra vùng nền tối là đóng.
     Đòi hỏi cả lúc nhấn lẫn lúc thả đều ở trên nền, để người chơi quét chữ
     trong hộp thoại rồi lỡ thả tay ra ngoài thì không bị đóng oan. */
  if (o.scrimClose && o.dismissible !== false) {
    let downOnScrim = false;
    scrim.addEventListener('pointerdown', (e) => { downOnScrim = e.target === scrim; });
    scrim.addEventListener('click', (e) => {
      if (settled || !downOnScrim || e.target !== scrim) return;
      // Đang ngó bàn cờ thì cú bấm ấy chỉ để kéo hộp thoại về, không phải đóng
      if (root()?.classList.contains('peeking')) return;
      close(escValue);
    });
    scrim.classList.add('scrim-closable');
  }

  // Cho flashModal (và các chỗ khác) đóng đúng cách, không rò listener
  scrim._close = close;
  /* Hết giờ lượt thì `dismissTopModal` đóng hộp này bằng đâu. Mặc định là giá
     trị của Esc; hộp nào cần phân biệt "người chơi bấm thôi" với "hết giờ" thì
     khai `timeoutValue` riêng (hộp thiếu tiền: hết giờ là xoay tiền hộ). */
  scrim._autoValue = 'timeoutValue' in o ? o.timeoutValue : escValue;
  scrim._dismissible = o.dismissible !== false;

  /* Tạm cất hộp thoại đi để người chơi thao tác thẳng trên bàn cờ (chọn đất
     lúc dựng đề nghị giao dịch). Khác `setPeek`: peek chỉ làm mờ và cú bấm kế
     tiếp kéo hộp về, còn ở đây hộp phải biến mất hẳn cho tới lúc gọi lại. */
  const stash = (on) => {
    scrim.classList.toggle('stashed', !!on);
    if (on) setPeek(false);
  };

  root().appendChild(scrim);
  // Ép trình duyệt tính layout trước khi bật transition
  void scrim.offsetHeight;
  requestAnimationFrame(() => scrim.classList.add('show'));

  if (o.onMount) o.onMount(body, close, modal, foot, stash);

  return promise;
}

/**
 * Đóng hộp thoại trên cùng bằng lựa chọn mặc định (nút cuối / `escValue`) —
 * y như người chơi bấm Esc.
 *
 * Dùng khi đồng hồ lượt cạn: người ngồi im không bị mời khỏi bàn nữa, thay vào
 * đó máy của họ tự trả lời "thôi" hộ, để cả bàn khỏi đứng chờ. Bỏ qua hộp đang
 * `stash` (người chơi đang chọn ô thẳng trên bàn cờ — phiên chọn ấy có hạn
 * riêng) và hộp không cho đóng bằng Esc.
 *
 * @returns {boolean} có đóng được hộp nào không.
 */
export function dismissTopModal() {
  const open = root()?.querySelectorAll('.scrim:not(.hide):not(.stashed)');
  const scrim = open?.[open.length - 1];
  if (!scrim || scrim._dismissible === false) return false;
  scrim._close?.(scrim._autoValue);
  return true;
}

/** Modal chỉ để thông báo, tự đóng sau `ms`. */
export function flashModal(o, ms = 1600) {
  // Tự tắt sau chớp mắt nên không cần nút ngó bàn cờ
  const p = openModal({ ...o, peekable: false, buttons: o.buttons ?? [] });
  const scrim = [...root().querySelectorAll('.scrim')].pop();
  setTimeout(() => scrim?._close?.(), ms);
  return new Promise((r) => setTimeout(r, ms + 300));
}

/** Màn hình chuyển máy giữa hai người chơi (giữ kín thông tin). */
export function handoff(playerName, cssColor, note) {
  return openModal({
    eyebrow: 'CHUYỀN MÁY',
    title: 'Đổi người chơi',
    body: `<div class="handoff">
        <div class="handoff-eye">🤝</div>
        <div class="handoff-name" style="color:${cssColor}">${playerName}</div>
        <div class="handoff-note">${note ?? 'Hãy chuyền máy cho người chơi này rồi bấm Tiếp tục.'}</div>
      </div>`,
    buttons: [{ label: 'Tiếp tục', value: true, cls: 'btn-primary' }],
  });
}
