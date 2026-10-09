/**
 * Bộ đệm sự kiện kỹ năng của một ván — thuần dữ liệu, chạy được dưới Node.
 *
 * Luật (core/skills.js, core/state.js) chỉ gọi `track(kind, payload)`; chuyện
 * gom lại gửi đi đâu là việc của net/analytics.js qua `onPush`. Tách như vậy
 * để luật không biết gì về mạng, và test luật dưới Node vẫn soi được sự kiện.
 *
 * Mỗi sự kiện mang `seq` tăng dần trong ván và `t` (ms từ lúc khai cuộc).
 * `gate` được hỏi **lúc phát** chứ không lúc cài: bản online chỉ máy cầm lái
 * mới được ghi, mà quyền cầm lái đổi tay mỗi lượt — cài một lần rồi ghi mãi
 * là máy ngồi xem cũng đếm, ra số gấp đôi. `seq` chỉ nhích khi qua được gate,
 * để dãy số ở mỗi máy liền mạch.
 */

/** UUID v4 — có `crypto.randomUUID` thì dùng, không thì tự ghép (trình duyệt cũ, http thường). */
export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export class Telemetry {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.buffer = [];
    this.seq = 0;
    this.on = false;
    this.startedAt = 0;
    this.gate = () => true;
    this.ctx = () => ({});
    this.onPush = null;
  }

  /**
   * Bật cho một ván mới: `seq` về 0, buffer cũ bỏ — ván trước đã gửi xong
   * hoặc đã bị bỏ, không gộp sang ván sau.
   * @param {{startedAt:number, gate?:()=>boolean, ctx?:()=>object, onPush?:(ev:object)=>void}} o
   */
  start({ startedAt, gate, ctx, onPush } = {}) {
    this.startedAt = startedAt ?? this.now();
    this.gate = gate ?? (() => true);
    this.ctx = ctx ?? (() => ({}));
    this.onPush = onPush ?? null;
    this.buffer = [];
    this.seq = 0;
    this.on = true;
  }

  /** Tắt; buffer giữ nguyên để nơi gửi còn `drain` nốt. */
  stop() { this.on = false; }

  get enabled() { return this.on; }
  get size() { return this.buffer.length; }

  /**
   * Ghi một sự kiện. Trả `null` khi đang tắt hoặc gate không cho — người gọi
   * trong luật không cần quan tâm, cứ gọi.
   * @returns {?object}
   */
  track(kind, payload = {}) {
    if (!this.on || !this.gate()) return null;
    const ev = { seq: ++this.seq, t: Math.max(0, this.now() - this.startedAt), kind, ...this.ctx(), ...payload };
    this.buffer.push(ev);
    this.onPush?.(ev);
    return ev;
  }

  /** Lấy hết sự kiện đang chờ và làm rỗng buffer. */
  drain() {
    const out = this.buffer;
    this.buffer = [];
    return out;
  }
}

/** Một bộ đệm chung cho cả luật — core/skills.js và core/state.js ghi vào đây. */
export const telemetry = new Telemetry();
export const track = (kind, payload) => telemetry.track(kind, payload);
