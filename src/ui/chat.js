/**
 * Khung chat của phòng online.
 *
 * Tin nhắn chỉ đi qua đường truyền của phòng (`room.chat` → tin `chat`), **không
 * lưu ở đâu cả**: không vào ảnh chụp ván, không vào cơ sở dữ liệu. Ai đang có
 * mặt thì đọc được, người vào sau hay bấm F5 thì thấy khung trống — giống nói
 * chuyện quanh bàn cờ thật, lời đã nói ra thì thôi.
 *
 * Khung nổi ở góc phải màn hình chứ không nằm trong hàng nút ở cột trái, vì nó
 * phải dùng được cả lúc **ngồi phòng chờ** — mà phòng chờ là một hộp thoại phủ
 * kín cột trái. Nút mở khung và khung đều đứng trên lớp hộp thoại, nên đang có
 * hộp mua đất mở dở vẫn nhắn được.
 *
 * Chơi một máy thì không có phòng, nút cứ ẩn.
 */
import { TOKENS } from '../core/state.js';
import { audio } from '../audio/audio.js';

/** Dài hơn mức này thì cắt — khung hẹp, một tin dài là chiếm hết chỗ. */
export const CHAT_MAX = 200;
/** Giữ bao nhiêu tin trong khung. Cũ hơn thì bỏ, chẳng ai cuộn ngược xa thế. */
const KEEP = 80;
/** Hạn mức gửi: `QUOTA` tin trong `WINDOW_MS`, cửa sổ trượt như meme. */
const QUOTA = 5;
const WINDOW_MS = 6000;
/* Máy nhận chặn rộng tay hơn máy gửi một chút: hạn của máy gửi đã đủ cho
   người chơi tử tế, hạn này chỉ để một máy sửa mã gửi dồn không làm ngập
   khung của cả bàn. */
const HEAR_QUOTA = 8;
/** Tin mới tới lúc khung đang đóng thì hiện trích đoạn bên cạnh nút bao lâu. */
const PEEK_MS = 4200;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Gọt tin nhắn: bỏ ký tự điều khiển, gộp khoảng trắng, cắt độ dài. */
export function cleanText(s) {
  return String(s ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MAX);
}

const prune = (stamps, now) => {
  while (stamps.length && now - stamps[0] > WINDOW_MS) stamps.shift();
  return stamps;
};

class ChatDock {
  constructor() {
    this.room = null;
    /** @type {Array<{seat:number,name:string,color:string,text:string,mine:boolean,t:number}>} */
    this.log = [];
    this.unread = 0;
    this.sent = [];
    /** id người gửi → mốc các lần nhận, chặn một máy gửi dồn. */
    this.heard = new Map();
    this.peekTimer = 0;
    this.#build();
  }

  #build() {
    this.btn = document.createElement('button');
    this.btn.id = 'chat-btn';
    this.btn.type = 'button';
    this.btn.hidden = true;
    this.btn.title = 'Chat với cả bàn (Enter)';
    this.btn.setAttribute('aria-label', 'Mở khung chat');
    this.btn.setAttribute('aria-expanded', 'false');
    this.btn.innerHTML = '<span aria-hidden="true">💬</span><b class="chat-badge" hidden></b>';
    this.badge = this.btn.querySelector('.chat-badge');

    this.peekEl = document.createElement('div');
    this.peekEl.id = 'chat-peek';
    this.peekEl.hidden = true;

    this.panel = document.createElement('section');
    this.panel.id = 'chat-dock';
    this.panel.hidden = true;
    this.panel.setAttribute('aria-label', 'Chat');
    this.panel.innerHTML = `
      <header class="chat-head">
        <span>TRÒ CHUYỆN</span>
        <button class="chat-x" type="button" aria-label="Đóng khung chat" title="Đóng (Esc)">✕</button>
      </header>
      <ol class="chat-list" aria-live="polite"></ol>
      <form class="chat-form" autocomplete="off">
        <input class="chat-input" type="text" maxlength="${CHAT_MAX}"
               placeholder="Nhắn cả bàn…" aria-label="Tin nhắn" enterkeyhint="send">
        <button class="chat-send" type="submit" aria-label="Gửi">➤</button>
      </form>
      <div class="chat-note" hidden></div>`;
    this.list = this.panel.querySelector('.chat-list');
    this.input = this.panel.querySelector('.chat-input');
    this.note = this.panel.querySelector('.chat-note');

    document.body.append(this.btn, this.peekEl, this.panel);

