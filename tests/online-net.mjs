/**
 * Bản online khi mạng chập chờn — hai máy, giả lập ngay trong trình duyệt.
 *
 * Ba kiểu hỏng mạng:
 *   - **đứt hẳn**: socket đóng, mở socket mới cũng hỏng cho tới khi mạng về
 *     (thay `window.WebSocket` bằng bản luôn hỏng, rồi trả lại);
 *   - **chết lặng**: socket vẫn "mở" nhưng không tin nào qua lại — điện thoại
 *     đổi wifi sang 4G hay tắt màn hình hay gặp kiểu này, trình duyệt không báo
 *     `close`. Chỉ nhịp ping hai phía mới phát hiện được;
 *   - **mất mạng cả máy**: `context.setOffline(true)` của Playwright.
 *
 * Nhịp ping hạ xuống vài giây (`window.__netTiming` ở máy khách, `silentMs` ở
 * server) để bài chạy nhanh.
 *
 * Chạy: npm run server:test, npx vite --port 5179 --strictPort, rồi
 *   node tests/online-net.mjs
 */
import {
  ok, until, c, sameBoard, driver, playTurn, setTiming, openTable, finish,
} from './onlinekit.mjs';

const NET = { pingMs: 1000, deadMs: 4000, probeMs: 1500 };
const LONG = { turnMs: 90000, awayMs: 90000, skipMs: 90000, askMs: 90000, silentMs: 5000 };

const pages = await openTable(['Bảy Viễn', 'Cô Ba Trà'], { timing: LONG, netTiming: NET });
ok(pages.length === 2, 'bàn hai máy đã khai cuộc');
const seatOf = (p) => c(p, (g) => g.net.mySeat);

/** Đứt hẳn `ms`: đóng socket, mọi socket mới đều hỏng cho tới khi hết hạn. */
const cut = (page, ms) => page.evaluate((t) => {
  const Real = (window.__RealWS ??= window.WebSocket);
  class Dead {
    constructor() {
      this.readyState = 0;
      setTimeout(() => { this.readyState = 3; this.onerror?.({}); this.onclose?.({ code: 1006 }); }, 150);
    }
    send() {}
    close() {}
  }
  window.WebSocket = Dead;
  window.__room.ws?.close();
  setTimeout(() => { window.WebSocket = Real; }, t);
}, ms);

/**
 * Chết lặng: socket hiện tại vẫn mở nhưng không gửi, không nhận gì nữa.
 * `block` > 0 thì socket mới cũng hỏng trong bấy nhiêu ms (mạng chưa về).
 */
const silence = (page, block = 0) => page.evaluate((t) => {
  const ws = window.__room.ws;
  ws.send = () => {};
  ws.onmessage = () => {};
  if (!t) return;
  const Real = (window.__RealWS ??= window.WebSocket);
  class Dead {
    constructor() {
      this.readyState = 0;
      setTimeout(() => { this.readyState = 3; this.onerror?.({}); this.onclose?.({ code: 1006 }); }, 150);
    }
    send() {}
    close() {}
  }
  window.WebSocket = Dead;
  setTimeout(() => { window.WebSocket = Real; }, t);
}, block);

const linked = (p) => c(p, (g) => !g.net.linkLost && g.net.ws?.readyState === 1);
const warnShown = (p) => p.locator('#link-warn.show').count().then((n) => n > 0);
const statusOf = (p, seat) => c(p, (g, s) => g.hud.seatStatus[s], seat);
const turnKey = (p) => c(p, (g) => `${g.state.turn}:${g.state.turnNo}`);
const hasRoll = (p) => p.locator('#actions button', { hasText: 'Lắc xí ngầu' }).count().then((n) => n > 0);

/* ================================================================ 1 */

console.log('\n▸ 1. Người ngồi xem đứt mạng 6 giây, bàn vẫn chạy');
await sameBoard(pages);
let D = await driver(pages);
let W = pages.find((p) => p !== D);
let wSeat = await seatOf(W);
await cut(W, 6000);
ok(await until(() => warnShown(W), 3000), 'máy đứt mạng hiện dải cảnh báo');
ok(await until(async () => (await statusOf(D, wSeat)) === 'away', 5000), 'máy kia thấy "mất kết nối"');
ok(await playTurn(pages.filter((p) => p !== W)), 'người đang đi đi trọn lượt trong lúc ấy');
ok(await until(() => linked(W), 20000), 'mạng về thì tự nối lại');
ok(!(await warnShown(W)), 'dải cảnh báo tắt');
ok((await sameBoard(pages)).same, 'máy vừa nối lại thấy đúng ván, kể cả lượt đã đi lúc đứt');
ok(await until(async () => (await statusOf(D, wSeat)) === 'live', 5000), 'máy kia thấy có mặt lại');

