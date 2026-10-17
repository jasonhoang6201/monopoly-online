/**
 * Máy chủ ván cờ trên Cloudflare: Worker nhận kết nối, mỗi phòng một Durable
 * Object (`GameRoom`) giữ phòng chờ và ván.
 *
 * Luật chạy ở đây, trong engine (`src/engine/engine.js`) — chính bộ luật bản
 * một máy chạy trong trình duyệt. Máy khách chỉ gửi ý định (`act`) và diễn
 * lại dãy sự kiện server gửi về. Không còn máy cầm lái, trọng tài hay nhịp
 * tim: Durable Object xử lý từng tin một theo thứ tự nên hai người bấm cùng
 * lúc không đè nhau, và `alarm` lo mọi hạn chờ (đồng hồ lượt, người vắng mặt).
 *
 * Bền qua ngủ đông: phòng ghi `meta` (sổ ghế, luật tuỳ chọn) và `doc` của
 * engine (ảnh chụp mốc yên + log action) sau mỗi tin. WebSocket dùng
 * Hibernation API, nên lúc cả phòng ngồi im, object được ngủ mà không tính
 * thời gian chạy; thức dậy thì dựng lại engine từ `doc`.
 */
import { DurableObject } from 'cloudflare:workers';
import { Engine } from '../../src/engine/engine.js';
import { snapshot } from '../../src/core/serialize.js';
import { TOKENS, MAX_PLAYERS } from '../../src/core/state.js';
import { DEFAULT_EVENT_LEVEL, EVENT_LEVELS } from '../../src/data/events.js';
import { DEFAULT_THEME, themeKey } from '../../src/data/themes.js';
import { Analytics } from '../../src/net/analytics.js';

/** Mã phòng: 4 ký tự in hoa / số, không lẫn 0-O, 1-I. */
const CODE = /^[A-HJ-NP-Z2-9]{4}$/;

/** Mất kết nối bao lâu thì bị gạch khỏi ván, tài sản về ngân hàng. */
const AWAY_MS = 120000;
/** Phòng chờ: rời bao lâu thì bỏ ghế. Đủ cho một lần bấm F5. */
const LOBBY_GRACE_MS = 8000;
/**
 * Socket không gửi gì (kể cả `ping`) quá bấy lâu thì coi là chết: máy khách
 * ping mỗi 10 giây, điện thoại đổi mạng hay tắt màn hình thì socket chết lặng,
 * không có `close` nào về. Không tự soát thì ghế ấy "có mặt" mãi — không bị
 * rút hạn lượt, không bao giờ bị gạch tên.
 */
const SILENT_MS = 30000;
/** Một tin nhắn chat dài nhất. */
const CHAT_MAX = 240;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9]{4})$/);
    if (m) {
      const code = m[1].toUpperCase();
      if (!CODE.test(code)) return new Response('mã phòng không hợp lệ', { status: 400 });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('cần WebSocket', { status: 426 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(new Request(`https://room/${code}`, request));
    }
    if (url.pathname === '/health') return new Response('ok');
    return new Response('không có gì ở đây', { status: 404 });
  },
};

