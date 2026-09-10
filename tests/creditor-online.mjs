/**
 * Chủ nợ có nhận được tiền không — **bản online, hai máy**.
 *
 * Bản một máy đã có `creditor-paid.mjs` lo. Bộ này soi đúng những chỗ chỉ bản
 * online mới có: khoản tiền do máy con nợ tính ra, chủ đất ngồi máy khác chỉ
 * thấy nó qua ảnh chụp trạng thái.
 *   1. Con nợ vỡ nợ ngay trên máy mình → máy chủ đất phải thấy tiền vào.
 *   2. Con nợ tải lại trang giữa lúc đang nợ → khoản nợ được đòi tiếp, chứ
 *      không phải cứ nối lại máy là thoát.
 *   3. Con nợ tắt máy luôn, trọng tài tịch thu → chủ đất vẫn phải được trả.
 *
 * Chạy: cần dev server ở cổng 5179
 *   npx vite --port 5179 --strictPort &
 *   node tests/creditor-online.mjs
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const BASE = 'http://localhost:5179/';
const errors = [];
const fails = [];
const ok = (cond, label, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(label);
};

const browser = await launchChrome();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });

function watch(page, tag) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  return page;
}

async function until(fn, ms = 20000, step = 250) {
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

async function enter(url, name, tag) {
  const page = watch(await ctx.newPage(), tag);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await bootToLobby(page);
  await page.locator('.lobby-seat.is-me input.lobby-name').fill(name);
  await page.locator('.lobby-seat.is-me .lobby-ready').click();
  return page;
}

/** Chờ một máy chạy xong chuỗi hiệu ứng — `guard` bỏ qua lời gọi lúc còn bận. */
const idleOn = (page, ms = 60000) => until(async () => (
  await page.evaluate(() => !window.__monopoly.controller.busy)
  && (await page.locator('.scrim.show').count()) === 0), ms);

const seatOf = (page) => page.evaluate(() => window.__monopoly.controller.net.mySeat);
const moneyOf = (page, seat) => page.evaluate(
  (s) => window.__monopoly.controller.state.players[s].money, seat);
const bankruptOf = (page, seat) => page.evaluate(
  (s) => window.__monopoly.controller.state.players[s].bankrupt, seat);

/* ---------------------------------------------------------------- mở phòng */

console.log('\n▸ Mở phòng hai máy');
const A = watch(await ctx.newPage(), 'A');           // chủ đất
await A.goto(BASE, { waitUntil: 'domcontentloaded' });
await bootToLobby(A);
const link = await A.locator('#lobby-link').inputValue();
await A.locator('.lobby-seat.is-me input.lobby-name').fill('Bảy Viễn');
await A.locator('.lobby-seat.is-me .lobby-ready').click();

const B = await enter(link, 'Cô Ba', 'B');           // con nợ
/* Máy thứ ba chỉ ngồi cho đủ người: bỏ con nợ ra khỏi ván mà chỉ còn hai máy
   thì ván kết thúc ngay, mà ván đã kết thúc thì `checkAbsent` không tịch thu
   ai nữa — phần 2 sẽ không có gì để xem. */
const C = await enter(link, 'Chú Hoả', 'C');
await A.bringToFront();
await until(async () => (await A.locator('.lobby-seat').count()) === 3, 30000);
await until(async () => !(await A.locator('#lobby-start').isDisabled()), 30000);
await A.locator('#lobby-start').click();

await until(async () => (await A.locator('#actions, .scrim.show').count()) > 0, 60000);
await playRollOff([A, B, C]);
for (const p of [A, B, C]) {
  await p.bringToFront();
  await until(async () => p.evaluate(() => !!window.__monopoly?.controller?.state?.order), 60000);
}

const sa = await seatOf(A);
const sb = await seatOf(B);
console.log(`  ghế: Bảy Viễn=${sa} · Cô Ba=${sb}`);

/* =========== 1. CON NỢ VỠ NỢ TRÊN MÁY MÌNH → MÁY CHỦ ĐẤT THẤY TIỀN =========== */
console.log('\n▸ 1. Con nợ bấm "Chấp nhận" vỡ nợ trên máy mình');
await B.bringToFront();
await B.evaluate(([mine, land]) => {
  const c = window.__monopoly.controller;
  const s = c.state;
  s.turn = mine;                       // máy con nợ cầm lái, như lúc đạp phải nhà người ta
  s.owner.clear(); s.houses.clear(); s.mortgaged.clear();
  s.players[land].money = 1000;
  s.players[mine].money = 20;          // không đất, không nhà → chắc chắn vỡ nợ
  c.hud.refresh(); c.scene.refresh(s);
  c.guard(() => c.payPlayer(mine, land, 400));
}, [sb, sa]);

await B.locator('.scrim.show button.btn-danger').first().waitFor({ timeout: 20000 });
await B.locator('.scrim.show button.btn-danger').first().click();
await B.waitForTimeout(8000);

await A.bringToFront();
ok(await until(async () => await bankruptOf(A, sb), 30000), 'máy chủ đất thấy con nợ đã phá sản');
ok(await until(async () => (await moneyOf(A, sa)) === 1400, 30000),
  'máy chủ đất thấy đủ 400$ tiền thuê', `${await moneyOf(A, sa)}$`);

