/**
 * Đường truyền của một phòng — hai bản cài đặt cùng một giao diện.
 *
 *   SupabaseTransport  đi qua Supabase Realtime → nối được **nhiều máy tính**.
 *   LocalTransport     đi qua BroadcastChannel → chỉ nối các **tab cùng máy**.
 *
 * Tách ra làm hai vì hai lý do. Một, chưa cắm khoá Supabase thì game vẫn chơi
 * thử được qua hai cửa sổ trình duyệt. Hai, bộ kiểm thử Playwright chạy được
 * toàn bộ luồng phòng chờ mà không cần tài khoản hay mạng.
 *
 * Giao diện chung:
 *   join()                  vào phòng, chờ nối xong
 *   send(event, payload)    phát cho mọi người (KHÔNG dội lại người gửi)
 *   on(event, fn)           nghe một loại thông điệp
 *   track(meta)             khai báo mình đang có mặt
 *   onPresence(fn)          danh sách người có mặt đổi → fn(danh sách)
 *   onStatus(fn)            đường truyền đứt / nối lại → fn('lost'|'live')
 *   peers()                 danh sách hiện tại
 *   leave()                 rời phòng
 */
import { supabase, isConfigured } from './supabase.js';

/** Bộ khung chung: quản lý danh sách người nghe. */
class BaseTransport {
  constructor(code, me) {
    this.code = code;
    this.me = me;
    this.listeners = new Map();
    this.presenceFns = [];
    this.statusFns = [];
    this._peers = [];
    /**
     * Đường truyền còn thông không: `'live'` hay `'lost'`.
     *
     * Khác với presence — presence trả lời "ai còn trong phòng", cái này trả
     * lời "máy mình còn nghe thấy phòng không". Rớt mạng thì presence im lặng
     * chứ không báo gì, vì tin báo cũng phải đi qua đúng đường vừa đứt.
     */
    this.status = 'live';
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
    return this;
  }

  onPresence(fn) { this.presenceFns.push(fn); return this; }

  onStatus(fn) { this.statusFns.push(fn); return this; }

  peers() { return this._peers; }

  _deliver(event, payload) {
    for (const fn of this.listeners.get(event) ?? []) fn(payload);
  }

  _setPeers(list) {
    this._peers = list;
    for (const fn of this.presenceFns) fn(list);
  }

  /** Chỉ báo lên khi trạng thái thực sự đổi — kênh đứt sinh ra nhiều tin một lúc. */
  _setStatus(s) {
    if (s === this.status) return;
    this.status = s;
    for (const fn of this.statusFns) fn(s);
  }
}

/* ==================================================================
   Supabase Realtime — nhiều máy tính
   ================================================================== */

class SupabaseTransport extends BaseTransport {
  constructor(code, me) {
    super(code, me);
    this.kind = 'supabase';
    /** Đã vào phòng lần nào chưa — phân biệt "lỗi lúc vào" với "đứt giữa chừng". */
    this.joined = false;
    /** Mình đã chủ động rời chưa — rời rồi thì đứt là chuyện đương nhiên. */
    this.closed = false;
    /** Tin presence gần nhất, để khai lại sau khi nối lại. */
    this.lastMeta = null;
    this.channel = supabase.channel(`monopoly:${code}`, {
      config: {
        presence: { key: me.id },
        // Không dội lại người gửi: người gửi đã tự đổi trạng thái của mình rồi,
        // nhận lại chính thông điệp ấy sẽ chạy hai lần.
        broadcast: { self: false },
      },
    });
  }

