/**
 * Quay video phần thả meme: bảng chọn ở chân cột, bong bóng trên đầu quân cờ,
 * bong bóng bám theo quân đang chạy, và hạn mức 5 lần một phút.
 *
 * Chạy:  node tests/meme-demo.mjs      (cần dev server ở cổng 5178)
 * Kết quả: test-result/meme/*.png + test-result/meme/tha-meme.webm
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';
import { mkdirSync, rmSync, readdirSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test-result', 'meme');
const URL = process.env.URL ?? 'http://localhost:5178/';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const errors = [];
const fails = [];
let step = 0;
const shot = async (page, name) => {
  const file = `${String(++step).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: join(OUT, file) });
  console.log('  📸', file);
};
const ok = (cond, label, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(label);
};

const browser = await launchChrome();
const ctx = await browser.newContext({
  viewport: { width: 1500, height: 940 },
  deviceScaleFactor: 2,
  recordVideo: { dir: OUT, size: { width: 1500, height: 940 } },
});
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

/* ------------------------------------------------------------- bày bàn */
// Mở màn là câu hỏi chơi kiểu gì — demo này chạy bản một máy
const one = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
await one.waitFor({ timeout: 30000 });
await one.click();
await page.waitForTimeout(700);

await page.locator('.count-btn[data-n="4"]').click();
for (const [i, n] of ['Bảy Viễn', 'Cô Ba Trà', 'Chú Hoả', 'Bà Từ'].entries()) {
  await page.locator('#name-list input').nth(i).fill(n);
}
await page.getByRole('button', { name: 'Khai cuộc' }).click();
await page.waitForTimeout(3000);
await playRollOff(page);
await page.waitForTimeout(600);

const bubbles = () => page.locator('#meme-layer .meme-bub').count();
const quota = () => page.locator('.meme-quota').textContent();

/* ------------------------------------------------- 1. bảng chọn ở chân cột */
console.log('\n1. Bảng chọn');
await page.locator('#meme-btn').click();
await page.waitForTimeout(500);
ok(await page.locator('#meme-pop:not([hidden])').count() === 1, 'bảng chọn mở ra');
ok(await page.locator('.meme-pick').count() === 4, 'đủ bốn meme');
ok((await quota()).includes('Còn 5/5'), 'hạn mức đầy lúc mở ván', await quota());
await shot(page, 'bang-chon');

/* --------------------------------------- 2. thả một cái, bong bóng nổi lên */
console.log('\n2. Thả meme');
await page.locator('.meme-pick[data-id="angry"]').click();
await page.waitForTimeout(700);
ok(await bubbles() === 1, 'bong bóng hiện trên bàn cờ');
await shot(page, 'bong-bong');

// Bong bóng neo đúng đầu quân cờ của người đang tới lượt
const near = await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const pt = c.scene.tokenScreenPos(c.state.turn);
  const r = document.querySelector('.meme-bub').getBoundingClientRect();
  return { dx: Math.abs((r.left + r.width / 2) - pt.x), gap: pt.top - r.bottom };
});
ok(near.dx < 3, 'bong bóng thẳng trục với quân cờ', `lệch ${near.dx.toFixed(1)}px`);
ok(near.gap > 0 && near.gap < 30, 'đuôi bong bóng chạm đầu quân', `cách ${near.gap.toFixed(1)}px`);

/* ------------------------------- 3. meme của các máy khác, nhiều bong bóng */
console.log('\n3. Meme của người khác (đường truyền online)');
await page.evaluate(() => {
  const m = window.__monopoly.controller.memes;
  m.receive(1, 'shock');
  setTimeout(() => m.receive(2, 'cry'), 350);
  setTimeout(() => m.receive(3, 'cute'), 700);
});
await page.waitForTimeout(1300);
ok(await bubbles() === 4, 'bốn quân cùng có bong bóng', `${await bubbles()} cái`);
ok(await page.locator('.meme-bub b').count() === 0, 'bong bóng không kèm chữ, chỉ có ảnh');
await shot(page, 'bon-nguoi');

/* ------------------------------------------ 4. tự tắt sau vài giây */
console.log('\n4. Tự tắt');
await page.waitForTimeout(3600);
ok(await bubbles() === 0, 'bong bóng tự dọn sạch');

/* -------------------------------- 5. bong bóng bám theo quân đang chạy */
console.log('\n5. Bám theo quân');
await page.locator('#meme-btn').click();
await page.locator('.meme-pick[data-id="cute"]').click();
await page.waitForTimeout(150);
const x0 = await page.evaluate(() => document.querySelector('.meme-bub').getBoundingClientRect().left);
await page.locator('#actions button', { hasText: 'Lắc xí ngầu' }).click();
await page.waitForTimeout(1500);
const x1 = await page.evaluate(() => document.querySelector('.meme-bub')?.getBoundingClientRect().left ?? null);
ok(x1 !== null && Math.abs(x1 - x0) > 8, 'bong bóng chạy theo quân', `${x0.toFixed(0)} → ${x1?.toFixed(0)}`);
await shot(page, 'bam-theo-quan');
await page.waitForTimeout(2600);

/* Đáp xuống ô xong thường có hộp thoại (mua đất, trả tiền thuê) — nền tối của
   nó phủ cả cột điều khiển, nên phải đóng lại rồi mới bấm tiếp được nút meme.
   Đây cũng đúng là điều người chơi thật gặp: đang giữa một quyết định của mình
   thì không thả meme. */
async function clearModal() {
  for (let i = 0; i < 4; i++) {
    const scrim = page.locator('.scrim.show');
    if (!(await scrim.count())) return;
    await scrim.locator('button.btn').last().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(600);
  }
}
await clearModal();

/* ------------------------------------------------------ 6. hạn mức 5 lần */
console.log('\n6. Hạn mức 5 lần');
// Đã dùng 2 lần ở trên, còn 3 — bấm nốt cho chạm trần
for (const id of ['angry', 'shock', 'cry']) {
  await page.locator('#meme-btn').click();
  await page.waitForTimeout(260);
  await page.locator(`.meme-pick[data-id="${id}"]`).click();
  await page.waitForTimeout(420);
}
await page.locator('#meme-btn').click();
await page.waitForTimeout(500);
const q = await quota();
ok(q.startsWith('Hết lượt'), 'bấm lần thứ sáu thì hết lượt', q);
ok(await page.locator('.meme-pick[disabled]').count() === 4, 'bốn nút meme khoá lại');
await shot(page, 'het-luot');

// Bấm bừa lúc hết lượt: không có bong bóng mới nào chui ra
const before = await bubbles();
await page.evaluate(() => document.querySelector('.meme-pick').click());
await page.waitForTimeout(400);
ok(await bubbles() <= before, 'bấm lúc hết lượt không thả thêm được');
await page.waitForTimeout(1500);

/* --------------------------------------------------------------- kết */
console.log(`\n${fails.length === 0 ? '✅ Tất cả đều đạt' : `❌ Hỏng: ${fails.join(', ')}`}`);
if (errors.length) console.log('Lỗi trang:\n  ' + errors.join('\n  '));

await ctx.close();
await browser.close();

const video = readdirSync(OUT).find((f) => f.endsWith('.webm'));
if (video) renameSync(join(OUT, video), join(OUT, 'tha-meme.webm'));
console.log(`\nVideo:  ${join(OUT, 'tha-meme.webm')}`);
process.exit(fails.length || errors.length ? 1 : 0);
