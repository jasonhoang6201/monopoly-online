/**
 * Phòng online trên máy chủ ván cờ (Cloudflare Durable Object — xem `server/`).
 *
 * Một WebSocket cho mọi thứ: phòng chờ, chat, meme, và ván. Phòng giữ đúng
 * mặt API mà phòng chờ (`ui/lobby.js`) và khung chat (`ui/chat.js`) đã quen —
 * `seats`, `hostId`, `options`, `setReady`, `setToken`, `kick`, `setOptions`,
 * `chat` — nhưng không còn tự quyết gì: mọi thay đổi gửi lên server, server
 * phát lại sổ ghế cho cả phòng.
 *
 * Trong ván, phòng cũng là **chủ ván** của controller (`send` / `onEvents`),
 * cùng mặt với `game/localHost.js` của bản một máy.
 */
import { TOKENS, MAX_PLAYERS } from '../core/state.js';
import { DEFAULT_EVENT_LEVEL } from '../data/events.js';
import { DEFAULT_THEME } from '../data/themes.js';

/** Mã phòng 4 ký tự, bỏ các chữ dễ đọc nhầm (I, O, 0, 1). */
export function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

/**
 * Phần truy vấn của địa chỉ phòng `code`. Giữ `?server=` nếu đang có: người
 * thử bản preview trỏ sang server khác thì người được mời và lần F5 cũng phải
 * nối vào đúng server ấy.
 */
export function roomQuery(code) {
  const q = new URLSearchParams({ room: code });
  const server = new URLSearchParams(window.location.search).get('server');
  if (server) q.set('server', server);
  return `?${q}`;
}

/** Đường mời — dán vào chat là người kia bấm vào vào thẳng phòng. */
export function inviteLink(code) {
  const u = new URL(window.location.href);
  u.search = roomQuery(code);
  u.hash = '';
  return u.toString();
}

/** Mã phòng nằm trong địa chỉ hiện tại, nếu có. */
export function roomFromUrl() {
  const v = new URLSearchParams(window.location.search).get('room');
  return v ? v.toUpperCase().slice(0, 8) : null;
}

/** Địa chỉ máy chủ: biến môi trường lúc build, mặc định là `wrangler dev` trên máy. */
export function serverUrl() {
  const env = import.meta.env ?? {};
  const fromUrl = new URLSearchParams(globalThis.location?.search ?? '').get('server');
  return fromUrl || env.VITE_GAME_SERVER || 'ws://localhost:8787';
}

/** Nối lại sau bấy nhiêu ms, tăng dần tới trần. */
const RETRY = [300, 800, 1500, 3000, 5000];

/**
 * Nhịp ping. Điện thoại đổi mạng hay tắt màn hình thì socket có thể chết mà
 * trình duyệt không báo `close` — máy này tưởng vẫn nối, bấm gì cũng mất. Gửi
 * `ping` mỗi `pingMs` (server trả `pong` mà không phải thức dậy); không nghe
 * thấy gì quá `deadMs` thì bỏ socket ấy, nối cái mới. Bộ kiểm thử hạ hai số
 * này qua `window.__netTiming`.
 */
const beat = () => ({ pingMs: 10000, deadMs: 25000, probeMs: 3000, ...globalThis.__netTiming });

export class GameRoom {
  /**
   * @param {string} code
   * @param {{id:string, name?:string}} me
   * @param {string} secret khoá giữ ghế của máy này — xem `net/identity.js`
   */
  constructor(code, me, secret) {
    this.code = code;
    this.me = me;
    this.secret = secret;
    this.seats = [];
    this.hostId = null;
    this.phase = 'lobby';
    this.options = { events: DEFAULT_EVENT_LEVEL, theme: DEFAULT_THEME };
    this.awayMs = 120000;
    this.on = {
      room: () => {}, kicked: () => {}, full: () => {}, closed: () => {}, denied: () => {},
      start: () => {}, game: () => {}, link: () => {}, chat: () => {}, meme: () => {},
    };
    /** Controller nghe sự kiện ván ở đây — mặt "chủ ván" giống `LocalHost`. */
    this.onEvents = () => {};
    this.ws = null;
    this.left = false;
    this.linkLost = false;
    this.tries = 0;
    /** Lần đầu vào phòng xong chưa — `join` chờ tới lúc này. */
    this.joined = null;
    /** Chênh lệch đồng hồ server − máy này, để đọc mốc hạn chót của server. */
    this.skew = 0;
  }

