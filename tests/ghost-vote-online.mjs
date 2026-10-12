/**
 * Hội Đồng Hồn Ma trên bản online: ba máy, một người phá sản.
 *
 * Canh ba chỗ chỉ bản nhiều máy mới có: hộp bầu chỉ hiện ở máy của hồn ma,
 * phiếu từ máy hồn ma về được máy cầm lái và đi vào ảnh chụp, và máy cầm lái
 * **đổi người** sau khi bầu (lượt đã trao) vẫn rút đúng thẻ được bầu.
 *
 * Chạy: cần dev server ở cổng 5179
 *   node tests/ghost-vote-online.mjs
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const BASE = 'http://localhost:5179/';
const errors = [];
const fails = [];

const browser = await launchChrome();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });

function watch(page, tag) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  return page;
}
const ok = (cond, label, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(label);
};
async function until(fn, ms = 15000, step = 200) {
  const t0 = Date.now();
  for (;;) {
    if (await fn().catch(() => false)) return true;
    if (Date.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, step));
  }
}
async function bootToLobby(page, ms = 90000) {
  await page.bringToFront();
  const mode = page.locator('.scrim.show button.btn', { hasText: 'Mở phòng online' });
  await until(async () => (await mode.count()) > 0 || (await page.locator('#lobby-link').count()) > 0, ms);
  if (await mode.count()) await mode.click();
  await page.locator('#lobby-link').waitFor({ timeout: 30000 });
}

/* ============================================================ vào ván */

console.log('\n▸ 1. Ba máy vào ván');
const A = watch(await ctx.newPage(), 'A');
await A.goto(BASE, { waitUntil: 'domcontentloaded' });
await bootToLobby(A);
const link = await A.locator('#lobby-link').inputValue();
await A.locator('.lobby-seat.is-me input.lobby-name').fill('Bảy Viễn');
await A.locator('.lobby-seat.is-me .lobby-ready').click();
const pages = [A];
for (const [tag, name] of [['B', 'Cô Ba'], ['C', 'Năm Cam']]) {
  const p = watch(await ctx.newPage(), tag);
  await p.goto(link, { waitUntil: 'domcontentloaded' });
  await bootToLobby(p);
  await p.locator('.lobby-seat.is-me input.lobby-name').fill(name);
  await p.locator('.lobby-seat.is-me .lobby-ready').click();
  pages.push(p);
}
await A.bringToFront();
await until(async () => !(await A.locator('#lobby-start').isDisabled()), 30000);
await A.locator('#lobby-start').click();
for (const p of pages) {
  await p.bringToFront();
  await until(async () => p.evaluate(() => !!window.__monopoly?.controller?.state), 60000);
}
await playRollOff(pages);
ok(await until(() => A.evaluate(() => !!window.__monopoly.controller.state.order)), 'ván ba máy đã lắc xong');

