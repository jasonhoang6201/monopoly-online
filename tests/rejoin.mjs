/**
 * Đóng tab giữa ván rồi mở lại đường mời — phải về đúng ghế cũ.
 *
 * Khác bài "rớt mạng rồi vào lại" trong `online.mjs`: ở đó tab được `reload()`
 * nên sessionStorage còn nguyên, id không đổi. Ở đây tab bị **đóng hẳn**, tức
 * là mất sessionStorage — tab mở sau phải nhận lại id cũ từ phiếu giữ ghế
 * (xem `net/identity.js`), nếu không phòng coi nó là người lạ và trả lời
 * "phòng đã đầy".
 *
 * Chạy: cần dev server ở cổng 5179
 *   npx vite --port 5179 --strictPort &
 *   node tests/rejoin.mjs
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const BASE = 'http://localhost:5179/';
const fails = [];
const errors = [];

const browser = await launchChrome();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });

function watch(page, tag) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  return page;
}

const ok = (cond, label, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(label);
};

async function until(fn, ms = 20000, step = 200) {
  const t0 = Date.now();
  for (;;) {
    if (await fn().catch(() => false)) return true;
    if (Date.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, step));
  }
}

async function bootToLobby(page) {
  await page.bringToFront();
  const mode = page.locator('.scrim.show button.btn', { hasText: 'Mở phòng online' });
  await until(async () => (await mode.count()) > 0 || (await page.locator('#lobby-link').count()) > 0, 90000);
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

console.log('\n▸ 1. Dựng một ván hai người');
const A = watch(await ctx.newPage(), 'A');
await A.goto(BASE, { waitUntil: 'domcontentloaded' });
await bootToLobby(A);
const link = await A.locator('#lobby-link').inputValue();
await A.locator('.lobby-seat.is-me input.lobby-name').fill('Bảy Viễn');
await A.locator('.lobby-seat.is-me .lobby-ready').click();

const B = await enter(link, 'Cô Ba', 'B');
await A.bringToFront();
await until(async () => (await A.locator('.lobby-seat').count()) === 2, 25000);
await until(async () => !(await A.locator('#lobby-start').isDisabled()), 25000);
await A.locator('#lobby-start').click();
ok(await until(async () => (await A.locator('.pcard').count()) === 2, 60000), 'ván hai người dựng xong');
ok(!!(await playRollOff([A, B])), 'lắc giành quyền đi trước xong');

const seatB = await B.evaluate(() => window.__monopoly.controller.net.mySeat);
ok(seatB >= 0, 'B có ghế trong ván', `ghế ${seatB}`);

// Cho B giữ đất để biết chắc lúc vào lại là **đúng ghế cũ**, không phải ghế mới
const LOTS = [31, 34];
await A.evaluate(async ({ s, lots }) => {
  const { BOARD } = await import('/src/data/board.js');
  const st = window.__monopoly.controller.state;
  st.players[s].money += lots.reduce((n, id) => n + BOARD[id].price, 0);
  for (const id of lots) st.buy(s, id);
  window.__monopoly.controller.sync();
}, { s: seatB, lots: LOTS });
await A.waitForTimeout(700);

console.log('\n▸ 2. Đóng hẳn tab rồi mở lại đường mời');
await B.close();
// Đợi bàn bên kia kịp thấy ghế ấy vắng mặt — đây mới là lúc dễ bị trả lời "đầy"
ok(await until(async () => A.evaluate((s) => !window.__monopoly.controller.net.isSeatLive(s), seatB), 30000),
  'bàn bên kia thấy ghế ấy mất kết nối');

const B2 = watch(await ctx.newPage(), 'B2');
await B2.goto(link, { waitUntil: 'domcontentloaded' });
await B2.bringToFront();

ok(!(await until(async () => (await B2.locator('.scrim.show .modal-title').first()
  .textContent().catch(() => '') ?? '').includes('Phòng đã đầy'), 6000)),
  'không bị trả lời "phòng đã đầy"');
ok(await until(async () => B2.evaluate(() => !!window.__monopoly?.controller?.net), 60000),
  'tab mới vào thẳng ván đang chạy');
ok(await until(async () => B2.evaluate((s) => window.__monopoly.controller.net.mySeat === s, seatB), 25000),
  'về đúng ghế cũ', `ghế ${seatB}`);
ok(await until(async () => B2.evaluate(
  (l) => { const st = window.__monopoly.controller?.state; return !!st && l.every((id) => st.owner.get(id) !== undefined); },
  LOTS), 25000), 'đất vẫn thuộc về mình');
ok(!(await A.evaluate((s) => window.__monopoly.controller.state.players[s].bankrupt, seatB)),
  'vào lại trong hạn ân thì không bị tịch thu');

console.log('\n▸ 3. Tab thứ hai cùng máy vẫn là người khác');
// Ghế đang có người ngồi thì phiếu giữ ghế không được nhường — nếu không, hai
// cửa sổ trên một máy không còn chơi với nhau được nữa.
const C = watch(await ctx.newPage(), 'C');
await C.goto(link, { waitUntil: 'domcontentloaded' });
await C.bringToFront();
ok(await until(async () => {
  const t = await C.locator('.scrim.show .modal-title').first().textContent().catch(() => '');
  return (t ?? '').includes('Phòng đã đầy');
}, 30000), 'tab thứ hai là người lạ nên bị chặn ở cửa (ván đã khai cuộc)');
ok(await B2.evaluate((s) => window.__monopoly.controller.net.mySeat === s, seatB),
  'tab đang chơi không bị cướp mất ghế');

console.log('\n──────────────────────────────────────────\n');
if (errors.length) console.log(`⚠ ${errors.length} lỗi console:\n${errors.slice(0, 8).join('\n')}\n`);
console.log(fails.length ? `✗ ${fails.length} mục chưa đạt:\n  ${fails.join('\n  ')}` : '✓ Tất cả kiểm tra đều đạt');
await browser.close();
process.exit(fails.length ? 1 : 0);