  async join() {
    this.channel.on('broadcast', { event: 'msg' }, ({ payload }) => {
      this._deliver(payload.event, payload.data);
    });
    this.channel.on('presence', { event: 'sync' }, () => {
      const st = this.channel.presenceState();
      this._setPeers(
        Object.values(st).flat().sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0)),
      );
    });

    await new Promise((resolve, reject) => {
      this.channel.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          /* Callback này còn được gọi **lại** mỗi lần kênh tự nối lại sau khi
             đứt. Lần đầu là "vào phòng xong", những lần sau là "đã nối lại" —
             hai chuyện khác nhau, đừng resolve lời hứa `join()` hai lần. */
          if (this.joined) { this.#relive(); return; }
          this.joined = true;
          resolve();
          return;
        }
        if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT' && status !== 'CLOSED') return;
        // Chưa vào nổi phòng lần nào thì đây là lỗi lúc vào, phải báo hỏng ngay.
        if (!this.joined) { reject(err ?? new Error(`Không nối được phòng (${status})`)); return; }
        this._setStatus('lost');
      });
    });

    /* Nghe thêm ở tầng socket, vì kênh biết mình đứt quá muộn: nó phải chờ hết
       hạn tim đập (cỡ vài chục giây) mới kêu. Rút wifi mà mười giây sau mới
       hiện cảnh báo thì người chơi đã kịp bấm vào khoảng không mất rồi. Sự kiện
       `offline` của trình duyệt (đăng ký bên dưới) còn biết sớm hơn nữa. */
    supabase.realtime.onClose?.(() => this.#maybeLost());
    supabase.realtime.onError?.(() => this.#maybeLost());
    supabase.realtime.onOpen?.(() => this.#maybeLive());

    /* Lưới an toàn, và không thừa: socket có thể nối lại **âm thầm** — tin gửi
       lúc đứt được thư viện đệm lại rồi bắn đi hết, còn kênh thì rejoin không
       kêu một tiếng nào. Không có nhịp canh này thì có lúc mọi thứ đã thông
       trở lại mà game vẫn treo cờ "mất kết nối", và cờ ấy khoá cả thanh nút
       lẫn phần việc của trọng tài — ván đứng hẳn dù mạng không sao cả. */
    this.watch = setInterval(() => {
      if (this.status === 'lost' && supabase.realtime.isConnected?.()) this.#maybeLive();
    }, 2000);
    this.onOffline = () => this.#maybeLost();
    window.addEventListener('offline', this.onOffline);
    /* Mạng có lại thì thúc socket nối ngay, khỏi ngồi chờ hết nhịp lùi (nó tăng
       dần tới 10 giây). Gọi lúc đang nối sẵn cũng không sao — nó tự bỏ qua. */
    this.onOnline = () => { try { supabase.realtime.connect(); } catch { /* nối sau */ } };
    window.addEventListener('online', this.onOnline);
  }

  /** Đứt — nhưng chỉ tính sau khi đã vào phòng, và chỉ khi chưa chủ động rời. */
  #maybeLost() {
    if (this.joined && !this.closed) this._setStatus('lost');
  }

  /** Thông trở lại — chỉ làm gì khi trước đó thật sự đã đứt. */
  #maybeLive() {
    if (this.joined && !this.closed && this.status === 'lost') this.#relive();
  }

  /**
   * Kênh vừa nối lại.
   *
   * Phải `track` lại: presence sống trong bộ nhớ máy chủ theo từng kết nối, nên
   * đường truyền đứt là máy chủ quên mình đã từng có mặt. Không khai lại thì
   * với cả phòng mình vẫn là người đã rời đi, dù kênh đã thông trở lại.
   */
  async #relive() {
    try {
      if (this.lastMeta) await this.channel.track(this.lastMeta);
    } catch { /* vừa nối lại đã đứt tiếp — lần nối sau sẽ khai lại */ }
    this._setStatus('live');
  }

  track(meta) {
    // Nhớ lại để khai lại được sau khi nối lại — xem `#relive`.
    this.lastMeta = { ...meta, joinedAt: meta.joinedAt ?? Date.now() };
    return this.channel.track(this.lastMeta);
  }

  send(event, data) {
    return this.channel.send({ type: 'broadcast', event: 'msg', payload: { event, data } });
  }

  async leave() {
    this.closed = true;
    clearInterval(this.watch);
    window.removeEventListener('offline', this.onOffline);
    window.removeEventListener('online', this.onOnline);
    try { await this.channel.untrack(); } catch { /* kênh đã đóng */ }
    await supabase.removeChannel(this.channel);
  }
}

