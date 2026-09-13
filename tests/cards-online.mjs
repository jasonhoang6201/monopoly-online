/**
 * Băng chuyền bóc thẻ Cơ Hội / Khí Vận chạy **giống nhau trên mọi máy**.
 *
 * Thẻ do máy cầm lái rút; gói `fatecard` chỉ mang chỉ số thẻ và một `seed`.
 * Dải năm sáu chục ô thì mỗi máy tự dựng lại từ seed ấy — bài kiểm này soi
 * đúng chỗ đó: hai máy phải ra cùng số ô, dừng cùng một ô, lật cùng một mặt
 * thẻ. Lệch một ô là dải đã dựng từ nguồn ngẫu nhiên khác, tức seed không tới
 * nơi hoặc bị bỏ qua.
 *
 * Cần một dev server riêng, không dùng chung với các bài khác:
 *   npx vite --port 5179 --strictPort &
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

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

/* ============================================================ 1 · phòng chờ */

console.log('\n▸ 1. Chủ phòng chọn nấc, cả phòng cùng thấy');
const A = watch(await ctx.newPage(), 'A');
await A.goto(BASE, { waitUntil: 'domcontentloaded' });
await bootToLobby(A);
const link = await A.locator('#lobby-link').inputValue();
await A.locator('.lobby-seat.is-me input.lobby-name').fill('Bảy Viễn');
await A.locator('.lobby-seat.is-me .lobby-ready').click();

const B = watch(await ctx.newPage(), 'B');
await B.goto(link, { waitUntil: 'domcontentloaded' });
await bootToLobby(B);
await B.locator('.lobby-seat.is-me input.lobby-name').fill('Cô Ba');
await B.locator('.lobby-seat.is-me .lobby-ready').click();

await B.bringToFront();
ok((await B.locator('.rule-btn:disabled').count()) === 4, 'khách không chỉnh được nấc luật');

await A.bringToFront();
await A.locator('.rule-btn[data-lv="hon-loan"]').click();
ok(await until(async () => (await A.locator('.rule-btn.on').innerText()) === 'Hỗn loạn'),
  'chủ phòng đổi nấc trên máy mình');
await B.bringToFront();
ok(await until(async () => (await B.locator('.rule-btn.on').innerText()) === 'Hỗn loạn'),
  'nấc mới hiện sang máy khách');

await A.bringToFront();
await until(async () => !(await A.locator('#lobby-start').isDisabled()));
await A.locator('#lobby-start').click();

for (const p of [A, B]) {
  await p.bringToFront();
  await until(async () => p.evaluate(() => !!window.__monopoly?.controller?.state), 60000);
}
await playRollOff([A, B]);
await A.bringToFront();
ok(await until(async () => A.evaluate(() => !!window.__monopoly.controller.state.order)),
  'ván hai máy đã lắc giành quyền xong');

const level = await B.evaluate(() => window.__monopoly.controller.state.settings.events);
ok(level === 'hon-loan', 'nấc luật đi vào ván ở cả hai máy', level);
ok(await B.evaluate(() => !document.getElementById('fate-meter').hidden),
  'thanh Thời Cuộc hiện trên máy ngồi xem');


/* ============================== băng chuyền bóc thẻ Cơ Hội chạy trên cả hai máy */

console.log('\n▸ 2. Bóc thẻ Cơ Hội — hai máy cùng một dải, cùng một ô');

async function driverOf() {
  for (const [p, tag] of [[A, 'A'], [B, 'B']]) {
    if (await p.evaluate(() => window.__monopoly.controller.isDriver())) return { page: p, tag };
  }
  return null;
}
const drv = await driverOf();
ok(!!drv, 'tìm được máy đang cầm lái', drv?.tag);
const other = drv.page === A ? B : A;

await drv.page.bringToFront();
await drv.page.evaluate(() => {
  const c = window.__monopoly.controller;
  c.guard(() => c.resolveCard(c.state.current, 'chance'));
});

/** Ô đang dừng dưới vạch, đọc ngay khi dải vừa đứng. */
const readStop = async (page) => {
  await page.locator('.co-cell.won').waitFor({ state: 'visible', timeout: 20000 });
  return page.evaluate(() => {
    const won = document.querySelector('.co-cell.won');
    const track = won.parentElement;
    return {
      i: won.dataset.i, target: track.dataset.target,
      nhan: won.querySelector('.co-cell-label').textContent.trim(),
      soO: track.children.length,
    };
  });
};

const [sa, sb] = await Promise.all([readStop(drv.page), readStop(other)]);
ok(!!sa && !!sb, 'băng chuyền chạy trên cả hai máy');
ok(sa.i === sa.target && sb.i === sb.target, 'mỗi máy đều dừng đúng ô đích');
ok(sa.i === sb.i && sa.soO === sb.soO, 'hai máy dựng cùng một dải và dừng cùng ô',
  `${drv.tag}: ô ${sa.i}/${sa.soO} · máy kia: ô ${sb.i}/${sb.soO}`);
ok(sa.nhan === sb.nhan, 'thẻ dừng dưới vạch giống nhau', sa.nhan);

const faceA = await drv.page.locator('.co-face .fate-card').waitFor({ state: 'visible', timeout: 15000 })
  .then(() => drv.page.textContent('.co-face .fate-card')).catch(() => null);
const faceB = await other.locator('.co-face .fate-card').waitFor({ state: 'visible', timeout: 15000 })
  .then(() => other.textContent('.co-face .fate-card')).catch(() => null);
ok(!!faceA && faceA.replace(/\s+/g, ' ') === faceB?.replace(/\s+/g, ' '),
  'mặt thẻ lật ra giống nhau trên hai máy');

/* Nút và phím Enter là của riêng người đang đi: máy ngồi xem chỉ xem, và hộp
   bên ấy tắt theo cú bấm bên kia chứ không theo hẹn giờ riêng. */
ok((await other.locator('.modal-foot button.btn').count()) === 0,
  'máy ngồi xem không có nút bấm');
ok(await until(async () => (await other.locator('.co-wait').count()) === 1, 3000),
  'máy ngồi xem hiện dòng chờ thay cho nút');

await other.bringToFront();
await other.keyboard.press('Enter');
await other.waitForTimeout(700);
ok((await other.locator('#modal-root .scrim.show').count()) > 0,
  'Enter ở máy ngồi xem không đóng hộp');

await drv.page.bringToFront();
await drv.page.locator('.modal-foot button.btn').first().click();
ok(await until(async () => (await other.locator('.co-face').count()) === 0, 8000),
  'người đang đi bấm xong thì hộp ở máy ngồi xem mới tắt');
await drv.page.waitForTimeout(1500);

console.log(errors.length ? `\nLỖI TRANG:\n${errors.join('\n')}` : '\nKhông có lỗi trang.');
await browser.close();
if (fails.length || errors.length) {
  console.log(`\nHỎNG: ${fails.join(', ')}`);
  process.exit(1);
}
console.log('\n✓ Tất cả kiểm tra đều đạt');
