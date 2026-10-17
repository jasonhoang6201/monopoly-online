/**
 * Nguồn ngẫu nhiên có hạt giống cho engine.
 *
 * Engine phải chạy lại được: server lưu ảnh chụp đầu lượt cùng danh sách action
 * từ đó tới giờ, thức dậy sau khi ngủ đông thì chạy lại danh sách ấy. Muốn ra
 * đúng ván cũ thì mọi lần gieo xí ngầu, xáo bài, rút tỉ lệ kỹ năng phải ra
 * đúng con số cũ — nên số ngẫu nhiên sinh từ một trạng thái nằm trong ván
 * (`st.rng`), không từ `Math.random` của máy.
 *
 * Luật trong `core/` gọi thẳng `Math.random` ở hơn chục chỗ. Thay vì truyền
 * hàm ngẫu nhiên qua từng chỗ ấy (sót một chỗ là chạy lại ra ván khác), engine
 * tráo `Math.random` trong lúc chạy một bước luật rồi trả lại ngay. Một bước
 * luật chạy đồng bộ từ đầu tới cuối, không có `await`, nên không đoạn mã nào
 * khác (hoạt cảnh, giao diện, DO khác chung isolate) chen vào giữa được.
 */

/** mulberry32: 32 bit trạng thái, đủ cho trò chơi, chép qua JSON là một con số. */
export function next(s) {
  let t = (s + 0x6D2B79F5) | 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return { s: t, v: ((r ^ (r >>> 14)) >>> 0) / 4294967296 };
}

/** Hạt giống mới cho một ván — chỉ gọi lúc dựng ván, ngoài mọi bước luật. */
export function freshSeed() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] | 0;
  return (Math.random() * 4294967296) | 0;
}

/**
 * Chạy `fn` với `Math.random` lấy số từ `box.rng`, rồi trả lại hàm gốc.
 * `box` là object giữ trạng thái (thường là `GameState`), được ghi lại sau mỗi
 * lần gieo để bước sau đi tiếp đúng dãy.
 */
export function withRandom(box, fn) {
  const real = Math.random;
  Math.random = () => {
    const o = next(box.rng | 0);
    box.rng = o.s;
    return o.v;
  };
  try { return fn(); } finally { Math.random = real; }
}