/* ==================================================================
   BroadcastChannel — các tab trên cùng một máy
   ================================================================== */

/**
 * Nhịp báo còn sống, và hạn chờ trước khi coi là đã rời phòng.
 *
 * Hạn chờ rộng gấp năm lần nhịp vì trình duyệt **bóp nhịp hẹn giờ ở tab đang
 * ẩn** — `setInterval` 700ms tụt xuống còn khoảng một nhịp mỗi giây. Hạn chờ
 * sát quá thì người chơi vừa chuyển sang tab khác đã bị coi là rời phòng.
 */
const PING_MS = 700;
const STALE_MS = 4000;

class LocalTransport extends BaseTransport {
  constructor(code, me) {
    super(code, me);
    this.kind = 'local';
    this.bc = new BroadcastChannel(`monopoly-room:${code}`);
    /** id → { meta, lastSeen } */
    this.seen = new Map();
    this.meta = null;
  }

  async join() {
    this.bc.onmessage = (e) => {
      const m = e.data;
      if (m.kind === 'msg') { this._deliver(m.event, m.data); return; }
      if (m.kind === 'ping') { this._mark(m.meta); return; }
      if (m.kind === 'bye') { this.seen.delete(m.id); this._sync(); return; }
      // Người mới vào hỏi thăm — ai cũng đáp lại một nhịp để họ thấy đủ mặt
      if (m.kind === 'hello') { this._mark(m.meta); this._ping(); }
    };

    // BroadcastChannel không có presence sẵn, phải tự đập nhịp và tự dọn.
    this.timer = setInterval(() => {
      this._ping();
      const cut = Date.now() - STALE_MS;
      let dropped = false;
      for (const [id, rec] of this.seen) {
        if (rec.lastSeen < cut && id !== this.me.id) { this.seen.delete(id); dropped = true; }
      }
      if (dropped) this._sync();
    }, PING_MS);

    this.onUnload = () => this.bc.postMessage({ kind: 'bye', id: this.me.id });
    window.addEventListener('pagehide', this.onUnload);
  }

  _mark(meta) {
    if (!meta?.id) return;
    const known = this.seen.get(meta.id);
    this.seen.set(meta.id, { meta, lastSeen: Date.now() });
    // Chỉ báo lại khi danh sách thực sự đổi, tránh vẽ lại phòng chờ mỗi nhịp
    if (!known || JSON.stringify(known.meta) !== JSON.stringify(meta)) this._sync();
  }

  _ping() {
    if (this.meta) this.bc.postMessage({ kind: 'ping', meta: this.meta });
  }

  _sync() {
    this._setPeers(
      [...this.seen.values()]
        .map((r) => r.meta)
        .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0)),
    );
  }

  track(meta) {
    this.meta = { ...meta, joinedAt: this.meta?.joinedAt ?? meta.joinedAt ?? Date.now() };
    this._mark(this.meta);
    this.bc.postMessage({ kind: 'hello', meta: this.meta });
    return Promise.resolve();
  }

  send(event, data) {
    this.bc.postMessage({ kind: 'msg', event, data });
    return Promise.resolve();
  }

  leave() {
    clearInterval(this.timer);
    window.removeEventListener('pagehide', this.onUnload);
    this.bc.postMessage({ kind: 'bye', id: this.me.id });
    this.bc.close();
    return Promise.resolve();
  }
}

/* ================================================================== */

/**
 * Chọn đường truyền: có khoá Supabase thì đi nhiều máy, không thì đi nội bộ.
 * @param {string} code mã phòng
 * @param {{id:string,name:string}} me
 */
export function makeTransport(code, me) {
  return isConfigured() ? new SupabaseTransport(code, me) : new LocalTransport(code, me);
}

/** Đường truyền hiện tại nối được mấy máy — dùng để nhắc người chơi ở phòng chờ. */
export const transportKind = () => (isConfigured() ? 'supabase' : 'local');
