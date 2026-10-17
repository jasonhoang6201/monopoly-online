/**
 * Chủ ván ngay trong trình duyệt — bản chơi chung một máy.
 *
 * Giữ engine (`engine/engine.js`) và đưa action vào, y như Durable Object làm
 * ở bản online. Controller không phân biệt hai bên: gửi action qua `send`,
 * nhận sự kiện qua `onEvents`. Khác ở chỗ không có đồng hồ (bản một máy không
 * hẹn giờ ai) và mọi ghế người đều ngồi trước màn hình này.
 */
import { Engine } from '../engine/engine.js';
import { snapshot } from '../core/serialize.js';

export class LocalHost {
  /**
   * @param {{names:string[], tokens?:number[], settings?:object, bots?:Array<?string>}} setup
   * @param {{onTelemetry?:(ev:object)=>void}} [o]
   */
  constructor(setup, o = {}) {
    this.setup = setup;
    // Bài kiểm thử ép xí ngầu bằng cách thay Math.random — xem `Engine.hostRandom`
    this.o = { ...o, hostRandom: !!globalThis.navigator?.webdriver };
    this.engine = null;
    /** @type {(events:Array<object>)=>void} */
    this.onEvents = () => {};
  }

  get online() { return false; }

  /** Dựng ván, trả về ảnh chụp đầu tiên để controller dựng bàn cờ. */
  start() {
    const { engine, events } = Engine.create({ ...this.setup, t: Date.now() }, this.o);
    this.engine = engine;
    // Sự kiện đầu ván đi sau ảnh chụp, để bàn cờ dựng xong rồi mới diễn
    queueMicrotask(() => this.onEvents(events));
    return snapshot(engine.st);
  }

  /** Câu hỏi đang treo — controller đọc lúc dựng lại giao diện. */
  get pending() { return this.engine?.pending ?? null; }

  send(action) {
    if (!this.engine) return;
    const events = this.engine.dispatch({ ...action, t: Date.now() });
    if (events.length) this.onEvents(events);
  }

  /* ---------------------------------------------------------- cho bộ kiểm thử */

  /**
   * Tham số bài kiểm thử truyền vào là người chơi **của bàn cờ đang vẽ** —
   * đổi sang đúng người ấy trong ván của engine, theo số ghế.
   */
  mapArgs(args) {
    const players = this.engine.st.players;
    /* Đi sâu vào mảng và object thường: bài kiểm thử truyền lại cả kết quả của
       lần gọi trước (bảng tiền thuê có danh sách [người, kỹ năng, tiền]). */
    const map = (a, depth) => {
      if (!a || typeof a !== 'object' || depth > 3) return a;
      if ('token' in a && Number.isInteger(a.id) && players[a.id]) return players[a.id];
      if (Array.isArray(a)) return a.map((x) => map(x, depth + 1));
      if (Object.getPrototypeOf(a) === Object.prototype) {
        return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, map(v, depth + 1)]));
      }
      return a;
    };
    return args.map((a) => map(a, 0));
  }

  /** Thay ván của engine bằng ảnh chụp bài kiểm thử vừa sửa tay. */
  force(snap) {
    this.engine.hostRandom = this.o.hostRandom;
    const events = this.engine.force(snap);
    if (events.length) this.onEvents(events);
  }

  /** Chạy thẳng một mạch luật (generator) trên engine. */
  inject(path, args) {
    const events = this.engine.inject(path, this.mapArgs(args));
    if (events.length) this.onEvents(events);
  }

  /** Gọi một hàm luật thường (không hỏi ai), lấy giá trị trả về. */
  call(path, args) {
    const keys = path.split('.');
    const name = keys.pop();
    const owner = keys.reduce((o, k) => o[k], this.engine.rules);
    let v;
    const events = this.engine.run(() => { v = owner[name](...this.mapArgs(args)); });
    if (events.length) this.onEvents(events);
    return v;
  }
}