/* ====== 2. CON NỢ TẢI LẠI TRANG GIỮA LÚC ĐANG NỢ → ĐÒI TIẾP ====== */
console.log('\n▸ 2. Con nợ tải lại trang giữa lúc đang nợ');
await B.bringToFront();
await idleOn(B);
let revA = await A.evaluate(() => window.__monopoly.controller.state.rev);
await B.evaluate((r) => { window.__monopoly.controller.state.rev = r + 5; }, revA);
await B.evaluate(([mine, land]) => {
  const c = window.__monopoly.controller;
  const s = c.state;
  s.turn = mine;
  s.players[mine].bankrupt = false;
  s.players[mine].money = 20;
  s.players[land].money = 1000;
  s.owner.clear(); s.houses.clear(); s.mortgaged.clear();
  c.hud.refresh(); c.scene.refresh(s); c.scene.placeTokens();
  c.sync();
  c.guard(() => c.payPlayer(mine, land, 250));
}, [sb, sa]);

await B.locator('.scrim.show button.btn-danger').first().waitFor({ timeout: 20000 });
await B.reload({ waitUntil: 'domcontentloaded' });   // sessionStorage còn nguyên → về đúng ghế cũ
await until(async () => B.evaluate(() => !!window.__monopoly?.controller?.state), 60000);

// Vào lại là hộp thoại vỡ nợ bày ra lại, chứ không phải thanh nút đi tiếp
ok(await until(async () => (await B.locator('.scrim.show button.btn-danger').count()) > 0, 60000),
  'vào lại thì khoản nợ được đòi tiếp chứ không bỏ qua');
await B.locator('.scrim.show button.btn-danger').first().click();

await A.bringToFront();
ok(await until(async () => (await moneyOf(A, sa)) === 1250, 60000),
  'chủ đất nhận đủ 250$ sau khi con nợ vào lại rồi vỡ nợ', `${await moneyOf(A, sa)}$`);

/* ====== 3. CON NỢ TẮT MÁY GIỮA LÚC ĐANG NỢ → TRỌNG TÀI TỊCH THU ====== */
console.log('\n▸ 3. Con nợ tắt máy giữa lúc hộp thoại vỡ nợ còn mở');
// Hạ hạn ân xuống vài giây để khỏi chờ hai phút
await A.evaluate(() => { window.__monopoly.controller.awayGraceMs = 4000; });
await B.bringToFront();
await idleOn(B);
/* Máy A đã tự đẩy ván đi tiếp sau khi B phá sản ở phần 1, nên `rev` bên A có
   thể đang cao hơn bên B — ảnh chụp thấp hơn sẽ bị A bỏ qua. Nâng `rev` của B
   lên trên rồi mới dựng cảnh. */
revA = await A.evaluate(() => window.__monopoly.controller.state.rev);
await B.evaluate((r) => { window.__monopoly.controller.state.rev = r + 5; }, revA);
await B.evaluate(([mine, land]) => {
  const c = window.__monopoly.controller;
  const s = c.state;
  s.turn = mine;
  s.players[mine].bankrupt = false;
  s.players[mine].money = 20;
  s.players[land].money = 1000;
  s.owner.clear(); s.houses.clear(); s.mortgaged.clear();
  c.hud.refresh(); c.scene.refresh(s); c.scene.placeTokens();
  c.sync();
  c.guard(() => c.payPlayer(mine, land, 300));
}, [sb, sa]);

// Chờ hộp thoại vỡ nợ bày ra rồi tắt tab — khoản nợ treo lại giữa chừng
await B.locator('.scrim.show button.btn-danger').first().waitFor({ timeout: 20000 });
await B.close();

await A.bringToFront();
ok(await until(async () => (await A.evaluate(() => window.__monopoly.controller.state.debt)) !== null, 20000),
  'máy chủ đất nhận được khoản nợ đang treo');
const evicted = await until(async () => await bankruptOf(A, sb), 60000);
if (!evicted) {
  // Không tịch thu được thì in ra vì sao — mấy điều kiện của `checkAbsent`
  console.log('  ↳ trạng thái máy A: ' + JSON.stringify(await A.evaluate((seat) => {
    const c = window.__monopoly.controller;
    return {
      isArbiter: c.net.isArbiter, awayFor: c.net.awayFor(seat), grace: c.awayGraceMs,
      busy: c.busy, linkLost: c.net.linkLost, turn: c.state.turn, debt: c.state.debt,
    };
  }, sb)));
}
ok(evicted, 'trọng tài tịch thu người mất kết nối');
// Tiền vào sau chuỗi hiệu ứng tịch thu, nên chờ chứ đừng đọc ngay
const paid = await until(async () => (await moneyOf(A, sa)) === 1300, 40000);
ok(paid, 'chủ đất vẫn nhận đủ 300$ dù con nợ tắt máy giữa chừng', `${await moneyOf(A, sa)}$`);

console.log(`\n=== KẾT QUẢ: ${fails.length === 0 ? 'ĐẠT' : 'HỎNG ' + fails.length} ===`);
for (const f of fails) console.log('  ✗ ' + f);
console.log(`=== LỖI TRANG (${errors.length}) ===`);
for (const e of errors.slice(0, 10)) console.log(e);
await browser.close();
process.exit(fails.length === 0 ? 0 : 1);
