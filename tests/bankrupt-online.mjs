/**
 * Phá sản giữa lượt trên bản online: ba máy, người đang tới lượt vỡ nợ.
 *
 * Canh lỗi "loạn điều khiển": `doBankrupt` phát ảnh chụp lúc `turn` còn trỏ vào
 * người vừa vỡ nợ, máy họ còn diễn pháo hoa rồi mới tự `endTurn`. Trọng tài
 * từng nhận lái ngay ở nhịp ấy, nên hai máy cùng trao lượt (lượt nhảy hai nấc)
 * và có máy bày ra thanh nút của người khác, bấm được luôn.
 *
 * Chạy: cần dev server ở cổng 5179
 *   node tests/bankrupt-online.mjs
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
        return c.isDriver() && !c.busy && c.state.turn === c.net.mySeat;
      })) return p;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}
const actionCount = (p) => p.locator('#actions button').count();

// Người tới lượt không được là trọng tài: trọng tài mới là máy từng nhận lái nhầm
const arbiter = await A.evaluate(() => window.__monopoly.controller.net.arbiterSeat);
let D = await driver();
for (let i = 0; i < 3 && D && await seatOf(D) === arbiter; i++) {
  await D.evaluate(() => { const c = window.__monopoly.controller; c.guard(() => c.endTurn()); });
  await new Promise((r) => setTimeout(r, 1500));
  D = await driver();
}
ok(!!D && await seatOf(D) !== arbiter, 'lượt đang ở một ghế không phải trọng tài');
const dSeat = await seatOf(D);
const others = [];
for (const p of pages) if (p !== D) others.push(p);

/* ============================================================ nút cũ */

console.log('\n▸ 2. Thanh nút còn đó mà lượt đã trao đi');
await D.bringToFront();
const stale = await D.evaluate(async (seat) => {
  const c = window.__monopoly.controller;
  const s = c.state;
  const before = document.querySelectorAll('#actions button').length;
  // Giả lập ảnh chụp đã trao lượt đi trong lúc thanh nút vẫn nằm đó
  const next = s.playOrder.find((i) => i !== seat && !s.players[i].bankrupt);
  s.turn = next;
  const roll = [...document.querySelectorAll('#actions button')].find((b) => b.dataset.key === 'r');
  roll?.click();
  await new Promise((r) => setTimeout(r, 400));
  const res = {
    before,
    rolled: s.rolled,
    modal: !!document.querySelector('#modal-root .scrim'),
    after: document.querySelectorAll('#actions button').length,
    tried: !!roll,
  };
  // Trả lượt về như cũ: máy này vẫn là máy cầm lái thật
  s.turn = seat;
  c.beginTurn();
  return res;
}, dSeat);
ok(stale.tried && stale.before > 0, 'máy cầm lái có nút Lắc', JSON.stringify(stale));
ok(!stale.rolled && !stale.modal, 'bấm nút cũ không lắc, không mở hộp thoại của người khác');
ok(stale.after === 0, 'bấm nút cũ thì thanh nút được dọn');
for (const p of others) {
  const n = await p.evaluate(() => {
    window.__monopoly.controller.restoreActions();
    return document.querySelectorAll('#actions button').length;
  });
  ok(n === 0, `máy ghế ${await seatOf(p)} gọi restoreActions ngoài lượt mình: không bày nút`, `${n} nút`);
}

/* ============================================================ phá sản */

console.log('\n▸ 3. Người đang tới lượt phá sản');
const t0 = await D.evaluate(() => window.__monopoly.controller.state.turnNo);
await D.evaluate((seat) => {
  const c = window.__monopoly.controller;
  // Đúng đường của nút Phá sản, bỏ hộp xác nhận
  c.guard(async () => {
    await c.doBankrupt(seat);
    if (c.checkGameOver()) { c.sync(); return; }
    await c.endTurn();
  });
}, dSeat);

// Suốt lúc máy người phá sản còn diễn, không máy nào khác được nhận lái
const bad = [];
const tEnd = Date.now() + 4000;
while (Date.now() < tEnd) {
  for (const p of others) {
    const r = await p.evaluate((seat) => {
      const c = window.__monopoly.controller;
      if (c.state.turn !== seat) return null;
      return { driver: c.isDriver(), btn: document.querySelectorAll('#actions button').length };
    }, dSeat);
    if (r && (r.driver || r.btn)) bad.push(`ghế ${await seatOf(p)}: ${JSON.stringify(r)}`);
  }
  await new Promise((r) => setTimeout(r, 200));
}
ok(bad.length === 0, 'máy khác không nhận lái lượt của người đang phá sản', bad.slice(0, 3).join('; '));

ok(await until(() => Promise.all(pages.map((p) => p.evaluate((s) => window.__monopoly.controller.state.turn !== s, dSeat)))
  .then((xs) => xs.every(Boolean)), 20000), 'lượt đã trao cho người còn sống trên mọi máy');
await new Promise((r) => setTimeout(r, 1500));
const after = await Promise.all(pages.map((p) => p.evaluate(() => {
  const c = window.__monopoly.controller;
  return { seat: c.net.mySeat, turn: c.state.turn, turnNo: c.state.turnNo,
    driver: c.isDriver(), btn: document.querySelectorAll('#actions button').length };
})));
ok(after.every((x) => x.turnNo === t0 + 1), 'lượt chỉ nhích đúng một nấc', JSON.stringify(after.map((x) => x.turnNo)));
ok(after.every((x) => x.turn === after[0].turn), 'mọi máy cùng thấy một người tới lượt');
const drivers = after.filter((x) => x.driver);
ok(drivers.length === 1 && drivers[0].seat === drivers[0].turn, 'đúng một máy cầm lái, là máy của người tới lượt', JSON.stringify(after));
ok(after.filter((x) => x.seat !== x.turn).every((x) => x.btn === 0), 'máy ngồi xem không có thanh nút');
ok(await until(() => actionCount(pages.find((p, i) => after[i].seat === after[i].turn)).then((n) => n > 0)),
  'máy người tới lượt có thanh nút');

await browser.close();
console.log(`\nLỗi console: ${errors.length ? errors.join('\n') : 'không có'}`);
if (errors.length) fails.push('lỗi console');
console.log(fails.length ? `\n✗ ${fails.length} mục hỏng: ${fails.join('; ')}` : '\n✓ Phá sản online: tất cả đều ổn');
process.exit(fails.length ? 1 : 0);
