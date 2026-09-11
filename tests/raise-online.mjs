/**
 * Xoay tiền khi **con nợ không phải người đang đi** — bản online, hai máy.
 *
 * Thẻ "mỗi người góp tiền mừng", phiên đấu giá, cưỡng chiếm đất: mấy nước ấy
 * bắt một người khác móc ví, mà luật thì chạy dưới tay người đang đi. Bảng
 * quản lý tài sản phải mở ở **máy của con nợ**, không bày đất người ta ra trước
 * mặt người đang cầm lái.
 *   1. Hộp "THIẾU TIỀN" hiện ở máy con nợ, máy người đang đi không thấy gì.
 *   2. Bảng quản lý chỉ liệt kê đất mang tên con nợ.
 *   3. Con nợ thế chấp xong thì ván gốc bên kia cũng đổi theo, chủ nợ nhận đủ.
 *   4. Con nợ để hết giờ → ngân hàng cấn nợ hộ trên ván gốc.
 *
 * Chạy: cần dev server ở cổng 5179
 *   npx vite --port 5179 --strictPort &
 *   node tests/raise-online.mjs
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

const seatOf = (page) => page.evaluate(() => window.__monopoly.controller.net.mySeat);
const moneyOf = (page, seat) => page.evaluate(
  (s) => window.__monopoly.controller.state.players[s].money, seat);
const mortgagedOn = (page) => page.evaluate(
  () => [...window.__monopoly.controller.state.mortgaged].sort((a, b) => a - b));
/** Chữ ở dòng nhỏ trên đầu mọi hộp thoại đang mở. */
const eyebrows = (page) => page.evaluate(
  () => [...document.querySelectorAll('.scrim.show .modal-eyebrow')].map((e) => e.textContent.trim()));

/* ---------------------------------------------------------------- mở phòng */

console.log('\n▸ Mở phòng hai máy');
const A = watch(await ctx.newPage(), 'A');           // người đang đi, cầm lái
await A.goto(BASE, { waitUntil: 'domcontentloaded' });
await bootToLobby(A);
const link = await A.locator('#lobby-link').inputValue();
await A.locator('.lobby-seat.is-me input.lobby-name').fill('Bảy Viễn');
await A.locator('.lobby-seat.is-me .lobby-ready').click();

const B = watch(await ctx.newPage(), 'B');           // con nợ, ngồi máy khác
await B.goto(link, { waitUntil: 'domcontentloaded' });
await bootToLobby(B);
await B.locator('.lobby-seat.is-me input.lobby-name').fill('Cô Ba');
await B.locator('.lobby-seat.is-me .lobby-ready').click();

await A.bringToFront();
await until(async () => (await A.locator('.lobby-seat').count()) === 2, 30000);
await until(async () => !(await A.locator('#lobby-start').isDisabled()), 30000);
await A.locator('#lobby-start').click();

await until(async () => (await A.locator('#actions, .scrim.show').count()) > 0, 60000);
await playRollOff([A, B]);
for (const p of [A, B]) {
  await p.bringToFront();
  await until(async () => p.evaluate(() => !!window.__monopoly?.controller?.state?.order), 60000);
}

const sa = await seatOf(A);
const sb = await seatOf(B);
console.log(`  ghế: Bảy Viễn=${sa} · Cô Ba=${sb}`);

/**
 * Dựng cảnh trên máy cầm lái rồi bắt con nợ trả tiền.
 * Đất của con nợ: ô 37 (thế chấp 175) và 39 (thế chấp 200).
 * Đất của người đang đi: ô 1 — để xem bảng quản lý bên kia có lẫn vào không.
 */
async function stage(amount, cashB) {
  await A.bringToFront();
  await A.evaluate(([mine, other, owed, cash]) => {
    const c = window.__monopoly.controller;
    const s = c.state;
    s.turn = mine;
    s.debt = null;
    s.owner.clear(); s.houses.clear(); s.mortgaged.clear();
    s.players[mine].money = 500;
    s.players[other].money = cash;
    s.owner.set(37, other); s.owner.set(39, other);
    s.owner.set(1, mine);
    c.hud.refresh(); c.scene.refresh(s); c.sync();
    c.guard(() => c.payPlayer(other, mine, owed));
  }, [sa, sb, amount, cashB]);
}