const seatOf = (p) => p.evaluate(() => window.__monopoly.controller.net.mySeat);
async function driver() {
  for (let i = 0; i < 60; i++) {
    for (const p of pages) {
      if (await p.evaluate(() => {
        const c = window.__monopoly.controller;
        return c.isDriver() && !c.busy && !c.state.players[c.state.turn].bankrupt;
      })) return p;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

/* ============================================================ phiên họp */

console.log('\n▸ 2. Người phá sản thấy hộp bầu, người còn sống thì không');
const D1 = await driver();
ok(!!D1, 'tìm được máy cầm lái');
const d1Seat = await seatOf(D1);
// Hồn ma: máy không cầm lái đầu tiên
const G = pages.find((p) => p !== D1);
const ghostSeat = await seatOf(G);
const alive = pages.filter((p) => p !== G);
await D1.bringToFront();
await D1.evaluate((g) => {
  const c = window.__monopoly.controller;
  const s = c.state;
  c.ghosts.ms = 9000;
  s.bankrupt(g);
  s.laps = 99; s.pressure = 10; s.dryTurn = false;
  c.sync();
  c.guard(() => c.endTurn());
}, ghostSeat);

await G.bringToFront();
ok(await until(() => G.locator('.gc-layer.show').isVisible(), 12000), 'hộp bầu hiện ở máy hồn ma');
ok(await G.locator('.gc-seat').count() === 0, 'bản online không có hàng chọn hồn ma');
for (const p of alive) {
  ok(await p.locator('#ghost-council').count() === 0, `máy người còn sống (ghế ${await seatOf(p)}) không có hộp bầu`);
}
ok(await until(() => alive[0].locator('#broadcast .bcast', { hasText: 'HỘI ĐỒNG HỒN MA' }).count().then((n) => n > 0), 5000)
  || await until(() => alive[1].locator('#broadcast .bcast', { hasText: 'HỘI ĐỒNG HỒN MA' }).count().then((n) => n > 0), 5000),
'người còn sống thấy dòng báo hồn ma đang bầu');

const picked = await G.locator('.gc-card').nth(1).getAttribute('data-id');
await G.locator('.gc-card').nth(1).click();
ok(await G.locator('.gc-card.mine').count() === 1, 'máy hồn ma đóng dấu thẻ vừa bầu');

// Lượt đã trao: máy cầm lái giờ là người khác — phiếu phải tới được đó
const D2 = await driver();
ok(!!D2 && D2 !== G, 'lượt đã trao cho người còn sống');
ok(await until(() => D2.evaluate((s) => window.__monopoly.controller.state.ghostVote?.votes?.[s], ghostSeat)
  .then((v) => v === picked)), 'phiếu về tới máy cầm lái', picked);
ok(await until(() => Promise.all(alive.map((p) => p.evaluate((s) => window.__monopoly.controller.state.ghostVote?.votes?.[s], ghostSeat)))
  .then((vs) => vs.every((v) => v === picked))), 'mọi máy còn sống đều có phiếu trong ảnh chụp');
ok(await until(() => G.locator('#ghost-council').count().then((n) => n === 0), 14000), 'hết giờ hộp tự đóng ở máy hồn ma');

/* ============================================================ thẻ ra theo phiếu */

console.log('\n▸ 3. Máy cầm lái mới rút theo phiếu');
const D3 = await driver();
await D3.bringToFront();
const usable = await D3.evaluate(async (id) => {
  const c = window.__monopoly.controller;
  const s = c.state;
  const E = await import('/src/core/events.js');
  const { GHOST_VOTE, EVENT_BY_ID } = await import('/src/data/events.js');
  GHOST_VOTE.perVote = 1e9;
  const can = E.usable(s, EVENT_BY_ID[id]);
  /* Thẻ hỏi chủ đất (động đất, hoả hoạn) kéo dài bài kiểm: thẻ được bầu mà
     phải hỏi ai thì đổi phiếu sang Hội Chợ, phần cần kiểm vẫn là phiếu đã đi
     qua đường truyền. */
  if (!['hoi-cho', 'quy-cong-phat-chan', 'lam-phat', 'mat-mua', 'bao-gia', 'gioi-nghiem', 'mo-duong'].includes(id) || !can) {
    s.ghostVote.cards[1] = 'hoi-cho';
    for (const k of Object.keys(s.ghostVote.votes)) s.ghostVote.votes[k] = 'hoi-cho';
  }
  s.pressure = 999;
  c.guard(() => c.endTurn());
  return s.ghostVote.votes;
}, picked);
const want = Object.values(usable)[0];
for (const p of pages) {
  await p.bringToFront();
  ok(await until(() => p.locator('.event-card .ev-ghost').isVisible(), 20000),
    `máy ghế ${await seatOf(p)} thấy thẻ ghi "Hội Đồng Hồn Ma bầu thẻ này"`);
}
const fired = await D3.evaluate(() => window.__monopoly.controller.state.eventTally);
ok(fired?.[want] === 1, 'thẻ nổ đúng thẻ được bầu', JSON.stringify(fired));
await G.bringToFront();
ok(await until(() => G.locator('.gc-layer.show').isVisible(), 20000), 'nổ xong, máy hồn ma có phiên họp mới');

await browser.close();
console.log(`\nLỗi console: ${errors.length ? errors.join('\n') : 'không có'}`);
if (errors.length) fails.push('lỗi console');
console.log(fails.length ? `\n✗ ${fails.length} mục hỏng: ${fails.join('; ')}` : '\n✓ Hội Đồng Hồn Ma online: tất cả đều ổn');
process.exit(fails.length ? 1 : 0);
