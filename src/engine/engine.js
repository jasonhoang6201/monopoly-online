/**
 * Engine: ván cờ như một hàm `apply(doc, action) → {doc, events}`.
 *
 * Luật chạy bằng generator (xem `engine/game.js`): chỗ nào trước đây chờ một
 * hộp thoại thì nay `yield` một **câu hỏi** — hỏi ghế nào, loại gì, dữ liệu gì,
 * hạn bao lâu, hết hạn thì lấy câu trả lời nào. Câu hỏi đang treo là thứ duy
 * nhất ván chờ; action của người chơi là câu trả lời cho nó.
 *
 * Generator không tuần tự hoá được, nên ván lưu dưới dạng `doc`:
 *   - `base`: ảnh chụp lúc ván đứng ở thanh nút đầu một nước (mốc yên),
 *   - `log`: mọi action từ mốc ấy tới giờ.
 * Dựng lại thì nạp `base` rồi chạy lại `log`. Mọi số ngẫu nhiên lấy từ
 * `st.rng` (engine/rng.js) và mọi mốc giờ lấy từ `action.t`, nên chạy lại ra
 * đúng ván cũ. `log` chỉ dài bằng một lượt, vì mỗi lần về mốc yên là cắt.
 *
 * Engine không đụng DOM, Phaser hay mạng. Bên ngoài (máy chủ phòng, hoặc
 * trình duyệt ở bản một máy) gọi `dispatch`, nhận `events` để diễn, và đặt
 * hẹn giờ theo `deadline` của câu hỏi đang treo.
 */
import { GameState } from '../core/state.js';
import { snapshot, fromSnapshot } from '../core/serialize.js';
import { telemetry } from '../core/telemetry.js';
import { withRandom, freshSeed } from './rng.js';
import { Rules } from './game.js';

/** Trạng thái riêng của engine, đi theo ảnh chụp trong `st.flow`. */
export function blankFlow() {
  return {
    /** Đếm câu hỏi đã đặt ra — id của câu hỏi, để câu trả lời trễ không lạc sang câu sau. */
    askN: 0,
    /** Cược Chẵn Lẻ đang chờ lần lắc kế tiếp. */
    bet: null,
    /** Tất Tay đang chờ lần lắc kế tiếp. */
    allIn: null,
    /**
     * Để đồng hồ cạn: `n` là số lượt liên tiếp của từng ghế, `counted` là lượt
     * `turnNo` đã bị tính chưa. Bấm bất cứ gì là chuỗi của ghế ấy về 0.
     */
    stall: { n: {}, turnNo: -1, counted: false },
    /** Ghế bị gạch tên vì vắng quá hạn, chờ mốc yên kế tiếp để thi hành. */
    evict: [],
    /** Ghế nào đang có mặt (bản online). `null` = ai cũng có mặt (bản một máy). */
    online: null,
    /** Số thứ tự sự kiện số liệu cân bằng trong ván. */
    tseq: 0,
  };
}

/**
 * Hạn của từng loại việc, tính bằng ms. Bản một máy không có hạn: cả bàn ngồi
 * quanh một cái máy, không ai bỏ đi mà treo được ai. Bộ kiểm thử hạ xuống qua
 * `settings.timing`.
 */
export const TIMING = {
  /** Một nước đi ở thanh nút. */
  turnMs: 60000,
  /**
   * Người tới lượt đang mất kết nối: chờ bấy lâu rồi bỏ lượt. Đủ cho wifi chập
   * chờn một nhịp mà không bỏ lượt oan; người rớt thật thì bàn chỉ chờ chừng ấy.
   */
  skipMs: 12000,
  /** Đang mở hộp thoại của chính mình (quản lý tài sản, dựng giao dịch). */
  busyMs: 120000,
  /** Trả lời đề nghị giao dịch, chuộc đất vừa nhận, bốc thăm quyền đi trước. */
  tradeMs: 45000,
  /** Con nợ xoay tiền. */
  raiseMs: 60000,
  /** Câu hỏi của thẻ Thời Cuộc, phiên đấu giá, các bảng chọn ô. */
  askMs: 30000,
  /** Hộp thẻ Cơ Hội / Khí Vận chờ người đang đi bấm. */
  fateMs: 15000,
  /** Lượt để đồng hồ cạn liên tiếp bấy nhiêu lần thì coi như bỏ ván. */
  maxStalls: 3,
};

