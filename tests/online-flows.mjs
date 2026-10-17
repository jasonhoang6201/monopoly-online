/**
 * Bản online: ba luồng hỏi–đáp giữa các máy mà tests/online.mjs chưa đi qua.
 *
 *   1. Giao dịch: máy A dựng đề nghị, máy B duyệt; đất thế chấp sang tay B thì
 *      câu hỏi chuộc hiện ở máy B, tiền chuộc trừ túi B.
 *   2. Học kỹ năng lúc chưa tới lượt: action `learn` chen giữa lượt người khác
 *      mà không làm lượt ấy khựng.
 *   3. Hội Đồng Hồn Ma: người đã phá sản bầu thẻ từ máy của mình.
 *
 * Chạy: npm run server:test, npx vite --port 5179 --strictPort, rồi
 *   node tests/online-flows.mjs
 */
import { pickTradeTiles } from './boardpick.mjs';
import {
  ok, until, c, sameBoard, settle, driver, playTurn, patch, openTable, finish,
} from './onlinekit.mjs';

const pages = await openTable(['Bảy Viễn', 'Cô Ba Trà', 'Năm Cam'], {
  timing: { turnMs: 90000, awayMs: 90000, skipMs: 90000, tradeMs: 90000, askMs: 90000 },
});
ok(pages.length === 3, 'bàn ba máy đã khai cuộc');
const seatOf = (p) => c(p, (g) => g.net.mySeat);
const money = (p, seat) => c(p, (g, s) => g.state.players[s].money, seat);

/* ================================================================ 1 · giao dịch */

console.log('\n▸ 1. Giao dịch giữa hai máy');
await sameBoard(pages);
const D = await driver(pages);
const dSeat = await seatOf(D);
const P = pages.find((p) => p !== D);
const pSeat = await seatOf(P);
const GIVE = 16;
const GET = 18;
// Dọn hai ô cho chắc rồi chia: D giữ GIVE (đang thế chấp), P giữ GET
await patch(D, (st, a) => {
  for (const t of [a.give, a.get]) { st.owner.delete(t); st.mortgaged.delete(t); st.houses.delete(t); }
  st.buy(a.d, a.give);
  st.buy(a.p, a.get);
  st.mortgage(a.d, a.give);
}, { d: dSeat, p: pSeat, give: GIVE, get: GET });
ok(await until(() => c(D, (g, a) => g.state.owner.get(a.give) === a.d && g.state.mortgaged.has(a.give),
  { d: dSeat, give: GIVE }), 10000), 'server nhận ván đã chia đất');
await settle(D, 15000);

await D.bringToFront();
await D.locator('#actions button[data-key="t"]').click();
await D.locator(`.scrim.show .pick[data-id="${pSeat}"]`).click();
await pickTradeTiles(D, 'mine', [GIVE]);
await pickTradeTiles(D, 'theirs', [GET]);
await D.locator('.scrim.show button.btn', { hasText: 'Gửi đề nghị' }).click();

await P.bringToFront();
const review = P.locator('.scrim.show button.btn', { hasText: 'Đồng ý giao dịch' });
ok(await until(async () => (await review.count()) > 0, 20000), 'hộp duyệt mở ở máy người nhận');
const others = pages.filter((p) => p !== P);
const strayReview = await Promise.all(others.map((p) => p.locator('.scrim.show button.btn', { hasText: 'Đồng ý giao dịch' }).count()));
ok(strayReview.every((n) => n === 0), 'không máy nào khác được hỏi duyệt');
await review.click();

const swapped = (p) => c(p, (g, a) => g.state.owner.get(a.give) === a.p && g.state.owner.get(a.get) === a.d,
  { d: dSeat, p: pSeat, give: GIVE, get: GET });
ok(await until(async () => (await Promise.all(pages.map(swapped))).every(Boolean), 20000),
  'đất đổi chủ trên cả ba máy');

const redeem = P.locator('.scrim.show button.btn', { hasText: 'Chuộc hết' });
ok(await until(async () => (await redeem.count()) > 0, 20000), 'câu hỏi chuộc hiện ở máy chủ mới');
ok(await D.locator('.scrim.show button.btn', { hasText: 'Chuộc hết' }).count() === 0,
  'máy người dựng giao dịch không bị hỏi thay');
const dCash = await money(D, dSeat);
const pCash = await money(D, pSeat);
await redeem.click();
ok(await until(() => c(D, (g, t) => !g.state.mortgaged.has(t), GIVE), 20000), 'ô hết thế chấp');
ok((await money(D, dSeat)) === dCash, 'tiền chuộc không trừ túi người bán');
ok((await money(D, pSeat)) < pCash, 'mà trừ túi người mua', `${pCash} → ${await money(D, pSeat)}`);
await D.bringToFront();
ok(await until(async () => (await D.locator('#actions button:not([disabled])').count()) > 0, 20000),
  'xong giao dịch thì bên gửi có lại thanh nút');