    this.btn.addEventListener('click', () => this.toggle());
    this.peekEl.addEventListener('click', () => this.open());
    this.panel.querySelector('.chat-x').addEventListener('click', () => this.close());
    this.panel.querySelector('.chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.#send();
    });
    this.input.addEventListener('keydown', (e) => {
      // Phím gõ trong ô chat là chữ, không phải phím tắt của ván
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.close(); this.input.blur(); }
    });

    /* Enter ở ngoài mọi ô nhập, lúc không có hộp thoại nào mở, là mở khung và
       đặt con trỏ vào ô gõ — khỏi phải với chuột. Có hộp thoại mở thì Enter là
       "đồng ý" của hộp ấy, không giành. */
    window.addEventListener('keydown', (e) => {
      if (!this.room || e.key !== 'Enter' || e.repeat) return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement
        || t instanceof HTMLButtonElement || (t instanceof HTMLElement && t.isContentEditable)) return;
      if (document.querySelector('#modal-root .scrim:not(.hide)')) return;
      e.preventDefault();
      this.open();
    });
  }

  // ---------------------------------------------------------------- nối phòng

  /**
   * Gắn vào phòng vừa vào được. Đổi phòng thì khung trống lại: tin của phòng cũ
   * không thuộc về ai ở phòng mới.
   * @param {import('../net/room.js').Room} room
   */
  attach(room) {
    this.room = room;
    this.log = [];
    this.heard.clear();
    this.list.innerHTML = '';
    this.#setUnread(0);
    room.on.chat = (m) => this.#receive(m);
    this.btn.hidden = false;
  }

  // ------------------------------------------------------------------ gửi / nhận

  #send() {
    const text = cleanText(this.input.value);
    if (!text || !this.room || this.room.left) return;
    const now = Date.now();
    if (prune(this.sent, now).length >= QUOTA) {
      const wait = Math.ceil((WINDOW_MS - (now - this.sent[0])) / 1000);
      this.#flashNote(`Chậm lại chút — gửi tiếp sau ${wait} giây.`);
      return;
    }
    this.sent.push(now);
    this.input.value = '';
    // Đường truyền không dội tin về người gửi, nên tự ghi tin của mình
    this.#add(this.room.me.id, text, true);
    this.room.chat(text);
  }

  #receive(m) {
    const room = this.room;
    if (!room || !m?.id || m.id === room.me.id) return;
    // Người ngoài sổ ghế (đã bị mời ra, hoặc chưa được nhận) thì không nghe
    if (room.seatOf(m.id) < 0) return;
    const text = cleanText(m.text);
    if (!text) return;
    const now = Date.now();
    const stamps = prune(this.heard.get(m.id) ?? [], now);
    if (stamps.length >= HEAR_QUOTA) return;
    stamps.push(now);
    this.heard.set(m.id, stamps);

    const entry = this.#add(m.id, text, false);
    if (this.isOpen) return;
    this.#setUnread(this.unread + 1);
    this.#peek(entry);
    audio.sfx('click');
  }

  /** Ghi một tin vào khung. Tên và màu tra từ sổ ghế lúc này. */
  #add(id, text, mine) {
    const seat = this.room.seatOf(id);
    const s = this.room.seats[seat];
    const entry = {
      seat,
      name: s?.name || `Người chơi ${seat + 1}`,
      color: TOKENS[s?.token]?.css ?? 'var(--gold-light)',
      text,
      mine,
      t: Date.now(),
    };
    this.log.push(entry);

    const li = document.createElement('li');
    li.className = `chat-msg${mine ? ' mine' : ''}`;
    li.innerHTML = `<b style="color:${entry.color}">${escapeHtml(entry.name)}</b>`
      + `<span>${escapeHtml(text)}</span>`;
    this.list.append(li);
    while (this.log.length > KEEP) {
      this.log.shift();
      this.list.firstElementChild?.remove();
    }
    this.list.scrollTop = this.list.scrollHeight;
    return entry;
  }

  // ---------------------------------------------------------------- mở / đóng

  get isOpen() { return !this.panel.hidden; }

  open() {
    if (!this.room) return;
    this.panel.hidden = false;
    this.btn.setAttribute('aria-expanded', 'true');
    this.btn.classList.add('on');
    this.#setUnread(0);
    this.#hidePeek();
    this.list.scrollTop = this.list.scrollHeight;
    this.input.focus();
  }

  close() {
    this.panel.hidden = true;
    this.btn.setAttribute('aria-expanded', 'false');
    this.btn.classList.remove('on');
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }

  #setUnread(n) {
    this.unread = n;
    this.badge.hidden = n === 0;
    this.badge.textContent = n > 9 ? '9+' : String(n);
  }

  /** Khung đang đóng mà có tin mới → trích một dòng cạnh nút cho kịp đọc. */
  #peek(entry) {
    this.peekEl.innerHTML = `<b style="color:${entry.color}">${escapeHtml(entry.name)}</b>`
      + `<span>${escapeHtml(entry.text)}</span>`;
    this.peekEl.hidden = false;
    clearTimeout(this.peekTimer);
    this.peekTimer = setTimeout(() => this.#hidePeek(), PEEK_MS);
  }

  #hidePeek() {
    clearTimeout(this.peekTimer);
    this.peekEl.hidden = true;
  }

  #flashNote(text) {
    this.note.textContent = text;
    this.note.hidden = false;
    clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => { this.note.hidden = true; }, 2600);
  }
}

let dock = null;

/** Khung chat dùng chung cả trang — dựng lần đầu khi có phòng. */
export function chatDock() {
  dock ??= new ChatDock();
  return dock;
}