export class Engine {
  /**
   * @param {GameState} st
   * @param {object} [o]
   * @param {(ev:object)=>void} [o.onTelemetry] nhận sự kiện số liệu cân bằng
   */
  constructor(st, o = {}) {
    this.st = st;
    if (!st.flow) st.flow = blankFlow();
    this.rules = new Rules(this);
    /** Đang chạy lại log: không phát sự kiện, không ghi số liệu. */
    this.replaying = false;
    /** Sự kiện của lần `dispatch` đang chạy. */
    this.out = [];
    /** Câu hỏi đang treo. */
    this.wait = null;
    this.gen = null;
    this.now = 0;
    this.base = null;
    this.log = [];
    this.onTelemetry = o.onTelemetry ?? null;
    /**
     * Dùng `Math.random` của trang thay cho RNG của ván. Chỉ bộ kiểm thử bản
     * một máy bật: bài kiểm thử ép xí ngầu bằng cách thay `Math.random`. Ván
     * như thế không chạy lại được từ `doc`, mà bản một máy cũng không cần.
     */
    this.hostRandom = !!o.hostRandom;
  }

  /* ================================================================
     Dựng ván
     ================================================================ */

  /**
   * Ván mới. `t` là mốc giờ của máy dựng ván; `seed` bỏ trống thì gieo mới.
   * @returns {{engine:Engine, events:Array}}
   */
  static create({ names, tokens = null, settings = null, bots = null, seed, t, gameId }, o = {}) {
    const st = new GameState(names, tokens, settings);
    st.startedAt = t;
    if (gameId) st.gameId = gameId;
    st.bots = bots ? names.map((_, i) => bots[i] ?? null) : names.map(() => null);
    st.rng = seed ?? freshSeed();
    st.flow = blankFlow();
    const e = new Engine(st, o);
    e.now = t;
    e.base = snapshot(st);
    e.log = [];
    const events = e.run(() => e.start());
    return { engine: e, events };
  }

  /** Dựng lại từ `doc` đã lưu: nạp mốc yên rồi chạy lại log, không phát gì. */
  static restore(doc, o = {}) {
    const st = fromSnapshot(doc.base);
    const e = new Engine(st, o);
    e.base = doc.base;
    e.log = [];
    e.replaying = true;
    e.now = doc.base.flowAt ?? doc.base.startedAt ?? 0;
    e.run(() => e.start());
    for (const a of doc.log) e.dispatch(a);
    e.replaying = false;
    return e;
  }

  /** Bản lưu: đủ để `restore` dựng lại đúng ván này. */
  get doc() { return { base: this.base, log: [...this.log] }; }

  start() {
    this.gen = this.rules.main();
    this.step(undefined);
  }

  /**
   * Chỉ cho bộ kiểm thử bản một máy: bỏ câu hỏi đang treo, chạy thẳng một hàm
   * luật (`'payPlayer'`, `'skills.settleBets'`, `'events.run'`…), xong thì
   * phát `debug-done` kèm giá trị trả về rồi quay lại vòng lượt.
   *
   * Không đi qua log, nên ván sau lần gọi này không chạy lại được từ `doc` —
   * server không bao giờ gọi tới đây.
   */
  inject(path, args = []) {
    return this.run(() => {
      const w = this.wait;
      if (w) {
        this.emit('answered', { id: w.id, all: true });
        this.wait = null;
      }
      const keys = path.split('.');
      const name = keys.pop();
      const owner = keys.reduce((o, k) => o[k], this.rules);
      const rules = this.rules;
      const e = this;
      this.gen = (function* injected() {
        let v = owner[name](...args);
        if (v && typeof v.next === 'function') v = yield* v;
        // Mạch gọi thẳng có thể đổi ván mà không tự phát ảnh chụp (đặt hồi chiêu)
        e.emit('sync');
        e.emit('debug-done', { path, value: v ?? null });
        yield* rules.main();
      }());
      this.step(undefined);
    });
  }

  /**
   * Chỉ cho bộ kiểm thử: thay cả ván bằng ảnh chụp này (bài kiểm thử sửa tay
   * tiền, đất, vị trí rồi đẩy vào) và dựng lại vòng lượt từ đầu.
   */
  force(snap) {
    const st = fromSnapshot(snap);
    if (!st.flow) st.flow = blankFlow();
    /* Id câu hỏi chỉ được tăng: ảnh chụp bài kiểm thử đẩy vào có thể chụp
       trước câu hỏi gần nhất, mà id cũ dùng lại thì máy khách tưởng câu hỏi
       mới là câu nó đã trả lời. */
    st.flow.askN = Math.max(st.flow.askN ?? 0, this.st.flow?.askN ?? 0);
    this.st = st;
    /* Giữ bộ luật cũ: nó đọc ván qua `this.e.st`, và bài kiểm thử gọi thẳng
       từng khúc của một mạch lắc (`pedal` rồi `flushSlip`) qua nhiều lần đẩy
       ván — bản kê tiền của lần lắc nằm ở đó. */
    this.base = snapshot(st);
    this.log = [];
    return this.run(() => {
      if (this.wait) this.emit('answered', { id: this.wait.id, all: true });
      this.wait = null;
      this.emit('sync');
      this.start();
    });
  }