/* ================================================================ 2 */

console.log('\n▸ 2. Người đang đi đứt 2 giây, về vẫn còn lượt');
await sameBoard(pages);
D = await driver(pages);
const key2 = await turnKey(D);
await cut(D, 2000);
await D.waitForTimeout(2500);
ok(await until(() => linked(D), 15000), 'nối lại');
ok((await turnKey(D)) === key2, 'vẫn đúng lượt ấy, chưa bị bỏ');
ok(await until(async () => (await D.locator('#actions button:not([disabled])').count()) > 0, 10000), 'thanh nút hiện lại');
ok(await playTurn(pages), 'đi tiếp trọn lượt');

/* ================================================================ 3 */

console.log('\n▸ 3. Người đang đi đứt lâu hơn hạn skipMs thì mất lượt');
await sameBoard(pages);
await setTiming(pages[0], { skipMs: 2500 });
// Hạn mới áp từ câu hỏi kế: cho một lượt qua trước
await playTurn(pages);
await sameBoard(pages);
D = await driver(pages);
W = pages.find((p) => p !== D);
const dSeat = await seatOf(D);
const key3 = await turnKey(W);
await cut(D, 10000);
ok(await until(async () => (await turnKey(W)) !== key3, 12000), 'server bỏ lượt người đứt mạng');
ok(await until(() => linked(D), 25000), 'người ấy nối lại');
ok((await sameBoard(pages)).same, 'ván khớp nhau');
const mineNow = await c(D, (g) => g.state.turn === g.net.mySeat);
ok(mineNow || !(await hasRoll(D)), 'không còn nút lắc của lượt đã mất', `ghế ${dSeat}`);
await setTiming(pages[0], { skipMs: 90000 });
ok(await playTurn(pages), 'ván đi tiếp bình thường');

/* ================================================================ 4 */

console.log('\n▸ 4. Socket chết lặng, mạng chưa về: server tự phát hiện');
await sameBoard(pages);
D = await driver(pages);
W = pages.find((p) => p !== D);
wSeat = await seatOf(W);
await silence(W, 14000);
ok(await until(async () => (await statusOf(D, wSeat)) === 'away', 14000), 'máy kia thấy "mất kết nối" dù không có tin đóng nào');
ok(await until(() => warnShown(W), 8000), 'máy chết lặng tự biết mình mất kết nối');
ok(await until(() => linked(W), 30000), 'mạng về thì nối lại');
ok(await until(async () => (await statusOf(D, wSeat)) === 'live', 8000), 'máy kia thấy có mặt lại');
ok((await sameBoard(pages)).same, 'ván khớp nhau');

/* ================================================================ 5 */

console.log('\n▸ 5. Socket chết lặng, mạng vẫn thông: máy khách tự thay socket');
await sameBoard(pages);
D = await driver(pages);
W = pages.find((p) => p !== D);
const old = await W.evaluateHandle(() => window.__room.ws);
await silence(W, 0);
ok(await until(() => W.evaluate((o) => window.__room.ws && window.__room.ws !== o && window.__room.ws.readyState === 1, old), 12000),
  'socket mới thay socket chết');
ok(await playTurn(pages), 'ván đi tiếp');
ok((await sameBoard(pages)).same, 'ván khớp nhau');

/* ================================================================ 6 */

console.log('\n▸ 6. Cả máy mất mạng 6 giây (setOffline)');
await sameBoard(pages);
D = await driver(pages);
W = pages.find((p) => p !== D);
await W.context().setOffline(true);
await D.waitForTimeout(6000);
await W.context().setOffline(false);
ok(await until(() => linked(W), 20000), 'mạng về thì nối lại');
ok(await playTurn(pages), 'ván đi tiếp');
ok((await sameBoard(pages)).same, 'ván khớp nhau');

await finish();
