/**
 * Thả meme lên bàn cờ.
 *
 * Nút nằm ở chân cột điều khiển, cạnh nút nhạc và toàn màn hình — cố ý **không**
 * để trong thanh nút hành động, vì thanh ấy chỉ hiện cho người đang tới lượt,
 * còn meme thì ai cũng thả được bất cứ lúc nào, kể cả đang ngồi xem người khác đi.
 *
 * Chọn xong thì ảnh nổi lên thành bong bóng vuông ngay trên đầu quân cờ của người
 * gửi, đứng vài giây rồi tắt. Bong bóng bám theo quân: quân đang chạy thì bong
 * bóng chạy theo, vì mỗi khung hình đều đọc lại toạ độ quân từ scene.
 *
 * Hạn mức: `MEME_QUOTA` lần trong `MEME_WINDOW_MS`, tính theo cửa sổ trượt —
 * mỗi lần gửi tự hồi lại sau đúng một cửa sổ, không phải chờ tới mốc chẵn phút.
 * Cần hạn vì đây là thứ duy nhất trong ván không theo lượt: không chặn thì một
 * người bấm liên hồi là che kín bàn cờ của bốn người kia.
 */
import { MEMES, MEME_BY_ID } from '../data/memes.js';
import { audio } from '../audio/audio.js';

export const MEME_QUOTA = 6;
/* Cửa sổ ngắn hơn bong bóng nhiều (3,6s × 6 = 21,6s ≈ một cửa sổ), nên hạn mức
   chỉ chặn được đúng cái cần chặn: bấm dồn liên hồi. Thả thong thả thì gần như
   không bao giờ chạm hạn. */
export const MEME_WINDOW_MS = 20000;

/** Bong bóng đứng trên bàn bao lâu trước khi mờ đi. */
const SHOW_MS = 3600;
/** Thời gian mờ dần — phải khớp với `transition` của `.meme-bub` trong style.css. */
const FADE_MS = 240;

/** Bỏ khỏi danh sách mốc thời gian những lần đã ra ngoài cửa sổ. */
const prune = (stamps, now) => {
  while (stamps.length && now - stamps[0] > MEME_WINDOW_MS) stamps.shift();
  return stamps;
};

export class MemeDeck {
  /**
   * @param {object} scene BoardScene — chỉ dùng `tokenScreenPos()`
   * @param {object} o
   * @param {() => number} o.seatOf ghế của người bấm trên máy này
   * @param {(id:string) => void} [o.send] phát cho các máy khác
   */
  constructor(scene, { seatOf, send } = {}) {
    this.scene = scene;
    this.seatOf = seatOf ?? (() => -1);
    this.send = send ?? (() => {});
    this.state = null;
    /** Mốc các lần **máy này** gửi. */
    this.sent = [];
    /** Ghế → mốc các lần nhận được, chặn một máy khác gửi dồn. */
    this.heard = new Map();
    /** Ghế → bong bóng đang hiện. Mỗi ghế nhiều nhất một cái. */
    this.bubbles = new Map();
    this.raf = 0;
    this.quotaTimer = 0;
    this.#build();
  }