  get online() { return true; }

  // ------------------------------------------------------------------ tra cứu

  get mySeat() { return this.seats.findIndex((s) => s.id === this.me.id); }
  get isFull() { return this.seats.length >= MAX_PLAYERS; }
  seatOf(id) { return this.seats.findIndex((s) => s.id === id); }
  tokenSeat(index) { return this.seats.findIndex((s) => s.token === index); }
  get isHost() { return this.hostId === this.me.id; }
  get allReady() { return this.seats.length >= 2 && this.seats.every((s) => s.ready); }
  isSeatLive(i) { return !!this.seats[i]?.online; }

  // ------------------------------------------------------------------ kết nối

  /**
   * Vào phòng: nối WebSocket, gửi `hello`, chờ server nhận. Hỏng (phòng đầy,
   * sai khoá, không nối được) thì ném lỗi cho phiên chơi hỏi người chơi.
   */
  join() {
    this.joined = new Promise((resolve, reject) => {
      this.joinOk = resolve;
      this.joinFail = reject;
    });
    this.connect();
    const t = setTimeout(() => this.joinFail?.(new Error('Không nối được máy chủ ván cờ.')), 12000);
    return this.joined.finally(() => clearTimeout(t));
  }

  connect() {
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.left || this.ws) return;
    this.watchNet();
    let ws;
    try {
      ws = new WebSocket(`${serverUrl()}/room/${this.code}`);
    } catch (err) {
      // Địa chỉ server hỏng thì ném ngay ở đây; không bắt thì chuỗi nối lại đứt luôn
      console.error('không mở được WebSocket', err);
      this.lost(null, 1006);
      return;
    }
    this.ws = ws;
    this.heard = Date.now();
    ws.onopen = () => {
      this.tries = 0;
      this.heard = Date.now();
      ws.send(JSON.stringify({ t: 'hello', id: this.me.id, secret: this.secret }));
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      this.heard = Date.now();
      if (e.data === 'pong') return;
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      this.receive(m);
    };
    ws.onclose = (e) => this.lost(ws, e.code);
  }

  /**
   * Socket `ws` đã đóng hoặc bị bỏ vì im lặng: báo mất kết nối, hẹn nối lại.
   * `ws` không còn là socket hiện tại thì thôi — socket mới đã thay chỗ nó.
   */
  lost(ws, code) {
    if (ws && this.ws !== ws) return;
    this.ws = null;
    if (ws) { ws.onclose = null; ws.onmessage = null; }
    if (this.left) return;
    // Bị mời ra, phòng đầy, sai khoá: đừng nối lại
    if (code >= 4000 && code < 4100) return;
    this.setLink('lost');
    if (this.retryTimer) return;
    const ms = RETRY[Math.min(this.tries++, RETRY.length - 1)];
    this.retryTimer = setTimeout(() => this.connect(), ms);
  }

  /** Bỏ socket đang im lặng: đóng nó (không chờ bắt tay đóng) rồi nối cái mới. */
  dropSilent(ws) {
    if (this.ws !== ws) return;
    try { ws.close(); } catch { /* đã đóng */ }
    this.lost(ws, 1006);
  }

  /**
   * Nhịp ping, cài một lần cho cả phòng. Mạng vừa có lại hay tab vừa hiện lên
   * thì dò ngay: socket còn sống thì `pong` về trong `probeMs`, không thì bỏ
   * nó luôn thay vì chờ hết `deadMs`. Đang chờ nối lại thì nối ngay.
   */
  watchNet() {
    if (this.beat) return;
    const tick = () => {
      const ws = this.ws;
      if (!ws || this.left) return;
      // Kể cả socket kẹt ở bước bắt tay (readyState 0): im quá hạn là bỏ
      if (Date.now() - this.heard > beat().deadMs) { this.dropSilent(ws); return; }
      if (ws.readyState !== 1) return;
      try { ws.send('ping'); } catch { /* socket vừa đóng, onclose lo */ }
    };
    const probe = () => {
      if (this.left) return;
      const ws = this.ws;
      if (!ws) { if (this.retryTimer) this.connect(); return; }
      if (ws.readyState !== 1) return;
      const at = Date.now();
      try { ws.send('ping'); } catch { /* onclose lo */ }
      setTimeout(() => { if (this.ws === ws && this.heard < at) this.dropSilent(ws); }, beat().probeMs);
    };
    this.beat = setInterval(tick, beat().pingMs);
    this.onNet = probe;
    this.onVis = () => { if (document.visibilityState === 'visible') probe(); };
    globalThis.addEventListener?.('online', this.onNet);
    globalThis.document?.addEventListener('visibilitychange', this.onVis);
  }

  setLink(status) {
    const lost = status === 'lost';
    if (this.linkLost === lost) return;
    this.linkLost = lost;
    this.on.link(status);
  }

  receive(m) {
    switch (m.t) {
      case 'welcome':
        this.skew = (m.now ?? Date.now()) - Date.now();
        // Sổ ghế (`room`) tới sau tin này, mà `join()` xong là phiên chơi hỏi `phase` ngay
        if (m.phase) this.phase = m.phase;
        this.setLink('ok');
        this.joinOk?.();
        this.joinOk = null;
        return;
      case 'room':
        this.seats = m.seats ?? [];
        this.hostId = m.hostId;
        this.options = m.options ?? this.options;
        this.awayMs = m.awayMs ?? this.awayMs;
        this.phase = m.phase;
        this.on.room(this);
        return;
      case 'full':
        this.joinFail?.(Object.assign(new Error('Phòng đã đầy hoặc ván đã bắt đầu.'), { full: true }));
        this.on.full();
        return;
      case 'denied':
        this.joinFail?.(new Error('Ghế này đang thuộc về một máy khác.'));
        this.on.denied();
        return;
      case 'kicked':
        this.left = true;
        this.on.kicked();
        return;
      case 'start':
        this.phase = 'playing';
        this.on.start(m);
        return;
      case 'game':
        this.on.game(m);
        return;
      case 'events':
        this.onEvents(m.events);
        return;
      case 'chat':
        this.on.chat(m);
        return;
      case 'meme':
        this.on.meme(m);
        return;
      default:
    }
  }

  /** Gửi một tin thô lên server. */
  post(m) {
    if (this.ws?.readyState !== 1) return false;
    this.ws.send(JSON.stringify(m));
    return true;
  }

  // ------------------------------------------------------------------ phòng chờ

  setReady(name, ready) { this.post({ t: 'ready', name, ready }); }

  /** Đổi màu quân. Màu đã có người giữ thì từ chối ngay tại đây. */
  setToken(index) {
    if (this.phase !== 'lobby') return false;
    const mine = this.mySeat;
    if (mine < 0 || this.seats[mine].ready) return false;
    if (!Number.isInteger(index) || index < 0 || index >= TOKENS.length) return false;
    const held = this.tokenSeat(index);
    if (held >= 0 && held !== mine) return false;
    return this.post({ t: 'pick', token: index });
  }

  kick(id) {
    if (this.phase !== 'lobby' || !this.isHost || id === this.me.id) return false;
    return this.post({ t: 'kick', id });
  }

  setOptions(patch) {
    if (this.phase !== 'lobby' || !this.isHost) return false;
    return this.post({ t: 'options', patch });
  }

  startGame() { return this.post({ t: 'start' }); }

  /** Tin nhắn chat. Server gắn id người nói, tên lấy từ sổ ghế ở máy nhận. */
  chat(text) { return this.post({ t: 'chat', text }); }

  emit(name, data) {
    if (name === 'meme') this.post({ t: 'meme', id: data?.id });
  }

  // ------------------------------------------------------------------ chủ ván

  /** Action cho engine — server tự gắn số ghế của máy này. Cùng tên với `LocalHost.send`. */
  send(a) { return this.post({ t: 'act', a }); }

  async leave() {
    if (this.left) return;
    if (this.phase === 'lobby') this.post({ t: 'leave' });
    this.left = true;
    clearInterval(this.beat);
    clearTimeout(this.retryTimer);
    globalThis.removeEventListener?.('online', this.onNet);
    globalThis.document?.removeEventListener('visibilitychange', this.onVis);
    try { this.ws?.close(1000, 'rời phòng'); } catch { /* đã đóng */ }
    this.ws = null;
  }
}