/* ====== 1–3. CON NỢ TỰ THẾ CHẤP TRÊN MÁY MÌNH ====== */
console.log('\n▸ 1. Hộp "thiếu tiền" mở ở máy con nợ, không ở máy người đang đi');
await stage(200, 50);

await B.bringToFront();
ok(await until(async () => (await eyebrows(B)).includes('THIẾU TIỀN'), 30000),
  'máy con nợ thấy hộp "THIẾU TIỀN"', (await eyebrows(B)).join(' | ') || 'không có hộp nào');

await A.bringToFront();
const onA = await eyebrows(A);
ok(!onA.includes('THIẾU TIỀN') && !onA.includes('QUẢN LÝ TÀI SẢN'),
  'máy người đang đi không mở hộp xoay tiền của người khác', onA.join(' | ') || 'không có hộp nào');

console.log('\n▸ 2. Bảng quản lý bên con nợ chỉ liệt kê đất của chính họ');
await B.bringToFront();
await B.locator('.scrim.show button.btn', { hasText: 'Bán nhà / Thế chấp' }).first().click();
await B.locator('#mg-body').waitFor({ timeout: 20000 });
const listed = await B.evaluate(() => [...new Set(
  [...document.querySelectorAll('#mg-body [data-act]')].map((b) => +b.dataset.tile))].sort((a, b) => a - b));
ok(JSON.stringify(listed) === JSON.stringify([37, 39]),
  'bảng quản lý đúng hai ô của con nợ, không có ô của người đang đi', `[${listed}]`);

const mgOnA = await eyebrows(A);
ok(!mgOnA.includes('QUẢN LÝ TÀI SẢN'),
  'máy người đang đi vẫn không thấy bảng quản lý nào');

console.log('\n▸ 3. Thế chấp xong thì ván gốc bên kia đổi theo');
await B.locator('#mg-body [data-act="mortgage"][data-tile="39"]').click();
await B.locator('.scrim.show button.btn', { hasText: 'Xong' }).first().click();

await A.bringToFront();
ok(await until(async () => (await mortgagedOn(A)).includes(39), 30000),
  'máy cầm lái ghi nhận ô 39 đã thế chấp', `[${await mortgagedOn(A)}]`);
ok(await until(async () => (await moneyOf(A, sa)) === 700, 30000),
  'chủ nợ nhận đủ 200$', `${await moneyOf(A, sa)}$`);
ok(await until(async () => (await moneyOf(A, sb)) === 50, 20000),
  'con nợ còn 50$ (50 + 200 thế chấp − 200 trả nợ)', `${await moneyOf(A, sb)}$`);
ok(await until(async () => (await A.evaluate(() => window.__monopoly.controller.state.debt)) === null, 20000),
  'khoản nợ đã xoá khỏi trạng thái');
// Máy con nợ nhận lại ảnh chụp, không tự đi một đường riêng
ok(await until(async () => (await mortgagedOn(B)).includes(39), 30000),
  'máy con nợ thấy đúng ván gốc sau khi đồng bộ', `[${await mortgagedOn(B)}]`);

/* ====== 4. CON NỢ ĐỂ HẾT GIỜ → NGÂN HÀNG CẤN NỢ HỘ ====== */
console.log('\n▸ 4. Con nợ ngồi im, hết giờ thì ngân hàng cấn nợ hộ');
await A.bringToFront();
await A.evaluate(() => { window.__monopoly.controller.raiseMs = 4000; });
await until(async () => A.evaluate(() => !window.__monopoly.controller.busy), 30000);
await stage(150, 20);

ok(await until(async () => (await mortgagedOn(A)).length > 0, 40000),
  'ngân hàng thế chấp hộ để thu đủ', `[${await mortgagedOn(A)}]`);
ok(await until(async () => (await moneyOf(A, sa)) === 650, 40000),
  'chủ nợ vẫn nhận đủ 150$ dù con nợ không bấm gì', `${await moneyOf(A, sa)}$`);

console.log(`\n=== KẾT QUẢ: ${fails.length === 0 ? 'ĐẠT' : 'HỎNG ' + fails.length} ===`);
for (const f of fails) console.log('  ✗ ' + f);
console.log(`=== LỖI TRANG (${errors.length}) ===`);
for (const e of errors.slice(0, 10)) console.log(e);
await browser.close();
process.exit(fails.length === 0 ? 0 : 1);
