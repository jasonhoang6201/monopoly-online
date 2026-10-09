/**
 * Ám quẻ — trò nghịch của hồn ma (người đã phá sản) lên quân người còn sống.
 *
 * **Chỉ là hình**: một chiếc mũ hề, một đám mây đen mưa lắc rắc, một con ốc
 * sên bò theo quân trong vài giây. Không đụng tiền, đất, lượt hay kỹ năng của
 * ai — nên không cần qua máy cầm lái, cũng không vào ảnh chụp. Phá sản rồi
 * vẫn còn việc để làm thay vì ngồi nhìn.
 *
 * Mỗi hồn ma mỗi `HEX_COOLDOWN_MS` một lần, bên nhận cũng đếm lại như meme:
 * một bản sửa tay phát dồn thì máy nhận vẫn bỏ qua.
 */
import { audio } from '../audio/audio.js';

export const HEXES = [
  { id: 'clown', icon: '🤡', label: 'Đội mũ hề' },
  { id: 'cloud', icon: '🌧️', label: 'Mây đen trên đầu' },
  { id: 'snail', icon: '🐌', label: 'Ốc sên bám đuôi' },
  { id: 'poop', icon: '💩', label: 'Xui tận mạng' },
];
const HEX_BY_ID = Object.fromEntries(HEXES.map((h) => [h.id, h]));

export const HEX_COOLDOWN_MS = 25000;
const SHOW_MS = 12000;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class HexDeck {
  /**
   * @param {object} scene BoardScene — chỉ dùng `tokenScreenPos()`
   * @param {object} o
   * @param {() => number} o.ghostSeat ghế hồn ma đang ngồi máy này, -1 là không có
   * @param {(target:number, kind:string, by:number) => void} o.send phát cho máy khác
   */
  constructor(scene, { ghostSeat, send }) {
    this.scene = scene;
    this.ghostSeat = ghostSeat;
    this.send = send;
    this.state = null;
    this.lastSent = 0;
    /** Ghế hồn ma → lần nhận gần nhất của họ. */
    this.heard = new Map();
    /** Ghế bị ám → phần tử đang bám theo quân. */
    this.marks = new Map();
    this.raf = 0;
    this.pick = HEXES[0].id;
    this.#build();
  }

  setState(state) {
    this.state = state;
    this.refresh();
  }

  /** Nút 👻 chỉ hiện khi máy này đang có hồn ma ngồi. */
  refresh() {
    if (!this.btn) return;
    const on = !!this.state && !this.state.over && this.ghostSeat() >= 0;
    this.btn.hidden = !on;
    if (!on) this.close();
  }

  #build() {
    const meme = document.getElementById('meme-btn');
    this.layer = document.getElementById('meme-layer');
    if (!meme || !this.layer) return;
    this.btn = document.createElement('button');
    this.btn.className = 'icon-btn';
    this.btn.id = 'hex-btn';
    this.btn.type = 'button';
    this.btn.hidden = true;
    this.btn.textContent = '👻';
    this.btn.title = 'Ám quẻ người còn sống (chỉ là hình, không đổi ván)';
    this.btn.setAttribute('aria-label', 'Ám quẻ người còn sống');
    meme.after(this.btn);

    this.pop = document.createElement('div');
    this.pop.id = 'hex-pop';
    this.pop.hidden = true;
    meme.parentElement.appendChild(this.pop);

    this.btn.addEventListener('click', (e) => { e.stopPropagation(); if (this.pop.hidden) this.open(); else this.close(); });
    this.pop.addEventListener('click', (e) => {
      e.stopPropagation();
      const h = e.target.closest('[data-hex]');
      if (h) { this.pick = h.dataset.hex; this.#paint(); return; }
      const t = e.target.closest('[data-seat]');
      if (t && !t.disabled) this.#fire(Number(t.dataset.seat));
    });
    document.addEventListener('click', () => this.close());
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
  }

  open() {
    if (!this.state) return;
    this.pop.hidden = false;
    this.#paint();
    clearInterval(this.tick);
    this.tick = setInterval(() => this.#paint(), 500);
  }

  close() {
    if (!this.pop || this.pop.hidden) return;
    this.pop.hidden = true;
    clearInterval(this.tick);
  }

  #wait() { return Math.max(0, HEX_COOLDOWN_MS - (Date.now() - this.lastSent)); }

  #paint() {
    const st = this.state;
    const wait = this.#wait();
    const alive = st.players.filter((p) => !p.bankrupt);
    this.pop.innerHTML = `
      <div class="hex-head">Ám quẻ ai?</div>
      <div class="hex-kinds">${HEXES.map((h) => `
        <button type="button" class="hex-kind${h.id === this.pick ? ' on' : ''}" data-hex="${h.id}"
                title="${h.label}" aria-label="${h.label}" aria-pressed="${h.id === this.pick}">${h.icon}</button>`).join('')}
      </div>
      <div class="hex-targets">${alive.map((p) => `
        <button type="button" class="hex-target" data-seat="${p.id}" style="--pc:${p.token.css}"
                ${wait ? 'disabled' : ''}>${esc(p.name)}</button>`).join('')}
      </div>
      <div class="hex-note">${wait ? `Chờ ${Math.ceil(wait / 1000)} giây nữa` : 'Chỉ là hình — không ai mất đồng nào'}</div>`;
  }

  #fire(target) {
    const by = this.ghostSeat();
    if (by < 0 || this.#wait() > 0) return;
    this.lastSent = Date.now();
    this.close();
    this.show(target, this.pick);
    this.send(target, this.pick, by);
  }

  /** Quẻ từ máy khác: hồn ma ấy phải đã phá sản thật, và không dồn quá nhịp. */
  receive(by, target, kind) {
    const p = this.state?.players?.[by];
    if (!p?.bankrupt) return;
    const now = Date.now();
    if (now - (this.heard.get(by) ?? 0) < HEX_COOLDOWN_MS - 2000) return;
    this.heard.set(by, now);
    this.show(target, kind);
  }

  show(seat, kind) {
    const hex = HEX_BY_ID[kind];
    const p = this.state?.players?.[seat];
    if (!hex || !p || p.bankrupt || !this.layer) return;
    let m = this.marks.get(seat);
    if (!m) {
      const el = document.createElement('div');
      el.className = 'hex-mark';
      this.layer.appendChild(el);
      m = { el };
      this.marks.set(seat, m);
    }
    m.el.dataset.kind = kind;
    m.el.textContent = hex.icon;
    m.until = Date.now() + SHOW_MS;
    m.el.classList.remove('pop');
    void m.el.offsetWidth;
    m.el.classList.add('pop');
    audio.sfx('card');
    this.#loop();
  }

  #loop() {
    if (this.raf) return;
    const tick = () => {
      this.raf = 0;
      const now = Date.now();
      for (const [seat, m] of [...this.marks]) {
        const pt = this.scene?.tokenScreenPos?.(seat);
        if (now >= m.until || !pt || this.state?.players[seat]?.bankrupt) {
          this.marks.delete(seat);
          m.el.classList.add('out');
          setTimeout(() => m.el.remove(), 300);
          continue;
        }
        const size = Math.round(Math.min(64, Math.max(30, pt.board * 0.06)));
        m.el.style.fontSize = `${size}px`;
        m.el.style.left = `${pt.x}px`;
        m.el.style.top = `${pt.top}px`;
      }
      if (this.marks.size) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  clear() {
    for (const m of this.marks.values()) m.el.remove();
    this.marks.clear();
  }
}