ok((await sameBoard(pages)).same, 'ba máy khớp nhau sau giao dịch');

/* ================================================================ 2 · học ngoài lượt */

console.log('\n▸ 2. Học kỹ năng lúc chưa tới lượt');
const D2 = await driver(pages);
const L = pages.find((p) => p !== D2);
const lSeat = await seatOf(L);
await patch(D2, (st) => { for (const p of st.players) p.skillPoints = Math.max(p.skillPoints, 3); });
await until(() => c(L, (g, s) => g.state.players[s].skillPoints >= 3, lSeat), 10000);
const turnBefore = await c(D2, (g) => [g.state.turn, g.state.turnNo].join(':'));
const skillId = await L.evaluate(async () => (await import('/src/data/skills.js')).SKILLS.find((s) => s.tier === 1).id);

await L.bringToFront();
await L.locator('#skill-btn').click();
await L.locator(`.st-node[data-id="${skillId}"]`).click();
const learnBtn = L.locator('[data-act="learn"]').first();
ok(await until(async () => (await learnBtn.count()) > 0 && !(await learnBtn.isDisabled()), 8000),
  'nút Học bật dù chưa tới lượt', skillId);
await learnBtn.click();
const learned = (p) => c(p, (g, a) => g.state.players[a.s].skills.includes(a.id), { s: lSeat, id: skillId });
ok(await until(async () => (await Promise.all(pages.map(learned))).every(Boolean), 15000),
  'cả ba máy thấy kỹ năng vừa học');
await L.keyboard.press('Escape');
await L.keyboard.press('Escape');
ok((await c(D2, (g) => [g.state.turn, g.state.turnNo].join(':'))) === turnBefore, 'lượt đang chạy không bị đổi');
await D2.bringToFront();
ok(await until(async () => (await D2.locator('#actions button:not([disabled])').count()) > 0, 10000),
  'người đang đi vẫn có thanh nút');
ok(await playTurn(pages), 'người đang đi đi tiếp trọn lượt');

/* ================================================================ 3 · hồn ma */

console.log('\n▸ 3. Hội Đồng Hồn Ma qua mạng');
await sameBoard(pages);
const D3 = await driver(pages);
const G = pages.find((p) => p !== D3);
const gSeat = await seatOf(G);
await patch(D3, (st, g) => {
  st.bankrupt(g);
  st.laps = 99; st.pressure = 10; st.dryTurn = false; st.ghostVote = null;
  st.settings.timing = { ...st.settings.timing, ghostMs: 15000 };
}, gSeat);
ok(await until(() => c(D3, (g, s) => g.state.players[s].bankrupt, gSeat), 10000), 'ghế hồn ma đã phá sản');
// Hộp bầu chỉ hiện hẳn ở khung hình kế tiếp: cửa sổ máy hồn ma phải đang ở trước
await G.bringToFront();
await playTurn(pages);
await G.bringToFront();
/* Thanh áp lực cao thì thẻ Thời Cuộc có thể nổ ngay cuối lượt và hỏi cả bàn
   trước; phiên bầu chỉ mở sau khi thẻ chạy xong. Trả lời hộ các hộp ấy trong
   lúc chờ (hộp bầu không phải hộp thoại nên không bị bấm nhầm). */
const ghostOpen = await until(async () => {
  for (const p of pages) {
    const b = p.locator('#modal-root .scrim.show button.btn:not([disabled])').first();
    // Hộp bầu phủ lên trên thì nút bên dưới không bấm được: đừng đứng chờ nó cả 30 giây
    if (await b.count()) await b.click({ timeout: 800 }).catch(() => {});
  }
  return (await G.locator('.gc-layer.show').count()) > 0;
}, 40000, 500);
const why = ghostOpen ? '' : await c(D3, (g) => JSON.stringify({
  pending: g.pending?.list.map((q) => q.kind), pressure: g.state.pressure, fired: g.state.eventsFired, gv: g.state.ghostVote,
}));
await G.bringToFront();
ok(ghostOpen, 'hộp bầu hiện ở máy hồn ma', why);
const strayPanel = await Promise.all(pages.filter((p) => p !== G).map((p) => p.locator('.gc-layer.show').count()));
ok(strayPanel.every((n) => n === 0), 'máy người còn chơi không có hộp bầu');
const card = await G.locator('.gc-card').first().getAttribute('data-id');
await G.locator('.gc-card').first().click();
const voted = (p) => c(p, (g, a) => g.state.ghostVote?.votes?.[a.s] === a.id, { s: gSeat, id: card });
ok(await until(async () => (await Promise.all(pages.map(voted))).every(Boolean), 10000),
  'phiếu bầu tới cả ba máy', card);
ok(await playTurn(pages), 'ván vẫn chạy trong lúc hộp bầu mở');

await finish();
