/**
 * Phím số thả meme: 1…9 rồi 0 ứng với mười meme đầu bảng.
 *
 * Kiểm ba điều tách rời: phím có gọi được lệnh gửi không, hạn mức có chặn cú
 * bấm thứ bảy không, và phím có bị nuốt khi đang gõ trong ô nhập không.
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const SHOT = process.env.SHOT_DIR || '/tmp';
const errors = [];
const log = (...a) => console.log(...a);

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
const soloBtn = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
await soloBtn.waitFor({ timeout: 30000 });
await soloBtn.click();
await page.waitForTimeout(2200);

await page.locator('.count-btn[data-n="2"]').click();
await page.waitForTimeout(200);
for (const [i, n] of ['Bảy Viễn', 'Cô Ba Trà'].entries()) {
  await page.locator('#name-list input').nth(i).fill(n);
}
await page.getByRole('button', { name: 'Khai cuộc' }).click();
await page.waitForTimeout(3200);
await playRollOff(page);

/* --------------------------------------------- 1. số trên ô trong bảng chọn */
await page.locator('#meme-btn').click();
await page.waitForTimeout(400);
const keys = await page.locator('.meme-pick .meme-key').allTextContents();
log('1. số dán trên ô:', keys.join(' '));
if (keys.join('') !== '1234567890') errors.push('mười ô đầu không mang đúng số 1…0');
await page.screenshot({ path: `${SHOT}/meme-pop.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

/* --------------------------------------------- 2. bấm phím là bong bóng hiện */
/** Tên tệp của các bong bóng đang nằm trên bàn. */
const bubFiles = () => page.evaluate(() =>
  [...document.querySelectorAll('#meme-layer .meme-bub img')].map((i) => i.src.split('/').pop()));

await page.keyboard.press('3');
await page.waitForTimeout(500);
const bubs = await bubFiles();
log('2. sau phím 3, bong bóng:', bubs);
if (bubs.length !== 1) errors.push('bấm phím 3 không dựng được bong bóng nào');
// Phím 3 = dòng thứ ba của CATALOG = pepe-cry; tên tệp có băm nên chỉ khớp phần đầu
if (!/^pepe-cry[.-]/.test(bubs[0] ?? '')) errors.push(`phím 3 ra nhầm ảnh: ${bubs[0]}`);
await page.screenshot({ path: `${SHOT}/meme-key3.png` });

/* --------------------------------------------- 3. hạn mức chặn cú thứ bảy */
for (const k of ['4', '5', '6', '7', '0']) {
  await page.keyboard.press(k);
  await page.waitForTimeout(200);
}
const left = await page.evaluate(() => window.__monopoly.controller.memes.left());
log('3. sau 6 lần thả, còn lại:', left);
if (left !== 0) errors.push(`hạn mức không cạn sau 6 lần: còn ${left}`);
await page.keyboard.press('1');
await page.waitForTimeout(300);
const denied = await page.locator('#meme-btn.deny').count();
log('   cú thứ bảy bị chặn, nút lắc:', denied === 1);
if (denied !== 1) errors.push('cú thứ bảy không bị hạn mức chặn');

/* --------------------------------------------- 4. đang gõ thì phím là chữ */
await page.evaluate(() => {
  const inp = document.createElement('input');
  inp.id = 'thu-go';
  document.body.appendChild(inp);
  inp.focus();
});
await page.keyboard.press('2');
await page.waitForTimeout(200);
const typed = await page.inputValue('#thu-go');
log('4. gõ vào ô nhập, nhận được:', JSON.stringify(typed));
if (typed !== '2') errors.push('phím số bị nuốt mất khi đang gõ trong ô nhập');
await page.evaluate(() => document.getElementById('thu-go').remove());

await browser.close();
if (errors.length) { console.error('\nLỖI:\n' + errors.join('\n')); process.exit(1); }
console.log('\n✓ phím tắt meme chạy đúng');