/** Tên người chơi: bỏ ký tự HTML (tên đi thẳng vào dòng thông báo), tối đa 14 ký tự. */
const cleanName = (s) => String(s ?? '').replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    /** @type {?{code:string, hostId:?string, phase:string, options:object, seats:Array, away:Object, reap:Object}} */
    this.meta = null;
    /** @type {?Engine} */
    this.engine = null;
    this.analytics = null;
    /* Trình duyệt tự gửi "ping" giữ kết nối; trả lời mà không đánh thức object. */
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(() => this.load());
  }

  /* ================================================================
     Lưu và nạp
     ================================================================ */

  async load() {
    this.meta = (await this.ctx.storage.get('meta')) ?? null;
    const doc = await this.ctx.storage.get('doc');
    if (doc && this.meta?.phase === 'playing') {
      try {
        this.engine = Engine.restore(doc, { onTelemetry: (ev) => this.analytics?.push(ev) });
        this.armAnalytics();
      } catch (err) {
        console.error('dựng lại ván hỏng', err);
        this.engine = null;
      }
    }
  }

  async save() {
    await this.ctx.storage.put('meta', this.meta);
    if (this.engine) await this.ctx.storage.put('doc', this.engine.doc);
  }

  /** Phòng mới tinh: sổ ghế rỗng, người đầu tiên vào là chủ phòng. */
  fresh(code) {
    return {
      code,
      hostId: null,
      phase: 'lobby',
      options: { events: DEFAULT_EVENT_LEVEL, theme: DEFAULT_THEME },
      seats: [],
      /** id → mốc vắng mặt (ván đang chạy) */
      away: {},
      /** id → mốc bỏ ghế (phòng chờ) */
      reap: {},
    };
  }

  /* ================================================================
     Kết nối
     ================================================================ */

  async fetch(request) {
    const code = new URL(request.url).pathname.slice(1);
    if (!this.meta) this.meta = this.fresh(code);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: null, at: Date.now() });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return; }
    if (!m || typeof m !== 'object') return;
    const who = ws.deserializeAttachment() ?? {};
    // Mốc nghe thấy gần nhất cho việc soát socket im lặng; `ping` thì server tự trả, không tới đây
    ws.serializeAttachment({ ...who, at: Date.now() });
    if (m.t === 'hello') { await this.hello(ws, m); return; }
    if (!who.id) return;
    const seat = this.meta.seats.findIndex((s) => s.id === who.id);
    if (seat < 0) return;
    switch (m.t) {
      case 'ready': this.onReady(seat, m); break;
      case 'pick': this.onPick(seat, m); break;
      case 'kick': this.onKick(who.id, m); break;
      case 'options': this.onOptions(who.id, m); break;
      case 'start': this.onStart(who.id); break;
      case 'leave': this.onLeave(ws, who.id); break;
      case 'chat': this.onChat(who.id, m); return;
      case 'meme': this.broadcast({ t: 'meme', seat, id: String(m.id ?? '').slice(0, 40) }); return;
      case 'act': this.onAct(seat, m.a); break;
      case 'test': if (this.env.TEST_TIMING === '1') this.onTest(m); break;
      default: return;
    }
    await this.save();
    await this.arm();
  }

  /**
   * Máy khách gửi khung đóng. Với Hibernation API, server phải tự đóng lại để
   * xong bắt tay; không thì socket bên kia kẹt ở CLOSING, trình duyệt chưa báo
   * `close`, máy ấy không biết mình đã mất kết nối để nối lại.
   */
  async webSocketClose(ws, code, reason) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, reason); } catch { /* đã đóng */ }
    await this.dropped(ws);
  }
  async webSocketError(ws) { await this.dropped(ws); }

  /** Socket đóng: nếu người ấy không còn socket nào khác thì tính là vắng. */
  async dropped(ws) {
    const { id } = ws.deserializeAttachment() ?? {};
    if (!id || !this.meta) return;
    if (this.socketsOf(id, ws).length) return;
    const seat = this.meta.seats.findIndex((s) => s.id === id);
    if (seat < 0) return;
    const now = Date.now();
    /* Một socket có thể báo rớt hai lần: server tự đóng vì im lặng, rồi
       `webSocketClose` về muộn. Lần sau không được dời mốc vắng mặt về sau. */
    if (this.meta.phase === 'lobby') this.meta.reap[id] ??= now + LOBBY_GRACE_MS;
    else {
      if (this.meta.away[id] != null) return;
      this.meta.away[id] = now;
      this.act({ type: 'presence', seat, value: false });
    }
    this.publishRoom();
    await this.save();
    await this.arm();
  }

  socketsOf(id, except = null) {
    return this.ctx.getWebSockets().filter((w) => w !== except && w.deserializeAttachment()?.id === id
      && w.readyState === 1);
  }

  /**
   * Tin đầu tiên của mỗi kết nối. `secret` chứng minh đây đúng là người giữ
   * ghế: lần đầu vào phòng thì ghi lại băm của nó; vào lại thì phải khớp —
   * biết `id` của người khác (lộ qua sổ ghế) chưa đủ để ngồi vào ghế họ.
   */
  async hello(ws, m) {
    const id = String(m.id ?? '').slice(0, 64);
    const secret = String(m.secret ?? '');
    if (!id || secret.length < 8) { ws.close(4000, 'thiếu danh tính'); return; }
    const hash = await sha256(secret);
    const meta = this.meta;
    let seat = meta.seats.findIndex((s) => s.id === id);
    if (seat >= 0 && meta.seats[seat].hash !== hash) { this.send(ws, { t: 'denied' }); ws.close(4001, 'sai khoá'); return; }
    if (seat < 0) {
      if (meta.phase !== 'lobby' || meta.seats.length >= MAX_PLAYERS) {
        this.send(ws, { t: 'full' });
        ws.close(4002, 'phòng đầy');
        return;
      }
      meta.seats.push({ id, hash, name: `Người chơi ${meta.seats.length + 1}`, token: this.freeToken(), ready: false });
      seat = meta.seats.length - 1;
      meta.hostId ??= id;
    }
    ws.serializeAttachment({ id, at: Date.now() });
    delete meta.reap[id];
    if (meta.phase === 'playing' && meta.away[id] != null) {
      delete meta.away[id];
      this.act({ type: 'presence', seat, value: true });
    }
    // `phase` đi kèm: máy vào lại quyết định vào thẳng ván hay ngồi phòng chờ ngay lúc nhận tin này
    this.send(ws, { t: 'welcome', id, seat, now: Date.now(), phase: meta.phase });
    if (meta.phase === 'playing' && this.engine) this.send(ws, this.gameView());
    this.publishRoom();
    await this.save();
    await this.arm();
  }

  /* ================================================================
     Phòng chờ
     ================================================================ */

  freeToken() {
    const taken = new Set(this.meta.seats.map((s) => s.token));
    for (let i = 0; i < TOKENS.length; i++) if (!taken.has(i)) return i;
    return 0;
  }

  /** Bấm Sẵn sàng / Sửa lại, kèm tên đã gõ xong. */
  onReady(seat, m) {
    if (this.meta.phase !== 'lobby') return;
    const s = this.meta.seats[seat];
    const name = cleanName(m.name);
    s.ready = !!m.ready;
    if (name) s.name = name;
    this.publishRoom();
  }

  /** Đổi màu quân; màu đã có người giữ thì bỏ qua. Đã sẵn sàng thì màu đã chốt. */
  onPick(seat, m) {
    if (this.meta.phase !== 'lobby') return;
    const s = this.meta.seats[seat];
    const i = Number(m.token);
    if (s.ready || !Number.isInteger(i) || i < 0 || i >= TOKENS.length) return;
    if (this.meta.seats.some((x, k) => k !== seat && x.token === i)) return;
    s.token = i;
    this.publishRoom();
  }

  onKick(by, m) {
    const meta = this.meta;
    if (meta.phase !== 'lobby' || by !== meta.hostId || m.id === by) return;
    const i = meta.seats.findIndex((s) => s.id === m.id);
    if (i < 0) return;
    meta.seats.splice(i, 1);
    for (const w of this.socketsOf(m.id)) {
      this.send(w, { t: 'kicked' });
      w.close(4003, 'bị mời ra');
    }
    this.publishRoom();
  }

  onOptions(by, m) {
    const meta = this.meta;
    if (meta.phase !== 'lobby' || by !== meta.hostId || !m.patch || typeof m.patch !== 'object') return;
    const o = { ...meta.options };
    if (EVENT_LEVELS[m.patch.events]) o.events = m.patch.events;
    if (typeof m.patch.theme === 'string') o.theme = themeKey(m.patch.theme);
    // Bộ kiểm thử hạ các hạn chờ xuống vài giây — chỉ khi máy chủ bật cờ thử nghiệm
    if (this.env.TEST_TIMING === '1' && m.patch.timing && typeof m.patch.timing === 'object') {
      o.timing = Object.fromEntries(Object.entries(m.patch.timing)
        .filter(([, v]) => Number.isFinite(v) && v >= 0).map(([k, v]) => [k, Number(v)]));
    }
    meta.options = o;
    this.publishRoom();
  }

  /** Rời phòng chờ hẳn (bấm Rời phòng): bỏ ghế ngay, không chờ hạn ân. */
  onLeave(ws, id) {
    const meta = this.meta;
    if (meta.phase !== 'lobby') return;
    meta.seats = meta.seats.filter((s) => s.id !== id);
    ws.close(1000, 'rời phòng');
    this.fixHost();
    this.publishRoom();
  }

  /** Chủ phòng rời phòng chờ thì người ngồi ghế đầu nhận vai. */
  fixHost() {
    const meta = this.meta;
    if (!meta.seats.some((s) => s.id === meta.hostId)) meta.hostId = meta.seats[0]?.id ?? null;
  }

  onChat(id, m) {
    const text = String(m.text ?? '').trim().slice(0, CHAT_MAX);
    if (!text) return;
    this.broadcast({ t: 'chat', id, text });
  }

  /* ================================================================
     Ván
     ================================================================ */

  onStart(by) {
    const meta = this.meta;
    if (meta.phase !== 'lobby' || by !== meta.hostId) return;
    if (meta.seats.length < 2 || !meta.seats.every((s) => s.ready)) return;
    const settings = { ...meta.options, clock: true };
    const { engine, events } = Engine.create({
      names: meta.seats.map((s) => s.name),
      tokens: meta.seats.map((s) => s.token),
      settings,
      t: Date.now(),
    }, { onTelemetry: (ev) => this.analytics?.push(ev) });
    this.engine = engine;
    meta.phase = 'playing';
    // Ai đang rớt lúc khai cuộc thì engine biết ngay để không chờ họ cả phút
    for (const [seat, s] of meta.seats.entries()) {
      if (!this.socketsOf(s.id).length) {
        meta.away[s.id] = Date.now();
        engine.dispatch({ type: 'presence', seat, value: false, t: Date.now() });
      }
    }
    this.armAnalytics();
    this.analytics?.gameStart(engine.st, 'online');
    this.publishRoom();
    // `gameView` mang sẵn `t: 'game'`, nên `t: 'start'` phải đứng sau mới không bị ghi đè
    this.broadcast({ ...this.gameView(), t: 'start', events });
  }

  /** Trạng thái ván cho người vừa vào: ảnh chụp, câu hỏi đang treo, giờ server. */
  gameView() {
    const e = this.engine;
    const p = e.pending;
    return {
      t: 'game',
      snap: snapshot(e.st),
      pending: p ? { ...p, type: 'ask', ms: p.deadline ? Math.max(0, p.deadline - Date.now()) : 0 } : null,
    };
  }

  /**
   * Action từ máy khách. Ghế lấy từ kết nối, không lấy từ tin: máy nào cũng
   * chỉ nói thay được cho chính mình.
   */
  onAct(seat, a) {
    if (!this.engine || !a || typeof a !== 'object') return;
    const allowed = ['answer', 'hold', 'seen', 'learn', 'ghost-vote'];
    if (!allowed.includes(a.type)) return;
    this.act({ type: a.type, id: Number(a.id), value: a.value, seat });
  }

  /**
   * Chỉ cho bộ kiểm thử (máy chủ bật `TEST_TIMING=1`): thay ván bằng ảnh chụp
   * (`snap`), hoặc chạy thẳng một hàm luật (`inject: {path, args}`) như
   * `LocalHost` của bản một máy. Tham số `{$seat: n}` đổi thành người ở ghế n.
   * `timing` đổi hạn chờ của ván đang chạy.
   */
  onTest(m) {
    const e = this.engine;
    if (!e) return;
    const seatOf = (a) => (a && typeof a === 'object' && Number.isInteger(a.$seat) ? e.st.players[a.$seat] : a);
    let events = [];
    // Đổi hạn chờ giữa ván: phần của phòng (vắng mặt) và phần của engine (lượt đi)
    if (m.timing && typeof m.timing === 'object') {
      const t = Object.fromEntries(Object.entries(m.timing).filter(([, v]) => Number.isFinite(v) && v >= 0));
      this.meta.options = { ...this.meta.options, timing: { ...this.meta.options.timing, ...t } };
      e.st.settings.timing = { ...e.st.settings.timing, ...t };
    }
    try {
      if (m.snap) events = e.force(m.snap);
      if (m.inject?.path) events = [...events, ...e.inject(String(m.inject.path), (m.inject.args ?? []).map(seatOf))];
    } catch (err) {
      console.error('test hook hỏng', err);
      return;
    }
    if (events.length) this.broadcast({ t: 'events', events });
  }

  /** Đưa một action vào engine và phát sự kiện cho cả phòng. */
  act(a) {
    if (!this.engine) return;
    let events;
    try {
      events = this.engine.dispatch({ ...a, t: Date.now() });
    } catch (err) {
      console.error('engine hỏng', a.type, err);
      return;
    }
    if (!events.length) return;
    this.broadcast({ t: 'events', events });
    for (const ev of events) {
      if (ev.type === 'turn') this.analytics?.flush();
      if (ev.type === 'gameover') {
        const st = this.engine.st;
        this.analytics?.gameEnd(st, { player: st.players[ev.seat], by: ev.by });
      }
    }
  }

  /* ================================================================
     Hẹn giờ
     ================================================================ */

  /** Đặt `alarm` vào mốc sớm nhất trong: hạn câu hỏi đang treo, hạn người vắng, hạn bỏ ghế. */
  async arm() {
    const meta = this.meta;
    const times = [];
    const dl = this.engine?.pending?.deadline;
    if (dl && !this.engine.st.over) times.push(dl);
    for (const t of Object.values(meta.away)) times.push(t + this.awayMs());
    for (const t of Object.values(meta.reap)) times.push(t);
    // Còn socket mở thì hẹn lần soát socket im lặng kế tiếp
    if (this.ctx.getWebSockets().some((w) => w.readyState === 1)) times.push(Date.now() + this.silentMs() / 2);
    if (!times.length) { await this.ctx.storage.deleteAlarm(); return; }
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 50, Math.min(...times)));
  }

  awayMs() { return this.meta.options.timing?.awayMs ?? AWAY_MS; }

  silentMs() { return this.meta.options.timing?.silentMs ?? SILENT_MS; }

  /** Đóng các socket im lặng quá hạn rồi tính người ấy như vừa rớt mạng. */
  async reapSilent(now) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== 1) continue;
      const pinged = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
      const at = ws.deserializeAttachment()?.at ?? 0;
      if (now - Math.max(pinged, at) <= this.silentMs()) continue;
      try { ws.close(1001, 'im lặng quá lâu'); } catch { /* đã đóng */ }
      // Máy bên kia đã chết thì không có bắt tay đóng nào về để gọi webSocketClose
      await this.dropped(ws);
    }
  }

  async alarm() {
    const meta = this.meta;
    if (!meta) return;
    const now = Date.now();
    await this.reapSilent(now);
    for (const [id, t] of Object.entries(meta.reap)) {
      if (t > now) continue;
      delete meta.reap[id];
      if (meta.phase === 'lobby' && !this.socketsOf(id).length) meta.seats = meta.seats.filter((s) => s.id !== id);
    }
    this.fixHost();
    if (this.engine && meta.phase === 'playing') {
      for (const [id, t] of Object.entries(meta.away)) {
        if (t + this.awayMs() > now) continue;
        delete meta.away[id];
        const seat = meta.seats.findIndex((s) => s.id === id);
        if (seat >= 0) this.act({ type: 'evict', seat });
      }
      const p = this.engine.pending;
      if (p?.deadline && p.deadline <= now) this.act({ type: 'timeout', id: p.id });
    }
    this.publishRoom();
    await this.save();
    await this.arm();
  }

  /* ================================================================
     Gửi tin
     ================================================================ */

  roomView() {
    const meta = this.meta;
    return {
      t: 'room',
      code: meta.code,
      hostId: meta.hostId,
      phase: meta.phase,
      options: meta.options,
      seats: meta.seats.map((s) => ({
        id: s.id, name: s.name, token: s.token, ready: s.ready,
        online: this.socketsOf(s.id).length > 0,
        awayAt: meta.away[s.id] ?? null,
      })),
      awayMs: this.awayMs(),
    };
  }

  publishRoom() { this.broadcast(this.roomView()); }

  send(ws, m) {
    try { ws.send(JSON.stringify(m)); } catch { /* socket vừa đóng */ }
  }

  broadcast(m) {
    const s = JSON.stringify(m);
    for (const ws of this.ctx.getWebSockets()) {
      if (!ws.deserializeAttachment()?.id) continue;
      try { ws.send(s); } catch { /* socket vừa đóng */ }
    }
  }

  /* ================================================================
     Số liệu cân bằng
     ================================================================ */

  /**
   * Gửi số liệu kỹ năng về Supabase bằng anon key, cùng đường REST như trình
   * duyệt. Thiếu khoá thì tắt. Hàng đợi chỉ nằm trong bộ nhớ: mất vài dòng
   * khi object ngủ giữa chừng không đáng để ghi thêm vào storage.
   */
  armAnalytics() {
    if (this.analytics || !this.env.SUPABASE_URL || !this.env.SUPABASE_ANON_KEY) return;
    const mem = new Map();
    this.analytics = new Analytics(null, {
      url: this.env.SUPABASE_URL,
      key: this.env.SUPABASE_ANON_KEY,
      storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) },
      location: { hostname: 'server', search: '' },
      navigator: {},
      fetch: (...a) => fetch(...a),
    });
    this.analytics.mode = 'online';
  }
}
