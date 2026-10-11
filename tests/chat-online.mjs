/**
 * Chat phòng online — hai tab cùng một browser context (BroadcastChannel).
 *
 * Kiểm: tin đi được từ phòng chờ, bên nhận thấy số chưa đọc và trích đoạn, tên
 * lấy từ sổ ghế, HTML trong tin không chạy, hạn mức chặn gửi dồn, và Enter gõ
 * trong khung chat không bấm nhầm nút của hộp thoại đang mở (phòng chờ).
 *
 * Phần trong ván soi những người nghe phím ở pha bắt trên `window` — chúng chạy
 * trước ô chat nên phải tự nhường: Enter gửi tin không được bấm "Học" của cây
 * kỹ năng, không được chốt phiên chọn ô trên bàn cờ.
 *
 * Chạy: cần dev server ở cổng 5179
 *   npx vite --port 5179 --strictPort &
 *   node tests/chat-online.mjs
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const SHOT = process.env.SHOT_DIR || '/tmp';
const BASE = 'http://localhost:5179/';
const errors = [];
const fails = [];

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

async function until(fn, ms = 12000, step = 200) {
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

async function send(page, text) {
  await page.locator('#chat-input, .chat-input').fill(text);
  await page.locator('.chat-input').press('Enter');
}

const msgs = (page) => page.locator('#chat-dock .chat-msg').evaluateAll(
  (els) => els.map((e) => ({ who: e.querySelector('b').textContent, text: e.querySelector('span').textContent })),
);

console.log('\n▸ 1. Hai tab vào phòng chờ');
const A = watch(await ctx.newPage(), 'A');
await A.goto(BASE, { waitUntil: 'domcontentloaded' });
await bootToLobby(A);
const link = await A.locator('#lobby-link').inputValue();
await A.locator('.lobby-seat.is-me input.lobby-name').fill('Bảy Viễn');
await A.locator('.lobby-seat.is-me .lobby-ready').click();

const B = watch(await ctx.newPage(), 'B');
await B.goto(link, { waitUntil: 'domcontentloaded' });
await bootToLobby(B);
await B.locator('.lobby-seat.is-me input.lobby-name').fill('Cô Ba Trà');
await B.locator('.lobby-seat.is-me .lobby-ready').click();
await until(async () => (await A.locator('.lobby-seat').count()) === 2);

ok(await A.locator('#chat-btn').isVisible(), 'nút chat hiện ở phòng chờ');

console.log('\n▸ 2. A gửi, B nhận');
await A.bringToFront();
await A.locator('#chat-btn').click();
ok(await A.locator('#chat-dock').isVisible(), 'bấm nút mở khung');
const lobbyTitle = await A.locator('.scrim.show .modal-title').first().textContent();
await send(A, 'Xin chào cả bàn');
await A.waitForTimeout(300);
ok((await A.locator('.scrim.show .modal-title').first().textContent()) === lobbyTitle,
  'Enter trong ô chat không bấm nút của phòng chờ');
ok((await A.locator('#lobby-link').count()) > 0, 'phòng chờ vẫn mở');
const mineA = await msgs(A);
ok(mineA.length === 1 && mineA[0].text === 'Xin chào cả bàn', 'tin của mình hiện ngay', JSON.stringify(mineA));

await B.bringToFront();
ok(await until(async () => (await B.locator('#chat-btn .chat-badge').textContent()) === '1', 5000),
  'B thấy 1 tin chưa đọc');
ok(await B.locator('#chat-peek').isVisible(), 'B thấy trích đoạn tin mới');
await B.screenshot({ path: `${SHOT}/chat-peek.png` });
await B.locator('#chat-btn').click();
const gotB = await msgs(B);
ok(gotB.length === 1 && gotB[0].who === 'Bảy Viễn' && gotB[0].text === 'Xin chào cả bàn',
  'B đọc đúng tên và nội dung', JSON.stringify(gotB));
ok(await B.locator('#chat-btn .chat-badge').isHidden(), 'mở khung thì xoá số chưa đọc');

console.log('\n▸ 3. HTML trong tin không chạy');
await send(B, '<img src=x onerror="window.__pwned=1"><b>đậm</b>');
await A.bringToFront();
await until(async () => (await msgs(A)).length === 2, 5000);
const last = (await msgs(A)).at(-1);
ok(last?.text.includes('<img'), 'thẻ HTML hiện thành chữ', last?.text);
ok(!(await A.evaluate(() => window.__pwned)), 'không có mã nào chạy');
ok(await A.locator('#chat-dock .chat-msg span b').count() === 0, 'không sinh thẻ thật');

console.log('\n▸ 4. Hạn mức gửi');
for (let i = 0; i < 6; i++) await send(A, `dồn ${i}`);
const mine = (await msgs(A)).filter((m) => m.text.startsWith('dồn'));
ok(mine.length === 4, 'chặn sau 5 tin trong 6 giây', `${mine.length} tin "dồn" lọt qua`);
ok(await A.locator('.chat-note').isVisible(), 'báo phải chờ');
await A.screenshot({ path: `${SHOT}/chat-dock.png` });

console.log('\n▸ 5. Esc đóng khung, phòng chờ vẫn còn');
await A.locator('.chat-input').press('Escape');
ok(await A.locator('#chat-dock').isHidden(), 'Esc đóng khung chat');
ok((await A.locator('#lobby-link').count()) > 0, 'Esc không đóng phòng chờ');

console.log('\n▸ 6. Vào ván, chat vẫn theo');
await A.locator('#lobby-start').click();
for (const p of [A, B]) {
  await p.bringToFront();
  await until(async () => p.evaluate(() => !!window.__monopoly?.controller?.state), 60000);
}
await playRollOff([A, B]);
ok(await A.locator('#chat-btn').isVisible(), 'nút chat còn sau khi khai cuộc');
const D = (await A.evaluate(() => window.__monopoly.controller.isDriver())) ? A : B;
const O = D === A ? B : A;
await D.bringToFront();
const before = (await msgs(D)).length;

console.log('\n▸ 7. Enter trong ô chat lúc mở thẻ kỹ năng');
await D.evaluate(() => {
  const c = window.__monopoly.controller;
  c.state.current.skillPoints = 3;
  c.hud.refresh(); c.sync(); c.restoreActions();
});
await D.locator('#actions button[data-key="k"]').click();
await D.locator('.st-node[data-id="dd1"]').click();
await D.locator('[data-act="learn"]').waitFor({ timeout: 8000 });
if (await D.locator('#chat-dock').isHidden()) await D.locator('#chat-btn').click();
await send(D, 'học hay không đây');
await D.waitForTimeout(400);
const learned = await D.evaluate(() => window.__monopoly.controller.state.current.skills.includes('dd1'));
ok(!learned, 'Enter gửi tin không bấm nút "Học"');
ok((await msgs(D)).length === before + 1, 'tin vẫn gửi đi');
await D.locator('.chat-input').press('Escape');
ok(await D.locator('#chat-dock').isHidden(), 'Esc đóng khung chat');
ok(await D.locator('[data-act="learn"]').isVisible(), 'Esc trong ô chat không đóng thẻ kỹ năng');
await D.locator('[data-act="cancel"]').first().click();
await D.locator('.st-close').click();
await D.waitForTimeout(500);

console.log('\n▸ 8. Enter trong ô chat lúc đang chọn ô trên bàn cờ');
await D.evaluate(async () => {
  const { pickTilesOnBoard } = await import('/src/ui/tilePicker.js');
  window.__pick = 'chờ';
  pickTilesOnBoard(window.__monopoly.controller.scene, [1, 3], [1],
    { eyebrow: 'Thử', title: 'Chọn ô', sub: '' }).then((r) => { window.__pick = r; });
});
await D.locator('.tile-pick').waitFor({ timeout: 5000 });
await D.locator('#chat-btn').click();
await send(D, 'chọn ô nào giờ');
await D.waitForTimeout(400);
ok((await D.evaluate(() => window.__pick)) === 'chờ', 'Enter gửi tin không chốt phiên chọn ô');
ok((await msgs(D)).length === before + 2, 'tin vẫn gửi đi');
await D.locator('.chat-input').press('Escape');
ok((await D.evaluate(() => window.__pick)) === 'chờ', 'Esc trong ô chat không bỏ ngang phiên chọn');
await D.locator('.tile-pick .tp-cancel').click();
ok(await until(async () => (await D.evaluate(() => window.__pick)) === null, 3000), 'nút Huỷ vẫn bỏ ngang được');

await O.bringToFront();
ok(await until(async () => (await msgs(O)).some((m) => m.text === 'chọn ô nào giờ'), 5000),
  'máy kia nhận tin gửi giữa ván');

await browser.close();
if (errors.length) console.log('\nLỖI TRANG:\n' + errors.join('\n'));
if (fails.length || errors.length) {
  console.log(`\n✗ ${fails.length} hỏng, ${errors.length} lỗi trang`);
  process.exit(1);
}
console.log('\n✓ chat ổn');