  /* ================================================================
     Nhận action
     ================================================================ */

  /**
   * Một action từ bên ngoài. `a.t` là mốc giờ của máy chủ lúc nhận — engine
   * không đọc đồng hồ, để chạy lại ra đúng hạn chót cũ.
   *
   * @param {{type:string, t:number, seat?:number, id?:number, value?:any}} a
   * @returns {Array<object>} sự kiện để diễn (rỗng khi đang chạy lại log)
   */
  dispatch(a) {
    if (this.st.over && a.type !== 'presence') return [];
    return this.run(() => {
      this.now = a.t ?? this.now;
      const ok = this.handle(a);
      // Action bị bác không vào log: chạy lại cũng sẽ bị bác, ghi vào chỉ tổ dài
      if (ok) this.log.push(a);
      else this.emit('rejected', { action: a.type, seat: a.seat ?? null });
    });
  }

  handle(a) {
    const w = this.wait;
    switch (a.type) {
      case 'answer': {
        if (!w || a.id !== w.id) return false;
        const q = w.list.find((x) => x.seat === a.seat);
        if (!q || w.answers.has(a.seat)) return false;
        w.answers.set(a.seat, a.value);
        this.touched(a.seat);
        if (w.answers.size < w.list.length) {
          // Hỏi nhiều người cùng lúc: người đã trả lời thì hộp ở máy họ đóng
          this.emit('answered', { id: w.id, seat: a.seat });
          return true;
        }
        this.resume();
        return true;
      }
      case 'timeout': {
        if (!w || a.id !== w.id || !w.deadline) return false;
        if (this.now < w.deadline) return false;
        for (const q of w.list) {
          if (w.answers.has(q.seat)) continue;
          w.answers.set(q.seat, q.fallback);
          w.timedOut.add(q.seat);
        }
        this.resume();
        return true;
      }
      case 'hold': {
        // Người đang đi vừa mở một hộp thoại của mình: nới hạn nước đi
        if (!w || w.list[0]?.kind !== 'turn' || w.list[0].seat !== a.seat) return false;
        const ms = this.timing('busyMs');
        if (!ms) return true;
        w.deadline = Math.max(w.deadline ?? 0, this.now + ms);
        this.touched(a.seat);
        this.emitWait();
        return true;
      }
      case 'seen':
        // Người chơi còn ngồi máy (bấm nút, gõ phím): xoá chuỗi "để hết giờ"
        if (!this.st.players[a.seat]) return false;
        this.touched(a.seat);
        return true;
      case 'learn':
        return this.rules.skills.learnOffTurn(a.seat, a.value?.id);
      case 'ghost-vote':
        return this.rules.ghosts.vote(a.seat, a.value);
      case 'presence': {
        const f = this.st.flow;
        if (!f.online) f.online = this.st.players.map(() => true);
        if (!(a.seat >= 0 && a.seat < f.online.length)) return false;
        f.online[a.seat] = !!a.value;
        /* Người đang tới lượt vừa rớt: rút hạn còn `skipMs`. Vừa về: trả hạn
           một nước đầy đủ. Câu hỏi khác (giao dịch, xoay tiền) giữ hạn cũ. */
        if (w && w.list[0]?.kind === 'turn' && w.list[0].seat === a.seat && this.st.settings.clock) {
          w.deadline = a.value
            ? Math.max(w.deadline, this.now + this.timing('turnMs'))
            : Math.min(w.deadline || Infinity, this.now + this.timing('skipMs'));
          this.emitWait();
        }
        return true;
      }
      case 'evict': {
        // Vắng quá hạn ân: thi hành ở mốc yên kế tiếp — giữa một mạch luật thì
        // không chen được mạch khác vào
        const p = this.st.players[a.seat];
        if (!p || p.bankrupt || this.st.flow.evict.includes(a.seat)) return false;
        this.st.flow.evict.push(a.seat);
        if (w && w.list[0]?.kind === 'turn') {
          w.answers.set(w.list[0].seat, { do: 'tick' });
          this.resume();
        }
        return true;
      }
      default:
        return false;
    }
  }

  /** Câu hỏi đã đủ câu trả lời: chạy luật tiếp tới câu hỏi kế tiếp. */
  resume() {
    const w = this.wait;
    this.wait = null;
    this.emit('answered', { id: w.id, all: true });
    /* Hỏi một người: luật nhận `{value, timeout}` — có chỗ phải phân biệt "hết
       giờ" với một câu từ chối (giao dịch, xoay tiền). Hỏi nhiều người: Map
       ghế → câu trả lời theo thứ tự về tới máy chủ, kèm tập ghế hết giờ. */
    let v;
    if (w.multi) {
      v = w.answers;
      v.timedOut = w.timedOut;
    } else {
      v = { value: w.answers.get(w.list[0].seat), timeout: w.timedOut.size > 0 };
    }
    this.step(v);
  }

