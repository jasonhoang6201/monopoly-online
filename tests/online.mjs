/**
 * Bản online trên máy chủ ván cờ (Durable Object) — ba tab trình duyệt thật.
 *
 * Mỗi người một browser context, như ba máy riêng. Luật chạy trên
 * server, nên bài này không kiểm luật (bộ một máy và tests/engine.mjs lo) mà
 * kiểm phần chỉ bản online mới có: phòng chờ, nhiều máy cùng thấy một ván,
 * câu hỏi gửi nhiều người cùng lúc, chat, F5 giữa ván, hết giờ, bỏ bàn.
 *
 * Chạy: cần cả hai máy chủ
 *   npm run server:test                 # wrangler dev, cổng 8787, TEST_TIMING=1
 *   npx vite --port 5179 --strictPort   # bàn cờ
 *   node tests/online.mjs
 */
import { orderOf, playRollOff } from './rolloff.mjs';
import {
  SERVER, BASE, ok, until, newPage, enter, bootToLobby, seatCount, title, c, sameBoard, settle,
  playTurn, finish, hasTitle,
} from './onlinekit.mjs';

/* ================================================================ 1 · phòng chờ */

console.log('\n▸ 1. Phòng chờ trên server');
const A = await newPage('A');
await A.goto(BASE, { waitUntil: 'domcontentloaded' });
await bootToLobby(A);
const link = await A.locator('#lobby-link').inputValue();
const code = new URL(link).searchParams.get('room');
ok(/^[A-Z0-9]{4}$/.test(code ?? ''), 'mở phòng có mã 4 ký tự', link);
ok(new URL(link).searchParams.get('server') === SERVER, 'đường mời giữ tham số ?server=');
await A.locator('.lobby-seat.is-me input.lobby-name').fill('Bảy Viễn');

const B = await enter(link, 'Cô Ba Trà', 'B');
const X = await enter(link, 'Khách Lạ', 'X', { ready: false });
ok(await until(async () => (await seatCount(A)) === 3), 'chủ phòng thấy 3 ghế');
const tokens = await A.evaluate(() => window.__room.seats.map((s) => s.token));
ok(new Set(tokens).size === 3, 'ba ghế ba màu khác nhau', tokens.join(','));

// Chủ phòng mời người thứ ba ra
await A.bringToFront();
const xId = await X.evaluate(() => window.__room.me.id);
await A.locator(`[data-kick="${xId}"]`).click();
// Tab nền không được cấp khung hình: hộp thoại chưa hiện hẳn nếu không đưa tab lên trước
await X.bringToFront();
ok(await until(async () => (await title(X)) === 'Bạn đã bị mời ra khỏi phòng', 8000), 'người bị mời ra thấy thông báo');
await A.bringToFront();
ok(await until(async () => (await seatCount(A)) === 2), 'phòng còn 2 ghế');
await X.close();

const C = await enter(link, 'Năm Cam', 'C', { ready: false });
ok(await until(async () => (await seatCount(A)) === 3), 'người mới vào chỗ trống');
ok(await A.locator('#lobby-start').isDisabled(), 'chưa ai đủ Sẵn sàng thì nút Khai cuộc tắt');
await C.locator('.lobby-seat.is-me .lobby-ready').click();
await A.locator('.lobby-seat.is-me .lobby-ready').click();
ok(await until(() => A.locator('#lobby-start').isEnabled(), 8000), 'đủ Sẵn sàng thì nút Khai cuộc bật');

// Hạn chờ dài trong lúc bài kiểm bấm tay; phần 6 mới hạ xuống
await A.evaluate(() => window.__room.setOptions({ timing: { turnMs: 60000, awayMs: 60000, skipMs: 60000 } }));
await A.waitForTimeout(400);
await A.locator('#lobby-start').click();

const pages = [A, B, C];
let booted = true;
for (const p of pages) {
  await p.bringToFront();
  booted = await until(() => c(p, (g) => !!g.state), 30000) && booted;
}
ok(booted, 'cả ba máy vào bàn cờ');
const names = await c(B, (g) => g.state.players.map((p) => p.name));
ok(names.join('|') === 'Bảy Viễn|Cô Ba Trà|Năm Cam', 'tên theo đúng thứ tự ghế', names.join(', '));
const seats = await Promise.all(pages.map((p) => c(p, (g) => g.net.mySeat)));
ok(seats.join(',') === '0,1,2', 'mỗi máy ngồi đúng ghế của mình', seats.join(','));

/* ================================================================ 2 · lắc giành quyền + vài lượt */

console.log('\n▸ 2. Ba máy cùng một ván');
const order = await playRollOff(pages, { normalize: false });
ok(Array.isArray(order) && order.length === 3, 'lắc giành quyền xong', JSON.stringify(order));
const orders = await Promise.all(pages.map(orderOf));
ok(orders.every((o) => JSON.stringify(o) === JSON.stringify(orders[0])), 'ba máy cùng một thứ tự đi');

let played = 0;
for (let i = 0; i < 6; i++) if (await playTurn(pages)) played += 1;
ok(played === 6, 'đi được 6 lượt bằng thanh nút', `${played}/6`);
const s2 = await sameBoard(pages);
ok(s2.same, 'ván ở ba máy khớp nhau (tiền, vị trí, chủ đất)', s2.same ? '' : s2.last.join('\n'));

/* ================================================================ 3 · chat */