  /**
   * Ván đã dựng xong → mở nút và nạp sẵn ảnh.
   *
   * Nạp sẵn vì bong bóng chỉ đứng 3,6 giây: ảnh nào cũng phải tải xong trước
   * lúc bấm, chứ tải lúc bấm thì bên nhận chỉ kịp thấy khung trắng.
   */
  setState(state) {
    this.state = state;
    if (this.btn) this.btn.hidden = false;
    if (this.preloaded) return;
    this.preloaded = true;
    const warm = () => MEMES.forEach((m) => { new Image().src = m.url; });
    if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 4000 });
    else setTimeout(warm, 1200);
  }

  // ------------------------------------------------------------ bảng chọn

  #build() {
    this.btn = document.getElementById('meme-btn');
    this.layer = document.getElementById('meme-layer');
    if (!this.btn || !this.layer) return;
    this.btn.hidden = true;

    this.pop = document.createElement('div');
    this.pop.id = 'meme-pop';
    this.pop.hidden = true;
    this.pop.innerHTML = `
      <div class="meme-grid">${MEMES.map((m) => `
        <button class="meme-pick" data-id="${m.id}" type="button"
                title="${m.label}" aria-label="${m.label}">
          <img src="${m.url}" alt="${m.label}" draggable="false">
        </button>`).join('')}
      </div>
      <div class="meme-quota"></div>`;
    this.btn.parentElement.appendChild(this.pop);
    this.quotaEl = this.pop.querySelector('.meme-quota');

    this.btn.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });
    this.pop.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('.meme-pick');
      if (b) this.#fire(b.dataset.id);
    });
    // Bấm ra ngoài hay bấm Esc thì cất bảng đi — không chặn cú bấm ấy lại,
    // để bấm thẳng từ bảng meme sang một nút khác vẫn ăn ngay lần đầu.
    document.addEventListener('click', () => this.close());
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
  }

  toggle() { if (this.pop?.hidden) this.open(); else this.close(); }

  open() {
    if (!this.pop || !this.state) return;
    this.pop.hidden = false;
    this.#refreshQuota();
    // Hạn mức hồi theo thời gian thật, nên chữ "còn mấy lượt" phải tự đếm lại
    clearInterval(this.quotaTimer);
    this.quotaTimer = setInterval(() => this.#refreshQuota(), 500);
  }

  close() {
    if (!this.pop || this.pop.hidden) return;
    this.pop.hidden = true;
    clearInterval(this.quotaTimer);
    this.quotaTimer = 0;
  }

  /** Còn bao nhiêu lần gửi được ngay bây giờ. */
  left() { return MEME_QUOTA - prune(this.sent, Date.now()).length; }

  /** Còn bao nhiêu mili giây nữa thì có thêm một lần. */
  #waitMs() {
    const now = Date.now();
    if (prune(this.sent, now).length < MEME_QUOTA) return 0;
    return MEME_WINDOW_MS - (now - this.sent[0]);
  }

  #refreshQuota() {
    if (!this.quotaEl) return;
    const left = this.left();
    const out = left <= 0;
    this.quotaEl.classList.toggle('out', out);
    this.quotaEl.textContent = out
      ? `Hết lượt — chờ ${Math.ceil(this.#waitMs() / 1000)} giây`
      : `Còn ${left}/${MEME_QUOTA} lượt`;
    for (const b of this.pop.querySelectorAll('.meme-pick')) b.disabled = out;
  }

  // ------------------------------------------------------------ gửi / nhận

  #fire(id) {
    const seat = this.seatOf();
    if (seat == null || seat < 0 || !MEME_BY_ID[id]) return;

    if (this.left() <= 0) {
      // Lắc nút cho biết là bấm có ăn, chỉ là hết lượt
      this.btn.classList.remove('deny');
      void this.btn.offsetWidth;
      this.btn.classList.add('deny');
      this.#refreshQuota();
      return;
    }

    this.sent.push(Date.now());
    this.#refreshQuota();
    this.close();
    this.show(seat, id);
    this.send(id);
  }

  /**
   * Meme của máy khác. Đếm riêng theo ghế: hạn mức bên gửi nằm ở máy họ, mà
   * máy họ thì mình không kiểm soát được — một bản sửa tay vẫn phát dồn được.
   */
  receive(seat, id) {
    const now = Date.now();
    if (!this.heard.has(seat)) this.heard.set(seat, []);
    const stamps = prune(this.heard.get(seat), now);
    if (stamps.length >= MEME_QUOTA) return;
    stamps.push(now);
    this.show(seat, id);
  }

  // ------------------------------------------------------------ bong bóng

  show(seat, id) {
    const meme = MEME_BY_ID[id];
    const p = this.state?.players?.[seat];
    if (!meme || !p || p.bankrupt || !this.layer) return;

    let b = this.bubbles.get(seat);
    if (!b) {
      const el = document.createElement('div');
      el.className = 'meme-bub';
      el.innerHTML = '<img alt="">';
      this.layer.appendChild(el);
      b = { el, img: el.querySelector('img') };
      this.bubbles.set(seat, b);
    }
    b.img.src = meme.url;
    // Viền theo màu quân — cái duy nhất còn cho biết bong bóng này của ai
    b.el.style.setProperty('--mc', p.token.css);
    b.until = Date.now() + SHOW_MS;
    // Thả cái thứ hai lúc cái đầu còn trên bàn: chạy lại hoạt cảnh nảy lên cho
    // người xem thấy có cái mới, chứ ảnh đổi lặng lẽ thì dễ bỏ sót.
    b.el.classList.remove('pop');
    void b.el.offsetWidth;
    b.el.classList.add('pop');

    audio.sfx('click');
    this.#place(seat, b);
    this.#loop();
  }

  /**
   * Đặt bong bóng lên đúng đầu quân cờ. Gọi mỗi khung hình vì quân có thể đang chạy.
   *
   * Hai quân đứng chung một ô thì hai bong bóng đè nhau — để vậy: cái tới sau
   * nằm trên, đúng như thứ tự thả, và bong bóng nào cũng chỉ sống 3,6 giây.
   */
  #place(seat, b) {
    const pt = this.scene?.tokenScreenPos?.(seat);
    if (!pt) { b.el.style.visibility = 'hidden'; return; }
    b.el.style.visibility = '';

    // Cạnh bong bóng đo theo cạnh bàn cờ: bàn nhỏ lại thì bong bóng nhỏ theo,
    // nếu không nó nuốt mất mấy ô cờ quanh quân.
    const size = Math.round(Math.min(150, Math.max(84, pt.board * 0.15)));
    b.el.style.width = `${size}px`;

    const h = b.el.offsetHeight;
    const half = size / 2;
    const x = Math.min(Math.max(pt.x, half + 8), window.innerWidth - half - 8);
    // Quân đứng sát cạnh trên bàn cờ thì bong bóng lật xuống dưới chân, kèm
    // đổi luôn hướng đuôi — bằng không nó tràn ra ngoài mép màn hình.
    const flip = pt.top - h - 12 < 8;
    b.el.classList.toggle('below', flip);
    b.el.style.left = `${x}px`;
    b.el.style.top = `${flip ? pt.y + 12 : pt.top - 12}px`;
  }

  #loop() {
    if (this.raf) return;
    const tick = () => {
      this.raf = 0;
      const now = Date.now();
      for (const [seat, b] of [...this.bubbles]) {
        if (now >= b.until) { this.#drop(seat, b); continue; }
        this.#place(seat, b);
      }
      if (this.bubbles.size) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Bỏ khỏi danh sách ngay, gỡ khỏi DOM sau khi mờ hẳn. */
  #drop(seat, b) {
    this.bubbles.delete(seat);
    b.el.classList.add('out');
    setTimeout(() => b.el.remove(), FADE_MS + 60);
  }
}