  /** Ghế này vừa bấm gì đó: còn ngồi máy, xoá chuỗi để hết giờ. */
  touched(seat) {
    const s = this.st.flow.stall;
    if (s.n[seat]) s.n[seat] = 0;
  }

  /**
   * Chạy generator tới câu hỏi kế tiếp.
   *
   * Lúc câu hỏi kế tiếp là thanh nút đầu một nước (`turn`) thì ván đang ở mốc
   * yên: chụp lại làm `base`, cắt log. Chụp **trước khi** cấp id cho câu hỏi,
   * vì `restore` sẽ đi lại đúng đường ấy và cấp lại id ấy.
   */
  step(v) {
    let r;
    try {
      r = this.gen.next(v);
    } catch (err) {
      this.emit('error', { message: String(err?.message ?? err), stack: String(err?.stack ?? '') });
      throw err;
    }
    if (r.done) {
      this.wait = null;
      return;
    }
    const q = r.value;
    const list = q.list.map((x) => ({ ...x }));
    if (list[0]?.kind === 'turn' && !this.replaying) {
      this.base = { ...snapshot(this.st), flowAt: this.now };
      this.log = [];
    }
    const id = ++this.st.flow.askN;
    const ms = q.ms ?? 0;
    this.wait = {
      id,
      list,
      multi: !!q.multi,
      ms,
      deadline: ms > 0 ? this.now + ms : 0,
      answers: new Map(),
      timedOut: new Set(),
    };
    this.emitWait();
  }

  emitWait() {
    const w = this.wait;
    this.emit('ask', {
      id: w.id,
      multi: w.multi,
      deadline: w.deadline,
      ms: w.deadline ? w.deadline - this.now : 0,
      list: w.list.map(({ seat, kind, data }) => ({ seat, kind, data })),
    });
  }

  /** Câu hỏi đang treo, dạng gửi được cho máy khách. */
  get pending() {
    const w = this.wait;
    if (!w) return null;
    return {
      id: w.id,
      multi: w.multi,
      deadline: w.deadline,
      list: w.list.map(({ seat, kind, data }) => ({ seat, kind, data })),
      answered: [...w.answers.keys()],
    };
  }

  /* ================================================================
     Môi trường của một bước luật
     ================================================================ */

  /**
   * Chạy một bước luật với RNG của ván và bộ đệm số liệu của ván, gom sự kiện.
   * Bộ đệm số liệu (`core/telemetry.js`) là biến dùng chung của cả module, mà
   * một isolate có thể chạy nhiều phòng — nên tráo vào rồi trả lại như RNG.
   */
  run(fn) {
    this.out = [];
    const t = telemetry;
    const saved = {
      on: t.on, gate: t.gate, ctx: t.ctx, onPush: t.onPush, seq: t.seq,
      startedAt: t.startedAt, now: t.now, buffer: t.buffer,
    };
    const st = this.st;
    t.on = true;
    t.buffer = [];
    t.seq = st.flow?.tseq ?? 0;
    t.startedAt = st.startedAt;
    t.now = () => this.now;
    t.gate = () => !this.replaying && !!this.onTelemetry && !st.bots?.some(Boolean);
    t.ctx = () => ({ game_id: st.gameId, turn_no: st.turnNo, round: st.round, turn: st.turn });
    t.onPush = (ev) => this.onTelemetry?.(ev);
    try {
      if (this.hostRandom) fn(); else withRandom(st, fn);
    } finally {
      if (st.flow) st.flow.tseq = t.seq;
      Object.assign(t, saved);
    }
    const out = this.out;
    this.out = [];
    return this.replaying ? [] : out;
  }

  /** Ghi một sự kiện cho bên diễn. `sync` mang theo ảnh chụp ngay lúc ấy. */
  emit(type, data = {}) {
    if (this.replaying) return;
    if (type === 'sync') { this.out.push({ type, snap: snapshot(this.st) }); return; }
    this.out.push({ type, ...data });
  }

  /** Hạn của một loại việc — 0 khi ván không bật đồng hồ (bản một máy). */
  timing(key) {
    const st = this.st;
    const custom = st.settings.timing?.[key];
    if (key === 'maxStalls') return custom ?? TIMING.maxStalls;
    if (!st.settings.clock) return 0;
    return custom ?? TIMING[key];
  }

  isBot(seat) { return !!this.st.bots?.[seat]; }

  /** Ghế còn ngồi máy (bản online); bản một máy thì ai cũng có mặt. */
  isLive(seat) { return this.st.flow.online?.[seat] ?? true; }
}