console.log('\n▸ 3. Chat đi qua server');
await A.bringToFront();
await A.locator('#chat-btn').click();
await A.locator('.chat-input').fill('xin chào cả bàn');
await A.locator('.chat-input').press('Enter');
const heard = async (p) => p.locator('#chat-dock .chat-msg').evaluateAll(
  (els) => els.map((e) => e.textContent).join('\n'),
).catch(() => '');
ok(await until(async () => (await heard(B)).includes('xin chào cả bàn'), 8000), 'máy B nhận tin');
ok(await until(async () => (await heard(C)).includes('xin chào cả bàn'), 8000), 'máy C nhận tin');
ok((await heard(B)).includes('Bảy Viễn'), 'tin mang tên người nói, lấy theo ghế');
const echo = (await heard(A)).split('xin chào cả bàn').length - 1;
ok(echo === 1, 'máy gửi không hiện tin của mình hai lần', `${echo} lần`);
await A.keyboard.press('Escape');

/* ================================================================ 4 · hỏi nhiều người cùng lúc */

console.log('\n▸ 4. Đấu giá: server hỏi ba máy cùng lúc');
await sameBoard(pages);
const free = await A.evaluate(async () => {
  const { BOARD } = await import('/src/data/board.js');
  const st = window.__monopoly.controller.state;
  return BOARD.find((t) => t.type === 'property' && !st.owner.has(t.id))?.id;
});
await A.evaluate(([tileId]) => window.__room.post({
  t: 'test', inject: { path: 'events.auction', args: [tileId, { seller: null, reason: 'Bài kiểm thử' }] },
}), [free]);
const bidOpen = (p) => p.locator('.scrim.show .bid-box').count().then((n) => n > 0);
ok(await until(async () => (await Promise.all(pages.map(bidOpen))).every(Boolean), 15000),
  'ba máy cùng mở hộp ghi giá');
// A trả cao nhất, hai người kia trả mức thấp nhất
for (const [p, pick] of [[A, 'last'], [B, 'first'], [C, 'first']]) {
  await p.bringToFront();
  const q = p.locator('.scrim.show .bid-q');
  if (await q.count()) await (pick === 'last' ? q.last() : q.first()).click();
  await p.locator('.scrim.show button.btn', { hasText: 'Chốt giá' }).click();
}
ok(await until(() => c(A, (g, id) => g.state.owner.has(id), free), 20000), 'phiên đấu giá chốt chủ');
const owners = await Promise.all(pages.map((p) => c(p, (g, id) => g.state.owner.get(id), free)));
ok(owners.every((o) => o === 0), 'người trả cao nhất (A) thắng, ba máy cùng thấy', owners.join(','));
for (const p of pages) await settle(p, 8000).catch(() => {});

/* ================================================================ 5 · F5 giữa ván */

console.log('\n▸ 5. F5 giữa ván về đúng ghế');
await sameBoard(pages);
await B.reload({ waitUntil: 'domcontentloaded' });
await B.bringToFront();
ok(await until(() => c(B, (g) => !!g.state && g.net?.mySeat === 1), 60000), 'máy B vào lại đúng ghế 1');
const s5 = await sameBoard(pages, 30000);
ok(s5.same, 'ván sau F5 khớp với hai máy kia');
ok(await until(() => c(A, (g) => g.hud.seatStatus[1] === 'live'), 10000), 'máy A thấy B có mặt lại');

/* ================================================================ 6 · hết giờ */

console.log('\n▸ 6. Ngồi im hết giờ thì server đi hộ');
await A.evaluate(() => window.__room.post({ t: 'test', timing: { turnMs: 2500, skipMs: 1500 } }));
// Hạn mới áp từ câu hỏi kế tiếp: đi một lượt tay để mở câu hỏi mới
await playTurn(pages);
const t6 = await c(A, (g) => g.state.turnNo);
ok(await until(() => c(A, (g, t) => g.state.turnNo > t, t6), 20000), 'không ai bấm, lượt vẫn qua');
await A.evaluate(() => window.__room.post({ t: 'test', timing: { turnMs: 60000, skipMs: 60000 } }));
await playTurn(pages);

/* ================================================================ 7 · bỏ bàn */

console.log('\n▸ 7. Đóng tab quá hạn thì bị gạch tên');
await A.evaluate(() => window.__room.post({ t: 'test', timing: { awayMs: 3000, skipMs: 1500 } }));
await C.close();
ok(await until(() => c(A, (g) => g.hud.seatStatus[2] === 'away'), 10000), 'máy A thấy C mất kết nối');
ok(await until(() => c(A, (g) => g.state.players[2].bankrupt), 20000), 'quá hạn: ghế C phá sản');
ok(await until(() => c(B, (g) => g.state.players[2].bankrupt), 10000), 'máy B cũng thấy');

/* ================================================================ */

/* ================================================================ 8 · xoá phòng */

console.log('\n▸ 8. Lệnh quản trị xoá phòng đang chơi');
const HTTP = SERVER.replace(/^ws(s?):\/\//, 'http$1://');
const res = await fetch(`${HTTP}/admin/wipe?code=${code}`, {
  method: 'POST', headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN ?? 'test-admin'}` },
});
ok(res.ok, 'server nhận lệnh xoá', String(res.status));
for (const [p, tag] of [[A, 'A'], [B, 'B']]) {
  await p.bringToFront();
  ok(await until(() => hasTitle(p, 'Phòng đã bị xoá'), 8000), `máy ${tag} thấy "Phòng đã bị xoá"`);
}
ok(!(await c(A, (g) => g.net.ws)), 'máy khách không nối lại phòng đã xoá');
await A.locator('.scrim.show button.btn', { hasText: 'Về màn hình đầu' }).click();
ok(await until(async () => !new URL(A.url()).searchParams.get('room'), 8000), 'bấm nút thì về màn hình đầu');

await finish();
