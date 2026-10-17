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

/** Địa chỉ máy chủ: biến môi trường lúc build, mặc định là `wrangler dev` trên máy. */
export function serverUrl() {
  const env = import.meta.env ?? {};
  const fromUrl = new URLSearchParams(globalThis.location?.search ?? '').get('server');
  return fromUrl || env.VITE_GAME_SERVER || 'ws://localhost:8787';
}

/** Nối lại sau bấy nhiêu ms, tăng dần tới trần. */
const RETRY = [300, 800, 1500, 3000, 5000];

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
    if (this.left) return;
    const ws = new WebSocket(`${serverUrl()}/room/${this.code}`);
    this.ws = ws;
    ws.onopen = () => {
      this.tries = 0;
      ws.send(JSON.stringify({ t: 'hello', id: this.me.id, secret: this.secret }));
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      this.receive(m);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.left) return;
      // Bị mời ra, phòng đầy, sai khoá: đừng nối lại
      if (e.code >= 4000 && e.code < 4100) return;
      this.setLink('lost');
      const ms = RETRY[Math.min(this.tries++, RETRY.length - 1)];
      setTimeout(() => this.connect(), ms);
    };
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

  send(m) {
    if (this.ws?.readyState !== 1) return false;
    this.ws.send(JSON.stringify(m));
    return true;
  }

  // ------------------------------------------------------------------ phòng chờ

  setReady(name, ready) { this.send({ t: 'ready', name, ready }); }

  /** Đổi màu quân. Màu đã có người giữ thì từ chối ngay tại đây. */
  setToken(index) {
    if (this.phase !== 'lobby') return false;
    const mine = this.mySeat;
    if (mine < 0 || this.seats[mine].ready) return false;
    if (!Number.isInteger(index) || index < 0 || index >= TOKENS.length) return false;
    const held = this.tokenSeat(index);
    if (held >= 0 && held !== mine) return false;
    return this.send({ t: 'pick', token: index });
  }

  kick(id) {
    if (this.phase !== 'lobby' || !this.isHost || id === this.me.id) return false;
    return this.send({ t: 'kick', id });
  }

  setOptions(patch) {
    if (this.phase !== 'lobby' || !this.isHost) return false;
    return this.send({ t: 'options', patch });
  }

  startGame() { return this.send({ t: 'start' }); }

  /** Tin nhắn chat. Server gắn id người nói, tên lấy từ sổ ghế ở máy nhận. */
  chat(text) { return this.send({ t: 'chat', text }); }

  emit(name, data) {
    if (name === 'meme') this.send({ t: 'meme', id: data?.id });
  }

  // ------------------------------------------------------------------ chủ ván

  /** Action cho engine — server tự gắn số ghế của máy này. */
  sendAction(a) { return this.send({ t: 'act', a }); }

  async leave() {
    if (this.left) return;
    if (this.phase === 'lobby') this.send({ t: 'leave' });
    this.left = true;
    try { this.ws?.close(1000, 'rời phòng'); } catch { /* đã đóng */ }
    this.ws = null;
  }
}
